import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Card,
  Divider,
  ErrorNote,
  LinkRow,
  Loading,
  Screen,
  Txt,
} from '@/components/ui';
import { fetchCatalogue } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { space } from '@/theme';

/**
 * The diploma's themselves, with their eisen. Open to everyone, on purpose: a
 * lid who wants to know what Roeien III vraagt should not have to ask.
 */
export default function Diplomas() {
  const router = useRouter();
  const { data, loading, refreshing, error, reload } = useAsync(fetchCatalogue, []);

  if (loading) return <Loading />;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
      <View style={{ gap: space.lg }}>
        <ErrorNote error={error} />

        <Txt variant="small" dim>
          De eisen zijn landelijk vastgesteld door de Watersport Academy en voor
          iedere groep gelijk.
        </Txt>

        {(data ?? []).map((d) => (
          <View key={d.id} style={{ gap: space.sm }}>
            <View>
              <Txt variant="heading">{d.name}</Txt>
              {d.subtitle ? (
                <Txt variant="small" dim>
                  {d.subtitle}
                </Txt>
              ) : null}
            </View>

            <Card style={{ paddingVertical: space.xs }}>
              {d.diplomas.map((dip, i) => (
                <View key={dip.id}>
                  {i > 0 ? <Divider /> : null}
                  <LinkRow
                    label={dip.name}
                    detail={dip.level_label ?? undefined}
                    onPress={() => router.push(`/diploma/${dip.id}`)}
                  />
                </View>
              ))}
            </Card>
          </View>
        ))}
      </View>
    </Screen>
  );
}
