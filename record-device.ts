import puppeteer from "puppeteer";
import { execSync, execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
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
function buildTimeline(dialogues: FlatDialogue[], pauseMs: number): DialogueTiming[] {
  const POST_AUDIO_GAP_MS = 400;
  const timings: DialogueTiming[] = [];
  let cursorMs = 0;

  for (const d of dialogues) {
    const local = toLocalPath(d.audioRaw || d.audio);
    let durationMs = 0;

    if (local && fs.existsSync(local)) {
      durationMs = Math.round(getAudioDurationSec(local) * 1000);
    }

    timings.push({
      showAtMs: cursorMs,
      audioDurationMs: durationMs,
      localAudioPath: (local && fs.existsSync(local)) ? local : null,
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
 * Build a single audio track from the timeline using ffmpeg concat.
 * Between clips we insert exact silence to preserve the correct gap.
 * This produces a single audio file in sync with the video.
 */
function buildAudioTrack(timings: DialogueTiming[], outputAudio: string, pauseMs: number): boolean {
  const POST_AUDIO_GAP_MS = 400;
  const clipsWithAudio = timings.filter((t) => t.localAudioPath !== null);
  if (clipsWithAudio.length === 0) return false;

  const tmpDir = path.resolve("_audio_tmp");
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir);

  const segments: string[] = [];
  let lastEndMs = 0;

  for (let i = 0; i < timings.length; i++) {
    const t = timings[i];

    // Gap before this clip (silence from end of previous to start of this)
    const gapMs = t.showAtMs - lastEndMs;
    if (gapMs > 0) {
      const silenceFile = path.join(tmpDir, `silence_${i}.wav`);
      execSync(
        `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${(gapMs / 1000).toFixed(3)} ` +
          `-c:a pcm_s16le "${silenceFile}"`,
        { stdio: "pipe" }
      );
      segments.push(silenceFile);
    }

    if (t.localAudioPath) {
      segments.push(t.localAudioPath);
      lastEndMs = t.showAtMs + t.audioDurationMs + POST_AUDIO_GAP_MS;
    } else {
      lastEndMs = t.showAtMs + pauseMs;
    }
  }

  if (segments.length === 0) {
    fs.rmSync(tmpDir, { recursive: true });
    return false;
  }

  // Write concat list file
  const concatList = path.join(tmpDir, "concat.txt");
  const listContent = segments
    .map((s) => `file '${s.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(concatList, listContent, "utf-8");

  // Concat all segments into one audio file
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatList}" ` +
      `-c:a aac -b:a 192k "${outputAudio}"`,
    { stdio: "pipe" }
  );

  fs.rmSync(tmpDir, { recursive: true });
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

  const timings = buildTimeline(dialogues, pauseMs);
  const totalSec = (timings[timings.length - 1].showAtMs + 2000) / 1000;
  console.log(`Timeline: ${timings.length} messages, ~${totalSec.toFixed(1)}s`);

  const silentMp4 = mp4Path.replace(/\.mp4$/i, "_silent.mp4");
  const audioTrack = mp4Path.replace(/\.mp4$/i, "_audio.aac");

  const { width, height } = theme.viewport;

  record(htmlPath, silentMp4, width, height, timings)
    .then((framesDir) => {
      process.stdout.write("Encoding video ...");
      encodeVideo(framesDir, silentMp4, width, height);
      fs.rmSync(framesDir, { recursive: true });
      process.stdout.write(" done\n");

      const hasAudio = buildAudioTrack(timings, audioTrack, pauseMs);

      if (hasAudio) {
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
    })
    .catch((e) => {
      console.error("Recording failed:", e);
      process.exit(1);
    });
}

main();
