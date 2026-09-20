import { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Row,
  Screen,
  Txt,
} from '@/components/ui';
import { createInvite, deleteInvite, fetchInvites } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { useTheme } from '@/lib/use-theme';
import { ROLE_LABEL, type Role } from '@/lib/types';
import { space } from '@/theme';

const ROLES: Role[] = ['lid', 'instructeur'];

/** Codes of six characters; the only way into a groep. */
export default function Uitnodigingen() {
  const t = useTheme();
  const groupId = useSession((s) => s.activeGroupId);

  const sections = useSession((s) => s.sections);

  const [role, setRole] = useState<Role>('lid');
  const [label, setLabel] = useState('');
  const [many, setMany] = useState(false);
  /** Null is: geen speltak, dan koppelt de code ze nergens aan. */
  const [section, setSection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const { data, loading, reload } = useAsync(
    () => (groupId ? fetchInvites(groupId) : Promise.resolve([])),
    [groupId],
  );

  async function make() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    try {
      await createInvite(groupId, role, label, many ? 50 : 1, section);
      setLabel('');
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  const invites = data ?? [];

  return (
    <Screen>
      <View style={{ gap: space.md }}>
        <Card>
          <Txt variant="subheading">Nieuwe code</Txt>

          <Txt variant="label" dim>
            Wordt
          </Txt>
          <Row gap={space.sm}>
            {ROLES.map((r) => (
              <Chip
                key={r}
                label={ROLE_LABEL[r]}
                selected={role === r}
                onPress={() => setRole(r)}
              />
            ))}
          </Row>

          {sections.length > 0 ? (
            <>
              <Txt variant="label" dim>
                Komt in speltak
              </Txt>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                <Chip
                  label="Geen"
                  selected={section === null}
                  onPress={() => setSection(null)}
                />
                {sections.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={section === s.id}
                    onPress={() => setSection(s.id)}
                  />
                ))}
              </Row>
            </>
          ) : null}

          <Field
            label="Waarvoor (optioneel)"
            value={label}
            onChangeText={setLabel}
            placeholder="Najaar 2026"
          />

          <Row gap={space.sm}>
            <Chip
              label="Eén keer te gebruiken"
              selected={!many}
              onPress={() => setMany(false)}
            />
            <Chip
              label="Voor een hele groep"
              selected={many}
              onPress={() => setMany(true)}
            />
          </Row>

          <Button label="Code maken" onPress={make} busy={busy} />
        </Card>

        <ErrorNote error={error} />

        {invites.length === 0 ? (
          <Empty title="Nog geen codes" />
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {invites.map((inv, i) => (
              <View key={inv.id}>
                {i > 0 ? <Divider /> : null}
                <Row
                  style={{
                    justifyContent: 'space-between',
                    paddingVertical: space.sm,
                  }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt
                      variant="heading"
                      color={t.accentText}
                      style={{ letterSpacing: 3 }}>
                      {inv.code}
                    </Txt>
                    <Txt variant="small" dim>
                      {ROLE_LABEL[inv.role]}
                      {inv.section_id
                        ? ` · ${sections.find((s) => s.id === inv.section_id)?.name ?? 'speltak'}`
                        : ''}
                      {inv.label ? ` · ${inv.label}` : ''} · {inv.uses} van{' '}
                      {inv.max_uses} gebruikt
                    </Txt>
                  </View>
                  <Button
                    variant="ghost"
                    label="Intrekken"
                    onPress={async () => {
                      try {
                        await deleteInvite(inv.id);
                        await reload();
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  />
                </Row>
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
