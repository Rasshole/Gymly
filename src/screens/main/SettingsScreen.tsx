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
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useAppStore} from '@/store/appStore';
import {usePrivacyStore} from '@/store/privacyStore';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors} from '@/theme/colors';

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

  const handleMarketingToggle = async (value: boolean) => {
    setMarketingEnabled(value);
    try {
      await updateMarketingConsent(value);
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke opdatere indstilling');
      setMarketingEnabled(!value);
    }
  };

  const handleAnalyticsToggle = async (value: boolean) => {
    setAnalyticsEnabled(value);
    try {
      await updateAnalyticsConsent(value);
    } catch (error) {
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
        {
          text: 'Log ud',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
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
              <Icon name="phone-portrait-outline" size={24} color="#007AFF" />
            </View>
            <View style={styles.connectAppInfo}>
              <Text style={styles.connectAppTitle}>Forbind en app eller enhed</Text>
              <Text style={styles.connectAppDescription}>
                Upload direkte til Gymly med næsten enhver fitness app eller enhed
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Administrer apps funktion kommer snart')}>
            <Text style={styles.actionTitle}>Administrer apps og enheder</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ChangeEmail')}>
            <Text style={styles.actionTitle}>Skift Email</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Help')}>
            <Text style={styles.actionTitle}>Hjælp</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
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
              <Icon name="chevron-forward" size={20} color="#C7C7CC" />
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
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Måleenheder funktion kommer snart')}>
            <Text style={styles.actionTitle}>Måleenheder</Text>
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>{unitsOfMeasurement}</Text>
              <Icon name="chevron-forward" size={20} color="#C7C7CC" />
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
              trackColor={{false: '#E5E5EA', true: '#FF9500'}}
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
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Integrations */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Siri & Genveje funktion kommer snart')}>
            <Text style={styles.actionTitle}>Siri & Genveje</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Partner integrationer funktion kommer snart')}>
            <Text style={styles.actionTitle}>Partner integrationer</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Data & Services */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Kontakter funktion kommer snart')}>
            <Text style={styles.actionTitle}>Kontakter</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('PushNotifications')}>
            <Text style={styles.actionTitle}>Push notifikationer</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Email notifikationer</Text>
              <Text style={styles.settingDescription}>
                Modtag nyheder og tilbud via email
              </Text>
            </View>
            <Switch
              value={marketingEnabled}
              onValueChange={handleMarketingToggle}
              trackColor={{false: '#E5E5EA', true: '#34C759'}}
              thumbColor="#fff"
            />
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
            <Switch
              value={analyticsEnabled}
              onValueChange={handleAnalyticsToggle}
              trackColor={{false: '#E5E5EA', true: '#34C759'}}
              thumbColor="#fff"
            />
          </View>
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
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
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
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
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
    backgroundColor: '#FF9500',
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
    borderColor: '#FF3B30',
  },
  logoutButtonText: {
    color: '#FF3B30',
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

