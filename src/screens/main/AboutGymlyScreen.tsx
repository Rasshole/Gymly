/**
 * About Gymly — premium marketing / brand screen (DA + EN via i18n).
 */

import React, {useMemo} from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from '@/i18n';
import {AboutBrandHeader, AboutFeatureCard, useStaggeredFadeIn} from '@/components/about';
import {layout, radius, shadows, spacing, typography} from '@/theme/designTokens';

const ACCENT = '#7C3AED';
const ACCENT_LIGHT = 'rgba(124, 58, 237, 0.12)';

const FEATURES = [
  {
    key: 'feature1' as const,
    icon: 'location',
    iconColor: '#7C3AED',
    iconBg: 'rgba(124, 58, 237, 0.12)',
  },
  {
    key: 'feature2' as const,
    icon: 'trending-up',
    iconColor: '#059669',
    iconBg: 'rgba(16, 185, 129, 0.12)',
  },
  {
    key: 'feature3' as const,
    icon: 'people',
    iconColor: '#2563EB',
    iconBg: 'rgba(37, 99, 235, 0.12)',
  },
  {
    key: 'feature4' as const,
    icon: 'flame',
    iconColor: '#EA580C',
    iconBg: 'rgba(234, 88, 12, 0.12)',
  },
] as const;

const AboutGymlyScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {t} = useTranslation();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const heroAnim = useStaggeredFadeIn(1, 80);
  const visionAnim = useStaggeredFadeIn(6, 70);
  const footerAnim = useStaggeredFadeIn(7, 70);
  const ctaAnim = useStaggeredFadeIn(8, 70);

  const featureItems = useMemo(
    () =>
      FEATURES.map((f, i) => ({
        ...f,
        index: i,
        title: t(`about.${f.key}Title`),
        body: t(`about.${f.key}Body`),
      })),
    [t],
  );

  const visionBullets = [
    t('about.visionSocial'),
    t('about.visionMotivating'),
    t('about.visionEngaging'),
  ];

  const bg = isDark ? '#0F172A' : '#F8FAFC';
  const headerBg = isDark ? '#111827' : '#FFFFFF';
  const headerBorder = isDark ? '#1F2937' : '#E5E7EB';
  const textPrimary = isDark ? '#F9FAFB' : '#111827';
  const textSecondary = isDark ? '#9CA3AF' : '#4B5563';

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: bg}]} edges={['top']}>
      <View
        style={[
          styles.header,
          {backgroundColor: headerBg, borderBottomColor: headerBorder},
        ]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: textPrimary}]}>{t('about.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <AboutBrandHeader isDark={isDark} />

        <Animated.View
          style={[
            styles.heroBlock,
            {opacity: heroAnim.opacity, transform: [{translateY: heroAnim.translateY}]},
          ]}>
          <Text style={[styles.heroTitle, {color: textPrimary}]}>{t('about.heroTitle')}</Text>
          <Text style={[styles.heroDescription, {color: textSecondary}]}>
            {t('about.description')}
          </Text>
        </Animated.View>

        <View style={styles.features}>
          {featureItems.map(item => (
            <AboutFeatureCard
              key={item.key}
              index={item.index}
              icon={item.icon}
              iconColor={item.iconColor}
              iconBg={item.iconBg}
              title={item.title}
              body={item.body}
              isDark={isDark}
            />
          ))}
        </View>

        <Animated.View
          style={[
            styles.visionCard,
            isDark ? styles.visionCardDark : styles.visionCardLight,
            shadows.md,
            {opacity: visionAnim.opacity, transform: [{translateY: visionAnim.translateY}]},
          ]}>
          <Text style={[styles.visionTitle, {color: textPrimary}]}>{t('about.visionTitle')}</Text>
          <Text style={[styles.visionIntro, {color: textSecondary}]}>
            {t('about.visionIntro')}
          </Text>
          {visionBullets.map((line, i) => (
            <View key={i} style={styles.visionRow}>
              <View style={[styles.visionDot, {backgroundColor: ACCENT}]} />
              <Text style={[styles.visionLine, {color: textPrimary}]}>{line}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View
          style={[
            styles.footerCard,
            isDark ? styles.footerCardDark : styles.footerCardLight,
            shadows.card,
            {opacity: footerAnim.opacity, transform: [{translateY: footerAnim.translateY}]},
          ]}>
          <Text style={[styles.footerLine, {color: textPrimary}]}>{t('about.footerLine1')}</Text>
          <Text style={[styles.footerSub, {color: textSecondary}]}>{t('about.footerLine2')}</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.ctaWrap,
            {opacity: ctaAnim.opacity, transform: [{translateY: ctaAnim.translateY}]},
          ]}>
          <View style={styles.ctaPill}>
            <Text style={styles.ctaText}>{t('about.cta')}</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingH,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: spacing.xs,
    width: 40,
  },
  headerTitle: {
    ...typography.h4,
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  heroBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  heroTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  heroDescription: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 340,
  },
  features: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  visionCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  visionCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(124, 58, 237, 0.1)',
  },
  visionCardDark: {
    backgroundColor: '#1F2937',
    borderColor: 'rgba(167, 139, 250, 0.12)',
  },
  visionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  visionIntro: {
    ...typography.small,
    marginBottom: spacing.md,
  },
  visionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  visionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  visionLine: {
    ...typography.body,
    flex: 1,
  },
  footerCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footerCardLight: {
    backgroundColor: ACCENT_LIGHT,
    borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  footerCardDark: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  footerLine: {
    ...typography.bodyBold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  footerSub: {
    ...typography.small,
    textAlign: 'center',
  },
  ctaWrap: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  ctaPill: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
  },
  ctaText: {
    ...typography.bodyBold,
    color: ACCENT,
    textAlign: 'center',
  },
});

export default AboutGymlyScreen;
