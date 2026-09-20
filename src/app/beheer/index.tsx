import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card, Divider, LinkRow, Screen, Txt } from '@/components/ui';
import { useActiveGroup } from '@/lib/session';
import { space } from '@/theme';

export default function Beheer() {
  const router = useRouter();
  const group = useActiveGroup();

  return (
    <Screen>
      <View style={{ gap: space.lg }}>
        <Txt variant="title">{group?.name}</Txt>

        <Card style={{ paddingVertical: space.xs }}>
          <LinkRow label="Rollen" onPress={() => router.push('/beheer/leden')} />
          <Divider />
          <LinkRow label="Speltakken" onPress={() => router.push('/beheer/speltakken')} />
          <Divider />
          <LinkRow
            label="Uitnodigingen"
            onPress={() => router.push('/beheer/uitnodigingen')}
          />
        </Card>

        <Txt variant="small" dim>
          Alleen instructeurs en beheerders kunnen aftekenen. Wie je hier
          instructeur maakt, kan vanaf dat moment de voortgang van iedereen in de
          groep zien en wijzigen.
        </Txt>
      </View>
    </Screen>
  );
}
