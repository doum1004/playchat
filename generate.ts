import * as fs from "fs";
import * as path from "path";
import { PodcastEpisode, flattenDialogues } from "./core/types";
import { resolveOutputDir } from "./core/output";
import { getTheme, listThemes } from "./themes";

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Usage:
  npx ts-node generate.ts <input.json> [output.html] [--theme <id>]

  If output.html is omitted, files go to output/<date-time>-<name>/

Themes: ${listThemes().join(", ")}

Examples:
  npx ts-node generate.ts episode.json
  npx ts-node generate.ts episode.json output.html --theme kakaotalk
  npx ts-node generate.ts episode.json --theme imessage
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
}

main();
