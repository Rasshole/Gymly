/**
 * Google Play prominent disclosure — must appear before Android location runtime permission.
 * Required explanation is fully visible (not behind Learn more / Privacy Policy).
 */

import React, {useEffect, useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {radius, spacing, typography, shadows} from '@/theme/designTokens';
import {
  isLocationDisclosurePending,
  resolveLocationProminentDisclosure,
  subscribeLocationDisclosure,
} from '@/services/location/locationDisclosureGate';

export function LocationProminentDisclosureHost() {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const [visible, setVisible] = useState(isLocationDisclosurePending());

  useEffect(() => {
    return subscribeLocationDisclosure(() => {
      setVisible(isLocationDisclosurePending());
    });
  }, []);

  const onAgree = () => {
    resolveLocationProminentDisclosure(true);
  };

  const onNotNow = () => {
    resolveLocationProminentDisclosure(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onNotNow}
      statusBarTranslucent>
      <View style={styles.root} testID="location-prominent-disclosure">
        <Pressable
          style={styles.backdrop}
          onPress={onNotNow}
          accessibilityRole="button"
          accessibilityLabel={t('locationDisclosure.notNow')}
        />
        <View
          style={[
            styles.card,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              maxHeight: height * 0.86,
            },
          ]}>
          <Text style={styles.title} accessibilityRole="header">
            {t('locationDisclosure.title')}
          </Text>
          <Text style={styles.body} testID="location-prominent-disclosure-body">
            {t('locationDisclosure.body')}
          </Text>
          <Text style={styles.noAds} testID="location-prominent-disclosure-no-ads">
            {t('locationDisclosure.notForAds')}
          </Text>
          <Pressable
            style={styles.agreeBtn}
            onPress={onAgree}
            accessibilityRole="button"
            testID="location-prominent-disclosure-agree">
            <Text style={styles.agreeText}>{t('locationDisclosure.agree')}</Text>
          </Pressable>
          <Pressable
            style={styles.notNowBtn}
            onPress={onNotNow}
            accessibilityRole="button"
            testID="location-prominent-disclosure-not-now">
            <Text style={styles.notNowText}>{t('locationDisclosure.notNow')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
    ...shadows.lg,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    fontWeight: '700',
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  noAds: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  agreeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  agreeText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 16,
  },
  notNowBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  notNowText: {
    ...typography.bodyBold,
    color: colors.textMuted,
    fontSize: 15,
  },
});
