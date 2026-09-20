/**
 * Het servertje voor de beheerpagina.
 *
 * Geen dependencies, met opzet: dit moet het doen op een laptop waar verder
 * niets op staat, ook als npm install een jaar geleden voor het laatst draaide.
 *
 * Het serveert twee dingen: de pagina zelf, en een /config.js die de Supabase-
 * gegevens uit de .env van het project haalt. Die staan dus op één plek — de
 * app en de beheerpagina kunnen niet uit elkaar lopen, en er is geen tweede
 * bestand met een sleutel erin dat per ongeluk in git belandt.
 *
 * Starten met: npm run admin
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8090);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function readEnv() {
  let text = '';
  try {
    text = await readFile(join(here, '..', '.env'), 'utf8');
  } catch {
    return null;
  }

  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at === -1) continue;
    env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim();
  }
  return env;
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  if (path === '/config.js') {
    const env = await readEnv();
    const url = env?.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const key =
      env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env?.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

    res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
    res.end(`window.AFTEKENBOEK = ${JSON.stringify({ url, key })};\n`);
    return;
  }

  const file = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  // Niets buiten deze map serveren.
  if (file.includes('..')) {
    res.writeHead(400).end('nee');
    return;
  }

  try {
    const body = await readFile(join(here, file));
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Niet gevonden');
  }
});

server.listen(port, () => {
  console.log(`\n  Beheerpagina:  http://localhost:${port}\n`);
  console.log('  Stoppen met Ctrl+C.\n');
});
