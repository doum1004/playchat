import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { applySystemHostAvatars } from "../core/system-avatar";
import { PodcastEpisode } from "../core/types";

function minimalEpisode(hosts: PodcastEpisode["hosts"]): PodcastEpisode {
  return {
    episode_title: "t",
    episode_number: 1,
    topic: "",
    subtitle: "",
    summary: "",
    hosts,
    sections: [],
  };
}

const voice = { voice_index: 0, pitch: 1, speed: 1 };

describe("applySystemHostAvatars", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "playchat-sys-av-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("maps first male and first female to host_male1 and host_female1", () => {
    fs.writeFileSync(path.join(tmp, "host_male1.png"), "x");
    fs.writeFileSync(path.join(tmp, "host_female1.png"), "y");
    const episode = minimalEpisode([
      { id: "a", name: "A", gender: "male", role: "", lang: "", voice_config: voice },
      { id: "b", name: "B", gender: "female", role: "", lang: "", voice_config: voice },
    ]);
    applySystemHostAvatars(episode, tmp);
    expect(episode.hosts[0].image).toBe(path.join(tmp, "host_male1.png"));
    expect(episode.hosts[1].image).toBe(path.join(tmp, "host_female1.png"));
  });

  it("increments per gender (second male uses host_male2)", () => {
    fs.writeFileSync(path.join(tmp, "host_male1.png"), "a");
    fs.writeFileSync(path.join(tmp, "host_male2.png"), "b");
    const episode = minimalEpisode([
      { id: "a", name: "A", gender: "male", role: "", lang: "", voice_config: voice },
      { id: "b", name: "B", gender: "male", role: "", lang: "", voice_config: voice },
    ]);
    applySystemHostAvatars(episode, tmp);
    expect(episode.hosts[0].image).toBe(path.join(tmp, "host_male1.png"));
    expect(episode.hosts[1].image).toBe(path.join(tmp, "host_male2.png"));
  });

  it("does not replace image when useSystemAvatar is false", () => {
    fs.writeFileSync(path.join(tmp, "host_male1.png"), "x");
    const episode = minimalEpisode([
      {
        id: "a",
        name: "A",
        gender: "male",
        role: "",
        lang: "",
        voice_config: voice,
        useSystemAvatar: false,
        image: "https://example.com/custom.png",
      },
    ]);
    applySystemHostAvatars(episode, tmp);
    expect(episode.hosts[0].image).toBe("https://example.com/custom.png");
  });

  it("no-op when avatar directory does not exist", () => {
    const missing = path.join(tmp, "nope");
    const episode = minimalEpisode([
      { id: "a", name: "A", gender: "male", role: "", lang: "", voice_config: voice },
    ]);
    applySystemHostAvatars(episode, missing);
    expect(episode.hosts[0].image).toBeUndefined();
  });
});
