#!/usr/bin/env bash
# 在已安装 Xcode.app 的 Mac 上生成「模拟器用」Release .app（可拖到模拟器或 simctl 安装）。
# 真机 .ipa 需 Apple 开发者账号与签名，请用 Xcode：Open ios/HFUTUnion.xcworkspace → Product → Archive → Distribute。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG="${LANG:-en_US.UTF-8}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [[ ! -d "$ROOT/node_modules/react-native" ]]; then
  echo "请先执行: cd \"$(basename "$ROOT")\" && npm install"
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "未找到 pod，请执行: brew install cocoapods"
  exit 1
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "需要完整 Xcode（不能只有 Command Line Tools）。请安装 Xcode 后执行:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
fi

cd "$ROOT/ios"
pod install

DERIVED="$ROOT/ios/build/DerivedData"
OUT_DIR="$ROOT/dist/ios"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

xcodebuild \
  -workspace HFUTUnion.xcworkspace \
  -scheme HFUTUnion \
  -configuration Release \
  -sdk iphonesimulator \
  -derivedDataPath "$DERIVED" \
  -destination 'generic/platform=iOS Simulator' \
  ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO \
  build

APP="$(find "$DERIVED" -name 'HFUTUnion.app' -type d -path '*/Release-iphonesimulator/*' | head -1)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  APP="$(find "$DERIVED" -name 'HFUTUnion.app' -type d | head -1)"
fi
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "未找到 HFUTUnion.app，请查看上方 xcodebuild 日志。"
  exit 1
fi

cp -R "$APP" "$OUT_DIR/HFUTUnion.app"
echo ""
echo "已生成: $OUT_DIR/HFUTUnion.app"
echo "模拟器安装（需先启动一台模拟器）:"
echo "  xcrun simctl install booted \"$OUT_DIR/HFUTUnion.app\""
