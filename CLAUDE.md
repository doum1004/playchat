# PlayChat project guide

PlayChat turns an episode JSON file into themed chat HTML and, when requested,
an MP4 recording. The CLI entry point is `cli.ts`.

## Local checks

- Build: `npm run build`
- Test: `npm test -- --runInBand`
- Run the local CLI after building: `node dist/cli.js <episode.json> --output <directory>`

## Dialogue rendering

- `core/types.ts` defines the episode JSON schema and flattens dialogues for rendering.
- `themes/base.ts` contains the shared playback engine and bubble content styling.
- `themes/kakaotalk.ts`, `themes/imessage.ts`, and `themes/wechat.ts` each render a bubble.
- `dialogues[].annotation` is optional plain text for a translation or note. Show
  `text` above a thin divider and `annotation` below it in the same bubble.
  Leave the divider out when the annotation is absent. Keep this behavior
  consistent across all three themes and both frame orientations.
- Escape dialogue text and annotations when inserting them into bubble HTML.

The translation fixture is `fixtures/example5/episode.json`. Its saved HTML
and screenshots cover all three themes. When changing visible dialogue output,
update the relevant fixture and README, then inspect the rendered bubbles.
