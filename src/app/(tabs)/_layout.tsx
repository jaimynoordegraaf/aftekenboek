import { Tabs } from 'expo-router';

import { AnchorIcon, BoatIcon, BookIcon, MoreIcon, PeopleIcon } from '@/components/icons';
import { useIsStaff } from '@/lib/session';
import { useTheme } from '@/lib/use-theme';

export default function TabsLayout() {
  const t = useTheme();
  const staff = useIsStaff();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.background },
        headerTintColor: t.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.background },
        tabBarActiveTintColor: t.accentText,
        tabBarInactiveTintColor: t.textDim,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
      }}>
      {/*
        The first tab is whatever that person opens the app for. An instructeur
        on a vaaravond wants the lijst met vaarders; a lid wants their own
        voortgang. Same route, so "/" is always somewhere sensible.
      */}
      <Tabs.Screen
        name="index"
        options={{
          title: staff ? 'Vaarders' : 'Voortgang',
          tabBarIcon: ({ color, focused }) =>
            staff ? (
              <PeopleIcon color={color} strokeWidth={focused ? 2.2 : 1.8} />
            ) : (
              <AnchorIcon color={color} strokeWidth={focused ? 2.2 : 1.8} />
            ),
        }}
      />
      <Tabs.Screen
        name="overzicht"
        options={{
          title: 'Op het water',
          // Alleen voor wie aftekent: een lid heeft niets aan een bak-overzicht.
          href: staff ? '/overzicht' : null,
          tabBarIcon: ({ color, focused }) => (
            <BoatIcon color={color} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="mij"
        options={{
          title: 'Mijn diploma’s',
          // A lid already has their own voortgang on the first tab.
          href: staff ? '/mij' : null,
          tabBarIcon: ({ color, focused }) => (
            <AnchorIcon color={color} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="diplomas"
        options={{
          title: 'Diploma’s',
          tabBarIcon: ({ color, focused }) => (
            <BookIcon color={color} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="meer"
        options={{
          title: 'Meer',
          tabBarIcon: ({ color, focused }) => (
            <MoreIcon color={color} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
