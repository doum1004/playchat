import * as fs from "fs";
import * as path from "path";
import { Host, PodcastEpisode } from "./types";

const AVATAR_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

/** Directory containing package.json (works for dist/core/*.js, dist/*.js, or ts-node source). */
export function packageRootDir(): string {
  let dir = path.resolve(__dirname);
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(__dirname, "..", "..");
    dir = parent;
  }
}

export function defaultSystemAvatarDir(): string {
  return path.join(packageRootDir(), "resources", "avartar");
}

function normalizeGender(g: string): "male" | "female" {
  const x = g.trim().toLowerCase();
  if (
    x === "female" ||
    x === "f" ||
    x === "woman" ||
    x === "w" ||
    x === "여" ||
    x === "여성"
  ) {
    return "female";
  }
  return "male";
}

function findAvatarFile(avatarDir: string, stem: string): string | null {
  for (const ext of AVATAR_EXTENSIONS) {
    const full = path.join(avatarDir, stem + ext);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * When `useSystemAvatar` is not false, set `host.image` to an on-disk path for
 * `host_male1` / `host_male2` / … and `host_female1` / … under avatarDir,
 * based on host order within each gender. Does not overwrite when
 * `useSystemAvatar === false` (episode-supplied `image` is kept).
 */
export function applySystemHostAvatars(
  episode: PodcastEpisode,
  avatarDir: string = defaultSystemAvatarDir()
): void {
  if (!fs.existsSync(avatarDir)) return;

  let maleIdx = 0;
  let femaleIdx = 0;

  for (const host of episode.hosts) {
    if (host.useSystemAvatar === false) continue;

    const g = normalizeGender(host.gender);
    const n = g === "female" ? ++femaleIdx : ++maleIdx;
    const stem = g === "female" ? `host_female${n}` : `host_male${n}`;
    const file = findAvatarFile(avatarDir, stem);
    if (file) {
      host.image = file;
    } else {
      console.warn(
        `Warning: system host avatar not found (${stem}.png|jpg|…) for ${host.id} under ${avatarDir}`
      );
    }
  }
}
