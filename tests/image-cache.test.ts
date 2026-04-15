import { FlatDialogue, Host, normalizeAudioPath } from "../core/types";
import { collectRemoteImageUrls, applyCachedImageUris } from "../core/image-cache";

function makeHost(id: string, image?: string): Host {
  return {
    id,
    name: id,
    image,
    gender: "unknown",
    role: "host",
    lang: "en",
    voice_config: {
      voice_index: 0,
      pitch: 0,
      speed: 1,
    },
  };
}

function makeDialogue(id: number, imageRaw: string): FlatDialogue {
  return {
    speaker: "host_1",
    name: "Host",
    text: `text-${id}`,
    audio: "",
    audioRaw: "",
    section: "section",
    audioDurationSec: 0,
    image: imageRaw,
    imageRaw,
  };
}

describe("image cache helpers", () => {
  it("collects unique remote image URLs from dialogues and hosts", () => {
    const dialogues = [
      makeDialogue(1, "https://cdn.example.com/dialogue-1.png"),
      makeDialogue(2, ""),
      makeDialogue(3, "https://cdn.example.com/shared.png"),
    ];
    const hosts = [
      makeHost("host_1", "https://cdn.example.com/host-1.png"),
      makeHost("host_2", "https://cdn.example.com/shared.png"),
      makeHost("host_3"),
      makeHost("host_4", "file:///C:/local/avatar.png"),
    ];

    const urls = collectRemoteImageUrls(dialogues, hosts);

    expect(urls).toContain("https://cdn.example.com/dialogue-1.png");
    expect(urls).toContain("https://cdn.example.com/host-1.png");
    expect(urls).toContain("https://cdn.example.com/shared.png");
    expect(urls.length).toBe(3);
  });

  it("rewrites cached remote image URLs for dialogues and hosts", () => {
    const dialogueRemote = "https://cdn.example.com/dialogue.png";
    const hostRemote = "https://cdn.example.com/host.png";
    const notCachedRemote = "https://cdn.example.com/not-cached.png";

    const cachedDialogueLocal = "C:\\cache\\dialogue.png";
    const cachedHostLocal = "C:\\cache\\host.png";

    const dialogues = [
      makeDialogue(1, dialogueRemote),
      makeDialogue(2, notCachedRemote),
      makeDialogue(3, ""),
    ];
    const hosts = [
      makeHost("host_1", hostRemote),
      makeHost("host_2", notCachedRemote),
      makeHost("host_3"),
    ];

    const map = new Map<string, string>([
      [dialogueRemote, cachedDialogueLocal],
      [hostRemote, cachedHostLocal],
    ]);

    applyCachedImageUris(dialogues, hosts, map);

    expect(dialogues[0].image).toBe(normalizeAudioPath(cachedDialogueLocal));
    expect(dialogues[1].image).toBe(notCachedRemote);
    expect(dialogues[2].image).toBe("");

    expect(hosts[0].image).toBe(normalizeAudioPath(cachedHostLocal));
    expect(hosts[1].image).toBe(notCachedRemote);
    expect(hosts[2].image).toBeUndefined();
  });
});
