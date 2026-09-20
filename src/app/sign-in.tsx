import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import * as Linking from 'expo-linking';

import { Button, ErrorNote, Field, PlainScreen, Txt } from '@/components/ui';
import { useSession } from '@/lib/session';
import { db } from '@/lib/supabase';
import { space } from '@/theme';

export default function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useSession((s) => s.reload);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'up') {
        if (name.trim().length < 2) throw new Error('Vul je naam in.');
        const { data, error: signUpError } = await db().auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            // Zonder dit gebruikt Supabase de Site URL uit het dashboard, en
            // die staat standaard op localhost:3000 — de bevestigingslink komt
            // dan uit bij een adres dat op niemands telefoon bestaat. Dit stuurt
            // hem terug naar de app zelf.
            emailRedirectTo: Linking.createURL('/'),
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice(
            'Je account is aangemaakt. Bevestig je e-mailadres en log daarna in.',
          );
          setMode('in');
          return;
        }
      } else {
        const { error: signInError } = await db().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
      await reload();
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
          <Txt variant="title">Aftekenboek</Txt>
          <Txt dim>
            {mode === 'in'
              ? 'De vorderingenstaat voor de Watersport Academy-diploma’s van je groep.'
              : 'Maak een account. Daarna vul je de code in die je van je groep kreeg.'}
          </Txt>
        </View>

        {mode === 'up' ? (
          <Field
            label="Naam"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            placeholder="Voor- en achternaam"
          />
        ) : null}

        <Field
          label="E-mailadres"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="jij@voorbeeld.nl"
        />

        <Field
          label="Wachtwoord"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          textContentType={mode === 'up' ? 'newPassword' : 'password'}
          hint={mode === 'up' ? 'Minimaal 8 tekens.' : undefined}
        />

        {notice ? <Txt variant="small">{notice}</Txt> : null}
        <ErrorNote error={error} />

        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button
            label={mode === 'in' ? 'Inloggen' : 'Account maken'}
            onPress={submit}
            busy={busy}
            disabled={!email.trim() || password.length < 6}
          />
          <Button
            variant="ghost"
            label={
              mode === 'in' ? 'Nog geen account? Maak er een' : 'Ik heb al een account'
            }
            onPress={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setError(null);
              setNotice(null);
            }}
          />
        </View>
      </PlainScreen>
    </KeyboardAvoidingView>
  );
}
