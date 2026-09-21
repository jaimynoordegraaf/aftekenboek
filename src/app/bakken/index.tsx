import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Button,
  Card,
  Divider,
  Empty,
  ErrorNote,
  Field,
  LinkRow,
  Loading,
  Screen,
  Txt,
} from '@/components/ui';
import { createCrew, fetchCrewSizes, fetchCrews } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { space } from '@/theme';

/**
 * De bakken van de groep: wie er samen in een boot zit.
 *
 * Instructeurs mogen dit, niet alleen beheerders — wie de boten indeelt staat
 * meestal zelf op de steiger.
 */
export default function Bakken() {
  const router = useRouter();
  const groupId = useSession((s) => s.activeGroupId);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const crews = useAsync(
    () => (groupId ? fetchCrews(groupId) : Promise.resolve([])),
    [groupId],
  );
  const sizes = useAsync(fetchCrewSizes, []);

  async function add() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    try {
      await createCrew(groupId, name);
      setName('');
      await crews.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (crews.loading) return <Loading />;
  const list = crews.data ?? [];

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={crews.refreshing}
          onRefresh={() => {
            void crews.reload();
            void sizes.reload();
          }}
        />
      }>
      <View style={{ gap: space.md }}>
        <Card>
          <Txt variant="subheading">Nieuwe bak</Txt>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Vlet 1, Albatros, …"
            autoCapitalize="words"
          />
          <Button
            label="Toevoegen"
            onPress={add}
            busy={busy}
            disabled={name.trim().length < 2}
          />
        </Card>

        <ErrorNote error={error ?? crews.error} />

        {list.length === 0 ? (
          <Empty title="Nog geen bakken" />
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {list.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider /> : null}
                <LinkRow
                  label={c.name}
                  detail={`${sizes.data?.[c.id] ?? 0} opvarenden`}
                  onPress={() => router.push(`/bakken/${c.id}`)}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
