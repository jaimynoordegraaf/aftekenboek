/**
 * Everything the app asks the database for.
 *
 * Reads that need a join across the catalogue and the voortgang go through the
 * `security definer` functions in supabase/003-rpc.sql — one round trip, and
 * the guard is in the database rather than in a screen that might forget it.
 * Everything else is a plain table query behind RLS.
 */

import { db } from './supabase';
import type {
  Diploma,
  Discipline,
  DisciplineWithDiplomas,
  EnrollmentRow,
  Invite,
  MemberRow,
  Requirement,
  Role,
  Section,
  SheetRow,
} from './types';

// ---------------------------------------------------------------- groep

export async function createGroup(name: string): Promise<string> {
  const { data, error } = await db().rpc('create_group', {
    p_name: name.trim(),
    p_slug: slugify(name),
  });
  if (error) throw error;
  return data as string;
}

export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await db().rpc('redeem_invite', {
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  return data as string;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  // A slug has to be unique across every groep, and two groups called
  // "Scouting Jan Willem Friso" is not far-fetched.
  return `${base || 'groep'}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------- de vaarders

export async function fetchMembers(groupId: string): Promise<MemberRow[]> {
  const { data, error } = await db().rpc('group_members', { p_group: groupId });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

export async function fetchProfileName(profileId: string): Promise<string> {
  const { data, error } = await db()
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  return (data?.full_name as string) ?? '';
}

/** Leave `profileId` out for your own voortgang. */
export async function fetchEnrollments(
  groupId: string,
  profileId?: string,
): Promise<EnrollmentRow[]> {
  const { data, error } = await db().rpc('member_enrollments', {
    p_group: groupId,
    p_profile: profileId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as EnrollmentRow[];
}

/** The opleiding itself: who, which diploma, and the dates around the examens. */
export async function fetchEnrollment(enrollmentId: string): Promise<EnrollmentDetail> {
  const { data, error } = await db()
    .from('enrollments')
    .select(
      // profiles!profile_id is geen omhaal: enrollments wijst op twee manieren
      // naar profiles — profile_id (de kandidaat) en created_by (wie hem
      // inschreef). Zonder die hint weigert PostgREST de embed, omdat het niet
      // kan raden welke van de twee bedoeld is. Laat hem staan.
      'id, group_id, profile_id, started_on, theory_passed_on, awarded_on, note, profiles!profile_id(id, full_name), diplomas(*, disciplines(*))',
    )
    .eq('id', enrollmentId)
    .single();
  if (error) throw error;

  const row = data as any;
  const { disciplines, ...diploma } = row.diplomas;
  return {
    id: row.id,
    group_id: row.group_id,
    profile_id: row.profile_id,
    started_on: row.started_on,
    theory_passed_on: row.theory_passed_on,
    awarded_on: row.awarded_on,
    note: row.note,
    member: row.profiles as { id: string; full_name: string },
    diploma: diploma as Diploma,
    discipline: disciplines as Discipline,
  };
}

export type EnrollmentDetail = {
  id: string;
  group_id: string;
  profile_id: string;
  started_on: string;
  theory_passed_on: string | null;
  awarded_on: string | null;
  note: string | null;
  member: { id: string; full_name: string };
  diploma: Diploma;
  discipline: Discipline;
};

export async function fetchSheet(enrollmentId: string): Promise<SheetRow[]> {
  const { data, error } = await db().rpc('enrollment_sheet', {
    p_enrollment: enrollmentId,
  });
  if (error) throw error;
  return (data ?? []) as SheetRow[];
}

/**
 * Tick one eis off, or take it back. The database fills in who signed and
 * when — the app is never trusted with either.
 */
export async function setSignOff(
  enrollmentId: string,
  requirementId: string,
  signed: boolean,
  note?: string | null,
): Promise<void> {
  const { error } = await db().rpc('set_sign_off', {
    p_enrollment: enrollmentId,
    p_requirement: requirementId,
    p_signed: signed,
    p_note: note ?? null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- opleidingen

export async function enroll(
  groupId: string,
  profileId: string,
  diplomaId: string,
  createdBy: string,
): Promise<string> {
  const { data, error } = await db()
    .from('enrollments')
    .insert({
      group_id: groupId,
      profile_id: profileId,
      diploma_id: diplomaId,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateEnrollment(
  enrollmentId: string,
  patch: {
    theory_passed_on?: string | null;
    awarded_on?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const { error } = await db().from('enrollments').update(patch).eq('id', enrollmentId);
  if (error) throw error;
}

/** Removing an opleiding takes its aftekeningen with it — the cascade is in the schema. */
export async function deleteEnrollment(enrollmentId: string): Promise<void> {
  const { error } = await db().from('enrollments').delete().eq('id', enrollmentId);
  if (error) throw error;
}

// ---------------------------------------------------------------- catalogus

export async function fetchCatalogue(): Promise<DisciplineWithDiplomas[]> {
  const [disciplines, diplomas] = await Promise.all([
    db().from('disciplines').select('*').order('sort_order'),
    db().from('diplomas').select('*').order('sort_order'),
  ]);
  if (disciplines.error) throw disciplines.error;
  if (diplomas.error) throw diplomas.error;

  const all = (diplomas.data ?? []) as Diploma[];
  return ((disciplines.data ?? []) as Discipline[]).map((d) => ({
    ...d,
    diplomas: all.filter((dip) => dip.discipline_id === d.id),
  }));
}

export async function fetchDiploma(
  diplomaId: string,
): Promise<{ diploma: Diploma; discipline: Discipline; requirements: Requirement[] }> {
  const [diploma, requirements] = await Promise.all([
    db().from('diplomas').select('*, disciplines(*)').eq('id', diplomaId).single(),
    db()
      .from('requirements')
      .select('*')
      .eq('diploma_id', diplomaId)
      .order('kind')
      .order('position'),
  ]);
  if (diploma.error) throw diploma.error;
  if (requirements.error) throw requirements.error;

  const { disciplines, ...rest } = diploma.data as any;
  return {
    diploma: rest as Diploma,
    discipline: disciplines as Discipline,
    requirements: (requirements.data ?? []) as Requirement[],
  };
}

// ---------------------------------------------------------------- beheer

export async function fetchSections(groupId: string): Promise<Section[]> {
  const { data, error } = await db()
    .from('sections')
    .select('*')
    .eq('group_id', groupId)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Section[];
}

export async function createSection(groupId: string, name: string): Promise<void> {
  const { error } = await db()
    .from('sections')
    .insert({ group_id: groupId, name: name.trim() });
  if (error) throw error;
}

export async function deleteSection(sectionId: string): Promise<void> {
  const { error } = await db().from('sections').delete().eq('id', sectionId);
  if (error) throw error;
}

export async function setMemberRole(
  groupId: string,
  profileId: string,
  role: Role,
): Promise<void> {
  const { error } = await db()
    .from('memberships')
    .update({ role })
    .eq('group_id', groupId)
    .eq('profile_id', profileId);
  if (error) throw error;
}

export async function fetchInvites(groupId: string): Promise<Invite[]> {
  const { data, error } = await db()
    .from('invites')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invite[];
}

export async function createInvite(
  groupId: string,
  role: Role,
  label: string | null,
  maxUses: number,
): Promise<Invite> {
  const { data, error } = await db()
    .from('invites')
    .insert({
      group_id: groupId,
      code: inviteCode(),
      role,
      label: label?.trim() || null,
      max_uses: maxUses,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Invite;
}

export async function deleteInvite(inviteId: string): Promise<void> {
  const { error } = await db().from('invites').delete().eq('id', inviteId);
  if (error) throw error;
}

/** No O/0 and no I/1: the code gets read out loud across a botenloods. */
function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// ---------------------------------------------------------------- profiel

export async function updateMyName(userId: string, fullName: string): Promise<void> {
  const { error } = await db()
    .from('profiles')
    .update({ full_name: fullName.trim(), updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}
