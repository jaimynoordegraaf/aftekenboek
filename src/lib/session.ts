/**
 * Who is signed in, which Scoutinggroep they are looking at, and what they are
 * allowed to do in it.
 *
 * Everything else in the app reads from here rather than asking Supabase who
 * the user is, so there is one answer to "welke groep" and one place that
 * changes when they switch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { errorMessage } from './errors';
import { db, isConfigured, supabase } from './supabase';
import {
  STAFF_ROLES,
  type MyMembership,
  type Profile,
  type Role,
  type Section,
} from './types';

const ACTIVE_GROUP_KEY = 'aftekenboek:active-group';

type State = {
  /** False until the stored session has been read; the UI waits on this. */
  ready: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  memberships: MyMembership[];
  activeGroupId: string | null;
  sections: Section[];
  error: string | null;
};

type Actions = {
  bootstrap: () => Promise<void>;
  reload: () => Promise<void>;
  setActiveGroup: (groupId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSession = create<State & Actions>((set, get) => ({
  ready: !isConfigured, // nothing to wait for when there is no server
  userId: null,
  email: null,
  profile: null,
  memberships: [],
  activeGroupId: null,
  sections: [],
  error: null,

  async bootstrap() {
    if (!supabase) {
      set({ ready: true });
      return;
    }

    const { data } = await supabase.auth.getSession();
    set({
      userId: data.session?.user.id ?? null,
      email: data.session?.user.email ?? null,
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      const previous = get().userId;
      const next = session?.user.id ?? null;
      set({ userId: next, email: session?.user.email ?? null });
      if (next !== previous) void get().reload();
    });

    await get().reload();
    set({ ready: true });
  },

  async reload() {
    if (!supabase || !get().userId) {
      set({ profile: null, memberships: [], sections: [], activeGroupId: null });
      return;
    }

    try {
      const memberships = await fetchMemberships();
      const profile = await fetchProfile(get().userId as string);

      // Keep the groep they were last looking at, if they are still in it.
      const stored = await AsyncStorage.getItem(ACTIVE_GROUP_KEY);
      const active =
        memberships.find((m) => m.group_id === stored)?.group_id ??
        memberships[0]?.group_id ??
        null;

      set({ profile, memberships, activeGroupId: active, error: null });
      set({ sections: active ? await fetchSections(active) : [] });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  async setActiveGroup(groupId) {
    if (!get().memberships.some((m) => m.group_id === groupId)) return;
    await AsyncStorage.setItem(ACTIVE_GROUP_KEY, groupId);
    set({ activeGroupId: groupId, sections: await fetchSections(groupId) });
  },

  async signOut() {
    await supabase?.auth.signOut();
    await AsyncStorage.removeItem(ACTIVE_GROUP_KEY);
    set({
      userId: null,
      email: null,
      profile: null,
      memberships: [],
      sections: [],
      activeGroupId: null,
    });
  },
}));

// ---------------------------------------------------------------- queries

async function fetchMemberships(): Promise<MyMembership[]> {
  const { data, error } = await db()
    .from('memberships')
    .select(
      'id, group_id, profile_id, role, groups(id, name, slug, accent_color), membership_sections(section_id)',
    );
  if (error) throw error;

  return (data ?? [])
    .map((row: any) => ({
      id: row.id,
      group_id: row.group_id,
      profile_id: row.profile_id,
      role: row.role as Role,
      group: row.groups,
      sectionIds: (row.membership_sections ?? []).map((s: any) => s.section_id),
    }))
    .filter((m) => Boolean(m.group))
    .sort((a, b) => a.group.name.localeCompare(b.group.name, 'nl'));
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

async function fetchSections(groupId: string): Promise<Section[]> {
  const { data, error } = await db()
    .from('sections')
    .select('*')
    .eq('group_id', groupId)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Section[];
}

// ---------------------------------------------------------------- selectors

export function useActiveMembership(): MyMembership | null {
  return useSession(
    (s) => s.memberships.find((m) => m.group_id === s.activeGroupId) ?? null,
  );
}

export function useActiveGroup() {
  return useActiveMembership()?.group ?? null;
}

export function useMyRole(): Role | null {
  return useActiveMembership()?.role ?? null;
}

/** Instructeurs and beheerders: the people who may aftekenen. */
export function useIsStaff(): boolean {
  const role = useMyRole();
  return role !== null && STAFF_ROLES.includes(role);
}

export function useIsAdmin(): boolean {
  return useMyRole() === 'beheerder';
}
