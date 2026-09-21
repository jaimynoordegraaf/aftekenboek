import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Button,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorNote,
  LinkRow,
  Loading,
  Row,
  Screen,
  Segmented,
  Txt,
} from '@/components/ui';
import { fetchCrewDiplomas, fetchCrews, fetchDiploma } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/use-async';
import { KIND_LABEL, type RequirementKind } from '@/lib/types';
import { space } from '@/theme';

/**
 * Het overzicht op het water.
 *
 * Kies een bak, een diploma en een eis, en je ziet iedereen in die boot met
 * zijn stand op dat ene punt. Dat is hoe een vaaravond werkt: vijf vaarders,
 * één onderdeel — niet vijf aftekenlijsten na elkaar.
 *
 * De diploma's in de keuzelijst zijn alleen die waar iemand in deze bak mee
 * bezig is. Twaalf knoppen waarvan er tien niet gaan over wie er in de boot zit
 * helpen niemand.
 */
export default function Overzicht() {
  const router = useRouter();
  const groupId = useSession((s) => s.activeGroupId);

  const [crewId, setCrewId] = useState<string | null>(null);
  const [diplomaId, setDiplomaId] = useState<string | null>(null);
  const [kind, setKind] = useState<RequirementKind>('praktijk');

  const crews = useAsync(
    () => (groupId ? fetchCrews(groupId) : Promise.resolve([])),
    [groupId],
  );

  // Eén bak? Dan hoef je hem niet te kiezen.
  const crewList = crews.data ?? [];
  const activeCrew = crewId ?? (crewList.length === 1 ? crewList[0].id : null);

  const diplomas = useAsync(
    () => (activeCrew ? fetchCrewDiplomas(activeCrew) : Promise.resolve([])),
    [activeCrew],
  );
  const diplomaList = diplomas.data ?? [];
  const activeDiploma =
    diplomaId && diplomaList.some((d) => d.diploma_id === diplomaId)
      ? diplomaId
      : diplomaList.length === 1
        ? diplomaList[0].diploma_id
        : null;

  const detail = useAsync(
    () => (activeDiploma ? fetchDiploma(activeDiploma) : Promise.resolve(null)),
    [activeDiploma],
  );

  // Eisen met hun onderdelen eronder, want een knoop afstrepen voor de hele
  // bak is precies waar dit scherm voor is.
  const eisen = useMemo(() => {
    const all = (detail.data?.requirements ?? []).filter((r) => r.kind === kind);
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
  }, [detail.data, kind]);

  if (crews.loading) return <Loading />;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={crews.refreshing}
          onRefresh={() => {
            void crews.reload();
            void diplomas.reload();
          }}
        />
      }>
      <View style={{ gap: space.lg }}>
        <ErrorNote error={crews.error ?? diplomas.error ?? detail.error} />

        {crewList.length === 0 ? (
          <Empty
            title="Nog geen bakken"
            body="Maak een bak aan en deel de vaarders in die samen in een boot zitten. Daarna kies je hier een onderdeel en zie je iedereen in die boot."
          />
        ) : (
          <View style={{ gap: space.sm }}>
            <Txt variant="label" dim>
              Bak
            </Txt>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {crewList.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={activeCrew === c.id}
                  onPress={() => {
                    setCrewId(c.id);
                    setDiplomaId(null);
                  }}
                />
              ))}
            </Row>
          </View>
        )}

        {activeCrew ? (
          diplomas.loading ? (
            <Loading />
          ) : diplomaList.length === 0 ? (
            <Empty
              title="Niemand in deze bak is in opleiding"
              body="Start een opleiding voor een vaarder via Vaarders, dan verschijnt het diploma hier."
            />
          ) : (
            <View style={{ gap: space.sm }}>
              <Txt variant="label" dim>
                Diploma
              </Txt>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {diplomaList.map((d) => (
                  <Chip
                    key={d.diploma_id}
                    label={`${d.diploma_name} (${d.enrolled})`}
                    selected={activeDiploma === d.diploma_id}
                    onPress={() => setDiplomaId(d.diploma_id)}
                  />
                ))}
              </Row>
            </View>
          )
        ) : null}

        {activeCrew && activeDiploma ? (
          <View style={{ gap: space.md }}>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'praktijk', label: KIND_LABEL.praktijk },
                { value: 'theorie', label: KIND_LABEL.theorie },
              ]}
            />

            {detail.loading ? (
              <Loading />
            ) : (
              <Card style={{ paddingVertical: space.xs }}>
                {eisen.map(({ eis, parts }, i) => (
                  <View key={eis.id}>
                    {i > 0 ? <Divider /> : null}
                    <LinkRow
                      label={`${eis.position}. ${eis.title}`}
                      onPress={() => router.push(`/bak/${activeCrew}/${eis.id}`)}
                    />
                    {parts.map((p) => (
                      <View key={p.id} style={{ paddingLeft: space.xl }}>
                        <LinkRow
                          label={`${p.position}. ${p.title}`}
                          onPress={() => router.push(`/bak/${activeCrew}/${p.id}`)}
                        />
                      </View>
                    ))}
                  </View>
                ))}
              </Card>
            )}
          </View>
        ) : null}

        <Button
          variant="secondary"
          label="Bakken indelen"
          onPress={() => router.push('/bakken')}
        />
      </View>
    </Screen>
  );
}
