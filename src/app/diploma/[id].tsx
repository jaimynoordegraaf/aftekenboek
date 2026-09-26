import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Button,
  Card,
  Disclosure,
  Divider,
  ErrorNote,
  Field,
  Loading,
  Row,
  Screen,
  Segmented,
  Txt,
} from '@/components/ui';
import {
  addOwnRequirement,
  deleteOwnList,
  deleteOwnRequirement,
  fetchDiploma,
  setOwnRequirementOrder,
  updateOwnRequirement,
} from '@/lib/api';
import { useIsStaff } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { KIND_LABEL, type Requirement, type RequirementKind } from '@/lib/types';
import { radius, space } from '@/theme';
import { useTheme } from '@/lib/use-theme';

/**
 * One diploma, straight from the handboek: wat je moet kunnen en wat je moet weten.
 *
 * Is het een eigen lijst van de groep — een insigne, of de verkorte eisen van
 * een kamp — dan is hetzelfde scherm ook de plek waar je hem bijwerkt. De
 * landelijke lijsten blijven kijken: daar zit geen knop, en de database zou een
 * wijziging toch weigeren.
 */
export default function DiplomaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useIsStaff();
  const [kind, setKind] = useState<RequirementKind>('praktijk');

  const { data, loading, error, reload } = useAsync(() => fetchDiploma(id), [id]);

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [bewerken, setBewerken] = useState(false);
  const [dialoog, setDialoog] = useState<Bewerking | null>(null);
  const [busy, setBusy] = useState(false);
  const [schrijffout, setSchrijffout] = useState<unknown>(null);

  /** Eisen van deze soort, elk met de onderdelen die eronder hangen. */
  const shown = useMemo(() => {
    const all = (data?.requirements ?? []).filter((r) => r.kind === kind);
    const parts = new Map<string, typeof all>();
    for (const r of all) {
      if (!r.parent_id) continue;
      const list = parts.get(r.parent_id);
      if (list) list.push(r);
      else parts.set(r.parent_id, [r]);
    }
    return all
      .filter((r) => !r.parent_id)
      .map((eis) => ({ eis, parts: parts.get(eis.id) ?? [] }));
  }, [data, kind]);

  if (loading) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <ErrorNote error={error ?? new Error('Dit diploma kennen we niet.')} />
      </Screen>
    );
  }

  const { diploma, discipline, requirements } = data;
  const eigen = !!diploma.group_id && staff;
  // De eisen zelf; onderdelen tellen niet mee in wat een diploma vraagt.
  const counts = {
    praktijk: requirements.filter((r) => r.kind === 'praktijk' && !r.parent_id).length,
    theorie: requirements.filter((r) => r.kind === 'theorie' && !r.parent_id).length,
  };

  async function schrijf(actie: () => Promise<unknown>) {
    setBusy(true);
    setSchrijffout(null);
    try {
      await actie();
      await reload();
      setDialoog(null);
    } catch (e) {
      setSchrijffout(e);
    } finally {
      setBusy(false);
    }
  }

  function verwijder(r: Requirement, watIsHet: string) {
    Alert.alert(`${watIsHet} weghalen?`, r.title, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Weghalen',
        style: 'destructive',
        onPress: () => void schrijf(() => deleteOwnRequirement(r.id)),
      },
    ]);
  }

  /** Eén plek op of neer, door de hele volgorde opnieuw door te geven. */
  function verplaats(eisId: string, richting: -1 | 1) {
    const ids = shown.map(({ eis }) => eis.id);
    const i = ids.indexOf(eisId);
    const j = i + richting;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void schrijf(() => setOwnRequirementOrder(diploma.id, kind, null, ids));
  }

  function verwijderLijst() {
    Alert.alert(
      'Deze lijst weghalen?',
      `${diploma.name} verdwijnt met al zijn eisen. Dit kun je niet ongedaan maken.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Weghalen',
          style: 'destructive',
          onPress: () =>
            void schrijf(async () => {
              await deleteOwnList(diploma.id);
              router.back();
            }),
        },
      ],
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: diploma.name }} />
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="small" dim>
            {discipline?.name ?? (diploma.kind === 'insigne' ? 'Eigen insigne' : 'Eigen lijst')}
          </Txt>
          <Txt variant="title">{diploma.name}</Txt>
          {diploma.summary ? <Txt dim>{diploma.summary}</Txt> : null}
        </View>

        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'praktijk', label: `${KIND_LABEL.praktijk} (${counts.praktijk})` },
            { value: 'theorie', label: `${KIND_LABEL.theorie} (${counts.theorie})` },
          ]}
        />

        <ErrorNote error={schrijffout} />

        <Card style={{ gap: 0 }}>
          {shown.length === 0 ? (
            <Txt dim style={{ paddingVertical: space.md }}>
              Nog geen {KIND_LABEL[kind].toLowerCase()}eisen.
            </Txt>
          ) : null}
          {shown.map(({ eis, parts }, i) => {
            const isOpen = open[eis.id] ?? false;
            return (
              <View key={eis.id}>
                {i > 0 ? <Divider /> : null}
                <View style={{ paddingVertical: space.md, gap: 2 }}>
                  <Txt>
                    <Txt dim>{eis.position}. </Txt>
                    {eis.title}
                  </Txt>
                  {eis.detail ? (
                    <Txt variant="small" dim>
                      {eis.detail}
                    </Txt>
                  ) : null}

                  {eigen && bewerken ? (
                    <Row gap={space.md} style={{ paddingTop: space.xs, flexWrap: 'wrap' }}>
                      <KleineKnop label="Omhoog" onPress={() => verplaats(eis.id, -1)} />
                      <KleineKnop label="Omlaag" onPress={() => verplaats(eis.id, 1)} />
                      <KleineKnop
                        label="Wijzigen"
                        onPress={() => setDialoog({ soort: 'wijzig', eis })}
                      />
                      <KleineKnop
                        label="Onderdeel"
                        onPress={() => setDialoog({ soort: 'onderdeel', eis })}
                      />
                      <KleineKnop label="Weghalen" danger onPress={() => verwijder(eis, 'Eis')} />
                    </Row>
                  ) : null}
                </View>

                {parts.length > 0 ? (
                  <View style={{ paddingLeft: 0, paddingBottom: space.sm }}>
                    <Disclosure
                      open={isOpen}
                      label={`${parts.length} onderdelen`}
                      onToggle={() => setOpen((o) => ({ ...o, [eis.id]: !isOpen }))}
                    />
                    {isOpen
                      ? parts.map((p) => (
                          <View
                            key={p.id}
                            style={{ paddingLeft: 38, paddingBottom: space.xs, gap: 2 }}>
                            <Txt variant="small" dim>
                              {p.position}. {p.title}
                            </Txt>
                            {eigen && bewerken ? (
                              <Row gap={space.md}>
                                <KleineKnop
                                  label="Wijzigen"
                                  onPress={() => setDialoog({ soort: 'wijzig', eis: p })}
                                />
                                <KleineKnop
                                  label="Weghalen"
                                  danger
                                  onPress={() => verwijder(p, 'Onderdeel')}
                                />
                              </Row>
                            ) : null}
                          </View>
                        ))
                      : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        {eigen ? (
          <View style={{ gap: space.sm }}>
            {bewerken ? (
              <>
                <Button
                  label={`${KIND_LABEL[kind]}eis toevoegen`}
                  onPress={() => setDialoog({ soort: 'nieuw' })}
                />
                <Button variant="secondary" label="Klaar met aanpassen" onPress={() => setBewerken(false)} />
                <Button variant="danger" label="Lijst weghalen" onPress={verwijderLijst} />
              </>
            ) : (
              <Button variant="secondary" label="Lijst aanpassen" onPress={() => setBewerken(true)} />
            )}
          </View>
        ) : null}

        <View style={{ gap: space.xs }}>
          {!diploma.group_id ? (
            <Txt variant="small" dim>
              Een theorie-examen blijft {diploma.theory_valid_months} maanden geldig.
            </Txt>
          ) : (
            <Txt variant="small" dim>
              Eigen lijst van onze groep. Andere groepen zien hem niet.
            </Txt>
          )}
          {diploma.source ? (
            <Txt variant="small" dim>
              Bron: {diploma.source}
            </Txt>
          ) : null}
        </View>
      </View>

      <EisDialoog
        bewerking={dialoog}
        busy={busy}
        onClose={() => setDialoog(null)}
        onSave={(titel, toelichting) => {
          if (!dialoog) return;
          if (dialoog.soort === 'wijzig') {
            void schrijf(() => updateOwnRequirement(dialoog.eis.id, titel, toelichting ?? undefined));
          } else {
            void schrijf(() =>
              addOwnRequirement(
                diploma.id,
                kind,
                titel,
                toelichting ?? undefined,
                dialoog.soort === 'onderdeel' ? dialoog.eis.id : undefined,
              ),
            );
          }
        }}
      />
    </Screen>
  );
}

type Bewerking =
  | { soort: 'nieuw' }
  | { soort: 'onderdeel'; eis: Requirement }
  | { soort: 'wijzig'; eis: Requirement };

/** Een woord om op te tikken; de rijen hebben al genoeg knoppen. */
function KleineKnop({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      {({ pressed }) => (
        <Txt
          variant="small"
          style={{ color: danger ? t.danger : t.accentText, opacity: pressed ? 0.6 : 1 }}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

/**
 * Een eis toevoegen of bijwerken. Een gewone Modal en geen Alert.prompt, want
 * die bestaat alleen op iOS — dit moet op beide telefoons hetzelfde doen.
 */
function EisDialoog({
  bewerking,
  busy,
  onClose,
  onSave,
}: {
  bewerking: Bewerking | null;
  busy: boolean;
  onClose: () => void;
  onSave: (titel: string, toelichting: string | null) => void;
}) {
  const t = useTheme();
  const [titel, setTitel] = useState('');
  const [toelichting, setToelichting] = useState('');

  const kop =
    bewerking?.soort === 'wijzig'
      ? 'Aanpassen'
      : bewerking?.soort === 'onderdeel'
        ? `Onderdeel van "${bewerking.eis.title}"`
        : 'Nieuwe eis';

  return (
    <Modal
      visible={bewerking !== null}
      transparent
      animationType="fade"
      onShow={() => {
        setTitel(bewerking?.soort === 'wijzig' ? bewerking.eis.title : '');
        setToelichting(bewerking?.soort === 'wijzig' ? (bewerking.eis.detail ?? '') : '');
      }}
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
          }}>
          <Txt variant="subheading">{kop}</Txt>
          <Field
            label="Wat moet hij kunnen of weten?"
            value={titel}
            onChangeText={setTitel}
            autoCapitalize="sentences"
            placeholder="Bijvoorbeeld: Van wal steken"
          />
          <Field
            label="Toelichting (mag leeg)"
            value={toelichting}
            onChangeText={setToelichting}
            multiline
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" label="Annuleren" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Bewaren"
                busy={busy}
                disabled={titel.trim().length < 2}
                onPress={() => onSave(titel.trim(), toelichting.trim() || null)}
              />
            </View>
          </Row>
        </View>
      </View>
    </Modal>
  );
}
