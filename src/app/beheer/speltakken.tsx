import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Row,
  Screen,
  Txt,
} from '@/components/ui';
import { createSection, deleteSection, fetchSections } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { space } from '@/theme';

/** Speltakken are only used to sort the ledenlijst, so this stays small. */
export default function Speltakken() {
  const groupId = useSession((s) => s.activeGroupId);
  const reloadSession = useSession((s) => s.reload);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const { data, loading, reload } = useAsync(
    () => (groupId ? fetchSections(groupId) : Promise.resolve([])),
    [groupId],
  );

  async function add() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    try {
      await createSection(groupId, name);
      setName('');
      await reload();
      await reloadSession();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string, label: string) {
    Alert.alert(`${label} verwijderen?`, 'De leden blijven bestaan, de speltak niet.', [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSection(id);
            await reload();
            await reloadSession();
          } catch (e) {
            setError(e);
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;
  const sections = data ?? [];

  return (
    <Screen>
      <View style={{ gap: space.md }}>
        <Card>
          <Txt variant="subheading">Nieuwe speltak</Txt>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Zeeverkenners"
            autoCapitalize="words"
          />
          <Button
            label="Toevoegen"
            onPress={add}
            busy={busy}
            disabled={name.trim().length < 2}
          />
        </Card>

        <ErrorNote error={error} />

        {sections.length === 0 ? (
          <Empty title="Nog geen speltakken" />
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {sections.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  style={{
                    justifyContent: 'space-between',
                    paddingVertical: space.sm,
                  }}>
                  <Txt>{s.name}</Txt>
                  <Button
                    variant="ghost"
                    label="Verwijderen"
                    onPress={() => remove(s.id, s.name)}
                  />
                </Row>
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
