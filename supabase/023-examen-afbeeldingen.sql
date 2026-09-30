-- vinkje — plaatjes bij een examenvraag
--
-- Een verkeersteken, een knoop, een situatie op het water: sommige vragen zijn
-- zonder plaatje niet te stellen. De bestanden zelf horen niet in de database
-- maar in de opslag van Supabase; `exam_questions.image_path` wijst ernaar.
--
-- De map is openbaar leesbaar, en dat is een keuze: de deelnemer heeft geen
-- account, dus er is niemand om een afgeschermde link aan te geven. Wat erin
-- staat zijn plaatjes bij een vraag — geen gegevens over een persoon. Het juiste
-- antwoord staat er niet in, dus wie een plaatje vindt, weet nog niets.
--
-- Uploaden mag alleen een instructeur of beheerder. Dat is strenger dan lezen,
-- want een open uploadmap is een gratis bestandsserver voor de hele wereld.
--
-- Draai na 022-examen-aftekenen.sql.

create or replace function is_any_staff ()
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships
    where profile_id = auth.uid() and role in ('instructeur', 'beheerder')
  );
$fn$;

-- De opslag bestaat alleen op een echt Supabase-project. In de tests draait
-- Postgres zonder dat schema, en dan slaat dit blok zichzelf over.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Geen storage-schema: opslagregels overgeslagen (dat hoort zo buiten Supabase).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('examen', 'examen', true, 5242880,
          array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = true,
        file_size_limit = 5242880,
        allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  execute $p$ drop policy if exists examen_lezen on storage.objects $p$;
  execute $p$
    create policy examen_lezen on storage.objects
      for select using (bucket_id = 'examen')
  $p$;

  execute $p$ drop policy if exists examen_schrijven on storage.objects $p$;
  execute $p$
    create policy examen_schrijven on storage.objects
      for insert to authenticated
      with check (bucket_id = 'examen' and is_any_staff())
  $p$;

  execute $p$ drop policy if exists examen_vervangen on storage.objects $p$;
  execute $p$
    create policy examen_vervangen on storage.objects
      for update to authenticated
      using (bucket_id = 'examen' and is_any_staff())
      with check (bucket_id = 'examen' and is_any_staff())
  $p$;

  execute $p$ drop policy if exists examen_weghalen on storage.objects $p$;
  execute $p$
    create policy examen_weghalen on storage.objects
      for delete to authenticated
      using (bucket_id = 'examen' and is_any_staff())
  $p$;
end;
$$;
