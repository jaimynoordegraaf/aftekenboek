import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { makeTheme, type Theme } from '@/theme';
import { useActiveGroup } from './session';

/**
 * The theme for the groep currently being viewed. Switching groep repaints the
 * app in that groep's colour, which is what "de app past bij jouw groep" means
 * in practice.
 */
export function useTheme(): Theme {
  const accent = useActiveGroup()?.accent_color;
  const scheme = useColorScheme();
  return useMemo(() => makeTheme(accent, scheme === 'dark'), [accent, scheme]);
}

export type { Theme };
