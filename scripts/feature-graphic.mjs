/**
 * De feature graphic voor de Play Store: 1024 × 500, zonder alfakanaal.
 *
 * Zelfde taal als het icoon (scripts/icons.mjs): het JWF-verloop als vlak, het
 * teken en de tekst in inkt erop. De titel staat in Axis Extrabold, de
 * displayletter van de website. Die staat niet in deze repo — de repo is
 * openbaar en de licentie van de letter is niet de onze — maar naast de map, in
 * Desktop\Claude\assets.
 *
 * Draaien met: npm run feature-graphic
 */

import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const axis = join(root, '..', 'assets', 'Axis_Extrabold.otf');
const segoe = 'C:/Windows/Fonts/segoeui.ttf';
const segoeBold = 'C:/Windows/Fonts/seguisb.ttf';
for (const f of [axis, segoe]) {
  if (!existsSync(f)) throw new Error(`Letter niet gevonden: ${f}`);
}

const INK = '#161616';
const W = 1024;
const H = 500;

// Het teken uit icons.mjs, op zijn eigen 1024-raster, hier verkleind en links gezet.
const glyph = (x, y, scale) => `
  <g transform="translate(${x} ${y}) scale(${scale}) translate(-512 -512)" fill="none" stroke="${INK}" stroke-width="52" stroke-linecap="round" stroke-linejoin="round">
    <path d="M362 432 L462 532 L662 332"/>
    <path d="M302 664 C337 636, 372 636, 407 664 S477 692, 512 664 S582 636, 617 664 S687 692, 722 664"/>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="jwf" x1="0" y1="0" x2="1" y2="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(${W} ${H})">
      <stop offset="0" stop-color="#1E8CCA"/>
      <stop offset="0.5" stop-color="#34A0A2"/>
      <stop offset="1" stop-color="#5ABC5B"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#jwf)"/>

  <!-- Het teken, in een zacht vlak zodat het als icoon leest. -->
  <rect x="96" y="120" width="260" height="260" rx="58" fill="#FFFFFF" fill-opacity="0.18"/>
  ${glyph(226, 250, 0.33)}

  <text x="404" y="232" font-family="AXIS" font-weight="800" font-size="62" fill="${INK}">Aftekenboek</text>
  <text x="406" y="296" font-family="Segoe UI" font-weight="600" font-size="27" fill="${INK}">Watersportdiploma's, eis voor eis afgetekend</text>
  <text x="406" y="346" font-family="Segoe UI" font-size="23" fill="${INK}" fill-opacity="0.8">Scouting Jan Willem Friso</text>
</svg>`;

const fonts = [axis, segoe];
if (existsSync(segoeBold)) fonts.push(segoeBold);

const img = new Resvg(svg, {
  font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'Segoe UI' },
}).render();

// Google wil geen alfakanaal: RGBA naar RGB en zelf een PNG schrijven.
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = y * (width * 3 + 1) + 1 + x * 3;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = join(root, 'assets', 'store');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'feature-graphic.png');
writeFileSync(out, png(img.width, img.height, img.pixels));
console.log(`${out} (${img.width}×${img.height})`);
