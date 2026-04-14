import { PodcastEpisode, FlatDialogue } from "../core/types";

export interface ThemeConfig {
  width: number;
  height: number;
}

/**
 * Abstract base for all chat themes.
 *
 * Theme contract — every subclass must provide:
 *   1. An element with id="chat-body" in the HTML body
 *   2. A global `appendMsg(d)` function in the JS block
 *   3. A global `lastSection` variable in the JS block
 *
 * The shared `engineScript` handles playback, autoplay, and done signalling.
 */
export abstract class BaseTheme {
  protected episode: PodcastEpisode;
  protected dialogues: FlatDialogue[];

  constructor(episode: PodcastEpisode, dialogues: FlatDialogue[]) {
    this.episode = episode;
    this.dialogues = dialogues;
  }

  abstract get id(): string;
  abstract get label(): string;
  abstract get viewport(): ThemeConfig;
  abstract render(): string;

  // ── Shared helpers ──

  protected get firstSection(): string {
    return this.episode.sections[0]?.corner_name ?? "";
  }

  protected get hostCount(): number {
    return this.episode.hosts.length;
  }

  protected get totalDialogues(): number {
    return this.dialogues.length;
  }

  protected get dialoguesJSON(): string {
    return JSON.stringify(this.dialogues);
  }

  /** Shared playback engine — call at the end of every theme's JS block. */
  protected get engineScript(): string {
    return `
const dialogues = ${this.dialoguesJSON};
const TOTAL = dialogues.length;
let idx = 0, isPlaying = false, currentAudio = null;
let lastSection = ${JSON.stringify(this.firstSection)};

function playNext() {
  if (idx >= TOTAL) {
    isPlaying = false;
    document.body.dataset.done = '1';
    return;
  }
  const d = dialogues[idx];
  appendMsg(d);
  idx++;

  if (d.audio) {
    currentAudio = new Audio(d.audio);
    currentAudio.onended = function() { setTimeout(playNext, 400); };
    currentAudio.onerror = function() { setTimeout(playNext, 2000); };
    currentAudio.play().catch(function() { setTimeout(playNext, 2000); });
  } else {
    setTimeout(playNext, 2600);
  }
}

if (new URLSearchParams(location.search).get('autoplay') === '1') {
  window.addEventListener('load', function() {
    setTimeout(function() { isPlaying = true; playNext(); }, 800);
  });
}`;
  }

  /** Wrap theme-specific style, body, and script into a full HTML document. */
  protected wrapHTML(style: string, body: string, script: string): string {
    const { width, height } = this.viewport;
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this.episode.episode_title}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: ${width}px;
  height: ${height}px;
  overflow: hidden;
  background: transparent;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
${style}
</style>
</head>
<body>
${body}
<script>
${script}
</script>
</body>
</html>`;
  }
}
