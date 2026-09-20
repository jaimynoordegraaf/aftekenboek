-- aftekenboek — speltakken die ook echt ergens aan hangen
--
-- De tabellen stonden er vanaf het begin, meegekomen uit het fundament van de
-- groepsapp, maar er was geen enkele manier om iemand in een speltak te zetten.
-- De enige schrijver was redeem_invite, en het scherm waar je codes maakt liet
-- je geen speltak kiezen — dus bleef membership_sections leeg en verschenen de
-- labels op de ledenlijst nooit.
--
-- Dit bestand maakt het af: de ledenlijst geeft de speltakken nu ook als ids
-- terug zodat er op gefilterd kan worden, en toewijzen gaat via één functie die
-- de hele set in één keer vervangt.
--
-- Draai na 013-beheer.sql.

-- ---------------------------------------------------------------- ledenlijst
--
-- Namen erbij voor het scherm, ids erbij voor het filter en de toewijzing, en
-- membership_id omdat membership_sections daarop hangt en niet op profile_id.

drop function if exists group_members (uuid);

create or replace function group_members (p_group uuid)
  returns table (
    profile_id    uuid,
    membership_id uuid,
    full_name     text,
    role          member_role,
    sections      text[],
    section_ids   uuid[],
    in_progress   bigint,
    awarded       bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select
    p.id,
    m.id,
    p.full_name,
    m.role,
    coalesce(
      (select array_agg(s.name order by s.sort_order, s.name)
       from membership_sections ms
       join sections s on s.id = ms.section_id
       where ms.membership_id = m.id),
      '{}'
    ),
    coalesce(
      (select array_agg(s.id order by s.sort_order, s.name)
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

-- ---------------------------------------------------------------- toewijzen
--
-- De hele set in één keer vervangen in plaats van los toevoegen en weghalen.
-- Een scherm met vinkjes weet welke speltakken aan horen te staan; het zou de
-- verschillen zelf moeten uitrekenen, en dan halverwege kunnen stranden met een
-- lid dat in twee speltakken tegelijk zit die elkaar uitsluiten.

create or replace function set_member_sections (
  p_group uuid,
  p_profile uuid,
  p_sections uuid[]
)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  mid uuid;
begin
  if not is_admin(p_group) then
    raise exception 'Alleen een beheerder kan speltakken toewijzen';
  end if;

  select id into mid from memberships
  where group_id = p_group and profile_id = p_profile;

  if not found then
    raise exception 'Deze persoon zit niet in de groep';
  end if;

  -- Een speltak van een andere groep zou hier binnen kunnen komen omdat de
  -- functie security definer is en de policies dus niet meekijken.
  if exists (
    select 1
    from unnest(coalesce(p_sections, '{}'::uuid[])) as given(id)
    where not exists (
      select 1 from sections s where s.id = given.id and s.group_id = p_group
    )
  ) then
    raise exception 'Die speltak hoort niet bij deze groep';
  end if;

  delete from membership_sections where membership_id = mid;

  insert into membership_sections (membership_id, section_id)
  select mid, given.id
  from unnest(coalesce(p_sections, '{}'::uuid[])) as given(id);
end;
$fn$;
