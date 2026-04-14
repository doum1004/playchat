# PlayChat

Converts a podcast episode JSON file into a themed chat-UI video (MP4). Audio
clips are sequenced by their measured durations and the final video is
frame-perfectly synced with the audio track.

## Architecture

```
├── generate.ts          # CLI: JSON → themed HTML
├── record-device.ts     # CLI: JSON → MP4 (Puppeteer + ffmpeg)
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
└── fixtures/
    ├── episode.json     # Sample episode with real audio paths
    └── segment_000*.mp3 # Sample audio clips
```

## Requirements

- Node.js 18+
- ffmpeg + ffprobe in PATH

## Quick Start

```bash
npm install

# HTML preview (default theme: kakaotalk, files go to output/<timestamp>-<name>/)
npx ts-node generate.ts fixtures/episode.json

# Explicit output path
npx ts-node generate.ts fixtures/episode.json out.html --theme imessage

# Record to MP4 (output goes to output/<timestamp>-<name>/)
npx ts-node record-device.ts fixtures/episode.json

# Record with explicit path and custom pause
npx ts-node record-device.ts fixtures/episode.json out.mp4 --theme kakaotalk --pause 4000
```

## CLI Options

Both `generate.ts` and `record-device.ts` accept the same flags:

| Flag | Default | Description |
|---|---|---|
| `--theme <id>` | `kakaotalk` | Chat theme to render |
| `--pause <ms>` | `3000` | Silence between messages that have no audio file |

## Output Directory

When no explicit output path is given, files are written to:

```
output/<YYYYMMDD-HHmmss>-<json-basename>/
  output.html   ← rendered chat page
  output.mp4    ← final video (recorder only)
```

Example: `output/20260414-143025-episode/`

## Available Themes

| Theme | ID | Viewport |
|---|---|---|
| KakaoTalk | `kakaotalk` | 400×580 |
| iMessage | `imessage` | 400×580 |

## Episode JSON Format

```json
{
  "episode_title": "...",
  "episode_number": 1,
  "topic": "...",
  "subtitle": "...",
  "summary": "...",
  "duration_estimate": "8분",
  "hosts": [
    {
      "id": "host_1",
      "name": "민수",
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
      "corner_name": "오프닝 🎙️",
      "dialogues": [
        {
          "id": 1,
          "speaker": "host_1",
          "name": "민수",
          "text": "안녕하세요!",
          "audio": "path/to/segment_0000.mp3"
        }
      ]
    }
  ]
}
```

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

The HTML file (from `generate.ts`) uses the normal live-audio mode for
browser preview: audio plays via `new Audio()` and the next message appears
when `onended` fires.

## How to Add a New Theme

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
npx ts-node generate.ts episode.json --theme yourtheme
npx ts-node record-device.ts episode.json --theme yourtheme
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

## Testing

```bash
npm test
```

52 tests across three suites:
- `flatten.test.ts` — data interfaces, audio path normalisation
- `output.test.ts` — output directory naming and creation
- `themes.test.ts` — theme contract, `pauseMs` propagation
