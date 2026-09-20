/**
 * The connection to Supabase.
 *
 * Credentials come from a .env that is not committed; Expo exposes any
 * variable starting with EXPO_PUBLIC_ to the app, at bundle time. If they are
 * missing the app still starts and says so on screen, rather than crashing on
 * launch with a stack trace no member can act on.
 */

import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Supabase is replacing the "anon" key with a "publishable" key
// (sb_publishable_...). Both go in the same place, so either name is accepted
// and the newer one wins when both are set.
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

/**
 * Storage is only attached when there is a real device or browser to store in.
 * Expo also renders the app in plain Node to pre-build web pages, and there
 * AsyncStorage reaches for window.localStorage and throws.
 */
const canPersistSession = typeof window !== 'undefined';

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: canPersistSession ? AsyncStorage : undefined,
        persistSession: canPersistSession,
        autoRefreshToken: canPersistSession,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Narrowing helper: throws the same readable message everywhere. */
export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'De app is nog niet aan een server gekoppeld. Zie supabase/README.md.',
    );
  }
  return supabase;
}
