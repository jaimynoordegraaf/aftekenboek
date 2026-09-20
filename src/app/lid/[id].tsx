import { RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Button, Empty, ErrorNote, Loading, Screen, Txt } from '@/components/ui';
import { EnrollmentCard } from '@/components/voortgang';
import { fetchEnrollments, fetchProfileName } from '@/lib/api';
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
      </View>
    </Screen>
  );
}
