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

  it("uses quote-safe image onerror handler", () => {
    expect(html).toContain('onerror="this.remove()"');
    expect(html).not.toContain("this.style.display=\\'none\\'");
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

describe("dynamic ME host", () => {
  it("sets ME to the first host id from the episode", () => {
    for (const themeId of listThemes()) {
      const theme = getTheme(themeId, fixture, dialogues);
      const html = theme.render();
      expect(html).toContain(`const ME = "${fixture.hosts[0].id}"`);
    }
  });

  it("uses a different host id when hosts[0] changes", () => {
    const altEpisode: PodcastEpisode = {
      ...fixture,
      hosts: [
        { ...fixture.hosts[1], id: "host_X" },
        ...fixture.hosts,
      ],
    };
    const altDialogues = flattenDialogues(altEpisode);
    for (const themeId of listThemes()) {
      const theme = getTheme(themeId, altEpisode, altDialogues);
      const html = theme.render();
      expect(html).toContain(`const ME = "host_X"`);
    }
  });
});

describe("showAvatar option", () => {
  it("defaults SHOW_AVATAR to true", () => {
    for (const themeId of listThemes()) {
      const theme = getTheme(themeId, fixture, dialogues);
      const html = theme.render();
      expect(html).toContain("const SHOW_AVATAR = true");
    }
  });

  it("sets SHOW_AVATAR to false when showAvatar: false", () => {
    for (const themeId of listThemes()) {
      const theme = getTheme(themeId, fixture, dialogues, { showAvatar: false });
      const html = theme.render();
      expect(html).toContain("const SHOW_AVATAR = false");
    }
  });

  it("still contains appendMsg and engine when avatars hidden", () => {
    for (const themeId of listThemes()) {
      const theme = getTheme(themeId, fixture, dialogues, { showAvatar: false });
      const html = theme.render();
      expect(html).toContain("function appendMsg(d)");
      expect(html).toContain("function playNext()");
    }
  });
});
