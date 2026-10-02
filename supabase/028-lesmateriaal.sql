-- vinkje — lesmateriaal van de groep bij een diploma
--
-- Een lesboek, een naslagkaart, een eigen uitleg: dingen die een vaarder erbij
-- wil hebben als hij voor een diploma leert. Het bestand gaat in de opslag van
-- Supabase, de regel in deze tabel wijst ernaar.
--
-- Twee dingen anders dan bij de examenplaatjes in 023, allebei met reden.
--
-- 1. De map is NIET openbaar. Bij een examenplaatje kon dat: de deelnemer heeft
--    geen account, dus er is niemand om een afgeschermde link aan te geven, en
--    een plaatje van een verkeersteken is van niemand. Lesmateriaal is dat wel.
--    Het is vaak gemaakt door iemand anders -- een andere Scoutinggroep, een
--    uitgever -- en dan is "iedereen met de link" niet goed genoeg. Lezen gaat
--    daarom via een ondertekende link die verloopt, en die krijg je alleen als
--    je in de groep zit.
--
-- 2. Het hangt aan een groep, niet aan de landelijke catalogus. Elke groep zet
--    er zijn eigen spullen in en ziet die van een ander niet. Dat is ook de
--    reden dat dit zo gebouwd is: wie materiaal van iemand anders wil delen,
--    regelt toestemming voor zijn eigen groep en zet het in zijn eigen map,
--    zonder dat het meteen in de app van heel varend Scouting staat.
--
-- Lezen mag elk lid van de groep, dus ook een vaarder zonder instructeursrol --
-- dat is het punt van lesmateriaal. Toevoegen en weggooien is voor
-- instructeurs en beheerders.
--
-- Draai na 027-oud-lid.sql.

create table if not exists materials (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups (id) on delete cascade,
  -- Null is "hoort bij geen enkel diploma in het bijzonder": een algemene
  -- naslagkaart, de regels van de vereniging. Gaat een eigen lijst weg, dan
  -- blijft het materiaal bestaan en wordt het algemeen; weggooien van een
  -- diploma hoort geen bestand mee te nemen.
  diploma_id  uuid references diplomas (id) on delete set null,
  title       text not null,
  -- Waar het bestand staat: <group_id>/<uuid>.pdf. De groep staat vooraan
  -- omdat de opslagregels daarop kijken -- die kennen deze tabel niet.
  path        text not null unique,
  bytes       bigint,
  uploaded_by uuid references profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists materials_group_idx on materials (group_id);
create index if not exists materials_diploma_idx on materials (diploma_id);

alter table materials enable row level security;

drop policy if exists materials_lezen on materials;
create policy materials_lezen on materials
  for select using (is_member(group_id));

drop policy if exists materials_toevoegen on materials;
create policy materials_toevoegen on materials
  for insert with check (is_staff(group_id));

drop policy if exists materials_bijwerken on materials;
create policy materials_bijwerken on materials
  for update using (is_staff(group_id)) with check (is_staff(group_id));

drop policy if exists materials_weghalen on materials;
create policy materials_weghalen on materials
  for delete using (is_staff(group_id));

-- ------------------------------------------------------------- de opslag
--
-- De opslag bestaat alleen op een echt Supabase-project. In de tests draait
-- Postgres zonder dat schema, en dan slaat dit blok zichzelf over.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Geen storage-schema: opslagregels overgeslagen (dat hoort zo buiten Supabase).';
    return;
  end if;

  -- public = false. Dat is het hele verschil met de examenmap: zonder
  -- ondertekende link kom je er niet in, ook niet als je het pad raadt.
  -- 25 MB, want een gescand lesboek is zo tien.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('lesmateriaal', 'lesmateriaal', false, 26214400,
          array['application/pdf', 'image/png', 'image/jpeg'])
  on conflict (id) do update
    set public = false,
        file_size_limit = 26214400,
        allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg'];

  -- De groep staat vooraan in het pad. De regex is geen franje: zonder die
  -- controle laat een bestand met een naam als "hallo/x.pdf" de cast naar uuid
  -- klappen, en dan faalt de policy met een foutmelding in plaats van netjes
  -- nee te zeggen.
  execute $p$ drop policy if exists lesmateriaal_lezen on storage.objects $p$;
  execute $p$
    create policy lesmateriaal_lezen on storage.objects
      for select to authenticated
      using (
        bucket_id = 'lesmateriaal'
        and name ~ '^[0-9a-fA-F-]{36}/'
        and is_member(split_part(name, '/', 1)::uuid)
      )
  $p$;

  execute $p$ drop policy if exists lesmateriaal_schrijven on storage.objects $p$;
  execute $p$
    create policy lesmateriaal_schrijven on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'lesmateriaal'
        and name ~ '^[0-9a-fA-F-]{36}/'
        and is_staff(split_part(name, '/', 1)::uuid)
      )
  $p$;

  execute $p$ drop policy if exists lesmateriaal_vervangen on storage.objects $p$;
  execute $p$
    create policy lesmateriaal_vervangen on storage.objects
      for update to authenticated
      using (
        bucket_id = 'lesmateriaal'
        and name ~ '^[0-9a-fA-F-]{36}/'
        and is_staff(split_part(name, '/', 1)::uuid)
      )
      with check (
        bucket_id = 'lesmateriaal'
        and name ~ '^[0-9a-fA-F-]{36}/'
        and is_staff(split_part(name, '/', 1)::uuid)
      )
  $p$;

  execute $p$ drop policy if exists lesmateriaal_weghalen on storage.objects $p$;
  execute $p$
    create policy lesmateriaal_weghalen on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'lesmateriaal'
        and name ~ '^[0-9a-fA-F-]{36}/'
        and is_staff(split_part(name, '/', 1)::uuid)
      )
  $p$;
end;
$$;
