# Podcast Video Generator

Multi-theme podcast chat renderer. Converts episode JSON into themed HTML chat UIs, with optional Puppeteer-based video recording.

## Architecture

```
├── generate.ts          # CLI: reads JSON, picks theme, outputs HTML
├── record-device.ts     # Puppeteer recorder → MP4
├── core/
│   └── types.ts         # Shared interfaces + flattenDialogues()
├── themes/
│   ├── base.ts          # Abstract theme contract
│   ├── kakaotalk.ts     # KakaoTalk theme
│   ├── imessage.ts      # iMessage theme
│   └── index.ts         # Theme registry
├── tests/
│   ├── flatten.test.ts  # Data layer tests
│   └── themes.test.ts   # Theme contract tests
└── fixtures/
    └── episode.json     # Sample episode data
```

## Quick Start

```bash
npm install

# Generate HTML (default: kakaotalk)
npx ts-node generate.ts fixtures/episode.json output.html

# Pick a theme
npx ts-node generate.ts fixtures/episode.json output.html --theme imessage

# Record to MP4 (requires ffmpeg)
npx ts-node record-device.ts fixtures/episode.json output.mp4 --theme kakaotalk
```

## Available Themes

| Theme     | ID         | Viewport   |
|-----------|------------|------------|
| KakaoTalk | `kakaotalk`| 400×580    |
| iMessage  | `imessage` | 400×580    |

## How to Add a New Theme

1. **Create** `themes/yourtheme.ts`:

```typescript
import { BaseTheme, ThemeConfig } from "./base";

export class YourTheme extends BaseTheme {
  get id()       { return "yourtheme"; }
  get label()    { return "Your Theme"; }
  get viewport() { return { width: 440, height: 600 }; }

  render() { return this.wrapHTML(this.css, this.html, this.js); }

  private get css(): string { /* theme styles */ }
  private get html(): string { /* must contain id="chat-body" */ }
  private get js(): string {
    return `
const body = document.getElementById('chat-body');
function appendMsg(d) { /* render one message */ }
${this.engineScript}`;
  }
}
```

2. **Register** in `themes/index.ts`:

```typescript
import { YourTheme } from "./yourtheme";

const registry = {
  kakaotalk: KakaoTalkTheme,
  imessage:  IMessageTheme,
  yourtheme: YourTheme,       // ← add here
};
```

3. **Use it**:

```bash
npx ts-node generate.ts episode.json out.html --theme yourtheme
```

### Theme Contract

Every theme must provide:

| Requirement | Why |
|---|---|
| Element `id="chat-body"` | Engine appends messages here |
| Function `appendMsg(d)` | Engine calls this per dialogue |
| Variable `lastSection` | Engine tracks section dividers |
| Call `this.engineScript` at end of JS | Shared playback + autoplay logic |

## Testing

```bash
npm test
```

## Episode JSON Format

See `fixtures/episode.json` for the full schema. Key structure:

```json
{
  "episode_title": "...",
  "episode_number": 1,
  "hosts": [{ "id": "host_1", "name": "...", ... }],
  "sections": [{
    "corner_name": "Section Name",
    "dialogues": [{
      "speaker": "host_1",
      "name": "...",
      "text": "...",
      "audio": "path/to/audio.mp3"
    }]
  }]
}
```
