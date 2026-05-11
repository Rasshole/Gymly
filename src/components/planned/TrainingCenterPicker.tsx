/**
 * Del center-vælger: felt + valgfrit indlejret sheet.
 * - default: felt + PlanSessionCenterPickerSheet (Inviter til træning)
 * - sheetMode="detached": kun felt — parent renderer PlanSessionCenterPickerSheet uden for ScrollView (Ny session-modal)
 */

import React, {useCallback, useState} from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, shadows, typography} from '@/theme/designTokens';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import type {DanishGym} from '@/data/danishGyms';
import PlanSessionCenterPickerSheet from '@/components/planned/PlanSessionCenterPickerSheet';

const PURPLE_MIST = 'rgba(139, 92, 246, 0.09)';
const CARD_LINE = 'rgba(139, 92, 246, 0.1)';

export type TrainingCenterPickerVariant = 'inviteCard' | 'scheduleRow';

type BaseProps = {
  value: DanishGym | null;
  onChange: (gym: DanishGym) => void;
  variant: TrainingCenterPickerVariant;
};

type InternalSheetProps = BaseProps & {
  sheetMode?: 'internal';
};

type DetachedSheetProps = BaseProps & {
  sheetMode: 'detached';
  onSheetOpenChange: (open: boolean) => void;
};

export type TrainingCenterPickerProps = InternalSheetProps | DetachedSheetProps;

const TrainingCenterPicker: React.FC<TrainingCenterPickerProps> = props => {
  const detached = props.sheetMode === 'detached';
  const onSheetOpenChange = detached ? props.onSheetOpenChange : undefined;
  const [sheetOpen, setSheetOpen] = useState(false);

  const openSheet = useCallback(() => {
    if (detached && onSheetOpenChange) {
      onSheetOpenChange(true);
    } else if (!detached) {
      setSheetOpen(true);
    }
  }, [detached, onSheetOpenChange]);

  const closeSheet = useCallback(() => {
    if (detached && onSheetOpenChange) {
      onSheetOpenChange(false);
    } else if (!detached) {
      setSheetOpen(false);
    }
  }, [detached, onSheetOpenChange]);

  const handleSelect = useCallback(
    (gym: DanishGym) => {
      props.onChange(gym);
      closeSheet();
    },
    [props, closeSheet],
  );

  const row = (
    <Pressable
      style={({pressed}) => [styles.centerRow, pressed && styles.rowPressed]}
      onPress={openSheet}
      android_ripple={{color: PURPLE_MIST}}
      accessibilityRole="button"
      accessibilityLabel="Vælg center">
      <View style={styles.iconWrap}>
        <Ionicons name="location-outline" size={18} color={colors.primary} />
      </View>
      <Text style={[styles.rowText, !props.value && styles.placeholder]} numberOfLines={2}>
        {props.value ? formatGymDisplayName(props.value) : 'Vælg center'}
      </Text>
      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
    </Pressable>
  );

  const label = (
    <Text style={styles.cardLabel} accessibilityElementsHidden>
      Center
    </Text>
  );

  return (
    <>
      {props.variant === 'inviteCard' ? (
        <View style={styles.card}>
          {label}
          {row}
        </View>
      ) : (
        <View style={styles.scheduleBlock}>
          {label}
          {row}
        </View>
      )}

      {!detached ? (
        <PlanSessionCenterPickerSheet
          visible={sheetOpen}
          onClose={closeSheet}
          onSelect={handleSelect}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_LINE,
    ...shadows.sm,
  },
  scheduleBlock: {
    marginBottom: spacing.sm,
  },
  cardLabel: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  rowPressed: {
    opacity: 0.88,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: PURPLE_MIST,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginRight: spacing.sm,
  },
  placeholder: {
    color: colors.textMuted,
    fontWeight: '500',
  },
});

export default TrainingCenterPicker;
