/**
 * Søg brugere på brugernavn eller navn og send venneanmodning (Supabase).
 */

import React, {useCallback, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {
  upsertMyProfile,
  searchProfiles,
  sendFriendRequest,
  getMyFriendIds,
  getOutgoingPendingTo,
  type PublicProfile,
} from '@/services/supabase/friendService';

const AddFriendScreen = () => {
  const navigation = useNavigation<any>();
  const {user} = useAppStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pendingTo, setPendingTo] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUserId = user?.id;

  const refreshRelations = useCallback(async () => {
    if (!currentUserId) {
      return;
    }
    try {
      const ids = await getMyFriendIds(currentUserId);
      setFriendIds(ids);
    } catch {
      setFriendIds(new Set());
    }
  }, [currentUserId]);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        return;
      }
      void (async () => {
        try {
          await upsertMyProfile(user);
        } catch {
          /* tabel findes måske ikke endnu */
        }
        await refreshRelations();
      })();
    }, [user, refreshRelations]),
  );

  const runSearch = async (q: string) => {
    if (!currentUserId || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const list = await searchProfiles(currentUserId, q);
      setResults(list);
      const pending = new Set<string>();
      for (const p of list) {
        if (await getOutgoingPendingTo(currentUserId, p.id)) {
          pending.add(p.id);
        }
      }
      setPendingTo(pending);
    } catch (e: any) {
      Alert.alert('Søgning fejlede', e?.message ?? 'Prøv igen.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (profile: PublicProfile) => {
    if (!currentUserId) {
      return;
    }
    try {
      await sendFriendRequest(currentUserId, profile.id);
      setPendingTo(prev => new Set(prev).add(profile.id));
      Alert.alert(
        'Sendt',
        `${profile.displayName} får en besked under Notifikationer.`,
      );
    } catch (e: any) {
      Alert.alert('Kunne ikke sende', e?.message ?? 'Prøv igen.');
    }
  };

  const renderRow = ({item}: {item: PublicProfile}) => {
    const isFriend = friendIds.has(item.id);
    const isPending = pendingTo.has(item.id);
    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
        {isFriend ? (
          <View style={styles.pillMuted}>
            <Text style={styles.pillMutedText}>Venner</Text>
          </View>
        ) : isPending ? (
          <View style={styles.pillMuted}>
            <Text style={styles.pillMutedText}>Afventer</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => handleAdd(item)}
            activeOpacity={0.85}>
            <Icon name="person-add-outline" size={18} color={colors.white} style={styles.addBtnIcon} />
            <Text style={styles.addBtnText}>Tilføj</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Tilføj ven" onBack={() => navigation.goBack()} />
      <View style={styles.searchWrap}>
        <Icon name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg på brugernavn eller navn"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={text => {
            setQuery(text);
            if (searchTimer.current) {
              clearTimeout(searchTimer.current);
            }
            searchTimer.current = setTimeout(() => void runSearch(text), 350);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
        ) : null}
      </View>
      <Text style={styles.hint}>
        Du og din ven skal begge have oprettet profil (log ind mindst én gang efter
        opdatering). Brug det brugernavn I valgte ved tilmelding.
      </Text>
      <FlatList
        data={results}
        keyExtractor={item => item.id}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading && query.length >= 2 ? (
            <Text style={styles.empty}>Ingen brugere fundet.</Text>
          ) : query.length < 2 ? (
            <Text style={styles.empty}>Skriv mindst 2 tegn for at søge.</Text>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {marginRight: spacing.sm},
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  spinner: {marginLeft: spacing.sm},
  hint: {
    ...typography.small,
    color: colors.textSecondary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    lineHeight: 20,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  rowBody: {flex: 1, marginLeft: spacing.md},
  name: {...typography.bodyBold, color: colors.text},
  username: {...typography.small, color: colors.textMuted, marginTop: 2},
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  addBtnIcon: {marginRight: 6},
  addBtnText: {
    ...typography.small,
    fontWeight: '700',
    color: colors.white,
  },
  pillMuted: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  pillMutedText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});

export default AddFriendScreen;
