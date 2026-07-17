# 1-Click Resizer — Premiere Pro Panel

**Repo:** https://github.com/tungnguyen1202/1-click-resizer (private)


A CEP panel that turns the active sequence into the other two aspect ratios of
**{9:16, 4:5, 1:1}** with one click: it duplicates the sequence, changes the
frame size, renames it, fills the background, and keeps overlays inside the
Reels safe zone.

## What one click does

From the active sequence, **RESIZE** creates the two remaining ratios as new
sequences (e.g. from 9:16 → `… 4-5` and `… 1-1`):

- **Duplicate** the sequence (the original is never modified).
- **Frame size** set to the target (all 1080 wide: 9:16 = 1080×1920, 4:5 =
  1080×1350, 1:1 = 1080×1080). Frame rate preserved.
- **Rename**: original name, trailing ratio label swapped, new label appended
  with a space — `MyClip 9-16` → `MyClip 4-5`.
- **Background** (clips on the background track, default V1, that aren't
  graphics): scaled up to keep covering **only when the target is taller**
  (e.g. 1:1 → 9:16). Going to a shorter frame needs no change.
- **Overlays** (everything else): left as-is, except when the target is 9:16
  they are clamped into the **Reels safe zone** so text/graphics don't fall in
  the top/bottom UI areas.
- **Audio** is never touched.

## Publishing a new version (maintainer only)

After changing the code, run one command from the repo root:

```bash
./publish.sh                    # bump patch (1.0.0 → 1.0.1), auto message
./publish.sh 1.1.0              # set an explicit version
./publish.sh "fixed the rename" # bump patch + custom message
```

It bumps `version.json`, syncs the version into the manifest and the panel's
version label, commits everything, and pushes to GitHub. Every teammate's panel
then offers the update on next open.

## Status indicators

- **ENGINE OK / ENGINE ERR** (header pill): whether the panel can talk to
  Premiere's script engine. Red means the jsx layer isn't responding —
  close and reopen the panel.
- **SEQUENCE OPEN / NO SEQUENCE** (header pill): whether a sequence is active.
- **READY / BUSY** (footer light): idle vs. a resize currently running.

## Settings (⚙)

- **Track nền (V…)** — which video track is the background (default 1 = V1).
- **Safe zone** — a visual 9:16 editor: drag the green band's top/bottom edges
  (or type the margin %), or use **Chuẩn Reels** (14% / 35%). Only used when the
  target is 9:16.
- **AUTO** (badge next to ⟳) is realtime detection: the panel polls Premiere
  every 1.5s and updates the source info the moment you switch sequences.
  Click it to toggle off (persisted); the **⟳ Refresh** button always works
  as the manual path.

## Install (macOS) — for teammates

**Bước 0 (một lần, cần maintainer):** repo này **private** — nhờ maintainer
(tung.thanhnguyen@crossian.com) mời tài khoản GitHub của bạn làm collaborator,
rồi bấm chấp nhận lời mời trong email.

**Bước 1 — đăng nhập GitHub** (một lần):
```bash
brew install gh && gh auth login
```
Chọn: **GitHub.com → HTTPS → Login with a web browser**. (Chưa có Homebrew?
Cài từ https://brew.sh, hoặc tải gh installer tại https://cli.github.com.)

**Bước 2 — tải về và cài (dán nguyên khối):**
```bash
gh repo clone tungnguyen1202/1-click-resizer "$HOME/Dev/1-click-resizer" && "$HOME/Dev/1-click-resizer/install.sh"
```
`install.sh` tự bật PlayerDebugMode và liên kết panel vào Premiere.

**Bước 3:** Thoát hẳn Premiere (Cmd+Q) → mở lại → **Window → Extensions →
1-Click Resizer**. Xong — từ đây mọi bản mới sẽ tự hiện nút **↑ Cập nhật**
ngay trong panel.

<details>
<summary>Cài tay (không dùng install.sh)</summary>

```bash
defaults write com.adobe.CSXS.9 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
mkdir -p "$HOME/Library/Application Support/Adobe/CEP/extensions"
ln -sfn "$HOME/Dev/1-click-resizer/com.oneclickresize.panel" \
  "$HOME/Library/Application Support/Adobe/CEP/extensions/com.oneclickresize.panel"
```
</details>

## Updating (get the latest version)

**Easiest — in the panel (realtime):** the panel watches for updates while open:
- a new release on GitHub → green bar **"Có bản mới vX · ↑ Cập nhật"** appears
  within ~5 minutes (or instantly on open). Click → pulls and reloads itself.
- files already updated on disk (you ran `git pull` yourself, or you're the
  maintainer who just published) → bar **"Đã có vX trên máy · ⟳ Tải lại"**
  appears within ~20 seconds. Click → just reloads.

(Requires the clone + symlink install above and access to the repo. If it can't
reach the repo it simply won't show the bar.)

**Manual fallback:**
```bash
cd "$HOME/Dev/1-click-resizer" && git pull
```
Then reload the panel (close/reopen, or restart Premiere).

> Note: the extension folder is named `com.oneclickresize.panel` (its internal
> bundle id — kept stable so existing installs don't break). The product's
> display name is **1-Click Resizer**.

## Acceptance checklist

Primary (9:16 → 4:5 & 1:1):
- [ ] Two new sequences appear, correctly named and sized (1080×1350, 1080×1080).
- [ ] Overlays keep their relative position; background fills width (top/bottom cropped).
- [ ] Source sequence unchanged; audio untouched.

Taller (1:1 or 4:5 → 9:16):
- [ ] Background scales up to fill the 9:16 frame.
- [ ] Text/graphics land inside the safe zone (tune margins in Settings to match your template).

General:
- [ ] Re-running on an already-labelled sequence swaps the label (no `… 9-16 4-5`).
- [ ] ⟳ Refresh re-detects the ratio after switching sequences.

## Known limitations (v1)

- Background is identified by track (bottom track by default), not by content —
  a full-frame element on an upper track won't be scaled up on a taller frame.
- Overlay placement is a safe-zone **clamp**, not precise per-element layout:
  Premiere's scripting API exposes neither a stable per-element identity across
  projects nor element sizes, so automatic "put each text/logo exactly here"
  isn't reliable. Fine positioning stays manual.
- Only the fixed **Motion** effect is adjusted (not a separate Transform effect).
- Width-constant 1080 ratios only.
- A graphic placed **on the background track** is neither scaled nor safe-zone
  clamped (the background track is treated as background only). Keep graphics on
  upper tracks.
- If a duplicate fails partway (e.g. Premiere rejects the frame-size change on an
  unusual sequence), the stray half-configured sequence is left in the project
  and reported as an error row; the source is never affected — just delete the
  stray one.

## Project layout

```
com.oneclickresize.panel/
  CSXS/manifest.xml     extension manifest
  .debug                unsigned-debug config
  index.html            panel markup
  css/style.css         dark neon theme
  js/CSInterface.js     Adobe bridge (vendored)
  js/main.js            panel controller (no business logic)
  js/updater.js         in-panel auto-update (git fetch/pull; needs clone+symlink install)
  jsx/resize-core.jsx   pure logic (ratio, naming, fillScale, clampToSafe) — Node-tested
  jsx/premiere.jsx      Premiere DOM layer (#includes resize-core)
```

Pure logic has automated tests: from the project root, run `npm test`.
