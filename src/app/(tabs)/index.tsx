import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Card,
  Chip,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Row,
  Screen,
  Txt,
} from '@/components/ui';
import { MyProgress } from '@/components/voortgang';
import { fetchMembers } from '@/lib/api';
import { useIsStaff, useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { useTheme } from '@/lib/use-theme';
import { ROLE_LABEL, type MemberRow } from '@/lib/types';
import { space } from '@/theme';

/**
 * The first tab. For an instructeur that is the lijst met vaarders; for a lid
 * it is their own voortgang, because that is all they can see anyway.
 */
export default function Home() {
  const staff = useIsStaff();
  return staff ? <Vaarders /> : <MyProgress />;
}

function Vaarders() {
  const router = useRouter();
  const groupId = useSession((s) => s.activeGroupId);
  const [query, setQuery] = useState('');

  const { data, loading, refreshing, error, reload } = useAsync(
    () => (groupId ? fetchMembers(groupId) : Promise.resolve([])),
    [groupId],
  );

  const members = data ?? [];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.sections.some((s) => s.toLowerCase().includes(q)),
    );
  }, [members, query]);

  if (loading) return <Loading />;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <View style={{ gap: space.md }}>
        <ErrorNote error={error} />

        {members.length > 8 ? (
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Zoek op naam of speltak"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}

        {shown.length === 0 ? (
          <Empty
            title={query ? 'Niemand gevonden' : 'Nog geen vaarders'}
            body={
              query
                ? undefined
                : 'Deel een uitnodigingscode uit vanuit Meer › Beheer, dan melden ze zich hier aan.'
            }
          />
        ) : (
          shown.map((m) => (
            <MemberCard
              key={m.profile_id}
              member={m}
              onPress={() => router.push(`/lid/${m.profile_id}`)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

function MemberCard({ member, onPress }: { member: MemberRow; onPress: () => void }) {
  const t = useTheme();
  const busy = member.in_progress > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={member.full_name}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="subheading">
              {member.full_name || 'Naam nog niet ingevuld'}
            </Txt>
            <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
              {member.role === 'lid' ? null : <Chip label={ROLE_LABEL[member.role]} />}
              {member.sections.map((s) => (
                <Chip key={s} label={s} />
              ))}
            </Row>
          </View>
          <Txt style={{ color: t.textDim, fontSize: 18 }}>›</Txt>
        </Row>

        <Txt variant="small" dim>
          {busy ? `${member.in_progress} in opleiding` : 'Geen lopende opleiding'}
          {member.awarded > 0 ? ` · ${member.awarded} behaald` : ''}
        </Txt>
      </Card>
    </Pressable>
  );
}
