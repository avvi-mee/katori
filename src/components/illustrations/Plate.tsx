import Svg, { Circle, Ellipse } from 'react-native-svg';

import { useTheme } from '@/design/theme';

/** A steel thali seen from above; `scale` 0..1 shows relative size for calibration. */
export function PlateArt({ size = 96, scale = 1 }: { size?: number; scale?: number }) {
  const { colors } = useTheme();
  const r = 44 * scale;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden>
      <Ellipse cx="50" cy={54 + r * 0.08} rx={r} ry={r * 0.96} fill={colors.line} />
      <Circle cx="50" cy="50" r={r} fill={colors.surface2} stroke={colors.inkMuted} strokeWidth="2" />
      <Circle cx="50" cy="50" r={r * 0.78} fill="none" stroke={colors.line} strokeWidth="1.5" />
      <Circle cx={50 - r * 0.32} cy={50 - r * 0.2} r={r * 0.22} fill={colors.carbs} opacity={0.9} />
      <Circle cx={50 + r * 0.3} cy={50 - r * 0.25} r={r * 0.2} fill={colors.protein} opacity={0.85} />
      <Ellipse
        cx={50 + r * 0.05}
        cy={50 + r * 0.32}
        rx={r * 0.34}
        ry={r * 0.2}
        fill={colors.surface}
        stroke={colors.line}
      />
    </Svg>
  );
}
