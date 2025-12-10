/**
 * Connect Device Screen
 * Shows available fitness devices and apps that can be connected to Gymly
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors} from '@/theme/colors';

type Device = {
  id: string;
  name: string;
  logo?: string;
  icon?: string;
};

const devices: Device[] = [
  {id: '1', name: 'GARMIN'},
  {id: '2', name: 'POLAR'},
  {id: '3', name: 'SUUNTO'},
  {id: '4', name: 'PELOTON'},
  {id: '5', name: 'COROS'},
  {id: '6', name: 'fitbit'},
  {id: '7', name: 'ŌURA'},
  {id: '8', name: 'WATCH', icon: 'watch'},
  {id: '9', name: 'ZWIFT'},
  {id: '10', name: 'wahoo'},
  {id: '11', name: 'amazfit'},
  {id: '12', name: 'SAMSUNG'},
  {id: '13', name: 'Nike', icon: 'checkmark-circle'},
  {id: '14', name: 'HUAWEI'},
];

const ConnectDeviceScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();

  const handleDevicePress = (device: Device) => {
    Alert.alert(
      'Forbind enhed',
      `Vil du forbinde ${device.name} til Gymly?`,
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Forbind',
          onPress: () => {
            // TODO: Implement device connection
            Alert.alert('Succes', `${device.name} er nu forbundet til Gymly`);
          },
        },
      ],
    );
  };

  const renderDeviceItem = (device: Device, index: number) => {
    const isLeftColumn = index % 2 === 0;

    return (
      <TouchableOpacity
        key={device.id}
        style={[
          styles.deviceButton,
          isLeftColumn ? styles.deviceButtonLeft : styles.deviceButtonRight,
        ]}
        onPress={() => handleDevicePress(device)}
        activeOpacity={0.7}>
        {device.icon ? (
          <Icon name={device.icon} size={24} color="#000" />
        ) : (
          <View style={styles.deviceLogoPlaceholder}>
            <Text style={styles.deviceLogoText}>
              {device.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.deviceName}>{device.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enheder</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeButton}>
          <Icon name="close" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Forbind din enhed</Text>
          <Text style={styles.description}>
            Gymly parrer med næsten hver fitness enhed og app. Få problemfri
            aktivitets uploads - plus et mere komplet billede af din præstation
            og restitution.
          </Text>
        </View>

        {/* Devices Grid */}
        <View style={styles.devicesGrid}>
          {devices.map((device, index) => renderDeviceItem(device, index))}
        </View>

        {/* Footer Link */}
        <TouchableOpacity
          style={styles.differentDeviceButton}
          onPress={() => {
            Alert.alert(
              'Anden enhed',
              'Kontakt support for at tilføje din enhed',
            );
          }}
          activeOpacity={0.7}>
          <Text style={styles.differentDeviceText}>
            Jeg har en anden enhed
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundCard,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  devicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 16,
  },
  deviceButton: {
    width: '48%',
    aspectRatio: 1.5,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    margin: '1%',
  },
  deviceButtonLeft: {
    marginRight: '1%',
  },
  deviceButtonRight: {
    marginLeft: '1%',
  },
  deviceLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  deviceLogoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  differentDeviceButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  differentDeviceText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
});

export default ConnectDeviceScreen;

