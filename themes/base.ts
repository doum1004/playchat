import { PodcastEpisode, FlatDialogue, EngineOptions, Orientation, ColorTheme, DEFAULT_ENGINE_OPTIONS, normalizeAudioPath } from "../core/types";

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
 * Horizontal 16:9 logical viewport (→ 1920×1080 after 2× scale).
 * Chat occupies a portrait strip on the left; the right pane shows image/video.
 */
export const THEME_VIEWPORT_HORIZONTAL: ThemeConfig = { width: 960, height: 540 };

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

  /** Frame orientation from engine options (CLI-driven). Defaults to "vertical". */
  get orientation(): Orientation {
    return this.options.orientation === "horizontal" ? "horizontal" : "vertical";
  }

  protected get isHorizontal(): boolean {
    return this.orientation === "horizontal";
  }

  /** Color scheme from engine options (CLI-driven). Defaults to "light". */
  get colorTheme(): ColorTheme {
    return this.options.colorTheme === "dark" ? "dark" : "light";
  }

  protected get isDark(): boolean {
    return this.colorTheme === "dark";
  }

  /** Viewport depends on orientation: 9:16 vertical (default) or 16:9 horizontal. */
  get viewport(): ThemeConfig {
    return this.isHorizontal ? THEME_VIEWPORT_HORIZONTAL : THEME_VIEWPORT;
  }

  /**
   * Width of the chat pane in horizontal layout. A portrait strip on the left,
   * kept just under half the frame width so the media pane stays dominant.
   */
  protected get chatPaneWidth(): number {
    return Math.round(this.viewport.width * 0.45);
  }

  /**
   * Content scale applied to the chat pane in horizontal layout. Themes use px
   * font sizes tuned for the taller vertical viewport, so in the shorter
   * horizontal strip they render large and only a few messages fit. Scaling the
   * whole chat root down makes text smaller and shows more messages at once.
   */
  protected get horizontalChatScale(): number {
    return 0.8;
  }

  /** Browser-usable URI of the episode-level default image (right pane). */
  protected get episodeImageURI(): string {
    const img = this.episode.image ?? "";
    return img ? normalizeAudioPath(img) : "";
  }

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

  // ── Bottom branding band ──
  // A reserved strip at the bottom of the 9:16 frame showing the show name.
  // It keeps the chat content clear of platform overlay UI (YouTube Shorts /
  // TikTok caption + action buttons) and doubles as branding.

  /** Band background color — overridden per theme to match its accent. */
  protected get bottomBandBg(): string { return "#000"; }

  /** Band text color — overridden per theme for contrast against the accent. */
  protected get bottomBandFg(): string { return "#fff"; }

  /** Show name displayed in the band. Empty string when the episode has no name. */
  protected get bottomLabel(): string { return this.episode.name ?? ""; }

  /** Escape a plain string for safe inline HTML injection. */
  protected escapeHTML(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
const HORIZONTAL = ${this.isHorizontal};
const EPISODE_IMAGE = ${JSON.stringify(this.episodeImageURI)};

// ── Right media pane (horizontal layout) ────────────────────────────────────
// Displays the active image/video on the right side. Media follows its parent
// scope's lifecycle:
//   • a dialogue image shows only while that dialogue is active; once it ends
//     the pane falls back to the section image;
//   • a section image shows across its section; once the section ends it falls
//     back to the episode image.
// Effective priority at any instant: active dialogue image > section image > episode image.
function __isVideoSrc__(s) {
  return /\\.(mp4|webm|mov|m4v|ogv)(\\?|#|$)/i.test(s);
}
function __mediaSrc__(d, ended) {
  if (!d) return EPISODE_IMAGE || '';
  var own = ended ? '' : (d.image || '');
  return own || d.sectionImage || EPISODE_IMAGE || '';
}
// Show media for dialogue \`d\`. When \`ended\` is true the dialogue's own image is
// dropped so the section/episode image shows during the gap after it finishes.
function setMedia(d, ended) {
  if (!HORIZONTAL) return;
  var img = document.getElementById('pc-media-img');
  var vid = document.getElementById('pc-media-video');
  if (!img || !vid) return;
  var src = __mediaSrc__(d, ended);
  if (!src) {
    img.style.display = 'none';
    vid.style.display = 'none';
    if (vid.pause) vid.pause();
    return;
  }
  if (__isVideoSrc__(src)) {
    img.style.display = 'none';
    if (vid.getAttribute('src') !== src) vid.setAttribute('src', src);
    vid.style.display = 'block';
    if (vid.play) { var p = vid.play(); if (p && p.catch) p.catch(function() {}); }
  } else {
    vid.style.display = 'none';
    if (vid.pause) vid.pause();
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img.style.display = 'block';
  }
}

// Render a dialogue bubble and show its media (dialogue still active).
function showMsg(d) {
  appendMsg(d);
  setMedia(d, false);
}

// ── Inline bubble thumbnails (vertical layout) ──────────────────────────────
// Vertical themes render images inline in the chat as bubble thumbnails. Unlike
// the horizontal pane (which swaps a single persistent media by priority), each
// scope's image simply appears once, at the point its scope begins:
//   • the episode image is shown as a banner at the top when the chat starts
//     (see showEpisodeBanner — it does not wait for the first dialogue);
//   • a section image is shown on the first bubble of that section;
//   • a dialogue image is shown on its own bubble.
// These are independent (no priority/fallback). Returns [] in horizontal mode
// (media shows in the right pane instead).
var __lastSectionImgKey__ = null;
function bubbleImages(d) {
  if (HORIZONTAL || !d) return [];
  var out = [];
  if (d.section !== __lastSectionImgKey__) {
    __lastSectionImgKey__ = d.section;
    if (d.sectionImage) out.push(d.sectionImage);
  }
  if (d.image) out.push(d.image);
  return out;
}

// Episode banner: shown at the top of the chat the moment the episode starts,
// independent of any dialogue. Vertical layout only (horizontal uses the right
// media pane). Self-styled so no per-theme CSS is required.
function showEpisodeBanner() {
  if (HORIZONTAL || !EPISODE_IMAGE) return;
  var body = document.getElementById('chat-body');
  if (!body || document.getElementById('pc-episode-banner')) return;
  var img = document.createElement('img');
  img.id = 'pc-episode-banner';
  img.src = EPISODE_IMAGE;
  img.style.cssText = 'display:block;width:100%;max-height:280px;object-fit:cover;border-radius:12px;margin:8px 0 10px;';
  img.onload = function() { window.__imgLoaded__ && window.__imgLoaded__(); };
  img.onerror = function() { img.remove(); };
  // Place just above the first section divider (and below the date divider,
  // where a theme has one) so the episode image leads the chat content.
  var anchor = body.querySelector('.section-divider');
  if (anchor) body.insertBefore(img, anchor);
  else body.insertBefore(img, body.firstChild);
}

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
      showMsg(dialogues[nextIdx]);
      nextIdx++;
    }
    // Media follows the active dialogue: once t passes its timeEndSec the
    // dialogue image is dropped in favour of the section/episode image.
    if (nextIdx > 0) {
      var active = dialogues[nextIdx - 1];
      setMedia(active, active.timeEndSec > 0 && t > active.timeEndSec);
    }
    if (nextIdx >= TOTAL) {
      document.body.dataset.done = '1';
    }
  });
  audio.addEventListener('ended', function() {
    // Flush any remaining dialogues
    while (nextIdx < TOTAL) {
      showMsg(dialogues[nextIdx]);
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
  setMedia(d, false);
  idx++;

  if (d.audio) {
    currentAudio = new Audio(d.audio);
    // When the clip ends, drop the dialogue image so the section/episode image
    // shows during the gap before the next dialogue appears.
    currentAudio.onended = function() { setMedia(d, true); setTimeout(playNext, POST_AUDIO_GAP_MS); };
    currentAudio.onerror = function() { setMedia(d, true); setTimeout(playNext, 2000); };
    currentAudio.play().catch(function() { setMedia(d, true); setTimeout(playNext, 2000); });
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
      showMsg(dialogues[rendered]);
      rendered++;
    }
    // Media follows the active dialogue's lifecycle. A dialogue ends at
    // timeline[i] + its audio duration; past that the pane reverts to the
    // section image (and to the episode image once the section changes).
    if (rendered > 0) {
      var ai = rendered - 1;
      var endMs = timeline[ai] + (dialogues[ai].audioDurationSec || 0) * 1000;
      setMedia(dialogues[ai], nowMs > endMs);
    } else {
      setMedia(null, false);
    }
    if (rendered >= dialogues.length || rendered >= timeline.length) {
      document.body.dataset.done = '1';
    }
  };
}

window.addEventListener('load', function() {
  // Show the episode default image on the right pane before any dialogue.
  setMedia(null, false);
  // Vertical layout: show the episode image as a banner right away.
  showEpisodeBanner();

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
    const showBand = this.options.showBottomBand && this.bottomLabel.trim().length > 0;
    const ratioPct = Math.max(0, Math.min(1, this.options.bottomHeightRatio)) * 100;
    const bandStyle = showBand
      ? `
#pc-bottom-band {
  flex: 0 0 ${ratioPct}%;
  display: flex; align-items: center; justify-content: center;
  padding: 0 18px; overflow: hidden;
  background: ${this.bottomBandBg}; color: ${this.bottomBandFg};
  font-size: 26px; font-weight: 700; text-align: center; line-height: 1.2;
}`
      : "";
    const band = showBand
      ? `<div id="pc-bottom-band"><span>${this.escapeHTML(this.bottomLabel)}</span></div>`
      : "";

    // Horizontal layout: chat stays in a portrait strip on the left; the right
    // pane shows the active image/video (dialogue > section > episode).
    const hScale = this.horizontalChatScale;
    const hInvPct = (100 / hScale).toFixed(4); // up-size before scaling down
    const horizontalStyle = this.isHorizontal
      ? `
#pc-stage { flex-direction: row; }
#pc-chat-pane {
  flex: 0 0 ${this.chatPaneWidth}px;
  width: ${this.chatPaneWidth}px;
  height: 100%;
  display: flex; flex-direction: column;
}
#pc-chat-pane #pc-content { overflow: hidden; }
/* Scale the chat root down so text is smaller and more messages are visible.
   The root is up-sized to 1/scale so that after scaling it fills the pane. */
#pc-chat-pane #pc-content > * {
  transform: scale(${hScale});
  transform-origin: top left;
  width: ${hInvPct}%;
  height: ${hInvPct}%;
}
#pc-media-pane {
  flex: 1 1 auto; min-width: 0; height: 100%;
  position: relative; overflow: hidden; background: #000;
  display: flex; align-items: center; justify-content: center;
}
#pc-media-img, #pc-media-video {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
#pc-media-label {
  position: absolute; top: 18px; right: 18px; z-index: 2;
  max-width: 70%; padding: 8px 16px; border-radius: 999px;
  background: ${this.bottomBandBg}; color: ${this.bottomBandFg};
  font-size: 22px; font-weight: 700; line-height: 1.2; text-align: right;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}`
      : "";

    // In horizontal mode the show name moves from the bottom band to a
    // top-right label overlaid on the media pane.
    const mediaLabel = showBand
      ? `<div id="pc-media-label">${this.escapeHTML(this.bottomLabel)}</div>`
      : "";

    const stageInner = this.isHorizontal
      ? `<div id="pc-chat-pane">
<div id="pc-content">
${body}
</div>
</div>
<div id="pc-media-pane">
${mediaLabel}
<img id="pc-media-img" style="display:none" onload="window.__imgLoaded__ && window.__imgLoaded__()" onerror="this.style.display='none'" />
<video id="pc-media-video" style="display:none" muted playsinline loop></video>
</div>`
      : `<div id="pc-content">
${body}
</div>
${band}`;

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
#pc-stage { width: 100%; height: 100%; display: flex; flex-direction: column; }
#pc-content { flex: 1 1 auto; min-height: 0; position: relative; }${bandStyle}${horizontalStyle}
${style}
</style>
</head>
<body>
<div id="pc-stage">
${stageInner}
</div>
<script>
${script}
</script>
</body>
</html>`;
  }
}
