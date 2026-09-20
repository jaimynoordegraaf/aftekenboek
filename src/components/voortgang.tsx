/** The pieces that show how far someone is, shared by several screens. */

import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Card,
  Chip,
  Empty,
  ErrorNote,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Txt,
} from '@/components/ui';
import { fetchEnrollments } from '@/lib/api';
import { formatDate, formatRemaining } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { useTheme } from '@/lib/use-theme';
import { theoryStatus, totalDone, totalRequirements, type EnrollmentRow } from '@/lib/types';
import { space } from '@/theme';

/**
 * One diploma someone is working towards.
 *
 * Praktijk and theorie get their own bar. They are examined separately and by
 * different people, and a kandidaat who is done with the theorie but has three
 * praktijkeisen open is in a completely different place from one at the same
 * overall percentage the other way round.
 */
export function EnrollmentCard({
  enrollment,
  onPress,
}: {
  enrollment: EnrollmentRow;
  onPress?: () => void;
}) {
  const t = useTheme();
  const e = enrollment;
  const done = totalDone(e);
  const total = totalRequirements(e);
  const complete = total > 0 && done === total;
  const theory = theoryStatus(e);

  const body = (
    <Card style={{ gap: space.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="subheading">{e.diploma_name}</Txt>
          <Txt variant="small" dim>
            {e.discipline_name}
          </Txt>
        </View>
        {e.awarded_on ? (
          <Chip label="Behaald" tone="good" />
        ) : complete ? (
          <Chip label="Compleet" tone="good" />
        ) : null}
      </Row>

      {e.awarded_on ? (
        <Txt variant="small" color={t.good}>
          Uitgereikt op {formatDate(e.awarded_on)}
        </Txt>
      ) : (
        <View style={{ gap: space.sm }}>
          <ProgressBar
            label="Praktijk"
            done={e.praktijk_done}
            total={e.praktijk_total}
            tone={e.praktijk_done === e.praktijk_total ? 'good' : 'accent'}
          />
          <ProgressBar
            label="Theorie"
            done={e.theorie_done}
            total={e.theorie_total}
            tone={e.theorie_done === e.theorie_total ? 'good' : 'accent'}
          />
        </View>
      )}

      {theory.state === 'none' ? null : (
        <Txt
          variant="small"
          color={
            theory.state === 'expired'
              ? t.danger
              : theory.state === 'expiring'
                ? t.warn
                : t.textDim
          }>
          {theory.state === 'expired'
            ? `Theorie-examen verlopen op ${formatDate(theory.until)}`
            : `Theorie-examen geldig tot ${formatDate(theory.until)} — ${formatRemaining(theory.daysLeft)}`}
        </Txt>
      )}
    </Card>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Your own diploma's. Read-only: aftekenen is an instructeur's act. */
export function MyProgress() {
  const router = useRouter();
  const groupId = useSession((s) => s.activeGroupId);

  const { data, loading, refreshing, error, reload } = useAsync(
    () => (groupId ? fetchEnrollments(groupId) : Promise.resolve([])),
    [groupId],
  );

  if (loading) return <Loading />;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <View style={{ gap: space.md }}>
        <ErrorNote error={error} />
        {(data ?? []).length === 0 ? (
          <Empty
            title="Nog geen opleiding"
            body="Zodra je leiding je inschrijft voor een diploma, staat hij hier — met alles wat er nog moet gebeuren."
          />
        ) : (
          (data ?? []).map((e) => (
            <EnrollmentCard
              key={e.enrollment_id}
              enrollment={e}
              onPress={() => router.push(`/voortgang/${e.enrollment_id}`)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}
