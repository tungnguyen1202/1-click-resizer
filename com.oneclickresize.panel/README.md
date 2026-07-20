# 1-Click Resizer — Premiere Pro Panel

**Repo:** https://github.com/tungnguyen1202/1-click-resizer (public)


A CEP panel that turns the active sequence into the other two aspect ratios of
**{9:16, 4:5, 1:1}** with one click: it duplicates the sequence, changes the
frame size, renames it, fills the background, and places text/graphics/logos
using your per-ratio guides.

## Choosing which sequence

The panel resizes **the sequence selected in the Project panel** (just click it —
no need to open it). If nothing is selected, it falls back to the sequence
currently open in the timeline. The source block shows which one it's using
(`SEQUENCE ĐÃ CHỌN` vs `SEQUENCE ĐANG MỞ`).

## What one click does

From the source sequence, **RESIZE** creates the two remaining ratios as new
sequences (e.g. from 9:16 → `… 4x5` and `… 1x1`):

- **Duplicate** the sequence (the original is never modified).
- **Frame size** set to the target (all 1080 wide: 9:16 = 1080×1920, 4:5 =
  1080×1350, 1:1 = 1080×1080). Frame rate preserved.
- **Rename**: original name, trailing ratio label swapped, new label appended
  with a space — `MyClip 9x16` → `MyClip 4x5`.
- **Background** (clips on the background track, default V1, that aren't
  graphics): scaled up to keep covering **only when the target is taller**
  (e.g. 1:1 → 9:16). Going to a shorter frame needs no change.
- **Text / graphic / MOGRT**: scale kept; vertical position set to the target
  ratio's guide line (Settings; default centre), horizontal position kept.
- **Logo** (clip name contains "Logo"): scale kept; held at least the configured
  px margin inside all four edges (only moved if it's closer than that).
- **Other overlays**: left as-is.
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
- **Text position (guide per ratio)** — a visual editor: switch the 9:16 / 4:5 /
  1:1 tab (the preview reshapes to that ratio) and drag the green line to set
  where text/graphics/MOGRT sit vertically for that ratio (default centre).
  Their scale is never changed; horizontal position is kept.
- **Logo — edge margin (px)** — clips whose name contains "Logo" keep their
  scale and are held at least this many px inside every edge (all ratios).
- **AUTO** (badge next to ⟳) is realtime detection: the panel polls Premiere
  ~every 0.3s and updates the source info the moment you switch sequences.
  Click it to toggle off (persisted); the **⟳ Refresh** button always works
  as the manual path.

## Install (macOS) — for teammates

### Cách 1 — Bộ cài 1 click (dễ nhất, không cần Terminal)

1. Tải về: **https://github.com/tungnguyen1202/1-click-resizer/releases/latest/download/1-Click-Resizer-Installer.zip**
2. Giải nén → **chuột phải** vào **"Cài đặt 1-Click Resizer"** → **Open** → **Open**
   *(lần đầu macOS cảnh báo vì app chưa ký — chuột phải → Open là cách mở)*
3. Thấy hộp thoại ✅ → thoát hẳn Premiere (Cmd+Q) → mở lại →
   **Window → Extensions → 1-Click Resizer**

Xong. Từ đây mọi bản mới sẽ tự hiện nút **↑ Cập nhật** ngay trong panel —
không bao giờ phải cài lại. (Auto-update cần `git` — máy đã cài Xcode Command
Line Tools là có sẵn; nếu chưa có, panel vẫn chạy bình thường, chỉ không tự
cập nhật.)

<details>
<summary>Cách 2 — Cài bằng git (cho dev)</summary>

```bash
git clone https://github.com/tungnguyen1202/1-click-resizer.git "$HOME/Dev/1-click-resizer" && "$HOME/Dev/1-click-resizer/install.sh"
```
Rồi thoát hẳn Premiere và mở lại.
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
- [ ] Text/graphics sit on the guide line; logos pinned to their edge (tune in Settings).

General:
- [ ] Re-running on an already-labelled sequence swaps the label (no `… 9x16 4x5`).
- [ ] ⟳ Refresh re-detects the ratio after switching sequences.

## Known limitations (v1)

- Background is identified by track (bottom track by default), not by content —
  a full-frame element on an upper track won't be scaled up on a taller frame.
- Text/logo placement sets the clip's **Motion Position anchor** only — Premiere's
  API gives no element size, and text positioned *inside* a MOGRT's own layout
  (Motion left at centre) won't move. Fine positioning may still need a manual touch.
- Only the fixed **Motion** effect is adjusted (not a separate Transform effect).
- Width-constant 1080 ratios only.
- A graphic placed **on the background track** is treated as background (filled),
  not repositioned. Keep graphics/logos on upper tracks.
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
  jsx/resize-core.jsx   pure logic (ratio, naming, fillScale, insetClamp) — Node-tested
  jsx/premiere.jsx      Premiere DOM layer (#includes resize-core)
```

Pure logic has automated tests: from the project root, run `npm test`.
