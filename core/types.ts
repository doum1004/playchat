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
}

export interface Section {
  section_id: number;
  section_title: string;
  section_type: string;
  corner_name: string;
  dialogues: Dialogue[];
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
}

export interface EngineOptions {
  /** Delay in ms before advancing to next message when no audio (default 3000) */
  pauseMs: number;
  /** Whether to render avatar circles and sender names (default true) */
  showAvatar: boolean;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  pauseMs: 3000,
  showAvatar: true,
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
      });
    }
  }
  return result;
}
