# PlayChat

[![npm version](https://img.shields.io/npm/v/playchat?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/playchat)
![total downloads](https://img.shields.io/npm/dt/playchat)
[![CI](https://img.shields.io/github/actions/workflow/status/doum1004/chat-in-video/ci.yml?branch=main&style=flat-square&label=CI&logo=github)](https://github.com/doum1004/chat-in-video/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/playchat?style=flat-square&color=blue)](./LICENSE)
[![bun](https://img.shields.io/badge/built%20with-bun-f9f1e1?style=flat-square&logo=bun)](https://bun.sh)
[![ko-fi](https://img.shields.io/badge/donate-Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/doum1004)

Converts a podcast episode JSON file into a themed chat-UI video (MP4). Audio
clips are sequenced by their measured durations and the final video is
frame-perfectly synced with the audio track.

## Installation

```bash
npm install -g playchat
```

Or run directly with `npx`:

```bash
npx playchat episode.json --record
```

## Requirements

- Node.js 18+
- ffmpeg + ffprobe in PATH

## Quick Start

```bash
# HTML preview (default theme: kakaotalk, files go to <input-json-dir>/output/<timestamp>-<name>/)
npx playchat episode.json

# HTML preview to an explicit output folder
npx playchat episode.json --output ./my-output --theme imessage

# Record to MP4 (output goes to <input-json-dir>/output/<timestamp>-<name>/)
npx playchat episode.json --record

# Record with explicit output folder, custom theme and pause
npx playchat episode.json --output ./my-output --record --theme kakaotalk --pause 4000

# Record a horizontal (16:9) video at 4K with a media pane on the right
npx playchat episode.json --record --orientation horizontal --resolution 4k
```

## CLI Options

```
npx playchat <input.json> [--output <dir>] [--record] [--record-full] [--segments] [--theme <id>] [--pause <ms>] [--orientation <o>] [--resolution <r>] [--color <c>] [--no-avatar] [--no-bottom]
```

| Flag | Default | Description |
|---|---|---|
| `--output <dir>` | auto-generated | Output folder path |
| `--record` | _(off)_ | Produce an MP4 using static images (fast; one screenshot per dialogue) |
| `--record-full` | _(off)_ | Produce an MP4 using full frame-by-frame recording (slow; more CPU) |
| `--segments` | _(off)_ | Also produce individual MP4 videos per section (requires `--record` or `--record-full`) |
| `--theme <id>` | `kakaotalk` | Chat theme to render |
| `--pause <ms>` | `3000` | Silence between messages that have no audio file |
| `--orientation <o>` | `vertical` | Frame orientation: `vertical` (9:16) or `horizontal` (16:9) |
| `--resolution <r>` | `1k` | Output resolution: `1k`, `2k`, or `4k` |
| `--color <c>` | `dark` | Color scheme applied across every theme: `light` or `dark` |
| `--no-avatar` | _(off)_ | Hide avatar circles and sender names |
| `--no-bottom` | _(off)_ | Hide the show-name band/label (shown by default) |

## Output Directory

When `--output` is omitted, files are written next to the input JSON, under its `output/` folder:

```
<input-json-dir>/output/<YYYYMMDD-HHmmss>-<json-name>/
  output.html      ← rendered chat page (always)
  output.mp4       ← final video (with --record or --record-full)
  first_bubble.png ← first message bubble frame (with --record or --record-full)
  last_bubble.png  ← last message bubble frame (with --record or --record-full)
  highlights/      ← highlight clip MP4s (when input JSON has highlights)
  manifest.json    ← run metadata and file list
```

Example: for `path/to/episode.json` → `path/to/output/20260414-143025-name/`

### Sample output

A full example render from [`fixtures/example1/episode.json`](./fixtures/example1/episode.json) is committed under [`fixtures/example1/output/`](./fixtures/example1/output/):

| File | Description |
|------|-------------|
| [`fixtures/example1/output/output.html`](./fixtures/example1/output/output.html) | Chat UI (open in a browser) |
| [`fixtures/example1/output/output.mp4`](./fixtures/example1/output/output.mp4) | Sample recording from `--record` (same episode) |
| [`fixtures/example1/output/first_bubble.png`](./fixtures/example1/output/first_bubble.png) | First message bubble frame from that recording |
| [`fixtures/example1/output/last_bubble.png`](./fixtures/example1/output/last_bubble.png) | Last message bubble frame from that recording |
| [`fixtures/example1/output/manifest.json`](./fixtures/example1/output/manifest.json) | Run metadata for that sample |

**Bubble still frames** (from the same sample `--record` run):

<img src="./fixtures/example1/output/first_bubble.png" alt="First chat bubble still frame from sample recording" width="400">

<img src="./fixtures/example1/output/last_bubble.png" alt="Last chat bubble still frame from sample recording" width="400">

**Video output** (recorded with `--record`, KakaoTalk theme):

<video src="https://raw.githubusercontent.com/doum1004/chat-in-video/main/fixtures/example1/output/output.mp4" controls muted playsinline width="400"></video>

**Hosted HTML preview** (layout and remote assets; no clone required):

[Open sample `output.html` →](https://htmlpreview.github.io/?https://raw.githubusercontent.com/doum1004/chat-in-video/main/fixtures/example1/output/output.html)

**Local preview** (best match to how the CLI writes files): clone the repo and open `fixtures/example1/output/output.html`, play `fixtures/example1/output/output.mp4`, or inspect `fixtures/example1/output/first_bubble.png` and `fixtures/example1/output/last_bubble.png`; or regenerate into that folder:

```bash
npx playchat fixtures/example1/episode.json --record --segments

npx playchat fixtures/example2/episode.json --record --segments

npx playchat fixtures/example1/episode.json --record --segments --theme kakaotalk --output fixtures/example1/kakaotalk

npx playchat fixtures/example1/episode.json --record --segments --theme imessage --output fixtures/example1/imeesage

npx playchat fixtures/example1/episode.json --record --segments --theme wechat --output fixtures/example1/wechat
```

### manifest.json

Every run writes a `manifest.json` to the output folder:

```json
{
  "input": "/absolute/path/to/episode.json",
  "theme": "kakaotalk",
  "pauseMs": 3000,
  "showAvatar": true,
  "showBottomBand": true,
  "createdAt": "2026-04-14T20:57:14.123Z",
  "files": {
    "html": "output.html",
    "mp4": "output.mp4",
    "firstBubblePng": "first_bubble.png",
    "lastBubblePng": "last_bubble.png",
    "highlights": [
      {
        "title": "Highlight title",
        "description": "Highlight description",
        "tags": ["tag1", "tag2"],
        "mp4": "highlights/highlight_1_title.mp4"
      }
    ]
  },
  "dialogueCount": 5
}
```

`files.mp4`, `files.firstBubblePng`, and `files.lastBubblePng` are only present when `--record` or `--record-full` was used. `files.highlights` is only present when the input JSON contains a `highlights` array. All file paths are relative to the output folder.

## Available Themes

By default all themes render at a **9:16** aspect ratio (`--orientation vertical`),
exporting to **1080×1920 (Full HD)** at `1k` resolution (540×960 logical viewport
captured at 2× scale).

| Theme | ID | Default output |
|---|---|---|
| KakaoTalk | `kakaotalk` | 1080×1920 (9:16) |
| iMessage | `imessage` | 1080×1920 (9:16) |
| WeChat | `wechat` | 1080×1920 (9:16) |

The first host in `episode.hosts` is treated as "me" and renders on the right
side; all other hosts render on the left. By default every message shows an
avatar circle and sender name. Pass `--no-avatar` to hide them.

## Orientation

Use `--orientation` to choose the frame shape:

- **`vertical`** (default) — a portrait **9:16** frame for Shorts/Reels/TikTok.
- **`horizontal`** — a landscape **16:9** frame. The chat stays in a portrait
  strip on the **left** (about 45% of the width, the same narrow ratio as
  vertical), and the **right** pane displays a large image/video.

### Right pane (horizontal only)

In horizontal mode the right pane shows media that follows the currently active
scope, falling back down the hierarchy:

**dialogue image → section image → episode image**

Each media item's lifecycle follows its parent: a dialogue image is shown only
while that dialogue is active and reverts to the section image when the dialogue
ends; the section image reverts to the episode image when the section changes.
A `.mp4`/`.webm`/`.mov` source is played as a looping muted video instead of an
image. In horizontal mode the inline chat-bubble thumbnail is suppressed since
the image is shown large on the right.

Set the images with `episode.image`, `sections[].image`, and `dialogues[].image`
(see [Episode JSON Format](#episode-json-format)).

## Resolution

`--resolution` scales the exported video while keeping the aspect ratio:

| Value | Long side | Vertical (9:16) | Horizontal (16:9) |
|---|---|---|---|
| `1k` (default) | 1920 | 1080×1920 | 1920×1080 |
| `2k` | 2560 | 1440×2560 | 2560×1440 |
| `4k` | 3840 | 2160×3840 | 3840×2160 |

## Show-name band / label

The episode's `name` field is displayed as branding, positioned to stay clear of
platform overlay UI:

- **Vertical** — a band is reserved at the **bottom** of the frame (12% of the
  video height) and filled with the `name`, centered. This pushes the chat
  content up out of the zone where YouTube Shorts / TikTok overlay their caption,
  username, and action buttons.
- **Horizontal** — the `name` moves to a pill label in the **top-right** corner
  overlaid on the right media pane, keeping the left chat strip clean.

It is shown by default, omitted automatically when the episode JSON has no
`name`, and can be disabled explicitly with `--no-bottom`.

## Episode JSON Format

```json
{
  "name": "...",
  "episode_title": "...",
  "episode_number": 1,
  "topic": "...",
  "subtitle": "...",
  "summary": "...",
  "image": "https://cdn.example.com/episode.jpg",
  "hosts": [
    {
      "id": "host_1",
      "name": "Minsu",
      "image": "https://cdn.example.com/avatar_minsu.png",
      "gender": "male",
      "role": "main_host",
      "lang": "ko",
      "voice_config": { "voice_index": 0, "pitch": 0, "speed": 1.0 }
    }
  ],
  "sections": [
    {
      "section_id": 1,
      "section_title": "Opening",
      "section_type": "opening",
      "corner_name": "Opening 🎙️",
      "image": "https://cdn.example.com/section1.jpg",
      "dialogues": [
        {
          "id": 1,
          "speaker": "host_1",
          "name": "Minsu",
          "text": "Hello!",
          "audio": "path/to/segment_0000.mp3",
          "image": "https://cdn.example.com/dialogue1.jpg"
        }
      ]
    }
  ],
  "highlights": [
    {
      "ids": [1, 2, 3],
      "title": "Highlight title",
      "description": "What makes this moment interesting",
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

`hosts[i].image` is optional. When present, the value is used as the avatar
image in chat themes; when omitted or if loading fails, the theme falls back to
the host's initial letter.

The top-level `image`, `sections[].image`, and `dialogues[].image` fields are
optional and only used in `--orientation horizontal` mode, where they populate
the right media pane (dialogue image \u2192 section image \u2192 episode image). Each
accepts a local path or a remote URL, and may point at an image or a video
(`.mp4`/`.webm`/`.mov`).

### Highlights (optional)

The top-level `highlights` array is optional. Each entry references dialogue IDs
(`ids`) that form a highlight clip. When recording (`--record` or `--record-full`),
the CLI automatically cuts an MP4 clip for each highlight and writes them to a
`highlights/` subdirectory. No extra flag is needed.

### Audio paths

The `audio` field on each dialogue accepts:

| Value | Behaviour |
|---|---|
| `""` (empty) | Message shown for `--pause` ms, then next message |
| `path/to/file.mp3` | Relative or absolute local path |
| `C:\absolute\path.mp3` | Windows absolute path |
| `https://cdn.example.com/a.mp3` | Remote URL (HTML preview only; not muxed into MP4) |

Local paths are resolved relative to the working directory and automatically
converted to `file:///` URIs in the rendered HTML.

## How Recording Works

```
episode.json
    │
    ├─ flattenDialogues()        normalise audio paths
    │
    ├─ buildTimeline()           ffprobe each audio file for exact duration
    │    showAtMs[0] = 0
    │    showAtMs[1] = dur[0] + 400ms gap
    │    showAtMs[N] = sum of previous (duration + gap), or pauseMs for no-audio
    │
    ├─ Puppeteer (scrubber mode)
    │    window.__TIMELINE__ injected before page load
    │    for each frame:
    │      page.evaluate("__SCRUB__(frameTimeMs)")  ← recorder is the clock
    │      page.screenshot()                        ← zero timing drift
    │
    ├─ ffmpeg: frames → silent MP4
    │
    ├─ buildAudioTrack()
    │    ffmpeg concat: [silence][clip0][silence][clip1]...
    │    gaps match the timeline exactly
    │
    └─ ffmpeg: mux silent MP4 + audio track → output.mp4
```

The browser never uses its own clock during recording. The recorder calls
`window.__SCRUB__(ms)` before every frame, passing the exact video timestamp
that frame represents. The browser renders whatever messages are due by that
time and no more — guaranteeing frame-perfect chat/audio sync regardless of
screenshot overhead.

The HTML file uses the normal live-audio mode for browser preview: audio
plays via `new Audio()` and the next message appears when `onended` fires.

## Docker

**Production (installs from npm):**
```bash
docker build -t playchat .
docker run --rm -v $(pwd)/input:/work/input -v $(pwd)/output:/work/output playchat \
  playchat input/episode.json
docker run --rm -v $(pwd)/input:/work/input -v $(pwd)/output:/work/output playchat \
  playchat input/episode.json --record --theme kakaotalk
```

## Development

### Project Structure

```
├── cli.ts               # CLI entry point (HTML preview + optional MP4 recording)
├── core/
│   ├── types.ts         # Interfaces, flattenDialogues(), normalizeAudioPath()
│   └── output.ts        # resolveOutputDir() — structured output folders
├── themes/
│   ├── base.ts          # Abstract BaseTheme (engine script, scrubber mode)
│   ├── kakaotalk.ts     # KakaoTalk theme
│   ├── imessage.ts      # iMessage theme
│   └── index.ts         # Theme registry + getTheme()
├── tests/
│   ├── flatten.test.ts  # Data layer + audio normalisation tests
│   ├── output.test.ts   # Output directory tests
│   └── themes.test.ts   # Theme contract + pauseMs tests
└── fixtures/example1/
    ├── episode.json       # Full sample episode with real audio paths
    ├── episode_short.json # Shorter fixture for quick testing
    └── preview/            # Sample CLI output for README preview
        ├── output.html
        ├── output.mp4     # sample --record output (tracked despite root *.mp4)
        ├── first_bubble.png
        ├── last_bubble.png
        └── manifest.json
```

### Setup

```bash
git clone https://github.com/doum1004/playchat.git
cd chat-in-video
npm install
```

### Running from source

```bash
npx ts-node cli.ts episode.json --record
```

This runs the TypeScript source directly, so no build step is needed — your
latest edits are picked up on every run.

### Testing the `playchat` command locally

By default `npx playchat` runs the **published npm package**, not your local
changes. To make the global `playchat` command resolve to your local build,
link it once:

```bash
npm run build   # compiles TypeScript to dist/ (the bin is dist/cli.js)
npm link        # symlinks the global `playchat` command to this checkout
```

After linking, `playchat ...` uses your local code. Because the `bin` points at
the compiled `dist/cli.js`, **re-run `npm run build` after each source change**
for the linked command to reflect it. To remove the link later:

```bash
npm unlink -g playchat
```

### Testing

```bash
npm test
```

### Adding a New Theme

1. Create `themes/yourtheme.ts`:

```typescript
import { BaseTheme, ThemeConfig } from "./base";

export class YourTheme extends BaseTheme {
  get id()       { return "yourtheme"; }
  get label()    { return "Your Theme"; }
  get viewport(): ThemeConfig { return { width: 440, height: 600 }; }

  render() { return this.wrapHTML(this.css, this.html, this.js); }

  private get css(): string { return `/* styles */`; }

  private get html(): string {
    return `
<div class="device">
  <div id="chat-body"></div>
</div>`;
  }

  private get js(): string {
    return `
const body = document.getElementById('chat-body');
function appendMsg(d) {
  // create and append one chat bubble for dialogue d
}
${this.engineScript}`;
  }
}
```

2. Register in `themes/index.ts`:

```typescript
import { YourTheme } from "./yourtheme";

const registry = {
  kakaotalk: KakaoTalkTheme,
  imessage:  IMessageTheme,
  yourtheme: YourTheme,        // ← add here
};
```

3. Use it:

```bash
npx playchat episode.json --theme yourtheme
npx playchat episode.json --theme yourtheme --record
```

### Theme contract

Every theme must satisfy three requirements in its JS block:

| Requirement | Why |
|---|---|
| Element `id="chat-body"` in HTML | Engine appends bubbles here |
| Function `appendMsg(d)` | Called once per dialogue — render one bubble |
| `${this.engineScript}` at the end of JS | Injects playback engine + scrubber mode |

`appendMsg(d)` receives a `FlatDialogue` object:

```typescript
{
  speaker:  string;  // "host_1", "host_2", ...
  name:     string;  // display name
  text:     string;  // message content
  audio:    string;  // file:/// URI or https:// URL (empty if none)
  audioRaw: string;  // original value from JSON
  section:  string;  // corner_name of the containing section
}
```

## License

MIT
