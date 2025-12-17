/**
 * Centres Screen
 * Shows all fitness centres in Denmark
 */

import React, {useState, useMemo, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/Ionicons';
import danishGyms, {DanishGym} from '@/data/danishGyms';
import {useAppStore} from '@/store/appStore';
import {useGymStore} from '@/store/gymStore';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {colors} from '@/theme/colors';

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Component for rendering favorite gym with logo
const FavoriteGymItemWithLogo = ({
  gym,
  index,
}: {
  gym: DanishGym;
  index: number;
}) => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {getActiveUsersCount, getGymStatus} = useGymStore();
  const logoUrl = getGymLogo(gym.brand);
  const hasLogo = hasGymLogo(gym.brand);
  const [logoError, setLogoError] = useState(false);
  const activeUsers = getActiveUsersCount(gym.id);
  const gymStatus = getGymStatus(gym.id);

  return (
    <TouchableOpacity
      style={styles.favoriteGymItem}
      activeOpacity={0.7}
      onPress={() => {
        navigation.navigate('GymDetail', {
          gymId: gym.id,
          gym: gym,
        });
      }}>
      <View style={styles.favoriteGymNumber}>
        <Text style={styles.favoriteGymNumberText}>{index + 1}</Text>
      </View>
      {hasLogo && logoUrl && !logoError ? (
        <View style={styles.favoriteGymLogoContainer}>
          <Image
            source={{uri: logoUrl}}
            style={styles.favoriteGymLogo}
            resizeMode="contain"
            onError={() => setLogoError(true)}
          />
        </View>
      ) : (
        <View style={styles.favoriteGymIconPlaceholder}>
          <Icon name="fitness" size={24} color="#007AFF" />
        </View>
      )}
      <View style={styles.gymInfo}>
        <View style={styles.gymNameRow}>
          <Text style={styles.gymName} numberOfLines={1}>
            {gym.name}
          </Text>
        </View>
        <View style={styles.gymDetails}>
          {gym.brand && (
            <Text style={styles.gymBrand} numberOfLines={1}>
              {gym.brand}
            </Text>
          )}
          {gym.city && (
            <Text style={styles.gymLocation} numberOfLines={1}>
              {gym.city}
            </Text>
          )}
        </View>
        {gym.address && (
          <Text style={styles.gymAddress} numberOfLines={1}>
            {gym.address}
          </Text>
        )}
        {/* Open/Closed Status */}
        <View style={styles.statusRow}>
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
          <View style={styles.activeUsersContainer}>
            {activeUsers > 0 ? (
              <>
                <View style={styles.activeUsersDot} />
                <Text style={styles.activeUsersText}>
                  {activeUsers} aktiv{activeUsers > 1 ? 'e' : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.activeUsersTextInactive}>0 aktive</Text>
            )}
          </View>
        </View>
      </View>
      <Icon name="chevron-forward" size={20} color="#C7C7CC" />
    </TouchableOpacity>
  );
};

const CentresScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const [searchQuery, setSearchQuery] = useState('');
  const {user} = useAppStore();
  const {getActiveUsersCount, getGymStatus} = useGymStore();
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

  // Request location permission and get current location
  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'Gymly needs access to your location to show nearby gyms',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          getCurrentLocation();
        } else {
          setIsLoadingLocation(false);
        }
      } catch (err) {
        console.warn(err);
        setIsLoadingLocation(false);
      }
    } else {
      // iOS
      getCurrentLocation();
    }
  };

  const getCurrentLocation = () => {
    setIsLoadingLocation(true);
    Geolocation.getCurrentPosition(
      position => {
        const {latitude, longitude} = position.coords;
        setUserLocation({latitude, longitude});
        setIsLoadingLocation(false);
      },
      error => {
        console.warn('Location error:', error);
        setIsLoadingLocation(false);
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
    );
  };

  // Get favorite gyms
  const favoriteGymIds = user?.favoriteGyms || [];
  const favoriteGyms = useMemo(() => {
    return favoriteGymIds
      .map(id => danishGyms.find(gym => gym.id === id))
      .filter((gym): gym is DanishGym => gym !== undefined);
  }, [favoriteGymIds]);

  const filteredGyms = danishGyms.filter(gym =>
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.brand?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Separate favorite gyms from filtered gyms
  const favoriteGymsFiltered = favoriteGyms.filter(gym =>
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.brand?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const otherGymsFiltered = filteredGyms.filter(
    gym => !favoriteGymIds.includes(gym.id),
  );

  // Sort gyms: open nearby first, then closed nearby (both sorted by distance)
  const sortedGyms = useMemo(() => {
    const allGyms = searchQuery.length > 0
      ? [...favoriteGymsFiltered, ...otherGymsFiltered]
      : [...favoriteGyms, ...otherGymsFiltered];

    return allGyms
      .map(gym => {
        const status = getGymStatus(gym.id);
        let distance = Infinity;

        if (userLocation) {
          distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            gym.latitude,
            gym.longitude,
          );
        }

        return {
          gym,
          isOpen: status.isOpen,
          distance,
        };
      })
      .sort((a, b) => {
        // First: Open gyms before closed gyms
        if (a.isOpen && !b.isOpen) return -1;
        if (!a.isOpen && b.isOpen) return 1;

        // Second: Within same status (both open or both closed), sort by distance (closest first)
        return a.distance - b.distance;
      })
      .map(item => item.gym);
  }, [favoriteGyms, favoriteGymsFiltered, otherGymsFiltered, searchQuery, userLocation, getGymStatus]);

  const isFavorite = (gymId: number) => favoriteGymIds.includes(gymId);

  const GymIcon = ({gym, favorite}: {gym: DanishGym; favorite: boolean}) => {
    const [logoError, setLogoError] = useState(false);
    const logoUrl = getGymLogo(gym.brand);
    const hasLogo = hasGymLogo(gym.brand);

    return (
      <View style={[styles.gymIcon, favorite && styles.gymIconFavorite]}>
        {favorite ? (
          <Icon name="star" size={24} color="#FFD700" />
        ) : hasLogo && logoUrl && !logoError ? (
          <Image
            source={{uri: logoUrl}}
            style={styles.gymLogo}
            resizeMode="contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <Icon name="fitness" size={24} color="#007AFF" />
        )}
      </View>
    );
  };

  const renderGymItem = (item: DanishGym) => {
    const favorite = isFavorite(item.id);
    const activeUsers = getActiveUsersCount(item.id);
    const gymStatus = getGymStatus(item.id);
    
    // Calculate distance if we have user location
    let distanceText = '';
    if (userLocation) {
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        item.latitude,
        item.longitude,
      );
      if (distance < 1000) {
        distanceText = `${Math.round(distance)} m`;
      } else {
        distanceText = `${(distance / 1000).toFixed(1)} km`;
      }
    }
    
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.gymItem}
        activeOpacity={0.7}
        onPress={() => {
          navigation.navigate('GymDetail', {
            gymId: item.id,
            gym: item,
          });
        }}>
        <GymIcon gym={item} favorite={favorite} />
        <View style={styles.gymInfo}>
          <View style={styles.gymNameRow}>
            <Text style={styles.gymName} numberOfLines={1}>
              {item.name}
            </Text>
            {favorite && (
              <View style={styles.favoriteBadge}>
                <Text style={styles.favoriteBadgeText}>
                  #{favoriteGymIds.indexOf(item.id) + 1}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.gymDetails}>
            {item.brand && (
              <Text style={styles.gymBrand} numberOfLines={1}>
                {item.brand}
              </Text>
            )}
            {item.city && (
              <Text style={styles.gymLocation} numberOfLines={1}>
                {item.city}
              </Text>
            )}
            {distanceText && (
              <Text style={styles.distanceText} numberOfLines={1}>
                • {distanceText}
              </Text>
            )}
          </View>
          {item.address && (
            <Text style={styles.gymAddress} numberOfLines={1}>
              {item.address}
            </Text>
          )}
          <View style={styles.gymMetaRow}>
            {/* Open/Closed Status */}
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
                {gymStatus.isOpen ? 'Åbent' : 'Lukket'}
              </Text>
            </View>
            <View style={styles.activeUsersContainer}>
              {activeUsers > 0 ? (
                <>
                  <View style={styles.activeUsersDot} />
                  <Text style={styles.activeUsersText}>
                    {activeUsers} aktiv{activeUsers > 1 ? 'e' : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.activeUsersTextInactive}>0 aktive</Text>
              )}
            </View>
          </View>
        </View>
        <Icon name="chevron-forward" size={20} color="#C7C7CC" />
      </TouchableOpacity>
    );
  };

  // Separate favorite gyms from sorted gyms
  const favoriteGymsSorted = sortedGyms.filter(gym => favoriteGymIds.includes(gym.id));
  const otherGymsSorted = sortedGyms.filter(gym => !favoriteGymIds.includes(gym.id));

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg efter centre..."
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}>
            <Icon name="close-circle" size={20} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </View>

      {/* Scrollable Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          const offsetY = event.nativeEvent.contentOffset.y;
          // Show button when scrolled more than 500 pixels
          setShowScrollToTop(offsetY > 500);
        }}
        scrollEventThrottle={16}>
        {/* Favorite Gyms Section */}
        {favoriteGymsSorted.length > 0 && searchQuery.length === 0 && (
          <View style={styles.favoriteSectionContainer}>
            <Text style={styles.favoriteSectionTitle}>Mine lokale centre</Text>
            <View style={styles.favoriteGymsList}>
              {favoriteGymsSorted.map((gym, index) => (
                <FavoriteGymItemWithLogo key={gym.id} gym={gym} index={index} />
              ))}
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            Centre I Nærheden
          </Text>
        </View>

        {/* Gyms List */}
        <View style={styles.list}>
          {otherGymsSorted.map((gym, index) => (
            <View key={gym.id}>
              {renderGymItem(gym)}
              {index < otherGymsSorted.length - 1 && <View style={styles.separator} />}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Scroll to Top Button */}
      {showScrollToTop && (
        <TouchableOpacity
          style={styles.scrollToTopButton}
          onPress={() => {
            scrollViewRef.current?.scrollTo({y: 0, animated: true});
          }}
          activeOpacity={0.9}>
          <Icon name="arrow-up" size={28} color="#fff" />
        </TouchableOpacity>
      )}
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
  scrollContent: {
    paddingBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statsText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  gymItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginLeft: 64,
  },
  gymIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gymIconFavorite: {
    backgroundColor: '#FFF9E6',
  },
  gymLogo: {
    width: 32,
    height: 32,
  },
  gymNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  favoriteBadge: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  favoriteBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.text,
  },
  favoriteSectionContainer: {
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EFEFF4',
  },
  favoriteSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  favoriteGymsList: {
    gap: 12,
  },
  favoriteGymItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
  },
  favoriteGymNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  favoriteGymNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  favoriteGymLogoContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  favoriteGymLogo: {
    width: 40,
    height: 40,
  },
  favoriteGymIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gymInfo: {
    flex: 1,
  },
  gymName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  gymDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gymBrand: {
    fontSize: 14,
    color: colors.secondary,
    marginRight: 8,
  },
  gymLocation: {
    fontSize: 14,
    color: colors.textMuted,
  },
  gymAddress: {
    fontSize: 12,
    color: colors.textMuted,
  },
  activeUsersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  activeUsersDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  activeUsersText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
  },
  activeUsersTextInactive: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  gymMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
    flexWrap: 'wrap',
  },
  distanceText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  statusRow: {
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeOpen: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgeClosed: {
    backgroundColor: '#FFEBEE',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusDotOpen: {
    backgroundColor: '#34C759',
  },
  statusDotClosed: {
    backgroundColor: '#FF3B30',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextOpen: {
    color: '#34C759',
  },
  statusTextClosed: {
    color: '#FF3B30',
  },
  scrollToTopButton: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
});

export default CentresScreen;

