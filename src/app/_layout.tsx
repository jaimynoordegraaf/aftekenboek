import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading, Txt } from '@/components/ui';
import { useSession } from '@/lib/session';
import { isConfigured } from '@/lib/supabase';
import { useTheme } from '@/lib/use-theme';

export default function RootLayout() {
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Gate />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Decides which of the three worlds the app is in: signed out, signed in but
 * not in a groep yet, or in. Keeping it in one place means no screen has to
 * defend itself against a missing session.
 */
function Gate() {
  const t = useTheme();
  const router = useRouter();
  const segments = useSegments();

  const ready = useSession((s) => s.ready);
  const userId = useSession((s) => s.userId);
  const hasGroup = useSession((s) => s.memberships.length > 0);

  const first = segments[0];
  const inAuth = first === 'sign-in';
  const inOnboarding = first === 'welkom';

  useEffect(() => {
    if (!ready) return;

    if (!userId) {
      if (!inAuth) router.replace('/sign-in');
    } else if (!hasGroup) {
      if (!inOnboarding) router.replace('/welkom');
    } else if (inAuth || inOnboarding) {
      router.replace('/');
    }
  }, [ready, userId, hasGroup, inAuth, inOnboarding, router]);

  if (!isConfigured) return <NotConfigured />;
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: t.background, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.background },
          headerTintColor: t.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="welkom" options={{ headerShown: false }} />
        <Stack.Screen name="profiel" options={{ title: 'Mijn gegevens' }} />
        <Stack.Screen name="lid/[id]" options={{ title: 'Vaarder' }} />
        <Stack.Screen name="voortgang/[id]" options={{ title: 'Aftekenlijst' }} />
        <Stack.Screen name="diploma/[id]" options={{ title: 'Diploma' }} />
        <Stack.Screen
          name="nieuw/opleiding"
          options={{ title: 'Opleiding starten', presentation: 'modal' }}
        />
        <Stack.Screen name="beheer/index" options={{ title: 'Beheer' }} />
        <Stack.Screen name="beheer/leden" options={{ title: 'Rollen' }} />
        <Stack.Screen name="beheer/speltakken" options={{ title: 'Speltakken' }} />
        <Stack.Screen name="beheer/uitnodigingen" options={{ title: 'Uitnodigingen' }} />
      </Stack>
    </>
  );
}

function NotConfigured() {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.background,
        padding: 24,
        gap: 12,
        justifyContent: 'center',
      }}>
      <Txt variant="heading">Nog niet gekoppeld</Txt>
      <Txt dim>
        Er is nog geen server ingesteld. Zet EXPO_PUBLIC_SUPABASE_URL en
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in een .env in de projectmap en start
        de app opnieuw. De stappen staan in supabase/README.md.
      </Txt>
    </View>
  );
}
