/**
 * Feed Sorting Screen
 * Allows user to choose how feed items are sorted
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
import {colors} from '@/theme/colors';

type FeedSortOption = 'latest' | 'personalized';

const FeedSortingScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const [selectedOption, setSelectedOption] = useState<FeedSortOption>('latest');

  const handleSelectOption = async (option: FeedSortOption) => {
    try {
      setSelectedOption(option);
      // TODO: Implement actual API call to save feed sorting preference
      // await updateFeedSortingPreference(option);
      
      // Show success feedback
      Alert.alert(
        'Succes',
        'Din feed sortering er blevet opdateret',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke opdatere indstilling');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Icon name="options-outline" size={48} color={colors.primary} />
          <Text style={styles.headerTitle}>Feed Sortering</Text>
          <Text style={styles.headerDescription}>
            Vælg hvordan opslag sorteres i dit feed
          </Text>
        </View>

        {/* Options */}
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
                <Text style={[
                  styles.optionTitle,
                  selectedOption === 'latest' && styles.optionTitleSelected,
                ]}>
                  Seneste
                </Text>
                <Text style={styles.optionDescription}>
                  Viser de seneste nyheder i feed
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
                  color={selectedOption === 'personalized' ? colors.primary : colors.textSecondary}
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={[
                  styles.optionTitle,
                  selectedOption === 'personalized' && styles.optionTitleSelected,
                ]}>
                  Personlig
                </Text>
                <Text style={styles.optionDescription}>
                  Viser en blanding af nyeste opslag, den slags opslag du oftest interagerer med, og populære opslag du måske ikke har opdaget endnu
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

