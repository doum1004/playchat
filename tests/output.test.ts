import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { resolveOutputDir } from "../core/output";

describe("resolveOutputDir (auto-generated)", () => {
  // Use a throwaway temp directory so we never touch committed fixtures
  // (the auto-generated output dir is the one we clean up here).
  let tmpBase: string;
  let inputJson: string;

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "playchat-auto-"));
    inputJson = path.join(tmpBase, "episode.json");
    fs.writeFileSync(inputJson, "{}", "utf-8");
  });

  afterEach(() => {
    try { fs.rmSync(tmpBase, { recursive: true }); } catch { /* ignore */ }
  });

  it("returns an absolute path", () => {
    const dir = resolveOutputDir(inputJson);
    expect(path.isAbsolute(dir)).toBe(true);
  });

  it("creates the directory", () => {
    const dir = resolveOutputDir(inputJson);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it("uses an 'output' directory next to the input json", () => {
    const dir = resolveOutputDir(inputJson);
    expect(path.basename(dir)).toBe("output");
  });

  it("lives under the input json's directory", () => {
    const dir = resolveOutputDir(inputJson);
    expect(dir).toBe(path.resolve(tmpBase, "output"));
  });

  it("places output next to the input json regardless of json name", () => {
    const named = path.join(tmpBase, "my-podcast.json");
    fs.writeFileSync(named, "{}", "utf-8");
    const dir = resolveOutputDir(named);
    expect(dir).toBe(path.resolve(tmpBase, "output"));
  });
});

describe("resolveOutputDir (explicit dir)", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "playchat-test-"));
  });

  afterEach(() => {
    try { fs.rmSync(tmpBase, { recursive: true }); } catch { /* ignore */ }
  });

  it("returns the explicit dir as absolute path", () => {
    const explicit = path.join(tmpBase, "my-output");
    const dir = resolveOutputDir("fixtures/example1/episode.json", explicit);
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir).toBe(path.resolve(explicit));
  });

  it("creates the explicit directory", () => {
    const explicit = path.join(tmpBase, "my-output");
    resolveOutputDir("fixtures/example1/episode.json", explicit);
    expect(fs.existsSync(explicit)).toBe(true);
    expect(fs.statSync(explicit).isDirectory()).toBe(true);
  });

  it("creates nested explicit directories recursively", () => {
    const explicit = path.join(tmpBase, "a", "b", "c");
    resolveOutputDir("fixtures/example1/episode.json", explicit);
    expect(fs.existsSync(explicit)).toBe(true);
  });

  it("does not use a timestamp when explicit dir is given", () => {
    const explicit = path.join(tmpBase, "my-output");
    const dir = resolveOutputDir("fixtures/example1/episode.json", explicit);
    expect(path.basename(dir)).not.toMatch(/^\d{8}-\d{6}-/);
  });

  it("uses the exact explicit dir name regardless of input json name", () => {
    const explicit = path.join(tmpBase, "custom-name");
    const dir = resolveOutputDir("fixtures/example1/episode.json", explicit);
    expect(path.basename(dir)).toBe("custom-name");
  });
});

describe("manifest.json structure", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "playchat-manifest-"));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  function writeTestManifest(extra: object = {}) {
    const manifest = {
      input: "/path/to/episode.json",
      theme: "kakaotalk",
      pauseMs: 3000,
      showAvatar: true,
      createdAt: new Date().toISOString(),
      files: { html: "output.html" },
      dialogueCount: 5,
      ...extra,
    };
    const manifestPath = path.join(tmpDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    return manifestPath;
  }

  it("is valid JSON", () => {
    const manifestPath = writeTestManifest();
    expect(() => JSON.parse(fs.readFileSync(manifestPath, "utf-8"))).not.toThrow();
  });

  it("contains required top-level keys", () => {
    const manifestPath = writeTestManifest();
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(data).toHaveProperty("input");
    expect(data).toHaveProperty("theme");
    expect(data).toHaveProperty("pauseMs");
    expect(data).toHaveProperty("showAvatar");
    expect(data).toHaveProperty("createdAt");
    expect(data).toHaveProperty("files");
    expect(data).toHaveProperty("dialogueCount");
  });

  it("files.html is always present", () => {
    const manifestPath = writeTestManifest();
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(data.files.html).toBe("output.html");
  });

  it("files.mp4 is present when --record was used", () => {
    const manifestPath = writeTestManifest({ files: { html: "output.html", mp4: "output.mp4" } });
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(data.files.mp4).toBe("output.mp4");
  });

  it("files.mp4 is absent when --record was not used", () => {
    const manifestPath = writeTestManifest();
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(data.files.mp4).toBeUndefined();
  });

  it("bubble screenshots are present when recording was used", () => {
    const manifestPath = writeTestManifest({
      files: {
        html: "output.html",
        mp4: "output.mp4",
        firstBubblePng: "first_bubble.png",
        lastBubblePng: "last_bubble.png",
      },
    });
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(data.files.firstBubblePng).toBe("first_bubble.png");
    expect(data.files.lastBubblePng).toBe("last_bubble.png");
  });

  it("bubble screenshots are absent when recording was not used", () => {
    const manifestPath = writeTestManifest();
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(data.files.firstBubblePng).toBeUndefined();
    expect(data.files.lastBubblePng).toBeUndefined();
  });

  it("createdAt is a valid ISO 8601 date string", () => {
    const manifestPath = writeTestManifest();
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(() => new Date(data.createdAt).toISOString()).not.toThrow();
    expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
  });

  it("dialogueCount is a non-negative integer", () => {
    const manifestPath = writeTestManifest({ dialogueCount: 10 });
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(Number.isInteger(data.dialogueCount)).toBe(true);
    expect(data.dialogueCount).toBeGreaterThanOrEqual(0);
  });
});
