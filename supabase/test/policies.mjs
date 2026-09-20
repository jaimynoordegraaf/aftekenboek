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

  for (const file of [
    '001-core.sql',
    '002-rls.sql',
    '003-rpc.sql',
    '010-eisen.sql',
    '011-laatste-beheerder.sql',
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

  const roeien = await one(`
    select
      count(*) filter (where kind = 'praktijk')::int as p,
      count(*) filter (where kind = 'theorie')::int  as t
    from requirements r
    join diplomas d on d.id = r.diploma_id
    where d.code = 'roeien-12'
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
    where r.detail is null and d.code not like 'sloep-%'
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
  check('de aftekenlijst heeft alle 17 eisen', sheet.length === 17, `${sheet.length}`);
  check('precies één eis is afgetekend',
    sheet.filter((r) => r.signed_at !== null).length === 1);
  check('praktijk staat voor theorie', sheet[0].kind === 'praktijk');
  check('de nummering volgt het handboek', sheet[0].position === 1);

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

  section('De catalogus staat vast');

  const tamper = await refused(
    wim,
    `update requirements set title = 'Zelf verzonnen' where code = 'roeien-12.p1'`,
  );
  const changed = await one(`select title from requirements where code = 'roeien-12.p1'`);
  check('zelfs een beheerder kan de eisen niet wijzigen',
    tamper !== null || changed.title !== 'Zelf verzonnen');

  const addDiploma = await refused(
    wim,
    `insert into diplomas (discipline_id, code, name)
     select id, 'verzonnen', 'Verzonnen' from disciplines limit 1`,
  );
  const diplomaCount = await one('select count(*)::int as n from diplomas');
  check('en er kan geen diploma bij via de app',
    addDiploma !== null || diplomaCount.n === 12);

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
