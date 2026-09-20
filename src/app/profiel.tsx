import { useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorNote, Field, Screen, Txt } from '@/components/ui';
import { updateMyName } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space } from '@/theme';

/**
 * The one thing a member owns here is their name — it is what an aftekening
 * carries, so it matters that it is spelled the way they spell it.
 */
export default function Profiel() {
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);
  const reload = useSession((s) => s.reload);

  const [name, setName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateMyName(userId, name);
      await reload();
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.md }}>
        <Field
          label="Naam"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setSaved(false);
          }}
          autoCapitalize="words"
          placeholder="Voor- en achternaam"
          hint="Deze naam staat bij elke eis die je aftekent."
        />
        <ErrorNote error={error} />
        {saved ? (
          <Txt variant="small" dim>
            Opgeslagen.
          </Txt>
        ) : null}
        <Button
          label="Opslaan"
          onPress={save}
          busy={busy}
          disabled={name.trim().length < 2}
        />
      </View>
    </Screen>
  );
}
