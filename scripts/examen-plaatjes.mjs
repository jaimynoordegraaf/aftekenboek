/**
 * Haalt de afbeeldingen uit een CWO-examen-PDF en koppelt ze aan de vraag
 * waar ze bij staan.
 *
 * Hoe dat kan: in de inhoudsstroom van een pagina staan de tekst en de
 * plaatjes in leesvolgorde door elkaar. Zie je eerst "12." en daarna een
 * tekening, dan hoort die tekening bij vraag 12. Er is geen ander verband in
 * het bestand — een PDF kent geen vragen, alleen letters en vlakken op papier.
 *
 * De plaatjes zelf zijn gecomprimeerde pixels (FlateDecode, 8 bit, grijs of
 * RGB). Ze worden hier uitgepakt en als PNG weggeschreven, want een browser
 * kan geen kale pixels tonen.
 *
 * Overgeslagen: maskers, en alles kleiner dan 40 pixels. Dat zijn de
 * legenda-icoontjes en de doorzichtigheidslagen, geen vraagplaatjes.
 *
 * Draaien met: node scripts/examen-plaatjes.mjs "<pdf>" <uitmap>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const [bron, uitmap] = process.argv.slice(2);
if (!bron || !uitmap) {
  console.error('Gebruik: node scripts/examen-plaatjes.mjs "<pdf>" <uitmap>');
  process.exit(1);
}

const pdf = readFileSync(bron);
const tekst = pdf.toString('latin1');

// ---------------------------------------------------------------- objecten

/** Elk indirect object: nummer -> { kop, stream } */
const objecten = new Map();
for (const m of tekst.matchAll(/(\d+)\s+0\s+obj/g)) {
  const nr = Number(m[1]);
  const begin = m.index + m[0].length;
  const streamAt = tekst.indexOf('stream', begin);
  const endobjAt = tekst.indexOf('endobj', begin);
  const heeftStream = streamAt > 0 && (endobjAt < 0 || streamAt < endobjAt);

  const kop = tekst.slice(begin, heeftStream ? streamAt : endobjAt);
  let stream = null;
  if (heeftStream) {
    let s = streamAt + 6;
    if (tekst[s] === '\r') s++;
    if (tekst[s] === '\n') s++;
    const e = tekst.indexOf('endstream', s);
    stream = pdf.subarray(s, e);
  }
  objecten.set(nr, { kop, stream });
}

const verwijzing = (waarde) => {
  const m = /^\s*(\d+)\s+0\s+R/.exec(waarde ?? '');
  return m ? Number(m[1]) : null;
};

const uitpakken = (obj) => {
  if (!obj?.stream) return null;
  if (!/\/FlateDecode/.test(obj.kop)) return obj.stream;
  try {
    return inflateSync(obj.stream);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- png

function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const crcTabel = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTabel[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const blok = (type, data) => {
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
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blok('IHDR', ihdr),
    blok('IDAT', deflateSync(raw, { level: 9 })),
    blok('IEND', Buffer.alloc(0)),
  ]);
}

/** Pixels uit een PDF-afbeelding naar RGB, of null als we het formaat niet kennen. */
function naarRgb(kop, data, w, h) {
  const grijs = /\/DeviceGray/.test(kop);
  const rgbBron = /\/DeviceRGB/.test(kop);
  if (!grijs && !rgbBron) return null;
  if (!/\/BitsPerComponent\s*8/.test(kop)) return null;

  const nodig = grijs ? w * h : w * h * 3;
  if (data.length < nodig) return null;

  if (rgbBron) return data.subarray(0, nodig);

  const uit = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    uit[i * 3] = uit[i * 3 + 1] = uit[i * 3 + 2] = data[i];
  }
  return uit;
}

// ---------------------------------------------------------------- pagina's

const paginas = [];
for (const [nr, obj] of objecten) {
  if (!/\/Type\s*\/Page(?![s])/.test(obj.kop)) continue;
  paginas.push({ nr, kop: obj.kop });
}

/**
 * Het stuk tussen << en >> dat bij een sleutel hoort, met de tussenliggende
 * woordenboeken erin. Een regex kan dit niet: /Resources bevat /XObject bevat
 * weer een woordenboek, en een luie regex stopt bij het eerste >>.
 */
function woordenboekNa(tekstDeel, sleutel) {
  const at = tekstDeel.indexOf(sleutel);
  if (at < 0) return '';
  const rest = tekstDeel.slice(at + sleutel.length);

  const ref = /^\s*(\d+)\s+0\s+R/.exec(rest);
  if (ref) return objecten.get(Number(ref[1]))?.kop ?? '';

  const begin = rest.indexOf('<<');
  if (begin < 0) return '';
  let diep = 0;
  for (let i = begin; i < rest.length - 1; i++) {
    if (rest[i] === '<' && rest[i + 1] === '<') { diep++; i++; }
    else if (rest[i] === '>' && rest[i + 1] === '>') {
      diep--; i++;
      if (diep === 0) return rest.slice(begin, i + 1);
    }
  }
  return '';
}

/** De XObject-namen van een pagina: /Image34 -> objectnummer. */
function beeldenVan(kop) {
  const bronnen = woordenboekNa(kop, '/Resources') || kop;
  const xoKop = woordenboekNa(bronnen, '/XObject');

  const kaart = new Map();
  for (const m of xoKop.matchAll(/\/([A-Za-z0-9._]+)\s+(\d+)\s+0\s+R/g)) {
    kaart.set(m[1], Number(m[2]));
  }
  return kaart;
}

/** De inhoud van een pagina, uitgepakt. */
function inhoudVan(kop) {
  const c = /\/Contents\s*(\d+\s+0\s+R|\[[^\]]*\])/.exec(kop)?.[1] ?? '';
  const nummers = [...c.matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1]));
  return Buffer.concat(
    nummers.map((n) => uitpakken(objecten.get(n)) ?? Buffer.alloc(0)),
  ).toString('latin1');
}

mkdirSync(uitmap, { recursive: true });

const gevonden = [];
let huidigeVraag = null;

for (const pagina of paginas) {
  const namen = beeldenVan(pagina.kop);
  const inhoud = inhoudVan(pagina.kop);

  // Door de stroom heen in leesvolgorde: tekst om te weten bij welke vraag we
  // zijn, en /Naam Do voor een getekend plaatje.
  for (const m of inhoud.matchAll(/\((?:\\.|[^\\()])*\)|\/([A-Za-z0-9._]+)\s+Do/g)) {
    if (m[0].startsWith('(')) {
      const stuk = m[0].slice(1, -1).replace(/\\([()\\])/g, '$1');
      const nummer = /^\s*(\d{1,2})\.\s*$/.exec(stuk);
      if (nummer) huidigeVraag = Number(nummer[1]);
      continue;
    }

    const objNr = namen.get(m[1]);
    const obj = objNr ? objecten.get(objNr) : null;
    if (!obj || !/\/Subtype\s*\/Image/.test(obj.kop)) continue;
    if (/\/ImageMask\s*true/.test(obj.kop)) continue;

    const w = Number(/\/Width\s+(\d+)/.exec(obj.kop)?.[1] ?? 0);
    const h = Number(/\/Height\s+(\d+)/.exec(obj.kop)?.[1] ?? 0);
    if (w < 40 || h < 40) continue;

    const data = uitpakken(obj);
    if (!data) continue;
    const rgb = naarRgb(obj.kop, data, w, h);
    if (!rgb) continue;

    const naam = `vraag-${String(huidigeVraag ?? 0).padStart(2, '0')}-${objNr}.png`;
    writeFileSync(join(uitmap, naam), png(w, h, rgb));
    gevonden.push({ vraag: huidigeVraag, bestand: naam, breedte: w, hoogte: h });
  }
}

writeFileSync(join(uitmap, 'plaatjes.json'), JSON.stringify(gevonden, null, 2));

const perVraag = new Map();
for (const g of gevonden) perVraag.set(g.vraag, (perVraag.get(g.vraag) ?? 0) + 1);

console.log(`${gevonden.length} afbeeldingen in ${uitmap}`);
console.log(`  bij een vraag: ${gevonden.filter((g) => g.vraag).length}`);
console.log(`  vragen met een plaatje: ${[...perVraag.keys()].filter(Boolean).sort((a, b) => a - b).join(', ')}`);
