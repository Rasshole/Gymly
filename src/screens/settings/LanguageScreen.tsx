/**
 * Language selection — scalable list for onboarding + settings.
 * Available languages are derived from locale registry (ready only).
 */

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  Image,
  FlatList,
  Platform,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {
  useTranslation,
  SELECTABLE_LANGUAGES,
  toSelectableLanguage,
  type SelectableLanguage,
  type AppLanguage,
} from '@/i18n';
import {
  getReadyLocales,
  matchesLocaleSearch,
  type LocaleDefinition,
} from '@/i18n/localeRegistry';
import {getRecommendedLocaleId} from '@/i18n/resolveDeviceLanguage';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows, layout, fonts} from '@/theme/designTokens';
import {GymlyPressable} from '@/components/ui/GymlyPressable';
import {OnboardingPrimaryButton, ONBOARDING} from '@/components/onboarding';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

const SPLASH_KETTLEBELL = require('@/assets/images/splash-kettlebell.png');

type Props = {
  mode: 'onboarding' | 'settings';
};

export function LanguageScreenContent({mode}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {language, setLanguage, t} = useTranslation();
  const isOnboarding = mode === 'onboarding';

  const activeLanguage = toSelectableLanguage(language);
  const recommendedId = useMemo(() => getRecommendedLocaleId(), []);
  const [pending, setPending] = useState<SelectableLanguage>(activeLanguage);
  const [query, setQuery] = useState('');
  const fade = useRef(new Animated.Value(0)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;

  const readyLocales = useMemo(() => {
    const all = getReadyLocales().filter(l =>
      (SELECTABLE_LANGUAGES as string[]).includes(l.id),
    );
    return all.filter(l => matchesLocaleSearch(l, query));
  }, [query]);

  const recommended = useMemo(() => {
    if (query.trim()) {
      return null;
    }
    return readyLocales.find(l => l.id === recommendedId) ?? null;
  }, [readyLocales, recommendedId, query]);

  const otherLocales = useMemo(() => {
    if (!recommended) {
      return readyLocales;
    }
    return readyLocales.filter(l => l.id !== recommended.id);
  }, [readyLocales, recommended]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(logoFloat, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    );
    if (isOnboarding) {
      loop.start();
    }
    return () => loop.stop();
  }, [fade, isOnboarding, logoFloat]);

  const title = isOnboarding
    ? t('language.onboardingTitle')
    : t('language.chooseTitle');
  const subtitle = isOnboarding
    ? t('language.onboardingSubtitle')
    : t('language.chooseSubtitle');

  const selectedId = isOnboarding ? pending : activeLanguage;

  const handleSelect = (lang: SelectableLanguage) => {
    setPending(lang);
    // Apply immediately so onboarding copy + settings UI update at once.
    void setLanguage(lang as AppLanguage);
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

  const renderRow = (locale: LocaleDefinition) => {
    const selected = selectedId === locale.id;
    return (
      <GymlyPressable
        key={locale.id}
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => handleSelect(locale.id as SelectableLanguage)}
        haptic="selection"
        accessibilityRole="radio"
        accessibilityState={{selected}}>
        <Text style={styles.flag}>{locale.flag}</Text>
        <View style={styles.rowText}>
          <Text style={[styles.nativeName, selected && styles.nativeNameSelected]}>
            {locale.nativeName}
          </Text>
          {locale.englishName !== locale.nativeName ? (
            <Text style={styles.englishName}>{locale.englishName}</Text>
          ) : null}
        </View>
        {selected ? (
          <Icon name="checkmark-circle" size={24} color={colors.primary} />
        ) : (
          <View style={styles.radio} />
        )}
      </GymlyPressable>
    );
  };

  return (
    <View
      style={[
        styles.root,
        {paddingTop: insets.top},
        isOnboarding && styles.rootOnboarding,
      ]}>
      {isOnboarding ? (
        <View style={styles.bgGradientWrap} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="langBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ONBOARDING.bgTop} stopOpacity="1" />
                <Stop
                  offset="1"
                  stopColor={ONBOARDING.bgBottom}
                  stopOpacity="1"
                />
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

      <Animated.View style={[styles.body, {opacity: fade}]}>
        {isOnboarding ? (
          <Animated.View
            style={[
              styles.logoWrap,
              {transform: [{translateY: logoTranslateY}]},
            ]}>
            <View style={styles.logoGlow} />
            <Image
              source={SPLASH_KETTLEBELL}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        ) : null}

        <Text style={[styles.title, isOnboarding && styles.titleOnboarding]}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.searchWrap}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={t('language.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && Platform.OS === 'android' ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={otherLocales}
          keyExtractor={item => item.id}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom: isOnboarding
                ? 100 + insets.bottom
                : insets.bottom + spacing.xl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {recommended ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>
                    {t('language.recommended')}
                  </Text>
                  {renderRow(recommended)}
                </View>
              ) : null}
              {otherLocales.length > 0 ? (
                <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
                  {t('language.allLanguages')}
                </Text>
              ) : null}
              {readyLocales.length === 0 ? (
                <Text style={styles.empty}>{t('language.noResults')}</Text>
              ) : null}
            </>
          }
          renderItem={({item}) => renderRow(item)}
        />
      </Animated.View>

      {isOnboarding ? (
        <View
          style={[
            styles.footer,
            {paddingBottom: Math.max(insets.bottom, spacing.md)},
          ]}>
          <OnboardingPrimaryButton
            label={t('language.continue')}
            onPress={() => void handleContinue()}
          />
        </View>
      ) : null}
    </View>
  );
}

const LanguageOnboardingScreen = () => (
  <LanguageScreenContent mode="onboarding" />
);

export default LanguageOnboardingScreen;

export function LanguageSettingsScreen() {
  return <LanguageScreenContent mode="settings" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  rootOnboarding: {
    backgroundColor: ONBOARDING.bgBottom,
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
  body: {
    flex: 1,
    paddingHorizontal: layout.screenPaddingH + spacing.sm,
  },
  logoWrap: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    opacity: 0.12,
  },
  logo: {
    width: 64,
    height: 64,
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
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.text,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    minHeight: 48,
    marginBottom: spacing.md,
  },
  search: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sectionLabelSpaced: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  rowSelected: {
    borderColor: colors.primary + '66',
    backgroundColor: colors.primary + '0A',
  },
  flag: {
    fontSize: 26,
    width: 34,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
  },
  nativeName: {
    fontSize: 17,
    fontFamily: fonts.text,
    fontWeight: '600',
    color: colors.text,
  },
  nativeNameSelected: {
    fontWeight: '800',
    color: colors.primaryDark,
  },
  englishName: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPaddingH + spacing.sm,
    paddingTop: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
