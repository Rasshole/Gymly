/**
 * White kettlebell icon (no background) for splash/loading screens.
 * Use on purple background – only the kettlebell shape is visible.
 */

import React from 'react';
import Svg, {Path, Circle} from 'react-native-svg';

type KettlebellIconProps = {
  size?: number;
  color?: string;
  /** Face (eyes, smile) color. Default: purple when body is white, white when body is purple */
  faceColor?: string;
};

const KettlebellIcon: React.FC<KettlebellIconProps> = ({
  size = 200,
  color = '#FFFFFF',
  faceColor: faceColorProp,
}) => {
  const faceColor =
    faceColorProp ??
    (color === '#FFFFFF' ? '#8B5CF6' : '#FFFFFF');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{backgroundColor: 'transparent'}}>
      {/* Handle - thick arc */}
      <Path
        d="M 30 25 Q 30 55 50 58 Q 70 55 70 25"
        stroke={color}
        strokeWidth={8}
        fill="none"
        strokeLinecap="round"
      />
      {/* Body - kettlebell bell */}
      <Path
        d="M 32 58 Q 32 90 50 94 Q 68 90 68 58 Z"
        fill={color}
      />
      {/* Smiley eyes */}
      <Circle cx={42} cy={72} r={4} fill={faceColor} />
      <Circle cx={58} cy={72} r={4} fill={faceColor} />
      {/* Smile */}
      <Path
        d="M 40 84 Q 50 90 60 84"
        stroke={faceColor}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default KettlebellIcon;
