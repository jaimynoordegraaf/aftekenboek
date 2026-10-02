-- vinkje — wat er gebeurt met de vorderingen van iemand die van de groep af is
--
-- Het bewaren zelf is met opzet en staat zo in het privacybeleid: "Gaat iemand
-- van de groep af, dan blijft zijn voortgang bewaard, zodat hij bij terugkeer
-- kan verdergaan waar hij was. Na 2 jaar zonder lidmaatschap verwijderen we
-- zijn gegevens." Een seizoen overslaan en terugkomen hoort niet te betekenen
-- dat je opnieuw begint.
--
-- Maar er zaten twee gaten tussen die belofte en wat de database deed.
--
-- 1. Bewaard was ook zichtbaar. group_progress en diploma_eis_stand lezen uit
--    enrollments en keken niet naar memberships, terwijl group_members dat wel
--    doet. Iemand die uit de groep gehaald was, verdween dus uit de ledenlijst
--    maar bleef in het voortgangsoverzicht staan — inclusief in "wie moet wat
--    nog doen", waar je een middag op het water mee plant. Dat is hieronder
--    rechtgezet met een join op memberships.
--
-- 2. Die 2 jaar werd door niets waargemaakt. Er was geen moment waarop iemand
--    de groep verliet dat ergens vastgelegd werd, dus de termijn was niet eens
--    te meten. Daar is group_departures voor, en twee functies om het te zien
--    en op te ruimen. Handmatig, net als exam_cleanup: wissen is onomkeerbaar
--    en hoort een besluit van een beheerder te zijn, geen bijwerking van een
--    achtergrondtaak die niemand ziet draaien.
--
-- Draai na 026-voortgang.sql.

-- ------------------------------------------------- wanneer ging iemand eraf

create table if not exists group_departures (
  group_id   uuid not null references groups (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  left_at    timestamptz not null default now(),
  primary key (group_id, profile_id)
);

alter table group_departures enable row level security;

-- Geen policies: er is geen enkele reden om hier rechtstreeks bij te kunnen.
-- Alles loopt via de functies hieronder, en die controleren zelf de rol.

-- Wie al weg was voordat dit bestond, heeft geen vertrekdatum. De klok begint
-- dan vandaag. Dat is de voorzichtige kant op: liever iets te lang bewaren dan
-- iemand wissen van wie we niet weten wanneer hij wegging.
insert into group_departures (group_id, profile_id)
select distinct e.group_id, e.profile_id
from enrollments e
where not exists (
  select 1 from memberships m
  where m.group_id = e.group_id and m.profile_id = e.profile_id
)
on conflict do nothing;

-- ------------------------------------------------------------ bijhouden

create or replace function noteer_vertrek ()
  returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  -- Een lidmaatschap verdwijnt ook als de persoon of de groep zelf verdwijnt:
  -- delete_my_account() wist het profiel en de cascade neemt het lidmaatschap
  -- mee. Dan is de ouderrij hier al weg en zou deze insert op de foreign key
  -- stuklopen -- en een vertrekdatum bijhouden van iemand die gewist wordt is
  -- sowieso zinloos. Alleen echt vertrek uit een bestaande groep telt.
  if not exists (select 1 from profiles where id = old.profile_id)
     or not exists (select 1 from groups where id = old.group_id) then
    return old;
  end if;

  insert into group_departures (group_id, profile_id)
  values (old.group_id, old.profile_id)
  on conflict (group_id, profile_id) do update set left_at = now();
  return old;
end;
$fn$;

drop trigger if exists memberships_vertrek on memberships;
create trigger memberships_vertrek
  after delete on memberships
  for each row execute function noteer_vertrek();

-- Komt hij terug, dan telt de termijn niet meer. Een trigger en niet een regel
-- in redeem_invite, want lid worden kan ook via create_group en add_member; op
-- de tabel zelf is er maar één plek die het kan missen.
create or replace function wis_vertrek ()
  returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  delete from group_departures
  where group_id = new.group_id and profile_id = new.profile_id;
  return new;
end;
$fn$;

drop trigger if exists memberships_terug on memberships;
create trigger memberships_terug
  after insert on memberships
  for each row execute function wis_vertrek();

-- --------------------------------------------- het overzicht alleen van wie er is

create or replace function group_progress (p_group uuid)
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
    started_on       date,
    theory_passed_on date,
    awarded_on       date,
    praktijk_total   bigint,
    praktijk_done    bigint,
    theorie_total    bigint,
    theorie_done     bigint,
    onderweg         bigint,
    laatst_afgetekend timestamptz
  )
  language plpgsql stable security definer set search_path = public as $fn$
begin
  if not is_staff(p_group) then
    raise exception 'Alleen instructeurs en beheerders zien de voortgang van de hele groep';
  end if;

  return query
  select
    e.id, e.profile_id, p.full_name,
    d.id, d.code, d.name, d.level_label,
    disc.code, disc.name,
    e.started_on, e.theory_passed_on, e.awarded_on,
    count(r.id) filter (where r.kind = 'praktijk'),
    count(s.id) filter (where r.kind = 'praktijk' and s.status = 'gehaald'),
    count(r.id) filter (where r.kind = 'theorie'),
    count(s.id) filter (where r.kind = 'theorie' and s.status = 'gehaald'),
    count(s.id) filter (where s.status = 'behandeld'),
    max(s.signed_at) filter (where s.status = 'gehaald')
  from enrollments e
  -- Deze join is het hele punt van 027: wie niet meer in de groep zit, hoort
  -- hier niet te staan. Zijn vorderingen blijven wel bewaard.
  join memberships m on m.group_id = e.group_id and m.profile_id = e.profile_id
  join profiles p on p.id = e.profile_id
  join diplomas d on d.id = e.diploma_id
  join disciplines disc on disc.id = d.discipline_id
  join requirements r on r.diploma_id = d.id and r.parent_id is null
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  where e.group_id = p_group
  group by e.id, p.full_name, d.id, disc.id
  order by p.full_name, disc.sort_order, d.sort_order;
end;
$fn$;

create or replace function diploma_eis_stand (p_group uuid, p_diploma uuid)
  returns table (
    enrollment_id uuid,
    profile_id    uuid,
    full_name     text,
    requirement_id uuid,
    kind          requirement_kind,
    positie       int,
    title         text,
    status        sign_off_status
  )
  language plpgsql stable security definer set search_path = public as $fn$
begin
  if not is_staff(p_group) then
    raise exception 'Alleen instructeurs en beheerders zien de voortgang van de hele groep';
  end if;

  return query
  select
    e.id, e.profile_id, p.full_name,
    r.id, r.kind, r.position, r.title, s.status
  from enrollments e
  join memberships m on m.group_id = e.group_id and m.profile_id = e.profile_id
  join profiles p on p.id = e.profile_id
  join requirements r on r.diploma_id = e.diploma_id and r.parent_id is null
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  where e.group_id = p_group
    and e.diploma_id = p_diploma
  order by r.kind, r.position, p.full_name;
end;
$fn$;

-- ------------------------------------------------------- zien en opruimen

-- Bewaren wat niemand kan zien is het slechtste van twee werelden: de gegevens
-- staan er, maar niemand weet het en niemand ruimt ze op. Dit is de lijst.
create or replace function former_members (p_group uuid)
  returns table (
    profile_id   uuid,
    full_name    text,
    left_at      timestamptz,
    opleidingen  bigint,
    aftekeningen bigint,
    over_de_tijd boolean
  )
  language plpgsql stable security definer set search_path = public as $fn$
begin
  if not is_staff(p_group) then
    raise exception 'Alleen instructeurs en beheerders zien dit';
  end if;

  return query
  select
    p.id, p.full_name, v.left_at,
    count(distinct e.id),
    count(s.id),
    v.left_at < now() - interval '2 years'
  from group_departures v
  join profiles p on p.id = v.profile_id
  left join enrollments e on e.group_id = v.group_id and e.profile_id = v.profile_id
  left join sign_offs s on s.enrollment_id = e.id
  where v.group_id = p_group
  group by p.id, p.full_name, v.left_at
  having count(distinct e.id) > 0
  order by v.left_at;
end;
$fn$;

-- Onomkeerbaar, dus alleen een beheerder, en alleen voor iemand die er echt
-- niet meer in zit. Dat laatste is geen beleefdheid maar een slot: zonder die
-- controle is dit een knop die de vorderingen van een gewoon lid wist.
create or replace function delete_member_progress (p_group uuid, p_profile uuid)
  returns int language plpgsql security definer set search_path = public as $fn$
declare
  weg int;
begin
  if not is_admin(p_group) then
    raise exception 'Alleen een beheerder kan vorderingen verwijderen';
  end if;

  if exists (
    select 1 from memberships
    where group_id = p_group and profile_id = p_profile
  ) then
    raise exception 'Deze persoon zit nog in de groep. Haal hem er eerst uit.';
  end if;

  -- sign_offs hangen met een cascade aan enrollments, dus die gaan mee.
  delete from enrollments where group_id = p_group and profile_id = p_profile;
  get diagnostics weg = row_count;

  delete from group_departures where group_id = p_group and profile_id = p_profile;

  -- Is er daarna niets meer van deze persoon over, dan is de naam het laatste
  -- stukje persoonsgegeven dat nog ergens staat. Dat hoort ook weg -- maar
  -- alleen bij iemand zonder account; wie kan inloggen, verwijdert zichzelf
  -- via Meer > Mijn gegevens, en dat is niet aan een beheerder van één groep.
  if not exists (select 1 from memberships where profile_id = p_profile)
     and not exists (select 1 from enrollments where profile_id = p_profile)
     and not exists (select 1 from auth.users u where u.id = p_profile)
  then
    delete from profiles where id = p_profile;
  end if;

  return weg;
end;
$fn$;
