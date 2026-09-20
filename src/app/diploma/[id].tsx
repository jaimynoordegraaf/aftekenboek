import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import {
  Card,
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

  const shown = useMemo(
    () => (data?.requirements ?? []).filter((r) => r.kind === kind),
    [data, kind],
  );

  if (loading) return <Loading />;
  if (!data) {
    return (
      <Screen>
        <ErrorNote error={error ?? new Error('Dit diploma kennen we niet.')} />
      </Screen>
    );
  }

  const { diploma, discipline, requirements } = data;
  const counts = {
    praktijk: requirements.filter((r) => r.kind === 'praktijk').length,
    theorie: requirements.filter((r) => r.kind === 'theorie').length,
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
          {shown.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: space.md, gap: 2 }}>
                <Txt>
                  <Txt dim>{r.position}. </Txt>
                  {r.title}
                </Txt>
                {r.detail ? (
                  <Txt variant="small" dim>
                    {r.detail}
                  </Txt>
                ) : null}
              </View>
            </View>
          ))}
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
