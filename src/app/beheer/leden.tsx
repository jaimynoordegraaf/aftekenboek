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
import {
  fetchMembers,
  removeMember,
  setMemberRole,
  setMemberSections,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { ROLE_LABEL, type MemberRow, type Role } from '@/lib/types';
import { space } from '@/theme';

const ROLES: Role[] = ['lid', 'instructeur', 'beheerder'];

/** Who may aftekenen. The only screen where that changes. */
export default function Rollen() {
  const groupId = useSession((s) => s.activeGroupId);
  const userId = useSession((s) => s.userId);
  const sections = useSession((s) => s.sections);
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

  /** Een speltak aan- of uitzetten. De hele set gaat mee, niet het verschil. */
  async function toggleSection(m: MemberRow, sectionId: string) {
    if (!groupId) return;
    const current = m.section_ids ?? [];
    const next = current.includes(sectionId)
      ? current.filter((id) => id !== sectionId)
      : [...current, sectionId];

    setBusy(m.profile_id);
    setError(null);
    try {
      await setMemberSections(groupId, m.profile_id, next);
      await reload();
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
              {sections.length > 0 ? (
                <>
                  <Txt variant="label" dim style={{ marginTop: space.xs }}>
                    Speltakken
                  </Txt>
                  <Row
                    gap={space.sm}
                    style={{
                      flexWrap: 'wrap',
                      opacity: busy === m.profile_id ? 0.5 : 1,
                    }}>
                    {sections.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.name}
                        selected={(m.section_ids ?? []).includes(s.id)}
                        onPress={() => void toggleSection(m, s.id)}
                      />
                    ))}
                  </Row>
                </>
              ) : null}

              <Button
                variant="ghost"
                label="Uit de groep halen"
                onPress={() => remove(m)}
              />
            </Card>
          ))
        )}

        <Txt variant="small" dim>
          {sections.length === 0
            ? 'Maak eerst speltakken aan onder Beheer › Speltakken, dan kun je leden hier koppelen en erop filteren in de Vaarders-lijst.'
            : 'Een lid kan in meer dan één speltak zitten. De laatste beheerder kan zichzelf niet degraderen — daar houdt de database je tegen.'}
        </Txt>
      </View>
    </Screen>
  );
}
