import * as fs from "fs";
import * as path from "path";
import { PodcastEpisode, flattenDialogues, DEFAULT_ENGINE_OPTIONS } from "../core/types";
import { getTheme, listThemes } from "../themes";

const fixture: PodcastEpisode = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../fixtures/episode.json"), "utf-8")
);
const dialogues = flattenDialogues(fixture);

describe("theme registry", () => {
  it("lists at least kakaotalk and imessage", () => {
    const themes = listThemes();
    expect(themes).toContain("kakaotalk");
    expect(themes).toContain("imessage");
  });

  it("throws on unknown theme", () => {
    expect(() => getTheme("nonexistent", fixture, dialogues)).toThrow(
      /Unknown theme/
    );
  });
});

describe.each(listThemes())("theme: %s", (themeId) => {
  const theme = getTheme(themeId, fixture, dialogues);
  const html = theme.render();

  it("has correct id", () => {
    expect(theme.id).toBe(themeId);
  });

  it("has a non-empty label", () => {
    expect(theme.label.length).toBeGreaterThan(0);
  });

  it("has valid viewport dimensions", () => {
    expect(theme.viewport.width).toBeGreaterThan(0);
    expect(theme.viewport.height).toBeGreaterThan(0);
  });

  it("renders valid HTML with DOCTYPE", () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it("contains id='chat-body' element", () => {
    expect(html).toContain('id="chat-body"');
  });

  it("contains appendMsg function", () => {
    expect(html).toContain("function appendMsg(d)");
  });

  it("contains lastSection variable", () => {
    expect(html).toContain("let lastSection");
  });

  it("contains playNext engine function", () => {
    expect(html).toContain("function playNext()");
  });

  it("contains autoplay listener", () => {
    expect(html).toContain("autoplay");
  });

  it("contains episode title", () => {
    expect(html).toContain(fixture.episode_title);
  });

  it("embeds all dialogues as JSON data", () => {
    const simpleDialogue = dialogues.find((d) => !d.text.includes('"'));
    expect(simpleDialogue).toBeDefined();
    expect(html).toContain(simpleDialogue!.text);
  });

  it("uses default pauseMs (3000) when no options provided", () => {
    expect(html).toContain(
      `setTimeout(playNext, ${DEFAULT_ENGINE_OPTIONS.pauseMs})`
    );
  });
});

describe("pauseMs option", () => {
  it("embeds custom pauseMs value in rendered HTML", () => {
    const customPause = 5000;
    const theme = getTheme("kakaotalk", fixture, dialogues, {
      pauseMs: customPause,
    });
    const html = theme.render();
    expect(html).toContain(`setTimeout(playNext, ${customPause})`);
    expect(html).not.toContain(
      `setTimeout(playNext, ${DEFAULT_ENGINE_OPTIONS.pauseMs})`
    );
  });

  it("works with all registered themes", () => {
    for (const themeId of listThemes()) {
      const theme = getTheme(themeId, fixture, dialogues, { pauseMs: 4200 });
      const html = theme.render();
      expect(html).toContain("setTimeout(playNext, 4200)");
    }
  });

  it("falls back to default when options omitted", () => {
    const theme = getTheme("kakaotalk", fixture, dialogues);
    const html = theme.render();
    expect(html).toContain(`setTimeout(playNext, 3000)`);
  });
});
