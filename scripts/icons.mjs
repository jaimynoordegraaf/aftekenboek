/**
 * Maakt alle icoonbestanden van de app uit één tekening.
 *
 * Het teken: een vinkje boven een golf — aftekenen, op het water. De kleuren
 * komen van de website (het verloop uit het JWF-logo, gemeten uit de pixels:
 * blauw #1E8CCA linksboven naar groen #5ABC5B rechtsonder), de vorm van
 * streepje: één lijndikte, ronde uiteinden, veel ruimte eromheen, en het teken
 * in inkt op de merkkleur in plaats van wit erop. Wit op het lichte groen haalt
 * op thuisschermformaat te weinig contrast.
 *
 * Het teken blijft binnen de veilige cirkel van een Android adaptive icon
 * (straal ~313 op 1024), want Android snijdt de voorgrond bij tot een cirkel,
 * een druppel of een vierkant, afhankelijk van het toestel.
 *
 * Draaien met: npm run icons
 * Een ander icoon is native: het komt pas mee met een nieuwe build, niet via
 * een OTA-update.
 */

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'images');
const src = join(root, 'assets', 'icon');

const INK = '#161616';

// Op een volledig icoon mag het teken groter dan op de Android-voorgrond. Android
// toont maar het middelste tweederde van die laag en vergroot hem daardoor; met
// dezelfde maat zou het teken op iOS kleiner ogen dan op Android.
const FULL = 1.3;

const GRADIENT = `
  <linearGradient id="jwf" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1E8CCA"/>
    <stop offset="0.5" stop-color="#34A0A2"/>
    <stop offset="1" stop-color="#5ABC5B"/>
  </linearGradient>`;

const glyph = (stroke, scale = 1) => `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)" fill="none" stroke="${stroke}" stroke-width="52" stroke-linecap="round" stroke-linejoin="round">
    <path d="M362 432 L462 532 L662 332"/>
    <path d="M302 664 C337 636, 372 636, 407 664 S477 692, 512 664 S582 636, 617 664 S687 692, 722 664"/>
  </g>`;

const svg = (inner, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${inner}</svg>`;

const layers = {
  // Het hele icoon: iOS en de Play Store. iOS rondt zelf de hoeken af.
  icon: svg(`<defs>${GRADIENT}</defs><rect width="1024" height="1024" fill="url(#jwf)"/>${glyph(INK, FULL)}`),
  // Android adaptive: achtergrond en voorgrond los, zodat het toestel ze kan
  // bijsnijden en laten bewegen.
  'android-icon-background': svg(`<defs>${GRADIENT}</defs><rect width="1024" height="1024" fill="url(#jwf)"/>`),
  'android-icon-foreground': svg(glyph(INK)),
  // Android 13+ themed icons kleuren alleen het alfakanaal in; de kleur zelf
  // doet er niet toe, de vorm wel.
  'android-icon-monochrome': svg(glyph('#FFFFFF')),
  // Het splashscherm: het icoon als afgeronde tegel op inkt, zoals bij turf.
  'splash-icon': svg(`<defs>${GRADIENT}<clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath></defs>
    <g clip-path="url(#r)"><rect width="1024" height="1024" fill="url(#jwf)"/>${glyph(INK, FULL)}</g>`),
  favicon: svg(`<defs>${GRADIENT}<clipPath id="r"><rect width="1024" height="1024" rx="200"/></clipPath></defs>
    <g clip-path="url(#r)"><rect width="1024" height="1024" fill="url(#jwf)"/>${glyph(INK, FULL)}</g>`),
};

const sizes = {
  icon: 1024,
  'android-icon-background': 1024,
  'android-icon-foreground': 1024,
  'android-icon-monochrome': 1024,
  'splash-icon': 512,
  favicon: 48,
};

mkdirSync(src, { recursive: true });

for (const [name, markup] of Object.entries(layers)) {
  writeFileSync(join(src, `${name}.svg`), markup);
  const png = new Resvg(markup, { fitTo: { mode: 'width', value: sizes[name] } })
    .render()
    .asPng();
  writeFileSync(join(out, `${name}.png`), png);
  console.log(`  ${name}.png  ${sizes[name]}px`);
}
