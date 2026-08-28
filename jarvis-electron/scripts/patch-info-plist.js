// scripts/patch-info-plist.js
//
// Why this exists: Electron's pre-built Electron.app distribution ships without
// `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` in its Info.plist.
// On macOS, those keys are required for `navigator.mediaDevices.getUserMedia`
// to even surface the system permission prompt — without them the OS silently
// returns NotAllowedError, and the UI is permanently stuck on "camera offline".
//
// This script:
//   1. Patches the in-tree Electron.app/Contents/Info.plist (idempotent),
//   2. Re-signs the bundle with ad-hoc `codesign --sign -` because modifying
//      any file inside the .app invalidates its macOS code signature
//      (especially on Apple Silicon, where the OS will otherwise hard-reject
//      privacy permissions or refuse to launch the helper process).
//
// It is wired into:
//   - jarvis-electron/package.json `scripts.start`
//   - jarvis-electron/run-dev.js (before spawning electron)
//
// Production packaging uses electron-builder / electron-forge and writes its
// own Info.plist + signing identity, so this only affects local dev runs.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PLIST_KEYS = {
  NSCameraUsageDescription:
    'J.A.R.V.I.S. uses the camera for visual input, motion detection, and avatar / vision features.',
  NSMicrophoneUsageDescription:
    'J.A.R.V.I.S. uses the microphone for voice commands and live transcription.',
};

function findElectronAppDist() {
  // Walk up node_modules/.pnpm/electron@*/node_modules/electron/dist/Electron.app
  const nm = path.resolve(__dirname, '..', 'node_modules');
  const candidates = fs.existsSync(nm)
    ? [
        path.join(nm, 'electron', 'dist', 'Electron.app'),
        path.join(nm, '.pnpm'),
      ]
    : [];

  const queue = [...candidates];
  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name === 'Electron.app' && fs.existsSync(path.join(full, 'Contents', 'Info.plist'))) {
        return full;
      }
      if (e.isDirectory()) queue.push(full);
    }
  }
  throw new Error('patch-info-plist: Electron.app/Contents/Info.plist not found under node_modules.');
}

function readPlist(p) {
  return fs.readFileSync(p, 'utf8');
}

function patchPlistText(text) {
  let out = text;
  for (const [key, value] of Object.entries(PLIST_KEYS)) {
    if (out.includes(`<key>${key}</key>`)) continue; // already patched
    // Insert before the closing </dict> of the top-level dict.
    out = out.replace(/<\/dict>\s*<\/plist>\s*$/, `    <key>${key}</key>\n    <string>${value}</string>\n</dict>\n</plist>\n`);
  }
  return out;
}

function reSign(appPath) {
  // Ad-hoc sign --force --deep restores validity after the Info.plist edit. The
  // dash shows up in System Report as "Signed by an unknown developer", but
  // first-launch TCC prompts + sandbox allow-lists ARE permitted.
  try {
    execSync(`codesign --sign - --force --deep "${appPath}"`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('patch-info-plist: ad-hoc codesign failed; macOS may still deny camera/mic.');
    console.warn('  Reason:', e.message);
  }
}

function main() {
  const appPath = findElectronAppDist();
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const original = readPlist(plistPath);
  const patched = patchPlistText(original);
  if (patched !== original) {
    fs.writeFileSync(plistPath, patched, 'utf8');
    console.log(`patch-info-plist: wrote ${plistPath}`);
    reSign(appPath);
  } else {
    console.log('patch-info-plist: already up-to-date, no edits needed.');
  }
}

if (require.main === module) main();
module.exports = { main, findElectronAppDist, patchPlistText };
