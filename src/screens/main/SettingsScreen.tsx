/**
 * Settings Screen
 * Comprehensive app settings - account, privacy, notifications, preferences, support
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import {usePrivacyStore} from '@/store/privacyStore';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';

const SettingsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user, logout, deleteAccount} = useAppStore();
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
  const [language, setLanguage] = useState<'da' | 'en'>('da');

  const handleMarketingToggle = async (value: boolean) => {
    setMarketingEnabled(value);
    try {
      await updateMarketingConsent(value);
    } catch {
      Alert.alert('Fejl', 'Kunne ikke opdatere indstilling');
      setMarketingEnabled(!value);
    }
  };

  const handleAnalyticsToggle = async (value: boolean) => {
    setAnalyticsEnabled(value);
    try {
      await updateAnalyticsConsent(value);
    } catch {
      Alert.alert('Fejl', 'Kunne ikke opdatere indstilling');
      setAnalyticsEnabled(!value);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Log ud',
      'Er du sikker på du vil logge ud?',
      [
        {text: 'Annuller', style: 'cancel'},
        {text: 'Log ud', style: 'destructive', onPress: () => logout()},
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Slet konto',
      'Er du sikker på du vil slette din konto? Denne handling kan ikke fortrydes. Alle dine data vil blive slettet permanent.',
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Slet konto',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Bekræft sletning',
              'Din konto og alle tilknyttede data vil blive slettet nu. Dette kan ikke fortrydes.',
              [
                {text: 'Annuller', style: 'cancel'},
                {
                  text: 'Slet permanent',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                    } catch (err) {
                      Alert.alert('Fejl', 'Kunne ikke slette konto. Prøv igen.');
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
    Alert.alert(
      'Hent data',
      'Du kan anmode om en kopi af dine data ved at kontakte support@gymly.dk. Vi sender dig en eksport inden for 30 dage (GDPR artikel 20).',
      [{text: 'OK'}]
    );
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
        <Icon name={icon as any} size={22} color={iconColor || colors.primary} />
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
        <Icon name={icon as any} size={22} color={iconColor || colors.primary} />
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
      {children}
    </View>
  );

  const appearanceLabel = appearance === 'system' ? 'System' : appearance === 'light' ? 'Lys' : 'Mørk';
  const unitsLabel = units === 'metric' ? 'kg, km' : 'lbs, miles';
  const languageLabel = language === 'da' ? 'Dansk' : 'English';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Konto */}
        <Section title="KONTO">
          <SettingRow
            icon="person-outline"
            title="Rediger profil"
            subtitle="Navn, billede, bio"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingRow
            icon="mail-outline"
            title="Skift email"
            onPress={() => navigation.navigate('ChangeEmail')}
          />
          <SettingRow
            icon="lock-closed-outline"
            title="Skift adgangskode"
            onPress={() =>
              Alert.alert('Kommer snart', 'Funktionen til at skifte adgangskode kommer snart.')
            }
          />
          <SettingRow
            icon="download-outline"
            title="Hent mine data"
            subtitle="GDPR – eksport af dine data"
            onPress={handleExportData}
          />
        </Section>

        {/* Privatliv */}
        <Section title="PRIVATLIV">
          <SettingRow
            icon="shield-checkmark-outline"
            title="Privatlivsindstillinger"
            subtitle="Profil synlighed, placering, deling"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingRow
            icon="ban-outline"
            title="Blokeret brugere"
            onPress={() =>
              Alert.alert('Kommer snart', 'Administration af blokerede brugere kommer snart.')
            }
          />
        </Section>

        {/* Notifikationer */}
        <Section title="NOTIFIKATIONER">
          <SettingRow
            icon="notifications-outline"
            title="Push notifikationer"
            subtitle="Træningsinvitationer, venner, grupper"
            onPress={() => navigation.navigate('PushNotifications')}
          />
          <SettingSwitch
            icon="mail-outline"
            title="Email notifikationer"
            subtitle="Nyheder og tilbud via email"
            value={marketingEnabled}
            onValueChange={handleMarketingToggle}
          />
        </Section>

        {/* App & Præferencer */}
        <Section title="APP & PRÆFERENCER">
          <SettingRow
            icon="phone-portrait-outline"
            title="Forbind app eller enhed"
            subtitle="Apple Health, Garmin, etc."
            onPress={() => navigation.navigate('ConnectDevice')}
          />
          <SettingRow
            icon="options-outline"
            title="Udseende"
            rightElement={
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{appearanceLabel}</Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            }
            onPress={() =>
              Alert.alert(
                'Udseende',
                'Vælg tema',
                [
                  {text: 'System', onPress: () => setAppearance('system')},
                  {text: 'Lys', onPress: () => setAppearance('light')},
                  {text: 'Mørk', onPress: () => setAppearance('dark')},
                  {text: 'Annuller', style: 'cancel'},
                ]
              )
            }
          />
          <SettingRow
            icon="resize-outline"
            title="Måleenheder"
            rightElement={
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{unitsLabel}</Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            }
            onPress={() =>
              Alert.alert(
                'Måleenheder',
                'Vælg måleenheder',
                [
                  {text: 'kg, km', onPress: () => setUnits('metric')},
                  {text: 'lbs, miles', onPress: () => setUnits('imperial')},
                  {text: 'Annuller', style: 'cancel'},
                ]
              )
            }
          />
          <SettingRow
            icon="language-outline"
            title="Sprog"
            rightElement={
              <View style={styles.rowValueContainer}>
                <Text style={styles.rowValue}>{languageLabel}</Text>
                <Icon name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            }
            onPress={() =>
              Alert.alert(
                'Sprog',
                'Vælg sprog',
                [
                  {text: 'Dansk', onPress: () => setLanguage('da')},
                  {text: 'English', onPress: () => setLanguage('en')},
                  {text: 'Annuller', style: 'cancel'},
                ]
              )
            }
          />
          <SettingRow
            icon="swap-vertical-outline"
            title="Feed sortering"
            subtitle="Sorter aktiviteter i feed"
            onPress={() => navigation.navigate('FeedSorting')}
          />
          <SettingSwitch
            icon="play-circle-outline"
            title="Automatisk afspilning af video"
            value={autoplayVideo}
            onValueChange={setAutoplayVideo}
          />
        </Section>

        {/* GDPR & Privatliv */}
        <Section title="PRIVATLIV & GDPR">
          <SettingSwitch
            icon="analytics-outline"
            title="Anonymiseret analyse"
            subtitle="Hjælp os med at forbedre appen"
            value={analyticsEnabled}
            onValueChange={handleAnalyticsToggle}
          />
          <SettingRow
            icon="document-text-outline"
            title="Privatlivspolitik"
            onPress={() => navigation.navigate('PrivacyPolicy')}
          />
          <SettingRow
            icon="document-outline"
            title="Brugervilkår"
            onPress={() => navigation.navigate('Terms')}
          />
        </Section>

        {/* Support */}
        <Section title="SUPPORT">
          <SettingRow
            icon="help-circle-outline"
            title="Hjælp & FAQ"
            onPress={() => navigation.navigate('Help')}
          />
          <SettingRow
            icon="chatbubble-outline"
            title="Kontakt support"
            onPress={() => navigation.navigate('Support')}
          />
          <SettingRow
            icon="information-circle-outline"
            title="Om Gymly"
            onPress={() => navigation.navigate('AboutGymly')}
          />
        </Section>

        {/* Konto info */}
        <View style={styles.accountInfo}>
          <Text style={styles.accountInfoLabel}>Email</Text>
          <Text style={styles.accountInfoValue}>{user?.email}</Text>
          </View>

        {/* Log ud */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}>
          <Icon name="log-out-outline" size={22} color={colors.error} />
          <Text style={styles.logoutButtonText}>Log ud</Text>
        </TouchableOpacity>

        {/* Slet konto */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
          activeOpacity={0.8}>
          <Text style={styles.deleteButtonText}>Slet konto</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.versionText}>Gymly version 1.0.0</Text>
      </ScrollView>
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
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
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
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.error,
    gap: 8,
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
});

export default SettingsScreen;
