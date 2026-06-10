import { PodcastEpisode, FlatDialogue, EngineOptions, DEFAULT_ENGINE_OPTIONS } from "../core/types";

export interface ThemeConfig {
  width: number;
  height: number;
}

/**
 * Shared 9:16 logical viewport for every theme.
 * Recording captures at deviceScaleFactor 2, so output = 1080×1920 (Full HD).
 */
export const THEME_VIEWPORT: ThemeConfig = { width: 540, height: 960 };

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
  abstract render(): string;

  /** 9:16 viewport shared by all themes (1080×1920 after 2× scale). */
  get viewport(): ThemeConfig { return THEME_VIEWPORT; }

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

  /** URL of the episode-level audio file, or empty string if per-dialogue mode. */
  protected get episodeAudioURL(): string {
    return this.episode.audio ?? "";
  }

  /** True when dialogues use time_start / time_end with a single episode audio. */
  protected get isEpisodeAudioMode(): boolean {
    return !!this.episodeAudioURL &&
      this.dialogues.length > 0 &&
      this.dialogues.every((d) => d.timeStartSec > 0 || d.timeEndSec > 0);
  }

  /** Shared playback engine — call at the end of every theme's JS block. */
  protected get engineScript(): string {
    return `
const dialogues = ${this.dialoguesJSON};
const TOTAL = dialogues.length;
let idx = 0, isPlaying = false, currentAudio = null;
let lastSection = ${JSON.stringify(this.firstSection)};
const POST_AUDIO_GAP_MS = 400;
const EPISODE_AUDIO_URL = ${JSON.stringify(this.episodeAudioURL)};
const IS_EPISODE_AUDIO = ${this.isEpisodeAudioMode};

// ── Image-aware scrolling ───────────────────────────────────────────────────
// Bubbles are scrolled into view the moment they're appended, but images load
// asynchronously and report height 0 until decoded. Re-scroll once each image
// finishes so the newest content stays in view instead of being pushed below
// the fold (which crops text and can hide the image entirely in screenshots).
window.__imgLoaded__ = function() {
  var chatBody = document.getElementById('chat-body');
  if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
};

// Recorder hook: resolves once every <img> has finished loading (or errored).
// The recorder awaits this before each screenshot so frames never capture a
// half-loaded image or text cropped by a not-yet-measured image height.
window.__IMAGES_READY__ = function() {
  var imgs = Array.prototype.slice.call(document.images || []);
  return Promise.all(imgs.map(function(img) {
    if (img.complete) return null;
    return new Promise(function(res) {
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    });
  })).then(function() {
    var chatBody = document.getElementById('chat-body');
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
  });
};

// ── Episode-audio preview mode ──────────────────────────────────────────────
// Plays a single audio file; shows bubbles when currentTime reaches each
// dialogue's timeStartSec.

function playEpisodeAudio() {
  var audio = new Audio(EPISODE_AUDIO_URL);
  var nextIdx = 0;
  audio.addEventListener('timeupdate', function() {
    var t = audio.currentTime;
    while (nextIdx < TOTAL && dialogues[nextIdx].timeStartSec <= t) {
      appendMsg(dialogues[nextIdx]);
      nextIdx++;
    }
    if (nextIdx >= TOTAL) {
      document.body.dataset.done = '1';
    }
  });
  audio.addEventListener('ended', function() {
    // Flush any remaining dialogues
    while (nextIdx < TOTAL) {
      appendMsg(dialogues[nextIdx]);
      nextIdx++;
    }
    document.body.dataset.done = '1';
  });
  audio.onerror = function() {
    console.warn('Episode audio failed to load, falling back to per-dialogue mode');
    playNext();
  };
  audio.play().catch(function() {
    console.warn('Episode audio play() rejected, falling back to per-dialogue mode');
    playNext();
  });
}

// ── Per-dialogue preview mode ───────────────────────────────────────────────

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

  setTimeout(function() {
    isPlaying = true;
    if (IS_EPISODE_AUDIO) {
      playEpisodeAudio();
    } else {
      playNext();
    }
  }, 800);
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
