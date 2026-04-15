# Changelog

<!-- New entries are prepended automatically by the publish workflow -->

## v1.0.1 — 2026-04-15

### Changes

- Update repository URLs in README and package.json to reflect correct project name (6f4eafe)
- Add bubble screenshot support: capture first and last message bubbles during recording and update manifest (1f3a5e8)
- Update README and add preview files: modify output directory naming and include sample output for better documentation (d877d57)
- Enhance inline script safety: escape special characters in dialogues to prevent parsing issues (f964ba6)
- Add support for host avatar images: implement image handling in dialogues and themes (5fb1f90)
- Enhance KakaoTalk theme styles: add text overflow handling and improve avatar alignment (602a0ce)
- Add image handling to dialogues: support image URLs and normalize paths for themes (7c25666)
- Update episode title rendering: prioritize episode title over name in theme displays (81034bb)
- Refactor output directory resolution: handle episode number and improve test assertions (a517039)
- Update output directory naming: include episode number and replace spaces with underscores (daac103)
- Add LICENSE file: include MIT License terms and conditions (46b703f)
- Add Docker support: create Dockerfile and update README with build and run instructions (40eeb99)
- Update README.md: enhance badge styles for better visibility and consistency (cab01a1)
- Add CI and publish workflows for automated testing and npm publishing (05a7788)
- Add CHANGELOG.md to document project updates and changes (dba8202)
- Refactor README.md: update installation instructions, enhance project structure section, and clarify CLI usage (765aa49)
- Enhance project structure: add .npmignore, update package.json for better CLI support, and improve TypeScript configuration. Add audio duration handling in dialogues and update KakaoTalk theme for dynamic timestamps. (52ecb27)
- Add static recording functionality and enhance scrubber mode initialization (cf45bc0)
- Fix scroll behavior for chat body in scrubber mode initialization (f1f6813)
- Fix dialogue IDs in episode JSON for consistency in "실전 영어 상황극" section (05bc94a)
- Update KakaoTalk theme: replace static date with dynamic date generation in chat body (73710b6)
- Update .gitignore and JSON structures: add input directory to ignore list, remove duration estimate from episode JSON, and enhance episode details with name field (3fa0a52)
- Refactor logging in recording and encoding process: remove redundant console outputs and streamline messages (f7eafcb)
- Enhance recording feedback: improve error handling during segment recording and add elapsed time logging in main process (102244c)
- Add episode JSON file for "Mastering 'How Come?'" podcast episode (91b93a0)
- Refactor CLI structure: consolidate entry points into cli.ts, update README, and enhance output directory handling (6b49f34)
- Update episode details and remove unused audio segments (9c06895)
- Enhance video generation features: add --no-avatar option, update README, and improve theme rendering logic (323e00a)
- Add audio caching and download functionality (ad9a37a)
- Refactor project structure and enhance functionality (9887137)
- Initial commit (c9fd803)


---

