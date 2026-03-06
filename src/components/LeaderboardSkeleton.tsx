/**
 * Leaderboard Skeleton
 * Loading placeholder – matcher rangliste-row layout
 */

import React, {useEffect, useRef} from 'react';
import {View, StyleSheet, Animated} from 'react-native';
import {colors} from '@/theme/colors';

const SkeletonRow = () => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.row, {opacity}]}>
      <View style={styles.rankBadge} />
      <View style={styles.avatar} />
      <View style={styles.textBlock}>
        <View style={[styles.line, styles.lineName]} />
        <View style={[styles.line, styles.lineValue]} />
      </View>
    </Animated.View>
  );
};

export default function LeaderboardSkeleton({count = 8}: {count?: number}) {
  return (
    <View style={styles.container}>
      {Array.from({length: count}).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    marginRight: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    marginRight: 10,
  },
  textBlock: {
    flex: 1,
  },
  line: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  lineName: {
    width: '60%',
    marginBottom: 6,
  },
  lineValue: {
    width: '40%',
  },
});
