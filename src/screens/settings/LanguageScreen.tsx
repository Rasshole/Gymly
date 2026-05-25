/**
 * Language selection — premium onboarding + settings.
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Image,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {
  useTranslation,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NATIVE_LABELS,
  ONBOARDING_LANGUAGES,
  type AppLanguage,
} from '@/i18n';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows, layout, fonts} from '@/theme/designTokens';
import {GymlyPressable} from '@/components/ui/GymlyPressable';
import {OnboardingPrimaryButton, ONBOARDING} from '@/components/onboarding';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

const SPLASH_KETTLEBELL = require('@/assets/images/splash-kettlebell.png');

const ONBOARDING_LABEL_KEYS: Record<'da' | 'en', 'language.optionDa' | 'language.optionEn'> = {
  da: 'language.optionDa',
  en: 'language.optionEn',
};

type Props = {
  mode: 'onboarding' | 'settings';
};

export function LanguageScreenContent({mode}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {language, setLanguage, t} = useTranslation();
  const isOnboarding = mode === 'onboarding';

  const [pending, setPending] = useState<AppLanguage>(
    ONBOARDING_LANGUAGES.includes(language as 'da' | 'en') ? language : 'da',
  );
  const fade = useRef(new Animated.Value(0)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {toValue: 1, duration: 2200, useNativeDriver: true}),
        Animated.timing(logoFloat, {toValue: 0, duration: 2200, useNativeDriver: true}),
      ]),
    );
    if (isOnboarding) loop.start();
    return () => loop.stop();
  }, [fade, isOnboarding, logoFloat]);

  const title = isOnboarding
    ? t('language.onboardingTitle')
    : t('language.chooseTitle');
  const subtitle = isOnboarding
    ? t('language.onboardingSubtitle')
    : t('language.chooseSubtitle');

  const languages = isOnboarding ? ONBOARDING_LANGUAGES : SUPPORTED_LANGUAGES;

  const handleSelect = (lang: AppLanguage) => {
    setPending(lang);
    if (!isOnboarding) {
      void setLanguage(lang);
    }
  };

  const handleContinue = async () => {
    await setLanguage(pending);
    if (isOnboarding) {
      navigation.replace('Register');
    }
  };

  const logoTranslateY = logoFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  return (
    <View style={[styles.root, {paddingTop: insets.top}]}>
      {isOnboarding ? (
        <View style={styles.bgGradientWrap} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="langBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ONBOARDING.bgTop} stopOpacity="1" />
                <Stop offset="1" stopColor={ONBOARDING.bgBottom} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#langBg)" />
          </Svg>
        </View>
      ) : null}

      {!isOnboarding ? (
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityLabel={t('common.back')}>
            <Icon name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('language.settingsTitle')}</Text>
          <View style={styles.headerRight} />
        </View>
      ) : null}

      <Animated.ScrollView
        contentContainerStyle={[
          styles.content,
          isOnboarding && {paddingTop: spacing.xl},
          {paddingBottom: insets.bottom + spacing.xl},
        ]}
        showsVerticalScrollIndicator={false}
        style={{opacity: fade}}>
        {isOnboarding ? (
          <Animated.View
            style={[styles.logoWrap, {transform: [{translateY: logoTranslateY}]}]}>
            <View style={styles.logoGlow} />
            <Image source={SPLASH_KETTLEBELL} style={styles.logo} resizeMode="contain" />
          </Animated.View>
        ) : null}

        <Text style={[styles.title, isOnboarding && styles.titleOnboarding]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.options}>
          {languages.map(lang => {
            const selected = (isOnboarding ? pending : language) === lang;
            const labelKey =
              lang === 'da' || lang === 'en'
                ? ONBOARDING_LABEL_KEYS[lang]
                : null;
            const label = labelKey ? t(labelKey) : LANGUAGE_NATIVE_LABELS[lang];
            return (
              <GymlyPressable
                key={lang}
                style={[styles.optionCard, selected && styles.optionCardSelected]}
                onPress={() => handleSelect(lang)}
                haptic="selection"
                accessibilityRole="radio"
                accessibilityState={{selected}}>
                {selected ? <View style={styles.optionGlow} pointerEvents="none" /> : null}
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {label}
                </Text>
                {selected ? (
                  <Icon name="checkmark-circle" size={26} color={colors.primary} />
                ) : (
                  <View style={styles.optionRing} />
                )}
              </GymlyPressable>
            );
          })}
        </View>

        {isOnboarding ? (
          <OnboardingPrimaryButton
            label={t('language.continue')}
            onPress={() => void handleContinue()}
            style={styles.continueBtn}
          />
        ) : null}
      </Animated.ScrollView>
    </View>
  );
}

const LanguageOnboardingScreen = () => <LanguageScreenContent mode="onboarding" />;

export default LanguageOnboardingScreen;

export function LanguageSettingsScreen() {
  return <LanguageScreenContent mode="settings" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bgGradientWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
    flex: 1,
    textAlign: 'center',
    color: colors.text,
  },
  headerRight: {
    width: 40,
  },
  content: {
    paddingHorizontal: layout.screenPaddingH + spacing.sm,
    flexGrow: 1,
  },
  logoWrap: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    opacity: 0.12,
  },
  logo: {
    width: 72,
    height: 72,
  },
  title: {
    ...typography.h2,
    fontFamily: fonts.display,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: -0.3,
  },
  titleOnboarding: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fonts.text,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  options: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg + 4,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  optionCardSelected: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '06',
  },
  optionGlow: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 8,
    bottom: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    opacity: 0.08,
  },
  optionLabel: {
    fontSize: 18,
    fontFamily: fonts.text,
    fontWeight: '600',
    color: colors.text,
  },
  optionLabelSelected: {
    fontWeight: '800',
    color: colors.primaryDark,
  },
  optionRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  continueBtn: {
    marginTop: spacing.md,
  },
});
