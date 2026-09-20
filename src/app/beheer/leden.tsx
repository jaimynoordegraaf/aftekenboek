import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  Empty,
  ErrorNote,
  Loading,
  Row,
  Screen,
  Txt,
} from '@/components/ui';
import { fetchMembers, removeMember, setMemberRole } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { ROLE_LABEL, type MemberRow, type Role } from '@/lib/types';
import { space } from '@/theme';

const ROLES: Role[] = ['lid', 'instructeur', 'beheerder'];

/** Who may aftekenen. The only screen where that changes. */
export default function Rollen() {
  const groupId = useSession((s) => s.activeGroupId);
  const userId = useSession((s) => s.userId);
  const reloadSession = useSession((s) => s.reload);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const { data, loading, refreshing, reload } = useAsync(
    () => (groupId ? fetchMembers(groupId) : Promise.resolve([])),
    [groupId],
  );

  async function change(profileId: string, role: Role) {
    if (!groupId) return;
    setBusy(profileId);
    setError(null);
    try {
      await setMemberRole(groupId, profileId, role);
      await reload();
      // Your own role decides which tabs you see.
      if (profileId === userId) await reloadSession();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  function remove(m: MemberRow) {
    Alert.alert(
      `${m.full_name || 'Dit lid'} uit de groep halen?`,
      'Wat al afgetekend is blijft bewaard. Meldt hij zich later weer aan met een code, dan staat zijn vorderingenstaat er weer.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Uit de groep halen',
          style: 'destructive',
          onPress: async () => {
            if (!groupId) return;
            setBusy(m.profile_id);
            setError(null);
            try {
              await removeMember(groupId, m.profile_id);
              await reload();
              if (m.profile_id === userId) await reloadSession();
            } catch (e) {
              setError(e);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  if (loading) return <Loading />;

  const members = data ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <View style={{ gap: space.md }}>
        <ErrorNote error={error} />

        {members.length === 0 ? (
          <Empty title="Nog niemand in de groep" />
        ) : (
          members.map((m) => (
            <Card key={m.profile_id}>
              <Txt variant="subheading">
                {m.full_name || 'Naam nog niet ingevuld'}
                {m.profile_id === userId ? ' (jij)' : ''}
              </Txt>
              <Row gap={space.sm} style={{ flexWrap: 'wrap', opacity: busy === m.profile_id ? 0.5 : 1 }}>
                {ROLES.map((r) => (
                  <Chip
                    key={r}
                    label={ROLE_LABEL[r]}
                    selected={m.role === r}
                    onPress={
                      m.role === r ? undefined : () => void change(m.profile_id, r)
                    }
                  />
                ))}
              </Row>
              <Button
                variant="ghost"
                label="Uit de groep halen"
                onPress={() => remove(m)}
              />
            </Card>
          ))
        )}

        <Txt variant="small" dim>
          Maak jezelf niet per ongeluk lid: dan kan niemand meer beheren behalve een
          andere beheerder.
        </Txt>
      </View>
    </Screen>
  );
}
