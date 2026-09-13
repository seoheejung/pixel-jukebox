import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const palette = {
  dark: [0x24, 0x22, 0x29, 0xff],
  cream: [0xf4, 0xe8, 0xc9, 0xff],
  green: [0x9f, 0xbd, 0x45, 0xff],
  highlight: [0xd7, 0xe3, 0x9b, 0xff],
  magenta: [0xd5, 0x2f, 0x73, 0xff],
  shine: [0xff, 0xf7, 0xdf, 0xff],
};

const pixels = new Uint8Array(16 * 16 * 4);
const fill = (x, y, width, height, color) => {
  for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
    pixels.set(color, (py * 16 + px) * 4);
  }
};

fill(2, 1, 12, 14, palette.dark);
fill(1, 2, 14, 12, palette.dark);
fill(2, 2, 12, 12, palette.cream);
fill(3, 3, 10, 7, palette.dark);
fill(4, 4, 8, 5, palette.green);
fill(4, 4, 1, 5, palette.highlight);
fill(7, 4, 4, 1, palette.dark);
fill(10, 5, 1, 3, palette.dark);
fill(7, 7, 3, 2, palette.dark);
fill(5, 10, 2, 4, palette.dark);
fill(4, 11, 4, 2, palette.dark);
fill(12, 10, 2, 2, palette.magenta);
fill(10, 12, 2, 2, palette.magenta);
fill(13, 10, 1, 1, palette.shine);
fill(11, 12, 1, 1, palette.shine);

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
};
const png = (size) => {
  const scale = size / 16;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const source = (Math.floor(y / scale) * 16 + Math.floor(x / scale)) * 4;
      raw.set(pixels.subarray(source, source + 4), row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
};

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(`public/icons/icon-${size}.png`, png(size));
