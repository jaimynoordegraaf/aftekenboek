-- vinkje — examenantwoorden opruimen
--
-- Het privacybeleid belooft dat de gegeven antwoorden na afloop van het seizoen
-- weggaan en dat alleen de uitslag blijft. Een belofte die niemand uitvoert is
-- geen belofte, dus hier staan de twee functies achter die knop.
--
-- Wat blijft staan: de deelname zelf — naam, score, of het gehaald is, wanneer
-- het was. Dat hoort bij de opleiding van die vaarder. Wat weggaat zijn de
-- losse antwoorden per vraag; daarmee verdwijnt ook de mogelijkheid om nog eens
-- na te kijken wat iemand precies aankruiste.
--
-- Wissen mag alleen een beheerder. Een instructeur mag alles zien, maar dit is
-- onomkeerbaar en raakt iedereen in de groep tegelijk.
--
-- Draai na 024-examen-geslaagd.sql.

-- Eerst kijken wat het zou opruimen. Niemand wist graag iets waarvan hij het
-- aantal niet kent.
create or replace function exam_cleanup_preview (p_group uuid, p_voor date)
  returns table (sessies int, deelnames int, antwoorden int)
  language sql stable security definer set search_path = public as $fn$
  select
    count(distinct s.id)::int,
    count(distinct a.id)::int,
    count(x.*)::int
  from exam_sessions s
  join exam_attempts a on a.session_id = s.id
  left join exam_answers x on x.attempt_id = a.id
  where s.group_id = p_group
    and s.opened_at::date < p_voor
    and is_staff(p_group);
$fn$;

create or replace function exam_cleanup (p_group uuid, p_voor date)
  returns int language plpgsql security definer set search_path = public as $fn$
declare
  weg int;
begin
  if not is_admin(p_group) then
    raise exception 'Alleen een beheerder kan examenantwoorden wissen';
  end if;
  if p_voor is null then
    raise exception 'Kies tot wanneer er opgeruimd moet worden';
  end if;

  delete from exam_answers x
  using exam_attempts a, exam_sessions s
  where x.attempt_id = a.id
    and a.session_id = s.id
    and s.group_id = p_group
    and s.opened_at::date < p_voor;

  get diagnostics weg = row_count;
  return weg;
end;
$fn$;
