#!/usr/bin/env bash
# 1-Click Resizer — cài đặt 1 lệnh (macOS).
# Chạy từ trong thư mục repo đã clone:  ./install.sh
# Chạy lại bao nhiêu lần cũng an toàn (idempotent).
set -euo pipefail

if [ "$(uname)" != "Darwin" ]; then
  echo "❌ Script này chỉ hỗ trợ macOS."
  exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="com.oneclickresize.panel"
EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"

if [ ! -d "$REPO_DIR/$BUNDLE" ]; then
  echo "❌ Không tìm thấy $BUNDLE cạnh install.sh — hãy chạy script từ thư mục repo đã clone."
  exit 1
fi

echo "→ Bật chế độ cho phép panel chưa ký (PlayerDebugMode)…"
for v in 9 10 11 12; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo "→ Liên kết panel vào Premiere…"
mkdir -p "$EXT_DIR"
ln -sfn "$REPO_DIR/$BUNDLE" "$EXT_DIR/$BUNDLE"

echo ""
echo "✅ Cài đặt xong!"
echo "   1. Thoát hẳn Premiere (Cmd+Q) rồi mở lại."
echo "   2. Mở panel: Window → Extensions → 1-Click Resizer"
echo ""
echo "Từ nay về sau: có bản mới, panel tự hiện nút '↑ Cập nhật' — không cần cài lại."
