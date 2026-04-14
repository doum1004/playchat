import puppeteer from "puppeteer";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { PodcastEpisode, FlatDialogue, flattenDialogues } from "./core/types";
import { resolveOutputDir } from "./core/output";
import { getTheme, listThemes } from "./themes";

const FPS = 30;
const SCALE = 2;
const MAX_DURATION_SEC = 5 * 60;

interface AudioEvent {
  /** Absolute local path to the audio file */
  filePath: string;
  /** Frame number when this audio started playing */
  startFrame: number;
}

/**
 * Resolve an audio field (file:/// URI, http URL, or raw path) back to a
 * local absolute path suitable for ffmpeg input. Returns null for URLs
 * or empty values (we only mux local files).
 */
function toLocalPath(audio: string): string | null {
  if (!audio) return null;
  if (/^https?:\/\//i.test(audio)) return null;

  if (audio.startsWith("file:///")) {
    const stripped = audio.slice("file:///".length);
    return path.resolve(stripped);
  }
  return path.resolve(audio);
}

async function record(
  htmlPath: string,
  outputMp4: string,
  width: number,
  height: number,
  dialogues: FlatDialogue[]
) {
  const framesDir = path.resolve("_frames");

  if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true });
  fs.mkdirSync(framesDir);

  const browser = await puppeteer.launch({
    headless: "new" as never,
    args: [
      "--no-sandbox",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-web-security",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: SCALE });

  const fileUrl = `file://${path.resolve(htmlPath)}?autoplay=1`;
  await page.goto(fileUrl, { waitUntil: "networkidle2", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 800));

  let frame = 0;
  const maxFrames = FPS * MAX_DURATION_SEC;
  const audioEvents: AudioEvent[] = [];
  let lastMsgIdx = 0;

  console.log(`Recording ${width}x${height} @${FPS}fps ...`);

  while (frame < maxFrames) {
    const padded = String(frame).padStart(6, "0");
    await page.screenshot({
      path: path.join(framesDir, `f_${padded}.png`),
      clip: { x: 0, y: 0, width, height },
    });

    const currentIdx = (await page.evaluate(`idx`)) as number;
    while (lastMsgIdx < currentIdx) {
      const d = dialogues[lastMsgIdx];
      const local = toLocalPath(d.audioRaw || d.audio);
      if (local && fs.existsSync(local)) {
        audioEvents.push({ filePath: local, startFrame: frame });
      }
      lastMsgIdx++;
    }

    frame++;

    const done = await page.evaluate(
      `document.body.dataset.done === '1'`
    );
    if (done) {
      const lastPad = String(frame - 1).padStart(6, "0");
      const lastFrame = path.join(framesDir, `f_${lastPad}.png`);
      for (let i = 0; i < FPS * 2; i++) {
        const holdPad = String(frame).padStart(6, "0");
        fs.copyFileSync(lastFrame, path.join(framesDir, `f_${holdPad}.png`));
        frame++;
      }
      break;
    }

    await new Promise((r) => setTimeout(r, 1000 / FPS));
  }

  console.log(`Captured ${frame} frames`);
  await browser.close();

  const outW = width * SCALE;
  const outH = height * SCALE;

  const silentMp4 = outputMp4.replace(/\.mp4$/i, "_silent.mp4");

  execSync(
    `ffmpeg -y -framerate ${FPS} ` +
      `-i "${path.join(framesDir, "f_%06d.png")}" ` +
      `-vf "scale=${outW}:${outH}:flags=lanczos" ` +
      `-c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 ` +
      `"${silentMp4}"`,
    { stdio: "inherit" }
  );

  fs.rmSync(framesDir, { recursive: true });

  if (audioEvents.length > 0) {
    console.log(`Muxing ${audioEvents.length} audio segments ...`);
    muxAudio(silentMp4, outputMp4, audioEvents);
    fs.unlinkSync(silentMp4);
  } else {
    fs.renameSync(silentMp4, outputMp4);
  }

  console.log(`Done: ${outputMp4} (${outW}x${outH})`);
}

/**
 * Overlay audio segments onto the silent video using ffmpeg filter_complex.
 * Each segment is delayed to its correct timestamp via the adelay filter,
 * then all are mixed together and muxed with the video track.
 */
function muxAudio(
  silentMp4: string,
  outputMp4: string,
  events: AudioEvent[]
) {
  const inputs: string[] = [`-i "${silentMp4}"`];
  const filterParts: string[] = [];
  const labels: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const delayMs = Math.round((e.startFrame / FPS) * 1000);
    inputs.push(`-i "${e.filePath}"`);
    const inputIdx = i + 1;
    const label = `a${i}`;
    filterParts.push(
      `[${inputIdx}:a]adelay=${delayMs}|${delayMs}[${label}]`
    );
    labels.push(`[${label}]`);
  }

  const mixFilter = `${labels.join("")}amix=inputs=${events.length}:duration=longest:normalize=0[aout]`;
  const filterComplex = [...filterParts, mixFilter].join(";");

  const cmd =
    `ffmpeg -y ${inputs.join(" ")} ` +
    `-filter_complex "${filterComplex}" ` +
    `-map 0:v -map "[aout]" ` +
    `-c:v copy -c:a aac -b:a 192k ` +
    `"${outputMp4}"`;

  execSync(cmd, { stdio: "inherit" });
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Usage:
  npx ts-node record-device.ts <input.json> [output.mp4] [--theme <id>]

  If output.mp4 is omitted, files go to output/<date-time>-<name>/

Themes: ${listThemes().join(", ")}

Examples:
  npx ts-node record-device.ts episode.json
  npx ts-node record-device.ts episode.json output.mp4 --theme kakaotalk
  npx ts-node record-device.ts episode.json --theme imessage
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const themeIdx = args.indexOf("--theme");
  const themeId =
    themeIdx !== -1 && args[themeIdx + 1] ? args[themeIdx + 1] : "kakaotalk";

  const positionalArgs = args.filter(
    (_, i) => i !== themeIdx && i !== themeIdx + 1
  );
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
    theme = getTheme(themeId, episode, dialogues);
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
  console.log(`Generated HTML: ${htmlPath}`);

  record(htmlPath, mp4Path, theme.viewport.width, theme.viewport.height, dialogues).catch(
    (e) => {
      console.error("Recording failed:", e);
      process.exit(1);
    }
  );
}

main();
