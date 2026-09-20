-- aftekenboek — row level security
--
-- Two rules run through all of it:
--
--   * You only ever reach a groep you are a member of.
--   * Aftekenen is an instructeur's act. A kandidaat can read their own
--     voortgang and nothing else about it — they cannot add an eis to their
--     own lijst, cannot tick one off, and cannot untick one.
--
-- The catalogue is the exception: every signed-in person may read the eisen of
-- every diploma, because that is what makes the app useful to a lid who wants
-- to know what is still coming. Nobody may write to it through the API at all
-- — it is maintained by running 010-eisen.sql in the SQL editor.
--
-- Run after 001-core.sql.

-- ---------------------------------------------------------------- enable RLS

alter table groups              enable row level security;
alter table sections            enable row level security;
alter table profiles            enable row level security;
alter table memberships         enable row level security;
alter table membership_sections enable row level security;
alter table invites             enable row level security;
alter table disciplines         enable row level security;
alter table diplomas            enable row level security;
alter table requirements        enable row level security;
alter table enrollments         enable row level security;
alter table sign_offs           enable row level security;

-- ---------------------------------------------------------------- groups

create policy groups_read on groups
  for select to authenticated using (is_member(id));

create policy groups_admin_update on groups
  for update to authenticated using (is_admin(id)) with check (is_admin(id));

-- ---------------------------------------------------------------- sections

create policy sections_read on sections
  for select to authenticated using (is_member(group_id));

create policy sections_admin_write on sections
  for all to authenticated using (is_admin(group_id)) with check (is_admin(group_id));

-- ---------------------------------------------------------------- profiles

-- Your own row, and the rows of people in your groep. A lid needs the second
-- half: an aftekening carries the name of the instructeur who gave it, and a
-- name it cannot read would show up as an empty line.
create policy profiles_read on profiles
  for select to authenticated using (id = auth.uid() or shares_group(id));

create policy profiles_insert_self on profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- memberships

create policy memberships_read on memberships
  for select to authenticated using (is_member(group_id));

create policy memberships_admin_write on memberships
  for all to authenticated using (is_admin(group_id)) with check (is_admin(group_id));

create policy membership_sections_read on membership_sections
  for select to authenticated using (is_member(membership_group(membership_id)));

create policy membership_sections_admin_write on membership_sections
  for all to authenticated
  using (is_admin(membership_group(membership_id)))
  with check (is_admin(membership_group(membership_id)));

-- ---------------------------------------------------------------- invites

create policy invites_staff_read on invites
  for select to authenticated using (is_staff(group_id));

create policy invites_admin_write on invites
  for all to authenticated using (is_admin(group_id)) with check (is_admin(group_id));

-- ---------------------------------------------------------------- catalogue
--
-- Read-only, for everyone who is signed in. There is deliberately no insert,
-- update or delete policy: with RLS on and no write policy, the API refuses
-- every write, whoever asks.

create policy disciplines_read on disciplines
  for select to authenticated using (true);

create policy diplomas_read on diplomas
  for select to authenticated using (true);

create policy requirements_read on requirements
  for select to authenticated using (true);

-- ---------------------------------------------------------------- enrollments

-- Instructeurs see everyone in their groep; a lid sees only their own.
create policy enrollments_read on enrollments
  for select to authenticated
  using (is_staff(group_id) or profile_id = auth.uid());

create policy enrollments_staff_write on enrollments
  for all to authenticated
  using (is_staff(group_id))
  with check (is_staff(group_id));

-- ---------------------------------------------------------------- sign_offs

create policy sign_offs_read on sign_offs
  for select to authenticated
  using (
    is_staff(enrollment_group(enrollment_id))
    or enrollment_profile(enrollment_id) = auth.uid()
  );

-- `signed_by = auth.uid()` is the whole point: an instructeur can aftekenen,
-- but not in someone else's name.
create policy sign_offs_staff_insert on sign_offs
  for insert to authenticated
  with check (
    is_staff(enrollment_group(enrollment_id))
    and signed_by = auth.uid()
  );

create policy sign_offs_staff_update on sign_offs
  for update to authenticated
  using (is_staff(enrollment_group(enrollment_id)))
  with check (
    is_staff(enrollment_group(enrollment_id))
    and signed_by = auth.uid()
  );

create policy sign_offs_staff_delete on sign_offs
  for delete to authenticated
  using (is_staff(enrollment_group(enrollment_id)));
