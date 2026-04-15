import puppeteer from "puppeteer";
import { execSync, execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";
import { PodcastEpisode, FlatDialogue, flattenDialogues, DEFAULT_ENGINE_OPTIONS } from "./core/types";
import { resolveOutputDir } from "./core/output";
import { getTheme, listThemes } from "./themes";

const FPS = 15;
const SCALE = 2;
const MAX_DURATION_SEC = 10 * 60;

// ── CLI helpers ───────────────────────────────────────────────────────────────

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

function stripFlags(args: string[], ...flags: string[]): string[] {
  const skip = new Set<number>();
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx !== -1) { skip.add(idx); skip.add(idx + 1); }
  }
  return args.filter((_, i) => !skip.has(i));
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

function toLocalPath(audio: string): string | null {
  if (!audio) return null;
  if (/^https?:\/\//i.test(audio)) return null;
  if (audio.startsWith("file:///")) {
    return path.resolve(audio.slice("file:///".length));
  }
  return path.resolve(audio);
}

// ── Audio download cache ──────────────────────────────────────────────────────

const AUDIO_CACHE_DIR = path.resolve("_audio_cache");

function cacheKeyFor(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
  const ext = path.extname(new URL(url).pathname) || ".mp3";
  return `${hash}${ext}`;
}

function downloadFileTo(url: string, destPath: string, maxRedirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }
    const file = fs.createWriteStream(destPath);
    const client = /^https:/i.test(url) ? https : http;
    (client as typeof https).get(url, (response) => {
      const { statusCode, headers } = response;
      if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        file.close(() => downloadFileTo(headers.location!, destPath, maxRedirects - 1).then(resolve).catch(reject));
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        file.close(() => reject(new Error(`HTTP ${statusCode} for ${url}`)));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    }).on("error", (err) => { file.close(); reject(err); });
  });
}

const LOCK_TIMEOUT_MS = 60_000;
const LOCK_POLL_MS    = 200;

async function cachedDownload(url: string): Promise<string> {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });

  const key      = cacheKeyFor(url);
  const cached   = path.join(AUDIO_CACHE_DIR, key);
  const tmp      = `${cached}.tmp`;
  const lockFile = `${cached}.lock`;

  if (fs.existsSync(cached)) return cached;

  let lockAcquired = false;
  try {
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
    lockAcquired = true;
  } catch {
    // another process holds the lock
  }

  if (!lockAcquired) {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
      if (fs.existsSync(cached)) return cached;
      try {
        const stat = fs.statSync(lockFile);
        if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) break;
      } catch {
        // lock vanished
      }
    }
    if (fs.existsSync(cached)) return cached;
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
  }

  try {
    await downloadFileTo(url, tmp);
    fs.renameSync(tmp, cached);
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    try { fs.unlinkSync(tmp); }      catch { /* ignore */ }
  }

  return cached;
}

async function resolveRemoteAudio(dialogues: FlatDialogue[]): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const uniqueUrls = [
    ...new Set(
      dialogues
        .map((d) => d.audioRaw || d.audio)
        .filter((r) => /^https?:\/\//i.test(r))
    ),
  ];

  await Promise.all(
    uniqueUrls.map(async (url) => {
      const local = await cachedDownload(url);
      urlMap.set(url, local);
    })
  );

  return urlMap;
}

function getAudioDurationSec(filePath: string): number {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { encoding: "utf-8" });
    const dur = parseFloat(out.trim());
    return isNaN(dur) ? 0 : dur;
  } catch {
    return 0;
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────────

interface DialogueTiming {
  showAtMs: number;
  audioDurationMs: number;
  localAudioPath: string | null;
}

function buildTimeline(
  dialogues: FlatDialogue[],
  pauseMs: number,
  remoteAudioMap: Map<string, string> = new Map()
): DialogueTiming[] {
  const POST_AUDIO_GAP_MS = 400;
  const timings: DialogueTiming[] = [];
  let cursorMs = 0;

  for (const d of dialogues) {
    const raw = d.audioRaw || d.audio;
    let localPath: string | null = null;

    if (raw && /^https?:\/\//i.test(raw)) {
      localPath = remoteAudioMap.get(raw) ?? null;
    } else {
      localPath = toLocalPath(raw);
      if (localPath && !fs.existsSync(localPath)) localPath = null;
    }

    let durationMs = 0;
    if (localPath) {
      durationMs = Math.round(getAudioDurationSec(localPath) * 1000);
    }

    timings.push({ showAtMs: cursorMs, audioDurationMs: durationMs, localAudioPath: localPath });

    if (durationMs > 0) {
      cursorMs += durationMs + POST_AUDIO_GAP_MS;
    } else {
      cursorMs += pauseMs;
    }
  }

  return timings;
}

// ── Puppeteer recorder ────────────────────────────────────────────────────────

async function recordFrames(
  htmlPath: string,
  width: number,
  height: number,
  timings: DialogueTiming[]
): Promise<string> {
  const framesDir = path.resolve("_frames");
  if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true });
  fs.mkdirSync(framesDir);

  const lastTiming = timings[timings.length - 1];
  const totalMs = lastTiming.showAtMs +
    (lastTiming.audioDurationMs > 0 ? lastTiming.audioDurationMs : 3000) + 2000;
  const totalFrames = Math.min(Math.ceil((totalMs / 1000) * FPS), FPS * MAX_DURATION_SEC);

  const browser = await puppeteer.launch({
    headless: "new" as never,
    args: ["--no-sandbox", "--disable-web-security"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: SCALE });

  const timelineMs = timings.map((t) => t.showAtMs);
  await page.evaluateOnNewDocument(
    `(function(tl) { window.__TIMELINE__ = tl; })(${JSON.stringify(timelineMs)})`
  );

  const fileUrl = `file://${path.resolve(htmlPath)}?autoplay=1`;
  await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 500));

  process.stdout.write(`Recording ${width}x${height} @${FPS}fps  ${totalFrames} frames (${(totalMs / 1000).toFixed(1)}s) ...`);

  for (let frame = 0; frame < totalFrames; frame++) {
    const frameTimeMs = Math.round((frame / FPS) * 1000);
    await page.evaluate(`window.__SCRUB__ && window.__SCRUB__(${frameTimeMs})`);

    const padded = String(frame).padStart(6, "0");
    await page.screenshot({
      path: path.join(framesDir, `f_${padded}.png`),
      clip: { x: 0, y: 0, width, height },
    });

    if (frame % (FPS * 5) === 0) {
      const pct = Math.round((frame / totalFrames) * 100);
      process.stdout.write(`\rRecording ${width}x${height} @${FPS}fps  ${totalFrames} frames (${(totalMs / 1000).toFixed(1)}s) ... ${pct}%`);
    }
  }

  process.stdout.write(`\rRecording ${width}x${height} @${FPS}fps  ${totalFrames} frames (${(totalMs / 1000).toFixed(1)}s) ... done\n`);
  await browser.close();

  return framesDir;
}

// ── Video encoding ────────────────────────────────────────────────────────────

function encodeVideo(framesDir: string, silentMp4: string, width: number, height: number) {
  const outW = width * SCALE;
  const outH = height * SCALE;

  execSync(
    `ffmpeg -y -framerate ${FPS} ` +
      `-i "${path.join(framesDir, "f_%06d.png")}" ` +
      `-vf "scale=${outW}:${outH}:flags=lanczos" ` +
      `-c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 ` +
      `"${silentMp4}"`,
    { stdio: "pipe" }
  );
}

// ── Audio track building ──────────────────────────────────────────────────────

function buildAudioTrack(timings: DialogueTiming[], outputAudio: string, totalDurationMs: number): boolean {
  const clips = timings.filter((t) => t.localAudioPath !== null);
  if (clips.length === 0) return false;

  const totalSec = (totalDurationMs / 1000).toFixed(3);

  const inputArgs: string[] = ["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`];
  for (const c of clips) {
    inputArgs.push("-i", c.localAudioPath!);
  }

  const filterLines: string[] = [];
  const mixLabels: string[] = ["[0:a]"];

  for (let i = 0; i < clips.length; i++) {
    const inputIdx = i + 1;
    const delayMs = clips[i].showAtMs;
    const label = `[a${inputIdx}]`;
    filterLines.push(
      `[${inputIdx}]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${delayMs}|${delayMs}${label}`
    );
    mixLabels.push(label);
  }

  const mixInputCount = mixLabels.length;
  filterLines.push(
    `${mixLabels.join("")}amix=inputs=${mixInputCount}:duration=first:normalize=0`
  );
  const filterGraph = filterLines.join(";\n");

  let filterScriptPath: string | null = null;
  const ffmpegArgs = ["-y", ...inputArgs];

  if (filterGraph.length > 4000) {
    filterScriptPath = outputAudio.replace(/\.[^.]+$/, "_filter.txt");
    fs.writeFileSync(filterScriptPath, filterGraph, "utf-8");
    ffmpegArgs.push("-filter_complex_script", filterScriptPath);
  } else {
    ffmpegArgs.push("-filter_complex", filterGraph);
  }

  ffmpegArgs.push("-t", totalSec, "-c:a", "aac", "-b:a", "192k", outputAudio);

  execFileSync("ffmpeg", ffmpegArgs, { stdio: "pipe" });

  if (filterScriptPath) {
    try { fs.unlinkSync(filterScriptPath); } catch { /* ignore */ }
  }

  return true;
}

// ── Mux video + audio ─────────────────────────────────────────────────────────

function muxVideoAudio(silentMp4: string, audioTrack: string, outputMp4: string) {
  execSync(
    `ffmpeg -y -i "${silentMp4}" -i "${audioTrack}" ` +
      `-c:v copy -c:a copy -shortest "${outputMp4}"`,
    { stdio: "pipe" }
  );
}

// ── Segment cutting ───────────────────────────────────────────────────────────

function cutSegment(sourceMp4: string, startSec: number, durationSec: number, outMp4: string) {
  execFileSync("ffmpeg", [
    "-y",
    "-ss", startSec.toFixed(3),
    "-i", sourceMp4,
    "-t", durationSec.toFixed(3),
    "-c", "copy",
    outMp4,
  ], { stdio: "pipe" });
}

// ── Manifest ──────────────────────────────────────────────────────────────────

interface ManifestFiles {
  html: string;
  mp4?: string;
  segments?: { sectionId: number; sectionTitle: string; mp4: string }[];
}

interface Manifest {
  input: string;
  theme: string;
  pauseMs: number;
  showAvatar: boolean;
  createdAt: string;
  files: ManifestFiles;
  dialogueCount: number;
  durationEstimate: string;
}

function writeManifest(outDir: string, data: Manifest) {
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`   Manifest:  ${manifestPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Usage:
  npx ts-node cli.ts <input.json> [--output <dir>] [--record] [--segments] [--theme <id>] [--pause <ms>] [--no-avatar]

  If --output is omitted, files go to output/<date-time>-<name>/

Options:
  --output <dir>  Output folder path
  --record        Also produce an MP4 video (requires ffmpeg + ffprobe)
  --segments      Also produce individual MP4 videos per section (requires --record)
  --theme <id>    Theme to use (${listThemes().join(", ")}) [default: kakaotalk]
  --pause <ms>    No-audio pause between messages in ms [default: ${DEFAULT_ENGINE_OPTIONS.pauseMs}]
  --no-avatar     Hide avatar circles and sender names

Examples:
  npx ts-node cli.ts episode.json
  npx ts-node cli.ts episode.json --output ./my-output --theme imessage
  npx ts-node cli.ts episode.json --record --pause 5000
  npx ts-node cli.ts episode.json --record --segments
  npx ts-node cli.ts episode.json --output ./my-output --record --no-avatar
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const themeId = parseFlag(args, "--theme") || "kakaotalk";
  const pauseMs = parseInt(parseFlag(args, "--pause") || String(DEFAULT_ENGINE_OPTIONS.pauseMs), 10);
  const showAvatar = !args.includes("--no-avatar");
  const doRecord = args.includes("--record");
  const doSegments = args.includes("--segments");
  const explicitOutput = parseFlag(args, "--output");

  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  let episode: PodcastEpisode;
  try {
    episode = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  } catch {
    console.error(`Invalid JSON: ${inputPath}`);
    process.exit(1);
  }

  const dialogues = flattenDialogues(episode);

  let theme;
  try {
    theme = getTheme(themeId, episode, dialogues, { pauseMs, showAvatar });
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const outDir = resolveOutputDir(inputPath, explicitOutput);
  const htmlPath = path.join(outDir, "output.html");

  fs.writeFileSync(htmlPath, theme.render(), "utf-8");
  console.log(`Generated: ${htmlPath}`);
  console.log(`   Theme:     ${theme.label} (${theme.id})`);
  console.log(`   Viewport:  ${theme.viewport.width}x${theme.viewport.height}`);
  console.log(`   Dialogues: ${dialogues.length}`);
  console.log(`   Pause:     ${pauseMs}ms`);

  const manifestFiles: ManifestFiles = { html: "output.html" };

  if (!doRecord) {
    writeManifest(outDir, {
      input: path.resolve(inputPath),
      theme: themeId,
      pauseMs,
      showAvatar,
      createdAt: new Date().toISOString(),
      files: manifestFiles,
      dialogueCount: dialogues.length,
      durationEstimate: episode.duration_estimate ?? "",
    });
    return;
  }

  // ── Recording pipeline ────────────────────────────────────────────────────

  const mp4Path = path.join(outDir, "output.mp4");
  const silentMp4 = path.join(outDir, "output_silent.mp4");
  const audioTrack = path.join(outDir, "output_audio.aac");

  const remoteUrls = dialogues.filter((d) => /^https?:\/\//i.test(d.audioRaw || d.audio));
  const cachedCount = remoteUrls.filter((d) => {
    try { return fs.existsSync(path.join(AUDIO_CACHE_DIR, cacheKeyFor(d.audioRaw || d.audio))); } catch { return false; }
  }).length;
  const downloadCount = remoteUrls.length - cachedCount;

  if (remoteUrls.length > 0) {
    const cacheNote = cachedCount > 0 ? ` (${cachedCount} cached)` : "";
    process.stdout.write(`Downloading remote audio${cacheNote} ...`);
  }

  try {
    const remoteAudioMap = await resolveRemoteAudio(dialogues);
    if (remoteUrls.length > 0) process.stdout.write(` done (${downloadCount} fetched, ${cachedCount} from cache)\n`);

    const timings = buildTimeline(dialogues, pauseMs, remoteAudioMap);
    const lastTiming = timings[timings.length - 1];
    const totalMs = lastTiming.showAtMs +
      (lastTiming.audioDurationMs > 0 ? lastTiming.audioDurationMs : 3000) + 2000;
    console.log(`Timeline: ${timings.length} messages, ~${(totalMs / 1000).toFixed(1)}s`);

    const { width, height } = theme.viewport;

    const framesDir = await recordFrames(htmlPath, width, height, timings);

    process.stdout.write("Encoding video ...");
    encodeVideo(framesDir, silentMp4, width, height);
    fs.rmSync(framesDir, { recursive: true });
    process.stdout.write(" done\n");

    const videoDurSec = getAudioDurationSec(silentMp4);
    const hasAudio = buildAudioTrack(timings, audioTrack, totalMs);

    if (hasAudio) {
      const audioDurSec = getAudioDurationSec(audioTrack);
      console.log(`Sync check: video=${videoDurSec.toFixed(2)}s  audio=${audioDurSec.toFixed(2)}s  drift=${Math.abs(videoDurSec - audioDurSec).toFixed(2)}s`);

      process.stdout.write("Muxing audio + video ...");
      muxVideoAudio(silentMp4, audioTrack, mp4Path);
      fs.unlinkSync(silentMp4);
      fs.unlinkSync(audioTrack);
      process.stdout.write(" done\n");
    } else {
      fs.renameSync(silentMp4, mp4Path);
    }

    const outW = width * SCALE;
    const outH = height * SCALE;
    console.log(`\nDone: ${mp4Path} (${outW}x${outH})`);

    manifestFiles.mp4 = "output.mp4";

    if (doSegments) {
      const segmentsDir = path.join(outDir, "segments");
      fs.mkdirSync(segmentsDir, { recursive: true });

      const sectionMeta: { sectionId: number; sectionTitle: string; mp4: string }[] = [];
      let globalIdx = 0;

      for (const section of episode.sections) {
        const count = section.dialogues.length;
        if (count === 0) { globalIdx += count; continue; }

        const firstTiming = timings[globalIdx];
        const lastTiming  = timings[globalIdx + count - 1];
        const startMs     = firstTiming.showAtMs;
        const endMs       = lastTiming.showAtMs +
          (lastTiming.audioDurationMs > 0 ? lastTiming.audioDurationMs : 3000) + 500;
        const durationMs  = endMs - startMs;

        const safeName = section.corner_name
          .replace(/[^a-z0-9]+/gi, "_")
          .replace(/^_|_$/g, "")
          .toLowerCase();
        const segFile = `section_${section.section_id}_${safeName}.mp4`;
        const segPath = path.join(segmentsDir, segFile);

        process.stdout.write(`  Cutting segment: ${section.corner_name} (${(durationMs / 1000).toFixed(1)}s) ...`);
        cutSegment(mp4Path, startMs / 1000, durationMs / 1000, segPath);
        process.stdout.write(" done\n");

        sectionMeta.push({
          sectionId: section.section_id,
          sectionTitle: section.section_title,
          mp4: path.join("segments", segFile),
        });

        globalIdx += count;
      }

      manifestFiles.segments = sectionMeta;
      console.log(`Segments: ${sectionMeta.length} written to ${segmentsDir}`);
    }

    writeManifest(outDir, {
      input: path.resolve(inputPath),
      theme: themeId,
      pauseMs,
      showAvatar,
      createdAt: new Date().toISOString(),
      files: manifestFiles,
      dialogueCount: dialogues.length,
      durationEstimate: episode.duration_estimate ?? "",
    });
  } catch (e) {
    console.error("Recording failed:", e);
    process.exit(1);
  }
}

main();
