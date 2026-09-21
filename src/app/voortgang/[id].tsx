import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Button,
  Card,
  CheckRow,
  Disclosure,
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
  setSignOffStatus,
  updateEnrollment,
  type EnrollmentDetail,
} from '@/lib/api';
import { formatDay, today } from '@/lib/dates';
import { useIsStaff } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { useTheme } from '@/lib/use-theme';
import {
  KIND_LABEL,
  statusOf,
  type RequirementKind,
  type SheetRow,
  type SignOffStatus,
} from '@/lib/types';
import { radius, space } from '@/theme';

/**
 * The aftekenlijst — the screen the app exists for.
 *
 * Tapping a regel moves it to the next stand (niet, onderweg, gehaald). It is
 * applied on screen first and sent after,
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
  // Dichtgeklapt beginnen: negen eisen met al hun onderdelen open is een
  // scherm waar je doorheen moet scrollen om te zien waar je bent.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const enrollment = useAsync(() => fetchEnrollment(id), [id]);
  const sheet = useAsync(() => fetchSheet(id), [id]);

  const rows = sheet.data ?? [];

  /**
   * De lijst komt plat binnen: eisen en hun onderdelen door elkaar, maar wel
   * in volgorde. Hier wordt er één laag van gemaakt, want dat is wat het
   * scherm toont — dieper gaat het niet, en dat bewaakt de database.
   */
  const tree = useMemo(() => {
    const parts = new Map<string, SheetRow[]>();
    for (const r of rows) {
      // Geen `=== null`: een database waar 012-onderdelen.sql nog niet op
      // gedraaid heeft stuurt het veld helemaal niet mee, en dan is het
      // undefined. Met een strenge vergelijking zou de hele lijst leeg blijven
      // en zou er "0 van 0" staan zonder dat iets zegt waarom.
      if (!r.parent_id || r.kind !== kind) continue;
      const list = parts.get(r.parent_id);
      if (list) list.push(r);
      else parts.set(r.parent_id, [r]);
    }
    return rows
      .filter((r) => !r.parent_id && r.kind === kind)
      .map((eis) => ({ eis, parts: parts.get(eis.requirement_id) ?? [] }));
  }, [rows, kind]);

  // Alleen de eisen tellen; onderdelen zijn een hulpmiddel, geen eis. Dezelfde
  // afspraak als in member_enrollments, anders spreken de balken elkaar tegen.
  // Alleen gehaald telt, net als in de database. "Onderweg" is zichtbaar maar
  // geen halve aftekening.
  const counts = useMemo(() => {
    const per = (k: RequirementKind) => {
      const all = rows.filter((r) => r.kind === k && !r.parent_id);
      return {
        done: all.filter((r) => statusOf(r) === 'gehaald').length,
        total: all.length,
      };
    };
    return { praktijk: per('praktijk'), theorie: per('theorie') };
  }, [rows]);

  /**
   * Tikken loopt door de drie standen: niet → onderweg → gehaald → niet.
   * In het overzicht van een bak kies je de stand direct; hier, in een lijst
   * van tientallen eisen, zouden drie knoppen per regel de lijst onleesbaar
   * maken.
   */
  const toggle = useCallback(
    async (row: SheetRow) => {
      if (!staff) return;
      const current = statusOf(row);
      const next: SignOffStatus | null =
        current === null ? 'behandeld' : current === 'behandeld' ? 'gehaald' : null;

      // Optimistic: paint it, then send it.
      sheet.patch(
        rows.map((r) =>
          r.requirement_id === row.requirement_id
            ? {
                ...r,
                status: next,
                signed_at: next ? new Date().toISOString() : null,
                signed_by_name: next ? 'jij' : null,
                note: next ? r.note : null,
              }
            : r,
        ),
      );
      setPending((p) => ({ ...p, [row.requirement_id]: true }));
      setFailure(null);

      try {
        await setSignOffStatus(id, row.requirement_id, next);
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
            Tik om de stand te wisselen: niet, onderweg, gehaald. Houd een regel
            vast voor een notitie.
          </Txt>
        ) : (
          <Txt variant="small" dim>
            Je instructeur tekent de eisen af. Hier zie je hoe ver je bent.
          </Txt>
        )}

        <Card style={{ gap: 0 }}>
          {tree.map(({ eis, parts }, i) => {
            const partsDone = parts.filter((p) => statusOf(p) === 'gehaald').length;
            const isOpen = open[eis.requirement_id] ?? false;

            return (
              <View key={eis.requirement_id}>
                {i > 0 ? <Divider /> : null}
                <CheckRow
                  number={eis.position}
                  title={eis.title}
                  detail={eis.detail}
                  checked={statusOf(eis) === 'gehaald'}
                  partial={statusOf(eis) === 'behandeld'}
                  busy={pending[eis.requirement_id]}
                  disabled={!staff}
                  onPress={() => void toggle(eis)}
                  onLongPress={() => (eis.signed_at ? setNoteFor(eis) : undefined)}
                  signedLine={signedLine(eis)}
                />

                {parts.length > 0 ? (
                  <>
                    <Disclosure
                      open={isOpen}
                      done={partsDone === parts.length}
                      label={`${partsDone} van ${parts.length} onderdelen`}
                      onToggle={() =>
                        setOpen((o) => ({
                          ...o,
                          [eis.requirement_id]: !isOpen,
                        }))
                      }
                    />
                    {isOpen ? (
                      <View style={{ paddingLeft: 38, paddingBottom: space.sm }}>
                        {parts.map((p) => (
                          <CheckRow
                            key={p.requirement_id}
                            number={p.position}
                            title={p.title}
                            checked={statusOf(p) === 'gehaald'}
                            partial={statusOf(p) === 'behandeld'}
                            busy={pending[p.requirement_id]}
                            disabled={!staff}
                            onPress={() => void toggle(p)}
                            onLongPress={() =>
                              p.signed_at ? setNoteFor(p) : undefined
                            }
                            signedLine={signedLine(p)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            );
          })}
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
            await setSignOffStatus(id, row.requirement_id, statusOf(row) ?? 'gehaald', note ?? '');
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

/** "Afgetekend gisteren door Wim de Vries — nog een keer bij meer wind" */
function signedLine(r: SheetRow): string | null {
  if (!r.signed_at) return null;
  return [
    `${statusOf(r) === 'behandeld' ? 'Onderweg sinds' : 'Gehaald'} ${formatDay(r.signed_at)}`,
    r.signed_by_name ? `door ${r.signed_by_name}` : null,
    r.note ? `— ${r.note}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}
