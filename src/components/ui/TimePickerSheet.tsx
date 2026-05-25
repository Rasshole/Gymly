/**
 * Fælles tid-vælger: iOS = Modal + UIDatePicker (hjul) med synlig tekst;
 * Android = system time picker.
 * Annuller lukker uden at kalde onConfirm; OK kalder onConfirm og lukker.
 *
 * iOS: Undlad textColor på spinner/wheels — KVC kan gøre tal usynlige; brug
 * themeVariant="light" sammen med lys baggrund i arket.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import {spacing, radius, typography, sheet} from '@/theme/designTokens';
import {SheetHandle} from './SheetHandle';

/** UIDatePicker wheels er typisk 216pt; lidt ekstra undgår clipping i Modal. */
const WHEEL_HEIGHT = 234;

export type TimePickerSheetProps = {
  visible: boolean;
  value: Date;
  onClose: () => void;
  /** Kun ved OK — modtager afrundet tid (minut-intervaller). */
  onConfirm: (next: Date) => void;
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  title?: string;
};

function alignMinutes(date: Date, interval: number): Date {
  const out = new Date(date);
  out.setSeconds(0, 0);
  const m = out.getMinutes();
  const r = m % interval;
  const up = r >= Math.ceil(interval / 2);
  out.setMinutes(m - r + (up ? interval : 0));
  if (out.getMinutes() >= 60) {
    out.setHours(out.getHours() + 1);
    out.setMinutes(0);
  }
  return out;
}

const TimePickerSheet: React.FC<TimePickerSheetProps> = ({
  visible,
  value,
  onClose,
  onConfirm,
  minuteInterval = 15,
  title = 'Tid',
}) => {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(() => new Date(value));

  useEffect(() => {
    if (visible) {
      setDraft(alignMinutes(new Date(value), minuteInterval));
    }
  }, [visible, value, minuteInterval]);

  const commit = useCallback(() => {
    const next = alignMinutes(draft, minuteInterval);
    onConfirm(next);
    onClose();
  }, [draft, minuteInterval, onConfirm, onClose]);

  if (Platform.OS === 'android') {
    if (!visible) {
      return null;
    }
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="default"
        minuteInterval={minuteInterval}
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'dismissed') {
            onClose();
            return;
          }
          if (event.type === 'set' && date) {
            onConfirm(alignMinutes(date, minuteInterval));
          }
          onClose();
        }}
      />
    );
  }

  const wheelBg = '#F3F4F6';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Luk" />
        <View
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm},
          ]}>
          <SheetHandle />
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
              <Text style={styles.cancelText}>Annuller</Text>
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={commit} hitSlop={12} style={styles.headerBtn}>
              <Text style={styles.okText}>OK</Text>
            </Pressable>
          </View>

          <View
            style={[styles.wheelWrap, {backgroundColor: wheelBg}]}
            collapsable={false}>
            <DateTimePicker
              value={draft}
              mode="time"
              display="spinner"
              minuteInterval={minuteInterval}
              onChange={(_e, d) => {
                if (d) {
                  setDraft(d);
                }
              }}
              locale="da_DK"
              themeVariant="light"
              style={styles.pickerNative}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: sheet.overlay,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: sheet.topRadius,
    borderTopRightRadius: sheet.topRadius,
    paddingHorizontal: spacing.lg,
    width: '100%',
    zIndex: 2,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  headerBtn: {
    minWidth: 72,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    ...typography.body,
    color: colors.textMuted,
  },
  title: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  okText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.primary,
    textAlign: 'right',
  },
  wheelWrap: {
    width: '100%',
    minHeight: WHEEL_HEIGHT,
    borderRadius: radius.md,
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  pickerNative: {
    width: '100%',
    height: WHEEL_HEIGHT,
    alignSelf: 'center',
  },
});

export default TimePickerSheet;
