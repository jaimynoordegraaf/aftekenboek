import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  Button,
  Card,
  Divider,
  ErrorNote,
  LinkRow,
  Loading,
  Screen,
  Txt,
} from '@/components/ui';
import { enroll, fetchCatalogue, fetchEnrollments, fetchProfileName } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { space } from '@/theme';

/** Pick a diploma for one vaarder. Diploma's they already do are left out. */
export default function NieuweOpleiding() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const router = useRouter();
  const groupId = useSession((s) => s.activeGroupId);
  const userId = useSession((s) => s.userId);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const name = useAsync(() => fetchProfileName(lid), [lid]);
  const catalogue = useAsync(fetchCatalogue, []);
  const existing = useAsync(
    () => (groupId ? fetchEnrollments(groupId, lid) : Promise.resolve([])),
    [groupId, lid],
  );

  if (catalogue.loading || existing.loading) return <Loading />;

  const taken = new Set((existing.data ?? []).map((e) => e.diploma_id));

  async function start(diplomaId: string) {
    if (!groupId || !userId) return;
    setBusy(diplomaId);
    setError(null);
    try {
      const id = await enroll(groupId, lid, diplomaId, userId);
      router.replace(`/voortgang/${id}`);
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="title">Opleiding starten</Txt>
          <Txt dim>
            Voor {name.data || 'deze vaarder'}. De hele eisenlijst komt klaar te
            staan; aftekenen doe je daarna per eis.
          </Txt>
        </View>

        <ErrorNote error={error} />

        {(catalogue.data ?? []).map((d) => {
          const options = d.diplomas.filter((dip) => !taken.has(dip.id));
          if (options.length === 0) return null;
          return (
            <View key={d.id} style={{ gap: space.sm }}>
              <Txt variant="heading">{d.name}</Txt>
              <Card style={{ paddingVertical: space.xs }}>
                {options.map((dip, i) => (
                  <View key={dip.id}>
                    {i > 0 ? <Divider /> : null}
                    <LinkRow
                      label={dip.name}
                      detail={busy === dip.id ? 'bezig…' : (dip.level_label ?? undefined)}
                      onPress={() => void start(dip.id)}
                    />
                  </View>
                ))}
              </Card>
            </View>
          );
        })}

        <Button variant="secondary" label="Annuleren" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
