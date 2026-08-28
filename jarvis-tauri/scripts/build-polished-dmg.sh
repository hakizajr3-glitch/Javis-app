#!/bin/bash
# build-polished-dmg.sh — Build a polished JARVIS DMG or .pkg installer with:
#   - Custom dark background image (DMG only)
#   - Applications folder alias
#   - Proper icon positioning via AppleScript (DMG only)
#   - License agreement shown before mount (DMG only)
#   - .pkg installer for enterprise managed deployment
#
# Usage:
#   ./scripts/build-polished-dmg.sh <arch>          # DMG (default)
#   ./scripts/build-polished-dmg.sh <arch> --pkg    # .pkg installer
#   ./scripts/build-polished-dmg.sh <arch> --both   # DMG + .pkg
#   arch: aarch64 or x86_64
set -euo pipefail

ARCH="${1:-aarch64}"
# Parse optional second argument: --pkg, --both, or omit for dmg
_FORMAT_ARG="${2:-}"
FORMAT="dmg"  # default
case "$_FORMAT_ARG" in
    --pkg|pkg)   FORMAT="pkg" ;;
    --both|both) FORMAT="both" ;;
    --dmg|dmg|"") FORMAT="dmg" ;;
    *) echo "Unknown format: $_FORMAT_ARG (use --dmg, --pkg, or --both)"; exit 1 ;;
esac
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_TARGET="$PROJECT_DIR/src-tauri/target"

# Determine paths based on architecture
if [ "$ARCH" = "aarch64" ]; then
    TARGET_DIR="$SRC_TARGET/release"
    DMG_NAME="JARVIS_1.0.0_aarch64.dmg"
elif [ "$ARCH" = "x86_64" ]; then
    TARGET_DIR="$SRC_TARGET/x86_64-apple-darwin/release"
    DMG_NAME="JARVIS_1.0.0_x64.dmg"
else
    echo "Unknown arch: $ARCH (use aarch64 or x86_64)"
    exit 1
fi

APP_PATH="$TARGET_DIR/bundle/macos/JARVIS.app"
OUT_DMG="$TARGET_DIR/bundle/dmg/$DMG_NAME"
BACKGROUND="$SCRIPT_DIR/dmg-background.png"
LICENSE="$SCRIPT_DIR/LICENSE.txt"
BUILD_DIR="$(mktemp -d /tmp/jarvis-dmg.XXXXXX)"

echo "=== Building JARVIS for $ARCH ($FORMAT) ==="

# Validate .app exists
if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: .app not found at $APP_PATH — build it first with: npx tauri build --target $ARCH-apple-darwin"
    exit 1
fi

# ── .pkg output path ─────────────────────────────────────────────────
OUT_PKG="$TARGET_DIR/bundle/macos/JARVIS_1.0.0_${ARCH/aarch64/aarch64}.pkg"
if [ "$ARCH" = "x86_64" ]; then
    OUT_PKG="$TARGET_DIR/bundle/macos/JARVIS_1.0.0_x64.pkg"
fi

# ── .pkg build function ──────────────────────────────────────────────
build_pkg() {
    echo "  Building .pkg installer for $ARCH..."
    rm -f "$OUT_PKG"
    pkgbuild --component "$APP_PATH" \
        --install-location /Applications \
        --identifier com.jarvis.assistant \
        --version 1.0.0 \
        --ownership recommended \
        "$OUT_PKG" 2>&1
    echo "  .pkg created: $OUT_PKG"
    ls -lh "$OUT_PKG"
}

# ── If --pkg mode only, skip DMG steps ───────────────────────────────
if [ "$FORMAT" = "pkg" ]; then
    build_pkg
    exit 0
fi

# ── DMG build (default) ──────────────────────────────────────────────
if [ ! -f "$BACKGROUND" ]; then
    echo "ERROR: Background not found at $BACKGROUND — run: python3 scripts/generate_dmg_background.py"
    exit 1
fi
rm -f "$OUT_DMG"
echo "  Creating workspace..."
mkdir -p "$BUILD_DIR/.background"
cp -R "$APP_PATH" "$BUILD_DIR/JARVIS.app"
ln -s /Applications "$BUILD_DIR/Applications"
cp "$BACKGROUND" "$BUILD_DIR/.background/background.png"

# Step 2: Create the uncompressed DMG (must be outside srcfolder)
TMP_DMG="/tmp/jarvis-tmp-${ARCH}-$$.dmg"
rm -f "$TMP_DMG"
hdiutil create -srcfolder "$BUILD_DIR" -volname "JARVIS" -fs HFS+ \
    -format UDRW "$TMP_DMG" -size 200m

# Step 3: Open the DMG (Finder must see it as a mounted disk for AppleScript)
echo "  Opening DMG in Finder..."
open "$TMP_DMG"
sleep 4

# Step 4: Apply icon layout and background via AppleScript
echo "  Applying DMG styling..."
osascript <<'END_SCRIPT'
tell application "Finder"
    activate
    tell disk "JARVIS"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {200, 200, 858, 698}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 96
        set background picture of viewOptions to file ".background:background.png"
        set position of item "JARVIS.app" of container window to {160, 218}
        set position of item "Applications" of container window to {412, 218}
        close
        open
        update without registering applications
    end tell
end tell
END_SCRIPT
sleep 2

# Step 5: Unmount from /Volumes/JARVIS
echo "  Unmounting..."
sync
VOLDEV=$(diskutil info /Volumes/JARVIS 2>/dev/null | awk '/Device Node/ {print $3}' || true)
hdiutil detach /Volumes/JARVIS -quiet 2>/dev/null || hdiutil detach "$VOLDEV" -quiet 2>/dev/null || true

# Step 6: Convert to compressed, read-only DMG with license
echo "  Finalizing DMG with license..."
if [ -f "$LICENSE" ]; then
    hdiutil convert "$TMP_DMG" -format ULFO -imagekey zlib-level=9 \
        -o "$OUT_DMG" -quiet
    # Add license agreement (requires re-converting with udifrez)
    hdiutil unflatten "$OUT_DMG" 2>/dev/null || true
    hdiutil udifrez -xml "$LICENSE" "$OUT_DMG" 2>/dev/null || {
        echo "  Note: License embedding skipped (non-critical)"
    }
    hdiutil flatten "$OUT_DMG" 2>/dev/null || true
else
    hdiutil convert "$TMP_DMG" -format ULFO -imagekey zlib-level=9 \
        -o "$OUT_DMG" -quiet
fi

# Cleanup
rm -rf "$BUILD_DIR" "$TMP_DMG"

# Step 7: Clear quarantine
xattr -cr "$OUT_DMG" 2>/dev/null || true

echo ""
echo "=== Done: $OUT_DMG ==="
ls -lh "$OUT_DMG"

# ── Also build .pkg if --both ────────────────────────────────────────
if [ "$FORMAT" = "both" ]; then
    echo ""
    build_pkg
fi
