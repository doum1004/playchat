export interface VoiceConfig {
  voice_index: number;
  pitch: number;
  speed: number;
}

export interface Host {
  id: string;
  name: string;
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
  topic: string;
  subtitle: string;
  summary: string;
  duration_estimate: string;
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
}

/**
 * Convert an audio path into a browser-usable URI.
 *  - empty/falsy  -> ""
 *  - http(s) URL  -> passthrough
 *  - local path   -> file:/// URI with resolved absolute path
 */
export function normalizeAudioPath(audioPath: string): string {
  if (!audioPath) return "";
  if (/^https?:\/\//i.test(audioPath)) return audioPath;

  const resolved = require("path").resolve(audioPath);
  const normalized = resolved.replace(/\\/g, "/");
  return `file:///${normalized.replace(/^\/+/, "")}`;
}

export function flattenDialogues(episode: PodcastEpisode): FlatDialogue[] {
  const result: FlatDialogue[] = [];
  for (const section of episode.sections) {
    for (const d of section.dialogues) {
      result.push({
        speaker: d.speaker,
        name: d.name,
        text: d.text,
        audio: normalizeAudioPath(d.audio),
        audioRaw: d.audio,
        section: section.corner_name,
      });
    }
  }
  return result;
}
