import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";
import { PodcastEpisode, flattenDialogues } from "../core/types";
import { getTheme, listThemes } from "../themes";

const fixturePath = path.resolve(__dirname, "../fixtures/example5/episode.json");
const episodeImage = pathToFileURL(path.resolve(__dirname, "../fixtures/example1/output/first_bubble.png")).href;
const sectionImage = pathToFileURL(path.resolve(__dirname, "../fixtures/example1/output/last_bubble.png")).href;
const dialogueImage = pathToFileURL(path.resolve(__dirname, "../fixtures/example5/output/translation_preview.png")).href;
const avatarPhoto = pathToFileURL(path.resolve(__dirname, "../fixtures/example1/output/first_bubble.png")).href;

it("shows only the active themed bubble over full-frame media", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "playchat-fullscreen-"));
  try {
    const episode: PodcastEpisode = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    episode.image = episodeImage;
    episode.sections[0].image = sectionImage;
    episode.sections[0].dialogues[0].image = dialogueImage;
    const dialogues = flattenDialogues(episode);
    dialogues[0].audioDurationSec = 1;

    const htmlPaths = listThemes().map((themeId) => {
      const htmlPath = path.join(tempDir, `${themeId}.html`);
      fs.writeFileSync(htmlPath, getTheme(themeId, episode, dialogues, { orientation: "fullscreen" }).render());
      return htmlPath;
    });

    const browserScript = path.resolve(__dirname, "fullscreen.browser.cjs");
    const states = JSON.parse(execFileSync(process.execPath, [browserScript, ...htmlPaths], {
      encoding: "utf-8", timeout: 30_000,
    })) as Array<Array<{
      texts: string[]; annotation?: string; mediaSrc?: string;
      mediaRect?: { width: number; height: number }; bubbleBottom?: number;
    }>>;

    expect(states).toHaveLength(htmlPaths.length);
    for (const [first, gap, second, last, end] of states) {
      expect(first.texts).toEqual([episode.sections[0].dialogues[0].text]);
      expect(first.annotation).toBe(episode.sections[0].dialogues[0].annotation);
      expect(first.mediaSrc).toBe(dialogueImage);
      expect(first.mediaRect).toMatchObject({ width: 960, height: 540 });
      expect(first.bubbleBottom).toBeGreaterThan(450);
      expect(gap.texts).toEqual([]);
      expect(gap.mediaSrc).toBe(sectionImage);
      expect(second.texts).toEqual([episode.sections[0].dialogues[1].text]);
      expect(second.mediaSrc).toBe(sectionImage);
      expect(last.texts).toEqual([episode.sections[0].dialogues[2].text]);
      expect(end.texts).toEqual([]);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}, 30_000);

it("centers a sole host's fullscreen bubble with its avatar on the left", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "playchat-single-host-"));
  try {
    const episode: PodcastEpisode = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const host = { ...episode.hosts[0], image: avatarPhoto, useSystemAvatar: false };
    episode.hosts = [host];
    episode.sections[0].dialogues = episode.sections[0].dialogues.map((dialogue) => ({
      ...dialogue, speaker: host.id, name: host.name,
    }));
    const dialogues = flattenDialogues(episode);
    const htmlPaths = listThemes().map((themeId) => {
      const htmlPath = path.join(tempDir, `${themeId}.html`);
      fs.writeFileSync(htmlPath, getTheme(themeId, episode, dialogues, { orientation: "fullscreen" }).render());
      return htmlPath;
    });

    const browserScript = path.resolve(__dirname, "fullscreen.browser.cjs");
    const states = JSON.parse(execFileSync(process.execPath, [browserScript, ...htmlPaths], {
      encoding: "utf-8", timeout: 30_000,
    })) as Array<Array<{
      bubbleLeft?: number; bubbleRight?: number; avatarLeft?: number;
      avatarRight?: number; avatarImageLoaded?: boolean;
      rowClass?: string; texts: string[];
    }>>;

    for (const [first, , second] of states) {
      for (const state of [first, second]) {
        expect(state.rowClass).toBe("msg-row");
        expect(state.avatarRight).toBeLessThan(state.bubbleLeft!);
        expect(state.avatarImageLoaded).toBe(true);
        const groupCenter = (state.avatarLeft! + state.bubbleRight!) / 2;
        expect(groupCenter).toBeGreaterThan(465);
        expect(groupCenter).toBeLessThan(495);
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}, 30_000);
