-- aftekenboek — een groep raakt zijn laatste beheerder niet kwijt
--
-- Het rollenscherm liet een beheerder zichzelf met één tik lid maken. Daarna
-- kan diezelfde persoon niets meer beheren — ook niet zijn eigen rol
-- terugzetten — en is er niemand anders die het kan. De enige uitweg is de SQL
-- Editor, en dat is geen uitweg voor een leidinggevende op een vaaravond.
--
-- Een waarschuwing in de app was er al en hielp niet, want de tik is precies
-- even makkelijk met of zonder waarschuwing. Dus staat de regel hier: wie de
-- laatste beheerder van een groep is, kan die rol niet verliezen.
--
-- Alleen bij UPDATE, met opzet. Bij DELETE zou dezelfde controle het
-- verwijderen van een groep blokkeren (memberships hangt er met cascade aan) en
-- het opheffen van een account (profiles idem). Een beheerder die zijn eigen
-- lidmaatschap weggooit is een bewuste daad die de app nergens aanbiedt; een
-- account dat niet meer opgeheven kan worden is een echt probleem.
--
-- Draai na 010-eisen.sql.

create or replace function keep_one_beheerder ()
  returns trigger language plpgsql set search_path = public as $fn$
begin
  -- Alleen het wegnemen van een beheerdersrol is interessant.
  if old.role <> 'beheerder' then
    return new;
  end if;
  if new.role = 'beheerder' and new.group_id = old.group_id then
    return new;
  end if;

  if not exists (
    select 1 from memberships
    where group_id = old.group_id
      and role = 'beheerder'
      and id <> old.id
  ) then
    raise exception
      'Dit is de laatste beheerder van de groep. Maak eerst iemand anders beheerder.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists memberships_keep_one_beheerder on memberships;

create trigger memberships_keep_one_beheerder
  before update on memberships
  for each row execute function keep_one_beheerder ();
