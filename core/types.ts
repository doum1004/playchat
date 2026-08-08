export interface VoiceConfig {
  voice_index: number;
  pitch: number;
  speed: number;
}

export interface Host {
  id: string;
  name: string;
  image?: string;
  /**
   * When not `false`, assign a gender avatar from `resources/avartar`
   * (`host_male1`, … / `host_female1`, …) before any episode `image` is used.
   * Default: system avatars are used when files exist.
   */
  useSystemAvatar?: boolean;
  gender: string;
  role: string;
  lang: string;
  voice_config: VoiceConfig;
}

export interface Dialogue {
  id: number;
  speaker: string;
  name: string;
  text: string;
  audio: string;
  image?: string;
  /** Absolute time (seconds) in the episode audio where this dialogue starts */
  time_start?: number;
  /** Absolute time (seconds) in the episode audio where this dialogue ends */
  time_end?: number;
}

export interface Section {
  section_id: number;
  section_title: string;
  section_type: string;
  corner_name: string;
  /** Default image shown on the right pane (horizontal layout) for this section's dialogues. */
  image?: string;
  dialogues: Dialogue[];
}

/** Frame orientation for the rendered chat. Defaults to "vertical". */
export type Orientation = "vertical" | "horizontal";

/** Color scheme for the rendered chat. Defaults to "dark". */
export type ColorTheme = "light" | "dark";

export interface Highlight {
  ids: number[];
  title: string;
  description: string;
  tags: string[];
}

export interface PodcastEpisode {
  episode_title: string;
  episode_number: number;
  name?: string;
  topic: string;
  subtitle: string;
  summary: string;
  hosts: Host[];
  sections: Section[];
  /** Default image shown on the right pane (horizontal layout) when no dialogue or section image applies. */
  image?: string;
  /** Single audio file for the full episode (includes intro/outro music). */
  audio?: string;
  /** Optional curated highlight clips referencing dialogue IDs. */
  highlights?: Highlight[];
}

export interface EngineOptions {
  /** Delay in ms before advancing to next message when no audio (default 3000) */
  pauseMs: number;
  /** Whether to render avatar circles and sender names (default true) */
  showAvatar: boolean;
  /** Show the bottom branding band (show name) below the chat. Default true. */
  showBottomBand: boolean;
  /** Bottom band height as a ratio of total viewport height. Default 0.12. */
  bottomHeightRatio: number;
  /**
   * Frame orientation. "vertical" (default) renders the classic 9:16 chat.
   * "horizontal" renders a 16:9 frame with the chat on the left and an
   * image/video pane on the right.
   */
  orientation: Orientation;
  /**
   * Color scheme applied across every theme. "dark" (default) renders each
   * app's dark-mode palette; "light" renders the classic light appearance.
   */
  colorTheme: ColorTheme;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  pauseMs: 3000,
  showAvatar: true,
  showBottomBand: true,
  bottomHeightRatio: 0.12,
  orientation: "vertical",
  colorTheme: "dark",
};

export interface FlatDialogue {
  speaker: string;
  name: string;
  text: string;
  audio: string;
  /** Original audio value before normalization (local path, URL, or empty) */
  audioRaw: string;
  section: string;
  /** Duration of the audio clip in seconds (0 if no audio). Populated by CLI before rendering. */
  audioDurationSec: number;
  /** Normalized image URI (browser-usable). Empty string if no image. */
  image: string;
  /** Original image value before normalization (local path, URL, or empty) */
  imageRaw: string;
  /** Normalized section default image URI (browser-usable). Empty string if none. */
  sectionImage: string;
  /** Original section image value before normalization (local path, URL, or empty) */
  sectionImageRaw: string;
  /** Absolute start time in the episode audio (seconds). 0 if not set. */
  timeStartSec: number;
  /** Absolute end time in the episode audio (seconds). 0 if not set. */
  timeEndSec: number;
}

/**
 * Convert an audio path into a browser-usable URI.
 *  - empty/falsy  -> ""
 *  - http(s) URL  -> passthrough
 *  - local path   -> file:/// URI with resolved absolute path
 */
export function normalizeAudioPath(audioPath: string, baseDir?: string): string {
  if (!audioPath) return "";
  if (/^https?:\/\//i.test(audioPath)) return audioPath;
  if (/^file:\/\//i.test(audioPath)) return audioPath;

  const path = require("path") as typeof import("path");
  const resolved = baseDir ? path.resolve(baseDir, audioPath) : path.resolve(audioPath);
  const normalized = resolved.replace(/\\/g, "/");
  return `file:///${normalized.replace(/^\/+/, "")}`;
}

export function flattenDialogues(episode: PodcastEpisode, baseDir?: string): FlatDialogue[] {
  const result: FlatDialogue[] = [];
  for (const section of episode.sections) {
    const sectionImageRaw = section.image ?? "";
    for (const d of section.dialogues) {
      const imageRaw = d.image ?? "";
      result.push({
        speaker: d.speaker,
        name: d.name,
        text: d.text,
        audio: normalizeAudioPath(d.audio, baseDir),
        audioRaw: d.audio,
        section: section.corner_name,
        audioDurationSec: 0,
        image: normalizeAudioPath(imageRaw, baseDir),
        imageRaw,
        sectionImage: normalizeAudioPath(sectionImageRaw, baseDir),
        sectionImageRaw,
        timeStartSec: d.time_start ?? 0,
        timeEndSec: d.time_end ?? 0,
      });
    }
  }
  return result;
}
