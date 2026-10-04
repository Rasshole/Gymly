/**
 * Discreet language control for Login and Create Account.
 * Opens the existing settings language picker, which persists the choice.
 */

import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import type {AuthStackParamList} from '@/navigation/authStackParamList';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';

export function AuthLanguageButton() {
  const navigation = useNavigation<StackNavigationProp<AuthStackParamList>>();
  const {languageLabel, t} = useTranslation();

  return (
    <Pressable
      onPress={() => navigation.navigate('Language')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`${t('language.settingsTitle')}, ${languageLabel}`}
      testID="auth-language-button">
      <Text style={styles.label}>{languageLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
