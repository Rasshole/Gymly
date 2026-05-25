/**
 * Feed Sorting Screen
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {useTranslation} from '@/i18n';

type FeedSortOption = 'latest' | 'personalized';

const FeedSortingScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {t} = useTranslation();
  const [selectedOption, setSelectedOption] = useState<FeedSortOption>('latest');

  const handleSelectOption = async (option: FeedSortOption) => {
    try {
      setSelectedOption(option);
      Alert.alert(t('feedSorting.successTitle'), t('feedSorting.successBody'), [
        {
          text: t('common.ok'),
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch {
      Alert.alert(t('common.error'), t('feedSorting.errorBody'));
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.headerSection}>
          <Icon name="options-outline" size={48} color={colors.primary} />
          <Text style={styles.headerTitle}>{t('feedSorting.title')}</Text>
          <Text style={styles.headerDescription}>{t('feedSorting.description')}</Text>
        </View>

        <View style={styles.optionsSection}>
          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedOption === 'latest' && styles.optionCardSelected,
            ]}
            onPress={() => handleSelectOption('latest')}
            activeOpacity={0.7}>
            <View style={styles.optionHeader}>
              <View style={styles.optionIconContainer}>
                <Icon
                  name="time-outline"
                  size={28}
                  color={selectedOption === 'latest' ? colors.primary : colors.textSecondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text
                  style={[
                    styles.optionTitle,
                    selectedOption === 'latest' && styles.optionTitleSelected,
                  ]}>
                  {t('feedSorting.latestTitle')}
                </Text>
                <Text style={styles.optionDescription}>
                  {t('feedSorting.latestDescription')}
                </Text>
              </View>
              {selectedOption === 'latest' && (
                <Icon name="checkmark-circle" size={28} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedOption === 'personalized' && styles.optionCardSelected,
            ]}
            onPress={() => handleSelectOption('personalized')}
            activeOpacity={0.7}>
            <View style={styles.optionHeader}>
              <View style={styles.optionIconContainer}>
                <Icon
                  name="sparkles-outline"
                  size={28}
                  color={
                    selectedOption === 'personalized' ? colors.primary : colors.textSecondary
                  }
                />
              </View>
              <View style={styles.optionContent}>
                <Text
                  style={[
                    styles.optionTitle,
                    selectedOption === 'personalized' && styles.optionTitleSelected,
                  ]}>
                  {t('feedSorting.personalizedTitle')}
                </Text>
                <Text style={styles.optionDescription}>
                  {t('feedSorting.personalizedDescription')}
                </Text>
              </View>
              {selectedOption === 'personalized' && (
                <Icon name="checkmark-circle" size={28} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        </View>
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
  headerSection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  headerDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  optionsSection: {
    gap: 16,
  },
  optionCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  optionTitleSelected: {
    color: colors.primary,
  },
  optionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});

export default FeedSortingScreen;
