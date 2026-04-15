import * as fs from "fs";
import * as path from "path";
import { PodcastEpisode, flattenDialogues, normalizeAudioPath } from "../core/types";

const fixture: PodcastEpisode = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../fixtures/episode.json"), "utf-8")
);

describe("flattenDialogues", () => {
  const flat = flattenDialogues(fixture);

  it("returns correct total count", () => {
    const expected = fixture.sections.reduce(
      (sum, s) => sum + s.dialogues.length,
      0
    );
    expect(flat.length).toBe(expected);
    expect(flat.length).toBe(5);
  });

  it("propagates section (corner_name) to each dialogue", () => {
    expect(flat[0].section).toBe("[톡톡 인사말]");
    expect(flat[3].section).toBe("[실전 영어 상황극]");
  });

  it("preserves speaker and name fields", () => {
    expect(flat[0].speaker).toBe("host_1");
    expect(flat[0].name).toBe("민수");
    expect(flat[1].speaker).toBe("host_2");
    expect(flat[1].name).toBe("Ashley");
  });

  it("preserves text content", () => {
    expect(flat[0].text).toContain("톡톡 영어");
    expect(flat[3].text).toContain("옮기는데");
  });

  it("normalizes local audio paths to file:/// URIs", () => {
    for (const d of flat) {
      if (d.audioRaw && !d.audioRaw.startsWith("http")) {
        expect(d.audio).toMatch(/^file:\/\/\//);
        expect(d.audio).not.toContain("\\");
      }
    }
  });

  it("preserves raw audio path in audioRaw", () => {
    for (let i = 0; i < flat.length; i++) {
      const rawFromFixture = fixture.sections
        .flatMap((s) => s.dialogues)
        [i].audio;
      expect(flat[i].audioRaw).toBe(rawFromFixture);
    }
  });

  it("handles empty sections array", () => {
    const empty: PodcastEpisode = {
      ...fixture,
      sections: [],
    };
    expect(flattenDialogues(empty)).toEqual([]);
  });

  it("handles section with zero dialogues", () => {
    const noDialogues: PodcastEpisode = {
      ...fixture,
      sections: [
        {
          section_id: 99,
          section_title: "Empty",
          section_type: "filler",
          corner_name: "빈 섹션",
          dialogues: [],
        },
      ],
    };
    expect(flattenDialogues(noDialogues)).toEqual([]);
  });

  it("defaults to corner_name as section even if empty string", () => {
    const emptyCorner: PodcastEpisode = {
      ...fixture,
      sections: [
        {
          section_id: 1,
          section_title: "Test",
          section_type: "test",
          corner_name: "",
          dialogues: [
            { id: 1, speaker: "host_1", name: "Test", text: "hi", audio: "" },
          ],
        },
      ],
    };
    const result = flattenDialogues(emptyCorner);
    expect(result[0].section).toBe("");
  });
});

describe("normalizeAudioPath", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeAudioPath("")).toBe("");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizeAudioPath(undefined as unknown as string)).toBe("");
    expect(normalizeAudioPath(null as unknown as string)).toBe("");
  });

  it("passes through http URLs", () => {
    const url = "http://example.com/audio.mp3";
    expect(normalizeAudioPath(url)).toBe(url);
  });

  it("passes through https URLs", () => {
    const url = "https://cdn.example.com/audio/clip.wav";
    expect(normalizeAudioPath(url)).toBe(url);
  });

  it("is case-insensitive for URL detection", () => {
    const url = "HTTPS://CDN.EXAMPLE.COM/audio.mp3";
    expect(normalizeAudioPath(url)).toBe(url);
  });

  it("converts local path to file:/// URI", () => {
    const result = normalizeAudioPath("fixtures/segment_0000.mp3");
    expect(result).toMatch(/^file:\/\/\//);
    expect(result).toContain("segment_0000.mp3");
    expect(result).not.toContain("\\");
  });

  it("converts Windows-style path to file:/// URI without backslashes", () => {
    const result = normalizeAudioPath("C:\\Users\\test\\audio.mp3");
    expect(result).toMatch(/^file:\/\/\//);
    expect(result).toContain("audio.mp3");
    expect(result).not.toContain("\\");
  });

  it("handles already-absolute paths", () => {
    const abs = path.resolve("fixtures/segment_0000.mp3");
    const result = normalizeAudioPath(abs);
    expect(result).toMatch(/^file:\/\/\//);
    expect(result).toContain("segment_0000.mp3");
  });
});
