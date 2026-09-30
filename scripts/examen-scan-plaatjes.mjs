// Tekeningen uit een gescande examenpagina snijden.
//
// De pagina is één grote afbeelding, dus de plaatjes moeten eruit geknipt. Dat
// kan omdat de bladspiegel vast is: vraagtekst en tekeningen staan links, de
// antwoorden rechts. Een tekening is een blok inkt dat hoger is dan een regel
// tekst.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const [map, uit] = process.argv.slice(2);
const paginas = Number(process.argv[4] ?? 5);
mkdirSync(uit, { recursive: true });

const LINKS = 150;   // waar de linkerkolom begint
const RECHTS = 600;  // en waar hij ophoudt; daarnaast staan de antwoorden
const REGEL = 55;    // hoger dan dit is geen tekstregel meer
const GAT = 22;      // wit binnen één tekening

// Let op het gat. Een tekening met een label erboven en eronder — "A" boven de
// wal, "D" eronder — heeft daar witruimte tussen. Stond die marge te krap, dan
// knipte dit script alleen het middenstuk eruit en verdwenen twee antwoorden
// uit beeld. Kijk de uitsnedes na voordat je ze gebruikt; ze zijn met het oog
// sneller bijgesteld dan met een scherpere regel.

const gevonden = [];

for (let p = 2; p <= paginas + 1; p++) {
  const bestand = `${map}/kb1-p${p}.png`;
  const { data, info } = await sharp(bestand)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const inktPerRij = new Array(info.height).fill(0);
  for (let y = 0; y < info.height; y++) {
    for (let x = LINKS; x < Math.min(RECHTS, info.width); x++) {
      if (data[y * info.width + x] < 128) inktPerRij[y]++;
    }
  }

  // Blokken inkt zoeken, met kleine gaatjes erin toegestaan.
  const banden = [];
  let start = null;
  let leeg = 0;
  for (let y = 0; y < info.height; y++) {
    if (inktPerRij[y] > 0) {
      if (start === null) start = y;
      leeg = 0;
    } else if (start !== null) {
      leeg++;
      if (leeg > GAT) {
        banden.push([start, y - leeg]);
        start = null;
      }
    }
  }
  if (start !== null) banden.push([start, info.height - 1]);

  for (const [boven, onder] of banden) {
    const hoogte = onder - boven;
    if (hoogte < REGEL) continue;

    // Binnen de band ook links en rechts bijsnijden.
    let links = RECHTS;
    let rechts = LINKS;
    for (let y = boven; y <= onder; y++) {
      for (let x = LINKS; x < Math.min(RECHTS, info.width); x++) {
        if (data[y * info.width + x] < 128) {
          if (x < links) links = x;
          if (x > rechts) rechts = x;
        }
      }
    }
    if (rechts - links < 60) continue;

    const rand = 12;
    const vak = {
      left: Math.max(0, links - rand),
      top: Math.max(0, boven - rand),
      width: Math.min(info.width, rechts + rand) - Math.max(0, links - rand),
      height: Math.min(info.height, onder + rand) - Math.max(0, boven - rand),
    };
    const naam = `p${p}-${boven}.png`;
    await sharp(bestand).extract(vak).toFile(`${uit}/${naam}`);
    gevonden.push({ pagina: p, naam, ...vak });
  }
}

writeFileSync(`${uit}/gevonden.json`, JSON.stringify(gevonden, null, 2));
for (const p of [...new Set(gevonden.map((g) => g.pagina))]) {
  console.log(`pagina ${p}: ${gevonden.filter((g) => g.pagina === p).length} tekeningen`);
}
