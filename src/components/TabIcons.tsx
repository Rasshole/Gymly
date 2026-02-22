/**
 * Tab bar icons – glossy purple style matching app branding
 * Hjem, Online, Tjek ind, Beskeder, Profil
 */

import React from 'react';
import {View} from 'react-native';
import Svg, {Path, Circle} from 'react-native-svg';
import {colors} from '@/theme/colors';

type TabIconProps = {
  name: 'Home' | 'Friends' | 'CheckIn' | 'Messages' | 'Profile';
  size?: number;
  focused?: boolean;
};

const iconColor = colors.primary;
const inactiveOpacity = 0.55;

const TabIcons: React.FC<TabIconProps> = ({
  name,
  size = 64,
  focused = true,
}) => {
  const opacity = focused ? 1 : inactiveOpacity;
  const color = iconColor;

  const renderIcon = () => {
    switch (name) {
      case 'Home': {
        // House with pitched roof and dark archway/door
        return (
          <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <Path
              d="M24 6L6 20v18h12V28h12v10h12V20L24 6z"
              fill={color}
              fillOpacity={opacity}
            />
            <Path
              d="M20 26h8v12h-8z"
              fill={colors.primaryDark}
              fillOpacity={opacity}
            />
          </Svg>
        );
      }
      case 'Friends': {
        // Broadcast/signal – circle with curved arcs to the right
        return (
          <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <Circle
              cx="14"
              cy="24"
              r="5"
              fill={color}
              fillOpacity={opacity}
            />
            <Path
              d="M20 24 A 12 8 0 0 1 32 24"
              stroke={color}
              strokeWidth={3}
              strokeOpacity={opacity}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M20 24 A 20 12 0 0 1 40 24"
              stroke={color}
              strokeWidth={2.5}
              strokeOpacity={opacity}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M20 24 A 28 16 0 0 1 48 24"
              stroke={color}
              strokeWidth={2}
              strokeOpacity={opacity}
              fill="none"
              strokeLinecap="round"
            />
          </Svg>
        );
      }
      case 'CheckIn': {
        // Solid circle with white checkmark
        return (
          <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <Circle cx="24" cy="24" r="22" fill={color} fillOpacity={opacity} />
            <Path
              d="M14 24l7 7 13-14"
              stroke="#fff"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        );
      }
      case 'Messages': {
        // Speech bubble
        return (
          <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <Path
              d="M4 12c0-4 4-8 12-8h16c8 0 12 4 12 8v20c0 4-4 8-12 8H16l-8 8V12z"
              fill={color}
              fillOpacity={opacity}
            />
          </Svg>
        );
      }
      case 'Profile': {
        // User profile – head and body
        return (
          <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <Circle
              cx="24"
              cy="16"
              r="8"
              fill={color}
              fillOpacity={opacity}
            />
            <Path
              d="M8 44c0-10 7-16 16-16s16 6 16 16"
              fill={color}
              fillOpacity={opacity}
            />
          </Svg>
        );
      }
      default:
        return null;
    }
  };

  return (
    <View style={{width: size, height: size}}>
      {renderIcon()}
    </View>
  );
};

export default TabIcons;
