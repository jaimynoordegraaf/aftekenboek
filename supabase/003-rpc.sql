-- aftekenboek — the calls the app makes that policies alone cannot express
--
-- Every function here is `security definer`, which means it runs with the
-- rights of its owner and RLS does not apply inside it. So each one checks
-- `auth.uid()` itself, at the top. Those checks are the only thing between a
-- caller and another groep's data — do not remove one to "simplify".
--
-- Run after 002-rls.sql.

-- ---------------------------------------------------------------- create a groep

create or replace function create_group (p_name text, p_slug text)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'naam is verplicht';
  end if;

  insert into groups (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning id into gid;

  insert into memberships (group_id, profile_id, role)
  values (gid, auth.uid(), 'beheerder');

  return gid;
end;
$fn$;

-- ---------------------------------------------------------------- join a groep
-- The member never reads the invites table; they hand over a code and this
-- decides. Returns the groep they are now in.

create or replace function redeem_invite (p_code text)
  returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  inv invites%rowtype;
  mid uuid;
  -- A use is only spent when the code actually did something. Someone already
  -- in the groep entering it again is harmless and must not burn the code a
  -- new member is waiting for.
  changed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd';
  end if;

  select * into inv from invites
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Deze code kennen we niet';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'Deze code is verlopen';
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'Deze code is al gebruikt';
  end if;

  select id into mid from memberships
  where group_id = inv.group_id and profile_id = auth.uid();

  if mid is null then
    insert into memberships (group_id, profile_id, role)
    values (inv.group_id, auth.uid(), inv.role)
    returning id into mid;
    changed := true;
  end if;

  if inv.section_id is not null then
    insert into membership_sections (membership_id, section_id)
    values (mid, inv.section_id)
    on conflict do nothing;
    if found then changed := true; end if;
  end if;

  if changed then
    update invites set uses = uses + 1 where id = inv.id;
  end if;

  return inv.group_id;
end;
$fn$;

-- ---------------------------------------------------------------- de vaarders
-- The ledenlijst an instructeur opens: everyone in the groep, with how many
-- diploma's they are working on and how many they already have. Staff only —
-- a lid has no business with a list of everyone else's voortgang.

create or replace function group_members (p_group uuid)
  returns table (
    profile_id uuid,
    full_name  text,
    role       member_role,
    sections   text[],
    in_progress bigint,
    awarded     bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select
    p.id,
    p.full_name,
    m.role,
    coalesce(
      (select array_agg(s.name order by s.sort_order, s.name)
       from membership_sections ms
       join sections s on s.id = ms.section_id
       where ms.membership_id = m.id),
      '{}'
    ),
    (select count(*) from enrollments e
     where e.group_id = p_group and e.profile_id = p.id and e.awarded_on is null),
    (select count(*) from enrollments e
     where e.group_id = p_group and e.profile_id = p.id and e.awarded_on is not null)
  from memberships m
  join profiles p on p.id = m.profile_id
  where m.group_id = p_group
    and is_staff(p_group)
  order by p.full_name;
$fn$;

-- ---------------------------------------------------------------- voortgang
-- The diploma's one person is working towards, with the counts that drive the
-- progress bars. Pass p_profile to look at one member; leave it null for the
-- caller's own. A lid can only ever get their own rows back.

create or replace function member_enrollments (p_group uuid, p_profile uuid default null)
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
    theory_valid_months int,
    started_on       date,
    theory_passed_on date,
    awarded_on       date,
    note             text,
    praktijk_total   bigint,
    praktijk_done    bigint,
    theorie_total    bigint,
    theorie_done     bigint
  )
  language sql stable security definer set search_path = public as $fn$
  select
    e.id, e.profile_id, p.full_name,
    d.id, d.code, d.name, d.level_label,
    disc.code, disc.name, d.theory_valid_months,
    e.started_on, e.theory_passed_on, e.awarded_on, e.note,
    count(r.id) filter (where r.kind = 'praktijk'),
    count(s.id) filter (where r.kind = 'praktijk'),
    count(r.id) filter (where r.kind = 'theorie'),
    count(s.id) filter (where r.kind = 'theorie')
  from enrollments e
  join profiles p on p.id = e.profile_id
  join diplomas d on d.id = e.diploma_id
  join disciplines disc on disc.id = d.discipline_id
  join requirements r on r.diploma_id = d.id
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  where e.group_id = p_group
    and e.profile_id = coalesce(p_profile, auth.uid())
    -- the guard: staff may look at anyone in their groep, everyone else only
    -- at themselves
    and (is_staff(p_group) or coalesce(p_profile, auth.uid()) = auth.uid())
    and is_member(p_group)
  -- the primary keys are enough: everything else selected from those tables is
  -- functionally dependent on them
  group by e.id, p.full_name, d.id, disc.id
  order by e.awarded_on nulls first, disc.sort_order, d.sort_order;
$fn$;

-- ---------------------------------------------------------------- de aftekenlijst
-- One enrollment, every eis, and who signed it off when. This is the screen
-- the app spends most of its time on, so it is one round trip.

create or replace function enrollment_sheet (p_enrollment uuid)
  returns table (
    requirement_id uuid,
    kind           requirement_kind,
    -- quoted: `position` is a keyword, and a returns-table column called that
    -- is a syntax error where a table column of the same name is fine
    "position"     int,
    title          text,
    detail         text,
    signed_at      timestamptz,
    signed_by      uuid,
    signed_by_name text,
    note           text
  )
  language sql stable security definer set search_path = public as $fn$
  select
    r.id, r.kind, r.position, r.title, r.detail,
    s.signed_at, s.signed_by, sp.full_name, s.note
  from enrollments e
  join requirements r on r.diploma_id = e.diploma_id
  left join sign_offs s on s.enrollment_id = e.id and s.requirement_id = r.id
  left join profiles sp on sp.id = s.signed_by
  where e.id = p_enrollment
    and (is_staff(e.group_id) or e.profile_id = auth.uid())
  order by r.kind, r.position;
$fn$;

-- ---------------------------------------------------------------- aftekenen
-- Toggling one eis. Doing it here rather than from the app means the
-- enrollment's diploma_id is filled in by the database, so a sign_off can
-- never point at an eis from another diploma, and `signed_by` is never
-- anything but the caller.

create or replace function set_sign_off (
  p_enrollment uuid,
  p_requirement uuid,
  p_signed boolean,
  p_note text default null
)
  returns void language plpgsql security definer set search_path = public as $fn$
declare
  e enrollments%rowtype;
begin
  select * into e from enrollments where id = p_enrollment;
  if not found then
    raise exception 'Deze opleiding bestaat niet';
  end if;
  if not is_staff(e.group_id) then
    raise exception 'Alleen instructeurs kunnen aftekenen';
  end if;
  if not exists (
    select 1 from requirements r
    where r.id = p_requirement and r.diploma_id = e.diploma_id
  ) then
    raise exception 'Deze eis hoort niet bij dit diploma';
  end if;

  if p_signed then
    insert into sign_offs (enrollment_id, requirement_id, diploma_id, signed_by, note)
    values (p_enrollment, p_requirement, e.diploma_id, auth.uid(), nullif(trim(coalesce(p_note, '')), ''))
    on conflict (enrollment_id, requirement_id) do update
      set signed_by = auth.uid(),
          signed_at = now(),
          note      = excluded.note;
  else
    delete from sign_offs
    where enrollment_id = p_enrollment and requirement_id = p_requirement;
  end if;
end;
$fn$;
