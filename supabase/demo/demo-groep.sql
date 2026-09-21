-- aftekenboek — een demogroep voor de screenshots in de App Store en Play Store
--
-- Screenshots van de echte groep zetten namen van echte kinderen in een
-- openbare winkel. Deze groep bestaat uit verzonnen vaarders, een verzonnen
-- instructeur en voortgang die er geloofwaardig uitziet. Jij wordt er beheerder
-- van, zodat je hem in de app kiest via Meer › Wissel van groep.
--
-- Opruimen als de screenshots gemaakt zijn: demo-opruimen.sql. De echte groep
-- merkt van dit alles niets.
--
-- Mag vaker gedraaid worden: hij ruimt eerst een vorige demogroep op.

do $demo$
declare
  me     uuid;
  gid    uuid;
  instr  uuid;
  s_zee  uuid;
  s_wv   uuid;
  s_lds  uuid;
  bak1   uuid;
  bak2   uuid;
  pid    uuid;
  mid    uuid;
  eid    uuid;
  v      record;
  r      record;
  i      int := 0;
  roll   float;
begin
  select id into me from auth.users where email = 'jaimy.noordegraaf@scoutingjwf.nl';
  if me is null then
    raise exception 'Account jaimy.noordegraaf@scoutingjwf.nl niet gevonden';
  end if;

  -- Een vorige demogroep eerst weg, met de verzonnen mensen erin.
  delete from profiles p
  using memberships m, groups g
  where m.profile_id = p.id and m.group_id = g.id and g.slug = 'demo-screenshots'
    and p.id <> me;
  delete from groups where slug = 'demo-screenshots';

  -- Vaste uitkomst: elke keer dezelfde voortgang, dus dezelfde screenshots.
  perform setseed(0.42);

  insert into groups (name, slug) values ('Scouting De Waterlanders', 'demo-screenshots')
    returning id into gid;

  insert into sections (group_id, name, sort_order) values (gid, 'Zeeverkenners', 1)
    returning id into s_zee;
  insert into sections (group_id, name, sort_order) values (gid, 'Wilde Vaart', 2)
    returning id into s_wv;
  insert into sections (group_id, name, sort_order) values (gid, 'Loodsen', 3)
    returning id into s_lds;

  insert into memberships (group_id, profile_id, role) values (gid, me, 'beheerder');

  insert into profiles (full_name) values ('Mees de Vries') returning id into instr;
  insert into memberships (group_id, profile_id, role) values (gid, instr, 'instructeur');

  insert into crews (group_id, name, sort_order) values (gid, 'De Zeemeeuw', 1)
    returning id into bak1;
  insert into crews (group_id, name, sort_order) values (gid, 'De Aalscholver', 2)
    returning id into bak2;

  -- naam, speltak, diploma, bak, hoe ver (0..1)
  for v in
    select * from (values
      ('Anouk Bakker',     'zee', 'roeien-12',  1, 0.92),
      ('Daan Visser',      'zee', 'roeien-12',  1, 0.71),
      ('Fleur Jansen',     'zee', 'roeien-12',  1, 0.55),
      ('Luuk de Graaf',    'zee', 'roeien-12',  1, 0.38),
      ('Sophie Mulder',    'wv',  'kielboot-1', 2, 0.84),
      ('Bram Smit',        'wv',  'kielboot-1', 2, 0.63),
      ('Noor Hendriks',    'wv',  'kielboot-1', 2, 0.47),
      ('Thijs van Dijk',   'wv',  'kielboot-1', 2, 0.22),
      ('Isa Willems',      'lds', 'kielboot-2', 0, 0.58),
      ('Jesse Kok',        'lds', 'roeien-3',   0, 0.31)
    ) as t (name, sec, diploma, bak, done)
  loop
    i := i + 1;
    insert into profiles (full_name) values (v.name) returning id into pid;
    insert into memberships (group_id, profile_id, role) values (gid, pid, 'lid')
      returning id into mid;
    insert into membership_sections (membership_id, section_id)
      values (mid, case v.sec when 'zee' then s_zee when 'wv' then s_wv else s_lds end);
    if v.bak = 1 then
      insert into crew_members (crew_id, membership_id) values (bak1, mid);
    elsif v.bak = 2 then
      insert into crew_members (crew_id, membership_id) values (bak2, mid);
    end if;

    insert into enrollments (group_id, profile_id, diploma_id, started_on, created_by)
    select gid, pid, d.id, date '2026-04-11', instr from diplomas d where d.code = v.diploma
    returning id into eid;

    -- Afgetekend in de volgorde van de lijst, met wat ruis, zodat de voorste
    -- eisen vaker gehaald zijn dan de achterste — zoals in een echt seizoen.
    for r in
      select q.id, q.diploma_id,
             row_number() over (order by q.kind, q.position) as n,
             count(*) over () as total
      from requirements q
      join diplomas d on d.id = q.diploma_id
      where d.code = v.diploma
    loop
      roll := (r.n::float / r.total) + (random() - 0.5) * 0.35;
      if roll < v.done then
        insert into sign_offs (enrollment_id, requirement_id, diploma_id, signed_by, signed_at, status)
        values (eid, r.id, r.diploma_id, instr,
                timestamp '2026-04-18 10:00' + (r.n * interval '2 days') + (random() * interval '6 hours'),
                'gehaald');
      elsif roll < v.done + 0.12 then
        insert into sign_offs (enrollment_id, requirement_id, diploma_id, signed_by, signed_at, status)
        values (eid, r.id, r.diploma_id, instr,
                timestamp '2026-09-12 10:00' + (random() * interval '6 hours'),
                'behandeld');
      end if;
    end loop;

    -- De verste van de roeiers heeft zijn theorie al.
    if v.done > 0.9 then
      update enrollments set theory_passed_on = date '2026-06-20' where id = eid;
    end if;
  end loop;

  raise notice 'Demogroep "Scouting De Waterlanders" klaar: % vaarders', i;
end;
$demo$;
