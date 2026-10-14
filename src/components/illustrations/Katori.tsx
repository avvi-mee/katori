import Svg, { Ellipse, Path } from 'react-native-svg';

import { useTheme } from '@/design/theme';

/** A steel katori with dal. `fill` 0..1 sets how full it looks (used for size calibration too). */
export function KatoriArt({ size = 120, fill = 0.7 }: { size?: number; fill?: number }) {
  const { colors } = useTheme();
  const level = 36 + (1 - fill) * 18;
  return (
    <Svg width={size} height={size * 0.75} viewBox="0 0 120 90" accessibilityElementsHidden>
      <Ellipse cx="60" cy="82" rx="38" ry="5" fill={colors.line} />
      <Path d="M14 34 Q18 78 60 78 Q102 78 106 34 Z" fill={colors.surface2} stroke={colors.inkMuted} strokeWidth="2" />
      <Ellipse cx="60" cy={level} rx={42 - (level - 36) * 1.1} ry="7" fill={colors.carbs} />
      <Ellipse cx="60" cy="34" rx="46" ry="9" fill="none" stroke={colors.inkMuted} strokeWidth="2.5" />
      <Path
        d="M30 52 Q34 66 48 70"
        stroke={colors.surface}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />
    </Svg>
  );
}
