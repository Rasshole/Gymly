/**
 * ProfileStatGrid – equal-width 2-column stats (falls back to 1 column when narrow).
 */

import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet, type LayoutChangeEvent} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows, iconSize} from '@/theme/designTokens';
import {GymlyPressable} from '@/components/ui/GymlyPressable';

type StatItem = {
  key: string;
  icon?: string;
  emoji?: string;
  label: string;
  value: string | number;
  onPress?: () => void;
};

type ProfileStatGridProps = {
  stats: StatItem[];
};

const GAP = spacing.sm;
/** Content width below this → single column (large text / narrow phones). */
const SINGLE_COLUMN_MAX_WIDTH = 300;

export const ProfileStatGrid: React.FC<ProfileStatGridProps> = ({stats}) => {
  const [gridWidth, setGridWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== gridWidth) {
      setGridWidth(w);
    }
  };

  const columns = gridWidth > 0 && gridWidth < SINGLE_COLUMN_MAX_WIDTH ? 1 : 2;
  const itemWidth = useMemo(() => {
    if (gridWidth <= 0) {
      return undefined;
    }
    return (gridWidth - GAP * (columns - 1)) / columns;
  }, [gridWidth, columns]);

  return (
    <View style={styles.grid} onLayout={onLayout}>
      {stats.map(stat => {
        const inner = (
          <>
            <View style={styles.iconWrapper}>
              {stat.emoji ? (
                <Text style={styles.emojiMark} allowFontScaling={false}>
                  {stat.emoji}
                </Text>
              ) : (
                <Icon
                  name={stat.icon as never}
                  size={iconSize.sm}
                  color={colors.primary}
                />
              )}
            </View>
            <Text style={styles.value}>{stat.value}</Text>
            <Text style={styles.label}>{stat.label}</Text>
          </>
        );

        const shellStyle = [
          styles.item,
          itemWidth != null ? {width: itemWidth} : styles.itemFallback,
        ];

        if (stat.onPress) {
          return (
            <View key={stat.key} style={shellStyle}>
              <GymlyPressable
                onPress={stat.onPress}
                haptic="light"
                style={styles.pressFill}>
                {inner}
              </GymlyPressable>
            </View>
          );
        }

        return (
          <View key={stat.key} style={shellStyle}>
            {inner}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    width: '100%',
  },
  item: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colors.backgroundCardLight,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadows.sm,
  },
  /** Before first onLayout measurement — keep ~2 columns without flexGrow squash. */
  itemFallback: {
    width: '47%',
    maxWidth: '47%',
  },
  pressFill: {
    width: '100%',
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emojiMark: {
    fontSize: 22,
    lineHeight: 26,
  },
  value: {
    ...typography.h3,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.3,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
});
