/**
 * Rate Gym Screen
 * Screen for rating a gym with biceps icons (1-5)
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useGymStore} from '@/store/gymStore';
import {useAppStore} from '@/store/appStore';
import {DanishGym} from '@/data/danishGyms';
import {colors} from '@/theme/colors';

type RateGymScreenProps = {
  route: {
    params: {
      gymId: number;
      gym: DanishGym;
    };
  };
};

const RateGymScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const {gymId, gym} = (route.params as any) || {};
  const {user} = useAppStore();
  const {addRating} = useGymStore();

  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    if (!selectedRating) {
      Alert.alert('Vælg vurdering', 'Vælg venligst en vurdering fra 1 til 5');
      return;
    }

    if (!user) {
      Alert.alert('Fejl', 'Bruger ikke fundet');
      return;
    }

    addRating({
      gymId,
      userId: user.id,
      rating: selectedRating,
      comment: comment.trim() || undefined,
    });

    Alert.alert(
      'Vurdering sendt',
      'Tak for din vurdering!',
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Giv en vurdering</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Gym Info */}
        <View style={styles.gymInfo}>
          <Text style={styles.gymName}>{gym?.name || 'Center'}</Text>
          {gym?.brand && (
            <Text style={styles.gymBrand}>{gym.brand}</Text>
          )}
        </View>

        {/* Rating Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vælg din vurdering</Text>
          <Text style={styles.sectionSubtitle}>
            Tryk på antallet af biceps for at vælge din vurdering
          </Text>

          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5].map((rating) => {
              const isSelected = selectedRating === rating;
              const isFilled = selectedRating !== null && rating <= selectedRating;

              return (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.bicepsButton,
                    isSelected && styles.bicepsButtonSelected,
                  ]}
                  onPress={() => setSelectedRating(rating)}
                  activeOpacity={0.7}>
                  <Icon
                    name="fitness"
                    size={40}
                    color={isFilled ? '#007AFF' : '#C7C7CC'}
                  />
                  <Text
                    style={[
                      styles.bicepsNumber,
                      isFilled && styles.bicepsNumberSelected,
                    ]}>
                    {rating}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedRating && (
            <View style={styles.selectedRatingContainer}>
              <Text style={styles.selectedRatingText}>
                Du har valgt {selectedRating} {selectedRating === 1 ? 'biceps' : 'biceps'}
              </Text>
            </View>
          )}
        </View>

        {/* Comment Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kommentar (valgfrit)</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Skriv din kommentar her..."
            placeholderTextColor="#8E8E93"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.characterCount}>
            {comment.length} / 500
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            !selectedRating && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!selectedRating}
          activeOpacity={0.7}>
          <Text style={styles.submitButtonText}>Send vurdering</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
    paddingTop: 50,
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  gymInfo: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  gymName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  gymBrand: {
    fontSize: 16,
    color: colors.secondary,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.backgroundCard,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 20,
  },
  bicepsButton: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.background,
    minWidth: 70,
  },
  bicepsButtonSelected: {
    backgroundColor: colors.primary,
  },
  bicepsNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 4,
  },
  bicepsNumberSelected: {
    color: colors.secondary,
  },
  selectedRatingContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.primary,
    borderRadius: 10,
    alignItems: 'center',
  },
  selectedRatingText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
  commentInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    minHeight: 120,
    maxHeight: 200,
    marginBottom: 8,
  },
  characterCount: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
  },
  submitButton: {
    backgroundColor: colors.secondary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});

export default RateGymScreen;

