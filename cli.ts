#!/usr/bin/env node
import puppeteer from "puppeteer";
import { execSync, execFileSync, execFile, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";
import * as os from "os";
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
    (client as typeof https).get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    }, (response) => {
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
  const tmp      = `${cached}.${process.pid}.${Date.now()}.tmp`;
  const lockFile = `${cached}.lock`;

  if (fs.existsSync(cached)) {
    const stat = fs.statSync(cached);
    if (stat.size > 0) return cached;
    try { fs.unlinkSync(cached); } catch { /* ignore */ }
  }

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
        break; // lock vanished, try to acquire
      }
    }
    if (fs.existsSync(cached)) return cached;
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
    } catch {
      // Another process grabbed the lock; wait for it to finish
      const retryDeadline = Date.now() + LOCK_TIMEOUT_MS;
      while (Date.now() < retryDeadline) {
        await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
        if (fs.existsSync(cached)) return cached;
      }
      throw new Error(`Timed out waiting for cached download of ${url}`);
    }
  }

  try {
    if (fs.existsSync(cached)) return cached;
    await downloadFileTo(url, tmp);
    fs.renameSync(tmp, cached);
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    try { fs.unlinkSync(tmp); }      catch { /* ignore */ }
  }

  return cached;
}

async function resolveRemoteImages(dialogues: FlatDialogue[]): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const uniqueUrls = [
    ...new Set(
      dialogues
        .map((d) => d.imageRaw)
        .filter((r) => /^https?:\/\//i.test(r))
    ),
  ];
  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const local = await cachedDownload(url);
        urlMap.set(url, local);
      } catch (e) {
        console.warn(`\nWarning: could not download image ${url}: ${(e as Error).message}`);
      }
    })
  );
  return urlMap;
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

function getAudioDurationSecAsync(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], (err, stdout) => {
      if (err) return resolve(0);
      const dur = parseFloat(stdout.trim());
      resolve(isNaN(dur) ? 0 : dur);
    });
  });
}

// ── Timeline ──────────────────────────────────────────────────────────────────

interface DialogueTiming {
  showAtMs: number;
  audioDurationMs: number;
  localAudioPath: string | null;
}

async function buildTimeline(
  dialogues: FlatDialogue[],
  pauseMs: number,
  remoteAudioMap: Map<string, string> = new Map()
): Promise<DialogueTiming[]> {
  const POST_AUDIO_GAP_MS = 400;

  // Resolve local paths for all dialogues
  const localPaths: (string | null)[] = dialogues.map((d) => {
    const raw = d.audioRaw || d.audio;
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return remoteAudioMap.get(raw) ?? null;
    const local = toLocalPath(raw);
    return local && fs.existsSync(local) ? local : null;
  });

  // Fetch all durations in parallel
  const durations = await Promise.all(
    localPaths.map((p) => (p ? getAudioDurationSecAsync(p) : Promise.resolve(0)))
  );

  // Build sequential cursor
  const timings: DialogueTiming[] = [];
  let cursorMs = 0;
  for (let i = 0; i < dialogues.length; i++) {
    const durationMs = Math.round(durations[i] * 1000);
    timings.push({ showAtMs: cursorMs, audioDurationMs: durationMs, localAudioPath: localPaths[i] });
    cursorMs += durationMs > 0 ? durationMs + POST_AUDIO_GAP_MS : pauseMs;
  }

  return timings;
}

// ── Static recorder (one screenshot per dialogue state) ───────────────────────

/**
 * Fast recording path: one Puppeteer screenshot per dialogue event, then
 * assembled into a video with ffmpeg's concat demuxer where each image is
 * held for exactly the duration of its audio clip (or pauseMs).
 */
async function recordStatic(
  htmlPath: string,
  width: number,
  height: number,
  timings: DialogueTiming[],
  pauseMs: number,
  silentMp4: string
): Promise<void> {
  const POST_AUDIO_GAP_MS = 400;
  const TAIL_MS = 2000;

  const outW = width * SCALE;
  const outH = height * SCALE;
  const timelineMs = timings.map((t) => t.showAtMs);

  process.stdout.write(`Recording static  ${width}x${height}  ${timings.length} frames ...`);

  const browser = await puppeteer.launch({
    headless: "new" as never,
    args: ["--no-sandbox", "--disable-web-security"],
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pvg_static_"));


  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: SCALE });
    await page.evaluateOnNewDocument(
      `(function(tl) { window.__TIMELINE__ = tl; })(${JSON.stringify(timelineMs)})`
    );

    const fileUrl = `file://${path.resolve(htmlPath).replace(/\\/g, "/")}?autoplay=1`;
    await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 300));

    const clip = { x: 0, y: 0, width, height };
    const framePaths: string[] = [];

    for (let i = 0; i < timings.length; i++) {
      await page.evaluate(`window.__SCRUB__ && window.__SCRUB__(${timings[i].showAtMs})`);
      const framePath = path.join(tmpDir, `frame_${String(i).padStart(4, "0")}.png`);
      await page.screenshot({ type: "png", clip, path: framePath });
      framePaths.push(framePath);
      process.stdout.write(`\rRecording static  ${width}x${height}  ${timings.length} frames ... ${i + 1}/${timings.length}`);
    }

    // Tail frame (last state held a bit longer)
    const tailPath = path.join(tmpDir, `frame_tail.png`);
    fs.copyFileSync(framePaths[framePaths.length - 1], tailPath);

    await page.close();

    // Build ffmpeg concat file with per-frame durations
    const concatLines: string[] = [];
    for (let i = 0; i < timings.length; i++) {
      const t = timings[i];
      const holdMs = t.audioDurationMs > 0 ? t.audioDurationMs + POST_AUDIO_GAP_MS : pauseMs;
      concatLines.push(`file '${framePaths[i].replace(/\\/g, "/")}'`);
      concatLines.push(`duration ${(holdMs / 1000).toFixed(3)}`);
    }
    concatLines.push(`file '${tailPath.replace(/\\/g, "/")}'`);
    concatLines.push(`duration ${(TAIL_MS / 1000).toFixed(3)}`);

    const concatFile = path.join(tmpDir, "concat.txt");
    fs.writeFileSync(concatFile, concatLines.join("\n"), "utf-8");

    execFileSync("ffmpeg", [
      "-y",
      "-f", "concat", "-safe", "0",
      "-i", concatFile,
      "-vf", `scale=${outW}:${outH}:flags=lanczos`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
      "-r", String(FPS), "-vsync", "cfr",
      silentMp4,
    ], { stdio: "pipe" });

    process.stdout.write(`\rRecording static  ${width}x${height}  ${timings.length} frames ... done\n`);
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true });
  }
}

// ── Puppeteer recorder + encoder (parallel workers) ───────────────────────────

const WORKER_COUNT = Math.min(Math.max(os.cpus().length, 2), 8);

/**
 * One worker: opens its own Puppeteer page, scrubs through a frame range, and
 * pipes JPEG frames directly into an ffmpeg subprocess that writes a segment mp4.
 * Returns the path of the produced segment.
 */
async function recordSegment(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  htmlPath: string,
  width: number,
  height: number,
  timelineMs: number[],
  startFrame: number,
  endFrame: number,  // exclusive
  segPath: string,
  onProgress: (framesCompleted: number) => void
): Promise<void> {
  const outW = width * SCALE;
  const outH = height * SCALE;

  const ffmpegProc = spawn("ffmpeg", [
    "-y",
    "-f", "mjpeg",
    "-framerate", String(FPS),
    "-i", "pipe:0",
    "-vf", `scale=${outW}:${outH}:flags=lanczos`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
    segPath,
  ], { stdio: ["pipe", "pipe", "pipe"] });

  const ffmpegDone = new Promise<void>((resolve, reject) => {
    ffmpegProc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg segment exited with code ${code} for ${segPath}`));
    });
    ffmpegProc.on("error", reject);
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: SCALE });
  await page.evaluateOnNewDocument(
    `(function(tl) { window.__TIMELINE__ = tl; })(${JSON.stringify(timelineMs)})`
  );

  const fileUrl = `file://${path.resolve(htmlPath).replace(/\\/g, "/")}?autoplay=1`;
  await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 300));

  // Fast-forward DOM state to the frame just before our range
  if (startFrame > 0) {
    const catchUpMs = Math.round(((startFrame - 1) / FPS) * 1000);
    await page.evaluate(`window.__SCRUB__ && window.__SCRUB__(${catchUpMs})`);
  }

  const clip = { x: 0, y: 0, width, height };

  for (let frame = startFrame; frame < endFrame; frame++) {
    const frameTimeMs = Math.round((frame / FPS) * 1000);
    await page.evaluate(`window.__SCRUB__ && window.__SCRUB__(${frameTimeMs})`);

    const buf = await page.screenshot({ type: "jpeg", quality: 92, clip, encoding: "binary" }) as Buffer;
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      ffmpegProc.stdin.once("error", onError);

      const done = () => {
        ffmpegProc.stdin.removeListener("error", onError);
        resolve();
      };

      if (!ffmpegProc.stdin.write(buf)) {
        ffmpegProc.stdin.once("drain", done);
      } else {
        done();
      }
    });

    onProgress(1);
  }

  await page.close();
  ffmpegProc.stdin.end();
  await ffmpegDone;
}

async function recordAndEncode(
  htmlPath: string,
  width: number,
  height: number,
  timings: DialogueTiming[],
  silentMp4: string
): Promise<void> {
  const lastTiming = timings[timings.length - 1];
  const totalMs = lastTiming.showAtMs +
    (lastTiming.audioDurationMs > 0 ? lastTiming.audioDurationMs : 3000) + 2000;
  const totalFrames = Math.min(Math.ceil((totalMs / 1000) * FPS), FPS * MAX_DURATION_SEC);
  const timelineMs = timings.map((t) => t.showAtMs);

  process.stdout.write(
    `Recording ${width}x${height} @${FPS}fps  ${totalFrames} frames (${(totalMs / 1000).toFixed(1)}s)  [${WORKER_COUNT} workers] ...`
  );

  const browser = await puppeteer.launch({
    headless: "new" as never,
    args: ["--no-sandbox", "--disable-web-security"],
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pvg_seg_"));


  // Divide frames evenly across workers
  const chunkSize = Math.ceil(totalFrames / WORKER_COUNT);
  const chunks = Array.from({ length: WORKER_COUNT }, (_, i) => ({
    start: i * chunkSize,
    end: Math.min((i + 1) * chunkSize, totalFrames),
    seg: path.join(tmpDir, `seg_${String(i).padStart(3, "0")}.mp4`),
  })).filter((c) => c.start < c.end);

  let completedFrames = 0;
  const updateProgress = (n: number) => {
    completedFrames += n;
    const pct = Math.round((completedFrames / totalFrames) * 100);
    process.stdout.write(
      `\rRecording ${width}x${height} @${FPS}fps  ${totalFrames} frames (${(totalMs / 1000).toFixed(1)}s)  [${WORKER_COUNT} workers] ... ${pct}%`
    );
  };

  try {
    await Promise.all(
      chunks.map((c) =>
        recordSegment(browser, htmlPath, width, height, timelineMs, c.start, c.end, c.seg, updateProgress)
      )
    );
  } finally {
    await browser.close();
  }

  process.stdout.write(
    `\rRecording ${width}x${height} @${FPS}fps  ${totalFrames} frames (${(totalMs / 1000).toFixed(1)}s)  [${WORKER_COUNT} workers] ... done\n`
  );

  // Concatenate segments into the final silent mp4
  if (chunks.length === 1) {
    fs.renameSync(chunks[0].seg, silentMp4);
  } else {
    const concatList = path.join(tmpDir, "concat.txt");
    fs.writeFileSync(concatList, chunks.map((c) => `file '${c.seg.replace(/\\/g, "/")}'`).join("\n"), "utf-8");
    execFileSync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", concatList,
      "-c", "copy",
      silentMp4,
    ], { stdio: "pipe" });
  }

  fs.rmSync(tmpDir, { recursive: true });
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
}

function writeManifest(outDir: string, data: Manifest) {
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), "utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(0).padStart(2, "0");
  return `${m}m ${s}s`;
}

async function main() {
  let precomputedRemoteAudioMap: Map<string, string> | undefined;
  const startTime = Date.now();
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Usage:
  npx playchat <input.json> [--output <dir>] [--record] [--record-full] [--segments] [--theme <id>] [--pause <ms>] [--no-avatar]

  If --output is omitted, files go to output/<date-time>-<name>/

Options:
  --output <dir>  Output folder path
  --record        Produce an MP4 using static images (fast; one screenshot per dialogue)
  --record-full   Produce an MP4 using full frame-by-frame recording (slow; requires more CPU)
  --segments      Also produce individual MP4 videos per section (requires --record or --record-full)
  --theme <id>    Theme to use (${listThemes().join(", ")}) [default: kakaotalk]
  --pause <ms>    No-audio pause between messages in ms [default: ${DEFAULT_ENGINE_OPTIONS.pauseMs}]
  --no-avatar     Hide avatar circles and sender names

Examples:
  npx playchat episode.json
  npx playchat episode.json --output ./my-output --theme imessage
  npx playchat episode.json --record --pause 5000
  npx playchat episode.json --record --segments
  npx playchat episode.json --record-full --output ./my-output --no-avatar
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const themeId = parseFlag(args, "--theme") || "kakaotalk";
  const pauseMs = parseInt(parseFlag(args, "--pause") || String(DEFAULT_ENGINE_OPTIONS.pauseMs), 10);
  const showAvatar = !args.includes("--no-avatar");
  const doRecord = args.includes("--record");
  const doRecordFull = args.includes("--record-full");
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

  // Pre-compute audio durations and stamp them on dialogues so themes can
  // display realistic timestamps (e.g. KakaoTalk's virtual clock).
  if (doRecord || doRecordFull) {
    const remoteAudioMap = await resolveRemoteAudio(dialogues);
    const localPaths: (string | null)[] = dialogues.map((d) => {
      const raw = d.audioRaw || d.audio;
      if (!raw) return null;
      if (/^https?:\/\//i.test(raw)) return remoteAudioMap.get(raw) ?? null;
      const local = toLocalPath(raw);
      return local && fs.existsSync(local) ? local : null;
    });
    const durations = await Promise.all(
      localPaths.map((p) => (p ? getAudioDurationSecAsync(p) : Promise.resolve(0)))
    );
    for (let i = 0; i < dialogues.length; i++) {
      dialogues[i].audioDurationSec = durations[i];
    }
    // Store the map so we don't re-download later
    precomputedRemoteAudioMap = remoteAudioMap;

    // Pre-download remote images and rewrite d.image to file:/// so Puppeteer
    // can load them instantly without waiting on network requests at screenshot time.
    const remoteImageMap = await resolveRemoteImages(dialogues);
    for (const d of dialogues) {
      if (!d.imageRaw) continue;
      if (/^https?:\/\//i.test(d.imageRaw)) {
        const local = remoteImageMap.get(d.imageRaw);
        if (local) {
          const normalized = local.replace(/\\/g, "/");
          d.image = `file:///${normalized.replace(/^\/+/, "")}`;
        }
      }
    }
  }

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
  console.log(`Generated: ${htmlPath}  [${theme.label}  ${theme.viewport.width}x${theme.viewport.height}  ${dialogues.length} dialogues]`);

  const manifestFiles: ManifestFiles = { html: "output.html" };

  if (!doRecord && !doRecordFull) {
    writeManifest(outDir, {
      input: path.resolve(inputPath),
      theme: themeId,
      pauseMs,
      showAvatar,
      createdAt: new Date().toISOString(),
      files: manifestFiles,
      dialogueCount: dialogues.length,
    });
    console.log(`Done  [Elapsed: ${formatElapsed(Date.now() - startTime)}]`);
    return;
  }

  // ── Recording pipeline ────────────────────────────────────────────────────

  const mp4Path = path.join(outDir, "output.mp4");
  const silentMp4 = path.join(outDir, "output_silent.mp4");
  const audioTrack = path.join(outDir, "output_audio.aac");

  try {
    const remoteAudioMap: Map<string, string> = precomputedRemoteAudioMap ?? new Map();
    const timings = await buildTimeline(dialogues, pauseMs, remoteAudioMap);
    const lastTiming = timings[timings.length - 1];
    const totalMs = lastTiming.showAtMs +
      (lastTiming.audioDurationMs > 0 ? lastTiming.audioDurationMs : 3000) + 2000;

    const { width, height } = theme.viewport;

    if (doRecordFull) {
      await recordAndEncode(htmlPath, width, height, timings, silentMp4);
    } else {
      await recordStatic(htmlPath, width, height, timings, pauseMs, silentMp4);
    }

    const videoDurSec = getAudioDurationSec(silentMp4);
    const hasAudio = buildAudioTrack(timings, audioTrack, totalMs);

    if (hasAudio) {
      muxVideoAudio(silentMp4, audioTrack, mp4Path);
      fs.unlinkSync(silentMp4);
      fs.unlinkSync(audioTrack);
    } else {
      fs.renameSync(silentMp4, mp4Path);
    }

    const outW = width * SCALE;
    const outH = height * SCALE;
    console.log(`\nDone: ${mp4Path} (${outW}x${outH}) [Elapsed: ${formatElapsed(Date.now() - startTime)}]`);

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

        cutSegment(mp4Path, startMs / 1000, durationMs / 1000, segPath);

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
      dialogueCount: dialogues.length
    });
  } catch (e) {
    console.error("Recording failed:", e);
    process.exit(1);
  }
}

main();
