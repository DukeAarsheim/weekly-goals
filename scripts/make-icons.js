import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../icons/', import.meta.url));
const BG = [0x2f, 0x6f, 0x5e];
const FG = [0xff, 0xff, 0xff];
// Check mark inside the maskable safe zone (central 80%).
const POINTS = [[0.30, 0.52], [0.44, 0.66], [0.70, 0.36]];
const HALF_WIDTH = 0.06;

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter type: none
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size, py = (y + 0.5) / size;
      const d = Math.min(distToSegment(px, py, POINTS[0], POINTS[1]), distToSegment(px, py, POINTS[1], POINTS[2]));
      const a = Math.max(0, Math.min(1, (HALF_WIDTH - d) * size + 0.5));
      for (let c = 0; c < 3; c++) row.push(Math.round(BG[c] * (1 - a) + FG[c] * a));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) writeFileSync(`${outDir}icon-${size}.png`, png(size));
console.log('Wrote icons/icon-192.png and icons/icon-512.png');
