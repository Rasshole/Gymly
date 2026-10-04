/**
 * Optional session contact status chips (does not block check-in).
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import type {ContactStatus} from '@/utils/contactStatus';

export type ContactStatusPickerProps = {
  value: ContactStatus | null;
  onChange: (next: ContactStatus | null) => void;
  disabled?: boolean;
  compact?: boolean;
};

const ContactStatusPicker: React.FC<ContactStatusPickerProps> = ({
  value,
  onChange,
  disabled,
  compact,
}) => {
  const {t} = useTranslation();
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!compact ? (
        <Text style={styles.label}>{t('sayHi.contactStatusLabel')}</Text>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.chip, value === 'open' && styles.chipActive]}
          disabled={disabled}
          onPress={() => onChange(value === 'open' ? null : 'open')}
          accessibilityRole="button"
          accessibilityState={{selected: value === 'open'}}
          accessibilityLabel={t('sayHi.contactOpen')}>
          <Text
            style={[styles.chipText, value === 'open' && styles.chipTextActive]}
            numberOfLines={2}>
            {t('sayHi.contactOpen')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, value === 'focused' && styles.chipActive]}
          disabled={disabled}
          onPress={() => onChange(value === 'focused' ? null : 'focused')}
          accessibilityRole="button"
          accessibilityState={{selected: value === 'focused'}}
          accessibilityLabel={t('sayHi.contactFocused')}>
          <Text
            style={[
              styles.chipText,
              value === 'focused' && styles.chipTextActive,
            ]}
            numberOfLines={2}>
            {t('sayHi.contactFocused')}
          </Text>
        </TouchableOpacity>
      </View>
      {!compact ? (
        <Text style={styles.hint}>{t('sayHi.contactStatusHint')}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {marginBottom: spacing.md},
  wrapCompact: {marginBottom: spacing.sm},
  label: {
    ...typography.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  row: {flexDirection: 'row', gap: 8},
  chip: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    minHeight: 48,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '14',
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  chipTextActive: {color: colors.primaryDark, fontWeight: '700'},
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});

export default ContactStatusPicker;
