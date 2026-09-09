/**
 * Horizontal long-press drag reorder for up to 3 selected profile centres.
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AccessibilityActionEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import GymLogoView from '@/components/ui/GymLogoView';
import type {DanishGym} from '@/data/gymCatalog';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {radius, shadows, spacing} from '@/theme/designTokens';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import {triggerHaptic} from '@/utils/haptics';
import {
  dragPreviewSlotShift,
  moveIdInOrder,
  previewPrimaryId,
} from '@/utils/reorderCenterIds';

export const SELECTED_CHIP_WIDTH = 148;
export const SELECTED_CHIP_GAP = spacing.sm;
export const SELECTED_CHIP_SLOT = SELECTED_CHIP_WIDTH + SELECTED_CHIP_GAP;

const springConfig = {damping: 22, stiffness: 280, mass: 0.7} as const;

type Props = {
  gyms: DanishGym[];
  selectedIds: string[];
  onReorder: (nextIds: string[]) => void;
  onRemove: (gymId: string) => void;
};

type ChipProps = {
  gym: DanishGym;
  index: number;
  count: number;
  isPrimary: boolean;
  dragging: boolean;
  fromIndex: number;
  hoverIndex: number;
  dragX: SharedValue<number>;
  onDragStart: (index: number) => void;
  onHoverChange: (hover: number) => void;
  onDragEnd: (from: number, to: number) => void;
  onDragCancel: () => void;
  onRemove: (gymId: string) => void;
  onA11yMove: (index: number, dir: -1 | 1) => void;
};

function SelectedCenterChip({
  gym,
  index,
  count,
  isPrimary,
  dragging,
  fromIndex,
  hoverIndex,
  dragX,
  onDragStart,
  onHoverChange,
  onDragEnd,
  onDragCancel,
  onRemove,
  onA11yMove,
}: ChipProps) {
  const {t} = useTranslation();
  const isActive = dragging && fromIndex === index;
  const slotShift = dragging
    ? dragPreviewSlotShift(index, fromIndex, hoverIndex)
    : 0;
  const restOffset = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    restOffset.value = withSpring(slotShift * SELECTED_CHIP_SLOT, springConfig);
  }, [restOffset, slotShift]);

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.06 : 1, springConfig);
  }, [isActive, scale]);

  const startDragJs = useCallback(() => {
    triggerHaptic('medium');
    onDragStart(index);
  }, [index, onDragStart]);

  const hoverJs = useCallback(
    (hover: number) => {
      onHoverChange(hover);
    },
    [onHoverChange],
  );

  const endDragJs = useCallback(
    (from: number, to: number) => {
      onDragEnd(from, to);
    },
    [onDragEnd],
  );

  const cancelDragJs = useCallback(() => {
    onDragCancel();
  }, [onDragCancel]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(280)
        .maxPointers(1)
        .onStart(() => {
          runOnJS(startDragJs)();
        })
        .onUpdate(e => {
          dragX.value = e.translationX;
          const raw = Math.round(
            (index * SELECTED_CHIP_SLOT + e.translationX) / SELECTED_CHIP_SLOT,
          );
          const hover = Math.max(0, Math.min(count - 1, raw));
          runOnJS(hoverJs)(hover);
        })
        .onEnd(() => {
          const raw = Math.round(
            (index * SELECTED_CHIP_SLOT + dragX.value) / SELECTED_CHIP_SLOT,
          );
          const to = Math.max(0, Math.min(count - 1, raw));
          dragX.value = withSpring(0, springConfig);
          runOnJS(endDragJs)(index, to);
        })
        .onFinalize((_e, success) => {
          dragX.value = withSpring(0, springConfig);
          if (!success) {
            runOnJS(cancelDragJs)();
          }
        }),
    [cancelDragJs, count, dragX, endDragJs, hoverJs, index, startDragJs],
  );

  // Do not call Platform.* inside this worklet — crashes Reanimated on Android mount.
  const animatedStyle = useAnimatedStyle(() => {
    const tx = isActive ? dragX.value : restOffset.value;
    return {
      transform: [{translateX: tx}, {scale: scale.value}],
      zIndex: isActive ? 20 : 1,
      opacity: isActive ? 0.92 : 1,
    };
  }, [isActive]);

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'moveEarlier' || name === 'accessibilityActionMoveEarlier') {
      onA11yMove(index, -1);
    } else if (
      name === 'moveLater' ||
      name === 'accessibilityActionMoveLater'
    ) {
      onA11yMove(index, 1);
    }
  };

  return (
    <View
      style={[styles.chipSlot, {width: SELECTED_CHIP_WIDTH}]}
      accessibilityRole="adjustable"
      accessibilityLabel={`${formatGymDisplayName(gym)}${
        isPrimary ? `, ${t('phase2ui.primaryCenter')}` : ''
      }`}
      accessibilityHint={t('a11y.dragGymToReorder')}
      accessibilityActions={
        count > 1
          ? [
              {name: 'moveEarlier', label: t('a11y.moveGymEarlier')},
              {name: 'moveLater', label: t('a11y.moveGymLater')},
            ]
          : undefined
      }
      onAccessibilityAction={count > 1 ? onAccessibilityAction : undefined}>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.chip, isPrimary && styles.chipPrimaryEdge, animatedStyle]}
          testID={`selected-center-chip-${gym.id}`}>
          {isPrimary ? (
            <View style={styles.chipPrimaryBadge}>
              <Text style={styles.chipPrimaryText}>
                {t('phase2ui.primaryCenter')}
              </Text>
            </View>
          ) : (
            <View style={styles.chipPrimarySpacer} />
          )}
          <View style={styles.chipTopRow}>
            <View style={styles.chipLogoWrap}>
              <GymLogoView
                gymName={gym.name}
                brand={gym.brand}
                size={32}
                surface="lavender"
              />
            </View>
            {/* spacer — remove button is a sibling overlay */}
            <View style={styles.chipRemoveHit} />
          </View>
          <Text style={styles.chipName} numberOfLines={2}>
            {formatGymDisplayName(gym)}
          </Text>
          {gym.city ? (
            <Text style={styles.chipCity} numberOfLines={1}>
              {gym.city}
            </Text>
          ) : null}
        </Animated.View>
      </GestureDetector>
      <TouchableOpacity
        onPress={() => onRemove(gym.id)}
        hitSlop={10}
        style={styles.chipRemove}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.close')}
        testID={`selected-center-remove-${gym.id}`}>
        <Icon name="close-circle" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export function SelectedCentersReorderRow({
  gyms,
  selectedIds,
  onReorder,
  onRemove,
}: Props) {
  const dragX = useSharedValue(0);
  const [fromIndex, setFromIndex] = useState(0);
  const [hoverIndex, setHoverIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const primaryId = useMemo(() => {
    if (!dragging) {
      return selectedIds[0];
    }
    return previewPrimaryId(selectedIds, fromIndex, hoverIndex);
  }, [dragging, fromIndex, hoverIndex, selectedIds]);

  const onDragStart = useCallback((index: number) => {
    setFromIndex(index);
    setHoverIndex(index);
    setDragging(true);
    setScrollEnabled(false);
  }, []);

  const onHoverChange = useCallback(
    (hover: number) => {
      setHoverIndex(prev => {
        if (prev !== hover) {
          triggerHaptic('selection');
        }
        return hover;
      });
    },
    [],
  );

  const onDragEnd = useCallback(
    (from: number, to: number) => {
      setDragging(false);
      setScrollEnabled(true);
      if (from !== to) {
        onReorder(moveIdInOrder(selectedIds, from, to));
        triggerHaptic('light');
      }
    },
    [onReorder, selectedIds],
  );

  const onDragCancel = useCallback(() => {
    setDragging(false);
    setScrollEnabled(true);
    setHoverIndex(fromIndex);
  }, [fromIndex]);

  const onA11yMove = useCallback(
    (index: number, dir: -1 | 1) => {
      const next = moveIdInOrder(selectedIds, index, index + dir);
      if (next !== selectedIds) {
        onReorder(next);
        triggerHaptic('selection');
      }
    },
    [onReorder, selectedIds],
  );

  const contentWidth =
    gyms.length * SELECTED_CHIP_WIDTH +
    Math.max(0, gyms.length - 1) * SELECTED_CHIP_GAP +
    spacing.md;

  return (
    <ScrollView
      horizontal
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, {minWidth: contentWidth}]}
      style={styles.scroll}
      testID="selected-centers-reorder-row">
      {gyms.map((gym, index) => (
        <SelectedCenterChip
          key={gym.id}
          gym={gym}
          index={index}
          count={gyms.length}
          isPrimary={gym.id === primaryId}
          dragging={dragging}
          fromIndex={fromIndex}
          hoverIndex={hoverIndex}
          dragX={dragX}
          onDragStart={onDragStart}
          onHoverChange={onHoverChange}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
          onRemove={onRemove}
          onA11yMove={onA11yMove}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    overflow: 'visible',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SELECTED_CHIP_GAP,
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
    paddingLeft: 2,
  },
  chipSlot: {
    position: 'relative',
  },
  chip: {
    width: SELECTED_CHIP_WIDTH,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '35',
    padding: spacing.sm,
    ...shadows.sm,
  },
  chipPrimaryEdge: {
    borderColor: colors.primary + '55',
  },
  chipPrimaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginBottom: 6,
  },
  chipPrimarySpacer: {
    height: 18,
    marginBottom: 6,
  },
  chipPrimaryText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  chipTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  chipLogoWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipRemoveHit: {
    width: 20,
    height: 20,
  },
  chipRemove: {
    position: 'absolute',
    top: spacing.sm - 2,
    right: spacing.sm - 2,
    zIndex: 30,
  },
  chipName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 17,
  },
  chipCity: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
