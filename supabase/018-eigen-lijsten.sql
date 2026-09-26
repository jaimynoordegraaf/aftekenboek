-- vinkje — eigen eisenlijsten naast de landelijke catalogus
--
-- Tot nu toe was er één catalogus, van niemand: de landelijke CWO/Watersport
-- Academy-eisen, gelijk voor elke groep, en daarom zonder group_id. Dat klopt
-- nog steeds voor die eisen, maar het is niet alles wat een groep aftekent. Er
-- is een bemanningslid-insigne, er is een herfstkamp waarin een vlet een
-- verkorte lijst afwerkt, en dat hoort nergens.
--
-- Dus komt er een tweede soort lijst ernaast:
--
--   group_id is null      landelijk. Van niemand, voor iedereen zichtbaar, en
--                         alleen te wijzigen door 010-eisen.sql opnieuw te
--                         draaien.
--   group_id is not null  van één groep. Alleen die groep ziet hem, en zijn
--                         instructeurs en beheerders mogen hem bewerken.
--
-- Dat het onderscheid één kolom is en geen tweede tabel, is met opzet: een
-- aftekening, een inschrijving en de voortgangsberekening kijken niet of een
-- eis landelijk is. Alles wat er al staat blijft werken.
--
-- Wat hierbij verdwijnt: sinds 013 mocht een beheerder de landelijke catalogus
-- bewerken vanuit de beheerpagina. Dat was te ruim — die wijziging gold voor
-- élke groep in deze database, en inmiddels deelt een tweede app hetzelfde
-- project. Landelijk is weer alleen-lezen; wie iets aan de landelijke eisen wil
-- veranderen, doet dat in 010-eisen.sql.
--
-- Draai na 017-account-verwijderen.sql.

-- ------------------------------------------------------------------ kolommen

do $$
begin
  if not exists (select 1 from pg_type where typname = 'list_kind') then
    create type list_kind as enum ('diploma', 'insigne');
  end if;
end;
$$;

alter table diplomas
  add column if not exists group_id uuid references groups (id) on delete cascade,
  add column if not exists kind list_kind not null default 'diploma';

create index if not exists diplomas_group_id_idx on diplomas (group_id);

-- Een eigen lijst hangt niet onder een landelijke discipline (Roeien, Zeilen,
-- Buitenboordmotor): die zijn van de CWO. Hij staat op zichzelf, onder zijn
-- eigen kopje in de app.
alter table diplomas alter column discipline_id drop not null;

alter table diplomas drop constraint if exists diplomas_eigen_of_landelijk;
alter table diplomas add constraint diplomas_eigen_of_landelijk check (
  (group_id is null and discipline_id is not null) or
  (group_id is not null and discipline_id is null)
);

-- ------------------------------------------------------------------ zichtbaar
--
-- Lezen: de landelijke lijst voor iedereen die is ingelogd, een eigen lijst
-- alleen voor de groep zelf.

drop policy if exists diplomas_read on diplomas;
create policy diplomas_read on diplomas
  for select to authenticated
  using (group_id is null or is_member(group_id));

drop policy if exists requirements_read on requirements;
create policy requirements_read on requirements
  for select to authenticated
  using (exists (
    select 1 from diplomas d
    where d.id = requirements.diploma_id
      and (d.group_id is null or is_member(d.group_id))
  ));

-- ------------------------------------------------------------------ schrijven
--
-- De brede policies uit 013 gaven élke beheerder de hele catalogus. Weg ermee.
-- Schrijven mag alleen op een lijst die van je eigen groep is; de landelijke
-- rijen vallen buiten elke write-policy en zijn daarmee onaanraakbaar.

drop policy if exists disciplines_admin_write on disciplines;
drop policy if exists diplomas_admin_write on diplomas;
drop policy if exists requirements_admin_write on requirements;

drop policy if exists diplomas_own_write on diplomas;
create policy diplomas_own_write on diplomas
  for all to authenticated
  using (group_id is not null and is_staff(group_id))
  with check (group_id is not null and is_staff(group_id));

drop policy if exists requirements_own_write on requirements;
create policy requirements_own_write on requirements
  for all to authenticated
  using (exists (
    select 1 from diplomas d
    where d.id = requirements.diploma_id
      and d.group_id is not null and is_staff(d.group_id)
  ))
  with check (exists (
    select 1 from diplomas d
    where d.id = requirements.diploma_id
      and d.group_id is not null and is_staff(d.group_id)
  ));

-- ------------------------------------------------------------------ aanmaken

-- Codes zijn er voor 010-eisen.sql, dat op `code` bijwerkt. Een eigen lijst
-- wordt nooit door dat bestand aangeraakt, dus krijgt hij een code die er
-- gegarandeerd niet mee botst.
create or replace function own_code (p_prefix text)
  returns text language sql volatile set search_path = public as $fn$
  select p_prefix || replace(gen_random_uuid()::text, '-', '');
$fn$;

-- Een lege lijst: voor een insigne of iets wat nergens op lijkt.
create or replace function create_own_list (
  p_group   uuid,
  p_name    text,
  p_kind    list_kind default 'diploma',
  p_summary text default null
)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  new_id uuid;
begin
  if not is_staff(p_group) then
    raise exception 'Alleen instructeurs en beheerders kunnen een eigen lijst maken';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Vul een naam in';
  end if;

  insert into diplomas (discipline_id, group_id, kind, code, name, summary, sort_order)
  values (null, p_group, p_kind, own_code('eigen-'), trim(p_name), nullif(trim(p_summary), ''),
          coalesce((select max(sort_order) + 1 from diplomas where group_id = p_group), 1))
  returning id into new_id;

  return new_id;
end;
$fn$;

-- Kopiëren en inkorten: de gewone weg voor "hetzelfde als Roeien I/II, maar
-- korter". De kopie staat helemaal los van het origineel — schrappen in de
-- kopie raakt de landelijke lijst niet, en andersom.
create or replace function copy_list_to_group (
  p_group  uuid,
  p_source uuid,
  p_name   text default null,
  p_kind   list_kind default 'diploma'
)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  bron   diplomas%rowtype;
  new_id uuid;
begin
  if not is_staff(p_group) then
    raise exception 'Alleen instructeurs en beheerders kunnen een eigen lijst maken';
  end if;

  select * into bron from diplomas where id = p_source;
  if not found then
    raise exception 'Die lijst bestaat niet';
  end if;
  if bron.group_id is not null and not is_member(bron.group_id) then
    raise exception 'Die lijst bestaat niet';
  end if;

  insert into diplomas (discipline_id, group_id, kind, code, name, level_label, summary,
                        theory_valid_months, source, sort_order)
  values (null, p_group, p_kind, own_code('eigen-'),
          coalesce(nullif(trim(p_name), ''), bron.name || ' (eigen)'),
          bron.level_label, bron.summary, bron.theory_valid_months,
          coalesce(bron.source, bron.name),
          coalesce((select max(sort_order) + 1 from diplomas where group_id = p_group), 1))
  returning id into new_id;

  -- Eerst de eisen, dan de onderdelen. Een onderdeel vindt zijn nieuwe ouder
  -- terug op soort en nummer: die twee zijn binnen een lijst uniek (zie de
  -- index requirements_top_position uit 012), dus dat wijst altijd één rij aan.
  insert into requirements (diploma_id, code, kind, "position", title, detail)
  select new_id, own_code('eigen-'), b.kind, b."position", b.title, b.detail
  from requirements b
  where b.diploma_id = p_source and b.parent_id is null;

  insert into requirements (diploma_id, code, kind, "position", title, detail, parent_id)
  select new_id, own_code('eigen-'), o.kind, o."position", o.title, o.detail, nieuwe_ouder.id
  from requirements o
  join requirements oude_ouder on oude_ouder.id = o.parent_id
  join requirements nieuwe_ouder
    on nieuwe_ouder.diploma_id = new_id
   and nieuwe_ouder.parent_id is null
   and nieuwe_ouder.kind = oude_ouder.kind
   and nieuwe_ouder."position" = oude_ouder."position"
  where o.diploma_id = p_source and o.parent_id is not null;

  return new_id;
end;
$fn$;

-- ------------------------------------------------------------------ bijwerken

create or replace function own_list_group (p_diploma uuid)
  returns uuid language sql stable security definer set search_path = public as $fn$
  select group_id from diplomas where id = p_diploma;
$fn$;

create or replace function assert_own_list (p_diploma uuid)
  returns uuid language plpgsql stable security definer set search_path = public as $fn$
declare
  gid uuid := own_list_group(p_diploma);
begin
  if gid is null then
    raise exception 'Dit is een landelijke lijst. Die kun je niet aanpassen; maak er een eigen kopie van.';
  end if;
  if not is_staff(gid) then
    raise exception 'Alleen instructeurs en beheerders van deze groep kunnen dit aanpassen';
  end if;
  return gid;
end;
$fn$;

create or replace function update_own_list (
  p_diploma uuid,
  p_name    text,
  p_kind    list_kind default null,
  p_summary text default null
)
  returns void language plpgsql security definer set search_path = public as $fn$
begin
  perform assert_own_list(p_diploma);
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Vul een naam in';
  end if;

  update diplomas
  set name    = trim(p_name),
      kind    = coalesce(p_kind, kind),
      summary = nullif(trim(p_summary), '')
  where id = p_diploma;
end;
$fn$;

-- Weggooien mag pas als er niemand meer aan werkt: anders verdwijnt met de
-- lijst ook de voortgang van iedereen die hem volgde, zonder waarschuwing.
create or replace function delete_own_list (p_diploma uuid)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  bezig int;
begin
  perform assert_own_list(p_diploma);

  select count(*) into bezig from enrollments where diploma_id = p_diploma;
  if bezig = 1 then
    raise exception 'Er werkt nog iemand aan deze lijst. Haal die opleiding eerst weg.';
  elsif bezig > 1 then
    raise exception 'Er werken nog % mensen aan deze lijst. Haal die opleidingen eerst weg.', bezig;
  end if;

  delete from diplomas where id = p_diploma;
end;
$fn$;

-- ------------------------------------------------------------------ eisen

create or replace function add_own_requirement (
  p_diploma uuid,
  p_kind    requirement_kind,
  p_title   text,
  p_detail  text default null,
  p_parent  uuid default null
)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  new_id uuid;
  pos    int;
  soort  requirement_kind := p_kind;
begin
  perform assert_own_list(p_diploma);
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Vul een omschrijving in';
  end if;

  if p_parent is not null then
    -- Een onderdeel hoort bij zijn eis: zelfde lijst, zelfde soort.
    select r.kind into soort from requirements r
    where r.id = p_parent and r.diploma_id = p_diploma;
    if not found then
      raise exception 'Die eis hoort niet bij deze lijst';
    end if;
    select coalesce(max("position") + 1, 1) into pos
    from requirements where parent_id = p_parent;
  else
    select coalesce(max("position") + 1, 1) into pos
    from requirements where diploma_id = p_diploma and kind = soort and parent_id is null;
  end if;

  insert into requirements (diploma_id, code, kind, "position", title, detail, parent_id)
  values (p_diploma, own_code('eigen-'), soort, pos, trim(p_title),
          nullif(trim(p_detail), ''), p_parent)
  returning id into new_id;

  return new_id;
end;
$fn$;

create or replace function update_own_requirement (
  p_requirement uuid,
  p_title       text,
  p_detail      text default null
)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  dip uuid;
begin
  select diploma_id into dip from requirements where id = p_requirement;
  if not found then
    raise exception 'Die eis bestaat niet';
  end if;
  perform assert_own_list(dip);
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Vul een omschrijving in';
  end if;

  update requirements
  set title = trim(p_title), detail = nullif(trim(p_detail), '')
  where id = p_requirement;
end;
$fn$;

-- Verwijderen sluit het gat in de nummering, anders loopt de volgende toevoeging
-- tegen de unieke index aan.
create or replace function delete_own_requirement (p_requirement uuid)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  r requirements%rowtype;
begin
  select * into r from requirements where id = p_requirement;
  if not found then
    return;
  end if;
  perform assert_own_list(r.diploma_id);

  delete from requirements where id = p_requirement;

  if r.parent_id is null then
    update requirements
    set "position" = "position" - 1
    where diploma_id = r.diploma_id and kind = r.kind and parent_id is null
      and "position" > r."position";
  else
    update requirements
    set "position" = "position" - 1
    where parent_id = r.parent_id and "position" > r."position";
  end if;
end;
$fn$;

-- Volgorde: de lijst zoals hij op het scherm hoort te staan, in één keer.
-- Eerst naar negatieve nummers, anders botst een wissel met de unieke index.
create or replace function set_own_requirement_order (
  p_diploma uuid,
  p_kind    requirement_kind,
  p_parent  uuid,
  p_ids     uuid[]
)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  i int;
begin
  perform assert_own_list(p_diploma);

  update requirements set "position" = -"position"
  where diploma_id = p_diploma
    and id = any (p_ids)
    and ((p_parent is null and parent_id is null and kind = p_kind)
      or (p_parent is not null and parent_id = p_parent));

  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update requirements set "position" = i
    where id = p_ids[i] and diploma_id = p_diploma and "position" < 0;
  end loop;

  if exists (
    select 1 from requirements
    where diploma_id = p_diploma and "position" < 0
  ) then
    raise exception 'De volgorde moet alle eisen noemen';
  end if;
end;
$fn$;

-- ------------------------------------------------------------------ overzicht
--
-- catalogue_usage uit 013 telde over alle groepen. Dat hoort niet meer: tel
-- alleen wat in je eigen groepen aan een lijst hangt.
create or replace function catalogue_usage ()
  returns table (
    diploma_id  uuid,
    enrollments bigint,
    sign_offs   bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select
    d.id,
    count(distinct e.id),
    count(s.id)
  from diplomas d
  left join enrollments e on e.diploma_id = d.id and is_staff(e.group_id)
  left join sign_offs s on s.enrollment_id = e.id
  where d.group_id is null or is_member(d.group_id)
  group by d.id;
$fn$;
