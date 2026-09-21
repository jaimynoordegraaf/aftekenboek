import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Button,
  Card,
  Divider,
  ErrorNote,
  Field,
  Loading,
  Screen,
  Txt,
} from '@/components/ui';
import {
  deleteCrew,
  fetchCrew,
  fetchCrewRoster,
  fetchMembers,
  setCrewMembers,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { useTheme } from '@/lib/use-theme';
import { radius, space } from '@/theme';

/**
 * Wie er in één bak zit.
 *
 * Aanvinken en dan pas opslaan, in plaats van elke tik meteen te versturen:
 * een bemanning samenstellen is een handvol keuzes die bij elkaar horen, en
 * set_crew_members vervangt de hele set in één keer.
 */
export default function BakIndelen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const groupId = useSession((s) => s.activeGroupId);

  const crew = useAsync(() => fetchCrew(id), [id]);
  const roster = useAsync(() => fetchCrewRoster(id), [id]);
  const members = useAsync(
    () => (groupId ? fetchMembers(groupId) : Promise.resolve([])),
    [groupId],
  );

  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  // Beginnen bij wie er nu in zit, zodra dat binnen is.
  useEffect(() => {
    if (roster.data && chosen === null) {
      setChosen(new Set(roster.data.map((r) => r.profile_id)));
    }
  }, [roster.data, chosen]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = members.data ?? [];
    if (!q) return all;
    return all.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.sections.some((s) => s.toLowerCase().includes(q)),
    );
  }, [members.data, query]);

  const original = new Set((roster.data ?? []).map((r) => r.profile_id));
  const changed =
    chosen !== null &&
    (chosen.size !== original.size || [...chosen].some((p) => !original.has(p)));

  async function save() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await setCrewMembers(id, [...chosen]);
      await roster.reload();
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    Alert.alert(
      `${crew.data?.name ?? 'Deze bak'} verwijderen?`,
      'De vaarders en hun aftekeningen blijven bestaan; alleen de indeling verdwijnt.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCrew(id);
              router.back();
            } catch (e) {
              setError(e);
            }
          },
        },
      ],
    );
  }

  if (crew.loading || roster.loading || members.loading || chosen === null) {
    return <Loading />;
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: crew.data?.name ?? 'Bak' }} />

      <View style={{ gap: space.md }}>
        <Txt variant="title">{crew.data?.name}</Txt>
        <Txt dim>
          {chosen.size === 0
            ? 'Nog niemand ingedeeld.'
            : `${chosen.size} ${chosen.size === 1 ? 'opvarende' : 'opvarenden'} aangevinkt.`}
        </Txt>

        {(members.data ?? []).length > 8 ? (
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Zoek op naam of speltak"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}

        <Card style={{ gap: 0, paddingVertical: space.xs }}>
          {shown.map((m, i) => {
            const on = chosen.has(m.profile_id);
            return (
              <View key={m.profile_id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={m.full_name}
                  onPress={() => {
                    const next = new Set(chosen);
                    if (on) next.delete(m.profile_id);
                    else next.add(m.profile_id);
                    setChosen(next);
                    setSaved(false);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: space.md,
                    minHeight: 48,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: radius.sm,
                      borderWidth: 2,
                      borderColor: on ? t.accent : t.border,
                      backgroundColor: on ? t.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {on ? (
                      <Txt style={{ color: t.onAccent, fontWeight: '900' }}>✓</Txt>
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt>{m.full_name || 'Naam nog niet ingevuld'}</Txt>
                    {m.sections.length ? (
                      <Txt variant="small" dim>
                        {m.sections.join(', ')}
                      </Txt>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Card>

        <ErrorNote error={error ?? roster.error ?? members.error} />
        {saved ? (
          <Txt variant="small" color={t.good}>
            Opgeslagen.
          </Txt>
        ) : null}

        <Button label="Indeling opslaan" onPress={save} busy={busy} disabled={!changed} />
        <Button variant="danger" label="Bak verwijderen" onPress={remove} />
      </View>
    </Screen>
  );
}
