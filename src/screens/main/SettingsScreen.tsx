/**
 * Settings Screen
 * App settings, privacy controls, and account management
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
  Linking,
  Platform,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import {usePrivacyStore} from '@/store/privacyStore';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';
import {typography} from '@/theme/typography';
import {Card, ConfirmDialog, LoadingSpinner} from '@/components/ui';

const SettingsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user, logout, setUser} = useAppStore();
  const {consent, updateMarketingConsent, updateAnalyticsConsent} = usePrivacyStore();

  const [marketingEnabled, setMarketingEnabled] = useState(
    consent?.marketingConsent || false
  );
  const [analyticsEnabled, setAnalyticsEnabled] = useState(
    consent?.analyticsConsent || false
  );
  const [autoplayVideo, setAutoplayVideo] = useState(true);
  const [appearance, setAppearance] = useState('Lys tilstand');
  const [unitsOfMeasurement, setUnitsOfMeasurement] = useState('Kilometer');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isUpdatingMarketing, setIsUpdatingMarketing] = useState(false);
  const [isUpdatingAnalytics, setIsUpdatingAnalytics] = useState(false);

  const handleMarketingToggle = async (value: boolean) => {
    setMarketingEnabled(value);
    setIsUpdatingMarketing(true);
    try {
      await updateMarketingConsent(value);
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke opdatere indstilling');
      setMarketingEnabled(!value);
    } finally {
      setIsUpdatingMarketing(false);
    }
  };

  const handleAnalyticsToggle = async (value: boolean) => {
    setAnalyticsEnabled(value);
    setIsUpdatingAnalytics(true);
    try {
      await updateAnalyticsConsent(value);
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke opdatere indstilling');
      setAnalyticsEnabled(!value);
    } finally {
      setIsUpdatingAnalytics(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
  };

  const handleFeedback = async () => {
    // App Store ID - skal opdateres med rigtig ID når appen er på App Store
    // Find App Store ID i App Store Connect under "App Information" -> "General Information"
    const APP_STORE_ID = '6739436505'; // Placeholder - skal opdateres når appen er live på App Store
    
    // Åbn App Store review side hvor brugeren kan skrive en anmeldelse
    // Denne URL åbner direkte anmeldelses-formularen i App Store
    const appStoreReviewUrl = `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
    
    // Fallback URL hvis deep link ikke virker
    const appStoreWebUrl = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
    
    try {
      // Prøv først med App Store deep link (virker bedst på iOS)
      const canOpenAppStore = await Linking.canOpenURL(appStoreReviewUrl);
      
      if (canOpenAppStore) {
        await Linking.openURL(appStoreReviewUrl);
      } else {
        // Fallback til web URL hvis deep link ikke virker
        await Linking.openURL(appStoreWebUrl);
      }
    } catch (error) {
      Alert.alert(
        'Kunne ikke åbne App Store',
        'Prøv at åbne App Store manuelt og søg efter "GymlyFresh" for at skrive en anmeldelse.'
      );
    }
  };


  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Connect App or Device */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.connectAppItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ConnectDevice')}>
            <View style={styles.connectAppIconContainer}>
              <Icon name="phone-portrait-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.connectAppInfo}>
              <Text style={styles.connectAppTitle}>Forbind en app eller enhed</Text>
              <Text style={styles.connectAppDescription}>
                Upload direkte til Gymly med næsten enhver fitness app eller enhed
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Administrer apps funktion kommer snart')}>
            <Text style={styles.actionTitle}>Administrer apps og enheder</Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ChangeEmail')}>
            <Text style={styles.actionTitle}>Skift Email</Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Help')}>
            <Text style={styles.actionTitle}>Hjælp</Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRÆFERENCER</Text>
          
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Udseende funktion kommer snart')}>
            <Text style={styles.actionTitle}>Udseende</Text>
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>{appearance}</Text>
              <Icon name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Privatlivskontroller funktion kommer snart')}>
            <View style={styles.valueContainer}>
              <Text style={styles.actionTitle}>Privatlivskontroller</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NY</Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Måleenheder funktion kommer snart')}>
            <Text style={styles.actionTitle}>Måleenheder</Text>
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>{unitsOfMeasurement}</Text>
              <Icon name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

        </View>

        {/* Video & Media */}
        <View style={styles.section}>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Automatisk afspilning af video</Text>
            </View>
            <Switch
              value={autoplayVideo}
              onValueChange={setAutoplayVideo}
              trackColor={{false: colors.surface, true: colors.warning}}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Maps & Feed */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('FeedSorting')}>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Feed sortering</Text>
              <Text style={styles.actionDescription}>
                Ændre hvordan aktiviteter sorteres i dit feed
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Integrations */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Siri & Genveje funktion kommer snart')}>
            <Text style={styles.actionTitle}>Siri & Genveje</Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Partner integrationer funktion kommer snart')}>
            <Text style={styles.actionTitle}>Partner integrationer</Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Data & Services */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Kontakter funktion kommer snart')}>
            <Text style={styles.actionTitle}>Kontakter</Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('PushNotifications')}>
            <Text style={styles.actionTitle}>Push notifikationer</Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Email notifikationer</Text>
              <Text style={styles.settingDescription}>
                Modtag nyheder og tilbud via email
              </Text>
            </View>
            {isUpdatingMarketing ? (
              <LoadingSpinner size="small" color={colors.primary} />
            ) : (
              <Switch
                value={marketingEnabled}
                onValueChange={handleMarketingToggle}
                trackColor={{false: colors.surface, true: colors.secondary}}
                thumbColor="#fff"
                disabled={isUpdatingMarketing}
              />
            )}
          </View>
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & GDPR</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Anonymiseret analyse</Text>
              <Text style={styles.settingDescription}>
                Hjælp os med at forbedre appen
              </Text>
            </View>
            {isUpdatingAnalytics ? (
              <LoadingSpinner size="small" color={colors.primary} />
            ) : (
              <Switch
                value={analyticsEnabled}
                onValueChange={handleAnalyticsToggle}
                trackColor={{false: colors.surface, true: colors.secondary}}
                thumbColor="#fff"
                disabled={isUpdatingAnalytics}
              />
            )}
          </View>
        </View>

        {/* Support & Feedback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & Feedback</Text>
          
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={handleFeedback}>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Feedback</Text>
              <Text style={styles.actionDescription}>
                Skriv en anmeldelse i App Store
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Konto</Text>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Bruger siden</Text>
            <Text style={styles.infoValue}>
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('da-DK') : '-'}
            </Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}>
          <Text style={styles.logoutButtonText}>Log ud</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        visible={showLogoutConfirm}
        title="Log ud"
        message="Er du sikker på at du vil logge ud?"
        confirmLabel="Log ud"
        cancelLabel="Annuller"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        destructive
      />
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
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  section: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    marginBottom: spacing.md,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.xs / 2,
  },
  settingDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  connectAppItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
    marginBottom: 8,
  },
  connectAppIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  connectAppInfo: {
    flex: 1,
  },
  connectAppTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  connectAppDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  valueText: {
    fontSize: 16,
    color: colors.textMuted,
    marginRight: 4,
  },
  newBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  actionInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  logoutButton: {
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutButtonText: {
    color: colors.error,
    fontSize: 18,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#999',
  },
});

export default SettingsScreen;

