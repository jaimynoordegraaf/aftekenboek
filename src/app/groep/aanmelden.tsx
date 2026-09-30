import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, ErrorNote, Field, Screen, Txt } from '@/components/ui';
import { redeemInvite } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space } from '@/theme';

/**
 * Een code invullen terwijl je al bij een groep hoort.
 *
 * Het welkomstscherm doet hetzelfde, maar dat zie je alleen zolang je nergens
 * bij hoort. Wie van groep wisselt — een instructeur die ook bij de zeeverkenners
 * van een andere groep vaart, iemand die van groep verhuist — kwam er tot nu toe
 * niet meer bij. De database stond het allang toe: `redeem_invite` werkt voor
 * iedere ingelogde gebruiker, en een code die je al verzilverd hebt raakt niet
 * opnieuw op.
 */
export default function AanmeldenBijGroep() {
  const router = useRouter();
  const reload = useSession((s) => s.reload);
  const setActiveGroup = useSession((s) => s.setActiveGroup);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const groupId = await redeemInvite(code);
      await reload();
      // Meteen in de nieuwe groep kijken: daar kwam je voor.
      await setActiveGroup(groupId);
      router.back();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="title">Aanmelden bij een groep</Txt>
          <Txt dim>
            Vul de uitnodigingscode in die je van een beheerder kreeg. Je blijft
            in de groepen waar je al bij hoort; wisselen doe je daarna onder Meer.
          </Txt>
        </View>

        <Field
          label="Code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          placeholder="Bijvoorbeeld: JWF-4K2P"
          onSubmitEditing={() => {
            if (code.trim().length >= 4) void join();
          }}
        />

        <ErrorNote error={error} />

        <Button
          label="Aanmelden"
          onPress={join}
          busy={busy}
          disabled={code.trim().length < 4}
        />
        <Button variant="secondary" label="Annuleren" onPress={() => router.back()} />

        <Txt variant="small" dim>
          Hoor je al bij die groep, dan gebeurt er niets en blijft de code geldig
          voor wie er nog op wacht.
        </Txt>
      </View>
    </Screen>
  );
}
