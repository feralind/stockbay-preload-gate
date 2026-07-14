import fs from 'fs';
import path from 'path';
import { ESTATE_ASSETS, ESTATE_CATEGORIES } from '../js/estates.js';

const dir = path.resolve('assets/estates');
fs.mkdirSync(dir, { recursive: true });

const palettes = {
  residences: ['#1e3a5f', '#c4a574'],
  penthouses: ['#0b1220', '#3b82f6'],
  cars: ['#111111', '#6b7280'],
  yachts: ['#0369a1', '#f59e0b'],
  islands: ['#0284c7', '#166534'],
};

function svg(label, c1, c2) {
  const safe = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="960" height="640" fill="url(#g)"/>
  <rect x="80" y="180" width="800" height="280" rx="28" fill="rgba(0,0,0,0.28)"/>
  <text x="480" y="310" text-anchor="middle" fill="#f8fafc" font-family="Georgia,serif" font-size="42">${safe}</text>
  <text x="480" y="360" text-anchor="middle" fill="rgba(248,250,252,0.7)" font-family="sans-serif" font-size="18">PLACEHOLDER</text>
</svg>`;
}

for (const c of ESTATE_CATEGORIES) {
  const [a, b] = palettes[c.id] || ['#111', '#333'];
  fs.writeFileSync(path.join(dir, path.basename(c.imagePlaceholder)), svg(c.name, a, b));
}
for (const asset of ESTATE_ASSETS) {
  const [a, b] = palettes[asset.category] || ['#111', '#333'];
  fs.writeFileSync(path.join(dir, path.basename(asset.imagePlaceholder)), svg(asset.name, a, b));
}
console.log('wrote', ESTATE_CATEGORIES.length + ESTATE_ASSETS.length, 'svgs');
