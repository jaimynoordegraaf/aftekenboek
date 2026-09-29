// Maakt van de artifact-pagina een printbaar HTML-bestand voor Chrome.
//
// Een artifact mist met opzet doctype, <html> en <body>: de viewer zet die eromheen.
// Voor een PDF moet dat er zelf omheen, met printregels erbij: A4-marges, geen
// paginabreuk midden in een stap, en het adres achter een link, want in een PDF
// kun je nergens op hoveren.
import { readFileSync, writeFileSync } from 'node:fs';

const [bron, doel] = process.argv.slice(2);
const src = readFileSync(bron, 'utf8');

const knip = src.indexOf('<div class="wrap">');
if (knip < 0) throw new Error('inhoud niet gevonden');
const hoofd = src.slice(0, knip).trim(); // title, fontlink, style
const inhoud = src.slice(knip);

// Headless Chrome haalt de Google-fonts niet op, dus dan zet hij alles in Times.
// Voor de PDF komen de letters daarom van deze machine: Axis Extrabold voor de
// koppen, dezelfde displayletter als op scoutingjwf.nl, en Georgia voor de tekst.
// Een file:// verwijzing weigert Chrome hier, dus gaat de letter als data-URI mee.
const axis = readFileSync('C:/Users/jaimy/Desktop/Claude/assets/Axis_Extrabold.otf').toString('base64');

const printCss = `
<style>
  @font-face {
    font-family: 'AxisPrint';
    src: url(data:font/otf;base64,${axis}) format('opentype');
  }
  :root {
    --display: Georgia, 'Times New Roman', serif;
    --body: Georgia, 'Times New Roman', serif;
  }
  h1, h2 { font-family: 'AxisPrint', Georgia, serif; letter-spacing: 0; }
  h1 { text-transform: none; }
  .eyebrow { letter-spacing: .12em; }
  @page { size: A4; margin: 18mm 16mm; }
  :root { color-scheme: light; }
  body { padding-inline: 0; padding-block: 0; font-size: 11.5pt; }
  .wrap { max-width: none; }
  header.kop { padding-block: 0 4px; }
  h1 { font-size: 28pt; }
  section { padding-block: 20px; break-inside: avoid-page; }
  ol.stappen > li, .kaart, .stand, .pad { break-inside: avoid-page; }
  h2, h3 { break-after: avoid-page; }
  a { text-decoration: none; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; color: var(--muted); }
  footer { padding-block: 20px 0; }
</style>`;

writeFileSync(
  doel,
  `<!doctype html>
<html lang="nl" data-theme="light">
<head>
<meta charset="utf-8">
${hoofd}
${printCss}
</head>
<body>
${inhoud}
</body>
</html>
`,
);
console.log(`${doel} geschreven (${inhoud.length} tekens inhoud)`);

// De PDF maak je daarna met headless Chrome:
//
//   & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --disable-gpu `
//     --no-pdf-header-footer --virtual-time-budget=12000 `
//     --print-to-pdf="docs\Vinkje-handleiding.pdf" "file:///<pad>/docs/handleiding-print.html"
//
// Chrome haalt in headless geen Google-fonts op en rendert standaard in donkere
// modus; daarom staan de letters hierboven ingesloten en zet dit bestand
// data-theme="light" op de pagina.
