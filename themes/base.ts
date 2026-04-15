import { PodcastEpisode, FlatDialogue, EngineOptions, DEFAULT_ENGINE_OPTIONS } from "../core/types";

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
  protected options: EngineOptions;

  constructor(episode: PodcastEpisode, dialogues: FlatDialogue[], options?: Partial<EngineOptions>) {
    this.episode = episode;
    this.dialogues = dialogues;
    this.options = { ...DEFAULT_ENGINE_OPTIONS, ...options };
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
    // Escape characters that can break inline <script> parsing in generated HTML.
    // This keeps playback reliable even when dialogue text includes tags like </script>.
    return JSON.stringify(this.dialogues)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  /** The host id of the first host in the episode — treated as "me" (right side). */
  protected get meHostId(): string {
    return this.episode.hosts[0]?.id ?? "host_1";
  }

  protected get showAvatar(): boolean {
    return this.options.showAvatar;
  }

  /** Shared playback engine — call at the end of every theme's JS block. */
  protected get engineScript(): string {
    return `
const dialogues = ${this.dialoguesJSON};
const TOTAL = dialogues.length;
let idx = 0, isPlaying = false, currentAudio = null;
let lastSection = ${JSON.stringify(this.firstSection)};
const POST_AUDIO_GAP_MS = 400;

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
    currentAudio.onended = function() { setTimeout(playNext, POST_AUDIO_GAP_MS); };
    currentAudio.onerror = function() { setTimeout(playNext, 2000); };
    currentAudio.play().catch(function() { setTimeout(playNext, 2000); });
  } else {
    setTimeout(playNext, ${this.options.pauseMs});
  }
}

/**
 * Scrubber mode: the recorder is the sole clock. It calls
 * window.__SCRUB__(frameTimeMs) before every screenshot. This function
 * renders all messages whose showAtMs <= frameTimeMs that haven't been
 * shown yet. No browser-side timers are used — zero drift.
 *
 * window.__TIMELINE__ must be set (via evaluateOnNewDocument) before load.
 */
function initScrubberMode(timeline) {
  var chatBody = document.getElementById('chat-body');
  if (chatBody) chatBody.style.scrollBehavior = 'auto';
  var noAnim = document.createElement('style');
  noAnim.textContent = '*, *::before, *::after { animation-duration: 0s !important; }';
  document.head.appendChild(noAnim);
  var rendered = 0;
  window.__SCRUB__ = function(nowMs) {
    while (
      rendered < dialogues.length &&
      rendered < timeline.length &&
      timeline[rendered] <= nowMs
    ) {
      appendMsg(dialogues[rendered]);
      rendered++;
    }
    if (rendered >= dialogues.length || rendered >= timeline.length) {
      document.body.dataset.done = '1';
    }
  };
}

window.addEventListener('load', function() {
  if (Array.isArray(window.__TIMELINE__) && window.__TIMELINE__.length > 0) {
    initScrubberMode(window.__TIMELINE__);
    return;
  }

  // Preview mode now auto-starts by default. Users can still opt out via ?autoplay=0.
  var autoplay = new URLSearchParams(location.search).get('autoplay');
  if (autoplay === '0') return;

  setTimeout(function() { isPlaying = true; playNext(); }, 800);
});
`;
  }

  /** Wrap theme-specific style, body, and script into a full HTML document. */
  protected wrapHTML(style: string, body: string, script: string): string {
    const { width, height } = this.viewport;
    return `<!DOCTYPE html>
<html lang="en">
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
