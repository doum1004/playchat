import { FlatDialogue, Host, PodcastEpisode, normalizeAudioPath } from "./types";

function isRemoteHttpUrl(value?: string): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

export function collectRemoteImageUrls(
  dialogues: Pick<FlatDialogue, "imageRaw" | "sectionImageRaw">[],
  hosts: Pick<Host, "image">[],
  episodeImage?: string
): string[] {
  return [
    ...new Set([
      ...dialogues
        .map((d) => d.imageRaw)
        .filter((raw): raw is string => isRemoteHttpUrl(raw)),
      ...dialogues
        .map((d) => d.sectionImageRaw)
        .filter((raw): raw is string => isRemoteHttpUrl(raw)),
      ...hosts
        .map((h) => h.image)
        .filter((raw): raw is string => isRemoteHttpUrl(raw)),
      ...(isRemoteHttpUrl(episodeImage) ? [episodeImage] : []),
    ]),
  ];
}

export function applyCachedImageUris(
  dialogues: FlatDialogue[],
  hosts: Host[],
  remoteImageMap: Map<string, string>,
  episode?: Pick<PodcastEpisode, "image">
): void {
  for (const d of dialogues) {
    if (isRemoteHttpUrl(d.imageRaw)) {
      const local = remoteImageMap.get(d.imageRaw);
      if (local) d.image = normalizeAudioPath(local);
    }
    if (isRemoteHttpUrl(d.sectionImageRaw)) {
      const local = remoteImageMap.get(d.sectionImageRaw);
      if (local) d.sectionImage = normalizeAudioPath(local);
    }
  }

  for (const h of hosts) {
    if (!isRemoteHttpUrl(h.image)) continue;
    const local = remoteImageMap.get(h.image);
    if (local) h.image = normalizeAudioPath(local);
  }

  if (episode && isRemoteHttpUrl(episode.image)) {
    const local = remoteImageMap.get(episode.image);
    if (local) episode.image = normalizeAudioPath(local);
  }
}
