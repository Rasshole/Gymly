/**
 * Language selection — global flat picker (ready locales only).
 * Scales from 4 → 50+ without redesign. No flags / recommended / section cards.
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
  FlatList,
  Platform,
  Pressable,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {
  useTranslation,
  toSelectableLanguage,
  type SelectableLanguage,
  type AppLanguage,
} from '@/i18n';
import {
  matchesLocaleSearch,
  type LocaleDefinition,
} from '@/i18n/localeRegistry';
import {getSelectablePickerLocales} from '@/i18n/selectableLocales';
import {readDeviceLanguagePreferences} from '@/i18n/deviceLanguagePreferences';
import {resolveLanguageFromPreferences} from '@/i18n/resolveDeviceLanguage';
import colors from '@/theme/colors';
import {spacing, radius, typography, layout, fonts} from '@/theme/designTokens';
import {GymlyPressable} from '@/components/ui/GymlyPressable';
import GymlyLogo from '@/components/GymlyLogo';

type Props = {
  mode: 'onboarding' | 'settings';
};

export function LanguageScreenContent({mode}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {language, setLanguage, t} = useTranslation();
  const isOnboarding = mode === 'onboarding';

  const activeLanguage = toSelectableLanguage(language);
  const deviceDefault = useMemo(
    () => resolveLanguageFromPreferences(readDeviceLanguagePreferences()),
    [],
  );
  const [pending, setPending] = useState<SelectableLanguage>(() =>
    isOnboarding ? deviceDefault : activeLanguage,
  );
  const [query, setQuery] = useState('');
  const fade = useRef(new Animated.Value(0)).current;

  const filteredLocales = useMemo(() => {
    return getSelectablePickerLocales().filter(l => matchesLocaleSearch(l, query));
  }, [query]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  const title = isOnboarding
    ? t('language.onboardingTitle')
    : t('language.chooseTitle');
  const subtitle = isOnboarding
    ? t('language.onboardingSubtitle')
    : t('language.chooseSubtitle');

  const selectedId = isOnboarding ? pending : activeLanguage;

  const handleSelect = (lang: SelectableLanguage) => {
    setPending(lang);
    // Live preview of copy; Continue (onboarding) or select (settings) persists.
    void setLanguage(lang as AppLanguage, {
      persist: !isOnboarding,
    });
  };

  const handleContinue = async () => {
    await setLanguage(pending);
    if (isOnboarding) {
      navigation.replace('Register');
    }
  };

  const renderRow = ({item: locale}: {item: LocaleDefinition}) => {
    const selected = selectedId === locale.id;
    return (
      <GymlyPressable
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => handleSelect(locale.id as SelectableLanguage)}
        haptic="selection"
        accessibilityRole="radio"
        accessibilityState={{selected}}
        testID={`language-row-${locale.id}`}>
        <View style={styles.rowText}>
          <Text
            style={[styles.nativeName, selected && styles.nativeNameSelected]}>
            {locale.nativeName}
          </Text>
          {locale.englishName !== locale.nativeName ? (
            <Text style={styles.englishName}>{locale.englishName}</Text>
          ) : null}
        </View>
        {selected ? (
          <Icon
            name="checkmark"
            size={22}
            color={colors.primary}
            accessibilityLabel="selected"
          />
        ) : (
          <View style={styles.checkSpacer} />
        )}
      </GymlyPressable>
    );
  };

  return (
    <View style={[styles.root, {paddingTop: insets.top}]}>
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
          <View style={styles.logoWrap} testID="language-gymly-mark">
            <GymlyLogo size={40} />
          </View>
        ) : null}

        <Text style={[styles.title, isOnboarding && styles.titleOnboarding]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

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
            testID="language-search"
          />
          {query.length > 0 && Platform.OS === 'android' ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={filteredLocales}
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
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{t('language.noResults')}</Text>
          }
          renderItem={renderRow}
          testID="language-list"
        />
      </Animated.View>

      {isOnboarding ? (
        <View
          style={[
            styles.footer,
            {paddingBottom: Math.max(insets.bottom, spacing.md)},
          ]}>
          <Pressable
            onPress={() => void handleContinue()}
            style={({pressed}) => [
              styles.continueBtn,
              pressed && styles.continueBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('language.continue')}
            testID="language-continue">
            <Text style={styles.continueLabel}>{t('language.continue')}</Text>
          </Pressable>
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
    backgroundColor: colors.backgroundLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.backgroundLight,
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
    marginBottom: spacing.md,
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
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  search: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'transparent',
  },
  rowSelected: {
    backgroundColor: colors.primary + '12',
    borderRadius: radius.md,
  },
  rowText: {
    flex: 1,
  },
  nativeName: {
    fontSize: 17,
    fontFamily: fonts.text,
    fontWeight: '500',
    color: colors.text,
  },
  nativeNameSelected: {
    fontWeight: '700',
    color: colors.text,
  },
  englishName: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  checkSpacer: {
    width: 22,
    height: 22,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.sm,
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
    backgroundColor: colors.backgroundLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  continueBtn: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  continueBtnPressed: {
    opacity: 0.88,
  },
  continueLabel: {
    ...typography.bodyBold,
    color: colors.white,
    textAlign: 'center',
  },
});
