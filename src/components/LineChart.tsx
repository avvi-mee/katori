import { View } from 'react-native';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';

import { fonts } from '@/design/tokens';
import { useTheme } from '@/design/theme';

type Props = {
  points: { label: string; value: number }[];
  color?: string;
  height?: number;
  unit?: string;
  accessibilityLabel: string;
};

/** Small trend line (weight, e1RM) with first/last labels and min/max scale. */
export function LineChart({ points, color, height = 140, unit = '', accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const width = 320;
  const pad = { l: 8, r: 8, t: 18, b: 22 };
  if (!points.length) return null;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) =>
    pad.l + (points.length === 1 ? (width - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (width - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (height - pad.t - pad.b);
  const stroke = color ?? colors.accent;
  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit}`;
  const last = points.at(-1)!;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={x(points.length - 1)} cy={y(last.value)} r={5} fill={stroke} />
        <SvgText x={pad.l} y={12} fontSize={11} fontFamily={fonts.sans} fill={colors.inkMuted}>
          {fmt(hi)}
        </SvgText>
        <SvgText
          x={width - pad.r}
          y={12}
          fontSize={12}
          fontFamily={fonts.sansSemibold}
          fill={colors.ink}
          textAnchor="end"
        >
          {fmt(last.value)}
        </SvgText>
        <SvgText x={pad.l} y={height - 6} fontSize={11} fontFamily={fonts.sans} fill={colors.inkMuted}>
          {points[0]!.label}
        </SvgText>
        <SvgText
          x={width - pad.r}
          y={height - 6}
          fontSize={11}
          fontFamily={fonts.sans}
          fill={colors.inkMuted}
          textAnchor="end"
        >
          {last.label}
        </SvgText>
      </Svg>
    </View>
  );
}
