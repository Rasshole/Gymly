/**
 * Gym Detail Screen
 * Shows detailed information about a specific gym
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {DanishGym} from '@/data/danishGyms';
import {useGymStore} from '@/store/gymStore';
import {useLeaderboardStore} from '@/store/leaderboardStore';
import {useAppStore} from '@/store/appStore';
import colors from '@/theme/colors';
import GymLogoView from '@/components/ui/GymLogoView';

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}t ${m} min` : `${h}t`;
};

type ActiveUser = { id: string; name: string; durationMinutes: number; isFriend?: boolean };
const getActiveUsers = (_count: number, _gymId: string): ActiveUser[] => [];

type GymDetailScreenProps = {
  route: {
    params: {
      gymId: string;
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
  const {getWeeklyChampion} = useLeaderboardStore();
  const [activeUsersModalVisible, setActiveUsersModalVisible] = useState(false);

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
  const weeklyChampion = getWeeklyChampion(gymId);
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

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="always">
        {/* Gym Header */}
        <View style={styles.gymHeader}>
          <GymLogoView
            gymName={gym.name}
            brand={gym.brand}
            size={80}
            style={styles.gymHeaderLogo}
          />
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

        {/* Weekly Champion Banner */}
        {weeklyChampion && (
          <View style={styles.weeklyChampionSection}>
            <Text style={styles.weeklyChampionEmoji}>🏆</Text>
            <Text style={styles.weeklyChampionLabel}>Ugens mester</Text>
            <Text style={styles.weeklyChampionName}>{weeklyChampion.displayName}</Text>
          </View>
        )}

        {/* Gym Leaderboard Section */}
        <TouchableOpacity
          style={styles.section}
          onPress={() =>
            navigation.navigate('GymLeaderboard', {gymId, gym})
          }
          activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Icon name="trophy" size={20} color="#FFD700" />
            <Text style={styles.sectionTitle}>Rangliste</Text>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} style={styles.sectionChevron} />
          </View>
          <Text style={styles.leaderboardSubtitle}>
            Se hvem der har flest besøg her
          </Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Active Users Section - outside ScrollView so tap works reliably */}
      <TouchableOpacity
        style={styles.activeUsersStickySection}
        onPress={() => setActiveUsersModalVisible(true)}
        activeOpacity={0.8}>
        <View style={styles.sectionHeader}>
          <Icon name="people" size={20} color="#34C759" />
          <Text style={styles.sectionTitle}>Aktive brugere</Text>
          <Icon name="chevron-forward" size={18} color={colors.textMuted} style={styles.sectionChevron} />
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statValue}>{activeUsers}</Text>
          <Text style={styles.statLabel}>
            {activeUsers === 1 ? 'aktiv bruger' : 'aktive brugere'} lige nu
          </Text>
        </View>
      </TouchableOpacity>

      {/* Active Users Modal */}
      <Modal
        visible={activeUsersModalVisible}
        transparent
        animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActiveUsersModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeUsers} aktive – {gym.name}
              </Text>
              <TouchableOpacity
                onPress={() => setActiveUsersModalVisible(false)}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Icon name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={getActiveUsers(activeUsers, gymId)}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              renderItem={({item}) => (
                <View style={styles.modalUserItem}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>
                      {item.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.modalUserInfo}>
                    <View style={styles.modalUserNameRow}>
                      <Text style={styles.modalUserName}>{item.name}</Text>
                      {item.isFriend && (
                        <View style={styles.friendBadge}>
                          <Icon name="person" size={12} color="#fff" />
                          <Text style={styles.friendBadgeText}>Ven</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.modalUserDuration}>
                      I gang i {formatDuration(item.durationMinutes)}
                    </Text>
                  </View>
                </View>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingBottom: 8,
  },
  activeUsersStickySection: {
    backgroundColor: colors.backgroundCard,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    flex: 1,
  },
  sectionChevron: {
    marginLeft: 4,
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
  leaderboardSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  weeklyChampionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD70020',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    gap: 8,
  },
  weeklyChampionEmoji: {
    fontSize: 24,
  },
  weeklyChampionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8860B',
  },
  weeklyChampionName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  modalList: {
    maxHeight: 300,
    paddingVertical: 8,
  },
  modalUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modalAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalUserInfo: {
    flex: 1,
  },
  modalUserNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalUserDuration: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  friendBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});

export default GymDetailScreen;

