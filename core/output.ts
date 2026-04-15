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

  const basename = path.basename(inputJsonPath, path.extname(inputJsonPath));
  const now = new Date();

  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;

  const dirName = `${timestamp}-${basename}`;
  const outputDir = path.resolve("output", dirName);

  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}
