/**
 * Gym Detail Screen
 * Shows detailed information about a specific gym
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {DanishGym} from '@/data/danishGyms';
import {useGymStore} from '@/store/gymStore';
import {useAppStore} from '@/store/appStore';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import {colors} from '@/theme/colors';

type GymDetailScreenProps = {
  route: {
    params: {
      gymId: number;
      gym: DanishGym;
    };
  };
};

const GymDetailScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const route = useRoute();
  const {gymId, gym} = (route.params as any) || {};
  const {user} = useAppStore();
  const {getGymStats, getActiveUsersCount, getGymStatus, getGymHours} = useGymStore();

  if (!gym) {
    return (
      <View style={styles.container}>
        <Text>Gym ikke fundet</Text>
      </View>
    );
  }

  const stats = user ? getGymStats(gymId, user.id) : null;
  const activeUsers = getActiveUsersCount(gymId);
  const gymStatus = getGymStatus(gymId);
  const gymHours = getGymHours(gymId);
  const logoUrl = getGymLogo(gym.brand);
  const hasLogo = hasGymLogo(gym.brand);

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Icon key={i} name="star" size={20} color="#FFD700" />
      );
    }

    if (hasHalfStar) {
      stars.push(
        <Icon key="half" name="star-half" size={20} color="#FFD700" />
      );
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <Icon key={`empty-${i}`} name="star-outline" size={20} color="#C7C7CC" />
      );
    }

    return stars;
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
        <Text style={styles.headerTitle}>Center detaljer</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Gym Header */}
        <View style={styles.gymHeader}>
          {hasLogo && logoUrl ? (
            <Image
              source={{uri: logoUrl}}
              style={styles.gymHeaderLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.gymHeaderIcon}>
              <Icon name="fitness" size={48} color="#007AFF" />
            </View>
          )}
          <Text style={styles.gymHeaderName}>{gym.name}</Text>
          {gym.brand && (
            <Text style={styles.gymHeaderBrand}>{gym.brand}</Text>
          )}
        </View>

        {/* Address Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="location" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Adresse</Text>
          </View>
          {gym.address && (
            <Text style={styles.addressText}>{gym.address}</Text>
          )}
          {gym.city && (
            <Text style={styles.cityText}>{gym.city}</Text>
          )}
        </View>

        {/* Opening Hours Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon
              name={gymStatus.isOpen ? 'time' : 'time-outline'}
              size={20}
              color={gymStatus.isOpen ? '#34C759' : '#FF3B30'}
            />
            <Text style={styles.sectionTitle}>Åbningstider</Text>
          </View>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusBadge,
                gymStatus.isOpen ? styles.statusBadgeOpen : styles.statusBadgeClosed,
              ]}>
              <View
                style={[
                  styles.statusDot,
                  gymStatus.isOpen ? styles.statusDotOpen : styles.statusDotClosed,
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  gymStatus.isOpen ? styles.statusTextOpen : styles.statusTextClosed,
                ]}>
                {gymStatus.isOpen ? 'Åbent nu' : 'Lukket nu'}
              </Text>
            </View>
            
            {/* All Opening Hours */}
            {gymHours && (
              <View style={styles.hoursList}>
                {gymHours.isOpen24Hours ? (
                  <Text style={styles.hoursText}>Åbent 24 timer i døgnet</Text>
                ) : (
                  <>
                    {gymHours.monday && (
                      <View style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>Mandag:</Text>
                        <Text style={styles.hoursTime}>
                          {gymHours.monday.open} - {gymHours.monday.close}
                        </Text>
                      </View>
                    )}
                    {gymHours.tuesday && (
                      <View style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>Tirsdag:</Text>
                        <Text style={styles.hoursTime}>
                          {gymHours.tuesday.open} - {gymHours.tuesday.close}
                        </Text>
                      </View>
                    )}
                    {gymHours.wednesday && (
                      <View style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>Onsdag:</Text>
                        <Text style={styles.hoursTime}>
                          {gymHours.wednesday.open} - {gymHours.wednesday.close}
                        </Text>
                      </View>
                    )}
                    {gymHours.thursday && (
                      <View style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>Torsdag:</Text>
                        <Text style={styles.hoursTime}>
                          {gymHours.thursday.open} - {gymHours.thursday.close}
                        </Text>
                      </View>
                    )}
                    {gymHours.friday && (
                      <View style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>Fredag:</Text>
                        <Text style={styles.hoursTime}>
                          {gymHours.friday.open} - {gymHours.friday.close}
                        </Text>
                      </View>
                    )}
                    {gymHours.saturday && (
                      <View style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>Lørdag:</Text>
                        <Text style={styles.hoursTime}>
                          {gymHours.saturday.open} - {gymHours.saturday.close}
                        </Text>
                      </View>
                    )}
                    {gymHours.sunday && (
                      <View style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>Søndag:</Text>
                        <Text style={styles.hoursTime}>
                          {gymHours.sunday.open} - {gymHours.sunday.close}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
            
            {/* Fallback if no hours data */}
            {!gymHours && (
              <Text style={styles.hoursText}>
                Åbningstider ikke tilgængelige
              </Text>
            )}
          </View>
        </View>

        {/* Active Users Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="people" size={20} color="#34C759" />
            <Text style={styles.sectionTitle}>Aktive brugere</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statValue}>{activeUsers}</Text>
            <Text style={styles.statLabel}>
              {activeUsers === 1 ? 'aktiv bruger' : 'aktive brugere'} lige nu
            </Text>
          </View>
        </View>

        {/* User Check-ins Section */}
        {stats && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="checkmark-circle" size={20} color="#007AFF" />
              <Text style={styles.sectionTitle}>Mine check-ins</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statValue}>{stats.userCheckIns}</Text>
              <Text style={styles.statLabel}>
                {stats.userCheckIns === 1 ? 'gang' : 'gange'} tjekket ind
              </Text>
            </View>
          </View>
        )}

        {/* Rating Section */}
        {stats && stats.totalRatings > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="star" size={20} color="#FFD700" />
              <Text style={styles.sectionTitle}>Vurdering</Text>
            </View>
            <View style={styles.ratingContainer}>
              <View style={styles.ratingStars}>
                {renderStars(stats.averageRating)}
              </View>
              <Text style={styles.ratingValue}>
                {stats.averageRating.toFixed(1)}
              </Text>
              <Text style={styles.ratingCount}>
                ({stats.totalRatings} {stats.totalRatings === 1 ? 'vurdering' : 'vurderinger'})
              </Text>
            </View>
          </View>
        )}

        {/* No Ratings Yet */}
        {stats && stats.totalRatings === 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="star-outline" size={20} color="#8E8E93" />
              <Text style={styles.sectionTitle}>Vurdering</Text>
            </View>
            <Text style={styles.noRatingsText}>
              Ingen vurderinger endnu. Vær den første til at vurdere dette center!
            </Text>
          </View>
        )}

        {/* Give Rating Button */}
        {user && (
          <TouchableOpacity
            style={styles.rateButton}
            onPress={() => {
              navigation.navigate('RateGym', {
                gymId: gymId,
                gym: gym,
              });
            }}
            activeOpacity={0.7}>
            <Icon name="fitness" size={20} color="#fff" />
            <Text style={styles.rateButtonText}>Giv en vurdering</Text>
          </TouchableOpacity>
        )}
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
  gymHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  gymHeaderLogo: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  gymHeaderIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  gymHeaderName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  gymHeaderBrand: {
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  addressText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
  },
  cityText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginRight: 8,
  },
  statLabel: {
    fontSize: 16,
    color: colors.textMuted,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  ratingStars: {
    flexDirection: 'row',
    marginRight: 8,
  },
  ratingValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginRight: 8,
  },
  ratingCount: {
    fontSize: 14,
    color: colors.textMuted,
  },
  noRatingsText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  statusContainer: {
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  statusBadgeOpen: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgeClosed: {
    backgroundColor: '#FFEBEE',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotOpen: {
    backgroundColor: '#34C759',
  },
  statusDotClosed: {
    backgroundColor: '#FF3B30',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusTextOpen: {
    color: '#34C759',
  },
  statusTextClosed: {
    color: '#FF3B30',
  },
  hoursText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  hoursList: {
    marginTop: 12,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  hoursDay: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
  },
  hoursTime: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '400',
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  rateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
});

export default GymDetailScreen;

