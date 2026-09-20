/**
 * The icon set, drawn rather than installed.
 *
 * An icon font would drag in a native dependency and a licence for a handful of
 * glyphs; these are stroked paths on a 24-grid that inherit the colour and size
 * they are given, and they render identically on both platforms.
 */

import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type IconProps = {
  size?: number;
  color: ColorValue;
  /** Thicker when an icon is the selected tab. */
  strokeWidth?: number;
};

function Frame({
  size = 24,
  color,
  strokeWidth = 1.8,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {children}
    </Svg>
  );
}

/** De vaarders. */
export const PeopleIcon = (p: IconProps) => (
  <Frame {...p}>
    <Circle cx="9" cy="8" r="3.2" />
    <Path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <Path d="M16 5.5a3 3 0 0 1 0 5.8M17 14.2a5.5 5.5 0 0 1 3.5 4.8" />
  </Frame>
);

/** De diploma's — het boekje met de eisen. */
export const BookIcon = (p: IconProps) => (
  <Frame {...p}>
    <Path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <Path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    <Path d="M12 4v16" />
  </Frame>
);

/** Eigen voortgang. */
export const AnchorIcon = (p: IconProps) => (
  <Frame {...p}>
    <Circle cx="12" cy="5" r="2" />
    <Path d="M12 7v14" />
    <Path d="M8 10h8" />
    <Path d="M4 14a8 8 0 0 0 16 0" />
  </Frame>
);

export const MoreIcon = (p: IconProps) => (
  <Frame {...p}>
    <Path d="M4 7h16M4 12h16M4 17h10" />
  </Frame>
);

export const CheckIcon = (p: IconProps) => (
  <Frame {...p}>
    <Path d="M5 12.5 10 17.5 19 7" />
  </Frame>
);

export const CloseIcon = (p: IconProps) => (
  <Frame {...p}>
    <Path d="M6 6l12 12M18 6L6 18" />
  </Frame>
);

export const PlusIcon = (p: IconProps) => (
  <Frame {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Frame>
);

export const SettingsIcon = (p: IconProps) => (
  <Frame {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
  </Frame>
);

export const InfoIcon = (p: IconProps) => (
  <Frame {...p}>
    <Circle cx="12" cy="12" r="8.5" />
    <Path d="M12 11v5.5M12 7.8v.2" />
  </Frame>
);
