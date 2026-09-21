/**
 * Runs the migrations against a real Postgres and then tries to break them.
 *
 * PGlite is Postgres compiled to WebAssembly: no Docker, no network, nothing
 * to install. That matters because RLS failures are silent — a wrong policy
 * raises no error, rows simply stop appearing, or start appearing to the wrong
 * person. The only way to know is to ask as a real member and count.
 *
 * Run with: npm run test:db
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(here, '..');

const db = new PGlite();

let failures = 0;
let checks = 0;

function check(name, ok, extra) {
  checks++;
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${extra === undefined ? '' : ` — ${extra}`}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

/**
 * Supabase gives every signed-in caller the `authenticated` role and an
 * auth.uid(). Here that is a role we create ourselves and a setting we can
 * change, so one process can act as several different members.
 */
async function as(uid, fn) {
  await db.exec(`set role authenticated; set "test.uid" = '${uid}';`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

/** Run a statement as a member and report whether it was refused. */
async function refused(uid, sql, params = []) {
  try {
    await as(uid, () => db.query(sql, params));
    return null;
  } catch (e) {
    return e.message;
  }
}

async function main() {
  section('Opzet');

  // What Supabase provides and the migrations assume exists.
  await db.exec(`
    create role authenticated;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create or replace function auth.uid () returns uuid
      language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid;
    $$;
  `);
  check('auth-stub staat', true);

  // 010-eisen.sql gaat als laatste: de catalogus hangt inmiddels aan elke
  // schemawijziging die erna genummerd is, en onderdelen kunnen pas geladen
  // worden als requirements.parent_id bestaat.
  for (const file of [
    '001-core.sql',
    '002-rls.sql',
    '003-rpc.sql',
    '011-laatste-beheerder.sql',
    '012-onderdelen.sql',
    '013-beheer.sql',
    '014-speltakken.sql',
    '015-leden-zonder-account.sql',
    '016-bakken-en-standen.sql',
    '010-eisen.sql',
  ]) {
    try {
      await db.exec(readFileSync(join(sqlDir, file), 'utf8'));
      check(`${file} draait`, true);
    } catch (e) {
      check(`${file} draait`, false, e.message);
      // Nothing after this can mean anything.
      report();
      process.exit(1);
    }
  }

  // schema.sql is the paste-once path for a fresh project, and it is generated
  // — so it is exactly the file most likely to drift from the numbered ones.
  try {
    const fresh = new PGlite();
    await fresh.exec(`
      create role authenticated;
      create schema auth;
      create table auth.users (
        id uuid primary key default gen_random_uuid(),
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create or replace function auth.uid () returns uuid
        language sql stable as $$ select null::uuid; $$;
    `);
    await fresh.exec(readFileSync(join(sqlDir, 'schema.sql'), 'utf8'));
    const n = await fresh.query('select count(*)::int as n from requirements');
    await fresh.close();
    check('schema.sql draait op een leeg project', n.rows[0].n > 250, `${n.rows[0].n} eisen`);
  } catch (e) {
    check('schema.sql draait op een leeg project', false, e.message);
  }

  // Supabase grants these; without them `authenticated` cannot reach a table
  // at all and every test below would pass for the wrong reason.
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);

  section('De catalogus is geladen');

  const disciplines = await one('select count(*)::int as n from disciplines');
  check('vier disciplines', disciplines.n === 4, `${disciplines.n}`);

  const diplomas = await one('select count(*)::int as n from diplomas');
  check('twaalf diploma\'s', diplomas.n === 12, `${diplomas.n}`);

  const reqs = await one('select count(*)::int as n from requirements');
  check('meer dan 250 eisen', reqs.n > 250, `${reqs.n}`);

  // parent_id is null: onderdelen tellen niet mee als eis — dat is de hele
  // afspraak achter 012-onderdelen.sql.
  const roeien = await one(`
    select
      count(*) filter (where kind = 'praktijk')::int as p,
      count(*) filter (where kind = 'theorie')::int  as t
    from requirements r
    join diplomas d on d.id = r.diploma_id
    where d.code = 'roeien-12' and r.parent_id is null
  `);
  check('Roeien I/II: 9 praktijk, 8 theorie', roeien.p === 9 && roeien.t === 8,
    `${roeien.p}/${roeien.t}`);

  // Every diploma whose handboek carries a "toelichting op de eisen" should
  // have one on every eis. Sloep/motorvlet is the exception: that handboek has
  // no per-eis toelichting at all, only beoordelingsrichtlijnen.
  const missing = await db.query(`
    select d.code, count(*)::int as n
    from requirements r
    join diplomas d on d.id = r.diploma_id
    where r.detail is null
      and r.parent_id is null
      and d.code not like 'sloep-%'
    group by d.code
    order by d.code
  `);
  check(
    'elke eis met een handboek-toelichting heeft er een',
    missing.rows.length === 0,
    missing.rows.map((r) => `${r.code}: ${r.n} zonder`).join(', '),
  );

  const sloepGrouped = await one(`
    select count(*)::int as n from requirements r
    join diplomas d on d.id = r.diploma_id
    where d.code = 'sloep-1' and r.kind = 'praktijk' and r.detail is not null
  `);
  check('sloep-praktijk draagt het handboek-onderdeel', sloepGrouped.n === 33,
    `${sloepGrouped.n}`);

  section('Onderdelen binnen een eis');

  const knopen = await db.query(`
    select r.position, r.title
    from requirements r
    join requirements p on p.id = r.parent_id
    where p.code = 'roeien-12.t1'
    order by r.position
  `);
  check('Schiemanswerk is opgesplitst', knopen.rows.length === 6,
    `${knopen.rows.length}`);
  check('en de eerste is de halve steek',
    (knopen.rows[0]?.title ?? '').startsWith('Twee halve steken'),
    knopen.rows[0]?.title ?? 'geen');

  const onderdelen = await one(
    'select count(*)::int as n from requirements where parent_id is not null',
  );
  check('er staan ruim 200 onderdelen klaar', onderdelen.n > 200, `${onderdelen.n}`);

  const wees = await one(`
    select count(*)::int as n
    from requirements r join requirements p on p.id = r.parent_id
    where r.diploma_id <> p.diploma_id
  `);
  check('geen onderdeel onder een ander diploma', wees.n === 0, `${wees.n}`);

  // Twee lagen diep zou een boom maken van wat een lijst moet blijven.
  const parentCode = await one(
    `select id, diploma_id from requirements where code = 'roeien-12.t1.1'`,
  );
  let nested = null;
  try {
    await db.query(
      `insert into requirements (diploma_id, parent_id, code, kind, position, title)
       values ($1, $2, 'test.te.diep', 'theorie', 1, 'Te diep')`,
      [parentCode.diploma_id, parentCode.id],
    );
  } catch (e) {
    nested = e.message;
  }
  check('een onderdeel van een onderdeel wordt geweigerd', nested !== null,
    'het lukte wel');

  section('De seed kan opnieuw');

  // The whole point of upserting on `code`: ids survive, so aftekeningen that
  // already exist keep pointing at the same eis.
  const before = await one(`select id from requirements where code = 'roeien-12.p1'`);
  await db.exec(readFileSync(join(sqlDir, '010-eisen.sql'), 'utf8'));
  const after = await one(`select id from requirements where code = 'roeien-12.p1'`);
  const stillTwelve = await one('select count(*)::int as n from diplomas');
  check('opnieuw draaien houdt dezelfde eis-id', before.id === after.id);
  check('opnieuw draaien dupliceert geen diploma', stillTwelve.n === 12, `${stillTwelve.n}`);

  section('Twee groepen, vier mensen');

  const wim = await newUser('wim@voorbeeld.nl', 'Wim de Instructeur');
  const sam = await newUser('sam@voorbeeld.nl', 'Sam het Lid');
  const nina = await newUser('nina@voorbeeld.nl', 'Nina het Lid');
  const ander = await newUser('ander@voorbeeld.nl', 'Ander Groep');

  const jwf = await as(wim, async () => {
    const r = await db.query(`select create_group('Scouting JWF', 'jwf') as id`);
    return r.rows[0].id;
  });
  check('groep aangemaakt', Boolean(jwf));

  const other = await as(ander, async () => {
    const r = await db.query(`select create_group('Andere Groep', 'andere') as id`);
    return r.rows[0].id;
  });

  // Wim is beheerder by making the groep; give him the instructeur hat too by
  // leaving him as beheerder (is_staff covers both), and add the two leden.
  await db.exec(
    `insert into memberships (group_id, profile_id, role) values
       ('${jwf}', '${sam}', 'lid'),
       ('${jwf}', '${nina}', 'lid')`,
  );
  check('twee leden toegevoegd', true);

  section('Aftekenen is van de instructeur');

  const roeien12 = (await one(`select id from diplomas where code = 'roeien-12'`)).id;

  const samEnrollment = await as(wim, async () => {
    const r = await db.query(
      `insert into enrollments (group_id, profile_id, diploma_id, created_by)
       values ($1, $2, $3, $4) returning id`,
      [jwf, sam, roeien12, wim],
    );
    return r.rows[0].id;
  });
  check('instructeur schrijft een lid in', Boolean(samEnrollment));

  const selfEnroll = await refused(
    sam,
    `insert into enrollments (group_id, profile_id, diploma_id) values ($1, $2, $3)`,
    [jwf, sam, (await one(`select id from diplomas where code = 'roeien-3'`)).id],
  );
  check('lid kan zichzelf niet inschrijven', selfEnroll !== null, 'het lukte wel');

  const eis1 = (await one(`select id from requirements where code = 'roeien-12.p1'`)).id;

  const selfSign = await refused(sam, `select set_sign_off($1, $2, true, null)`, [
    samEnrollment,
    eis1,
  ]);
  check('lid kan zichzelf niet aftekenen', selfSign !== null, 'het lukte wel');

  await as(wim, () =>
    db.query(`select set_sign_off($1, $2, true, $3)`, [
      samEnrollment,
      eis1,
      'Netjes gedaan op de vaaravond',
    ]),
  );
  const signed = await one(
    `select s.signed_by, s.note, p.full_name
     from sign_offs s join profiles p on p.id = s.signed_by
     where s.enrollment_id = '${samEnrollment}'`,
  );
  check('instructeur tekent af', signed?.signed_by === wim);
  check('de naam van de instructeur staat erbij', signed?.full_name === 'Wim de Instructeur');
  check('de notitie is bewaard', signed?.note === 'Netjes gedaan op de vaaravond');

  // A sign_off that carries someone else's name is the one thing that would
  // quietly corrupt a vorderingenstaat.
  const forged = await refused(
    wim,
    `insert into sign_offs (enrollment_id, requirement_id, diploma_id, signed_by)
     values ($1, $2, $3, $4)`,
    [samEnrollment, (await one(`select id from requirements where code = 'roeien-12.p2'`)).id,
      roeien12, sam],
  );
  check('aftekenen op andermans naam kan niet', forged !== null, 'het lukte wel');

  const wrongDiploma = (await one(`select id from requirements where code = 'kielboot-1.p1'`)).id;
  const crossed = await refused(wim, `select set_sign_off($1, $2, true, null)`, [
    samEnrollment,
    wrongDiploma,
  ]);
  check('een eis van een ander diploma wordt geweigerd', crossed !== null, 'het lukte wel');

  section('Ontaftekenen');

  await as(wim, () =>
    db.query(`select set_sign_off($1, $2, false, null)`, [samEnrollment, eis1]),
  );
  const left = await one(
    `select count(*)::int as n from sign_offs where enrollment_id = '${samEnrollment}'`,
  );
  check('een aftekening kan terug', left.n === 0, `${left.n}`);

  // Put it back for the counting tests.
  await as(wim, () =>
    db.query(`select set_sign_off($1, $2, true, null)`, [samEnrollment, eis1]),
  );

  section('Wie ziet wat');

  const samSees = await as(sam, async () => {
    const r = await db.query('select count(*)::int as n from enrollments');
    return r.rows[0].n;
  });
  check('lid ziet de eigen inschrijving', samSees === 1, `${samSees}`);

  const ninaEnrollment = await as(wim, async () => {
    const r = await db.query(
      `insert into enrollments (group_id, profile_id, diploma_id, created_by)
       values ($1, $2, $3, $4) returning id`,
      [jwf, nina, roeien12, wim],
    );
    return r.rows[0].id;
  });

  const samSeesNina = await as(sam, async () => {
    const r = await db.query('select count(*)::int as n from enrollments');
    return r.rows[0].n;
  });
  check('lid ziet die van een ander niet', samSeesNina === 1, `${samSeesNina}`);

  const wimSees = await as(wim, async () => {
    const r = await db.query('select count(*)::int as n from enrollments');
    return r.rows[0].n;
  });
  check('instructeur ziet beide leden', wimSees === 2, `${wimSees}`);

  const otherSees = await as(ander, async () => {
    const r = await db.query('select count(*)::int as n from enrollments');
    return r.rows[0].n;
  });
  check('een andere groep ziet er geen enkele', otherSees === 0, `${otherSees}`);

  const sheetForStranger = await as(ander, async () => {
    const r = await db.query('select * from enrollment_sheet($1)', [samEnrollment]);
    return r.rows.length;
  });
  check('de aftekenlijst lekt niet naar een andere groep', sheetForStranger === 0,
    `${sheetForStranger} regels`);

  const ledenlijstVoorLid = await as(sam, async () => {
    const r = await db.query('select * from group_members($1)', [jwf]);
    return r.rows.length;
  });
  check('een lid krijgt geen ledenlijst', ledenlijstVoorLid === 0, `${ledenlijstVoorLid}`);

  const ledenlijst = await as(wim, async () => {
    const r = await db.query('select * from group_members($1)', [jwf]);
    return r.rows;
  });
  check('instructeur krijgt de hele ledenlijst', ledenlijst.length === 3,
    `${ledenlijst.length}`);
  check('de ledenlijst telt lopende opleidingen',
    ledenlijst.find((m) => m.full_name === 'Sam het Lid')?.in_progress === 1n ||
    ledenlijst.find((m) => m.full_name === 'Sam het Lid')?.in_progress === 1);

  const stolenProgress = await as(sam, async () => {
    const r = await db.query('select * from member_enrollments($1, $2)', [jwf, nina]);
    return r.rows.length;
  });
  check('lid kan de voortgang van een ander niet opvragen', stolenProgress === 0,
    `${stolenProgress} regels`);

  section('Tellen');

  const sheet = await as(wim, async () => {
    const r = await db.query('select * from enrollment_sheet($1)', [samEnrollment]);
    return r.rows;
  });
  const eisen = sheet.filter((r) => r.parent_id === null);
  check('de aftekenlijst heeft alle 17 eisen', eisen.length === 17, `${eisen.length}`);
  check('en de onderdelen komen mee', sheet.length > eisen.length,
    `${sheet.length} regels`);
  check('precies één eis is afgetekend',
    sheet.filter((r) => r.signed_at !== null).length === 1);
  check('praktijk staat voor theorie', sheet[0].kind === 'praktijk');
  check('de nummering volgt het handboek', sheet[0].position === 1);

  // Een onderdeel staat direct achter zijn eigen eis, zodat het scherm de
  // lijst van boven naar beneden kan doorlopen.
  const commandoIndex = sheet.findIndex((r) => r.parent_id === null && r.position === 3);
  check('onderdelen staan achter hun eis',
    sheet[commandoIndex + 1]?.parent_id === sheet[commandoIndex]?.requirement_id,
    'de volgorde klopt niet');

  // Een onderdeel aftekenen is gewoon aftekenen — maar het verschuift de
  // voortgang niet, want de eis blijft het oordeel van de instructeur.
  const knoop = (await one(`select id from requirements where code = 'roeien-12.t1.2'`)).id;
  await as(wim, () =>
    db.query(`select set_sign_off($1, $2, true, null)`, [samEnrollment, knoop]),
  );
  const afterKnoop = await as(wim, async () => {
    const r = await db.query('select * from member_enrollments($1, $2)', [jwf, sam]);
    return r.rows[0];
  });
  check('een onderdeel aftekenen kan',
    (await one(`select count(*)::int as n from sign_offs where requirement_id = '${knoop}'`)).n === 1);
  check('maar het telt niet mee als eis',
    Number(afterKnoop.theorie_done) === 0 && Number(afterKnoop.theorie_total) === 8,
    `${afterKnoop.theorie_done}/${afterKnoop.theorie_total}`);

  const mine = await as(wim, async () => {
    const r = await db.query('select * from member_enrollments($1, $2)', [jwf, sam]);
    return r.rows[0];
  });
  check('voortgang: 1 van 9 praktijk',
    Number(mine.praktijk_done) === 1 && Number(mine.praktijk_total) === 9,
    `${mine.praktijk_done}/${mine.praktijk_total}`);
  check('voortgang: 0 van 8 theorie',
    Number(mine.theorie_done) === 0 && Number(mine.theorie_total) === 8,
    `${mine.theorie_done}/${mine.theorie_total}`);
  check('de discipline komt mee', mine.discipline_name === 'Roeien');

  section('Drie standen');

  const eis2 = (await one(`select id from requirements where code = 'roeien-12.p2'`)).id;
  const progressOf = async () =>
    Number(
      (await as(wim, async () =>
        (await db.query('select * from member_enrollments($1, $2)', [jwf, sam])).rows[0],
      )).praktijk_done,
    );

  const bestaand = await one(
    `select status from sign_offs where enrollment_id = '${samEnrollment}' and requirement_id = '${eis1}'`,
  );
  check('een bestaande aftekening is gehaald', bestaand?.status === 'gehaald',
    bestaand?.status);

  const voor = await progressOf();
  await as(wim, () =>
    db.query(`select set_sign_off_status($1, $2, 'behandeld', 'nog een keer bij meer wind')`,
      [samEnrollment, eis2]),
  );
  check('behandeld onderweg telt niet mee', (await progressOf()) === voor,
    `${voor} → ${await progressOf()}`);

  await as(wim, () =>
    db.query(`select set_sign_off_status($1, $2, 'gehaald', null)`, [samEnrollment, eis2]),
  );
  check('gehaald telt wel', (await progressOf()) === voor + 1, `${await progressOf()}`);

  const bewaard = await one(
    `select note from sign_offs where enrollment_id = '${samEnrollment}' and requirement_id = '${eis2}'`,
  );
  check('de notitie blijft staan bij een nieuwe stand',
    bewaard?.note === 'nog een keer bij meer wind', bewaard?.note);

  await as(wim, () =>
    db.query(`select set_sign_off_status($1, $2, null, null)`, [samEnrollment, eis2]),
  );
  const weg = await one(
    `select count(*)::int as n from sign_offs where enrollment_id = '${samEnrollment}' and requirement_id = '${eis2}'`,
  );
  check('niet behandeld haalt de rij weg', weg.n === 0, `${weg.n}`);

  // De builds die nu op telefoons staan roepen nog de oude functie aan.
  await as(wim, () =>
    db.query(`select set_sign_off_status($1, $2, 'behandeld', null)`, [samEnrollment, eis2]),
  );
  await as(wim, () =>
    db.query(`select set_sign_off($1, $2, true, null)`, [samEnrollment, eis2]),
  );
  const oud = await one(
    `select status from sign_offs where enrollment_id = '${samEnrollment}' and requirement_id = '${eis2}'`,
  );
  check('de oude aan/uit-functie zet op gehaald', oud?.status === 'gehaald', oud?.status);
  await as(wim, () =>
    db.query(`select set_sign_off($1, $2, false, null)`, [samEnrollment, eis2]),
  );

  const lidStand = await refused(sam,
    `select set_sign_off_status($1, $2, 'gehaald', null)`, [samEnrollment, eis2]);
  check('een lid zet geen stand', lidStand !== null, 'het lukte wel');

  section('Bakken');

  const vlet = await as(wim, async () =>
    (await db.query(
      `insert into crews (group_id, name) values ($1, 'Vlet 1') returning id`, [jwf],
    )).rows[0].id,
  );
  check('een instructeur maakt een bak', Boolean(vlet));

  const lidBak = await refused(sam,
    `insert into crews (group_id, name) values ($1, 'Eigen bak')`, [jwf]);
  check('een lid maakt geen bak', lidBak !== null, 'het lukte wel');

  const ingedeeld = await refused(wim, 'select set_crew_members($1, $2)', [vlet, [sam, nina]]);
  check('een instructeur deelt de bak in', ingedeeld === null, ingedeeld ?? '');

  const vreemdeling = await refused(wim, 'select set_crew_members($1, $2)', [vlet, [ander]]);
  check('iemand van een andere groep kan er niet in', vreemdeling !== null, 'het lukte wel');

  const bemanning = await as(wim, async () =>
    (await db.query('select * from crew_roster($1)', [vlet])).rows,
  );
  check('de bak heeft twee opvarenden', bemanning.length === 2, `${bemanning.length}`);

  const blad = await as(wim, async () =>
    (await db.query('select * from crew_sheet($1, $2)', [vlet, eis1])).rows,
  );
  check('het overzicht toont iedereen in de bak', blad.length === 2, `${blad.length}`);
  const samRij = blad.find((r) => r.profile_id === sam);
  check('met de stand van wie al gehaald heeft', samRij?.status === 'gehaald',
    samRij?.status);

  // Nina is voor roeien ingeschreven; iemand die dat niet is komt er wel bij,
  // maar zonder opleiding.
  const kielboot1eis = (await one(`select id from requirements where code = 'kielboot-1.p1'`)).id;
  const kielBlad = await as(wim, async () =>
    (await db.query('select * from crew_sheet($1, $2)', [vlet, kielboot1eis])).rows,
  );
  check('wie niet ingeschreven is staat erbij zonder opleiding',
    kielBlad.length === 2 && kielBlad.every((r) => r.enrollment_id === null),
    JSON.stringify(kielBlad.map((r) => r.enrollment_id)));

  const bakDiplomas = await as(wim, async () =>
    (await db.query('select * from crew_diplomas($1)', [vlet])).rows,
  );
  check('de bak weet aan welke diploma’s hij werkt',
    bakDiplomas.some((d) => d.diploma_name === 'Roeien I/II'),
    JSON.stringify(bakDiplomas.map((d) => d.diploma_name)));

  const bakVoorLid = await as(sam, async () =>
    (await db.query('select * from crew_sheet($1, $2)', [vlet, eis1])).rows,
  );
  check('een lid krijgt het overzicht niet', bakVoorLid.length === 0, `${bakVoorLid.length}`);

  const bakVoorVreemde = await as(ander, async () =>
    (await db.query('select * from crews')).rows,
  );
  check('een andere groep ziet de bak niet', bakVoorVreemde.length === 0,
    `${bakVoorVreemde.length}`);

  section('De catalogus is van de beheerder');

  // Sinds 013 mag een beheerder de eisen bijwerken vanuit de beheerpagina —
  // anders blijft de sloep/motorvlet-lijst een SQL-plakoefening.
  const byAdmin = await refused(
    wim,
    `update requirements set title = 'Bijgewerkt' where code = 'roeien-12.p1'`,
  );
  const changed = await one(`select title from requirements where code = 'roeien-12.p1'`);
  check('een beheerder mag een eis bijwerken',
    byAdmin === null && changed.title === 'Bijgewerkt',
    `${byAdmin ?? changed.title}`);

  // ... en niemand anders.
  await refused(
    sam,
    `update requirements set title = 'Door een lid' where code = 'roeien-12.p1'`,
  );
  const afterLid = await one(`select title from requirements where code = 'roeien-12.p1'`);
  check('een lid niet', afterLid.title === 'Bijgewerkt', afterLid.title);

  await as(wim, () =>
    db.query(`update requirements set title = $1 where code = 'roeien-12.p1'`, [
      'Het schip vaarklaar en nachtklaar maken',
    ]),
  );

  await refused(
    sam,
    `insert into diplomas (discipline_id, code, name)
     select id, 'verzonnen', 'Verzonnen' from disciplines limit 1`,
  );
  const diplomaCount = await one('select count(*)::int as n from diplomas');
  check('en een lid kan er geen diploma bij zetten', diplomaCount.n === 12,
    `${diplomaCount.n}`);

  section('Leden zonder account');

  // De kern: iemand in het register zetten die zich nooit zal aanmelden.
  const pietId = await as(wim, async () => {
    const r = await db.query('select add_member($1, $2) as id', [jwf, 'Piet Zonder Telefoon']);
    return r.rows[0].id;
  });
  check('een instructeur voegt iemand zonder account toe', Boolean(pietId));

  const piet = await one(`select id, full_name from profiles where id = '${pietId}'`);
  check('hij staat in het register', piet.full_name === 'Piet Zonder Telefoon');

  const noAuth = await one(
    `select count(*)::int as n from auth.users where id = '${pietId}'`,
  );
  check('en heeft geen account', noAuth.n === 0, `${noAuth.n}`);

  const inList = await as(wim, async () => {
    const r = await db.query('select * from group_members($1)', [jwf]);
    return r.rows.some((m) => m.full_name === 'Piet Zonder Telefoon');
  });
  check('hij staat in de ledenlijst', inList);

  // Waar het om begonnen was: hij moet een opleiding kunnen krijgen.
  const pietEnrollment = await as(wim, async () => {
    const r = await db.query(
      `insert into enrollments (group_id, profile_id, diploma_id, created_by)
       values ($1, $2, $3, $4) returning id`,
      [jwf, pietId, roeien12, wim],
    );
    return r.rows[0].id;
  });
  await as(wim, () =>
    db.query(`select set_sign_off($1, $2, true, null)`, [pietEnrollment, eis1]),
  );
  const pietProgress = await as(wim, async () => {
    const r = await db.query('select * from member_enrollments($1, $2)', [jwf, pietId]);
    return r.rows[0];
  });
  check('en kan afgetekend worden als ieder ander',
    Number(pietProgress.praktijk_done) === 1, `${pietProgress?.praktijk_done}`);

  await as(wim, () =>
    db.query('select set_member_name($1, $2, $3)', [jwf, pietId, 'Piet de Vries']),
  );
  const renamed = await one(`select full_name from profiles where id = '${pietId}'`);
  check('een instructeur corrigeert zijn naam', renamed.full_name === 'Piet de Vries',
    renamed.full_name);

  const byOutsider = await refused(ander, 'select add_member($1, $2)', [jwf, 'Indringer']);
  check('iemand van buiten voegt niets toe', byOutsider !== null, 'het lukte wel');

  const renameByLid = await refused(sam, 'select set_member_name($1, $2, $3)', [
    jwf, pietId, 'Gehackt',
  ]);
  check('een lid hernoemt niemand', renameByLid !== null, 'het lukte wel');

  section('Speltakken');

  await db.exec(
    `insert into sections (group_id, name) values ('${jwf}', 'Zeeverkenners'), ('${jwf}', 'Wilde Vaart')`,
  );
  const zv = (await one(`select id from sections where name = 'Zeeverkenners'`)).id;
  const wv = (await one(`select id from sections where name = 'Wilde Vaart'`)).id;

  const assigned = await refused(wim, 'select set_member_sections($1, $2, $3)', [
    jwf,
    sam,
    [zv, wv],
  ]);
  check('een beheerder wijst speltakken toe', assigned === null, assigned ?? '');

  const samRow = await as(wim, async () => {
    const r = await db.query('select * from group_members($1)', [jwf]);
    return r.rows.find((m) => m.full_name === 'Sam het Lid');
  });
  check('de ledenlijst geeft de namen terug',
    (samRow?.sections ?? []).length === 2, JSON.stringify(samRow?.sections));
  check('en de ids, zodat er gefilterd kan worden',
    (samRow?.section_ids ?? []).length === 2, JSON.stringify(samRow?.section_ids));

  // Opnieuw zetten vervangt de set in plaats van er iets bij te stapelen.
  await as(wim, () =>
    db.query('select set_member_sections($1, $2, $3)', [jwf, sam, [wv]]),
  );
  const afterReplace = await one(
    `select count(*)::int as n from membership_sections ms
     join memberships m on m.id = ms.membership_id
     where m.profile_id = '${sam}'`,
  );
  check('opnieuw toewijzen vervangt de hele set', afterReplace.n === 1, `${afterReplace.n}`);

  const byMember = await refused(sam, 'select set_member_sections($1, $2, $3)', [
    jwf,
    sam,
    [zv],
  ]);
  check('een lid wijst zichzelf niets toe', byMember !== null, 'het lukte wel');

  // Een speltak uit een andere groep zou hier binnen kunnen glippen, want de
  // functie draait als eigenaar en de policies kijken niet mee.
  await db.exec(`insert into sections (group_id, name) values ('${other}', 'Vreemde Speltak')`);
  const foreign = (await one(`select id from sections where name = 'Vreemde Speltak'`)).id;
  const crossedSection = await refused(wim, 'select set_member_sections($1, $2, $3)', [
    jwf,
    sam,
    [foreign],
  ]);
  check('een speltak van een andere groep wordt geweigerd', crossedSection !== null,
    'het lukte wel');

  section('Iemand uit de groep halen');

  const gone = await refused(wim, 'select remove_member($1, $2)', [jwf, nina]);
  check('een beheerder haalt iemand eruit', gone === null, gone ?? '');
  check('en die staat niet meer in de ledenlijst',
    (await as(wim, async () => (await db.query('select * from group_members($1)', [jwf])).rows))
      .every((m) => m.full_name !== 'Nina het Lid'));

  // De aftekeningen blijven: komt ze terug, dan staat haar lijst er weer.
  const kept = await one(
    `select count(*)::int as n from enrollments where profile_id = '${nina}'`,
  );
  check('haar voortgang blijft bewaard', kept.n === 1, `${kept.n}`);

  const byLid = await refused(sam, 'select remove_member($1, $2)', [jwf, wim]);
  check('een lid kan niemand verwijderen', byLid !== null, 'het lukte wel');

  const lastOne = await refused(wim, 'select remove_member($1, $2)', [jwf, wim]);
  check('de laatste beheerder kan zichzelf er niet uit halen', lastOne !== null,
    'het lukte wel');

  const rawDelete = await refused(
    wim,
    'delete from memberships where group_id = $1 and profile_id = $2',
    [jwf, sam],
  );
  const samStill = await one(
    `select count(*)::int as n from memberships where group_id = '${jwf}' and profile_id = '${sam}'`,
  );
  check('en verwijderen kan niet om remove_member heen',
    rawDelete !== null || samStill.n === 1, `${samStill.n}`);

  // Nina hoort er weer bij voor de tests die hierna komen.
  await db.exec(
    `insert into memberships (group_id, profile_id, role)
     values ('${jwf}', '${nina}', 'lid')`,
  );

  section('De laatste beheerder');

  // Dit is de fout die één keer echt gemaakt is: de enige beheerder tikt
  // zichzelf op 'lid' en kan daarna niets meer, ook zijn eigen rol niet terug.
  const selfDemote = await refused(
    wim,
    `update memberships set role = 'lid' where group_id = $1 and profile_id = $2`,
    [jwf, wim],
  );
  check('de enige beheerder kan zichzelf niet degraderen', selfDemote !== null,
    'het lukte wel');
  check('en de melding zegt waarom',
    (selfDemote ?? '').includes('laatste beheerder'), selfDemote ?? '');

  const stillAdmin = await one(
    `select role from memberships where group_id = '${jwf}' and profile_id = '${wim}'`,
  );
  check('hij is nog steeds beheerder', stillAdmin.role === 'beheerder', stillAdmin.role);

  // Een lid degraderen of promoveren raakt de regel niet.
  await as(wim, () =>
    db.query(
      `update memberships set role = 'instructeur' where group_id = $1 and profile_id = $2`,
      [jwf, nina],
    ),
  );
  const ninaRole = await one(
    `select role from memberships where group_id = '${jwf}' and profile_id = '${nina}'`,
  );
  check('een lid promoveren kan gewoon', ninaRole.role === 'instructeur', ninaRole.role);

  // Met een tweede beheerder mag het wel — dat is de nette volgorde.
  await as(wim, () =>
    db.query(
      `update memberships set role = 'beheerder' where group_id = $1 and profile_id = $2`,
      [jwf, sam],
    ),
  );
  const nowAllowed = await refused(
    wim,
    `update memberships set role = 'lid' where group_id = $1 and profile_id = $2`,
    [jwf, wim],
  );
  check('met een tweede beheerder mag het wel', nowAllowed === null, nowAllowed ?? '');

  // En nu is Sam de laatste, dus die zit weer vast.
  const samLast = await refused(
    sam,
    `update memberships set role = 'instructeur' where group_id = $1 and profile_id = $2`,
    [jwf, sam],
  );
  check('de nieuwe laatste beheerder zit er ook aan vast', samLast !== null,
    'het lukte wel');

  report();
  process.exit(failures === 0 ? 0 : 1);
}

function report() {
  console.log(
    `\n${checks - failures}/${checks} goed${failures ? ` — ${failures} FOUT` : ''}\n`,
  );
}

async function one(sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows[0];
}

async function newUser(email, name) {
  const r = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
    [email, name],
  );
  return r.rows[0].id;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
