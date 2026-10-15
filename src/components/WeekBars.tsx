import { View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { fonts } from '@/design/tokens';
import { useTheme } from '@/design/theme';

type Props = { days: { label: string; value: number }[]; target: number; height?: number; accessibilityLabel: string };

/** Daily kcal bars with a dashed target line. Over-target days use the fat (warning) color. */
export function WeekBars({ days, target, height = 160, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const width = 320;
  const max = Math.max(target * 1.25, ...days.map((d) => d.value), 1);
  const chartH = height - 24;
  const slot = width / days.length;
  const barW = Math.min(28, slot * 0.55);
  const y = (v: number) => chartH - (v / max) * chartH;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {days.map((d, i) => {
          const h = Math.max((d.value / max) * chartH, d.value > 0 ? 4 : 0);
          return (
            <Rect
              key={i}
              x={i * slot + (slot - barW) / 2}
              y={chartH - h}
              width={barW}
              height={h}
              rx={8}
              fill={d.value > target * 1.1 ? colors.fat : colors.accent}
              opacity={i === days.length - 1 ? 1 : 0.75}
            />
          );
        })}
        {days.map((d, i) => (
          <SvgText
            key={`l${i}`}
            x={i * slot + slot / 2}
            y={height - 4}
            fontSize={11}
            fontFamily={fonts.sansSemibold}
            fill={colors.inkMuted}
            textAnchor="middle"
          >
            {d.label}
          </SvgText>
        ))}
        <Line
          x1={0}
          x2={width}
          y1={y(target)}
          y2={y(target)}
          stroke={colors.ink}
          strokeOpacity={0.5}
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
      </Svg>
    </View>
  );
}
