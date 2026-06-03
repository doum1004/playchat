import * as fs from "fs";
import * as path from "path";

/**
 * Resolve the output directory.
 *
 * - If `explicitDir` is provided, creates and returns that directory.
 * - Otherwise auto-generates: <input-json-dir>/output/
 */
export function resolveOutputDir(inputJsonPath: string, explicitDir?: string): string {
  if (explicitDir) {
    const outputDir = path.resolve(explicitDir);
    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
  }

  const inputDir = path.dirname(path.resolve(inputJsonPath));
  const outputDir = path.resolve(inputDir, "output");

  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}
