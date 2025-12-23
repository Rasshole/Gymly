/**
 * Help Screen
 * Provides help resources and information about the app
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Linking,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors} from '@/theme/colors';

const HelpScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();

  const handleHelpItemPress = (itemId: string, itemTitle: string) => {
    switch (itemId) {
      case '1': // Support
        navigation.navigate('Support');
        break;
      case '2': // Om Gymly
        navigation.navigate('AboutGymly');
        break;
      case '3': // Vilkår og betingelser
        navigation.navigate('Terms');
        break;
      case '4': // Privatlivspolitik
        navigation.navigate('PrivacyPolicy');
        break;
      case '5': // Slet din konto
        Alert.alert(
          'Slet din konto',
          'For at slette din konto permanent, skal du besøge vores hjemmeside og logge ind. Denne funktion vil være tilgængelig når vores hjemmeside er klar.',
        );
        // TODO: Open website when ready
        // Linking.openURL('https://gymly.dk/delete-account');
        break;
      default:
        Alert.alert('Info', `${itemTitle} funktion kommer snart`);
    }
  };

  const helpItems = [
    {id: '1', title: 'Support', icon: 'help-circle-outline'},
    {id: '2', title: 'Om Gymly', icon: 'information-circle-outline'},
    {id: '3', title: 'Vilkår og betingelser', icon: 'document-text-outline'},
    {id: '4', title: 'Privatlivspolitik', icon: 'shield-checkmark-outline'},
    {id: '5', title: 'Slet din konto', icon: 'trash-outline', isDestructive: true},
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hjælp</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {helpItems.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.helpItem,
              index === helpItems.length - 1 && styles.helpItemLast,
            ]}
            onPress={() => handleHelpItemPress(item.id, item.title)}
            activeOpacity={0.7}>
            <Text
              style={[
                styles.helpItemText,
                item.isDestructive && styles.helpItemTextDestructive,
              ]}>
              {item.title}
            </Text>
            <Icon
              name="chevron-forward"
              size={20}
              color={item.isDestructive ? '#FF3B30' : '#C7C7CC'}
            />
          </TouchableOpacity>
        ))}

        {/* Separator */}
        <View style={styles.separator} />

        {/* Version Info */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Gymly v1.0.0</Text>
        </View>
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
  headerRight: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  helpItemLast: {
    borderBottomWidth: 0,
  },
  helpItemText: {
    fontSize: 16,
    color: colors.text,
  },
  helpItemTextDestructive: {
    color: '#FF3B30',
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginTop: 8,
  },
  versionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  versionText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});

export default HelpScreen;

