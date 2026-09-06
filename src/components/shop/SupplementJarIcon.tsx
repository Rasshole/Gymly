/**
 * Outlined supplement jar — matches Ionicons outline stroke weight at Shop category size.
 * Used instead of flask/beaker so Supplements reads as consumer nutrition products.
 */
import React, {memo} from 'react';
import Svg, {Path, Rect, Line} from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
};

const SupplementJarIcon = memo(function SupplementJarIcon({
  size = 22,
  color = '#8B5CF6',
}: Props) {
  const stroke = Math.max(1.5, size * (1.5 / 22));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {/* Lid */}
      <Rect
        x={7}
        y={3.5}
        width={10}
        height={2.5}
        rx={0.8}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
      />
      <Line
        x1={8}
        y1={6}
        x2={16}
        y2={6}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* Jar body */}
      <Path
        d="M8 6.5 v1.2 c0 0.4 -0.35 0.75 -0.75 0.85 L6.5 9.0 v10.2 c0 1.1 0.9 2 2 2 h7 c1.1 0 2 -0.9 2 -2 V9.0 l-0.75 -0.45 c-0.4 -0.1 -0.75 -0.45 -0.75 -0.85 V6.5"
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* Label band */}
      <Path
        d="M8.2 13.5 h7.6"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </Svg>
  );
});

export default SupplementJarIcon;
