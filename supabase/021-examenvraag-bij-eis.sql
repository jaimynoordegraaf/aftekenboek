-- vinkje — een examenvraag mag bij een eis horen
--
-- Een theorie-examen gaat over de eisen die toch al in de app staan. Als een
-- vraag weet bij welke eis hij hoort, levert dat twee dingen op:
--
--   * je bouwt een examen door eisen aan te vinken, in plaats van ze over te
--     typen;
--   * een uitslag is later terug te vertalen naar de vorderingenstaat: deze
--     vaarder had de vragen bij eis 3 en 5 goed.
--
-- De koppeling is losjes: `on delete set null`. Verdwijnt een eis uit de
-- catalogus, dan blijft de vraag gewoon bestaan — een afgenomen examen hoort
-- niet te veranderen omdat iemand later in de eisenlijst schoonmaakt.
--
-- Draai na 020-examen-nakijken.sql.

alter table exam_questions
  add column if not exists requirement_id uuid references requirements (id) on delete set null;

create index if not exists exam_questions_requirement_id_idx
  on exam_questions (requirement_id);
