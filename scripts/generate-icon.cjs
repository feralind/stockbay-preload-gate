const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets');

const sizes = [16, 24, 32, 48, 64, 128, 256];

function makeCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function roundedRect(px, py, x, y, w, h, r) {
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  return px >= x && px <= x + w && py >= y && py <= y + h && (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2;
}

function lineHit(px, py, x1, y1, x2, y2, width) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len = vx * vx + vy * vy;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / len));
  const dx = px - (x1 + vx * t);
  const dy = py - (y1 + vy * t);
  return dx * dx + dy * dy <= (width / 2) ** 2;
}

function drawSample(x, y, size) {
  const scale = size / 256;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;

  if (roundedRect(x, y, 20 * scale, 20 * scale, 216 * scale, 216 * scale, 54 * scale)) {
    const t = (x + y) / (2 * size);
    r = 56 * (1 - t) + 29 * t;
    g = 189 * (1 - t) + 78 * t;
    b = 248 * (1 - t) + 216 * t;
    a = 255;
  }

  const wicks = [
    [80, 66, 80, 98],
    [80, 154, 80, 190],
    [128, 52, 128, 96],
    [128, 150, 128, 204],
    [176, 82, 176, 110],
    [176, 166, 176, 198],
  ];

  for (const wick of wicks) {
    if (lineHit(x, y, wick[0] * scale, wick[1] * scale, wick[2] * scale, wick[3] * scale, 10 * scale)) {
      r = 255;
      g = 255;
      b = 255;
      a = 255;
    }
  }

  const bodies = [
    [64, 98, 32, 56, 7, 1],
    [112, 96, 32, 54, 7, 0.94],
    [160, 110, 32, 56, 7, 0.88],
  ];

  for (const body of bodies) {
    if (roundedRect(x, y, body[0] * scale, body[1] * scale, body[2] * scale, body[3] * scale, body[4] * scale)) {
      r = 255;
      g = 255;
      b = 255;
      a = 255 * body[5];
    }
  }

  return [r, g, b, a];
}

function makePng(size) {
  const supersample = 3;
  const raw = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const sample = drawSample(x + (sx + 0.5) / supersample, y + (sy + 0.5) / supersample, size);
          r += sample[0];
          g += sample[1];
          b += sample[2];
          a += sample[3];
        }
      }

      const offset = y * (size * 4 + 1) + 1 + x * 4;
      const count = supersample * supersample;
      raw[offset] = Math.round(r / count);
      raw[offset + 1] = Math.round(g / count);
      raw[offset + 2] = Math.round(b / count);
      raw[offset + 3] = Math.round(a / count);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIco(images) {
  let offset = 6 + images.length * 16;
  const header = Buffer.alloc(offset);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach(({ size, buffer }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });

  return Buffer.concat([header, ...images.map((image) => image.buffer)]);
}

const images = sizes.map((size) => ({ size, buffer: makePng(size) }));
fs.writeFileSync(path.join(outDir, 'icon.png'), images[images.length - 1].buffer);
fs.writeFileSync(path.join(outDir, 'icon.ico'), makeIco(images));
