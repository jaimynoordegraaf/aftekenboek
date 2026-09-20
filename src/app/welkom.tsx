import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ErrorNote, Field, PlainScreen, Txt } from '@/components/ui';
import { createGroup, redeemInvite } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space } from '@/theme';

/** Signed in, but not in a Scoutinggroep yet: join one, or start one. */
export default function Welkom() {
  const [code, setCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);

  const reload = useSession((s) => s.reload);
  const signOut = useSession((s) => s.signOut);

  async function join() {
    setBusy('join');
    setError(null);
    try {
      await redeemInvite(code);
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy('create');
    setError(null);
    try {
      await createGroup(groupName);
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PlainScreen>
      <View style={{ gap: space.xs, marginTop: space.xxl, marginBottom: space.md }}>
        <Txt variant="title">Welkom</Txt>
        <Txt dim>Je hoort nog bij geen enkele groep.</Txt>
      </View>

      <Card>
        <Txt variant="subheading">Ik heb een code</Txt>
        <Txt variant="small" dim>
          Je groep geeft je een code van zes tekens.
        </Txt>
        <Field
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          placeholder="ABC123"
          style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center' }}
        />
        <Button
          label="Aanmelden bij groep"
          onPress={join}
          busy={busy === 'join'}
          disabled={code.trim().length < 4}
        />
      </Card>

      {creating ? (
        <Card>
          <Txt variant="subheading">Nieuwe groep</Txt>
          <Txt variant="small" dim>
            Je wordt de beheerder en kunt daarna instructeurs aanwijzen en codes
            uitdelen.
          </Txt>
          <Field
            label="Naam van de groep"
            value={groupName}
            onChangeText={setGroupName}
            autoCapitalize="words"
            placeholder="Scouting Jan Willem Friso"
          />
          <Button
            label="Groep aanmaken"
            onPress={create}
            busy={busy === 'create'}
            disabled={groupName.trim().length < 3}
          />
        </Card>
      ) : (
        <Button
          variant="secondary"
          label="Een nieuwe groep beginnen"
          onPress={() => setCreating(true)}
        />
      )}

      <ErrorNote error={error} />

      <Button variant="ghost" label="Uitloggen" onPress={() => void signOut()} />
    </PlainScreen>
  );
}
