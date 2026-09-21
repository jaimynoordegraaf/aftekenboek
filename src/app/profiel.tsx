import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, ErrorNote, Field, Heading, Screen, Txt } from '@/components/ui';
import { deleteMyAccount, updateMyName } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space } from '@/theme';

/**
 * The one thing a member owns here is their name — it is what an aftekening
 * carries, so it matters that it is spelled the way they spell it.
 *
 * And the account itself: Apple and Google both require that an account made
 * in the app can be deleted in the app, not only by mailing someone.
 */
export default function Profiel() {
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);
  const reload = useSession((s) => s.reload);
  const signOut = useSession((s) => s.signOut);

  const [name, setName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

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

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMyAccount();
    } catch (e) {
      setDeleteError(e);
      setDeleting(false);
      return;
    }
    // The login no longer exists on the server, so only the copy on this phone
    // is left to forget. The gate then sends us back to the sign-in screen.
    await signOut('local');
  }

  function confirmRemove() {
    Alert.alert(
      'Account verwijderen?',
      'Je login, je naam en je eigen voortgang worden verwijderd. Wat je bij anderen hebt afgetekend blijft staan, maar niet meer op jouw naam. Dit kun je niet ongedaan maken.',
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Verwijderen', style: 'destructive', onPress: () => void remove() },
      ],
    );
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

      <Card style={{ marginTop: space.xl, gap: space.md }}>
        <Heading>Account verwijderen</Heading>
        <Txt variant="small" dim>
          Hiermee verdwijnen je login, je naam en je eigen voortgang. Wat je als
          instructeur bij anderen hebt afgetekend blijft staan, zonder jouw naam.
          Ben je de laatste beheerder van je groep, maak dan eerst iemand anders
          beheerder.
        </Txt>
        <ErrorNote error={deleteError} />
        <Button
          variant="danger"
          label="Account verwijderen"
          onPress={confirmRemove}
          busy={deleting}
        />
      </Card>
    </Screen>
  );
}
