import * as fs from "fs";
import * as path from "path";
import { resolveOutputDir } from "../core/output";

describe("resolveOutputDir", () => {
  const createdDirs: string[] = [];

  afterAll(() => {
    for (const dir of createdDirs) {
      try {
        fs.rmSync(dir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    }
    try {
      const outputRoot = path.resolve("output");
      const entries = fs.readdirSync(outputRoot);
      if (entries.length === 0) fs.rmdirSync(outputRoot);
    } catch {
      // ignore
    }
  });

  it("returns an absolute path", () => {
    const dir = resolveOutputDir("fixtures/episode.json");
    createdDirs.push(dir);
    expect(path.isAbsolute(dir)).toBe(true);
  });

  it("creates the directory", () => {
    const dir = resolveOutputDir("fixtures/episode.json");
    createdDirs.push(dir);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it("includes the json basename in the directory name", () => {
    const dir = resolveOutputDir("fixtures/episode.json");
    createdDirs.push(dir);
    expect(path.basename(dir)).toContain("episode");
  });

  it("includes a YYYYMMDD-HHmmss timestamp", () => {
    const dir = resolveOutputDir("fixtures/episode.json");
    createdDirs.push(dir);
    const dirName = path.basename(dir);
    expect(dirName).toMatch(/^\d{8}-\d{6}-/);
  });

  it("lives under the output/ root", () => {
    const dir = resolveOutputDir("fixtures/episode.json");
    createdDirs.push(dir);
    const relative = path.relative(path.resolve("output"), dir);
    expect(relative).not.toContain("..");
  });

  it("strips file extension from basename", () => {
    const dir = resolveOutputDir("data/my-podcast.json");
    createdDirs.push(dir);
    const dirName = path.basename(dir);
    expect(dirName).toContain("my-podcast");
    expect(dirName).not.toContain(".json");
  });
});
