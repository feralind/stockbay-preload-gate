/**
 * Pack StockWay size PNGs into assets/icon.ico (Vista+ PNG-in-ICO).
 * Run after: powershell -File scripts/generate-icon.ps1
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const assets = path.join(__dirname, '..', 'assets');
const sizes = [16, 32, 48, 256];

function ensurePngs() {
  const missing = sizes.some((s) => !fs.existsSync(path.join(assets, `icon-${s}.png`)))
    || !fs.existsSync(path.join(assets, 'icon.png'));
  if (!missing) return;
  execFileSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'generate-icon.ps1'),
  ], { stdio: 'inherit' });
}

function packIco(pngBySize, outPath) {
  const ordered = Object.keys(pngBySize).map(Number).sort((a, b) => a - b);
  const count = ordered.length;
  let offset = 6 + 16 * count;
  const parts = [];

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  parts.push(header);

  const blobs = [];
  for (const size of ordered) {
    const data = pngBySize[size];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    parts.push(entry);
    blobs.push(data);
    offset += data.length;
  }
  parts.push(...blobs);
  fs.writeFileSync(outPath, Buffer.concat(parts));
}

ensurePngs();

const pngBySize = {};
for (const size of sizes) {
  const p = path.join(assets, `icon-${size}.png`);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  pngBySize[size] = fs.readFileSync(p);
}

const out = path.join(assets, 'icon.ico');
packIco(pngBySize, out);
const st = fs.statSync(out);
console.log(`Wrote assets/icon.ico (${st.size} bytes, sizes: ${sizes.join(',')})`);
console.log(`Wrote assets/icon.png (${fs.statSync(path.join(assets, 'icon.png')).size} bytes)`);
