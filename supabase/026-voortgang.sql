-- vinkje — de voortgang van de hele groep in één keer
--
-- Tot nu toe kon je de stand alleen per persoon opvragen: member_enrollments
-- staat op de eigen profile_id en enrollment_sheet op één inschrijving. Goed
-- voor de app, waar je naar één vaarder kijkt. Onbruikbaar voor de vraag die
-- een instructeur op de steiger stelt: wie moet er nog wat, en wat gaan we
-- vanmiddag doen.
--
-- Twee functies, en ze geven hetzelfde antwoord van twee kanten:
--
--   group_progress   per inschrijving één regel — wie, welk diploma, hoe ver.
--                    Dit is de lijst waarin je iemand zoekt.
--   diploma_eis_stand per eis per lid de stand. Dit is het raster waarin je
--                    ziet dat tien van de twaalf mensen dezelfde eis nog
--                    missen, en dus weet wat je vanmiddag op het water doet.
--
-- Beide zijn alleen voor instructeurs en beheerders. Ze geven de stand van
-- iedereen in de groep, en dat is precies wat een lid niet van zijn
-- medevaarders hoort te zien. Daarom een harde controle vooraf en niet alleen
-- een filter in de where: een filter dat stilletjes niets teruggeeft lijkt op
-- een lege groep, en dan ga je zoeken in de verkeerde hoek.

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
    -- Alleen eisen, geen onderdelen: die hangen eronder en zijn geen eigen eis.
    count(r.id) filter (where r.kind = 'praktijk'),
    count(s.id) filter (where r.kind = 'praktijk' and s.status = 'gehaald'),
    count(r.id) filter (where r.kind = 'theorie'),
    count(s.id) filter (where r.kind = 'theorie' and s.status = 'gehaald'),
    -- Behandeld maar nog niet gehaald. Telt niet mee in de voortgang, maar je
    -- wil het zien: hier is iemand mee bezig, dus hier valt winst te halen.
    count(s.id) filter (where s.status = 'behandeld'),
    max(s.signed_at) filter (where s.status = 'gehaald')
  from enrollments e
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

-- Het raster. Eén regel per eis per ingeschreven lid, met de stand erbij.
--
-- Null in `status` is "niet behandeld" — er is dan geen rij in sign_offs. Dat
-- is met opzet een cross join: zou je alleen de bestaande aftekeningen
-- teruggeven, dan kon de pagina niet onderscheiden tussen "deze eis is nog
-- niet behandeld" en "dit lid doet dit diploma niet". Juist die eerste groep is
-- waar het hier om gaat.
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
  join profiles p on p.id = e.profile_id
  join requirements r on r.diploma_id = e.diploma_id and r.parent_id is null
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  where e.group_id = p_group
    and e.diploma_id = p_diploma
  order by r.kind, r.position, p.full_name;
end;
$fn$;
