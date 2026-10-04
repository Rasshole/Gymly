/**
 * Compact compose FAB for Messages — no glow / gradient halo.
 */
import React, {useRef} from 'react';
import {Animated, Pressable, StyleSheet, Platform} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {useTranslation} from '@/i18n';

const FAB_SIZE = 52;
const ICON_SIZE = 24;

type Props = {
  onPress: () => void;
  bottom: number;
  right?: number;
};

export function ComposeMessageFab({onPress, bottom, right = 16}: Props) {
  const {t} = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      friction: 8,
      tension: 220,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.outer,
        {
          right,
          bottom,
          transform: [{scale}],
        },
      ]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.newMessage')}
        style={styles.hit}>
        <Icon name="create" size={ICON_SIZE} color={colors.white} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 20,
  },
  hit: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: {elevation: 4},
    }),
  },
});
