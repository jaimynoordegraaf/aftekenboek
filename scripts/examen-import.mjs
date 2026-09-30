/**
 * Leest een CWO-examen uit een PDF en maakt er een importbestand van.
 *
 * De examens van de werkgroep CWO-examenvragen hebben een vaste vorm: per vraag
 * een nummer, vier antwoorden a tot en met d, en op de laatste pagina een
 * nakijkblad met per vraag de goede letter, het hoofdstuk en het onderwerp.
 * Dat is genoeg om een examen volledig op te bouwen — inclusief welk antwoord
 * goed is, want dat verzint dit script niet.
 *
 * Wat eruit komt is JSON die je in de beheerpagina inleest:
 *
 *   { titel, grens, vragen: [ { nummer, vraag, hoofdstuk, onderwerp,
 *                               antwoorden: [...], goed: 0..3 } ] }
 *
 * De PDF wordt niet als tekstbestand gelezen maar uitgepakt: de streams zijn
 * gecomprimeerd en de tekst staat in losse stukjes tussen haakjes. Geen externe
 * bibliotheek, want dit draait één keer per examen.
 *
 * Draaien met: node scripts/examen-import.mjs "<pdf>" [uit.json]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const [bron, doel, plaatjesMap] = process.argv.slice(2);
if (!bron) {
  console.error('Gebruik: node scripts/examen-import.mjs "<pdf>" [uit.json] [plaatjesmap]');
  process.exit(1);
}

/** De tekst per pagina, in leesvolgorde. */
function paginas(pad) {
  const buf = readFileSync(pad);
  const uit = [];
  let i = 0;
  while (true) {
    const s = buf.indexOf('stream', i);
    if (s < 0) break;
    let begin = s + 6;
    if (buf[begin] === 0x0d) begin++;
    if (buf[begin] === 0x0a) begin++;
    const e = buf.indexOf('endstream', begin);
    if (e < 0) break;
    i = e + 9;

    let data;
    try {
      data = inflateSync(buf.subarray(begin, e));
    } catch {
      continue;
    }
    const ruw = data.toString('latin1');
    if (!/\bTJ\b|\bTj\b/.test(ruw)) continue;

    const stukken = [];
    for (const m of ruw.matchAll(/\((?:\\.|[^\\()])*\)|\bTJ\b|\bTj\b|\bT\*|\bTd\b|\bTD\b|\bET\b/g)) {
      const t = m[0];
      if (t.startsWith('(')) {
        stukken.push(
          t.slice(1, -1)
            .replace(/\\([()\\])/g, '$1')
            .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))),
        );
      } else if (t === 'Tj' || t === 'TJ') {
        stukken.push('');
      } else if (t === 'T*' || t === 'ET') {
        // Alleen een échte regelovergang geeft ruimte. Een Td verderop op
        // dezelfde regel niet: die valt midden in een woord, en dan wordt
        // "blijven" ineens "bli jven".
        stukken.push('\n');
      }
    }
    // "nl-NL" is de taalmarkering die Word in elk tekstblok zet; die hoort niet
    // bij de vraag.
    uit.push(stukken.join('').replace(/nl-NL/g, ' ').replace(/[ \t]+/g, ' '));
  }
  return uit;
}

const bladen = paginas(bron);
const alles = bladen.join('\n');

// De kopjes die tussen de vragen staan. Ze horen bij het nakijkblad, maar ze
// plakken ook aan het eind van de laatste vraag van een blok vast — daar moeten
// ze weer af.
const HOOFDSTUKKEN = [
  'Schiemanswerk', 'Terminologie', 'Onderdelen', 'BPR', 'Koppels en krachten',
  'Het weer', 'Weer', 'Veiligheid', 'Gedragsregels', 'Zeiltheorie', 'Navigatie',
  'Wind', 'Reglementen', 'Onderhoud', 'Manoeuvres', 'Zeilvoering', 'Examen',
  'Schip en tuig', 'Etiquette', 'Krachten', 'Schip', 'Term', 'Etiq',
];

/**
 * Tekst die veilig de database in kan.
 *
 * Een enkele keer loopt het uitpakken door in bytes die geen tekst zijn — een
 * plaatje dat direct achter een tekstblok begint. Dat eindigt in stuurtekens,
 * en Postgres weigert daar terecht een \u0000 in. Alles vanaf het eerste
 * stuurteken gaat er dus af; wat ervoor staat is de echte zin.
 */
function schoon(tekst) {
  // De voet van de pagina en het antwoordenformulier lopen soms door in het
  // laatste antwoord van een blok. Alles vanaf daar hoort er niet bij.
  // "Examen" staat in de voet zelf ook nog eens afgebroken ("Exame n"), dus de
  // spaties mogen overal tussen staan.
  const voet = /\s*(E\s*x\s*a\s*m\s*e\s*n\s*Kb|Pagina\s*:\s*\d+|Antwoordenformulier)/
    .exec(tekst ?? '');
  if (voet) tekst = tekst.slice(0, voet.index);
  const stuur = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.exec(tekst ?? '');
  const tot = stuur ? tekst.slice(0, stuur.index) : (tekst ?? '');
  return tot.replace(/\s+/g, ' ').trim();
}

/** Een kopje dat achter een antwoord of vraag is blijven hangen, eraf halen. */
function zonderKopje(tekst) {
  let uit = schoon(tekst);
  for (const h of HOOFDSTUKKEN) {
    const re = new RegExp(`\\s*${h}\\s*$`, 'i');
    if (re.test(uit)) uit = uit.replace(re, '').trim();
  }
  return uit;
}

// ---------------------------------------------------------------- nakijkblad
//
// Regels als "12. B BPR Vaarregels - Groot-klein": nummer, letter, hoofdstuk,
// onderwerp. Het hoofdstuk is één of twee woorden, de rest is het onderwerp.
const sleutel = new Map();
for (const m of alles.matchAll(/(\d{1,2})\.\s*([A-D])\s+([^\n]{0,80}?)(?=\s+\d{1,2}\.\s*[A-D]\s|\n|$)/g)) {
  const [, nr, letter, staart] = m;
  const woorden = staart.trim().split(/\s+/);
  // Het hoofdstuk stopt waar het onderwerp begint; de PDF zet daar geen teken
  // tussen, dus we nemen de bekende hoofdstuknamen als anker.
  const hoofdstukken = HOOFDSTUKKEN;
  const gevonden = hoofdstukken.find((h) => staart.startsWith(h));
  sleutel.set(Number(nr), {
    letter,
    hoofdstuk: gevonden ?? woorden[0] ?? '',
    onderwerp: (gevonden ? staart.slice(gevonden.length) : woorden.slice(1).join(' ')).trim(),
  });
}

// ---------------------------------------------------------------- de vragen
//
// Alles tot aan het nakijkblad. Een vraag begint met "<nr>. " en loopt tot de
// volgende; de antwoorden staan erin als "a. …" tot en met "d. …".
const tot = alles.search(/Antwoorden examen/i);
const vraagDeel = tot > 0 ? alles.slice(0, tot) : alles;

// De nummers worden op volgorde gezocht, niet allemaal tegelijk. Reden: een
// antwoord als "a. 5." ziet er precies zo uit als het begin van vraag 5, en dan
// knipt het script een vraag doormidden. Na vraag 41 zoeken we dus alleen nog
// naar 42, verderop in de tekst.
const vragen = [];
const hoogste = Math.max(60, ...sleutel.keys());
let cursor = 0;

const zoekNummer = (n, vanaf) => {
  const re = new RegExp(`(?:^|\\s)${n}\\.\\s`, 'g');
  re.lastIndex = vanaf;
  return re.exec(vraagDeel);
};

for (let nr = 1; nr <= hoogste; nr++) {
  if (!sleutel.has(nr)) continue;

  const hier = zoekNummer(nr, cursor);
  if (!hier) continue;
  const begin = hier.index + hier[0].length;
  const volgende = zoekNummer(nr + 1, begin);
  const eind = volgende ? volgende.index : vraagDeel.length;
  cursor = begin;

  const blok = vraagDeel.slice(begin, eind).replace(/\s+/g, ' ').trim();

  const eersteAntwoord = blok.search(/\ba\.\s/);
  if (eersteAntwoord < 0) continue;

  const vraag = zonderKopje(blok.slice(0, eersteAntwoord));
  const rest = blok.slice(eersteAntwoord);
  const antwoorden = [];
  const letters = ['a', 'b', 'c', 'd'];
  for (let k = 0; k < letters.length; k++) {
    const start = rest.search(new RegExp(`\\b${letters[k]}\\.\\s`));
    if (start < 0) break;
    const volgend = k + 1 < letters.length
      ? rest.search(new RegExp(`\\b${letters[k + 1]}\\.\\s`))
      : -1;
    const tekst = rest.slice(start + 3, volgend > start ? volgend : undefined)
      .replace(/\s+/g, ' ')
      .replace(/Examen .*?Pagina: \d+/g, '')
      .trim();
    antwoorden.push(zonderKopje(tekst));
  }
  if (antwoorden.length !== 4 || !vraag) continue;

  const s = sleutel.get(nr);
  vragen.push({
    nummer: nr,
    vraag,
    hoofdstuk: s.hoofdstuk,
    onderwerp: s.onderwerp,
    antwoorden,
    goed: 'ABCD'.indexOf(s.letter),
  });
}

vragen.sort((a, b) => a.nummer - b.nummer);

// (het repareren van afgebroken woorden gebeurt verderop, zodra `plat` bestaat)

// De PDF zet ruime spaties tussen de woorden; voor het zoeken naar de kop en
// de slagingsnorm maken we er eerst gewone tekst van.
const plat = alles.replace(/\s+/g, ' ');
const titelMatch = plat.match(/Examen CWO kielboot ([IVX]+)/i);
const titel = titelMatch ? `CWO Kielboot ${titelMatch[1].toUpperCase()} — theorie` : 'CWO-examen';
const grensRegel = plat.match(/geslaagd als je (\d+) antwoorden of meer goed/i);
const totaalRegel = plat.match(/bestaat uit (\d+) vragen/i);
const grens = grensRegel && totaalRegel
  ? Math.round((Number(grensRegel[1]) / Number(totaalRegel[1])) * 100)
  : 70;

// De PDF hakt af en toe een woord doormidden ("omd at", "bli jven"). Repareren
// zonder woordenboek kan wél, want het document is zijn eigen woordenboek: komt
// "omdat" elders gewoon voor en "omd" nergens, dan hoorden die twee aan elkaar.
const woordental = new Map();
for (const w of plat.toLowerCase().match(/[a-zà-ü]+/g) ?? []) {
  woordental.set(w, (woordental.get(w) ?? 0) + 1);
}
const bestaat = (w) => (woordental.get(w) ?? 0) >= 2;

// Hoe vaak twee woorden áchter elkaar staan. Dat is het tegenbewijs: "de boot"
// komt overal voor, "we lke" nergens anders.
const parental = new Map();
const losseWoorden = plat.toLowerCase().match(/[a-zà-ü]+/g) ?? [];
for (let i = 0; i + 1 < losseWoorden.length; i++) {
  const paar = `${losseWoorden[i]} ${losseWoorden[i + 1]}`;
  parental.set(paar, (parental.get(paar) ?? 0) + 1);
}

// Woord voor woord, niet met één grote zoekopdracht: die eet het vorige woord
// op en kijkt dan niet meer naar het paar erachter. In "Naar we lke kant" werd
// zo "Naar we" bekeken en "we lke" overgeslagen.
/**
 * Woorden die het uitpakken doormidden hakt en die in dit examen maar één keer
 * voorkomen, dus zonder tegenbewijs. Met de hand nagelezen in de PDF.
 */
const HERSTEL = [
  ['we lke', 'welke'],
  ['bli jven', 'blijven'],
  ['w aarom', 'waarom'],
  ['ov er', 'over'],
  ['D e ', 'De '],
  ['aa nvaring', 'aanvaring'],
  ['verbra nden', 'verbranden'],
  ['vri j', 'vrij'],
  ['nade rt', 'nadert'],
  ['gaa t', 'gaat'],
  ['a an ', 'aan '],
];

function plakWoorden(tekst) {
  const delen = tekst.split(' ');
  const uit = [];

  for (let i = 0; i < delen.length; i++) {
    const a = delen[i];
    const b = delen[i + 1];
    const leesbaar = (w) => /^[a-zà-ü]+$/i.test(w ?? '');
    const bKaal = (b ?? '').replace(/[.,?;:!]+$/, '');

    if (b && leesbaar(a) && leesbaar(bKaal)) {
      const kort = a.toLowerCase();
      const staart = bKaal.toLowerCase();
      const samen = kort + staart;

      // 1. Het stuk vóór de spatie is zelf geen woord, het geheel wel.
      const losFragment = !bestaat(kort) && bestaat(samen);

      // Verder niets. Slimmere regels — "dit paar staat nergens anders naast
      // elkaar" — plakten ook goede woorden aan elkaar: "Hoe heet" werd
      // "Hoeheet". Een fout woord is erger dan een fout dat blijft staan, want
      // het eerste ziet niemand meer.
      if (losFragment) {
        uit.push(a + b);
        i++;
        continue;
      }
    }

    uit.push(a);
  }

  return HERSTEL.reduce((t, [kapot, heel]) => t.split(kapot).join(heel), uit.join(' '));
}


for (const v of vragen) {
  v.vraag = plakWoorden(v.vraag);
  v.antwoorden = v.antwoorden.map(plakWoorden);
}

// Wat hierna nog stukgeknipt is, is een woord dat in dit examen maar één keer
// voorkomt en dus geen tegenbewijs heeft ("bli jven"). Automatisch markeren
// werkte niet — half Nederlands komt één keer voor — dus dat leest de
// instructeur bij het nalopen; in de beheerpagina is elke regel toch tekst die
// je kunt bijwerken.

// De plaatjes erbij, als die al uit de PDF zijn gehaald. Ze gaan als base64 in
// hetzelfde bestand: dan is het importeren één bestand kiezen in plaats van een
// map vol losse dingen die in de verkeerde volgorde terechtkomen.
let metPlaatje = 0;
if (plaatjesMap) {
  const lijst = JSON.parse(readFileSync(`${plaatjesMap}/plaatjes.json`, 'utf8'));
  for (const v of vragen) {
    const hoort = lijst.filter((g) => g.vraag === v.nummer);
    if (hoort.length === 0) continue;
    // Bij meer dan één plaatje het grootste: de kleintjes zijn pijlen en
    // windvanen die bij de tekening horen, niet de tekening zelf.
    const grootste = hoort.sort((a, b) => b.breedte * b.hoogte - a.breedte * a.hoogte)[0];
    v.plaatje = {
      naam: grootste.bestand,
      base64: readFileSync(`${plaatjesMap}/${grootste.bestand}`).toString('base64'),
    };
    metPlaatje++;
  }
}

const uit = {
  titel,
  grens,
  verwacht: totaalRegel ? Number(totaalRegel[1]) : null,
  vragen,
};

if (doel) {
  writeFileSync(doel, JSON.stringify(uit, null, 2));
}

console.log(`${titel}`);
console.log(`  vragen gevonden: ${vragen.length}${uit.verwacht ? ` van de ${uit.verwacht}` : ''}`);
console.log(`  met antwoordsleutel: ${vragen.filter((v) => v.goed >= 0).length}`);
console.log(`  geslaagd vanaf: ${grens}%`);
if (plaatjesMap) console.log(`  met een plaatje: ${metPlaatje}`);
const missend = uit.verwacht
  ? [...Array(uit.verwacht).keys()].map((n) => n + 1).filter((n) => !vragen.some((v) => v.nummer === n))
  : [];
if (missend.length) console.log(`  mist nog: ${missend.join(', ')}`);
if (doel) console.log(`  geschreven naar ${doel}`);
