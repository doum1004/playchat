import * as fs from "fs";
import * as path from "path";

/**
 * Resolve the output directory.
 *
 * - If `explicitDir` is provided, creates and returns that directory.
 * - Otherwise auto-generates: output/<YYYYMMDD-HHmmss>-<json-basename>/
 */
export function resolveOutputDir(inputJsonPath: string, explicitDir?: string): string {
  if (explicitDir) {
    const outputDir = path.resolve(explicitDir);
    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
  }

  // read inputJson and get "name" key value
  let name = "";
  let episode_number = "";
  if (fs.existsSync(inputJsonPath)) {
    const inputJson = JSON.parse(fs.readFileSync(inputJsonPath, "utf-8"));
    name = inputJson.name || "unknown";
    if (inputJson.episode_number)
      episode_number = `_EP${String(inputJson.episode_number).padStart(2, "0")}`;
  }
  else {
    name = path.basename(inputJsonPath, path.extname(inputJsonPath));
  }

  const now = new Date();

  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;

  const dirName = `${timestamp}-${name.replace(/\s+/g, '_')}${episode_number}`;
  const outputDir = path.resolve("output", dirName);

  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}
