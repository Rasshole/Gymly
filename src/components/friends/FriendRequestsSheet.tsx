import React, {useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import {useAppStore} from '@/store/appStore';
import {
  usePendingFriendRequestStore,
  type PendingFriendRequest,
} from '@/store/pendingFriendRequestStore';
import {UserAvatar} from '@/components/ui/UserAvatar';
import {safeDisplayName} from '@/utils/displayName';
import {
  getSupabaseRpcErrorMessage,
  isFriendRequestStaleError,
} from '@/utils/friendRequestRpcErrors';

const SCREEN_H = Dimensions.get('window').height;

export function FriendRequestsSheet(): React.ReactElement {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const userId = useAppStore(s => s.user?.id);
  const visible = usePendingFriendRequestStore(s => s.sheetVisible);
  const closeSheet = usePendingFriendRequestStore(s => s.closeSheet);
  const pending = usePendingFriendRequestStore(s => s.pending);
  const loading = usePendingFriendRequestStore(s => s.loading);
  const busyRequestId = usePendingFriendRequestStore(s => s.busyRequestId);
  const accept = usePendingFriendRequestStore(s => s.accept);
  const decline = usePendingFriendRequestStore(s => s.decline);
  const load = usePendingFriendRequestStore(s => s.load);

  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      if (userId) {
        void load(userId);
      }
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: 0,
          stiffness: 420,
          damping: 36,
          mass: 0.85,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: SCREEN_H,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, userId, load, backdrop, sheetY]);

  const handleAccept = useCallback(
    async (request: PendingFriendRequest) => {
      if (!userId) {
        return;
      }
      try {
        await accept(userId, request.id);
      } catch (e) {
        const msg = getSupabaseRpcErrorMessage(e);
        if (isFriendRequestStaleError(msg)) {
          void load(userId);
          return;
        }
        Alert.alert(
          t('friendProfile.couldNotAccept'),
          msg || t('errors.tryAgain'),
        );
      }
    },
    [userId, accept, load, t],
  );

  const handleDecline = useCallback(
    async (request: PendingFriendRequest) => {
      if (!userId) {
        return;
      }
      try {
        await decline(userId, request.id);
      } catch (e) {
        const msg = getSupabaseRpcErrorMessage(e);
        if (isFriendRequestStaleError(msg)) {
          void load(userId);
          return;
        }
        Alert.alert(
          t('friendProfile.couldNotDecline'),
          msg || t('errors.tryAgain'),
        );
      }
    },
    [userId, decline, load, t],
  );

  const renderItem = ({item}: {item: PendingFriendRequest}) => {
    const name = safeDisplayName(item.fromProfile?.displayName, 'Bruger');
    const username = item.fromProfile?.username?.trim();
    const busy = busyRequestId === item.id;

    return (
      <View style={styles.row}>
        <UserAvatar
          name={name}
          imageUrl={item.fromProfile?.avatarUrl}
          size="lg"
        />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {username ? (
            <Text style={styles.username} numberOfLines={1}>
              @{username}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.declineBtn, busy && styles.btnDisabled]}
            onPress={() => void handleDecline(item)}
            disabled={busy}
            activeOpacity={0.85}>
            <Text style={styles.declineText}>{t('friendProfile.decline')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.acceptBtn, busy && styles.btnDisabled]}
            onPress={() => void handleAccept(item)}
            disabled={busy}
            activeOpacity={0.85}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.acceptText}>{t('friendProfile.accept')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeSheet}
      statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet}>
          <Animated.View
            style={[styles.backdrop, {opacity: backdrop}]}
            pointerEvents="none"
          />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{translateY: sheetY}],
            },
          ]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('messages.friendRequestsTitle')}</Text>
          <Text style={styles.subtitle}>{t('messages.friendRequestsSubtitle')}</Text>
          {loading && pending.length === 0 ? (
            <ActivityIndicator
              style={styles.loader}
              color={colors.primary}
              size="large"
            />
          ) : pending.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="people-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {t('messages.friendRequestsEmpty')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={pending}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={closeSheet}
            activeOpacity={0.85}>
            <Text style={styles.closeBtnText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    maxHeight: SCREEN_H * 0.78,
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...shadows.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  list: {
    maxHeight: SCREEN_H * 0.48,
  },
  listContent: {
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  username: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  declineBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minWidth: 68,
    alignItems: 'center',
  },
  acceptBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    minWidth: 78,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: {elevation: 2},
    }),
  },
  declineText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  closeBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
