/**
 * Zet een Markdown-document om in WordPress-blokken.
 *
 * Gebruikt voor het privacybeleid: dat staat als Markdown in docs/ — daar is het
 * te lezen in een diff — en als pagina op scoutingjwf.nl. Zonder omzetter gaan
 * die twee uit elkaar lopen zodra iemand er één bijwerkt.
 *
 * Het kent alleen wat dat document gebruikt: koppen, alinea's, opsommingen,
 * vet, cursief, e-mailadressen en één link. Geen algemene Markdown-omzetter, en
 * dat hoeft ook niet.
 *
 * Draaien met: node scripts/md-naar-wordpress.mjs docs/privacybeleid.md uit.json
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [bron, doel] = process.argv.slice(2);
if (!bron) {
  console.error('Gebruik: node scripts/md-naar-wordpress.mjs <bestand.md> [uit.json]');
  process.exit(1);
}

const regels = readFileSync(bron, 'utf8').replace(/\r/g, '').split('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/([\w.-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>')
    .replace(
      /\((autoriteitpersoonsgegevens\.nl)\)/,
      '(<a href="https://autoriteitpersoonsgegevens.nl">$1</a>)',
    );

const blokken = [];
let alinea = null;
let lijst = null;

const sluit = () => {
  if (alinea) {
    blokken.push(`<!-- wp:paragraph -->\n<p>${inline(alinea.join(' '))}</p>\n<!-- /wp:paragraph -->`);
    alinea = null;
  }
  if (lijst) {
    const items = lijst
      .map((i) => `<!-- wp:list-item -->\n<li>${inline(i.join(' '))}</li>\n<!-- /wp:list-item -->`)
      .join('\n');
    blokken.push(`<!-- wp:list -->\n<ul class="wp-block-list">${items}</ul>\n<!-- /wp:list -->`);
    lijst = null;
  }
};

for (const ruw of regels) {
  const regel = ruw.trimEnd();
  if (regel.startsWith('# ')) continue; // de paginatitel draagt dit al
  if (!regel.trim()) {
    sluit();
    continue;
  }

  if (regel.startsWith('## ')) {
    sluit();
    blokken.push(
      `<!-- wp:heading -->\n<h2 class="wp-block-heading">${inline(regel.slice(3))}</h2>\n<!-- /wp:heading -->`,
    );
  } else if (regel.startsWith('- ')) {
    if (alinea) sluit();
    lijst ??= [];
    lijst.push([regel.slice(2)]);
  } else if (lijst && ruw.startsWith('  ')) {
    lijst[lijst.length - 1].push(regel.trim());
  } else {
    if (lijst) sluit();
    alinea ??= [];
    alinea.push(regel.trim());
  }
}
sluit();

const uit = { content: blokken.join('\n\n') };
if (doel) writeFileSync(doel, JSON.stringify(uit));
console.log(`${blokken.length} blokken, ${uit.content.length} tekens`);
