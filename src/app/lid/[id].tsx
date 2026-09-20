import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Screen,
  Txt,
} from '@/components/ui';
import { EnrollmentCard } from '@/components/voortgang';
import { fetchEnrollments, fetchProfileName, setMemberName } from '@/lib/api';
import { useIsStaff, useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { space } from '@/theme';

/** One vaarder, and every diploma they are working on or have. */
export default function Lid() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useIsStaff();
  const groupId = useSession((s) => s.activeGroupId);

  const name = useAsync(() => fetchProfileName(id), [id]);
  const enrollments = useAsync(
    () => (groupId ? fetchEnrollments(groupId, id) : Promise.resolve([])),
    [groupId, id],
  );

  if (enrollments.loading) return <Loading />;

  const rows = enrollments.data ?? [];
  const running = rows.filter((e) => !e.awarded_on);
  const done = rows.filter((e) => e.awarded_on);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={enrollments.refreshing}
          onRefresh={enrollments.reload}
        />
      }>
      <Stack.Screen options={{ title: name.data || 'Vaarder' }} />

      <View style={{ gap: space.md }}>
        <Txt variant="title">{name.data || 'Vaarder'}</Txt>
        <ErrorNote error={enrollments.error} />

        {staff ? (
          <Button
            label="Opleiding starten"
            onPress={() => router.push(`/nieuw/opleiding?lid=${id}`)}
          />
        ) : null}

        {rows.length === 0 ? (
          <Empty
            title="Nog geen opleiding"
            body={
              staff
                ? 'Start een opleiding, dan staat de hele eisenlijst klaar om af te tekenen.'
                : undefined
            }
          />
        ) : null}

        {running.map((e) => (
          <EnrollmentCard
            key={e.enrollment_id}
            enrollment={e}
            onPress={() => router.push(`/voortgang/${e.enrollment_id}`)}
          />
        ))}

        {done.length > 0 ? (
          <View style={{ gap: space.md, marginTop: space.md }}>
            <Txt variant="heading">Behaald</Txt>
            {done.map((e) => (
              <EnrollmentCard
                key={e.enrollment_id}
                enrollment={e}
                onPress={() => router.push(`/voortgang/${e.enrollment_id}`)}
              />
            ))}
          </View>
        ) : null}

        {staff ? (
          <NaamAanpassen
            // De naam komt later binnen dan de eerste render; de key zorgt dat
            // het veld opnieuw begint zodra hij er is, in plaats van leeg te
            // blijven staan.
            key={name.data ?? ''}
            profileId={id}
            current={name.data ?? ''}
            onSaved={() => void name.reload()}
          />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * Een naam corrigeren.
 *
 * Nodig omdat de meeste vaarders niet inloggen en hun eigen naam dus nooit
 * kunnen rechtzetten. Onderaan het scherm, want je komt hier om af te tekenen,
 * niet om te typen.
 */
function NaamAanpassen({
  profileId,
  current,
  onSaved,
}: {
  profileId: string;
  current: string;
  onSaved: () => void;
}) {
  const groupId = useSession((s) => s.activeGroupId);
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const changed = name.trim() !== current.trim() && name.trim().length >= 2;

  return (
    <Card style={{ marginTop: space.xl }}>
      <Txt variant="subheading">Naam</Txt>
      <Field value={name} onChangeText={setName} autoCapitalize="words" />
      <ErrorNote error={error} />
      <Button
        variant="secondary"
        label="Naam opslaan"
        busy={busy}
        disabled={!changed}
        onPress={async () => {
          if (!groupId) return;
          setBusy(true);
          setError(null);
          try {
            await setMemberName(groupId, profileId, name);
            onSaved();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}
