import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Button,
  Card,
  Divider,
  ErrorNote,
  Field,
  LinkRow,
  Loading,
  Screen,
  Segmented,
  Txt,
} from '@/components/ui';
import { copyListToGroup, createOwnList, fetchCatalogue } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { ListKind } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { space } from '@/theme';

/**
 * Een eigen lijst beginnen: een insigne, of de verkorte eisen van een kamp.
 *
 * Twee wegen, omdat de praktijk er twee heeft. Het bemanningslid-insigne lijkt
 * nergens op en begint leeg. "De vlet, maar korter" is een kopie van een
 * landelijk diploma waar je daarna uit schrapt — overtypen zou tientallen eisen
 * kosten en fouten opleveren.
 */
export default function NieuweEigenLijst() {
  const router = useRouter();
  const groupId = useSession((s) => s.activeGroupId);
  const { data: catalogus, loading } = useAsync(fetchCatalogue, []);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('diploma');
  const [start, setStart] = useState<'leeg' | 'kopie'>('leeg');
  const [source, setSource] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const klaar = name.trim().length >= 2 && (start === 'leeg' || source !== null);

  async function save() {
    if (!groupId || !klaar) return;
    setBusy(true);
    setError(null);
    try {
      const id =
        start === 'kopie' && source
          ? await copyListToGroup(groupId, source.id, name, kind)
          : await createOwnList(groupId, name, kind);
      router.replace(`/diploma/${id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="title">Eigen lijst</Txt>
          <Txt dim>
            Een lijst van onze groep, naast de landelijke eisen. Alleen wij zien
            hem, en het opnieuw laden van de landelijke eisen raakt hem niet.
          </Txt>
        </View>

        <Field
          label="Naam"
          value={name}
          onChangeText={setName}
          autoCapitalize="sentences"
          autoFocus
          placeholder="Bijvoorbeeld: Bemanningslid"
        />

        <View style={{ gap: space.sm }}>
          <Txt variant="small" dim>
            Wat is het?
          </Txt>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'diploma', label: 'Diploma' },
              { value: 'insigne', label: 'Insigne' },
            ]}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <Txt variant="small" dim>
            Hoe begin je?
          </Txt>
          <Segmented
            value={start}
            onChange={setStart}
            options={[
              { value: 'leeg', label: 'Leeg' },
              { value: 'kopie', label: 'Kopie' },
            ]}
          />
          <Txt variant="small" dim>
            {start === 'leeg'
              ? 'Je voegt de eisen daarna zelf toe.'
              : 'Neem een bestaande lijst over en schrap eruit wat jullie niet doen. Het origineel blijft ongemoeid.'}
          </Txt>
        </View>

        {start === 'kopie' ? (
          loading ? (
            <Loading />
          ) : (
            <View style={{ gap: space.sm }}>
              {(catalogus ?? []).map((groep) => (
                <View key={groep.id} style={{ gap: space.xs }}>
                  <Txt variant="small" dim>
                    {groep.name}
                  </Txt>
                  <Card style={{ paddingVertical: space.xs }}>
                    {groep.diplomas.map((dip, i) => (
                      <View key={dip.id}>
                        {i > 0 ? <Divider /> : null}
                        <LinkRow
                          label={dip.name}
                          detail={source?.id === dip.id ? 'Gekozen' : (dip.level_label ?? undefined)}
                          onPress={() => {
                            setSource({ id: dip.id, name: dip.name });
                            if (name.trim() === '') setName(`${dip.name} (kort)`);
                          }}
                        />
                      </View>
                    ))}
                  </Card>
                </View>
              ))}
            </View>
          )
        ) : null}

        <ErrorNote error={error} />

        <Button label="Maken" onPress={save} busy={busy} disabled={!klaar} />
        <Button variant="secondary" label="Annuleren" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
