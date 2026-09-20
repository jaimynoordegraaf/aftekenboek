/** The shared building blocks. Everything on screen is made of these. */

import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, type as typeScale } from '@/theme';
import { errorMessage } from '@/lib/errors';
import { useTheme } from '@/lib/use-theme';

// ---------------------------------------------------------------- text

type Variant = keyof typeof typeScale;

export function Txt({
  variant = 'body',
  dim,
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; dim?: boolean; color?: string }) {
  const t = useTheme();
  const v = typeScale[variant];
  return (
    <Text
      {...rest}
      style={[
        { fontSize: v.fontSize, fontWeight: v.fontWeight as any },
        { color: color ?? (dim ? t.textDim : t.text) },
        style,
      ]}
    />
  );
}

export function Title(p: TextProps) {
  return <Txt variant="title" {...p} />;
}
export function Heading(p: TextProps) {
  return <Txt variant="heading" {...p} />;
}

// ---------------------------------------------------------------- layout

export function Screen({
  children,
  scroll = true,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  const pad = { padding: space.lg, paddingBottom: space.xxl + inset.bottom };

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: t.background }, pad]}>{children}</View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={pad}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}

/** A screen with no tab bar under it — sign-in, join, full-page forms. */
export function PlainScreen({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: t.card,
          borderColor: t.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: space.lg,
          gap: space.sm,
        },
        style,
      ]}
    />
  );
}

export function Row({ style, gap = space.sm, ...rest }: ViewProps & { gap?: number }) {
  return (
    <View
      {...rest}
      style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}
    />
  );
}

export function Stack({ style, gap = space.md, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[{ gap }, style]} />;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

// ---------------------------------------------------------------- controls

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  icon?: React.ReactNode;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
}: ButtonProps) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.accent, fg: t.onAccent, border: t.accent },
    secondary: { bg: 'transparent', fg: t.text, border: t.border },
    danger: { bg: t.danger, fg: t.onDanger, border: t.danger },
    ghost: { bg: 'transparent', fg: t.accentText, border: 'transparent' },
  }[variant];

  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: off ? 0.5 : pressed ? 0.75 : 1,
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        minHeight: 48,
      })}>
      {busy ? <ActivityIndicator color={palette.fg} /> : icon}
      <Text style={{ color: palette.fg, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label?: string; hint?: string }>(
  function Field({ label, hint, style, ...rest }, ref) {
    const t = useTheme();
    return (
      <View style={{ gap: space.xs }}>
        {label ? (
          <Txt variant="label" dim>
            {label}
          </Txt>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={t.textDim}
          {...rest}
          style={[
            {
              backgroundColor: t.card,
              borderColor: t.border,
              borderWidth: 1,
              borderRadius: radius.md,
              paddingHorizontal: space.md,
              paddingVertical: space.md,
              fontSize: 16,
              color: t.text,
              minHeight: 48,
            },
            style,
          ]}
        />
        {hint ? (
          <Txt variant="small" dim>
            {hint}
          </Txt>
        ) : null}
      </View>
    );
  },
);

/** A small pill. `tone` picks the meaning; `selected` fills it with the accent. */
export function Chip({
  label,
  selected,
  onPress,
  tone,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'good' | 'warn' | 'danger';
}) {
  const t = useTheme();
  const toneColor = tone ? { good: t.good, warn: t.warn, danger: t.danger }[tone] : null;

  const bg = selected ? t.accent : t.chip;
  const fg = selected ? t.onAccent : (toneColor ?? t.textDim);

  const body = (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        paddingVertical: 6,
      }}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Two or three choices, side by side. Used for praktijk / theorie. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.chip,
        borderRadius: radius.md,
        padding: 3,
        gap: 3,
      }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              backgroundColor: on ? t.card : 'transparent',
              borderRadius: radius.sm,
              paddingVertical: space.sm,
              alignItems: 'center',
            }}>
            <Text
              style={{
                color: on ? t.text : t.textDim,
                fontSize: 14,
                fontWeight: '600',
              }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * How far along someone is. The number is spelled out beside the bar as well:
 * a bar alone says "quite far" and an instructeur wants "7 van 9".
 */
export function ProgressBar({
  done,
  total,
  label,
  tone,
}: {
  done: number;
  total: number;
  label?: string;
  tone?: 'accent' | 'good';
}) {
  const t = useTheme();
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const fill = tone === 'good' ? t.good : t.accent;

  return (
    <View style={{ gap: space.xs }}>
      {label || total > 0 ? (
        <Row style={{ justifyContent: 'space-between' }}>
          {label ? (
            <Txt variant="label" dim>
              {label}
            </Txt>
          ) : (
            <View />
          )}
          <Txt variant="label" dim>
            {done} van {total}
          </Txt>
        </Row>
      ) : null}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: done }}
        style={{
          height: 8,
          borderRadius: radius.pill,
          backgroundColor: t.chip,
          overflow: 'hidden',
        }}>
        <View
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            backgroundColor: fill,
            borderRadius: radius.pill,
          }}
        />
      </View>
    </View>
  );
}

/**
 * One eis on the aftekenlijst.
 *
 * The box is the whole point of the app, so it is big enough to hit from a
 * wobbling boat: the row itself is the target, 48pt high at minimum. When an
 * instructeur is not allowed to tick — a lid looking at their own lijst — the
 * row stays readable and simply does not respond, rather than disappearing.
 */
export function CheckRow({
  number,
  title,
  detail,
  signedLine,
  checked,
  onPress,
  onLongPress,
  disabled,
  busy,
}: {
  number: number;
  title: string;
  detail?: string | null;
  signedLine?: string | null;
  checked: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const t = useTheme();

  const box = (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: radius.sm,
        borderWidth: 2,
        borderColor: checked ? t.good : t.border,
        backgroundColor: checked ? t.good : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {busy ? (
        <ActivityIndicator size="small" color={checked ? t.card : t.textDim} />
      ) : checked ? (
        <Text style={{ color: t.dark ? '#101210' : '#FFFFFF', fontSize: 15, fontWeight: '900' }}>
          ✓
        </Text>
      ) : null}
    </View>
  );

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        paddingVertical: space.md,
        minHeight: 48,
      }}>
      {box}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt>
          <Text style={{ color: t.textDim }}>{number}. </Text>
          {title}
        </Txt>
        {detail ? (
          <Txt variant="small" dim>
            {detail}
          </Txt>
        ) : null}
        {signedLine ? (
          <Txt variant="small" color={t.good}>
            {signedLine}
          </Txt>
        ) : null}
      </View>
    </View>
  );

  if (!onPress || disabled) return body;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={`${number}. ${title}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

// ---------------------------------------------------------------- states

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.md }}>
      <ActivityIndicator color={t.accentText} />
      {label ? (
        <Txt variant="small" dim>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xxl }}>
      <Txt variant="subheading">{title}</Txt>
      {body ? (
        <Txt variant="small" dim style={{ textAlign: 'center' }}>
          {body}
        </Txt>
      ) : null}
    </Card>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const t = useTheme();
  if (!error) return null;
  const message = errorMessage(error);
  return (
    <View
      style={{
        backgroundColor: t.card,
        borderColor: t.danger,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: space.md,
      }}>
      <Txt variant="small" color={t.danger}>
        {message}
      </Txt>
    </View>
  );
}

/** A tappable list row with a chevron. */
export function LinkRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: space.md,
        gap: space.md,
      })}>
      <Txt>{label}</Txt>
      <Row gap={space.sm}>
        {detail ? (
          <Txt variant="small" dim>
            {detail}
          </Txt>
        ) : null}
        <Text style={{ color: t.textDim, fontSize: 18 }}>›</Text>
      </Row>
    </Pressable>
  );
}
