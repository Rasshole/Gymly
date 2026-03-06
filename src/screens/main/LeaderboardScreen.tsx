/**
 * Rangliste-skærm – Check-ins, Tid trænet & Center
 * Uge, Måned, Nogensinde
 * Tid trænet: flest min / flest timer
 * Center: flest check-ins / mest tid
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useLeaderboardStore} from '@/store/leaderboardStore';
import {useAppStore} from '@/store/appStore';
import {useLeaderboardQuery} from '@/hooks/useLeaderboardQuery';
import LeaderboardSkeleton from '@/components/LeaderboardSkeleton';
import {colors} from '@/theme/colors';
import {LeaderboardEntry, LeaderboardPeriod} from '@/types/leaderboard.types';
import {getGymLogo, hasGymLogo} from '@/utils/gymLogos';
import danishGyms, {DanishGym} from '@/data/danishGyms';

type LeaderboardCategory = 'checkIns' | 'trainingTime' | 'center';
type TimeUnit = 'minutes' | 'hours';
type CenterSubFilter = 'checkIns' | 'time';

const PERIODS: {key: LeaderboardPeriod; label: string}[] = [
  {key: 'week', label: 'Uge'},
  {key: 'month', label: 'Måned'},
  {key: 'all', label: 'Nogensinde'},
];

const TIME_UNITS: {key: TimeUnit; label: string}[] = [
  {key: 'minutes', label: 'Flest min'},
  {key: 'hours', label: 'Flest timer'},
];

const CENTER_SUB_FILTERS: {key: CenterSubFilter; label: string}[] = [
  {key: 'checkIns', label: 'Flest check-ins'},
  {key: 'time', label: 'Mest tid'},
];

const CATEGORIES: {key: LeaderboardCategory; label: string; icon: string}[] = [
  {key: 'checkIns', label: 'Check-ins', icon: 'checkmark-circle'},
  {key: 'trainingTime', label: 'Tid trænet', icon: 'time'},
  {key: 'center', label: 'Center', icon: 'business'},
];

const getRankStyle = (rank: number) => {
  if (rank === 1) return {backgroundColor: '#FFD700'};
  if (rank === 2) return {backgroundColor: '#C0C0C0'};
  if (rank === 3) return {backgroundColor: '#CD7F32'};
  return {backgroundColor: colors.surface};
};

const GymSearchModal = ({
  visible,
  onClose,
  onSelectGym,
}: {
  visible: boolean;
  onClose: () => void;
  onSelectGym: (gym: DanishGym) => void;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredGyms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return danishGyms;
    return danishGyms.filter(
      g =>
        g.name.toLowerCase().includes(q) ||
        (g.city?.toLowerCase().includes(q)) ||
        (g.brand?.toLowerCase().includes(q)) ||
        (g.address?.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Find center i Danmark</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Icon name="close" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.modalSearchRow}>
          <Icon name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.modalSearchInput}
            placeholder="Søg efter center, by eller kæde..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={filteredGyms}
          keyExtractor={item => String(item.id)}
          renderItem={({item}) => (
            <TouchableOpacity
              style={styles.modalGymRow}
              onPress={() => onSelectGym(item)}
              activeOpacity={0.7}>
              {hasGymLogo(item.brand) && getGymLogo(item.brand) ? (
                <Image
                  source={{uri: getGymLogo(item.brand)!}}
                  style={styles.modalGymLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.modalGymIcon}>
                  <Icon name="business" size={24} color={colors.primary} />
                </View>
              )}
              <View style={styles.modalGymInfo}>
                <Text style={styles.modalGymName}>{item.name}</Text>
                {(item.city || item.brand) && (
                  <Text style={styles.modalGymMeta}>
                    {[item.brand, item.city].filter(Boolean).join(' • ')}
                  </Text>
                )}
              </View>
              <Icon name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.modalEmpty}>
              <Text style={styles.modalEmptyText}>
                {searchQuery ? 'Ingen centre fundet' : 'Indlæser...'}
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
};

const LeaderboardRow = ({
  item,
  onPress,
}: {
  item: LeaderboardEntry;
  onPress: () => void;
}) => {
  const rankStyle = getRankStyle(item.rank);

  return (
    <TouchableOpacity
      style={[styles.row, item.isCurrentUser && styles.rowHighlight]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={item.isCurrentUser}>
      <View style={[styles.rankBadge, rankStyle]}>
        <Text style={[styles.rankText, item.rank <= 3 && styles.rankTextMedal]}>
          {item.rank}
        </Text>
      </View>
      {item.profileImageUrl ? (
        <Image source={{uri: item.profileImageUrl}} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{item.displayName.charAt(0)}</Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>
            {item.isCurrentUser ? 'Dig' : item.displayName}
          </Text>
          {item.isWeeklyChampion && (
            <View style={styles.championBadge}>
              <Text style={styles.championEmoji}>🏆</Text>
              <Text style={styles.championText}>Ugens mester</Text>
            </View>
          )}
          {item.isFriend && !item.isCurrentUser && (
            <View style={styles.friendBadge}>
              <Text style={styles.friendBadgeText}>Ven</Text>
            </View>
          )}
        </View>
        <Text style={styles.value}>{item.valueLabel}</Text>
      </View>
      {item.rank === 1 && (
        <Icon name="trophy" size={22} color="#FFD700" />
      )}
    </TouchableOpacity>
  );
};

const LeaderboardCard = ({
  title,
  icon,
  entries,
  onUserPress,
}: {
  title: string;
  icon: string;
  entries: LeaderboardEntry[];
  onUserPress: (userId: string, displayName: string) => void;
}) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <Icon name={icon as any} size={24} color={colors.primary} />
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    {entries.slice(0, 10).map((item, idx) => (
      <LeaderboardRow
        key={`${item.userId}-${idx}`}
        item={{...item, rank: item.rank || idx + 1}}
        onPress={() => onUserPress(item.userId, item.displayName)}
      />
    ))}
  </View>
);

const LeaderboardScreen = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const {user} = useAppStore();
  const {getCenterLeaderboard} = useLeaderboardStore();
  const [category, setCategory] = useState<LeaderboardCategory>('checkIns');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('minutes');
  const [centerSubFilter, setCenterSubFilter] = useState<CenterSubFilter>('checkIns');
  const [selectedGym, setSelectedGym] = useState<{id: number; name: string} | null>(null);
  const [showGymSearchModal, setShowGymSearchModal] = useState(false);
  const currentUserId = user?.id || 'current_user';

  const localGyms = useMemo(() => {
    const ids = user?.favoriteGyms || [];
    return ids
      .map(id => danishGyms.find(g => g.id === id))
      .filter((g): g is DanishGym => g != null);
  }, [user?.favoriteGyms]);

  const {entries: rawQueryEntries, isLoading: queryLoading} = useLeaderboardQuery(
    'global',
    category === 'center' ? 'checkIns' : category,
    period,
    currentUserId
  );

  const centerEntries =
    selectedGym != null
      ? getCenterLeaderboard(centerSubFilter, period, currentUserId, selectedGym.id)
      : [];

  const rawEntries =
    category === 'center' ? centerEntries : rawQueryEntries;
  const isLoading = category === 'center' ? false : queryLoading;

  // Transform valueLabel for Tid trænet when showing timer
  const entries =
    category === 'trainingTime' && timeUnit === 'hours'
      ? rawEntries.map(e => ({
          ...e,
          valueLabel:
            e.value >= 60
              ? `${Math.floor(e.value / 60)} timer`
              : `${e.value} min`,
        }))
      : rawEntries;

  const handleUserPress = (userId: string, displayName: string) => {
    if (userId !== 'current_user') {
      navigation.navigate('FriendProfile', {
        friendId: userId,
        friendName: displayName,
        mutualFriends: 0,
        gyms: [],
      });
    }
  };

  const currentCategory = CATEGORIES.find(c => c.key === category)!;
  const cardTitle =
    category === 'center' && selectedGym
      ? `${selectedGym.name} – ${CENTER_SUB_FILTERS.find(f => f.key === centerSubFilter)?.label || ''}`
      : category === 'center'
      ? 'Center'
      : currentCategory.label;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rangliste</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Kategorier: Check-ins | Tid trænet */}
      <View style={styles.categorySection}>
        <View style={styles.categoryRow}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.key}
              style={[
                styles.categoryButton,
                category === c.key && styles.categoryButtonActive,
              ]}
              onPress={() => setCategory(c.key)}
              activeOpacity={0.8}>
              <Icon
                name={c.icon as any}
                size={22}
                color={category === c.key ? '#fff' : colors.text}
              />
              <Text
                style={[
                  styles.categoryButtonText,
                  category === c.key && styles.categoryButtonTextActive,
                ]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.categoryHint}>
          {category === 'checkIns'
            ? 'Flest check-ins vinder'
            : category === 'trainingTime'
            ? 'Flest minutter eller timer trænet'
            : 'Flest check-ins eller mest tid på center'}
        </Text>
      </View>

      {/* Periode: Uge / Måned / Nogensinde */}
      <View style={styles.periodRow}>
        {PERIODS.map(({key, label}) => (
          <TouchableOpacity
            key={key}
            style={[styles.periodTab, period === key && styles.periodTabActive]}
            onPress={() => setPeriod(key)}>
            <Text style={[styles.periodTabText, period === key && styles.periodTabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tid trænet: Flest min / Flest timer */}
      {category === 'trainingTime' && (
        <View style={styles.periodRow}>
          {TIME_UNITS.map(({key, label}) => (
            <TouchableOpacity
              key={key}
              style={[styles.periodTab, timeUnit === key && styles.periodTabActive]}
              onPress={() => setTimeUnit(key)}>
              <Text
                style={[
                  styles.periodTabText,
                  timeUnit === key && styles.periodTabTextActive,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Center: Flest check-ins / Mest tid */}
      {category === 'center' && (
        <>
          <View style={styles.periodRow}>
            {CENTER_SUB_FILTERS.map(({key, label}) => (
              <TouchableOpacity
                key={key}
                style={[styles.periodTab, centerSubFilter === key && styles.periodTabActive]}
                onPress={() => setCenterSubFilter(key)}>
                <Text
                  style={[
                    styles.periodTabText,
                    centerSubFilter === key && styles.periodTabTextActive,
                  ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Vælg center: 3 lokale + søg alle */}
          <View style={styles.gymSelectorSection}>
            <Text style={styles.gymSelectorLabel}>Vælg center</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gymSelectorScroll}>
              {localGyms.map((gym, index) => (
                <TouchableOpacity
                  key={gym.id}
                  style={[
                    styles.gymSelectorCard,
                    selectedGym?.id === gym.id && styles.gymSelectorCardActive,
                  ]}
                  onPress={() =>
                    setSelectedGym(selectedGym?.id === gym.id ? null : {id: gym.id, name: gym.name})
                  }
                  activeOpacity={0.8}>
                  <View style={styles.gymSelectorBadge}>
                    <Text style={styles.gymSelectorBadgeText}>{index + 1}</Text>
                  </View>
                  {hasGymLogo(gym.brand) && getGymLogo(gym.brand) ? (
                    <Image
                      source={{uri: getGymLogo(gym.brand)!}}
                      style={styles.gymSelectorLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.gymSelectorIcon}>
                      <Icon name="business" size={24} color={colors.primary} />
                    </View>
                  )}
                  <Text
                    style={[
                      styles.gymSelectorName,
                      selectedGym?.id === gym.id && styles.gymSelectorNameActive,
                    ]}
                    numberOfLines={2}>
                    {gym.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.gymSelectorCard, styles.gymSearchCard]}
                onPress={() => setShowGymSearchModal(true)}
                activeOpacity={0.8}>
                <Icon name="search" size={28} color={colors.primary} />
                <Text style={styles.gymSearchCardText}>Søg alle centre</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <GymSearchModal
            visible={showGymSearchModal}
            onClose={() => setShowGymSearchModal(false)}
            onSelectGym={gym => {
              setSelectedGym({id: gym.id, name: gym.name});
              setShowGymSearchModal(false);
            }}
          />
        </>
      )}

      {/* Rangliste */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {category === 'center' && selectedGym == null ? (
          <View style={styles.emptyCenter}>
            <Icon name="business-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyCenterText}>Vælg et center ovenfor for at se ranglisten</Text>
          </View>
        ) : isLoading ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name={currentCategory.icon as any} size={24} color={colors.primary} />
              <Text style={styles.cardTitle}>{cardTitle}</Text>
            </View>
            <LeaderboardSkeleton count={8} />
          </View>
        ) : category === 'center' && entries.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Icon name="stats-chart-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyCenterText}>
              Ingen rangliste-data for dette center endnu
            </Text>
          </View>
        ) : (
          <LeaderboardCard
            title={cardTitle}
            icon={currentCategory.icon}
            entries={entries}
            onUserPress={handleUserPress}
          />
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
  backButton: {padding: 4},
  headerTitle: {fontSize: 18, fontWeight: '600', color: colors.text},
  headerRight: {width: 32},
  categorySection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  categoryButtonActive: {
    backgroundColor: colors.primary,
  },
  categoryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  categoryHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  gymSelectorSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gymSelectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  gymSelectorScroll: {
    gap: 10,
    paddingRight: 16,
  },
  gymSelectorCard: {
    width: 120,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gymSelectorBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  gymSelectorBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  gymSelectorCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  gymSelectorLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  gymSelectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  gymSelectorName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  gymSelectorNameActive: {
    color: colors.primary,
  },
  gymSearchCard: {
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: colors.primary + '60',
  },
  gymSearchCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginTop: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFF4',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalCloseBtn: {padding: 4},
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  modalGymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.backgroundCard,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    gap: 12,
  },
  modalGymLogo: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  modalGymIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalGymInfo: {flex: 1},
  modalGymName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalGymMeta: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  modalEmpty: {
    padding: 32,
    alignItems: 'center',
  },
  modalEmptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptyCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyCenterText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  periodTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  periodTabActive: {
    backgroundColor: colors.primary,
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodTabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rowHighlight: {
    backgroundColor: colors.primary + '15',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderBottomColor: 'transparent',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.text,
  },
  rankTextMedal: {
    color: '#fff',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  userInfo: {flex: 1},
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  value: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  championBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD70030',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  championEmoji: {fontSize: 10},
  championText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B8860B',
  },
  friendBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  friendBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
});

export default LeaderboardScreen;
