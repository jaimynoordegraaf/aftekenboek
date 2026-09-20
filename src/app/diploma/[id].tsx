import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import {
  Card,
  Disclosure,
  Divider,
  ErrorNote,
  Loading,
  Screen,
  Segmented,
  Txt,
} from '@/components/ui';
import { fetchDiploma } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { KIND_LABEL, type RequirementKind } from '@/lib/types';
import { space } from '@/theme';

/** One diploma, straight from the handboek: wat je moet kunnen en wat je moet weten. */
export default function DiplomaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [kind, setKind] = useState<RequirementKind>('praktijk');

  const { data, loading, error } = useAsync(() => fetchDiploma(id), [id]);

  const [open, setOpen] = useState<Record<string, boolean>>({});

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
  // De eisen zelf; onderdelen tellen niet mee in wat een diploma vraagt.
  const counts = {
    praktijk: requirements.filter((r) => r.kind === 'praktijk' && !r.parent_id).length,
    theorie: requirements.filter((r) => r.kind === 'theorie' && !r.parent_id).length,
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: diploma.name }} />
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="small" dim>
            {discipline.name}
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

        <Card style={{ gap: 0 }}>
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
                          <Txt
                            key={p.id}
                            variant="small"
                            dim
                            style={{ paddingLeft: 38, paddingBottom: space.xs }}>
                            {p.position}. {p.title}
                          </Txt>
                        ))
                      : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        <View style={{ gap: space.xs }}>
          <Txt variant="small" dim>
            Een theorie-examen blijft {diploma.theory_valid_months} maanden geldig.
          </Txt>
          {diploma.source ? (
            <Txt variant="small" dim>
              Bron: {diploma.source}
            </Txt>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
