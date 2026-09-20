-- aftekenboek — losse onderdelen binnen één eis
--
-- "Schiemanswerk" is één regel op de vorderingenstaat, maar er zitten zes
-- knopen achter. Met één vinkje is niet bij te houden wie de paalsteek al kan
-- en de mastworp nog niet, en dat is precies wat een instructeur tussen twee
-- vaaravonden door kwijtraakt.
--
-- Een onderdeel is daarom gewoon een eis met een ouder. Dat betekent dat
-- sign_offs, de policies en set_sign_off er niets van hoeven te weten: een
-- onderdeel wordt afgetekend zoals alles hier wordt afgetekend, met een datum
-- en een naam.
--
-- Wat een onderdeel níét doet, is de eis afstrepen. Alle zes de knopen gelegd
-- is niet hetzelfde als "beheerst schiemanswerk"; die beoordeling blijft van de
-- instructeur. Daarom tellen alleen eisen zonder ouder mee in de voortgang —
-- het aantal eisen van een diploma blijft staan op wat het handboek zegt.
--
-- Draai na 011-laatste-beheerder.sql, en draai daarna 010-eisen.sql opnieuw om
-- de onderdelen te laden.

alter table requirements add column if not exists parent_id uuid;

-- De samengestelde sleutel doet hier twee dingen tegelijk: hij wijst de ouder
-- aan én dwingt af dat die bij hetzelfde diploma hoort. Een onderdeel van
-- Kielboot I kan zo nooit onder een eis van Roeien III hangen.
alter table requirements drop constraint if exists requirements_parent_same_diploma;
alter table requirements
  add constraint requirements_parent_same_diploma
  foreign key (parent_id, diploma_id)
  references requirements (id, diploma_id) on delete cascade;

create index if not exists requirements_parent_id_idx on requirements (parent_id);

-- De oude unieke sleutel ging uit van één laag. Nu tellen eisen door binnen hun
-- diploma, en onderdelen binnen hun eis.
alter table requirements drop constraint if exists requirements_diploma_id_kind_position_key;

drop index if exists requirements_top_position;
drop index if exists requirements_sub_position;

create unique index requirements_top_position
  on requirements (diploma_id, kind, position) where parent_id is null;

create unique index requirements_sub_position
  on requirements (parent_id, position) where parent_id is not null;

-- Eén laag diep. Een onderdeel van een onderdeel is geen vorderingenstaat meer
-- maar een boomstructuur, en daar is geen enkel scherm op gebouwd.
create or replace function requirements_one_level ()
  returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.parent_id is not null and exists (
    select 1 from requirements p
    where p.id = new.parent_id and p.parent_id is not null
  ) then
    raise exception 'Een onderdeel kan zelf geen onderdelen hebben';
  end if;
  return new;
end;
$fn$;

drop trigger if exists requirements_one_level on requirements;

create trigger requirements_one_level
  before insert or update on requirements
  for each row execute function requirements_one_level ();

-- ---------------------------------------------------------------- tellen
--
-- Overal waar voortgang geteld wordt, tellen alleen de eisen zelf mee.

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
    on s.enrollment_id = e.id and s.requirement_id = r.id
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
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  where e.group_id = p_group
    and e.profile_id = coalesce(p_profile, auth.uid())
    and (is_staff(p_group) or coalesce(p_profile, auth.uid()) = auth.uid())
    and is_member(p_group)
  group by e.id, p.full_name, d.id, disc.id
  order by e.awarded_on nulls first, disc.sort_order, d.sort_order;
$fn$;

-- ---------------------------------------------------------------- de lijst
--
-- De aftekenlijst geeft eisen én onderdelen terug; het scherm nestelt ze op
-- parent_id. Onderdelen komen achter hun eigen eis te staan, zodat de app ze
-- in volgorde kan doorlopen zonder te sorteren.

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
    note           text
  )
  language sql stable security definer set search_path = public as $fn$
  select
    r.id, r.parent_id, r.kind, r.position, r.title, r.detail,
    s.signed_at, s.signed_by, sp.full_name, s.note
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
