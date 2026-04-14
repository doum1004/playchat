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

/**
 * Resolve an audio field (file:/// URI or raw local path) to an absolute
 * local path for ffprobe/ffmpeg. Returns null for http URLs or empty values.
 */
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

/**
 * Stable cache key for a URL: sha256(url), truncated to 16 hex chars.
 * Preserves the original file extension so ffprobe can detect the format.
 */
function cacheKeyFor(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
  const ext = path.extname(new URL(url).pathname) || ".mp3";
  return `${hash}${ext}`;
}

/**
 * Download url to destPath, following redirects (up to maxRedirects).
 * Writes directly to destPath; caller is responsible for atomic swap.
 */
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

/**
 * Resolve a remote URL to a local cached file path.
 *
 * Cache layout:  _audio_cache/<sha256-16>.<ext>
 * Atomicity:     download → <key>.tmp  then  rename → <key>
 *                fs.rename is atomic on the same filesystem, so concurrent
 *                processes may both download but the final file is always
 *                a complete write — no process ever reads a partial file.
 * Lock file:     <key>.lock  — created exclusively (wx) so only one process
 *                enters the download path per key; others wait-poll and reuse
 *                the result.  Stale locks (process crashed) are removed after
 *                LOCK_TIMEOUT_MS.
 */
const LOCK_TIMEOUT_MS = 60_000;
const LOCK_POLL_MS    = 200;

async function cachedDownload(url: string): Promise<string> {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });

  const key      = cacheKeyFor(url);
  const cached   = path.join(AUDIO_CACHE_DIR, key);
  const tmp      = `${cached}.tmp`;
  const lockFile = `${cached}.lock`;

  // Fast path: cache hit
  if (fs.existsSync(cached)) return cached;

  // Try to acquire the lock (O_EXCL — atomic on all major OSes & filesystems)
  let lockAcquired = false;
  try {
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
    lockAcquired = true;
  } catch {
    // Another process holds the lock — wait for it to finish
  }

  if (!lockAcquired) {
    // Poll until the cached file appears or the lock becomes stale
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
      if (fs.existsSync(cached)) return cached;

      // Check if the lock is stale (owner crashed)
      try {
        const stat = fs.statSync(lockFile);
        if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) break; // take over below
      } catch {
        // lock vanished — loop will pick up cached file or exit
      }
    }
    // One last check before attempting a take-over download
    if (fs.existsSync(cached)) return cached;
    // Stale lock: remove it and fall through to download ourselves
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    fs.writeFileSync(lockFile, String(process.pid), { flag: "wx" }); // may throw if race; caller retries via outer catch
  }

  try {
    await downloadFileTo(url, tmp);
    fs.renameSync(tmp, cached); // atomic on same filesystem
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    try { fs.unlinkSync(tmp); }      catch { /* ignore */ }
  }

  return cached;
}

/**
 * Resolve all remote audio URLs in the dialogues to local cached paths.
 * Returns a map from original URL -> local file path.
 * Deduplicates URLs so each is downloaded at most once per run.
 */
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

/**
 * Use ffprobe to get the exact duration of a local audio file in seconds.
 * Returns 0 on any error.
 */
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
  showAtMs: number;       // when the chat bubble appears
  audioDurationMs: number; // 0 if no audio
  localAudioPath: string | null;
}

/**
 * Build an offline timeline for all dialogues.
 * Each dialogue appears at the moment its audio starts (or after the previous
 * message's audio + post-audio gap). No-audio messages use pauseMs.
 *
 * Timeline:
 *   t=0          message 0 appears + audio 0 starts
 *   t=dur0+400   message 1 appears + audio 1 starts   (400ms post-audio gap)
 *   t=...        etc.
 *   no-audio:    message appears, then waits pauseMs before next
 */
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

    timings.push({
      showAtMs: cursorMs,
      audioDurationMs: durationMs,
      localAudioPath: localPath,
    });

    if (durationMs > 0) {
      cursorMs += durationMs + POST_AUDIO_GAP_MS;
    } else {
      cursorMs += pauseMs;
    }
  }

  return timings;
}

// ── Puppeteer recorder ────────────────────────────────────────────────────────

async function record(
  htmlPath: string,
  outputMp4: string,
  width: number,
  height: number,
  timings: DialogueTiming[]
) {
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

  // Inject the timeline before the page's scripts run
  const timelineMs = timings.map((t) => t.showAtMs);
  await page.evaluateOnNewDocument(
    `(function(tl) { window.__TIMELINE__ = tl; })(${JSON.stringify(timelineMs)})`
  );

  const fileUrl = `file://${path.resolve(htmlPath)}?autoplay=1`;
  await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30_000 });

  // Let the page settle (DOMContentLoaded, load event, initScrubberMode)
  await new Promise((r) => setTimeout(r, 500));

  process.stdout.write(`Recording ${width}x${height} @${FPS}fps  ${totalFrames} frames (${(totalMs / 1000).toFixed(1)}s) ...`);

  for (let frame = 0; frame < totalFrames; frame++) {
    // Tell the browser exactly what time this frame represents
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

/**
 * Build a single audio track using an ffmpeg adelay+amix filter graph.
 *
 * Each clip is placed at its exact millisecond offset via adelay — no
 * intermediate silence files and no concat boundaries, so there is zero
 * cumulative drift between the audio and the frame-accurate video timeline.
 *
 * Input 0 is a silent base track that defines the total duration.
 * Inputs 1..N are the audio clips, each resampled to 44100 Hz stereo fltp
 * and delayed to their timeline offset.
 *
 * For large dialogue counts the filter graph is written to a temp file and
 * loaded via -filter_complex_script to avoid OS command-line length limits.
 */
function buildAudioTrack(timings: DialogueTiming[], outputAudio: string, totalDurationMs: number): boolean {
  const clips = timings.filter((t) => t.localAudioPath !== null);
  if (clips.length === 0) return false;

  const totalSec = (totalDurationMs / 1000).toFixed(3);

  // Build ffmpeg input args: [0] = silent base, [1..N] = audio clips
  const inputArgs: string[] = [
    "-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`,
  ];
  for (const c of clips) {
    inputArgs.push("-i", c.localAudioPath!);
  }

  // Build filter graph: resample + delay each clip, then amix all together
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

  // Use -filter_complex_script for large graphs to avoid command-line length limits
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

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Usage:
  npx ts-node record-device.ts <input.json> [output.mp4] [--theme <id>] [--pause <ms>]

  If output.mp4 is omitted, files go to output/<date-time>-<name>/

Options:
  --theme <id>   Theme to use (${listThemes().join(", ")}) [default: kakaotalk]
  --pause <ms>   No-audio pause between messages in ms [default: ${DEFAULT_ENGINE_OPTIONS.pauseMs}]

Examples:
  npx ts-node record-device.ts episode.json
  npx ts-node record-device.ts episode.json output.mp4 --theme kakaotalk
  npx ts-node record-device.ts episode.json --theme imessage --pause 5000
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const themeId = parseFlag(args, "--theme") || "kakaotalk";
  const pauseMs = parseInt(parseFlag(args, "--pause") || String(DEFAULT_ENGINE_OPTIONS.pauseMs), 10);
  const positionalArgs = stripFlags(args, "--theme", "--pause");
  const explicitOutput = positionalArgs[1];

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
    theme = getTheme(themeId, episode, dialogues, { pauseMs });
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  }

  let mp4Path: string;
  let htmlPath: string;

  if (explicitOutput) {
    mp4Path = explicitOutput;
    htmlPath = mp4Path.replace(/\.mp4$/i, ".html");
    const dir = path.dirname(mp4Path);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
  } else {
    const outDir = resolveOutputDir(inputPath);
    mp4Path = path.join(outDir, "output.mp4");
    htmlPath = path.join(outDir, "output.html");
  }

  fs.writeFileSync(htmlPath, theme.render(), "utf-8");

  const silentMp4 = mp4Path.replace(/\.mp4$/i, "_silent.mp4");
  const audioTrack = mp4Path.replace(/\.mp4$/i, "_audio.aac");

  const remoteUrls = dialogues.filter((d) => /^https?:\/\//i.test(d.audioRaw || d.audio));
  const cachedCount = remoteUrls.filter((d) => {
    try { return fs.existsSync(path.join(AUDIO_CACHE_DIR, cacheKeyFor(d.audioRaw || d.audio))); } catch { return false; }
  }).length;
  const downloadCount = remoteUrls.length - cachedCount;

  if (remoteUrls.length > 0) {
    const cacheNote = cachedCount > 0 ? ` (${cachedCount} cached)` : "";
    process.stdout.write(`Downloading remote audio${cacheNote} ...`);
  }

  resolveRemoteAudio(dialogues)
    .then((remoteAudioMap) => {
      if (remoteUrls.length > 0) process.stdout.write(` done (${downloadCount} fetched, ${cachedCount} from cache)\n`);

      const timings = buildTimeline(dialogues, pauseMs, remoteAudioMap);
      const lastTiming = timings[timings.length - 1];
      const totalMs = lastTiming.showAtMs +
        (lastTiming.audioDurationMs > 0 ? lastTiming.audioDurationMs : 3000) + 2000;
      console.log(`Timeline: ${timings.length} messages, ~${(totalMs / 1000).toFixed(1)}s`);

      const { width, height } = theme.viewport;

      return record(htmlPath, silentMp4, width, height, timings).then((framesDir) => {
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
      });
    })
    .catch((e) => {
      console.error("Recording failed:", e);
      process.exit(1);
    });
}

main();
