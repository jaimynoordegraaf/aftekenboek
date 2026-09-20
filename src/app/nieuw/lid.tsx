import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, ErrorNote, Field, Screen, Txt } from '@/components/ui';
import { addMember } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space } from '@/theme';

/**
 * Iemand toevoegen die geen account heeft.
 *
 * Dat is het normale geval: de meeste vaarders zijn kinderen zonder telefoon.
 * Ze krijgen geen code en melden zich nergens aan — een instructeur zet ze hier
 * neer en vanaf dat moment hebben ze een vorderingenstaat als ieder ander.
 */
export default function NieuwLid() {
  const router = useRouter();
  const groupId = useSession((s) => s.activeGroupId);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    try {
      const id = await addMember(groupId, name);
      // Meteen naar zijn kaart: negen van de tien keer wil je er direct een
      // opleiding voor starten.
      router.replace(`/lid/${id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="title">Lid toevoegen</Txt>
          <Txt dim>
            Voor een vaarder zonder telefoon. Hij komt in de ledenlijst te staan
            en kan afgetekend worden, maar logt nergens op in.
          </Txt>
        </View>

        <Field
          label="Naam"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
          placeholder="Voor- en achternaam"
          onSubmitEditing={() => {
            if (name.trim().length >= 2) void save();
          }}
        />

        <ErrorNote error={error} />

        <Button
          label="Toevoegen"
          onPress={save}
          busy={busy}
          disabled={name.trim().length < 2}
        />
        <Button variant="secondary" label="Annuleren" onPress={() => router.back()} />

        <Txt variant="small" dim>
          Heeft iemand wél een telefoon en moet hij kunnen aftekenen, geef hem dan
          een uitnodigingscode via Meer › Beheer. Dat is de weg voor instructeurs.
        </Txt>
      </View>
    </Screen>
  );
}
