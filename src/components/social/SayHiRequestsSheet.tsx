/**
 * Inbox entry for pending say-hi requests (accept → chat, decline silent).
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {UserAvatar} from '@/components/ui/UserAvatar';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import {
  listIncomingSayHiRequests,
  respondSayHiRequest,
  sayHiErrorMessage,
  reportUser,
  type IncomingSayHiRequest,
} from '@/services/supabase/sayHiService';
import {blockUserAndSync} from '@/store/blockStore';
import {useChatStore} from '@/store/chatStore';
import {useAppStore} from '@/store/appStore';
import {safeDisplayName, firstUsableDisplayName} from '@/utils/displayName';

export type SayHiRequestsSheetProps = {
  visible: boolean;
  onClose: () => void;
  focusRequestId?: string | null;
};

const SayHiRequestsSheet: React.FC<SayHiRequestsSheetProps> = ({
  visible,
  onClose,
  focusRequestId,
}) => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const currentUser = useAppStore(s => s.user);
  const upsertChat = useChatStore(s => s.upsertChat);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState<IncomingSayHiRequest[]>([]);
  const [backendUnavailable, setBackendUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const {requests, backendUnavailable: missing} =
        await listIncomingSayHiRequests();
      setBackendUnavailable(missing);
      setRows(requests);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      void refresh();
    }
  }, [visible, refresh]);

  const accept = async (row: IncomingSayHiRequest) => {
    setBusyId(row.id);
    try {
      const res = await respondSayHiRequest(row.id, 'accept');
      if (!res.ok || !res.threadId) {
        Alert.alert(
          t('sayHi.errGeneric'),
          sayHiErrorMessage(
            res.backendUnavailable ? 'backend_unavailable' : res.error,
            t,
          ),
        );
        return;
      }
      const uid = currentUser?.id;
      if (uid) {
        const participantIds = [uid, row.senderId].sort();
        const name = safeDisplayName(row.senderDisplayName);
        upsertChat({
          id: res.threadId,
          participantIds,
          participantNames: participantIds.map(id =>
            id === uid
              ? firstUsableDisplayName(
                  currentUser?.displayName,
                  currentUser?.username,
                ) ?? t('common.you')
              : name,
          ),
          lastActivity: new Date(),
          unreadCount: 0,
        });
        onClose();
        navigation.navigate('Chat', {
          chatId: res.threadId,
          friendId: row.senderId,
          friendName: name,
          participants: [{id: row.senderId, name}],
        });
      }
      void refresh();
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (row: IncomingSayHiRequest) => {
    setBusyId(row.id);
    try {
      const res = await respondSayHiRequest(row.id, 'decline');
      if (!res.ok) {
        Alert.alert(
          t('sayHi.errGeneric'),
          sayHiErrorMessage(
            res.backendUnavailable ? 'backend_unavailable' : res.error,
            t,
          ),
        );
        return;
      }
      setRows(prev => prev.filter(r => r.id !== row.id));
    } finally {
      setBusyId(null);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, spacing.lg)},
          ]}>
          <Text style={styles.title}>{t('sayHi.inboxTitle')}</Text>
          <Text style={styles.sub}>{t('sayHi.inboxSubtitle')}</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{marginTop: 24}} />
          ) : backendUnavailable ? (
            <Text style={styles.empty}>{t('sayHi.backendUnavailable')}</Text>
          ) : rows.length === 0 ? (
            <Text style={styles.empty}>{t('sayHi.inboxEmpty')}</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={item => item.id}
              contentContainerStyle={{paddingBottom: spacing.xl}}
              renderItem={({item}) => {
                const name = safeDisplayName(item.senderDisplayName);
                const focused = focusRequestId === item.id;
                const live = Boolean(item.liveGymName);
                return (
                  <View
                    style={[styles.card, focused && styles.cardFocused]}
                    accessibilityLabel={name}>
                    <View style={styles.cardTop}>
                      <UserAvatar
                        name={name}
                        imageUrl={item.senderAvatarUrl}
                        size="md"
                      />
                      <View style={styles.cardText}>
                        <Text style={styles.name} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.message} numberOfLines={3}>
                          {item.message}
                        </Text>
                        <Text style={styles.meta}>
                          {live
                            ? t('sayHi.trainingHereNow')
                            : t('sayHi.notLiveNow')}
                          {live && item.liveGymName
                            ? ` · ${item.liveGymName}`
                            : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.accept}
                        disabled={busyId === item.id}
                        onPress={() => void accept(item)}
                        accessibilityRole="button"
                        accessibilityLabel={t('sayHi.acceptAndChat')}>
                        {busyId === item.id ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.acceptText}>
                            {t('sayHi.acceptAndChat')}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.decline}
                        disabled={busyId === item.id}
                        onPress={() => void decline(item)}
                        accessibilityRole="button"
                        accessibilityLabel={t('sayHi.notNow')}>
                        <Text style={styles.declineText}>{t('sayHi.notNow')}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.dangerRow}>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            t('sayHi.blockTitle'),
                            t('sayHi.blockBody', {name}),
                            [
                              {text: t('common.cancel'), style: 'cancel'},
                              {
                                text: t('sayHi.blockConfirm'),
                                style: 'destructive',
                                onPress: () => {
                                  void blockUserAndSync(item.senderId).then(
                                    () => void refresh(),
                                  );
                                },
                              },
                            ],
                          );
                        }}>
                        <Text style={styles.danger}>{t('sayHi.block')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          void reportUser({
                            otherUserId: item.senderId,
                            reason: 'say_hi_request',
                            context: {requestId: item.id},
                          }).then(res => {
                            if (res.ok) {
                              Alert.alert(t('sayHi.reportThanks'));
                            } else {
                              Alert.alert(
                                t('sayHi.errGeneric'),
                                sayHiErrorMessage(
                                  res.backendUnavailable
                                    ? 'backend_unavailable'
                                    : res.error,
                                  t,
                                ),
                              );
                            }
                          });
                        }}>
                        <Text style={styles.danger}>{t('sayHi.report')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    maxHeight: '88%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    ...shadows.sheet,
  },
  title: {...typography.h4, fontWeight: '700', color: colors.text},
  sub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.xl,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardFocused: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  cardTop: {flexDirection: 'row', alignItems: 'flex-start'},
  cardText: {flex: 1, marginLeft: spacing.md, minWidth: 0},
  name: {...typography.bodyBold, color: colors.text},
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
  },
  meta: {...typography.caption, color: colors.textMuted, marginTop: 4},
  actions: {flexDirection: 'row', gap: 8, marginTop: spacing.md},
  accept: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {...typography.small, fontWeight: '700', color: '#fff'},
  decline: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {...typography.small, fontWeight: '700', color: colors.text},
  dangerRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    justifyContent: 'center',
  },
  danger: {...typography.caption, color: colors.textMuted, fontWeight: '600'},
  close: {alignItems: 'center', paddingVertical: spacing.md},
  closeText: {...typography.body, color: colors.textMuted},
});

export default SayHiRequestsSheet;
