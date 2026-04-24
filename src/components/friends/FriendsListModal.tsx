import React, {useCallback, useMemo, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '@/store/appStore';
import {useFriends} from '@/hooks/useFriends';
import {useProfileStats} from '@/hooks/useProfileData';
import Avatar from '@/components/ui/Avatar';
import colors from '@/theme/colors';
import {spacing, typography, radius} from '@/theme/designTokens';
import {navigateToFriendProfile} from '@/navigation/rootNavigation';
import {useNavigation} from '@react-navigation/native';
import type {PublicProfile} from '@/services/supabase/friendService';

type FriendsListModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function FriendsListModal({visible, onClose}: FriendsListModalProps) {
  const navigation = useNavigation<any>();
  const {user} = useAppStore();
  const {acceptedFriends: friends, removeFriend} = useFriends();
  const {refresh: refreshProfileStats} = useProfileStats(user?.id);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return friends;
    }
    return friends.filter(
      f =>
        f.displayName.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q),
    );
  }, [friends, query]);

  const confirmRemove = useCallback(
    (f: PublicProfile) => {
      if (!user?.id) {
        return;
      }
      Alert.alert(
        'Fjern ven',
        'Er du sikker på, at du vil fjerne denne ven?',
        [
          {text: 'Annuller', style: 'cancel'},
          {
            text: 'Fjern',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await removeFriend(user.id, f.id);
                  await refreshProfileStats();
                } catch (e) {
                  Alert.alert(
                    'Kunne ikke fjerne',
                    (e as Error).message || 'Prøv igen.',
                  );
                }
              })();
            },
          },
        ],
        {cancelable: true},
      );
    },
    [user?.id, removeFriend, refreshProfileStats],
  );

  const openProfile = useCallback(
    (f: PublicProfile) => {
      onClose();
      navigateToFriendProfile(navigation, {
        friendId: f.id,
        friendName: f.displayName,
        mutualFriends: 0,
        friendAvatarUrl: f.avatarUrl ?? undefined,
        gyms: [],
      });
    },
    [navigation, onClose],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>Venner</Text>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Luk">
          <Icon name="close" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Icon
          name="search"
          size={20}
          color={colors.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Søg"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Icon name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={it => it.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {friends.length === 0
                ? 'Ingen venner endnu. Tilføj ven under Venner-fanen.'
                : 'Ingen resultater.'}
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.row}>
            <Pressable
              style={({pressed}) => [styles.rowMain, pressed && {opacity: 0.7}]}
              onPress={() => openProfile(item)}>
              <Avatar
                name={item.displayName}
                imageUrl={item.avatarUrl}
                size="md"
              />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={styles.username} numberOfLines={1}>
                  @{item.username}
                </Text>
              </View>
            </Pressable>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => confirmRemove(item)}
              activeOpacity={0.7}>
              <Text style={styles.removeBtnText}>Fjern</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h4,
    color: colors.text,
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
  },
  searchIcon: {marginRight: 8},
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  listContent: {paddingBottom: 32, paddingHorizontal: spacing.md},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0},
  rowText: {flex: 1, marginLeft: spacing.md, minWidth: 0},
  name: {...typography.body, fontWeight: '600', color: colors.text},
  username: {...typography.caption, color: colors.textSecondary, marginTop: 2},
  removeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.error + '18',
  },
  removeBtnText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.error,
  },
  empty: {padding: spacing.xl, alignItems: 'center'},
  emptyText: {...typography.body, color: colors.textMuted, textAlign: 'center'},
});
