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
