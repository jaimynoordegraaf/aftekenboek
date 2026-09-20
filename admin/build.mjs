/**
 * Zet de beheerpagina klaar om te uploaden.
 *
 * Het verschil met `npm run admin` is één bestand: lokaal serveert serve.mjs
 * een config.js die hij ter plekke uit .env maakt, en op een statische host is
 * er niemand die dat doet. Dus schrijft dit script hem er één keer naast.
 *
 * De publishable key komt daarmee op een openbare pagina te staan, en dat mag:
 * die zit al in elke app-bundel op elke telefoon en is ontworpen om openbaar te
 * zijn. Wat de gegevens beschermt is row level security, niet het geheim houden
 * van die sleutel. Een sb_secret_-sleutel hoort er nooit in — daarom weigert
 * dit script er een.
 *
 * Draaien met: npm run admin:build
 */

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'dist-admin');

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const env = {};
try {
  const text = await readFile(join(root, '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at === -1) continue;
    env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
} catch {
  fail('Geen .env gevonden in de projectmap. Zie supabase/README.md stap 4.');
}

const url = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key =
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!url) fail('EXPO_PUBLIC_SUPABASE_URL ontbreekt in .env.');
if (!key) fail('Geen publishable key in .env.');
if (key.startsWith('sb_secret')) {
  fail(
    'Dat is de secret key. Die omzeilt alle policies en mag nooit op een\n' +
    '  openbare pagina. Gebruik de publishable key (sb_publishable_...).',
  );
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await writeFile(
  join(out, 'index.html'),
  await readFile(join(here, 'index.html'), 'utf8'),
);

await writeFile(
  join(out, 'config.js'),
  `// Gegenereerd door npm run admin:build — niet met de hand bijwerken.\n` +
    `window.AFTEKENBOEK = ${JSON.stringify({ url, key }, null, 2)};\n`,
);

// De meeste WordPress-hosts draaien Apache. Geen mapinhoud tonen, het
// gegenereerde bestand niet laten cachen als de sleutel ooit wisselt, en niet
// in zoekmachines belanden — een inlogscherm dat in Google staat nodigt uit
// zonder dat het iets oplevert.
await writeFile(
  join(out, '.htaccess'),
  [
    'Options -Indexes',
    '',
    '<IfModule mod_headers.c>',
    '  Header set X-Robots-Tag "noindex, nofollow"',
    '  <FilesMatch "config\\.js$">',
    '    Header set Cache-Control "no-store"',
    '  </FilesMatch>',
    '</IfModule>',
    '',
  ].join('\n'),
);

await writeFile(
  join(out, 'LEESMIJ.txt'),
  `Beheerpagina Aftekenboek
========================

Upload de inhoud van deze map naar een submap van je website, bijvoorbeeld:

    /beheer/index.html
    /beheer/config.js
    /beheer/.htaccess

Doe dat met FTP of de bestandsbeheerder van je host, niet via de
mediabibliotheek van WordPress: die weigert .html-bestanden en zou de pagina
door zijn eigen templates halen.

De pagina staat daarna op https://jouwsite.nl/beheer/ en WordPress komt er
niet aan.

Let op
------

* Moet over https. Je typt er een wachtwoord in.
* De sleutel in config.js is de publishable key. Die mag openbaar zijn: hij
  zit al in elke app op elke telefoon. Wat de gegevens beschermt is row level
  security in Supabase, niet het geheim houden van deze sleutel.
* Verandert de sleutel of het projectadres, draai dan opnieuw
  "npm run admin:build" en upload config.js opnieuw.
* Het bestand .htaccess begint met een punt en is daardoor in veel
  bestandsbeheerders verborgen. Zet "verborgen bestanden tonen" aan als je
  hem niet ziet staan.

Gegenereerd op ${new Date().toISOString().slice(0, 10)}.
`,
);

console.log(`\n  Klaar om te uploaden: dist-admin/`);
console.log(`  Server:               ${url}`);
// Geen stuk van de sleutel echoën: die hoort in het bestand, niet in een
// terminallog dat iemand over je schouder meeleest of in een issue plakt.
console.log(`  Sleutel:              publishable, ${key.length} tekens\n`);
console.log('  Upload de inhoud naar een submap van je site, bijvoorbeeld /beheer/.');
console.log('  De stappen staan in dist-admin/LEESMIJ.txt.\n');
