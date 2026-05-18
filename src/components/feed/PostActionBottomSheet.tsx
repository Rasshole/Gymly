import React, {useCallback, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';
import {
  saveWorkoutPostImageToLibrary,
  shareWorkoutPost,
} from '@/services/post/postShareAndSave';
import {
  deleteWorkoutPostForUser,
  submitPostReport,
} from '@/services/supabase/workoutPostService';
import {isLikelyServerPostUuid, isLocalDemoPostId} from '@/utils/postIds';

const SCREEN_H = Dimensions.get('window').height;

export type PostActionSheetPost = {
  id: string;
  userId?: string;
  userName: string;
  caption?: string;
  photoUri?: string | null;
  workoutInfo?: string;
};

export type PostActionBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  post: PostActionSheetPost | null;
  currentUserId?: string | null;
  /**
   * `workoutPost`: Supabase feed / profil-opslag (slet kun egne).
   * `activity`: Aktivitetsstrøm — ingen slet af DB-opslag.
   */
  variant?: 'workoutPost' | 'activity';
  onPostDeleted?: (postId: string) => void;
};

const springOpen = {
  stiffness: 420,
  damping: 36,
  mass: 0.85,
  overshootClamping: false,
  useNativeDriver: true,
} as const;

const springClose = {
  stiffness: 520,
  damping: 40,
  mass: 0.9,
  useNativeDriver: true,
} as const;

export const PostActionBottomSheet: React.FC<PostActionBottomSheetProps> = ({
  visible,
  onClose,
  post,
  currentUserId,
  variant = 'workoutPost',
  onPostDeleted,
}) => {
  const insets = useSafeAreaInsets();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;

  const isOwn =
    !!post?.userId && !!currentUserId && post.userId === currentUserId;

  const canSaveImage = !!post?.photoUri?.trim();

  const canServerDelete =
    variant === 'workoutPost' &&
    isOwn &&
    !!post?.userId &&
    (isLikelyServerPostUuid(post.id) || isLocalDemoPostId(post.id));

  /** Kun `id` + synlighed styrer animation — undgår genåbning når forælderen re-render med nyt `post`-objekt (samme id). */
  const postId = post?.id;

  useEffect(() => {
    if (visible && postId) {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: 0,
          ...springOpen,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: SCREEN_H,
          ...springClose,
        }),
      ]).start();
    }
  }, [visible, postId, backdrop, sheetY]);

  const runClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdrop, {toValue: 0, duration: 180, useNativeDriver: true}),
      Animated.spring(sheetY, {toValue: SCREEN_H, ...springClose}),
    ]).start(({finished}) => {
      if (finished) {
        onClose();
      }
    });
  }, [backdrop, sheetY, onClose]);

  const handleSaveImage = useCallback(async () => {
    if (!post) {
      return;
    }
    await saveWorkoutPostImageToLibrary(post.photoUri);
  }, [post]);

  const handleShare = useCallback(async () => {
    if (!post) {
      return;
    }
    await shareWorkoutPost({
      caption: post.caption,
      workoutInfo: post.workoutInfo,
      photoUri: post.photoUri,
    });
  }, [post]);

  const handleReport = useCallback(() => {
    if (!post) {
      return;
    }
    Alert.alert(
      'Rapportér opslag',
      'Vil du anmelde dette opslag til Gymly?',
      [
        {text: 'Annuller', style: 'cancel'},
        {
          text: 'Rapportér',
          style: 'destructive',
          onPress: async () => {
            const res = await submitPostReport(post.id);
            if (res.ok) {
              Alert.alert('Tak', 'Vi har modtaget din anmeldelse.');
            } else {
              Alert.alert('Beklager', res.message ?? 'Prøv igen senere.');
            }
            runClose();
          },
        },
      ],
    );
  }, [post, runClose]);

  const handleDelete = useCallback(() => {
    const uid = post?.userId;
    if (!post || !uid) {
      return;
    }
    Alert.alert('Vil du slette denne træning?', undefined, [
      {text: 'Annuller', style: 'cancel'},
      {
        text: 'Slet',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteWorkoutPostForUser(post.id, uid, post.photoUri);
          if (res.ok) {
            onPostDeleted?.(post.id);
            runClose();
          } else {
            Alert.alert('Kunne ikke slette', res.message ?? 'Prøv igen.');
          }
        },
      },
    ]);
  }, [post, onPostDeleted, runClose]);

  return (
    <Modal
      visible={visible && !!post}
      transparent
      animationType="none"
      onRequestClose={runClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent>
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdrop.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              }),
            },
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={runClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm,
              transform: [{translateY: sheetY}],
            },
            shadows.card,
          ]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.title}>Handlinger</Text>

          {canSaveImage ? (
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                handleSaveImage().catch(() => {});
              }}
              activeOpacity={0.75}>
              <Icon name="download-outline" size={22} color={colors.text} />
              <Text style={styles.rowLabel}>Gem billede</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              handleShare().catch(() => {});
            }}
            activeOpacity={0.75}>
            <Icon name="share-outline" size={22} color={colors.text} />
            <Text style={styles.rowLabel}>Del opslag</Text>
          </TouchableOpacity>

          {!isOwn ? (
            <TouchableOpacity
              style={styles.row}
              onPress={handleReport}
              activeOpacity={0.75}>
              <Icon name="flag-outline" size={22} color={colors.text} />
              <Text style={styles.rowLabel}>Rapportér opslag</Text>
            </TouchableOpacity>
          ) : null}

          {canServerDelete ? (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.rowDestructive}
                onPress={handleDelete}
                activeOpacity={0.75}>
                <Icon name="trash-outline" size={22} color={colors.error} />
                <Text style={styles.rowLabelDestructive}>Slet træning</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            style={[styles.cancelBtn, Platform.OS === 'ios' && styles.cancelBtnIos]}
            onPress={runClose}
            activeOpacity={0.8}>
            <Text style={styles.cancelText}>Luk</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  title: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  rowDestructive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  rowLabelDestructive: {
    ...typography.body,
    color: colors.error,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  cancelBtn: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary + '14',
  },
  cancelBtnIos: {},
  cancelText: {
    ...typography.bodyBold,
    color: colors.primary,
    fontWeight: '700',
  },
});
