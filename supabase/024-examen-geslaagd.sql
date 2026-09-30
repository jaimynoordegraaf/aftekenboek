-- vinkje — in het overzicht zien wie geslaagd is
--
-- Het overzicht van een sessie gaf de score ("25 van 35") maar niet of dat
-- genoeg was. Die grens staat per examen vastgelegd (exams.pass_percent, bij de
-- CWO-examens 71%), dus dat hoort de database erbij te zeggen in plaats van dat
-- iedereen het zelf uitrekent terwijl er twintig mensen klaar zijn.
--
-- De uitkomst is bewust een percentage én een ja/nee: het percentage om te zien
-- hoe ruim iemand het haalde, het ja/nee om er niet over te hoeven twijfelen.
--
-- Draai na 023-examen-afbeeldingen.sql.

drop function if exists exam_session_overview (uuid);

create or replace function exam_session_overview (p_session uuid)
  returns table (
    attempt_id   uuid,
    display_name text,
    profile_id   uuid,
    started_at   timestamptz,
    submitted_at timestamptz,
    beantwoord   int,
    vragen       int,
    score        int,
    total        int,
    percent      int,
    grens        int,
    geslaagd     boolean
  )
  language sql stable security definer set search_path = public as $fn$
  select
    a.id, a.display_name, a.profile_id, a.started_at, a.submitted_at,
    (select count(*)::int from exam_answers x where x.attempt_id = a.id and x.option_id is not null),
    (select count(*)::int from exam_questions q where q.exam_id = e.id),
    a.score, a.total,
    case when coalesce(a.total, 0) > 0
      then round(a.score * 100.0 / a.total)::int end,
    e.pass_percent,
    -- Niet ingeleverd is niet gezakt: dan is er nog niets te zeggen.
    case when a.submitted_at is null then null
         when coalesce(a.total, 0) = 0 then false
         else (a.score * 100.0 / a.total) >= e.pass_percent end
  from exam_attempts a
  join exam_sessions s on s.id = a.session_id
  join exams e on e.id = s.exam_id
  where a.session_id = p_session
    and is_staff(s.group_id)
  order by a.started_at;
$fn$;
