-- aftekenboek — het hele schema in één bestand.
--
-- Dit is 001-core.sql, 002-rls.sql, 003-rpc.sql en 010-eisen.sql achter elkaar,
-- voor een nieuw Supabase-project. Draai op een bestaand project de losse
-- genummerde bestanden. Gegenereerd — bewerk de genummerde bestanden.


-- ============================================================ 001-core.sql

-- aftekenboek — core schema
--
-- Three layers, and they are deliberately separate:
--
--   1. tenancy    groups, speltakken, people, roles — per Scoutinggroep
--   2. catalogue  the Watersport Academy diploma's and their eisen — landelijk,
--                 identical for every groep, and never edited from the app
--   3. progress   who is working towards what, and which eisen are afgetekend
--
-- The catalogue is global on purpose. The eisen are landelijk vastgesteld; if
-- every groep kept its own copy they would drift apart, and an afgetekende eis
-- would stop meaning the same thing. Corrections are made in 010-eisen.sql and
-- re-run — that file upserts on a stable `code`, so ids survive and nothing
-- that was already afgetekend is lost.
--
-- Run this once in the Supabase SQL editor. See supabase/README.md.

-- ---------------------------------------------------------------- types

-- 'instructeur' is this app's leiding: the only role that may aftekenen.
create type member_role as enum ('beheerder', 'instructeur', 'lid');

create type requirement_kind as enum ('praktijk', 'theorie');

-- ---------------------------------------------------------------- tenancy

create table groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  accent_color text not null default '#14445F',
  created_at   timestamptz not null default now()
);

-- speltakken: Zeeverkenners, Wilde Vaart, Loodsen, Stam, ...
create table sections (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  name       text not null,
  color      text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

-- one row per signed-in person, 1:1 with auth.users
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  role       member_role not null default 'lid',
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);

create index on memberships (profile_id);
create index on memberships (group_id);

create table membership_sections (
  membership_id uuid not null references memberships (id) on delete cascade,
  section_id    uuid not null references sections (id) on delete cascade,
  primary key (membership_id, section_id)
);

create index on membership_sections (section_id);

-- invite codes; the only way into a groep
create table invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  code       text not null unique,
  role       member_role not null default 'lid',
  section_id uuid references sections (id) on delete set null,
  label      text,
  expires_at timestamptz,
  max_uses   int not null default 1,
  uses       int not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalogue

-- Roeien, Zeilen (kielboot), Buitenboordmotor, Sloep/Motorvlet.
create table disciplines (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  subtitle   text,
  sort_order int not null default 0
);

create table diplomas (
  id            uuid primary key default gen_random_uuid(),
  discipline_id uuid not null references disciplines (id) on delete cascade,
  code          text not null unique,
  name          text not null,
  -- "I/II", "III" — the level as it is printed on the diploma
  level_label   text,
  -- the one-paragraph description of what the holder is trusted to do
  summary       text,
  -- how long a passed theorie-examen stays valid; 18 months landelijk
  theory_valid_months int not null default 18,
  source        text,
  sort_order    int not null default 0,
  -- the other half of the composite key that sign_offs points at
  unique (id, discipline_id)
);

create index on diplomas (discipline_id);

create table requirements (
  id         uuid primary key default gen_random_uuid(),
  diploma_id uuid not null references diplomas (id) on delete cascade,
  code       text not null unique,
  kind       requirement_kind not null,
  -- the number it carries in the handboek, so instructeur and boekje match
  position   int not null,
  title      text not null,
  -- the "toelichting op de eisen" where the handboek gives one
  detail     text,
  unique (diploma_id, kind, position),
  unique (id, diploma_id)
);

create index on requirements (diploma_id);

-- ---------------------------------------------------------------- progress

-- One member working towards one diploma.
create table enrollments (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references groups (id) on delete cascade,
  profile_id       uuid not null references profiles (id) on delete cascade,
  diploma_id       uuid not null references diplomas (id) on delete restrict,
  started_on       date not null default current_date,
  -- the landelijke theorie-examen; the praktijkexamen needs a valid one
  theory_passed_on date,
  -- set when the diploma itself has been handed out
  awarded_on       date,
  note             text,
  created_by       uuid references profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (group_id, profile_id, diploma_id),
  unique (id, diploma_id)
);

create index on enrollments (group_id);
create index on enrollments (profile_id);

-- One eis, afgetekend. The row existing is the aftekening; removing it undoes
-- it. `signed_by` is never the candidate: only instructeurs may write here,
-- and the policy pins it to auth.uid(), so the name on an aftekening is always
-- the person who was actually there.
create table sign_offs (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null,
  requirement_id uuid not null,
  -- carried so the database itself can refuse an eis from another diploma
  diploma_id     uuid not null,
  signed_by      uuid references profiles (id) on delete set null,
  signed_at      timestamptz not null default now(),
  note           text,
  unique (enrollment_id, requirement_id),
  foreign key (enrollment_id, diploma_id)
    references enrollments (id, diploma_id) on delete cascade,
  foreign key (requirement_id, diploma_id)
    references requirements (id, diploma_id) on delete cascade
);

create index on sign_offs (enrollment_id);

-- ---------------------------------------------------------------- helpers
-- security definer, so policies that consult membership do not recurse into
-- the policies on memberships itself.

create or replace function is_member (gid uuid)
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships m
    where m.group_id = gid and m.profile_id = auth.uid()
  );
$fn$;

-- Instructeurs and beheerders: the people who may aftekenen and who see
-- everyone's voortgang.
create or replace function is_staff (gid uuid)
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships m
    where m.group_id = gid and m.profile_id = auth.uid()
      and m.role in ('beheerder', 'instructeur')
  );
$fn$;

create or replace function is_admin (gid uuid)
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships m
    where m.group_id = gid and m.profile_id = auth.uid() and m.role = 'beheerder'
  );
$fn$;

create or replace function shares_group (pid uuid)
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships a
    join memberships b on b.group_id = a.group_id
    where a.profile_id = auth.uid() and b.profile_id = pid
  );
$fn$;

create or replace function is_staff_over (pid uuid)
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships a
    join memberships b on b.group_id = a.group_id
    where a.profile_id = auth.uid()
      and a.role in ('beheerder', 'instructeur')
      and b.profile_id = pid
  );
$fn$;

create or replace function membership_group (mid uuid)
  returns uuid language sql stable security definer set search_path = public as $fn$
  select group_id from memberships where id = mid;
$fn$;

-- the groep and the candidate behind an enrollment, without tripping its policy
create or replace function enrollment_group (eid uuid)
  returns uuid language sql stable security definer set search_path = public as $fn$
  select group_id from enrollments where id = eid;
$fn$;

create or replace function enrollment_profile (eid uuid)
  returns uuid language sql stable security definer set search_path = public as $fn$
  select profile_id from enrollments where id = eid;
$fn$;

-- ---------------------------------------------------------------- counts
--
-- security_invoker: the view is read with the caller's own rights, so the
-- policies on enrollments and sign_offs still apply. Without it a view owned
-- by postgres would hand every groep's voortgang to anyone who asked.

create view enrollment_progress
  with (security_invoker = true) as
  select
    e.id                                           as enrollment_id,
    count(r.id) filter (where r.kind = 'praktijk') as praktijk_total,
    count(s.id) filter (where r.kind = 'praktijk') as praktijk_done,
    count(r.id) filter (where r.kind = 'theorie')  as theorie_total,
    count(s.id) filter (where r.kind = 'theorie')  as theorie_done,
    count(r.id)                                    as total,
    count(s.id)                                    as done
  from enrollments e
  join requirements r on r.diploma_id = e.diploma_id
  left join sign_offs s
    on s.enrollment_id = e.id and s.requirement_id = r.id
  group by e.id;

-- ---------------------------------------------------------------- bootstrap
-- A profile row is created for every new auth user, so the app never has to
-- guess whether one exists.

create or replace function handle_new_user ()
  returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user ();

-- ============================================================ 002-rls.sql

-- aftekenboek — row level security
--
-- Two rules run through all of it:
--
--   * You only ever reach a groep you are a member of.
--   * Aftekenen is an instructeur's act. A kandidaat can read their own
--     voortgang and nothing else about it — they cannot add an eis to their
--     own lijst, cannot tick one off, and cannot untick one.
--
-- The catalogue is the exception: every signed-in person may read the eisen of
-- every diploma, because that is what makes the app useful to a lid who wants
-- to know what is still coming. Nobody may write to it through the API at all
-- — it is maintained by running 010-eisen.sql in the SQL editor.
--
-- Run after 001-core.sql.

-- ---------------------------------------------------------------- enable RLS

alter table groups              enable row level security;
alter table sections            enable row level security;
alter table profiles            enable row level security;
alter table memberships         enable row level security;
alter table membership_sections enable row level security;
alter table invites             enable row level security;
alter table disciplines         enable row level security;
alter table diplomas            enable row level security;
alter table requirements        enable row level security;
alter table enrollments         enable row level security;
alter table sign_offs           enable row level security;

-- ---------------------------------------------------------------- groups

create policy groups_read on groups
  for select to authenticated using (is_member(id));

create policy groups_admin_update on groups
  for update to authenticated using (is_admin(id)) with check (is_admin(id));

-- ---------------------------------------------------------------- sections

create policy sections_read on sections
  for select to authenticated using (is_member(group_id));

create policy sections_admin_write on sections
  for all to authenticated using (is_admin(group_id)) with check (is_admin(group_id));

-- ---------------------------------------------------------------- profiles

-- Your own row, and the rows of people in your groep. A lid needs the second
-- half: an aftekening carries the name of the instructeur who gave it, and a
-- name it cannot read would show up as an empty line.
create policy profiles_read on profiles
  for select to authenticated using (id = auth.uid() or shares_group(id));

create policy profiles_insert_self on profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- memberships

create policy memberships_read on memberships
  for select to authenticated using (is_member(group_id));

create policy memberships_admin_write on memberships
  for all to authenticated using (is_admin(group_id)) with check (is_admin(group_id));

create policy membership_sections_read on membership_sections
  for select to authenticated using (is_member(membership_group(membership_id)));

create policy membership_sections_admin_write on membership_sections
  for all to authenticated
  using (is_admin(membership_group(membership_id)))
  with check (is_admin(membership_group(membership_id)));

-- ---------------------------------------------------------------- invites

create policy invites_staff_read on invites
  for select to authenticated using (is_staff(group_id));

create policy invites_admin_write on invites
  for all to authenticated using (is_admin(group_id)) with check (is_admin(group_id));

-- ---------------------------------------------------------------- catalogue
--
-- Read-only, for everyone who is signed in. There is deliberately no insert,
-- update or delete policy: with RLS on and no write policy, the API refuses
-- every write, whoever asks.

create policy disciplines_read on disciplines
  for select to authenticated using (true);

create policy diplomas_read on diplomas
  for select to authenticated using (true);

create policy requirements_read on requirements
  for select to authenticated using (true);

-- ---------------------------------------------------------------- enrollments

-- Instructeurs see everyone in their groep; a lid sees only their own.
create policy enrollments_read on enrollments
  for select to authenticated
  using (is_staff(group_id) or profile_id = auth.uid());

create policy enrollments_staff_write on enrollments
  for all to authenticated
  using (is_staff(group_id))
  with check (is_staff(group_id));

-- ---------------------------------------------------------------- sign_offs

create policy sign_offs_read on sign_offs
  for select to authenticated
  using (
    is_staff(enrollment_group(enrollment_id))
    or enrollment_profile(enrollment_id) = auth.uid()
  );

-- `signed_by = auth.uid()` is the whole point: an instructeur can aftekenen,
-- but not in someone else's name.
create policy sign_offs_staff_insert on sign_offs
  for insert to authenticated
  with check (
    is_staff(enrollment_group(enrollment_id))
    and signed_by = auth.uid()
  );

create policy sign_offs_staff_update on sign_offs
  for update to authenticated
  using (is_staff(enrollment_group(enrollment_id)))
  with check (
    is_staff(enrollment_group(enrollment_id))
    and signed_by = auth.uid()
  );

create policy sign_offs_staff_delete on sign_offs
  for delete to authenticated
  using (is_staff(enrollment_group(enrollment_id)));

-- ============================================================ 003-rpc.sql

-- aftekenboek — the calls the app makes that policies alone cannot express
--
-- Every function here is `security definer`, which means it runs with the
-- rights of its owner and RLS does not apply inside it. So each one checks
-- `auth.uid()` itself, at the top. Those checks are the only thing between a
-- caller and another groep's data — do not remove one to "simplify".
--
-- Run after 002-rls.sql.

-- ---------------------------------------------------------------- create a groep

create or replace function create_group (p_name text, p_slug text)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'naam is verplicht';
  end if;

  insert into groups (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning id into gid;

  insert into memberships (group_id, profile_id, role)
  values (gid, auth.uid(), 'beheerder');

  return gid;
end;
$fn$;

-- ---------------------------------------------------------------- join a groep
-- The member never reads the invites table; they hand over a code and this
-- decides. Returns the groep they are now in.

create or replace function redeem_invite (p_code text)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  inv invites%rowtype;
  mid uuid;
  -- A use is only spent when the code actually did something. Someone already
  -- in the groep entering it again is harmless and must not burn the code a
  -- new member is waiting for.
  changed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;

  select * into inv from invites
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Deze code kennen we niet';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Deze code is verlopen';
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'Deze code is al gebruikt';
  end if;

  select id into mid from memberships
  where group_id = inv.group_id and profile_id = auth.uid();

  if mid is null then
    insert into memberships (group_id, profile_id, role)
    values (inv.group_id, auth.uid(), inv.role)
    returning id into mid;
    changed := true;
  end if;

  if inv.section_id is not null then
    insert into membership_sections (membership_id, section_id)
    values (mid, inv.section_id)
    on conflict do nothing;
    if found then changed := true; end if;
  end if;

  if changed then
    update invites set uses = uses + 1 where id = inv.id;
  end if;

  return inv.group_id;
end;
$fn$;

-- ---------------------------------------------------------------- de vaarders
-- The ledenlijst an instructeur opens: everyone in the groep, with how many
-- diploma's they are working on and how many they already have. Staff only —
-- a lid has no business with a list of everyone else's voortgang.

create or replace function group_members (p_group uuid)
  returns table (
    profile_id uuid,
    full_name  text,
    role       member_role,
    sections   text[],
    in_progress bigint,
    awarded     bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select
    p.id,
    p.full_name,
    m.role,
    coalesce(
      (select array_agg(s.name order by s.sort_order, s.name)
       from membership_sections ms
       join sections s on s.id = ms.section_id
       where ms.membership_id = m.id),
      '{}'
    ),
    (select count(*) from enrollments e
     where e.group_id = p_group and e.profile_id = p.id and e.awarded_on is null),
    (select count(*) from enrollments e
     where e.group_id = p_group and e.profile_id = p.id and e.awarded_on is not null)
  from memberships m
  join profiles p on p.id = m.profile_id
  where m.group_id = p_group
    and is_staff(p_group)
  order by p.full_name;
$fn$;

-- ---------------------------------------------------------------- voortgang
-- The diploma's one person is working towards, with the counts that drive the
-- progress bars. Pass p_profile to look at one member; leave it null for the
-- caller's own. A lid can only ever get their own rows back.

create or replace function member_enrollments (p_group uuid, p_profile uuid default null)
  returns table (
    enrollment_id    uuid,
    profile_id       uuid,
    full_name        text,
    diploma_id       uuid,
    diploma_code     text,
    diploma_name     text,
    level_label      text,
    discipline_code  text,
    discipline_name  text,
    theory_valid_months int,
    started_on       date,
    theory_passed_on date,
    awarded_on       date,
    note             text,
    praktijk_total   bigint,
    praktijk_done    bigint,
    theorie_total    bigint,
    theorie_done     bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select
    e.id, e.profile_id, p.full_name,
    d.id, d.code, d.name, d.level_label,
    disc.code, disc.name, d.theory_valid_months,
    e.started_on, e.theory_passed_on, e.awarded_on, e.note,
    count(r.id) filter (where r.kind = 'praktijk'),
    count(s.id) filter (where r.kind = 'praktijk'),
    count(r.id) filter (where r.kind = 'theorie'),
    count(s.id) filter (where r.kind = 'theorie')
  from enrollments e
  join profiles p on p.id = e.profile_id
  join diplomas d on d.id = e.diploma_id
  join disciplines disc on disc.id = d.discipline_id
  join requirements r on r.diploma_id = d.id
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  where e.group_id = p_group
    and e.profile_id = coalesce(p_profile, auth.uid())
    -- the guard: staff may look at anyone in their groep, everyone else only
    -- at themselves
    and (is_staff(p_group) or coalesce(p_profile, auth.uid()) = auth.uid())
    and is_member(p_group)
  -- the primary keys are enough: everything else selected from those tables is
  -- functionally dependent on them
  group by e.id, p.full_name, d.id, disc.id
  order by e.awarded_on nulls first, disc.sort_order, d.sort_order;
$fn$;

-- ---------------------------------------------------------------- de aftekenlijst
-- One enrollment, every eis, and who signed it off when. This is the screen
-- the app spends most of its time on, so it is one round trip.

create or replace function enrollment_sheet (p_enrollment uuid)
  returns table (
    requirement_id uuid,
    kind           requirement_kind,
    -- quoted: `position` is a keyword, and a returns-table column called that
    -- is a syntax error where a table column of the same name is fine
    "position"     int,
    title          text,
    detail         text,
    signed_at      timestamptz,
    signed_by      uuid,
    signed_by_name text,
    note           text
  )
  language sql stable security definer set search_path = public as $fn$
  select
    r.id, r.kind, r.position, r.title, r.detail,
    s.signed_at, s.signed_by, sp.full_name, s.note
  from enrollments e
  join requirements r on r.diploma_id = e.diploma_id
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  left join profiles sp on sp.id = s.signed_by
  where e.id = p_enrollment
    and (is_staff(e.group_id) or e.profile_id = auth.uid())
  order by r.kind, r.position;
$fn$;

-- ---------------------------------------------------------------- aftekenen
-- Toggling one eis. Doing it here rather than from the app means the
-- enrollment's diploma_id is filled in by the database, so a sign_off can
-- never point at an eis from another diploma, and `signed_by` is never
-- anything but the caller.

create or replace function set_sign_off (
  p_enrollment uuid,
  p_requirement uuid,
  p_signed boolean,
  p_note text default null
)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  e enrollments%rowtype;
begin
  select * into e from enrollments where id = p_enrollment;
  if not found then
    raise exception 'Deze opleiding bestaat niet';
  end if;
  if not is_staff(e.group_id) then
    raise exception 'Alleen instructeurs kunnen aftekenen';
  end if;
  if not exists (
    select 1 from requirements r
    where r.id = p_requirement and r.diploma_id = e.diploma_id
  ) then
    raise exception 'Deze eis hoort niet bij dit diploma';
  end if;

  if p_signed then
    insert into sign_offs (enrollment_id, requirement_id, diploma_id, signed_by, note)
    values (p_enrollment, p_requirement, e.diploma_id, auth.uid(), nullif(trim(coalesce(p_note, '')), ''))
    on conflict (enrollment_id, requirement_id) do update
      set signed_by = auth.uid(),
          signed_at = now(),
          note      = excluded.note;
  else
    delete from sign_offs
    where enrollment_id = p_enrollment and requirement_id = p_requirement;
  end if;
end;
$fn$;

-- ============================================================ 010-eisen.sql

-- aftekenboek — de diploma's en hun eisen
--
-- This file is the catalogue. It is written to be run again, as often as you
-- like: every row upserts on its `code`, so ids stay the same and aftekeningen
-- that already exist keep pointing at the same eis. That is what makes it safe
-- to correct a typo, sharpen a toelichting or add a diploma and re-run the
-- whole file against a database that is already in use.
--
-- Source per diploma is in the `source` column and in docs/EISEN.md. Where the
-- handboek is ambiguous the list here is deliberately the longer one: an eis
-- too many is visible on screen and can be deleted, an eis that is missing is
-- invisible and gets forgotten.
--
-- Strings are dollar-quoted ($$...$$) throughout, so an apostrophe in
-- "Roeicommando's" needs no escaping and cannot silently break the file.
--
-- Run after 003-rpc.sql.

-- ---------------------------------------------------------------- disciplines

insert into disciplines (code, name, subtitle, sort_order) values
  ('roeien',   $$Roeien$$,            $$Roeivlet$$,               1),
  ('kielboot', $$Zeilen$$,            $$Kielboot$$,               2),
  ('bbm',      $$Buitenboordmotor$$,  $$Boot met buitenboordmotor$$, 3),
  ('sloep',    $$Sloep en motorvlet$$, $$Motorvaren$$,            4)
on conflict (code) do update set
  name       = excluded.name,
  subtitle   = excluded.subtitle,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- diploma's

insert into diplomas (discipline_id, code, name, level_label, summary, sort_order, source)
select d.id, v.code, v.name, v.level_label, v.summary, v.sort_order, v.source
from (values
  ('roeien', 'roeien-12', $$Roeien I/II$$, $$I/II$$,
   $$Voor wie onder niet te moeilijke omstandigheden op meren en plassen kan varen in een roeivlet: niet te druk vaarwater, overdag, met voldoende zicht.$$,
   1, $$Handboek Opleidingen deel 3.2 Roeien (2015), §3.2.4$$),

  ('roeien', 'roeien-3', $$Roeien III$$, $$III$$,
   $$Voor wie het commando kan voeren over een roeivlet met een groep roeiers, op meren, plassen en kanalen tot en met windkracht 5 Beaufort.$$,
   2, $$Handboek Opleidingen deel 3.2 Roeien (2015), §3.2.5$$),

  ('kielboot', 'kielboot-1', $$Kielboot I$$, $$I$$,
   $$Voor wie onder gunstige omstandigheden kan zeilen: rustig vaarwater en matige wind tot en met 3 Beaufort, in een boot van minstens 200 kg met maximaal 20 m² zeil.$$,
   1, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.4$$),

  ('kielboot', 'kielboot-2', $$Kielboot II$$, $$II$$,
   $$Voor wie onder niet te moeilijke omstandigheden op meren en plassen kan zeilen, overdag en met voldoende zicht, tot en met windkracht 4 Beaufort.$$,
   2, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.5$$),

  ('kielboot', 'kielboot-3', $$Kielboot III$$, $$III$$,
   $$Voor wie tot en met windkracht 6 zelfstandig kan varen op meren, plassen en kanalen, in een boot van minstens 200 kg met maximaal 30 m² zeil.$$,
   3, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.6$$),

  ('kielboot', 'kielboot-4', $$Kielboot IV$$, $$IV$$,
   $$Voor wie onder alle omstandigheden kan varen. Alleen te halen met een examen onder toezicht van een erkend examinator, bij 7 tot 25 knopen wind. Gelijk aan het eigenvaardigheidsniveau van de Zeilinstructeur 3-opleiding.$$,
   4, $$Handboek Opleidingen deel 3.1 Kielboot (2015), §3.1.7$$),

  ('bbm', 'bbm-12', $$Buitenboordmotor I/II$$, $$I/II$$,
   $$Voor wie onder eenvoudige omstandigheden met een buitenboordmotor vaart: tot en met windkracht 3 Beaufort, bij daglicht, op meren en kanalen.$$,
   1, $$Handboek Opleidingen deel 3.3 Buitenboordmotor (2015), §3.3.4$$),

  ('bbm', 'bbm-3', $$Buitenboordmotor III$$, $$III$$,
   $$Voor wie tot en met windkracht 5 Beaufort zelfstandig vaart op meren en kanalen, vaarwater klasse 1 t/m 4.$$,
   2, $$Handboek Opleidingen deel 3.3 Buitenboordmotor (2015), §3.3.5$$),

  ('sloep', 'sloep-1', $$Bemanningslid$$, $$CWO I$$,
   $$Vanaf 12 jaar. Kan onder verantwoordelijkheid van de schipper als bemanningslid op een sloep of motorvlet meedraaien.$$,
   1, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.1 en §4.1$$),

  ('sloep', 'sloep-2', $$Dagschipper$$, $$CWO II$$,
   $$Vanaf 16 jaar. Vaart, manoeuvreert en navigeert zelfstandig bij daglicht tot windkracht 4, en geeft daarbij leiding aan de bemanning.$$,
   2, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.2 en §4.1$$),

  ('sloep', 'sloep-3', $$Schipper$$, $$CWO III$$,
   $$Vanaf 18 jaar. Vaart zelfstandig bij dag en nacht tot windkracht 6 en geeft onder alle omstandigheden leiding aan de bemanning. Eigenvaardigheidsniveau van Instructeur I-2.$$,
   3, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.3 en §4.1$$),

  ('sloep', 'sloep-4', $$All Round Schipper$$, $$CWO IV$$,
   $$Vanaf 18 jaar. Draagt de eindverantwoordelijkheid voor bemanning en schip op meerdaagse tochten naar onbekende bestemmingen. Instapeis: een tochtplanning voor een door de examinator opgegeven tocht.$$,
   4, $$Handboek Opleidingen deel 3.4 Motorboot / Sloep- en motorvletvaren (2020), §2.4 en §4.1$$)
) as v(discipline, code, name, level_label, summary, sort_order, source)
join disciplines d on d.code = v.discipline
on conflict (code) do update set
  discipline_id = excluded.discipline_id,
  name          = excluded.name,
  level_label   = excluded.level_label,
  summary       = excluded.summary,
  sort_order    = excluded.sort_order,
  source        = excluded.source;

-- ---------------------------------------------------------------- de eisen
--
-- `position` is the number the eis carries in the handboek, so the lijst on
-- screen and het boekje in de hand tellen gelijk op.

insert into requirements (diploma_id, code, kind, position, title, detail)
select dp.id, v.code, v.kind::requirement_kind, v.position, v.title, v.detail
from (values

-- ---------------- Roeien I/II — praktijk
('roeien-12', 'roeien-12.p1',  'praktijk', 1, $$Het schip vaarklaar en nachtklaar maken$$,
 $$Inventaris controleren, schip schoon en droog maken. Riemen juist neerleggen: blad naar de boeg, wrikriem aan stuurboord met het blad naar de spiegel. Controleren op lek- en regenwater. Voor iedere opvarende een reddingvest aan boord, bij voorkeur aangetrokken.$$),
('roeien-12', 'roeien-12.p2',  'praktijk', 2, $$Verhalen van het schip$$,
 $$Zonder motor. Alle manieren op spierkracht mogen, zolang het geen gevaar oplevert voor bemanning, materiaal of andere scheepvaart. Op het schip zelf zo veel mogelijk vanuit de kuip werken.$$),
('roeien-12', 'roeien-12.p3',  'praktijk', 3, $$Roeicommando's uitvoeren$$,
 $$Op bevel van de schipper kunnen uitvoeren: dollen in; los voor en los achter; op riemen; haalt op gelijk; stopt af; strijkt gelijk; zet af; riemen lopen; riemen geroeid. De commando's kunnen vooraf worden gegaan door 'beide boorden', 'stuurboord' of 'bakboord'.$$),
('roeien-12', 'roeien-12.p4',  'praktijk', 4, $$Aanleg met de punt van het schip$$,
 $$In de wind aanleggen op een vooraf aangewezen punt, met roeicommando's, zó dat het schip zonder noemenswaardige kracht afgehouden kan worden. De instructeur mag aanwijzingen geven om het veilig te laten verlopen.$$),
('roeien-12', 'roeien-12.p5',  'praktijk', 5, $$Een acht varen$$,
 $$Zonder noemenswaardig roergebruik: twee rondjes in tegengestelde richting. De bochten worden gemaakt door de ene boord te laten halen en de andere te laten strijken.$$),
('roeien-12', 'roeien-12.p6',  'praktijk', 6, $$Jagen$$,
 $$Met een aantal mensen het schip aan een lijn vooruittrekken. De lijn vlak bij het draaipunt vastmaken, zodat de boeg niet naar de kant wordt getrokken, lang genoeg, en met gebruik van de driftbeperkende middelen. Let op de natuur en andermans spullen.$$),
('roeien-12', 'roeien-12.p7',  'praktijk', 7, $$Wrikken$$,
 $$Met één riem in het wrikgat het schip in een rechte lijn voortbewegen.$$),
('roeien-12', 'roeien-12.p8',  'praktijk', 8, $$Het schip afmeren$$,
 $$Zo vastleggen dat ook op lange termijn geen schade aan eigen of andere schepen mogelijk is. Zo min mogelijk lijnen naar de wal (minder dan 3 of meer dan 6 is altijd fout), zo lang mogelijk gekozen. Eerst de lijnen die de natuurlijke beweging van het schip tegengaan.$$),
('roeien-12', 'roeien-12.p9',  'praktijk', 9, $$Toepassing van de reglementen$$,
 $$De uitwijkregels voor het eigen vaargebied toepassen. Een uitwijkmanoeuvre wordt tijdig ingezet. De bemanning mag waarschuwen voor andere scheepvaart.$$),

-- ---------------- Roeien I/II — theorie
('roeien-12', 'roeien-12.t1',  'theorie', 1, $$Schiemanswerk$$,
 $$Bij naam kennen, kunnen leggen en de functie kennen van: twee halve steken (de eerste slippend), achtknoop, platte knoop, mastworp (met slipsteek als borg). Ook: een lijn opschieten en een lijn beleggen op een kikker.$$),
('roeien-12', 'roeien-12.t2',  'theorie', 2, $$Roeitermen$$,
 $$Kunnen aangeven wat bedoeld wordt met: slagroeier, boegroeier, midroeier, roerganger, haakvoor, stuurboord, bakboord, hogerwal, lagerwal, bomen, jagen, wrikken, in de wind, opschieten, beleggen. Plus alle roeicommando's.$$),
('roeien-12', 'roeien-12.t3',  'theorie', 3, $$Onderdelen$$,
 $$Van de eigen boot en tuigage, in de praktijk én op een tekening, minstens 15 onderdelen bij de juiste naam noemen. In ieder geval: boeg, hek, dolboord, doften, roer, helmstok, stuurboord en bakboord, roeiriem, wrikriem.$$),
('roeien-12', 'roeien-12.t4',  'theorie', 4, $$Veiligheid$$,
 $$De eisen kennen die aan een reddingvest gesteld worden. Weten hoe te handelen bij een omgeslagen boot.$$),
('roeien-12', 'roeien-12.t5',  'theorie', 5, $$Reglementen$$,
 $$De genoemde artikelen uit het Binnenvaartpolitiereglement kunnen toepassen: begripsbepalingen 1.01, voorzorgsmaatregelen 1.04, afwijking 1.05, tegengestelde koersen 6.01/6.03/6.04, voorbijlopen 6.10, vertrek 6.14, kruisende koersen 6.17, ligplaats innemen 7.01. Weten dat er naast het BPR andere reglementen gelden en waar die te vinden zijn.$$),
('roeien-12', 'roeien-12.t6',  'theorie', 6, $$Gedragsregels$$,
 $$De goede gebruiken kennen ten opzichte van andere watersporters, waaronder wedstrijdzeilers. De verantwoording kennen ten opzichte van het milieu.$$),
('roeien-12', 'roeien-12.t7',  'theorie', 7, $$Weersinvloeden$$,
 $$Het weerbericht kunnen interpreteren met het oog op de veiligheid en de eigen vaardigheid. Voortekenen van plotselinge weersomslagen, zoals onweer en zware windvlagen, tijdig herkennen.$$),
('roeien-12', 'roeien-12.t8',  'theorie', 8, $$Vaarproblematiek andersoortige schepen$$,
 $$Het gevaar kennen van de dode hoek en van de zuiging van grote schepen. Weten dat grote schepen op smal vaarwater niet kunnen wijken, en dat ook grote vrachtschepen sterk kunnen verlijeren.$$),

-- ---------------- Roeien III — praktijk
('roeien-3', 'roeien-3.p1',  'praktijk',  1, $$Het schip vaarklaar en nachtklaar maken$$, null),
('roeien-3', 'roeien-3.p2',  'praktijk',  2, $$Verhalen van het schip$$, null),
('roeien-3', 'roeien-3.p3',  'praktijk',  3, $$Roeitechnieken en roeicommando's kunnen uitvoeren$$, null),
('roeien-3', 'roeien-3.p4',  'praktijk',  4, $$Roeicommando's kunnen geven$$, null),
('roeien-3', 'roeien-3.p5',  'praktijk',  5, $$Aanleg met de punt van het schip$$, null),
('roeien-3', 'roeien-3.p6',  'praktijk',  6, $$Aanleggen met de spiegel van het schip$$, null),
('roeien-3', 'roeien-3.p7',  'praktijk',  7, $$Zijwaartse aanleg$$, null),
('roeien-3', 'roeien-3.p8',  'praktijk',  8, $$Een kleine acht varen$$, null),
('roeien-3', 'roeien-3.p9',  'praktijk',  9, $$Man over boord manoeuvre$$, null),
('roeien-3', 'roeien-3.p10', 'praktijk', 10, $$Eenvoudig ankeren$$, null),
('roeien-3', 'roeien-3.p11', 'praktijk', 11, $$Roeimanoeuvres zonder roer$$, null),
('roeien-3', 'roeien-3.p12', 'praktijk', 12, $$Jagen$$, null),
('roeien-3', 'roeien-3.p13', 'praktijk', 13, $$Wrikken$$, null),
('roeien-3', 'roeien-3.p14', 'praktijk', 14, $$Het schip afmeren$$, null),
('roeien-3', 'roeien-3.p15', 'praktijk', 15, $$Aanvarings- en achtergrondpeiling kunnen maken$$, null),
('roeien-3', 'roeien-3.p16', 'praktijk', 16, $$Toepassing van de reglementen$$, null),
('roeien-3', 'roeien-3.p17', 'praktijk', 17, $$Terminologie$$, null),
('roeien-3', 'roeien-3.p18', 'praktijk', 18, $$Tonen van inzicht, veiligheid$$, null),
('roeien-3', 'roeien-3.p19', 'praktijk', 19, $$Schiemannen praktijk$$, null),

-- ---------------- Roeien III — theorie
('roeien-3', 'roeien-3.t1', 'theorie', 1, $$Schiemanswerk$$, null),
('roeien-3', 'roeien-3.t2', 'theorie', 2, $$Roeitermen$$, null),
('roeien-3', 'roeien-3.t3', 'theorie', 3, $$Onderdelen$$, null),
('roeien-3', 'roeien-3.t4', 'theorie', 4, $$Veiligheid$$, null),
('roeien-3', 'roeien-3.t5', 'theorie', 5, $$Reglementen$$, null),
('roeien-3', 'roeien-3.t6', 'theorie', 6, $$Theorie van het roeien$$, null),
('roeien-3', 'roeien-3.t7', 'theorie', 7, $$Gedragsregels, vlagvoering en jachtetiquette$$, null),
('roeien-3', 'roeien-3.t8', 'theorie', 8, $$Weersinvloeden$$, null),
('roeien-3', 'roeien-3.t9', 'theorie', 9, $$Vaarproblematiek andersoortige schepen$$, null),

-- ---------------- Kielboot I — praktijk
('kielboot-1', 'kielboot-1.p1',  'praktijk',  1, $$Het schip zeilklaar en nachtklaar maken$$, null),
('kielboot-1', 'kielboot-1.p2',  'praktijk',  2, $$Verhalen van het schip$$, null),
('kielboot-1', 'kielboot-1.p3',  'praktijk',  3, $$Stilliggend hijsen en strijken van de zeilen$$, null),
('kielboot-1', 'kielboot-1.p4',  'praktijk',  4, $$Stand en bediening van de zeilen$$, null),
('kielboot-1', 'kielboot-1.p5',  'praktijk',  5, $$Sturen, roer- en schootbediening$$, null),
('kielboot-1', 'kielboot-1.p6',  'praktijk',  6, $$Overstag gaan$$, null),
('kielboot-1', 'kielboot-1.p7',  'praktijk',  7, $$Opkruisen in breed vaarwater$$, null),
('kielboot-1', 'kielboot-1.p8',  'praktijk',  8, $$Gijpen$$, null),
('kielboot-1', 'kielboot-1.p9',  'praktijk',  9, $$Afvaren van hogerwal$$, null),
('kielboot-1', 'kielboot-1.p10', 'praktijk', 10, $$Onder toezicht aankomen aan hogerwal$$, null),
('kielboot-1', 'kielboot-1.p11', 'praktijk', 11, $$Afmeren op de eigen ligplaats$$, null),
('kielboot-1', 'kielboot-1.p12', 'praktijk', 12, $$De noodzaak van het reven onderkennen$$, null),
('kielboot-1', 'kielboot-1.p13', 'praktijk', 13, $$Toepassing van de reglementen$$, null),

-- ---------------- Kielboot I — theorie
('kielboot-1', 'kielboot-1.t1', 'theorie', 1, $$Schiemanswerk$$, null),
('kielboot-1', 'kielboot-1.t2', 'theorie', 2, $$Zeiltermen$$, null),
('kielboot-1', 'kielboot-1.t3', 'theorie', 3, $$Onderdelen$$, null),
('kielboot-1', 'kielboot-1.t4', 'theorie', 4, $$Veiligheid$$, null),
('kielboot-1', 'kielboot-1.t5', 'theorie', 5, $$Reglementen$$, null),
('kielboot-1', 'kielboot-1.t6', 'theorie', 6, $$Krachten op het schip en hun gevolgen$$, null),

-- ---------------- Kielboot II — praktijk
('kielboot-2', 'kielboot-2.p1',  'praktijk',  1, $$Het schip zeilklaar en nachtklaar maken$$, null),
('kielboot-2', 'kielboot-2.p2',  'praktijk',  2, $$Verhalen van het schip$$, null),
('kielboot-2', 'kielboot-2.p3',  'praktijk',  3, $$Stilliggend hijsen en strijken van de zeilen$$, null),
('kielboot-2', 'kielboot-2.p4',  'praktijk',  4, $$Stand en bediening van de zeilen$$, null),
('kielboot-2', 'kielboot-2.p5',  'praktijk',  5, $$Sturen, roer- en schootbediening$$, null),
('kielboot-2', 'kielboot-2.p6',  'praktijk',  6, $$Overstag gaan$$, null),
('kielboot-2', 'kielboot-2.p7',  'praktijk',  7, $$Opkruisen in nauw vaarwater$$, null),
('kielboot-2', 'kielboot-2.p8',  'praktijk',  8, $$Gijpen en gijpen kunnen vermijden$$, null),
('kielboot-2', 'kielboot-2.p9',  'praktijk',  9, $$Afvaren van hogerwal$$, null),
('kielboot-2', 'kielboot-2.p10', 'praktijk', 10, $$Aankomen aan hogerwal (onder alle omstandigheden)$$, null),
('kielboot-2', 'kielboot-2.p11', 'praktijk', 11, $$Afmeren van het schip$$, null),
('kielboot-2', 'kielboot-2.p12', 'praktijk', 12, $$Kunnen reven op het eigen schip$$, null),
('kielboot-2', 'kielboot-2.p13', 'praktijk', 13, $$Toepassing van de reglementen$$, null),
('kielboot-2', 'kielboot-2.p14', 'praktijk', 14, $$Man over boord manoeuvre$$, null),
('kielboot-2', 'kielboot-2.p15', 'praktijk', 15, $$Loskomen van aan de grond$$, null),
('kielboot-2', 'kielboot-2.p16', 'praktijk', 16, $$Gebruik buitenboordmotor$$, null),

-- ---------------- Kielboot II — theorie
('kielboot-2', 'kielboot-2.t1', 'theorie', 1, $$Schiemanswerk$$, null),
('kielboot-2', 'kielboot-2.t2', 'theorie', 2, $$Zeiltermen$$, null),
('kielboot-2', 'kielboot-2.t3', 'theorie', 3, $$Onderdelen$$, null),
('kielboot-2', 'kielboot-2.t4', 'theorie', 4, $$Veiligheid$$, null),
('kielboot-2', 'kielboot-2.t5', 'theorie', 5, $$Reglementen$$, null),
('kielboot-2', 'kielboot-2.t6', 'theorie', 6, $$Krachten op het schip en hun gevolgen$$, null),
('kielboot-2', 'kielboot-2.t7', 'theorie', 7, $$Gedragsregels$$, null),
('kielboot-2', 'kielboot-2.t8', 'theorie', 8, $$Weersinvloeden$$, null),
('kielboot-2', 'kielboot-2.t9', 'theorie', 9, $$Vaarproblematiek andersoortige schepen$$, null),

-- ---------------- Kielboot III — praktijk
('kielboot-3', 'kielboot-3.p1',  'praktijk',  1, $$Het aanslaan van de zeilen$$, null),
('kielboot-3', 'kielboot-3.p2',  'praktijk',  2, $$Het schip zeilklaar maken en klaarmaken voor de nacht$$, null),
('kielboot-3', 'kielboot-3.p3',  'praktijk',  3, $$Verhalen van het schip$$, null),
('kielboot-3', 'kielboot-3.p4',  'praktijk',  4, $$Hijsen en strijken van de zeilen, stilliggend en varend$$, null),
('kielboot-3', 'kielboot-3.p5',  'praktijk',  5, $$Stand en bediening van de zeilen$$, null),
('kielboot-3', 'kielboot-3.p6',  'praktijk',  6, $$Bovenwinds gelegen punt kunnen bezeilen$$, null),
('kielboot-3', 'kielboot-3.p7',  'praktijk',  7, $$Opkruisen in nauw vaarwater$$, null),
('kielboot-3', 'kielboot-3.p8',  'praktijk',  8, $$Gijpen en gijpen kunnen vermijden$$, null),
('kielboot-3', 'kielboot-3.p9',  'praktijk',  9, $$Afvaren van en aankomen aan hogerwal$$, null),
('kielboot-3', 'kielboot-3.p10', 'praktijk', 10, $$Man over boord manoeuvre$$, null),
('kielboot-3', 'kielboot-3.p11', 'praktijk', 11, $$Aankomen aan lagerwal$$, null),
('kielboot-3', 'kielboot-3.p12', 'praktijk', 12, $$Afmeren$$, null),
('kielboot-3', 'kielboot-3.p13', 'praktijk', 13, $$Kunnen reven op het eigen schip$$, null),
('kielboot-3', 'kielboot-3.p14', 'praktijk', 14, $$Eenvoudig ankeren$$, null),
('kielboot-3', 'kielboot-3.p15', 'praktijk', 15, $$Eenvoudige zeil- en scheepstrim$$, null),
('kielboot-3', 'kielboot-3.p16', 'praktijk', 16, $$Loskomen van aan de grond$$, null),
('kielboot-3', 'kielboot-3.p17', 'praktijk', 17, $$Bedienen van een binnen- of buitenboordmotor$$, null),
('kielboot-3', 'kielboot-3.p18', 'praktijk', 18, $$Schiemanswerk$$, null),
('kielboot-3', 'kielboot-3.p19', 'praktijk', 19, $$Aanvarings- en achtergrondpeiling kunnen maken$$, null),
('kielboot-3', 'kielboot-3.p20', 'praktijk', 20, $$Toepassing van de reglementen$$, null),
('kielboot-3', 'kielboot-3.p21', 'praktijk', 21, $$Terminologie$$, null),

-- ---------------- Kielboot III — theorie
('kielboot-3', 'kielboot-3.t1',  'theorie',  1, $$Schiemanswerk$$, null),
('kielboot-3', 'kielboot-3.t2',  'theorie',  2, $$Zeiltermen$$, null),
('kielboot-3', 'kielboot-3.t3',  'theorie',  3, $$Onderdelen$$, null),
('kielboot-3', 'kielboot-3.t4',  'theorie',  4, $$Veiligheid$$, null),
('kielboot-3', 'kielboot-3.t5',  'theorie',  5, $$Reglementen$$, null),
('kielboot-3', 'kielboot-3.t6',  'theorie',  6, $$Krachten op het schip en hun gevolgen$$, null),
('kielboot-3', 'kielboot-3.t7',  'theorie',  7, $$Gedragsregels, vlagvoering en jachtetiquette$$, null),
('kielboot-3', 'kielboot-3.t8',  'theorie',  8, $$Weersinvloeden$$, null),
('kielboot-3', 'kielboot-3.t9',  'theorie',  9, $$Vaarproblematiek andersoortige schepen$$, null),
('kielboot-3', 'kielboot-3.t10', 'theorie', 10, $$Dagelijks onderhoud van het eigen schip$$, null),
('kielboot-3', 'kielboot-3.t11', 'theorie', 11, $$Het kennen van twee andere reefsystemen dan die op het eigen schip$$, null),

-- ---------------- Kielboot IV — praktijk
('kielboot-4', 'kielboot-4.p1',  'praktijk',  1, $$Aanslaan van de zeilen$$, null),
('kielboot-4', 'kielboot-4.p2',  'praktijk',  2, $$Schip zeilklaar maken en klaarmaken voor de nacht$$, null),
('kielboot-4', 'kielboot-4.p3',  'praktijk',  3, $$Verhalen van het schip$$, null),
('kielboot-4', 'kielboot-4.p4',  'praktijk',  4, $$Hijsen en strijken van de zeilen, stilliggend en varend$$, null),
('kielboot-4', 'kielboot-4.p5',  'praktijk',  5, $$Stand en bediening van de zeilen$$, null),
('kielboot-4', 'kielboot-4.p6',  'praktijk',  6, $$Bovenwinds gelegen punt kunnen bezeilen$$, null),
('kielboot-4', 'kielboot-4.p7',  'praktijk',  7, $$Opkruisen in nauw vaarwater$$, null),
('kielboot-4', 'kielboot-4.p8',  'praktijk',  8, $$Gijpen en gijpen kunnen vermijden$$, null),
('kielboot-4', 'kielboot-4.p9',  'praktijk',  9, $$Afvaren van en aankomen aan hogerwal$$, null),
('kielboot-4', 'kielboot-4.p10', 'praktijk', 10, $$Man over boord manoeuvre kunnen uitvoeren$$, null),
('kielboot-4', 'kielboot-4.p11', 'praktijk', 11, $$Wegvaren van en aankomen aan lagerwal$$, null),
('kielboot-4', 'kielboot-4.p12', 'praktijk', 12, $$Afmeren$$, null),
('kielboot-4', 'kielboot-4.p13', 'praktijk', 13, $$Kunnen reven op het eigen schip$$, null),
('kielboot-4', 'kielboot-4.p14', 'praktijk', 14, $$Ankeren en anker op gaan$$, null),
('kielboot-4', 'kielboot-4.p15', 'praktijk', 15, $$Varen in kanalen, passeren van bruggen en sluizen$$, null),
('kielboot-4', 'kielboot-4.p16', 'praktijk', 16, $$Doelmatigheid in vaargedrag vertonen$$, null),
('kielboot-4', 'kielboot-4.p17', 'praktijk', 17, $$Zeil- en scheepstrim$$, null),
('kielboot-4', 'kielboot-4.p18', 'praktijk', 18, $$Loskomen van aan de grond$$, null),
('kielboot-4', 'kielboot-4.p19', 'praktijk', 19, $$Bedienen van een binnen- of buitenboordmotor$$, null),
('kielboot-4', 'kielboot-4.p20', 'praktijk', 20, $$Schiemanswerk$$, null),
('kielboot-4', 'kielboot-4.p21', 'praktijk', 21, $$Aanvarings- en achtergrondpeiling kunnen maken$$, null),
('kielboot-4', 'kielboot-4.p22', 'praktijk', 22, $$Toepassing van de reglementen$$, null),
('kielboot-4', 'kielboot-4.p23', 'praktijk', 23, $$Terminologie$$, null),

-- ---------------- Kielboot IV — theorie
('kielboot-4', 'kielboot-4.t1',  'theorie',  1, $$Schiemanswerk$$, null),
('kielboot-4', 'kielboot-4.t2',  'theorie',  2, $$Dagelijks onderhoud van het eigen schip en de binnen- of buitenboordmotor$$, null),
('kielboot-4', 'kielboot-4.t3',  'theorie',  3, $$Scheepsbouw, materialen en onderdelen$$, null),
('kielboot-4', 'kielboot-4.t4',  'theorie',  4, $$Veiligheid en (blessure)preventie$$, null),
('kielboot-4', 'kielboot-4.t5',  'theorie',  5, $$Reglementen$$, null),
('kielboot-4', 'kielboot-4.t6',  'theorie',  6, $$Navigatie$$, null),
('kielboot-4', 'kielboot-4.t7',  'theorie',  7, $$Vaarproblematiek grote schepen$$, null),
('kielboot-4', 'kielboot-4.t8',  'theorie',  8, $$Vlagvoering en jachtetiquette$$, null),
('kielboot-4', 'kielboot-4.t9',  'theorie',  9, $$Stabiliteit$$, null),
('kielboot-4', 'kielboot-4.t10', 'theorie', 10, $$Voortstuwende en remmende krachten$$, null),
('kielboot-4', 'kielboot-4.t11', 'theorie', 11, $$Ankergerei$$, null),
('kielboot-4', 'kielboot-4.t12', 'theorie', 12, $$De meest voorkomende scheepssoorten in het eigen vaargebied herkennen en benoemen$$, null),

-- ---------------- Buitenboordmotor I/II — praktijk
('bbm-12', 'bbm-12.p1',  'praktijk',  1, $$Het schip vaarklaar maken en klaarmaken voor de nacht$$, null),
('bbm-12', 'bbm-12.p2',  'praktijk',  2, $$Benzinetank aansluiten$$, null),
('bbm-12', 'bbm-12.p3',  'praktijk',  3, $$Uitwendige controle van de motor$$, null),
('bbm-12', 'bbm-12.p4',  'praktijk',  4, $$Starten van de motor$$, null),
('bbm-12', 'bbm-12.p5',  'praktijk',  5, $$Controle op goede werking$$, null),
('bbm-12', 'bbm-12.p6',  'praktijk',  6, $$Gestrekte koers varen$$, null),
('bbm-12', 'bbm-12.p7',  'praktijk',  7, $$Stuurwerking van de motor$$, null),
('bbm-12', 'bbm-12.p8',  'praktijk',  8, $$Vaart minderen en stoppen$$,
 $$Tijdig gas terugnemen; het stoppen gebeurt achteruitslaand, waarbij het schip op koers blijft.$$),
('bbm-12', 'bbm-12.p9',  'praktijk',  9, $$Drijvend voorwerp kunnen benaderen$$, null),
('bbm-12', 'bbm-12.p10', 'praktijk', 10, $$Een acht en een slalom kunnen varen$$, null),
('bbm-12', 'bbm-12.p11', 'praktijk', 11, $$Afvaren en aankomen aan een langswal$$, null),
('bbm-12', 'bbm-12.p12', 'praktijk', 12, $$Afmeren$$, null),
('bbm-12', 'bbm-12.p13', 'praktijk', 13, $$Ankeren en anker op gaan$$, null),
('bbm-12', 'bbm-12.p14', 'praktijk', 14, $$Brandstof bijvullen$$, null),
('bbm-12', 'bbm-12.p15', 'praktijk', 15, $$Schiemanswerk$$, null),
('bbm-12', 'bbm-12.p16', 'praktijk', 16, $$Terminologie$$, null),

-- ---------------- Buitenboordmotor I/II — theorie
('bbm-12', 'bbm-12.t1', 'theorie', 1, $$Terminologie van schip en motor$$, null),
('bbm-12', 'bbm-12.t2', 'theorie', 2, $$Meest voorkomende storingen kunnen verhelpen$$, null),
('bbm-12', 'bbm-12.t3', 'theorie', 3, $$Vlagvoering en jachtetiquette$$, null),
('bbm-12', 'bbm-12.t4', 'theorie', 4, $$Veiligheid$$, null),
('bbm-12', 'bbm-12.t5', 'theorie', 5, $$Reglementen$$, null),

-- ---------------- Buitenboordmotor III — praktijk
('bbm-3', 'bbm-3.p1',  'praktijk',  1, $$Het schip vaarklaar maken en klaarmaken voor de nacht$$, null),
('bbm-3', 'bbm-3.p2',  'praktijk',  2, $$Vaartechnieken: koersen varen, afstoppen, gaande houden, noodstop maken$$, null),
('bbm-3', 'bbm-3.p3',  'praktijk',  3, $$Afvaren en aankomen bij hoger- en lagerwal$$, null),
('bbm-3', 'bbm-3.p4',  'praktijk',  4, $$Man over boord manoeuvre$$, null),
('bbm-3', 'bbm-3.p5',  'praktijk',  5, $$Ankeren en anker op gaan$$, null),
('bbm-3', 'bbm-3.p6',  'praktijk',  6, $$Bijzondere verrichtingen$$, null),
('bbm-3', 'bbm-3.p7',  'praktijk',  7, $$Loskomen van aan de grond$$, null),
('bbm-3', 'bbm-3.p8',  'praktijk',  8, $$Passeren van bruggen en/of sluizen$$, null),
('bbm-3', 'bbm-3.p9',  'praktijk',  9, $$Aanvarings- en achtergrondpeiling$$, null),
('bbm-3', 'bbm-3.p10', 'praktijk', 10, $$Toepassing reglementen$$, null),
('bbm-3', 'bbm-3.p11', 'praktijk', 11, $$Langszij een varend schip komen en vastmaken$$, null),
('bbm-3', 'bbm-3.p12', 'praktijk', 12, $$Slepen en gesleept worden$$, null),
('bbm-3', 'bbm-3.p13', 'praktijk', 13, $$Een tocht in het donker$$, null),
('bbm-3', 'bbm-3.p14', 'praktijk', 14, $$Eenvoudige reparaties aan de motor$$, null),

-- ---------------- Buitenboordmotor III — theorie
('bbm-3', 'bbm-3.t1',  'theorie',  1, $$Terminologie$$, null),
('bbm-3', 'bbm-3.t2',  'theorie',  2, $$Veiligheids- en reddingsmiddelen$$, null),
('bbm-3', 'bbm-3.t3',  'theorie',  3, $$Handelen bij averij$$, null),
('bbm-3', 'bbm-3.t4',  'theorie',  4, $$Eenvoudige EHBO$$, null),
('bbm-3', 'bbm-3.t5',  'theorie',  5, $$Reglementen$$, null),
('bbm-3', 'bbm-3.t6',  'theorie',  6, $$Betonning en bebakening$$, null),
('bbm-3', 'bbm-3.t7',  'theorie',  7, $$Krachten op het schip en hun gevolgen$$, null),
('bbm-3', 'bbm-3.t8',  'theorie',  8, $$Jachtetiquette en vlagvoering$$, null),
('bbm-3', 'bbm-3.t9',  'theorie',  9, $$Weersinvloeden$$, null),
('bbm-3', 'bbm-3.t10', 'theorie', 10, $$Gebruik van almanak en waterkaarten$$, null)

) as v(diploma, code, kind, position, title, detail)
join diplomas dp on dp.code = v.diploma
on conflict (code) do update set
  diploma_id = excluded.diploma_id,
  kind       = excluded.kind,
  position   = excluded.position,
  title      = excluded.title,
  detail     = excluded.detail;

-- ---------------------------------------------------------------- sloep/motorvlet
--
-- Het handboek Sloep- en motorvletvaren zet de eisen niet per niveau onder
-- elkaar, maar in één matrix met een kolom per niveau. Die kolommen zijn in de
-- PDF niet betrouwbaar uit te lezen, dus staat hieronder bij alle vier de
-- niveaus dezelfde volledige lijst. Dat is bewust de ruime kant: een eis die
-- er niet bij hoort zie je staan en haal je weg, een eis die ontbreekt zie je
-- nooit. Loop de lijst één keer met het handboek naast je na — zie
-- docs/EISEN.md.

insert into requirements (diploma_id, code, kind, position, title, detail)
select dp.id, dp.code || '.' || v.suffix, v.kind::requirement_kind, v.position, v.title, v.detail
from diplomas dp
cross join (values
  ('p1',  'praktijk',  1, $$Vaarklaar maken en controleren van het schip$$,        $$Het schip en basale zaken$$),
  ('p2',  'praktijk',  2, $$Verzorgen van de waterdichtheid van het schip$$,       $$Het schip en basale zaken$$),
  ('p3',  'praktijk',  3, $$Aan dek werken$$,                                      $$Het schip en basale zaken$$),
  ('p4',  'praktijk',  4, $$Behandeling lijnen en schiemannen$$,                   $$Het schip en basale zaken$$),
  ('p5',  'praktijk',  5, $$Bedienen van de motor$$,                               $$Het schip en basale zaken$$),
  ('p6',  'praktijk',  6, $$Zorg voor de motor en motorkamer$$,                    $$Het schip en basale zaken$$),
  ('p7',  'praktijk',  7, $$Communiceren$$,                                        $$Het schip en basale zaken$$),
  ('p8',  'praktijk',  8, $$Sturen$$,                                              $$Manoeuvreren$$),
  ('p9',  'praktijk',  9, $$Manoeuvreren$$,                                        $$Manoeuvreren$$),
  ('p10', 'praktijk', 10, $$Afvaren van een hogerwal en langswal steiger$$,        $$Havenmanoeuvres$$),
  ('p11', 'praktijk', 11, $$Aankomen aan een hogerwal en langswal steiger$$,       $$Havenmanoeuvres$$),
  ('p12', 'praktijk', 12, $$Afvaren van een hogerwal en lagerwal box$$,            $$Havenmanoeuvres$$),
  ('p13', 'praktijk', 13, $$Aankomen in een hogerwal en lagerwal box$$,            $$Havenmanoeuvres$$),
  ('p14', 'praktijk', 14, $$Afvaren van een lagerwal steiger$$,                    $$Havenmanoeuvres$$),
  ('p15', 'praktijk', 15, $$Aankomen aan een lagerwal steiger$$,                   $$Havenmanoeuvres$$),
  ('p16', 'praktijk', 16, $$Afvaren uit een box met dwarswind$$,                   $$Havenmanoeuvres$$),
  ('p17', 'praktijk', 17, $$Aankomen in een box met dwarswind$$,                   $$Havenmanoeuvres$$),
  ('p18', 'praktijk', 18, $$Afmeren$$,                                             $$Havenmanoeuvres$$),
  ('p19', 'praktijk', 19, $$Gebruik van kaart en almanak$$,                        $$Navigatie$$),
  ('p20', 'praktijk', 20, $$Gebruik navigatie-instrumenten$$,                      $$Navigatie$$),
  ('p21', 'praktijk', 21, $$Navigeren aan boord$$,                                 $$Navigatie$$),
  ('p22', 'praktijk', 22, $$Tochtvoorbereiding en het aanlopen van havens$$,       $$Tochtvaren$$),
  ('p23', 'praktijk', 23, $$Passeren van sluizen en bruggen$$,                     $$Tochtvaren$$),
  ('p24', 'praktijk', 24, $$Toepassen van de reglementen$$,                        $$Tochtvaren$$),
  ('p25', 'praktijk', 25, $$Nachtvaren$$,                                          $$Tochtvaren — in het handboek pas vanaf Schipper (CWO III)$$),
  ('p26', 'praktijk', 26, $$Gebruik van de veiligheidsuitrusting en reddingsmiddelen aan boord$$, $$Noodsituaties$$),
  ('p27', 'praktijk', 27, $$Man over boord$$,                                      $$Noodsituaties$$),
  ('p28', 'praktijk', 28, $$Slepen en gesleept worden$$,                           $$Noodsituaties — hiervoor bestaat een aparte module; verplicht voor All Round Schipper$$),
  ('p29', 'praktijk', 29, $$Loskomen van aan de grond$$,                           $$Noodsituaties$$),
  ('p30', 'praktijk', 30, $$Verhelpen van storingen$$,                             $$Noodsituaties$$),
  ('p31', 'praktijk', 31, $$EHBO$$,                                                $$Noodsituaties$$),
  ('p32', 'praktijk', 32, $$Ankeren$$,                                             $$Overig$$),
  ('p33', 'praktijk', 33, $$Vaar- en jachtetiquette en zorg voor het schip$$,      $$Overig$$),
  ('t1',  'theorie',   1, $$Scheeps- en motortermen$$,                             null),
  ('t2',  'theorie',   2, $$Werking van de motor$$,                                null),
  ('t3',  'theorie',   3, $$Theoretische beginselen van het manoeuvreren op de motor$$, null),
  ('t4',  'theorie',   4, $$Theorie van alle genoemde praktijkmanoeuvres$$,        null),
  ('t5',  'theorie',   5, $$Reglementen$$,                                         null),
  ('t6',  'theorie',   6, $$Klein Vaarbewijs$$,
   $$Kennis van KVB I vanaf Schipper (CWO III); voor All Round Schipper (CWO IV) is het certificaat zelf vereist. Een Klein Vaarbewijs geeft vrijstelling van het theorie-examen.$$)
) as v(suffix, kind, position, title, detail)
where dp.code in ('sloep-1', 'sloep-2', 'sloep-3', 'sloep-4')
on conflict (code) do update set
  diploma_id = excluded.diploma_id,
  kind       = excluded.kind,
  position   = excluded.position,
  title      = excluded.title,
  detail     = excluded.detail;
