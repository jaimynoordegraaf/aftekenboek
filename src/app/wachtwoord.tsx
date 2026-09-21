import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, ErrorNote, Field, PlainScreen, Txt } from '@/components/ui';
import { useSession } from '@/lib/session';
import { db } from '@/lib/supabase';
import { space } from '@/theme';

/**
 * Een nieuw wachtwoord kiezen, na de link uit "wachtwoord vergeten".
 *
 * Wie hier komt heeft al een sessie — die zat in de link — maar de app laat
 * hem pas verder als het nieuwe wachtwoord is opgeslagen. Twee keer invullen,
 * want een typefout hier betekent de hele ronde opnieuw.
 */
export default function NieuwWachtwoord() {
  const router = useRouter();
  const setRecovering = useSession((s) => s.setRecovering);
  const signOut = useSession((s) => s.signOut);
  const email = useSession((s) => s.email);

  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mismatch = repeat.length > 0 && repeat !== password;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await db().auth.updateUser({ password });
      if (updateError) throw updateError;
      setRecovering(false);
      router.replace('/');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PlainScreen>
        <View style={{ gap: space.xs, marginTop: space.xxl, marginBottom: space.lg }}>
          <Txt variant="title">Nieuw wachtwoord</Txt>
          <Txt dim>
            {email ? `Voor ${email}. ` : ''}Kies een wachtwoord van minimaal 8 tekens.
          </Txt>
        </View>

        <Field
          label="Nieuw wachtwoord"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          autoFocus
        />
        <Field
          label="Nog een keer"
          value={repeat}
          onChangeText={setRepeat}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          hint={mismatch ? 'De twee wachtwoorden zijn niet gelijk.' : undefined}
        />

        <ErrorNote error={error} />

        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button
            label="Wachtwoord opslaan"
            onPress={save}
            busy={busy}
            disabled={password.length < 8 || repeat !== password}
          />
          <Button
            variant="ghost"
            label="Annuleren en uitloggen"
            onPress={() => {
              setRecovering(false);
              void signOut();
            }}
          />
        </View>
      </PlainScreen>
    </KeyboardAvoidingView>
  );
}
