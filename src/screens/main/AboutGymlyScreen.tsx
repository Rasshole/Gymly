/**
 * About Gymly Screen
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {useTranslation} from '@/i18n';

const AboutGymlyScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {t} = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('about.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>Gymly</Text>
        </View>

        <Text style={styles.title}>{t('about.welcome')}</Text>

        <View style={styles.section}>
          <Text style={styles.text}>{t('about.p1')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.text}>{t('about.p2')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.text}>{t('about.p3')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.text}>{t('about.p4')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('about.visionTitle')}</Text>
          <View style={styles.visionList}>
            <View style={styles.visionItem}>
              <Text style={styles.visionText}>{t('about.visionSocial')}</Text>
            </View>
            <View style={styles.visionItem}>
              <Text style={styles.visionText}>{t('about.visionCommitment')}</Text>
            </View>
            <View style={styles.visionItem}>
              <Text style={styles.visionText}>{t('about.visionMotivating')}</Text>
            </View>
          </View>
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
    padding: 16,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  visionList: {
    gap: 8,
  },
  visionItem: {
    paddingVertical: 4,
  },
  visionText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
});

export default AboutGymlyScreen;
