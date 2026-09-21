/** The shapes the database hands back. Kept close to the SQL on purpose. */

export type Role = 'beheerder' | 'instructeur' | 'lid';
export type RequirementKind = 'praktijk' | 'theorie';

/**
 * De stand van één eis voor één persoon. Null is "niet behandeld": dan is er
 * geen rij. Alleen 'gehaald' telt mee in de voortgang.
 */
export type SignOffStatus = 'behandeld' | 'gehaald';

export const STATUS_LABEL: Record<'niet' | SignOffStatus, string> = {
  niet: 'Niet behandeld',
  behandeld: 'Onderweg',
  gehaald: 'Gehaald',
};

/**
 * De stand van een rij, ook als de database nog geen status meestuurt. Op een
 * project waar 016-bakken-en-standen.sql nog niet gedraaid heeft ontbreekt het
 * veld; een aftekening betekende toen altijd "gehaald".
 */
export function statusOf(row: {
  signed_at: string | null;
  status?: SignOffStatus | null;
}): SignOffStatus | null {
  if (!row.signed_at) return null;
  return row.status ?? 'gehaald';
}

/** The roles that may aftekenen and see everyone's voortgang. */
export const STAFF_ROLES: readonly Role[] = ['beheerder', 'instructeur'];

export const ROLE_LABEL: Record<Role, string> = {
  beheerder: 'Beheerder',
  instructeur: 'Instructeur',
  lid: 'Lid',
};

export const KIND_LABEL: Record<RequirementKind, string> = {
  praktijk: 'Praktijk',
  theorie: 'Theorie',
};

// ---------------------------------------------------------------- tenancy

export type Group = {
  id: string;
  name: string;
  slug: string;
  accent_color: string;
};

export type Section = {
  id: string;
  group_id: string;
  name: string;
  color: string | null;
  sort_order: number;
};

export type Profile = {
  id: string;
  full_name: string;
};

export type Membership = {
  id: string;
  group_id: string;
  profile_id: string;
  role: Role;
};

export type MyMembership = Membership & {
  group: Group;
  sectionIds: string[];
};

export type Invite = {
  id: string;
  group_id: string;
  code: string;
  role: Role;
  section_id: string | null;
  label: string | null;
  expires_at: string | null;
  max_uses: number;
  uses: number;
};

// ---------------------------------------------------------------- catalogue

export type Discipline = {
  id: string;
  code: string;
  name: string;
  subtitle: string | null;
  sort_order: number;
};

export type Diploma = {
  id: string;
  discipline_id: string;
  code: string;
  name: string;
  level_label: string | null;
  summary: string | null;
  theory_valid_months: number;
  source: string | null;
  sort_order: number;
};

export type Requirement = {
  id: string;
  diploma_id: string;
  /** Null voor een eis; gevuld voor een los onderdeel binnen die eis. */
  parent_id: string | null;
  code: string;
  kind: RequirementKind;
  position: number;
  title: string;
  detail: string | null;
};

/** A discipline with its diploma's, for the catalogue screen. */
export type DisciplineWithDiplomas = Discipline & { diplomas: Diploma[] };

// ---------------------------------------------------------------- progress

/** One row of the ledenlijst: `group_members()`. */
export type MemberRow = {
  profile_id: string;
  membership_id: string;
  full_name: string;
  role: Role;
  /** Namen, voor op het scherm. */
  sections: string[];
  /** Ids, om op te filteren en om toe te wijzen. */
  section_ids: string[];
  in_progress: number;
  awarded: number;
};

/** One diploma someone is working towards: `member_enrollments()`. */
export type EnrollmentRow = {
  enrollment_id: string;
  profile_id: string;
  full_name: string;
  diploma_id: string;
  diploma_code: string;
  diploma_name: string;
  level_label: string | null;
  discipline_code: string;
  discipline_name: string;
  theory_valid_months: number;
  started_on: string;
  theory_passed_on: string | null;
  awarded_on: string | null;
  note: string | null;
  praktijk_total: number;
  praktijk_done: number;
  theorie_total: number;
  theorie_done: number;
};

/** One line of the aftekenlijst: `enrollment_sheet()`. */
export type SheetRow = {
  requirement_id: string;
  /** Null voor een eis; gevuld voor een los onderdeel binnen die eis. */
  parent_id: string | null;
  kind: RequirementKind;
  position: number;
  title: string;
  detail: string | null;
  signed_at: string | null;
  signed_by: string | null;
  signed_by_name: string | null;
  note: string | null;
  /** Ontbreekt op een database zonder 016; lees hem via statusOf(). */
  status?: SignOffStatus | null;
};

// ---------------------------------------------------------------- bakken

/** Een vaste bemanning voor het seizoen: wie er samen in een boot zit. */
export type Crew = {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
};

/** Een diploma waar iemand in een bak mee bezig is: `crew_diplomas()`. */
export type CrewDiploma = {
  diploma_id: string;
  diploma_name: string;
  discipline_name: string;
  enrolled: number;
};

/** Eén opvarende en zijn stand op één eis: `crew_sheet()`. */
export type CrewSheetRow = {
  profile_id: string;
  full_name: string;
  /** Null als hij niet voor dit diploma is ingeschreven. */
  enrollment_id: string | null;
  status: SignOffStatus | null;
  signed_at: string | null;
  signed_by_name: string | null;
  note: string | null;
};

// ---------------------------------------------------------------- derived

export function totalDone(e: EnrollmentRow): number {
  return e.praktijk_done + e.theorie_done;
}

export function totalRequirements(e: EnrollmentRow): number {
  return e.praktijk_total + e.theorie_total;
}

/**
 * A passed theorie-examen keeps its worth for a fixed number of months — 18
 * landelijk, which is two vaarseizoenen. After that the praktijkexamen is out
 * of reach again, so the app has to say so before it happens rather than after.
 */
export type TheoryStatus =
  | { state: 'none' }
  | { state: 'valid'; until: Date; daysLeft: number }
  | { state: 'expiring'; until: Date; daysLeft: number }
  | { state: 'expired'; until: Date };

export function theoryStatus(e: EnrollmentRow, now = new Date()): TheoryStatus {
  if (!e.theory_passed_on) return { state: 'none' };

  const until = new Date(e.theory_passed_on);
  until.setMonth(until.getMonth() + e.theory_valid_months);

  const day = 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((until.getTime() - now.getTime()) / day);

  if (daysLeft < 0) return { state: 'expired', until };
  if (daysLeft <= 60) return { state: 'expiring', until, daysLeft };
  return { state: 'valid', until, daysLeft };
}
