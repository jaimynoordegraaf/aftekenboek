-- aftekenboek — je eigen account verwijderen, vanuit de app
--
-- Google en Apple eisen allebei dat wie in een app een account kan maken, dat
-- account ook in de app kan laten verwijderen. Dit is de functie achter die
-- knop.
--
-- Wat er verdwijnt, en dat is precies wat het privacybeleid belooft:
--
--   * de login (auth.users);
--   * de persoon in het register (profiles), en via de cascades daarop zijn
--     lidmaatschappen, speltakken, bakken en zijn eigen voortgang;
--   * op aftekeningen die hij als instructeur bij anderen zette blijft staan
--     dát ze gezet zijn, maar niet meer door wie: sign_offs.signed_by is
--     "on delete set null", en de vaarder houdt zijn aftekening.
--
-- Twee deletes, omdat account en persoon sinds 015 los van elkaar staan: het
-- ene weghalen raakt het andere niet meer.
--
-- De laatste beheerder van een groep kan dit niet. Dezelfde regel als bij het
-- degraderen (011) en het verwijderen door een ander (013): anders blijft er een
-- groep achter die niemand meer kan beheren.
--
-- Draai na 016-bakken-en-standen.sql.

create or replace function delete_my_account ()
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'niet ingelogd';
  end if;

  if exists (
    select 1
    from memberships m
    where m.profile_id = me
      and m.role = 'beheerder'
      and not exists (
        select 1 from memberships o
        where o.group_id = m.group_id and o.role = 'beheerder' and o.profile_id <> me
      )
  ) then
    raise exception
      'Je bent de laatste beheerder van je groep. Maak eerst iemand anders beheerder, dan kun je je account verwijderen.';
  end if;

  delete from profiles where id = me;
  delete from auth.users where id = me;
end;
$fn$;
