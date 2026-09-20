-- aftekenboek — iemand uit de groep halen, en de catalogus bewerkbaar maken
--
-- Twee dingen die tot nu toe alleen via de SQL Editor konden.
--
-- 1. Iemand verwijderen. De aftekeningen blijven staan: als een lid volgend
--    seizoen terugkomt met een nieuwe code, staat zijn vorderingenstaat er weer
--    precies zoals hij hem achterliet. Wie weg is uit de groep ziet en telt
--    nergens mee, maar wat hij heeft laten zien is niet ongedaan gemaakt door
--    het verlopen van een lidmaatschap.
--
-- 2. De catalogus. Die was met opzet vanuit de app niet te wijzigen, met de
--    redenering dat de eisen landelijk vastgesteld zijn. Dat blijft waar, maar
--    de werkelijkheid duwt terug: de sloep/motorvlet-lijst moet per niveau
--    nagelopen worden, en dat kan niet elke keer een SQL-plakoefening zijn.
--    Beheerders mogen hem nu bewerken vanuit de beheerpagina.
--
--    Let op wat dat betekent: de catalogus is gedeeld. Een wijziging geldt voor
--    elke groep in deze database. Zolang dat er één is, is dat geen probleem —
--    komt er een tweede groep bij, dan moet dit opnieuw bekeken worden.
--
-- Draai na 012-onderdelen.sql.

-- ---------------------------------------------------------------- verwijderen
--
-- Verwijderen gaat via deze functie en niet via een delete-policy, zodat de
-- controle op de laatste beheerder er niet omheen kan. De trigger uit
-- 011 dekt alleen UPDATE — bij DELETE zou die het opheffen van een groep of
-- een account blokkeren, dus zit de regel hier nog een keer.

create or replace function remove_member (p_group uuid, p_profile uuid)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  target member_role;
begin
  if not is_admin(p_group) then
    raise exception 'Alleen een beheerder kan iemand uit de groep halen';
  end if;

  select role into target from memberships
  where group_id = p_group and profile_id = p_profile;

  if not found then
    raise exception 'Deze persoon zit niet in de groep';
  end if;

  if target = 'beheerder' and not exists (
    select 1 from memberships
    where group_id = p_group and role = 'beheerder' and profile_id <> p_profile
  ) then
    raise exception
      'Dit is de laatste beheerder van de groep. Maak eerst iemand anders beheerder.';
  end if;

  delete from memberships where group_id = p_group and profile_id = p_profile;
end;
$fn$;

-- De brede for-all-policy gaf ook delete weg. Die wordt gesplitst, zodat
-- remove_member de enige weg naar buiten is. Cascades vanuit groups en
-- profiles blijven werken: die voert de database zelf uit, buiten de policies om.
drop policy if exists memberships_admin_write on memberships;

create policy memberships_admin_insert on memberships
  for insert to authenticated with check (is_admin(group_id));

create policy memberships_admin_update on memberships
  for update to authenticated
  using (is_admin(group_id)) with check (is_admin(group_id));

-- ---------------------------------------------------------------- catalogus

create or replace function is_any_admin ()
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships
    where profile_id = auth.uid() and role = 'beheerder'
  );
$fn$;

create policy disciplines_admin_write on disciplines
  for all to authenticated using (is_any_admin()) with check (is_any_admin());

create policy diplomas_admin_write on diplomas
  for all to authenticated using (is_any_admin()) with check (is_any_admin());

create policy requirements_admin_write on requirements
  for all to authenticated using (is_any_admin()) with check (is_any_admin());

-- ---------------------------------------------------------------- wat er hangt
--
-- Voor de beheerpagina: hoeveel er aan een diploma of een eis vastzit, zodat
-- een beheerder wéét wat hij weggooit voordat hij het weggooit.

create or replace function catalogue_usage ()
  returns table (
    diploma_id     uuid,
    enrollments    bigint,
    sign_offs      bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select
    d.id,
    count(distinct e.id),
    count(s.id)
  from diplomas d
  left join enrollments e on e.diploma_id = d.id
  left join sign_offs s on s.enrollment_id = e.id
  where is_any_admin()
  group by d.id;
$fn$;
