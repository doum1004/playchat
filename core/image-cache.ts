import { FlatDialogue, Host, normalizeAudioPath } from "./types";

function isRemoteHttpUrl(value?: string): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

export function collectRemoteImageUrls(
  dialogues: Pick<FlatDialogue, "imageRaw">[],
  hosts: Pick<Host, "image">[]
): string[] {
  return [
    ...new Set([
      ...dialogues
        .map((d) => d.imageRaw)
        .filter((raw): raw is string => isRemoteHttpUrl(raw)),
      ...hosts
        .map((h) => h.image)
        .filter((raw): raw is string => isRemoteHttpUrl(raw)),
    ]),
  ];
}

export function applyCachedImageUris(
  dialogues: FlatDialogue[],
  hosts: Host[],
  remoteImageMap: Map<string, string>
): void {
  for (const d of dialogues) {
    if (!isRemoteHttpUrl(d.imageRaw)) continue;
    const local = remoteImageMap.get(d.imageRaw);
    if (local) d.image = normalizeAudioPath(local);
  }

  for (const h of hosts) {
    if (!isRemoteHttpUrl(h.image)) continue;
    const local = remoteImageMap.get(h.image);
    if (local) h.image = normalizeAudioPath(local);
  }
}
