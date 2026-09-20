/**
 * The app's colours and type scale.
 *
 * A Scoutinggroep picks its own accent colour, so the accent is not a constant
 * — it arrives from the database and can be anything. That is exactly how an
 * app ends up with white text on a bright green button at 2.4:1. So the label
 * colour on an accent surface is never assumed: `onAccent` is computed from the
 * accent's own luminance, and the accent is deepened before it is used as small
 * text on a pale background.
 *
 * Every fixed pairing below is checked against WCAG AA (4.5 for body text,
 * 3.0 for large text and UI edges).
 */

import { useColorScheme } from 'react-native';

/**
 * Diep vaarwaterblauw. Used until a groep has been loaded, and as the fallback
 * when a groep stored something that is not a colour.
 */
export const DEFAULT_ACCENT = '#14445F';

export type Theme = {
  dark: boolean;
  background: string;
  card: string;
  border: string;
  text: string;
  textDim: string;
  /** The groep's colour, as a surface. */
  accent: string;
  /** Black or white, whichever is legible on `accent`. */
  onAccent: string;
  /** The groep's colour, darkened enough to be read as small text. */
  accentText: string;
  chip: string;
  good: string;
  warn: string;
  danger: string;
  onDanger: string;
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700' },
  subheading: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: '400' },
  small: { fontSize: 13, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
} as const;

// ------------------------------------------------------------- colour maths

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Relative luminance, per WCAG. */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BLACK: [number, number, number] = [22, 22, 22];
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * Whichever of near-black and white is more readable on this colour. A bright
 * teal gets dark text; a deep green gets white. Neither is ever assumed.
 */
export function readableOn(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#FFFFFF';
  return contrast(rgb, BLACK) >= contrast(rgb, WHITE) ? '#161616' : '#FFFFFF';
}

/**
 * Darken (or on a dark theme, lighten) a colour until it clears `target`
 * contrast against the background it will be read on. Used for the accent as
 * text, which is where bright brand colours fail hardest.
 */
export function legibleText(hex: string, background: string, target = 4.5): string {
  const rgb = parseHex(hex);
  const bg = parseHex(background);
  if (!rgb || !bg) return background === '#FFFFFF' ? '#161616' : '#FFFFFF';

  const towardsDark = luminance(bg) > 0.5;
  let current: [number, number, number] = [...rgb] as [number, number, number];

  for (let i = 0; i < 24 && contrast(current, bg) < target; i++) {
    current = current.map((v) =>
      towardsDark ? v * 0.9 : v + (255 - v) * 0.12,
    ) as [number, number, number];
  }
  return toHex(current);
}

// ------------------------------------------------------------- the themes

const light = {
  dark: false,
  background: '#F4F5F3',
  card: '#FFFFFF',
  border: '#E1E3DF',
  text: '#161A17',
  textDim: '#5A605B',
  chip: '#EBEDE9',
  good: '#1B6B3A',
  warn: '#8A5A00',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
} as const;

const dark = {
  dark: true,
  background: '#101210',
  card: '#1B1E1C',
  border: '#2C302D',
  text: '#F1F3F0',
  textDim: '#9BA29D',
  chip: '#262A27',
  good: '#6FD397',
  warn: '#E0B252',
  danger: '#F2B8B5',
  onDanger: '#161616',
} as const;

/** Build a full theme for one groep's accent colour. */
export function makeTheme(accent: string | undefined, isDark: boolean): Theme {
  const base = isDark ? dark : light;
  const safeAccent = parseHex(accent ?? '') ? (accent as string) : DEFAULT_ACCENT;
  return {
    ...base,
    accent: safeAccent,
    onAccent: readableOn(safeAccent),
    accentText: legibleText(safeAccent, base.background),
  };
}

/** The theme for the phone's current light/dark setting, with no groep loaded. */
export function useBaseTheme(accent?: string): Theme {
  const scheme = useColorScheme();
  return makeTheme(accent, scheme === 'dark');
}
