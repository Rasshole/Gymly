/**
 * SwipeCheckIn – Draggable swipe-to-check-in component
 * Real horizontal drag, 75% threshold, haptic on success, progressive fill
 */

import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Vibration,
  Image,
  LayoutChangeEvent,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

/** Track-højde; thumb og logo afledes så de fylder næsten hele baren vertikalt */
const DEFAULT_TRACK = 84;
/** Lavere end default — mere plads til indhold over på tjek-ind (ét skærmbillede) */
const COMPACT_TRACK = 66;
/** Minimal luft: thumb fylder næsten hele baren (2px total → 1px top/bund) */
const THUMB_VERTICAL_INSET = 2;
const SUCCESS_THRESHOLD = 0.75;

const triggerHaptic = () => {
  if (Platform.OS === 'ios') Vibration.vibrate(50);
  else Vibration.vibrate(30);
};

export interface SwipeCheckInProps {
  onSuccess: () => void;
  disabled?: boolean;
  /** Tekst i track (fx "Tjek ind"). Default: "Swipe for at starte træning" */
  label?: string;
  /** Lavere track/thumb — bruges på Check-In for ét-skærms-layout */
  compact?: boolean;
}

const SwipeCheckIn: React.FC<SwipeCheckInProps> = ({
  onSuccess,
  disabled,
  label = 'Swipe for at starte træning',
  compact = false,
}) => {
  const trackHeight = compact ? COMPACT_TRACK : DEFAULT_TRACK;
  /** Thumb næsten fuld højde af baren → kettlebell fylder top til bund */
  const thumbSize = trackHeight - THUMB_VERTICAL_INSET;
  const logoSize = thumbSize - 2;
  const trackRadius = compact ? radius.lg : radius.xl;

  const [trackInnerW, setTrackInnerW] = useState(0);

  const maxDrag = useMemo(() => {
    const w = trackInnerW;
    if (w <= 0) return 1;
    return Math.max(1, w - thumbSize - spacing.sm * 2);
  }, [trackInnerW, thumbSize]);

  const successThreshold = maxDrag * SUCCESS_THRESHOLD;

  const translateX = useSharedValue(0);
  const successTriggered = useSharedValue(false);
  const firedRef = useRef(false);

  const handleSuccess = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    triggerHaptic();
    onSuccess();
  }, [onSuccess]);

  const resetFired = useCallback(() => {
    firedRef.current = false;
  }, []);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setTrackInnerW(w);
    }
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && trackInnerW > 0)
        .minDistance(0)
        .activeOffsetX([-3, 3])
        .onStart(() => {
          successTriggered.value = false;
          runOnJS(resetFired)();
        })
        .onUpdate(e => {
          const md = maxDrag;
          const clamped = Math.min(Math.max(0, e.translationX), md);
          translateX.value = clamped;
          const thresh = md * SUCCESS_THRESHOLD;
          if (clamped >= thresh && !successTriggered.value) {
            successTriggered.value = true;
            runOnJS(handleSuccess)();
          }
        })
        .onEnd(e => {
          const md = maxDrag;
          const thresh = md * SUCCESS_THRESHOLD;
          if (translateX.value >= thresh || e.velocityX > 250) {
            translateX.value = withSpring(md, {damping: 12, stiffness: 180});
            if (!successTriggered.value) {
              successTriggered.value = true;
              runOnJS(handleSuccess)();
            }
          } else {
            translateX.value = withSpring(0, {damping: 20, stiffness: 200});
          }
        }),
    [disabled, trackInnerW, maxDrag, handleSuccess, resetFired],
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{translateX: translateX.value}],
  }));

  const fillStyle = useAnimatedStyle(() => {
    const fillWidth = translateX.value + thumbSize / 2;
    return {
      width: fillWidth,
    };
  }, [thumbSize]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 120], [1, 0.55]),
  }));

  return (
    <View style={[styles.container, disabled && styles.containerDisabled]} collapsable={false}>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.track,
            styles.trackFullWidth,
            {
              height: trackHeight,
              borderRadius: trackRadius,
            },
          ]}
          onLayout={onTrackLayout}
          collapsable={false}>
          <Animated.View
            style={[
              styles.fill,
              {borderTopLeftRadius: trackRadius, borderBottomLeftRadius: trackRadius},
              fillStyle,
            ]}
          />
          <Animated.Text
            style={[
              styles.trackText,
              compact && styles.trackTextCompact,
              textStyle,
            ]}>
            {label}
          </Animated.Text>
          <Animated.View
            style={[
              styles.thumb,
              {
                top: (trackHeight - thumbSize) / 2,
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbSize / 2,
              },
              thumbStyle,
            ]}>
            <Image
              source={require('@/assets/images/gymly-kettlebell-logo.png')}
              style={[styles.thumbImage, {width: logoSize, height: logoSize}]}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  containerDisabled: {
    opacity: 0.55,
  },
  track: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  trackFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary + '35',
  },
  trackText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    zIndex: 1,
  },
  trackTextCompact: {
    fontSize: 14,
    lineHeight: 18,
  },
  thumb: {
    position: 'absolute',
    left: spacing.sm,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.14,
        shadowRadius: 5,
      },
      android: {elevation: 5},
    }),
  },
  thumbImage: {
    backgroundColor: 'transparent',
  },
});

export default SwipeCheckIn;
