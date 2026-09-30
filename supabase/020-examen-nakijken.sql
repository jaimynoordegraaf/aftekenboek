-- vinkje — na afloop zien wat goed en fout was
--
-- Een uitslag van "8 van de 12" zegt een vaarder weinig. Hij wil weten welke
-- vier. Daarom mag een sessie na het inleveren de antwoorden teruggeven.
--
-- Waarom dat een knop per sessie is en niet altijd aan: wie de antwoorden ziet,
-- kan ze doorvertellen aan wie nog moet. Bij een toets in de klas wil je dat
-- pas als iedereen klaar is; bij zelf oefenen juist meteen.
--
-- Draai na 019-examens.sql.

alter table exam_sessions
  add column if not exists show_answers boolean not null default true;

-- open_exam_session krijgt er een keuze bij. Eerst de oude weg, anders bestaan
-- er twee functies met dezelfde naam en weet PostgREST niet welke je bedoelt.
drop function if exists open_exam_session (uuid, text, int, boolean);

create or replace function open_exam_session (
  p_exam         uuid,
  p_label        text default null,
  p_hours        int default 6,
  p_show_result  boolean default true,
  p_show_answers boolean default true
)
  returns table (session_id uuid, code text, closes_at timestamptz)
  language plpgsql security definer set search_path = public as $fn$
declare
  gid uuid := exam_group(p_exam);
  n   int;
begin
  if gid is null or not is_staff(gid) then
    raise exception 'Alleen instructeurs en beheerders van deze groep kunnen een examen afnemen';
  end if;

  select count(*) into n from exam_questions where exam_id = p_exam;
  if n = 0 then
    raise exception 'Dit examen heeft nog geen vragen';
  end if;

  return query
  insert into exam_sessions (exam_id, group_id, code, label, closes_at,
                             show_result, show_answers, created_by)
  values (p_exam, gid, exam_code(), nullif(trim(p_label), ''),
          now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 6), 24))),
          coalesce(p_show_result, true), coalesce(p_show_answers, true), auth.uid())
  returning exam_sessions.id, exam_sessions.code, exam_sessions.closes_at;
end;
$fn$;

-- Nakijken voor de deelnemer zelf. Pas na het inleveren, en alleen als de
-- sessie het toestaat: anders is dit een sluiproute naar de antwoorden voor wie
-- nog bezig is.
create or replace function exam_review (p_attempt uuid, p_token uuid)
  returns table (
    "position" int,
    prompt     text,
    gekozen    text,
    juiste     text,
    correct    boolean
  )
  language plpgsql stable security definer set search_path = public as $fn$
declare
  poging exam_attempts%rowtype := exam_attempt_of(p_attempt, p_token);
  s      exam_sessions%rowtype;
begin
  select * into s from exam_sessions where id = poging.session_id;

  if poging.submitted_at is null then
    raise exception 'Dit examen is nog niet ingeleverd';
  end if;
  if not s.show_answers then
    raise exception 'Je instructeur bespreekt de antwoorden met je';
  end if;

  return query
  select q.position, q.prompt,
    (select o.label from exam_options o where o.id = a.option_id),
    (select string_agg(o.label, ', ' order by o.position)
     from exam_options o where o.question_id = q.id and o.correct),
    coalesce(a.correct, false)
  from exam_questions q
  left join exam_answers a on a.question_id = q.id and a.attempt_id = poging.id
  where q.exam_id = s.exam_id
  order by q.position;
end;
$fn$;

-- exam_submit en exam_result zeggen er meteen bij of nakijken mag, zodat de
-- pagina weet of hij de knop moet tonen. Er komt een kolom bij in wat ze
-- teruggeven, en dat kan Postgres niet met "create or replace": eerst weg.
drop function if exists exam_submit (uuid, uuid);
drop function if exists exam_result (uuid, uuid);

create or replace function exam_submit (p_attempt uuid, p_token uuid)
  returns table (score int, total int, percent int, passed boolean,
                 show_result boolean, show_answers boolean)
  language plpgsql security definer set search_path = public as $fn$
declare
  poging exam_attempts%rowtype := exam_attempt_of(p_attempt, p_token);
  s      exam_sessions%rowtype;
  e      exams%rowtype;
  behaald int;
  maximum int;
begin
  select * into s from exam_sessions where id = poging.session_id;
  select * into e from exams where id = s.exam_id;

  if poging.submitted_at is null then
    if not exam_session_live(s.id) then
      raise exception 'Dit examen is gesloten';
    end if;

    select
      coalesce(sum(q.points) filter (where a.correct), 0),
      coalesce(sum(q.points), 0)
    into behaald, maximum
    from exam_questions q
    left join exam_answers a on a.question_id = q.id and a.attempt_id = poging.id
    where q.exam_id = e.id;

    update exam_attempts
    set submitted_at = now(), score = behaald, total = maximum
    where id = poging.id
    returning * into poging;
  end if;

  return query
  select poging.score, poging.total,
         case when poging.total > 0
           then round(poging.score * 100.0 / poging.total)::int else 0 end,
         case when poging.total > 0
           then (poging.score * 100.0 / poging.total) >= e.pass_percent else false end,
         s.show_result, s.show_answers;
end;
$fn$;

create or replace function exam_result (p_attempt uuid, p_token uuid)
  returns table (score int, total int, percent int, passed boolean,
                 show_result boolean, show_answers boolean)
  language plpgsql stable security definer set search_path = public as $fn$
declare
  poging exam_attempts%rowtype := exam_attempt_of(p_attempt, p_token);
  s      exam_sessions%rowtype;
  e      exams%rowtype;
begin
  select * into s from exam_sessions where id = poging.session_id;
  select * into e from exams where id = s.exam_id;

  if poging.submitted_at is null then
    raise exception 'Dit examen is nog niet ingeleverd';
  end if;

  return query
  select poging.score, poging.total,
         case when poging.total > 0
           then round(poging.score * 100.0 / poging.total)::int else 0 end,
         case when poging.total > 0
           then (poging.score * 100.0 / poging.total) >= e.pass_percent else false end,
         s.show_result, s.show_answers;
end;
$fn$;
