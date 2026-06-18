// Nach electron-builder: win-unpacked → PhasmoOverlay umbenennen, Build-Müll löschen.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) process.exit(0);

for (const name of fs.readdirSync(dist)) {
  if (
    name.startsWith('builder-') ||
    name.endsWith('.7z') ||
    name === 'builder-effective-config.yaml'
  ) {
    fs.rmSync(path.join(dist, name), { recursive: true, force: true });
  }
}

const unpacked = path.join(dist, 'win-unpacked');
const appDir = path.join(dist, 'PhasmoOverlay');

if (fs.existsSync(unpacked)) {
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
  fs.renameSync(unpacked, appDir);
  console.log('→ dist/PhasmoOverlay/PhasmoOverlay.exe');
}

const setup = fs.readdirSync(dist).find((n) => n.startsWith('PhasmoOverlay-Setup-') && n.endsWith('.exe'));
if (setup) console.log('→ dist/' + setup);
