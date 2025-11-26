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
  const [temperature, setTemperature] = useState('Celsius');
  const [defaultHighlightImage, setDefaultHighlightImage] = useState('Foto');

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

  const handleExportData = () => {
    Alert.alert(
      'Eksporter data',
      'Vi sender dine data til din email. Dette kan tage nogle minutter.',
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Eksporter',
          onPress: () => {
            // TODO: Implement data export
            Alert.alert('Info', 'Data eksport kommer snart');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Slet konto',
      'Er du sikker? Dette kan ikke fortrydes. Al din data vil blive permanent slettet.',
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Slet',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement account deletion
            Alert.alert('Info', 'Konto sletning kommer snart');
          },
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

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Temperatur funktion kommer snart')}>
            <Text style={styles.actionTitle}>Temperatur</Text>
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>{temperature}</Text>
              <Icon name="chevron-forward" size={20} color="#C7C7CC" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Standard fremhævet billede funktion kommer snart')}>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Standard fremhævet billede</Text>
              <Text style={styles.actionDescription}>
                Fremhæv kortet eller et foto for at repræsentere dine uploadede aktiviteter i feedet.
              </Text>
            </View>
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>{defaultHighlightImage}</Text>
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
            onPress={() => Alert.alert('Info', 'Standard kort funktion kommer snart')}>
            <Text style={styles.actionTitle}>Standard kort</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Feed sortering funktion kommer snart')}>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Feed sortering</Text>
              <Text style={styles.actionDescription}>
                Ændre hvordan aktiviteter sorteres i dit feed
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Training */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Træningszoner funktion kommer snart')}>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Træningszoner</Text>
              <Text style={styles.actionDescription}>
                Tilpas dine træningszoner
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
            onPress={() => Alert.alert('Info', 'Beacon funktion kommer snart')}>
            <Text style={styles.actionTitle}>Beacon</Text>
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
            onPress={() => Alert.alert('Info', 'Vejr funktion kommer snart')}>
            <Text style={styles.actionTitle}>Vejr</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Sundhedsdata funktion kommer snart')}>
            <Text style={styles.actionTitle}>Sundhedsdata</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

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
            onPress={() => Alert.alert('Info', 'Push notifikationer funktion kommer snart')}>
            <Text style={styles.actionTitle}>Push notifikationer</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert('Info', 'Email notifikationer funktion kommer snart')}>
            <Text style={styles.actionTitle}>Email notifikationer</Text>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & GDPR</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Marketing emails</Text>
              <Text style={styles.settingDescription}>
                Modtag nyheder og tilbud
              </Text>
            </View>
            <Switch
              value={marketingEnabled}
              onValueChange={handleMarketingToggle}
              trackColor={{false: '#E5E5EA', true: '#34C759'}}
              thumbColor="#fff"
            />
          </View>

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

        {/* GDPR Rights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dine rettigheder</Text>
          
          <TouchableOpacity
            style={styles.actionItem}
            onPress={handleExportData}
            activeOpacity={0.7}>
            <Icon name="download-outline" size={24} color="#007AFF" />
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Eksporter mine data</Text>
              <Text style={styles.actionDescription}>
                Download alle dine data (GDPR Artikel 15)
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}>
            <Icon name="document-text-outline" size={24} color="#007AFF" />
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Privatlivspolitik</Text>
              <Text style={styles.actionDescription}>
                Læs vores privatlivspolitik
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            activeOpacity={0.7}>
            <Icon name="shield-checkmark-outline" size={24} color="#007AFF" />
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Samtykke historik</Text>
              <Text style={styles.actionDescription}>
                Se din samtykke historik
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
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

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Farezone</Text>
          
          <TouchableOpacity
            style={[styles.actionItem, styles.dangerItem]}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}>
            <Icon name="trash-outline" size={24} color="#FF3B30" />
            <View style={styles.actionInfo}>
              <Text style={[styles.actionTitle, styles.dangerText]}>
                Slet konto
              </Text>
              <Text style={styles.actionDescription}>
                Permanent sletning af al data
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
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
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
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
    color: '#000',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
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
    backgroundColor: '#E3F2FD',
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
    color: '#000',
    marginBottom: 4,
  },
  connectAppDescription: {
    fontSize: 14,
    color: '#666',
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
    color: '#8E8E93',
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
    color: '#000',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 14,
    color: '#666',
  },
  dangerItem: {},
  dangerText: {
    color: '#FF3B30',
  },
  infoItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  logoutButton: {
    backgroundColor: '#fff',
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

