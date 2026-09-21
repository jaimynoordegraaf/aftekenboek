import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import {
  Button,
  Card,
  Divider,
  Empty,
  ErrorNote,
  Loading,
  Screen,
  StatusPicker,
  Txt,
} from '@/components/ui';
import {
  fetchCrew,
  fetchCrewSheet,
  fetchRequirement,
  setSignOffStatus,
} from '@/lib/api';
import { formatDay } from '@/lib/dates';
import { useAsync } from '@/lib/use-async';
import { useTheme } from '@/lib/use-theme';
import type { CrewSheetRow, SignOffStatus } from '@/lib/types';
import { space } from '@/theme';

/**
 * Eén bak, één eis: iedereen in de boot met zijn stand.
 *
 * Elke tik gaat eerst op het scherm en daarna naar de server, net als op de
 * aftekenlijst — met één streepje bereik midden op het meer moet je vijf
 * mensen kunnen bijwerken zonder vijf keer te wachten. Gaat het mis, dan
 * springt die ene persoon terug en staat de fout erboven.
 */
export default function BakOverzicht() {
  const { crew, req } = useLocalSearchParams<{ crew: string; req: string }>();
  const router = useRouter();
  const t = useTheme();

  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [failure, setFailure] = useState<unknown>(null);

  const crewInfo = useAsync(() => fetchCrew(crew), [crew]);
  const requirement = useAsync(() => fetchRequirement(req), [req]);
  const sheet = useAsync(() => fetchCrewSheet(crew, req), [crew, req]);

  async function change(row: CrewSheetRow, next: SignOffStatus | null) {
    if (!row.enrollment_id) return;

    sheet.patch(
      (sheet.data ?? []).map((r) =>
        r.profile_id === row.profile_id
          ? {
              ...r,
              status: next,
              signed_at: next ? new Date().toISOString() : null,
              signed_by_name: next ? 'jij' : null,
            }
          : r,
      ),
    );
    setPending((p) => ({ ...p, [row.profile_id]: true }));
    setFailure(null);

    try {
      await setSignOffStatus(row.enrollment_id, req, next);
      await sheet.reload();
    } catch (e) {
      setFailure(e);
      await sheet.reload();
    } finally {
      setPending((p) => {
        const { [row.profile_id]: _gone, ...rest } = p;
        return rest;
      });
    }
  }

  if (sheet.loading || requirement.loading) return <Loading />;

  const rows = sheet.data ?? [];
  const enrolled = rows.filter((r) => r.enrollment_id);
  const outside = rows.filter((r) => !r.enrollment_id);
  const gehaald = enrolled.filter((r) => r.status === 'gehaald').length;
  const onderweg = enrolled.filter((r) => r.status === 'behandeld').length;
  const eis = requirement.data;

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={sheet.refreshing} onRefresh={sheet.reload} />
      }>
      <Stack.Screen options={{ title: crewInfo.data?.name ?? 'Bak' }} />

      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="small" dim>
            {crewInfo.data?.name}
          </Txt>
          <Txt variant="title">{eis ? `${eis.position}. ${eis.title}` : ''}</Txt>
          {eis?.detail ? <Txt dim>{eis.detail}</Txt> : null}
        </View>

        {enrolled.length > 0 ? (
          <Txt variant="small" dim>
            {gehaald} van {enrolled.length} gehaald
            {onderweg ? ` · ${onderweg} onderweg` : ''}
          </Txt>
        ) : null}

        <ErrorNote error={failure ?? sheet.error} />

        {rows.length === 0 ? (
          <Empty
            title="Deze bak is leeg"
            body="Deel eerst vaarders in via Bakken indelen."
          />
        ) : null}

        {enrolled.length > 0 ? (
          <Card style={{ gap: 0 }}>
            {enrolled.map((r, i) => (
              <View key={r.profile_id}>
                {i > 0 ? <Divider /> : null}
                <View style={{ paddingVertical: space.md, gap: space.sm }}>
                  <View style={{ gap: 2 }}>
                    <Txt variant="subheading">
                      {r.full_name || 'Naam nog niet ingevuld'}
                    </Txt>
                    {r.signed_at ? (
                      <Txt
                        variant="small"
                        color={r.status === 'behandeld' ? t.warn : t.good}>
                        {r.status === 'behandeld' ? 'Onderweg sinds' : 'Gehaald'}{' '}
                        {formatDay(r.signed_at)}
                        {r.signed_by_name ? ` door ${r.signed_by_name}` : ''}
                        {r.note ? ` — ${r.note}` : ''}
                      </Txt>
                    ) : null}
                  </View>
                  <StatusPicker
                    value={r.status ?? null}
                    busy={pending[r.profile_id]}
                    onChange={(next) => void change(r, next)}
                  />
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Wie in de bak zit maar niet voor dit diploma is ingeschreven. Liever
            zichtbaar met een knop dan stil weggelaten: "waarom staat Piet er
            niet bij" is een vraag die je op het water niet wilt krijgen. */}
        {outside.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Txt variant="label" dim>
              Niet ingeschreven voor dit diploma
            </Txt>
            <Card style={{ gap: 0, paddingVertical: space.xs }}>
              {outside.map((r, i) => (
                <View key={r.profile_id}>
                  {i > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: space.sm,
                      gap: space.md,
                    }}>
                    <Txt dim style={{ flex: 1 }}>
                      {r.full_name || 'Naam nog niet ingevuld'}
                    </Txt>
                    <Button
                      variant="ghost"
                      label="Opleiding starten"
                      onPress={() => router.push(`/nieuw/opleiding?lid=${r.profile_id}`)}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
