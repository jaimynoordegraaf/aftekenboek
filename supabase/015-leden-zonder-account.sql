-- aftekenboek — leden die geen account hebben
--
-- Tot nu toe was een lid hetzelfde als een account: profiles.id verwees naar
-- auth.users, dus je kon alleen in het register staan als je je had aangemeld.
-- Dat past niet bij de werkelijkheid. De meeste vaarders zijn kinderen zonder
-- telefoon; die gaan zich niet aanmelden, en hun vorderingenstaat moet er toch
-- zijn.
--
-- Dus knipt dit bestand die twee uit elkaar. Een profiel is voortaan "een
-- persoon in het register". Heeft iemand een account, dan is zijn profiel-id
-- gelijk aan zijn auth-id — precies zoals het altijd al was, en daarom blijft
-- elke policy die `= auth.uid()` vergelijkt gewoon kloppen. Heeft iemand geen
-- account, dan krijgt hij een eigen id dat nooit met een auth-id samenvalt, en
-- matcht hij simpelweg nergens op.
--
-- Bijvangst die we willen: een account opheffen wist de persoon niet meer. Wat
-- iemand op het water heeft laten zien hoort niet te verdwijnen omdat hij zijn
-- login kwijtraakt.
--
-- Wat dit NIET doet: een account koppelen aan iemand die al in het register
-- staat. Krijgt een lid later toch een telefoon, dan levert aanmelden een
-- tweede kaart op. Daar is bewust voor gekozen — leden loggen niet in — en de
-- versie waarin ze dat wel deden staat onder de tag v0.1-leden-met-login.
--
-- Draai na 014-speltakken.sql.

-- ---------------------------------------------------------------- losknippen

alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------- toevoegen
--
-- Instructeurs mogen dit ook, niet alleen beheerders: wie op de steiger merkt
-- dat er iemand bij is gekomen, moet hem meteen kunnen aanmaken.

create or replace function add_member (p_group uuid, p_name text)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  pid uuid;
begin
  if not is_staff(p_group) then
    raise exception 'Alleen instructeurs en beheerders kunnen leden toevoegen';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Vul een naam in';
  end if;

  insert into profiles (full_name) values (trim(p_name)) returning id into pid;

  -- Altijd als lid. Een instructeur moet kunnen inloggen om af te tekenen, en
  -- daarvoor is een account nodig; die komt binnen met een uitnodigingscode.
  insert into memberships (group_id, profile_id, role) values (p_group, pid, 'lid');

  return pid;
end;
$fn$;

-- ---------------------------------------------------------------- hernoemen
--
-- Iemand zonder account kan zijn eigen naam niet corrigeren, dus moet iemand
-- anders dat kunnen. Begrensd tot de eigen groep.

create or replace function set_member_name (p_group uuid, p_profile uuid, p_name text)
  returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not is_staff(p_group) then
    raise exception 'Alleen instructeurs en beheerders kunnen een naam aanpassen';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Vul een naam in';
  end if;
  if not exists (
    select 1 from memberships
    where group_id = p_group and profile_id = p_profile
  ) then
    raise exception 'Deze persoon zit niet in de groep';
  end if;

  update profiles
  set full_name = trim(p_name), updated_at = now()
  where id = p_profile;
end;
$fn$;

-- ---------------------------------------------------------------- opruimen
--
-- profiles hing met een cascade aan auth.users, dus een opgeheven account nam
-- het profiel mee. Dat is nu weg, en daarmee ook de enige automatische
-- opruiming. Een los profiel zonder lidmaatschap is verder onschadelijk: het
-- staat in geen enkele lijst, want elke lijst loopt via memberships.
