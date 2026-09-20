import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Button,
  Card,
  CheckRow,
  Divider,
  ErrorNote,
  Field,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Segmented,
  Txt,
} from '@/components/ui';
import {
  deleteEnrollment,
  fetchEnrollment,
  fetchSheet,
  setSignOff,
  updateEnrollment,
  type EnrollmentDetail,
} from '@/lib/api';
import { formatDay, today } from '@/lib/dates';
import { useIsStaff } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { useTheme } from '@/lib/use-theme';
import { KIND_LABEL, type RequirementKind, type SheetRow } from '@/lib/types';
import { radius, space } from '@/theme';

/**
 * The aftekenlijst — the screen the app exists for.
 *
 * Tapping a regel tekent hem af. It is applied on screen first and sent after,
 * because this is used on the water with a phone that has one bar of signal,
 * and an instructeur who taps three eisen in a row should not be watching
 * spinners. If the call fails the tick goes back and the error is shown.
 */
export default function Aftekenlijst() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const staff = useIsStaff();
  const t = useTheme();
  const router = useRouter();

  const [kind, setKind] = useState<RequirementKind>('praktijk');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [noteFor, setNoteFor] = useState<SheetRow | null>(null);

  const enrollment = useAsync(() => fetchEnrollment(id), [id]);
  const sheet = useAsync(() => fetchSheet(id), [id]);

  const rows = sheet.data ?? [];
  const shown = useMemo(() => rows.filter((r) => r.kind === kind), [rows, kind]);

  const counts = useMemo(() => {
    const per = (k: RequirementKind) => {
      const all = rows.filter((r) => r.kind === k);
      return { done: all.filter((r) => r.signed_at !== null).length, total: all.length };
    };
    return { praktijk: per('praktijk'), theorie: per('theorie') };
  }, [rows]);

  const toggle = useCallback(
    async (row: SheetRow, note?: string | null) => {
      if (!staff) return;
      const next = row.signed_at === null;

      // Optimistic: paint it, then send it.
      sheet.patch(
        rows.map((r) =>
          r.requirement_id === row.requirement_id
            ? {
                ...r,
                signed_at: next ? new Date().toISOString() : null,
                signed_by_name: next ? 'jij' : null,
                note: next ? (note ?? r.note) : null,
              }
            : r,
        ),
      );
      setPending((p) => ({ ...p, [row.requirement_id]: true }));
      setFailure(null);

      try {
        await setSignOff(id, row.requirement_id, next, note ?? row.note);
        await sheet.reload();
      } catch (e) {
        setFailure(e);
        await sheet.reload();
      } finally {
        setPending((p) => {
          const { [row.requirement_id]: _gone, ...rest } = p;
          return rest;
        });
      }
    },
    [id, rows, sheet, staff],
  );

  if (enrollment.loading || sheet.loading) return <Loading />;
  if (!enrollment.data) {
    return (
      <Screen>
        <ErrorNote
          error={enrollment.error ?? new Error('Deze opleiding kennen we niet.')}
        />
      </Screen>
    );
  }

  const e = enrollment.data;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={sheet.refreshing}
          onRefresh={() => {
            void enrollment.reload();
            void sheet.reload();
          }}
        />
      }>
      <Stack.Screen options={{ title: e.diploma.name }} />

      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="small" dim>
            {e.member.full_name} · {e.discipline.name}
          </Txt>
          <Txt variant="title">{e.diploma.name}</Txt>
        </View>

        <Card style={{ gap: space.md }}>
          <ProgressBar
            label="Praktijk"
            done={counts.praktijk.done}
            total={counts.praktijk.total}
            tone={
              counts.praktijk.done === counts.praktijk.total ? 'good' : 'accent'
            }
          />
          <ProgressBar
            label="Theorie"
            done={counts.theorie.done}
            total={counts.theorie.total}
            tone={counts.theorie.done === counts.theorie.total ? 'good' : 'accent'}
          />
        </Card>

        <ErrorNote error={failure} />
        <ErrorNote error={sheet.error} />

        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            {
              value: 'praktijk',
              label: `${KIND_LABEL.praktijk} ${counts.praktijk.done}/${counts.praktijk.total}`,
            },
            {
              value: 'theorie',
              label: `${KIND_LABEL.theorie} ${counts.theorie.done}/${counts.theorie.total}`,
            },
          ]}
        />

        {staff ? (
          <Txt variant="small" dim>
            Tik om af te tekenen. Houd een regel vast voor een notitie.
          </Txt>
        ) : (
          <Txt variant="small" dim>
            Je instructeur tekent de eisen af. Hier zie je hoe ver je bent.
          </Txt>
        )}

        <Card style={{ gap: 0 }}>
          {shown.map((r, i) => (
            <View key={r.requirement_id}>
              {i > 0 ? <Divider /> : null}
              <CheckRow
                number={r.position}
                title={r.title}
                detail={r.detail}
                checked={r.signed_at !== null}
                busy={pending[r.requirement_id]}
                disabled={!staff}
                onPress={() => void toggle(r)}
                onLongPress={() => (r.signed_at ? setNoteFor(r) : undefined)}
                signedLine={
                  r.signed_at
                    ? [
                        `Afgetekend ${formatDay(r.signed_at)}`,
                        r.signed_by_name ? `door ${r.signed_by_name}` : null,
                        r.note ? `— ${r.note}` : null,
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : null
                }
              />
            </View>
          ))}
        </Card>

        {staff ? (
          <ExamDates
            enrollment={e}
            onChanged={() => void enrollment.reload()}
            onDeleted={() => router.back()}
          />
        ) : null}
      </View>

      <NoteDialog
        row={noteFor}
        onClose={() => setNoteFor(null)}
        onSave={async (note) => {
          const row = noteFor;
          setNoteFor(null);
          if (!row) return;
          setFailure(null);
          try {
            // Saving a note re-signs the eis, so it lands on the name of
            // whoever wrote the note. That is the honest reading: the person
            // adding "nog een keer bij meer wind" is the one vouching for it.
            await setSignOff(id, row.requirement_id, true, note);
          } catch (e) {
            setFailure(e);
          }
          await sheet.reload();
        }}
        accent={t.accent}
      />
    </Screen>
  );
}

/**
 * The two dates that are not eisen: the landelijke theorie-examen and the day
 * the diploma was handed out. No date picker — a button for "vandaag" covers
 * almost every case, and the field underneath is there for the ones it does not.
 */
function ExamDates({
  enrollment,
  onChanged,
  onDeleted,
}: {
  enrollment: EnrollmentDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [theory, setTheory] = useState(enrollment.theory_passed_on ?? '');
  const [awarded, setAwarded] = useState(enrollment.awarded_on ?? '');

  async function save(patch: Parameters<typeof updateEnrollment>[1]) {
    setBusy(true);
    setError(null);
    try {
      await updateEnrollment(enrollment.id, patch);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Opleiding verwijderen?',
      `Alle aftekeningen van ${enrollment.member.full_name} voor ${enrollment.diploma.name} gaan mee. Dit kan niet terug.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteEnrollment(enrollment.id);
              onDeleted();
            } catch (e) {
              setError(e);
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Card style={{ gap: space.md }}>
      <Txt variant="subheading">Examens</Txt>

      <View style={{ gap: space.sm }}>
        <Field
          label="Theorie-examen gehaald op"
          value={theory}
          onChangeText={setTheory}
          placeholder="jjjj-mm-dd"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label="Vandaag"
              disabled={busy}
              onPress={() => {
                setTheory(today());
                void save({ theory_passed_on: today() });
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label="Opslaan"
              busy={busy}
              onPress={() => void save({ theory_passed_on: theory.trim() || null })}
            />
          </View>
        </Row>
      </View>

      <Divider />

      <View style={{ gap: space.sm }}>
        <Field
          label="Diploma uitgereikt op"
          value={awarded}
          onChangeText={setAwarded}
          placeholder="jjjj-mm-dd"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label="Vandaag"
              disabled={busy}
              onPress={() => {
                setAwarded(today());
                void save({ awarded_on: today() });
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              label="Opslaan"
              busy={busy}
              onPress={() => void save({ awarded_on: awarded.trim() || null })}
            />
          </View>
        </Row>
      </View>

      <ErrorNote error={error} />

      <Button variant="danger" label="Opleiding verwijderen" onPress={confirmDelete} />
    </Card>
  );
}

/**
 * A note on one aftekening. A plain RN Modal rather than Alert.prompt, which
 * only exists on iOS — this has to behave the same on both phones.
 */
function NoteDialog({
  row,
  onClose,
  onSave,
  accent,
}: {
  row: SheetRow | null;
  onClose: () => void;
  onSave: (note: string | null) => void | Promise<void>;
  accent: string;
}) {
  const t = useTheme();
  const [text, setText] = useState('');

  return (
    <Modal
      visible={row !== null}
      transparent
      animationType="fade"
      onShow={() => setText(row?.note ?? '')}
      onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: '#00000088',
          justifyContent: 'center',
          padding: space.lg,
        }}>
        <View
          style={{
            backgroundColor: t.card,
            borderRadius: radius.lg,
            padding: space.lg,
            gap: space.md,
            borderColor: accent,
            borderTopWidth: 3,
          }}>
          <Txt variant="subheading">{row?.title}</Txt>
          <Field
            label="Notitie bij deze aftekening"
            value={text}
            onChangeText={setText}
            placeholder="Bijvoorbeeld: nog een keer bij meer wind"
            multiline
            style={{ minHeight: 88, textAlignVertical: 'top' }}
          />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" label="Annuleren" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Bewaren" onPress={() => onSave(text.trim() || null)} />
            </View>
          </Row>
        </View>
      </View>
    </Modal>
  );
}
