-- aftekenboek — bakken, en aftekenen in drie standen
--
-- Twee dingen die bij elkaar horen, omdat ze samen het overzicht op het water
-- mogelijk maken: één onderdeel kiezen, één bak kiezen, en voor iedereen in die
-- boot in één oogopslag zien en aanpassen hoe ver hij is.
--
-- 1. Bakken. Een vaste bemanning voor het seizoen: "Vlet 1", "Albatros". Niet
--    hetzelfde als een speltak — een speltak is een leeftijdsgroep, een bak is
--    wie er samen in een boot zit. Instructeurs mogen ze beheren, niet alleen
--    beheerders: wie de boten indeelt staat meestal zelf op de steiger.
--
-- 2. Drie standen: niet behandeld, behandeld onderweg, gehaald. "Niet
--    behandeld" is geen rij; de andere twee zijn de kolom status op sign_offs.
--    Alleen "gehaald" telt mee in de voortgang. "Behandeld onderweg" is een
--    geheugensteun voor de instructeur, geen halve aftekening.
--
-- Bestaande aftekeningen worden "gehaald", want dat is wat ze betekenden. En
-- set_sign_off blijft bestaan met zijn aan/uit-parameter: de builds die nu op
-- telefoons staan roepen hem zo aan, en die mogen niet stukgaan tussen deze
-- migratie en de OTA-update die de nieuwe schermen brengt.
--
-- Draai na 015-leden-zonder-account.sql.

-- ---------------------------------------------------------------- standen

do $$ begin
  create type sign_off_status as enum ('behandeld', 'gehaald');
exception when duplicate_object then null;
end $$;

alter table sign_offs
  add column if not exists status sign_off_status not null default 'gehaald';

-- De oude aan/uit-functie, nu met een expliciete stand. Aan is gehaald; wat
-- eerst "behandeld" was en met een oude build wordt aangetikt, wordt gehaald.
create or replace function set_sign_off (
  p_enrollment uuid,
  p_requirement uuid,
  p_signed boolean,
  p_note text default null
)
  returns void language plpgsql security definer set search_path = public as $fn$
begin
  perform set_sign_off_status(
    p_enrollment,
    p_requirement,
    case when p_signed then 'gehaald'::sign_off_status else null end,
    p_note
  );
end;
$fn$;

-- De nieuwe. Null is "niet behandeld" en haalt de rij weg.
--
-- Een notitie blijft staan als er geen nieuwe meekomt: wie een knoop van
-- "onderweg" naar "gehaald" zet, hoort de opmerking "nog een keer bij meer
-- wind" niet kwijt te raken. Een lege string wist hem wel.
create or replace function set_sign_off_status (
  p_enrollment uuid,
  p_requirement uuid,
  p_status sign_off_status,
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

  if p_status is null then
    delete from sign_offs
    where enrollment_id = p_enrollment and requirement_id = p_requirement;
    return;
  end if;

  insert into sign_offs (enrollment_id, requirement_id, diploma_id, signed_by, note, status)
  values (
    p_enrollment, p_requirement, e.diploma_id, auth.uid(),
    nullif(trim(coalesce(p_note, '')), ''), p_status
  )
  on conflict (enrollment_id, requirement_id) do update
    set status    = excluded.status,
        signed_by = auth.uid(),
        signed_at = now(),
        note      = case
                      when p_note is null then sign_offs.note
                      else nullif(trim(p_note), '')
                    end;
end;
$fn$;

-- ---------------------------------------------------------------- tellen
--
-- Alleen gehaald telt. Het filter zit in de join, zodat een "behandeld" rij
-- voor de telling niet bestaat.

create or replace view enrollment_progress
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
  join requirements r on r.diploma_id = e.diploma_id and r.parent_id is null
  left join sign_offs s
    on s.enrollment_id = e.id and s.requirement_id = r.id and s.status = 'gehaald'
  group by e.id;

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
  join requirements r on r.diploma_id = d.id and r.parent_id is null
  left join sign_offs s
    on s.enrollment_id = e.id and s.requirement_id = r.id and s.status = 'gehaald'
  where e.group_id = p_group
    and e.profile_id = coalesce(p_profile, auth.uid())
    and (is_staff(p_group) or coalesce(p_profile, auth.uid()) = auth.uid())
    and is_member(p_group)
  group by e.id, p.full_name, d.id, disc.id
  order by e.awarded_on nulls first, disc.sort_order, d.sort_order;
$fn$;

-- De aftekenlijst geeft de stand mee. Nieuwe kolom, dus opnieuw aanmaken.
drop function if exists enrollment_sheet (uuid);

create or replace function enrollment_sheet (p_enrollment uuid)
  returns table (
    requirement_id uuid,
    parent_id      uuid,
    kind           requirement_kind,
    "position"     int,
    title          text,
    detail         text,
    signed_at      timestamptz,
    signed_by      uuid,
    signed_by_name text,
    note           text,
    status         sign_off_status
  )
  language sql stable security definer set search_path = public as $fn$
  select
    r.id, r.parent_id, r.kind, r.position, r.title, r.detail,
    s.signed_at, s.signed_by, sp.full_name, s.note, s.status
  from enrollments e
  join requirements r on r.diploma_id = e.diploma_id
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  left join profiles sp on sp.id = s.signed_by
  where e.id = p_enrollment
    and (is_staff(e.group_id) or e.profile_id = auth.uid())
  order by
    r.kind,
    coalesce((select p.position from requirements p where p.id = r.parent_id), r.position),
    r.parent_id nulls first,
    r.position;
$fn$;

-- ---------------------------------------------------------------- bakken

create table if not exists crews (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create index if not exists crews_group_id_idx on crews (group_id);

-- Via het lidmaatschap, niet het profiel: wie uit de groep gaat, gaat ook uit
-- zijn bak, zonder dat iemand eraan hoeft te denken.
create table if not exists crew_members (
  crew_id       uuid not null references crews (id) on delete cascade,
  membership_id uuid not null references memberships (id) on delete cascade,
  primary key (crew_id, membership_id)
);

create index if not exists crew_members_membership_id_idx on crew_members (membership_id);

create or replace function crew_group (cid uuid)
  returns uuid language sql stable security definer set search_path = public as $fn$
  select group_id from crews where id = cid;
$fn$;

alter table crews enable row level security;
alter table crew_members enable row level security;

drop policy if exists crews_read on crews;
create policy crews_read on crews
  for select to authenticated using (is_member(group_id));

drop policy if exists crews_staff_write on crews;
create policy crews_staff_write on crews
  for all to authenticated
  using (is_staff(group_id)) with check (is_staff(group_id));

drop policy if exists crew_members_read on crew_members;
create policy crew_members_read on crew_members
  for select to authenticated using (is_member(crew_group(crew_id)));

-- Indelen gaat alleen via set_crew_members: de hele bemanning in één keer, en
-- met de controle dat iedereen bij de groep hoort. Er is dus geen
-- schrijf-policy op crew_members.

create or replace function set_crew_members (p_crew uuid, p_profiles uuid[])
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  gid uuid;
begin
  gid := crew_group(p_crew);
  if gid is null then
    raise exception 'Deze bak bestaat niet';
  end if;
  if not is_staff(gid) then
    raise exception 'Alleen instructeurs en beheerders kunnen een bak indelen';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_profiles, '{}'::uuid[])) as given(id)
    where not exists (
      select 1 from memberships m where m.group_id = gid and m.profile_id = given.id
    )
  ) then
    raise exception 'Iemand in deze lijst hoort niet bij de groep';
  end if;

  delete from crew_members where crew_id = p_crew;

  insert into crew_members (crew_id, membership_id)
  select p_crew, m.id
  from memberships m
  where m.group_id = gid
    and m.profile_id = any (coalesce(p_profiles, '{}'::uuid[]));
end;
$fn$;

-- Wie er in een bak zit, voor het indeelscherm.
create or replace function crew_roster (p_crew uuid)
  returns table (profile_id uuid, full_name text)
  language sql stable security definer set search_path = public as $fn$
  select p.id, p.full_name
  from crews c
  join crew_members cm on cm.crew_id = c.id
  join memberships m on m.id = cm.membership_id
  join profiles p on p.id = m.profile_id
  where c.id = p_crew and is_member(c.group_id)
  order by p.full_name;
$fn$;

-- ---------------------------------------------------------------- het overzicht

-- De diploma's waar iemand in deze bak mee bezig is. Zo toont de keuzelijst
-- in het overzicht alleen wat voor deze boot ertoe doet, niet alle twaalf.
create or replace function crew_diplomas (p_crew uuid)
  returns table (
    diploma_id      uuid,
    diploma_name    text,
    discipline_name text,
    enrolled        bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select d.id, d.name, disc.name, count(distinct e.profile_id)
  from crews c
  join crew_members cm on cm.crew_id = c.id
  join memberships m on m.id = cm.membership_id
  join enrollments e
    on e.group_id = c.group_id and e.profile_id = m.profile_id and e.awarded_on is null
  join diplomas d on d.id = e.diploma_id
  join disciplines disc on disc.id = d.discipline_id
  where c.id = p_crew and is_staff(c.group_id)
  group by d.id, disc.id
  order by disc.sort_order, d.sort_order;
$fn$;

-- Iedereen in een bak, met zijn stand op één eis of onderdeel. Wie niet voor
-- dat diploma is ingeschreven komt wel mee, met een lege enrollment_id: het
-- scherm laat hem dan zien in plaats van hem stil weg te laten, want "waarom
-- staat Piet er niet bij" is een vraag die je op het water niet wilt krijgen.
create or replace function crew_sheet (p_crew uuid, p_requirement uuid)
  returns table (
    profile_id     uuid,
    full_name      text,
    enrollment_id  uuid,
    status         sign_off_status,
    signed_at      timestamptz,
    signed_by_name text,
    note           text
  )
  language sql stable security definer set search_path = public as $fn$
  select
    p.id, p.full_name, e.id,
    s.status, s.signed_at, sp.full_name, s.note
  from crews c
  join crew_members cm on cm.crew_id = c.id
  join memberships m on m.id = cm.membership_id
  join profiles p on p.id = m.profile_id
  join requirements r on r.id = p_requirement
  left join enrollments e
    on e.group_id = c.group_id and e.profile_id = p.id and e.diploma_id = r.diploma_id
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  left join profiles sp on sp.id = s.signed_by
  where c.id = p_crew and is_staff(c.group_id)
  order by (e.id is null), p.full_name;
$fn$;
