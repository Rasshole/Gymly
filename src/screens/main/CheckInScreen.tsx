/**
 * Check In Screen
 * Swipe to check in at current fitness centre
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/Ionicons';
import danishGyms, {DanishGym} from '@/data/danishGyms';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.6; // 60% of screen width
const CHECK_IN_RADIUS = 50; // 50 meters

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

const CheckInScreen = () => {
  const [currentGym, setCurrentGym] = useState<DanishGym | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const pan = React.useRef(new Animated.ValueXY()).current;

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
            message: 'Gymly needs access to your location to check in at gyms',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          getCurrentLocation();
        } else {
          setIsLoadingLocation(false);
          Alert.alert(
            'Location Permission Denied',
            'Please enable location permissions to use check-in feature',
          );
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
        checkNearbyGyms(latitude, longitude);
        setIsLoadingLocation(false);
      },
      error => {
        console.warn('Location error:', error);
        setIsLoadingLocation(false);
        Alert.alert(
          'Location Error',
          'Could not get your location. Please make sure location services are enabled.',
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      },
    );
  };

  const checkNearbyGyms = (userLat: number, userLon: number) => {
    let nearestGym: DanishGym | null = null;
    let nearestDistance = Infinity;

    danishGyms.forEach(gym => {
      const distance = calculateDistance(
        userLat,
        userLon,
        gym.latitude,
        gym.longitude,
      );

      if (distance < CHECK_IN_RADIUS && distance < nearestDistance) {
        nearestDistance = distance;
        nearestGym = gym;
      }
    });

    setCurrentGym(nearestGym);
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow horizontal swiping
        if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          pan.setValue({x: gestureState.dx, y: 0});
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();

        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swiped right - check in
          handleCheckIn();
        } else {
          // Return to original position
          Animated.spring(pan, {
            toValue: {x: 0, y: 0},
            useNativeDriver: false,
          }).start();
        }
      },
    }),
  ).current;

  const handleCheckIn = () => {
    if (!currentGym) {
      Alert.alert(
        'Ikke i et trænings center',
        'Du er ikke i et trænings center. Du skal være inden for 50 meter af et center for at tjekke ind.',
        [{text: 'OK'}],
      );
      Animated.spring(pan, {
        toValue: {x: 0, y: 0},
        useNativeDriver: false,
      }).start();
      return;
    }

    // Re-check distance before checking in
    if (userLocation) {
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        currentGym.latitude,
        currentGym.longitude,
      );

      if (distance > CHECK_IN_RADIUS) {
        Alert.alert(
          'For langt væk',
          `Du er ${Math.round(distance)} meter væk. Du skal være inden for 50 meter for at tjekke ind.`,
          [{text: 'OK'}],
        );
        Animated.spring(pan, {
          toValue: {x: 0, y: 0},
          useNativeDriver: false,
        }).start();
        // Re-check location
        getCurrentLocation();
        return;
      }
    }

    setIsCheckingIn(true);

    // Simulate API call
    setTimeout(() => {
      setIsCheckingIn(false);
      setCheckedIn(true);
      Animated.spring(pan, {
        toValue: {x: 0, y: 0},
        useNativeDriver: false,
      }).start();

      Alert.alert('Tjekket ind!', `Du er nu tjekket ind på ${currentGym.name}`, [
        {text: 'OK'},
      ]);
    }, 1000);
  };

  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  const opacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [1, 0.5],
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Icon name="location" size={48} color="#007AFF" />
          {isLoadingLocation ? (
            <Text style={styles.title}>Finder dit nuværende sted...</Text>
          ) : (
            <>
              <Text style={styles.title}>
                {currentGym ? 'Tjek ind på gym' : 'Find et trænings center'}
              </Text>
              {currentGym && (
                <>
                  <Text style={styles.gymName}>{currentGym.name}</Text>
                  {currentGym.address && (
                    <Text style={styles.gymAddress}>{currentGym.address}</Text>
                  )}
                  {userLocation && (
                    <Text style={styles.distanceText}>
                      Du er inden for 50 meter
                    </Text>
                  )}
                </>
              )}
              {!currentGym && userLocation && (
                <Text style={styles.noGymText}>
                  Ingen trænings center inden for 50 meter
                </Text>
              )}
            </>
          )}
        </View>

        {/* Swipe Card */}
        <View style={styles.swipeContainer}>
          <Animated.View
            style={[
              styles.swipeCard,
              {
                transform: [
                  {translateX: pan.x},
                  {rotate: rotate},
                ],
                opacity: opacity,
              },
            ]}
            {...panResponder.panHandlers}>
            <View style={styles.swipeCardContent}>
              <Icon
                name={currentGym ? 'checkmark-circle' : 'close-circle'}
                size={64}
                color={currentGym ? '#34C759' : '#FF3B30'}
              />
              <Text style={styles.swipeText}>
                {currentGym
                  ? 'Swipe for at tjekke ind'
                  : 'Du er ikke i et trænings center'}
              </Text>
              {isCheckingIn && (
                <View style={styles.loadingContainer}>
                  <Icon name="hourglass" size={24} color="#007AFF" />
                  <Text style={styles.loadingText}>Tjekker ind...</Text>
                </View>
              )}
              {checkedIn && (
                <View style={styles.successContainer}>
                  <Icon name="checkmark-circle" size={24} color="#34C759" />
                  <Text style={styles.successText}>Tjekket ind!</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Swipe Indicator */}
          <View style={styles.swipeIndicator}>
            <Icon name="arrow-forward" size={24} color="#C7C7CC" />
            <Text style={styles.swipeHint}>Swipe til højre for at tjekke ind</Text>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>Sådan tjekker du ind:</Text>
          <View style={styles.instructionItem}>
            <Icon name="location" size={20} color="#007AFF" />
            <Text style={styles.instructionText}>
              Vær inden for 50 meter af et trænings center
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <Icon name="swap-horizontal" size={20} color="#007AFF" />
            <Text style={styles.instructionText}>
              Swipe kortet til højre for at tjekke ind
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  gymName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 8,
    textAlign: 'center',
  },
  gymAddress: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'center',
  },
  distanceText: {
    fontSize: 12,
    color: '#34C759',
    marginTop: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  noGymText: {
    fontSize: 14,
    color: '#FF3B30',
    marginTop: 8,
    textAlign: 'center',
  },
  swipeContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  swipeCard: {
    width: SCREEN_WIDTH - 48,
    height: 200,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 16,
  },
  swipeCardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  swipeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  successText: {
    fontSize: 14,
    color: '#34C759',
    marginLeft: 8,
    fontWeight: '600',
  },
  swipeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swipeHint: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 8,
  },
  instructions: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
  },
});

export default CheckInScreen;

