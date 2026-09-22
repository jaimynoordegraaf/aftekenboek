import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import * as Linking from 'expo-linking';

import { Button, ErrorNote, Field, PlainScreen, Txt } from '@/components/ui';
import { useSession } from '@/lib/session';
import { db } from '@/lib/supabase';
import { space } from '@/theme';

type Mode = 'in' | 'up' | 'reset';

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useSession((s) => s.reload);
  // Een link uit een mail die niet werkte, bijvoorbeeld een verlopen herstellink.
  const linkError = useSession((s) => s.authLinkError);
  const setLinkError = useSession((s) => s.setAuthLinkError);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setLinkError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setLinkError(null);
    try {
      if (mode === 'reset') {
        const { error: resetError } = await db().auth.resetPasswordForEmail(email.trim(), {
          // Terug in de app, op het scherm om een nieuw wachtwoord te kiezen.
          redirectTo: Linking.createURL('/wachtwoord'),
        });
        if (resetError) throw resetError;
        // Bewust dezelfde tekst of het adres nu bestaat of niet: anders kan
        // iedereen hier uitzoeken wie er een account heeft.
        setNotice(
          'Als er een account bij dit adres hoort, staat er een mail onderweg met een link om een nieuw wachtwoord te kiezen. Open die link op deze telefoon.',
        );
        return;
      }

      if (mode === 'up') {
        if (name.trim().length < 2) throw new Error('Vul je naam in.');
        const { data, error: signUpError } = await db().auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            // Zonder dit gebruikt Supabase de Site URL uit het dashboard, en
            // die wijst naar de beheerpagina. Dit stuurt de bevestigingslink
            // terug naar de app zelf.
            emailRedirectTo: Linking.createURL('/'),
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice(
            'Je account is aangemaakt. Tik op de link in de bevestigingsmail om verder te gaan.',
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

  const lead = {
    in: 'De vorderingenstaat voor de Watersport Academy-diploma’s van je groep.',
    up: 'Maak een account. Daarna vul je de code in die je van je groep kreeg.',
    reset: 'Vul je e-mailadres in. Je krijgt een mail met een link om een nieuw wachtwoord te kiezen.',
  }[mode];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PlainScreen>
        <View style={{ gap: space.xs, marginTop: space.xxl, marginBottom: space.lg }}>
          <Txt variant="title">
            {mode === 'reset' ? 'Wachtwoord vergeten' : 'Vinkje'}
          </Txt>
          <Txt dim>{lead}</Txt>
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

        {mode === 'reset' ? null : (
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
        )}

        {notice ? <Txt variant="small">{notice}</Txt> : null}
        <ErrorNote error={error ?? linkError} />

        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button
            label={
              mode === 'in' ? 'Inloggen' : mode === 'up' ? 'Account maken' : 'Stuur herstellink'
            }
            onPress={submit}
            busy={busy}
            disabled={!email.trim() || (mode !== 'reset' && password.length < 6)}
          />

          {mode === 'in' ? (
            <>
              <Button
                variant="ghost"
                label="Wachtwoord vergeten?"
                onPress={() => switchTo('reset')}
              />
              <Button
                variant="ghost"
                label="Nog geen account? Maak er een"
                onPress={() => switchTo('up')}
              />
            </>
          ) : (
            <Button
              variant="ghost"
              label="Terug naar inloggen"
              onPress={() => switchTo('in')}
            />
          )}
        </View>
      </PlainScreen>
    </KeyboardAvoidingView>
  );
}
