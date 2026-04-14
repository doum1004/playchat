import * as fs from "fs";
import * as path from "path";
import { PodcastEpisode, flattenDialogues, DEFAULT_ENGINE_OPTIONS } from "./core/types";
import { resolveOutputDir } from "./core/output";
import { getTheme, listThemes } from "./themes";

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

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Usage:
  npx ts-node generate.ts <input.json> [output.html] [--theme <id>] [--pause <ms>]

  If output.html is omitted, files go to output/<date-time>-<name>/

Options:
  --theme <id>   Theme to use (${listThemes().join(", ")}) [default: kakaotalk]
  --pause <ms>   No-audio pause between messages in ms [default: ${DEFAULT_ENGINE_OPTIONS.pauseMs}]

Examples:
  npx ts-node generate.ts episode.json
  npx ts-node generate.ts episode.json output.html --theme kakaotalk
  npx ts-node generate.ts episode.json --theme imessage --pause 5000
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

  let outputPath: string;
  if (explicitOutput) {
    outputPath = explicitOutput;
    const dir = path.dirname(outputPath);
    if (dir && dir !== ".") fs.mkdirSync(dir, { recursive: true });
  } else {
    const outDir = resolveOutputDir(inputPath);
    outputPath = path.join(outDir, "output.html");
  }

  const html = theme.render();
  fs.writeFileSync(outputPath, html, "utf-8");

  console.log(`Generated: ${outputPath}`);
  console.log(`   Theme:     ${theme.label} (${theme.id})`);
  console.log(
    `   Viewport:  ${theme.viewport.width}x${theme.viewport.height}`
  );
  console.log(`   Dialogues: ${dialogues.length}`);
  console.log(`   Pause:     ${pauseMs}ms`);
}

main();
