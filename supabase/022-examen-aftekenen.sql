-- vinkje — van een uitslag naar een aftekening
--
-- Een vraag weet sinds 021 bij welke eis hij hoort. Daarmee is een uitslag meer
-- dan een cijfer: per eis is te zien of de vragen erover goed waren. Deze
-- migratie zet dat om in twee functies voor de beheerpagina.
--
-- Wat dit met opzet níét doet: automatisch aftekenen. De instructeur kiest welke
-- eisen hij overneemt en drukt op de knop. Een fout in een vraag hoort niet
-- vanzelf in iemands vorderingenstaat te belanden, en "acht van de tien goed"
-- is geen oordeel over welke acht.
--
-- Draai na 021-examenvraag-bij-eis.sql.

-- Per eis: hoeveel vragen erover gingen, hoeveel er goed waren, en of de
-- gekoppelde vaarder een lopende opleiding heeft waar die eis in zit.
create or replace function exam_attempt_requirements (p_attempt uuid)
  returns table (
    requirement_id uuid,
    eis_position   int,
    eis_title      text,
    diploma_id     uuid,
    diploma_name   text,
    vragen         int,
    goed           int,
    enrollment_id  uuid,
    huidige_status text
  )
  language plpgsql stable security definer set search_path = public as $fn$
declare
  gid uuid;
  wie uuid;
begin
  select exam_session_group(a.session_id), a.profile_id into gid, wie
  from exam_attempts a where a.id = p_attempt;

  if gid is null or not is_staff(gid) then
    raise exception 'Alleen instructeurs en beheerders van deze groep kunnen dit bekijken';
  end if;

  return query
  select
    r.id, r.position, r.title, d.id, d.name,
    count(q.id)::int,
    count(*) filter (where ant.correct)::int,
    e.id,
    s.status::text
  from exam_questions q
  join exam_sessions ses on ses.exam_id = q.exam_id
  join requirements r on r.id = q.requirement_id
  join diplomas d on d.id = r.diploma_id
  left join exam_answers ant on ant.question_id = q.id and ant.attempt_id = p_attempt
  -- De opleiding van déze vaarder in déze groep; zonder koppeling is er niets
  -- om op af te tekenen, en dat mag je zien in plaats van dat het stil misgaat.
  left join enrollments e
    on e.diploma_id = d.id and e.group_id = gid and e.profile_id = wie
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  where ses.id = (select session_id from exam_attempts where id = p_attempt)
  group by r.id, r.position, r.title, d.id, d.name, e.id, s.status
  order by d.name, r.position;
end;
$fn$;

-- De knop zelf: zet de gekozen eisen op een stand, met een notitie die zegt
-- waar hij vandaan komt. Wie later naar de aftekenlijst kijkt, leest dus niet
-- alleen dát het gehaald is maar ook waardoor.
create or replace function exam_sign_off_from_attempt (
  p_attempt      uuid,
  p_requirements uuid[],
  p_status       sign_off_status default 'gehaald'
)
  returns int language plpgsql security definer set search_path = public as $fn$
declare
  gid    uuid;
  wie    uuid;
  titel  text;
  dag    date;
  r      record;
  gedaan int := 0;
begin
  select exam_session_group(a.session_id), a.profile_id, e.title, a.submitted_at::date
  into gid, wie, titel, dag
  from exam_attempts a
  join exam_sessions s on s.id = a.session_id
  join exams e on e.id = s.exam_id
  where a.id = p_attempt;

  if gid is null or not is_staff(gid) then
    raise exception 'Alleen instructeurs en beheerders van deze groep kunnen aftekenen';
  end if;
  if wie is null then
    raise exception 'Koppel deze deelname eerst aan een vaarder';
  end if;

  for r in
    select er.requirement_id, er.enrollment_id
    from exam_attempt_requirements(p_attempt) er
    where er.requirement_id = any (p_requirements)
  loop
    if r.enrollment_id is null then
      raise exception 'Deze vaarder werkt niet aan het diploma waar die eis bij hoort';
    end if;

    perform set_sign_off_status(
      r.enrollment_id, r.requirement_id, p_status,
      format('Examen %s, %s', coalesce(titel, 'onbekend'), coalesce(dag::text, 'zonder datum'))
    );
    gedaan := gedaan + 1;
  end loop;

  return gedaan;
end;
$fn$;
