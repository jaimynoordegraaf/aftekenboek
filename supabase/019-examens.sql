-- vinkje — examens: maken, afnemen met een sessiecode, en meekijken
--
-- Tot nu toe kon in deze database niemand iets zonder in te loggen. Een examen
-- breekt daarmee: de vaarders die het invullen hebben geen account en geen app.
-- Zij komen binnen met een code en een naam, op een webpagina.
--
-- Daarom staat hier één regel boven alles: een deelnemer krijgt géén toegang tot
-- tabellen. Hij mag vijf functies aanroepen, en die controleren zelf alles.
--
--   exam_session_info  wat is dit voor examen (titel, aantal vragen)
--   exam_join          meedoen: naam achterlaten, vragen ophalen
--   exam_answer        één antwoord opslaan
--   exam_submit        inleveren; de score wordt hier berekend, niet in de browser
--   exam_result        je eigen uitslag
--
-- Drie dingen maken dat veilig:
--
--   * Het juiste antwoord verlaat de server nooit. exam_join geeft de vragen
--     zonder `correct` terug; nakijken gebeurt hier.
--   * Elke deelname krijgt een geheim token. Met alleen de code kom je niet bij
--     het werk van een ander.
--   * Een sessie die dicht is of over zijn tijd heen, accepteert niets meer.
--     Een vergeten sessie sluit dus zichzelf.
--
-- Instructeurs en beheerders werken wél gewoon op de tabellen, met dezelfde
-- afspraak als bij de eigen eisenlijsten: alleen die van je eigen groep.
--
-- Draai na 018-eigen-lijsten.sql.

-- ------------------------------------------------------------------ types

do $$
begin
  if not exists (select 1 from pg_type where typname = 'exam_question_kind') then
    create type exam_question_kind as enum ('meerkeuze', 'juist_onjuist');
  end if;
  if not exists (select 1 from pg_type where typname = 'exam_session_status') then
    create type exam_session_status as enum ('open', 'gesloten');
  end if;
end;
$$;

-- ------------------------------------------------------------------ tabellen

create table if not exists exams (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  title        text not null,
  intro        text,
  -- Waar het examen bij hoort. Mag leeg: niet elk examen hangt aan een diploma.
  diploma_id   uuid references diplomas (id) on delete set null,
  pass_percent int not null default 70 check (pass_percent between 0 and 100),
  -- Volgorde schudden per deelnemer, zodat overschrijven weinig oplevert.
  shuffle      boolean not null default true,
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists exams_group_id_idx on exams (group_id);

create table if not exists exam_questions (
  id       uuid primary key default gen_random_uuid(),
  exam_id  uuid not null references exams (id) on delete cascade,
  position int not null,
  kind     exam_question_kind not null default 'meerkeuze',
  prompt   text not null,
  -- Pad in de opslagmap bij Supabase; het bestand zelf staat niet in de database.
  image_path text,
  points   int not null default 1 check (points > 0),
  unique (exam_id, position),
  unique (id, exam_id)
);

create index if not exists exam_questions_exam_id_idx on exam_questions (exam_id);

create table if not exists exam_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references exam_questions (id) on delete cascade,
  position    int not null,
  label       text not null,
  correct     boolean not null default false,
  unique (question_id, position),
  unique (id, question_id)
);

create index if not exists exam_options_question_id_idx on exam_options (question_id);

-- Eén afname. De code hoort bij de sessie en niet bij het examen: zo opent een
-- code van vorig seizoen niets meer, terwijl de vragen blijven bestaan.
create table if not exists exam_sessions (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references exams (id) on delete cascade,
  group_id    uuid not null references groups (id) on delete cascade,
  code        text not null unique,
  label       text,
  status      exam_session_status not null default 'open',
  show_result boolean not null default true,
  opened_at   timestamptz not null default now(),
  closes_at   timestamptz not null default now() + interval '6 hours',
  closed_at   timestamptz,
  created_by  uuid references profiles (id) on delete set null
);

create index if not exists exam_sessions_exam_id_idx on exam_sessions (exam_id);
create index if not exists exam_sessions_group_id_idx on exam_sessions (group_id);

create table if not exists exam_attempts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references exam_sessions (id) on delete cascade,
  display_name text not null,
  -- Het geheim dat een deelnemer in zijn browser houdt. Zonder dit token is een
  -- deelname niet te lezen en niet te wijzigen, ook niet door wie de code heeft.
  token        uuid not null default gen_random_uuid(),
  -- Gevuld zodra een instructeur de deelname aan een vaarder koppelt.
  profile_id   uuid references profiles (id) on delete set null,
  order_seed   uuid not null default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  score        int,
  total        int
);

create index if not exists exam_attempts_session_id_idx on exam_attempts (session_id);

create table if not exists exam_answers (
  attempt_id  uuid not null references exam_attempts (id) on delete cascade,
  question_id uuid not null references exam_questions (id) on delete cascade,
  option_id   uuid references exam_options (id) on delete set null,
  -- Bij het opslaan al nagekeken, zodat inleveren geen rekenwerk meer is.
  correct     boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- ------------------------------------------------------------------ wie mag wat

create or replace function exam_group (p_exam uuid)
  returns uuid language sql stable security definer set search_path = public as $fn$
  select group_id from exams where id = p_exam;
$fn$;

create or replace function exam_session_group (p_session uuid)
  returns uuid language sql stable security definer set search_path = public as $fn$
  select group_id from exam_sessions where id = p_session;
$fn$;

alter table exams          enable row level security;
alter table exam_questions enable row level security;
alter table exam_options   enable row level security;
alter table exam_sessions  enable row level security;
alter table exam_attempts  enable row level security;
alter table exam_answers   enable row level security;

-- Alles van je eigen groep, en niets daarbuiten. Let op wie er níét bij kan: een
-- lid van de groep. Een vaarder die de vragen kan lezen heeft geen examen meer.

drop policy if exists exams_staff on exams;
create policy exams_staff on exams
  for all to authenticated
  using (is_staff(group_id)) with check (is_staff(group_id));

drop policy if exists exam_questions_staff on exam_questions;
create policy exam_questions_staff on exam_questions
  for all to authenticated
  using (is_staff(exam_group(exam_id))) with check (is_staff(exam_group(exam_id)));

drop policy if exists exam_options_staff on exam_options;
create policy exam_options_staff on exam_options
  for all to authenticated
  using (exists (
    select 1 from exam_questions q
    where q.id = exam_options.question_id and is_staff(exam_group(q.exam_id))))
  with check (exists (
    select 1 from exam_questions q
    where q.id = exam_options.question_id and is_staff(exam_group(q.exam_id))));

drop policy if exists exam_sessions_staff on exam_sessions;
create policy exam_sessions_staff on exam_sessions
  for all to authenticated
  using (is_staff(group_id)) with check (is_staff(group_id));

drop policy if exists exam_attempts_staff on exam_attempts;
create policy exam_attempts_staff on exam_attempts
  for all to authenticated
  using (is_staff(exam_session_group(session_id)))
  with check (is_staff(exam_session_group(session_id)));

drop policy if exists exam_answers_staff on exam_answers;
create policy exam_answers_staff on exam_answers
  for all to authenticated
  using (exists (
    select 1 from exam_attempts a
    where a.id = exam_answers.attempt_id and is_staff(exam_session_group(a.session_id))))
  with check (exists (
    select 1 from exam_attempts a
    where a.id = exam_answers.attempt_id and is_staff(exam_session_group(a.session_id))));

-- ------------------------------------------------------------------ sessies

-- Een code om voor te lezen in een clubhuis: geen 0/O, geen 1/I/L, geen U/V.
create or replace function exam_code ()
  returns text language plpgsql volatile set search_path = public as $fn$
declare
  alfabet text := 'ABCDEFGHJKMNPQRSTWXYZ23456789';
  kandidaat text;
  i int;
begin
  loop
    kandidaat := '';
    for i in 1 .. 6 loop
      kandidaat := kandidaat || substr(alfabet, 1 + floor(random() * length(alfabet))::int, 1);
    end loop;
    exit when not exists (select 1 from exam_sessions where code = kandidaat);
  end loop;
  return kandidaat;
end;
$fn$;

create or replace function open_exam_session (
  p_exam        uuid,
  p_label       text default null,
  p_hours       int default 6,
  p_show_result boolean default true
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
  insert into exam_sessions (exam_id, group_id, code, label, closes_at, show_result, created_by)
  values (p_exam, gid, exam_code(), nullif(trim(p_label), ''),
          now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 6), 24))),
          coalesce(p_show_result, true), auth.uid())
  returning exam_sessions.id, exam_sessions.code, exam_sessions.closes_at;
end;
$fn$;

create or replace function close_exam_session (p_session uuid)
  returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not is_staff(exam_session_group(p_session)) then
    raise exception 'Alleen instructeurs en beheerders van deze groep kunnen een sessie sluiten';
  end if;

  update exam_sessions
  set status = 'gesloten', closed_at = now()
  where id = p_session and status = 'open';
end;
$fn$;

-- Eén plek die bepaalt of er nog gewerkt mag worden. Tijd is hier net zo goed
-- een slot als de status: een sessie die iemand vergeet te sluiten, sluit zelf.
create or replace function exam_session_live (p_session uuid)
  returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from exam_sessions s
    where s.id = p_session and s.status = 'open' and s.closes_at > now()
  );
$fn$;

-- ------------------------------------------------------------------ meedoen
--
-- Vanaf hier: functies die een deelnemer zonder account aanroept.

create or replace function exam_session_info (p_code text)
  returns table (title text, intro text, vragen int, open boolean)
  language sql stable security definer set search_path = public as $fn$
  select e.title, e.intro,
         (select count(*)::int from exam_questions q where q.exam_id = e.id),
         exam_session_live(s.id)
  from exam_sessions s
  join exams e on e.id = s.exam_id
  where s.code = upper(trim(p_code));
$fn$;

-- Meedoen. De vragen komen hier pas naar buiten — en zonder het juiste antwoord.
create or replace function exam_join (p_code text, p_name text)
  returns table (attempt_id uuid, token uuid, title text, intro text, questions jsonb)
  language plpgsql security definer set search_path = public as $fn$
declare
  s        exam_sessions%rowtype;
  e        exams%rowtype;
  poging   exam_attempts%rowtype;
  naam     text := nullif(trim(p_name), '');
begin
  select * into s from exam_sessions where code = upper(trim(p_code));
  if not found then
    raise exception 'Deze code kennen we niet';
  end if;
  if not exam_session_live(s.id) then
    raise exception 'Dit examen is gesloten';
  end if;
  if naam is null or length(naam) < 2 then
    raise exception 'Vul je naam in';
  end if;
  if length(naam) > 60 then
    raise exception 'Die naam is te lang';
  end if;
  -- Een rem op onzin: een klas is geen tweehonderd man.
  if (select count(*) from exam_attempts a where a.session_id = s.id) >= 200 then
    raise exception 'Er zitten al te veel deelnemers in deze sessie';
  end if;

  select * into e from exams where id = s.exam_id;

  insert into exam_attempts (session_id, display_name)
  values (s.id, naam)
  returning * into poging;

  return query
  select poging.id, poging.token, e.title, e.intro,
    coalesce(jsonb_agg(v.vraag order by v.volgorde), '[]'::jsonb)
  from (
    select
      case when e.shuffle
        then md5(poging.order_seed::text || q.id::text)
        else lpad(q.position::text, 6, '0')
      end as volgorde,
      jsonb_build_object(
        'id', q.id,
        'kind', q.kind,
        'prompt', q.prompt,
        'image_path', q.image_path,
        'points', q.points,
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label)
                          order by case when e.shuffle
                                     then md5(poging.order_seed::text || o.id::text)
                                     else lpad(o.position::text, 6, '0') end), '[]'::jsonb)
          from exam_options o where o.question_id = q.id
        )
      ) as vraag
    from exam_questions q
    where q.exam_id = e.id
  ) as v;
end;
$fn$;

-- Een deelname terugvinden, mét het token. Elke functie hieronder begint hiermee.
create or replace function exam_attempt_of (p_attempt uuid, p_token uuid)
  returns exam_attempts language plpgsql stable security definer set search_path = public as $fn$
declare
  poging exam_attempts%rowtype;
begin
  select * into poging from exam_attempts
  where id = p_attempt and token = p_token;
  if not found then
    raise exception 'Deze deelname kennen we niet';
  end if;
  return poging;
end;
$fn$;

create or replace function exam_answer (
  p_attempt  uuid,
  p_token    uuid,
  p_question uuid,
  p_option   uuid
)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  poging exam_attempts%rowtype := exam_attempt_of(p_attempt, p_token);
  goed   boolean;
begin
  if poging.submitted_at is not null then
    raise exception 'Je hebt dit examen al ingeleverd';
  end if;
  if not exam_session_live(poging.session_id) then
    raise exception 'Dit examen is gesloten';
  end if;

  -- De vraag moet bij dít examen horen en het antwoord bij díe vraag. Zonder
  -- deze twee controles kan iemand met een geldig token antwoorden uit een
  -- ander examen naar binnen schuiven.
  if not exists (
    select 1
    from exam_questions q
    join exam_sessions s on s.exam_id = q.exam_id
    where q.id = p_question and s.id = poging.session_id
  ) then
    raise exception 'Deze vraag hoort niet bij dit examen';
  end if;

  select o.correct into goed
  from exam_options o
  where o.id = p_option and o.question_id = p_question;

  if p_option is not null and goed is null then
    raise exception 'Dit antwoord hoort niet bij deze vraag';
  end if;

  insert into exam_answers (attempt_id, question_id, option_id, correct)
  values (p_attempt, p_question, p_option, coalesce(goed, false))
  on conflict (attempt_id, question_id) do update
  set option_id = excluded.option_id,
      correct   = excluded.correct,
      answered_at = now();
end;
$fn$;

create or replace function exam_submit (p_attempt uuid, p_token uuid)
  returns table (score int, total int, percent int, passed boolean, show_result boolean)
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
         s.show_result;
end;
$fn$;

create or replace function exam_result (p_attempt uuid, p_token uuid)
  returns table (score int, total int, percent int, passed boolean, show_result boolean)
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
         s.show_result;
end;
$fn$;

-- ------------------------------------------------------------------ meekijken

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
    total        int
  )
  language sql stable security definer set search_path = public as $fn$
  select
    a.id, a.display_name, a.profile_id, a.started_at, a.submitted_at,
    (select count(*)::int from exam_answers x where x.attempt_id = a.id and x.option_id is not null),
    (select count(*)::int from exam_questions q
     join exam_sessions s2 on s2.exam_id = q.exam_id where s2.id = a.session_id),
    a.score, a.total
  from exam_attempts a
  where a.session_id = p_session
    and is_staff(exam_session_group(a.session_id))
  order by a.started_at;
$fn$;

create or replace function exam_attempt_detail (p_attempt uuid)
  returns table (
    question_id uuid,
    "position"  int,
    prompt      text,
    gekozen     text,
    juiste      text,
    correct     boolean
  )
  language sql stable security definer set search_path = public as $fn$
  select
    q.id, q.position, q.prompt,
    (select o.label from exam_options o where o.id = a.option_id),
    (select string_agg(o.label, ', ' order by o.position)
     from exam_options o where o.question_id = q.id and o.correct),
    coalesce(a.correct, false)
  from exam_attempts att
  join exam_sessions s on s.id = att.session_id
  join exam_questions q on q.exam_id = s.exam_id
  left join exam_answers a on a.attempt_id = att.id and a.question_id = q.id
  where att.id = p_attempt
    and is_staff(exam_session_group(att.session_id))
  order by q.position;
$fn$;

-- Een deelname aan een vaarder hangen, zodat je hem later kunt aftekenen. Het
-- aftekenen zelf blijft handwerk: een fout in een vraag hoort niet vanzelf in
-- iemands vorderingenstaat terecht te komen.
create or replace function exam_attempt_link (p_attempt uuid, p_profile uuid)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  gid uuid;
begin
  select exam_session_group(a.session_id) into gid
  from exam_attempts a where a.id = p_attempt;

  if gid is null or not is_staff(gid) then
    raise exception 'Alleen instructeurs en beheerders van deze groep kunnen dit koppelen';
  end if;

  if p_profile is not null and not exists (
    select 1 from memberships m where m.group_id = gid and m.profile_id = p_profile
  ) then
    raise exception 'Deze persoon zit niet in de groep';
  end if;

  update exam_attempts set profile_id = p_profile where id = p_attempt;
end;
$fn$;

create or replace function exam_attempt_remove (p_attempt uuid)
  returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not exists (
    select 1 from exam_attempts a
    where a.id = p_attempt and is_staff(exam_session_group(a.session_id))
  ) then
    raise exception 'Alleen instructeurs en beheerders van deze groep kunnen dit weghalen';
  end if;

  delete from exam_attempts where id = p_attempt;
end;
$fn$;
