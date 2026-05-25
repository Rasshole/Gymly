/**
 * Settings Screen
 * Comprehensive app settings - account, privacy, notifications, preferences, support
 */

import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import {usePrivacyStore} from '@/store/privacyStore';
import {useDemoModeStore} from '@/demo/demoModeStore';
import {seedDemoStores, clearDemoStoresAfterDisable} from '@/demo/seedDemoStores';
import AuthService from '@/services/auth/AuthService';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows, layout, iconSize} from '@/theme/designTokens';
import {SURFACE_DEMO_MODE_IN_SETTINGS} from '@/config/launchSurfaceConfig';
import {useTranslation} from '@/i18n';

const SettingsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user, logout, deleteAccount} = useAppStore();
  const {t, languageLabel} = useTranslation();
  const {consent, updateMarketingConsent, updateAnalyticsConsent} = usePrivacyStore();

  const [marketingEnabled, setMarketingEnabled] = useState(
    consent?.marketingConsent ?? false
  );
  const [analyticsEnabled, setAnalyticsEnabled] = useState(
    consent?.analyticsConsent ?? false
  );
  const [autoplayVideo, setAutoplayVideo] = useState(true);
  const [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>('system');
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [deviceComingSoonOpen, setDeviceComingSoonOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const demoEnabled = useDemoModeStore(s => s.enabled);
  const setDemoEnabledPersisted = useDemoModeStore(s => s.setEnabled);
  const deviceModalOpacity = useRef(new Animated.Value(0)).current;
  const deviceModalScale = useRef(new Animated.Value(0.95)).current;

  const handleMarketingToggle = async (value: boolean) => {
    setMarketingEnabled(value);
    try {
      await updateMarketingConsent(value);
    } catch {
      Alert.alert(t('common.error'), t('settings.updateFailed'));
      setMarketingEnabled(!value);
    }
  };

  const handleAnalyticsToggle = async (value: boolean) => {
    setAnalyticsEnabled(value);
    try {
      await updateAnalyticsConsent(value);
    } catch {
      Alert.alert(t('common.error'), t('settings.updateFailed'));
      setAnalyticsEnabled(!value);
    }
  };

  const handleDemoContentToggle = async (next: boolean) => {
    if (!__DEV__) {
      return;
    }
    if (!user?.id) {
      Alert.alert(t('auth.loginTitle'), t('settings.demoLoginRequired'));
      return;
    }
    if (demoBusy) {
      return;
    }
    setDemoBusy(true);
    try {
      if (!next) {
        await setDemoEnabledPersisted(false);
        await clearDemoStoresAfterDisable(user.id);
      } else {
        await setDemoEnabledPersisted(true);
        seedDemoStores(user.id);
      }
    } catch {
      Alert.alert(t('common.error'), t('settings.demoUpdateFailed'));
    } finally {
      setDemoBusy(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: () => {
            void logout();
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteAccountConfirm'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('settings.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('settings.deleteAccountFinal'),
              t('settings.deleteAccountFinalBody'),
              [
                {text: t('common.cancel'), style: 'cancel'},
                {
                  text: t('settings.deletePermanent'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                    } catch (err) {
                      Alert.alert(t('common.error'), t('settings.deleteFailed'));
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(t('settings.exportTitle'), t('settings.exportBody'), [
      {text: t('common.ok')},
    ]);
  };

  const handlePasswordReset = () => {
    if (!user?.email) {
      Alert.alert(t('settings.passwordResetTitle'), t('settings.passwordResetNoEmail'));
      return;
    }
    Alert.alert(t('settings.passwordResetTitle'), t('settings.passwordResetBody'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('settings.passwordResetSend'),
        onPress: async () => {
          try {
            await AuthService.requestPasswordReset(user.email);
            Alert.alert(t('settings.passwordResetTitle'), t('settings.passwordResetSent'));
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : t('settings.passwordResetFailed');
            Alert.alert(t('settings.passwordResetTitle'), msg);
          }
        },
      },
    ]);
  };

  const openDeviceComingSoon = () => {
    setDeviceComingSoonOpen(true);
    deviceModalOpacity.setValue(0);
    deviceModalScale.setValue(0.95);
    Animated.parallel([
      Animated.timing(deviceModalOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(deviceModalScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDeviceComingSoon = () => {
    Animated.parallel([
      Animated.timing(deviceModalOpacity, {
        toValue: 0,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(deviceModalScale, {
        toValue: 0.96,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      if (finished) {
        setDeviceComingSoonOpen(false);
      }
    });
  };

  const SettingRow = ({
    icon,
    iconColor,
    title,
    subtitle,
    onPress,
    rightElement,
    showChevron = true,
  }: {
    icon: string;
    iconColor?: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    showChevron?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.rowIcon, iconColor && {backgroundColor: iconColor + '20'}]}>
        <Icon name={icon as any} size={iconSize.md} color={iconColor || colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement || (showChevron && onPress && (
        <Icon name="chevron-forward" size={20} color={colors.textMuted} />
      ))}
    </TouchableOpacity>
  );

  const SettingSwitch = ({
    icon,
    iconColor,
    title,
    subtitle,
    value,
    onValueChange,
  }: {
    icon: string;
    iconColor?: string;
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
  }) => (
    <View style={styles.row}>
      <View style={[styles.rowIcon, iconColor && {backgroundColor: iconColor + '20'}]}>
        <Icon name={icon as any} size={iconSize.md} color={iconColor || colors.primary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{false: '#E5E5EA', true: colors.primary}}
        thumbColor="#fff"
      />
    </View>
  );

  const Section = ({title, children}: {title: string; children: React.ReactNode}) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );

  const appearanceLabel =
    appearance === 'system'
      ? t('settings.appearanceValueSystem')
      : appearance === 'light'
        ? t('settings.appearanceValueLight')
        : t('settings.appearanceValueDark');
  const unitsLabel =
    units === 'metric' ? t('settings.unitsValueMetric') : t('settings.unitsValueImperial');
  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Konto */}
        <Section title={t('settings.account')}>
          <SettingRow
            icon="person-outline"
            title={t('settings.editProfile')}
            subtitle={t('settings.editProfileSub')}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingRow
            icon="mail-outline"
            title={t('settings.changeEmail')}
            onPress={() => navigation.navigate('ChangeEmail')}
          />
          <SettingRow
            icon="lock-closed-outline"
            title={t('settings.changePassword')}
            onPress={handlePasswordReset}
          />
          <SettingRow
            icon="download-outline"
            title={t('settings.exportData')}
            subtitle={t('settings.exportDataSub')}
            onPress={handleExportData}
          />
        </Section>

        {/* Privatliv */}
        <Section title={t('settings.privacy')}>
          <SettingRow
            icon="shield-checkmark-outline"
            title={t('settings.privacySettings')}
            subtitle={t('settings.privacySettingsSub')}
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingRow
            icon="ban-outline"
            title={t('settings.blockedUsers')}
            onPress={() =>
              Alert.alert(t('common.comingSoon'), t('settings.blockedSoon'))
            }
          />
        </Section>

        {/* Notifikationer */}
        <Section title={t('settings.notifications')}>
          <SettingRow
            icon="notifications-outline"
            title={t('settings.pushNotifications')}
            subtitle={t('settings.pushNotificationsSub')}
            onPress={() => navigation.navigate('PushNotifications')}
          />
          <SettingSwitch
            icon="mail-outline"
            title={t('settings.emailNotifications')}
            subtitle={t('settings.emailNotificationsSub')}
            value={marketingEnabled}
            onValueChange={handleMarketingToggle}
          />
        </Section>

        {/* App & Præferencer */}
        <Section title={t('settings.appPrefs')}>
          <SettingRow
            icon="phone-portrait-outline"
            title={t('settings.connectDevice')}
            subtitle={t('settings.connectDeviceSub')}
            onPress={openDeviceComingSoon}
          />
          <SettingRow
            icon="options-outline"
            title={t('settings.appearance')}
            rightElement={
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{appearanceLabel}</Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            }
            onPress={() =>
              Alert.alert(t('settings.appearance'), t('settings.appearancePick'), [
                  {text: t('settings.appearanceSystem'), onPress: () => setAppearance('system')},
                  {text: t('settings.appearanceLight'), onPress: () => setAppearance('light')},
                  {text: t('settings.appearanceDark'), onPress: () => setAppearance('dark')},
                  {text: t('common.cancel'), style: 'cancel'},
                ])
            }
          />
          <SettingRow
            icon="resize-outline"
            title={t('settings.units')}
            rightElement={
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{unitsLabel}</Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            }
            onPress={() =>
              Alert.alert(t('settings.units'), t('settings.unitsPick'), [
                  {text: t('settings.unitsMetric'), onPress: () => setUnits('metric')},
                  {text: t('settings.unitsImperial'), onPress: () => setUnits('imperial')},
                  {text: t('common.cancel'), style: 'cancel'},
                ])
            }
          />
          <SettingRow
            icon="language-outline"
            title={t('settings.language')}
            rightElement={
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{languageLabel}</Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            }
            onPress={() => navigation.navigate('LanguageSettings')}
          />
          <SettingRow
            icon="swap-vertical-outline"
            title={t('settings.feedSorting')}
            subtitle={t('settings.feedSortingSub')}
            onPress={() => navigation.navigate('FeedSorting')}
          />
          <SettingSwitch
            icon="play-circle-outline"
            title={t('settings.autoplayVideo')}
            value={autoplayVideo}
            onValueChange={setAutoplayVideo}
          />
        </Section>

        {/* GDPR & Privatliv */}
        <Section title={t('settings.gdpr')}>
          <SettingSwitch
            icon="analytics-outline"
            title={t('settings.analytics')}
            subtitle={t('settings.analyticsSub')}
            value={analyticsEnabled}
            onValueChange={handleAnalyticsToggle}
          />
          <SettingRow
            icon="document-text-outline"
            title={t('settings.privacyPolicy')}
            onPress={() => navigation.navigate('PrivacyPolicy')}
          />
          <SettingRow
            icon="document-outline"
            title={t('settings.terms')}
            onPress={() => navigation.navigate('Terms')}
          />
        </Section>

        {__DEV__ && SURFACE_DEMO_MODE_IN_SETTINGS ? (
          <Section title="INTERN — DEMO / OPTAGELSE">
            <View style={{opacity: demoBusy ? 0.55 : 1}}>
              <SettingSwitch
                icon="videocam-outline"
                iconColor={colors.secondary}
                title="Demo-indhold (optagelse)"
                subtitle={t('settings.demoContentSub')}
                value={demoEnabled}
                onValueChange={v => {
                  handleDemoContentToggle(v).catch(() => {});
                }}
              />
            </View>
          </Section>
        ) : null}

        {/* Support */}
        <Section title={t('settings.support')}>
          <SettingRow
            icon="help-circle-outline"
            title={t('settings.help')}
            onPress={() => navigation.navigate('Help')}
          />
          <SettingRow
            icon="chatbubble-outline"
            title={t('settings.supportRow')}
            onPress={() => navigation.navigate('Support')}
          />
          <SettingRow
            icon="information-circle-outline"
            title={t('settings.about')}
            onPress={() => navigation.navigate('AboutGymly')}
          />
        </Section>

        {/* Konto info */}
        <View style={styles.accountInfo}>
          <Text style={styles.accountInfoLabel}>{t('settings.accountEmail')}</Text>
          <Text style={styles.accountInfoValue}>{user?.email}</Text>
          </View>

        {/* Log ud */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}>
          <Icon name="log-out-outline" size={22} color={colors.error} />
          <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
        </TouchableOpacity>

        {/* Slet konto */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
          activeOpacity={0.8}>
          <Text style={styles.deleteButtonText}>{t('settings.deleteAccount')}</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.versionText}>Gymly version 1.0.0</Text>
      </ScrollView>

      <Modal
        transparent
        visible={deviceComingSoonOpen}
        animationType="none"
        onRequestClose={closeDeviceComingSoon}>
        <Pressable style={styles.deviceModalBackdrop} onPress={closeDeviceComingSoon}>
          <Pressable onPress={e => e.stopPropagation()}>
            <Animated.View
              style={[
                styles.deviceModalCard,
                {
                  opacity: deviceModalOpacity,
                  transform: [{scale: deviceModalScale}],
                },
              ]}>
              <Text style={styles.deviceModalIcon}>⌚</Text>
              <Text style={styles.deviceModalTitle}>{t('settings.deviceConnectTitle')}</Text>
              <Text style={styles.deviceModalMessage}>{t('settings.deviceConnectSoon')}</Text>
              <Text style={styles.deviceModalSubtext}>
                {t('settings.deviceConnectIntegrations')}
              </Text>
              <TouchableOpacity
                style={styles.deviceModalPrimaryButton}
                onPress={closeDeviceComingSoon}
                activeOpacity={0.9}>
                <Text style={styles.deviceModalPrimaryButtonText}>{t('common.ok')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deviceModalSecondaryButton}
                onPress={() => {
                  closeDeviceComingSoon();
                  Alert.alert(t('common.comingSoon'), t('settings.deviceNotifySoon'));
                }}
                activeOpacity={0.8}>
                <Text style={styles.deviceModalSecondaryButtonText}>
                  {t('settings.deviceNotifyMe')}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowValue: {
    fontSize: 15,
    color: colors.textMuted,
  },
  accountInfo: {
    backgroundColor: colors.backgroundCard,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  accountInfoLabel: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  accountInfoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    gap: spacing.sm,
    minHeight: layout.rowMinHeight,
    ...shadows.sm,
  },
  logoutButtonText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  deleteButtonText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
  },
  deviceModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deviceModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.backgroundCard,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  deviceModalIcon: {
    fontSize: 30,
    marginBottom: 10,
  },
  deviceModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  deviceModalMessage: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  deviceModalSubtext: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  deviceModalPrimaryButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  deviceModalPrimaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  deviceModalSecondaryButton: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deviceModalSecondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default SettingsScreen;
