import { BaseTheme } from "./base";
import { KakaoTalkTheme } from "./kakaotalk";
import { IMessageTheme } from "./imessage";

import { PodcastEpisode, FlatDialogue, EngineOptions } from "../core/types";

type ThemeConstructor = new (
  episode: PodcastEpisode,
  dialogues: FlatDialogue[],
  options?: Partial<EngineOptions>
) => BaseTheme;

const registry: Record<string, ThemeConstructor> = {
  kakaotalk: KakaoTalkTheme,
  imessage: IMessageTheme,
};

export function getTheme(
  themeId: string,
  episode: PodcastEpisode,
  dialogues: FlatDialogue[],
  options?: Partial<EngineOptions>
): BaseTheme {
  const Ctor = registry[themeId];
  if (!Ctor) {
    const available = Object.keys(registry).join(", ");
    throw new Error(`Unknown theme "${themeId}". Available: ${available}`);
  }
  return new Ctor(episode, dialogues, options);
}

export function listThemes(): string[] {
  return Object.keys(registry);
}
