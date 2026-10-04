/**
 * Create Group — name required; photo, description, friends optional.
 * Calm flat CTA (no premium gradient).
 */

import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {UserAvatar} from '@/components/ui/UserAvatar';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import SocialSearchBar from '@/components/social/SocialSearchBar';
import {useAppStore} from '@/store/appStore';
import {useFriendStore} from '@/store/friendStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {
  createGymlyGroupRpc,
  inviteManyToGymlyGroup,
  uploadGymlyGroupImage,
} from '@/services/supabase/gymlyGroupsService';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

const CreateGroupScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {t} = useTranslation();
  const user = useAppStore(s => s.user);
  const refreshGymly = useGymlyGroupsStore(s => s.refresh);
  const friends = useFriendStore(s => s.friends);
  const loadFriends = useFriendStore(s => s.load);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [friendQuery, setFriendQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  useEffect(() => {
    if (user?.id) {
      void loadFriends(user.id);
    }
  }, [user?.id, loadFriends]);

  const hasFriends = friends.length > 0;

  const filteredFriends = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    if (!q) {
      return friends;
    }
    return friends.filter(
      f =>
        f.displayName.toLowerCase().includes(q) ||
        (f.username ?? '').toLowerCase().includes(q),
    );
  }, [friends, friendQuery]);

  const canSubmit = name.trim().length > 0 && !creating;

  const toggleFriend = (id: string) => {
    setSelectedFriendIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const pickImage = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
    });
    const uri = res.assets?.[0]?.uri;
    if (uri) {
      setImageUri(uri);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(
        t('groups.createMissingNameTitle'),
        t('groups.createMissingNameBody'),
      );
      return;
    }
    if (!user?.id || creating) {
      return;
    }
    setCreating(true);
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadGymlyGroupImage(user.id, imageUri);
      }
      const gid = await createGymlyGroupRpc({
        name: name.trim(),
        description: description.trim(),
        isPrivate: true,
        imageUrl,
      });
      const inviteIds = [...selectedFriendIds];
      if (inviteIds.length > 0) {
        await inviteManyToGymlyGroup(gid, inviteIds);
      }
      await refreshGymly(user.id);
      navigation.replace('GroupDetail', {groupId: gid});
    } catch (e) {
      console.warn('createGymlyGroup', e);
      Alert.alert(t('groups.createFailedTitle'), t('groups.createFailedBody'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('groups.createTitle')}
        onBack={() => navigation.goBack()}
        showBack
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {paddingBottom: spacing.xxl + insets.bottom + 72},
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.imagePicker}
            onPress={() => void pickImage()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('groups.addPhoto')}>
            {imageUri ? (
              <Image source={{uri: imageUri}} style={styles.imagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Icon name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.imageHint}>{t('groups.addPhoto')}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>{t('groups.nameLabel')}</Text>
          <View
            style={[styles.inputCard, nameFocused && styles.inputCardFocused]}>
            <TextInput
              style={[styles.input, styles.nameInput]}
              placeholder={t('groups.namePlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={60}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>{t('groups.descriptionLabel')}</Text>
            <Text style={styles.optionalTag}>{t('groups.optional')}</Text>
          </View>
          <View
            style={[styles.inputCard, descFocused && styles.inputCardFocused]}>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('groups.descriptionPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              maxLength={280}
              onFocus={() => setDescFocused(true)}
              onBlur={() => setDescFocused(false)}
            />
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.labelInline}>
              {hasFriends
                ? t('groups.inviteFriends', {count: selectedFriendIds.size})
                : t('groups.addFriends')}
            </Text>
            <Text style={styles.optionalTag}>{t('groups.optional')}</Text>
          </View>

          {hasFriends ? (
            <>
              <SocialSearchBar
                value={friendQuery}
                onChangeText={setFriendQuery}
                placeholder={t('groups.searchFriends')}
                style={styles.friendSearch}
              />
              {filteredFriends.length === 0 ? (
                <Text style={styles.emptyFriends}>
                  {t('groups.noFriendsMatch')}
                </Text>
              ) : (
                filteredFriends.map(f => {
                  const selected = selectedFriendIds.has(f.id);
                  return (
                    <Pressable
                      key={f.id}
                      style={({pressed}) => [
                        styles.friendRow,
                        selected && styles.friendRowSelected,
                        pressed && styles.friendRowPressed,
                      ]}
                      onPress={() => toggleFriend(f.id)}>
                      <View style={styles.avatarRing}>
                        <UserAvatar
                          name={f.displayName}
                          imageUrl={f.avatarUrl}
                          size="sm"
                        />
                      </View>
                      <View style={styles.friendBody}>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {f.displayName}
                        </Text>
                        {f.username ? (
                          <Text style={styles.friendUser} numberOfLines={1}>
                            @{f.username}
                          </Text>
                        ) : null}
                      </View>
                      <Icon
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? colors.primary : colors.textMuted}
                      />
                    </Pressable>
                  );
                })
              )}
            </>
          ) : (
            <Text style={styles.inviteLaterHint}>
              {t('groups.inviteLater')}
            </Text>
          )}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {paddingBottom: Math.max(insets.bottom, spacing.md)},
          ]}>
          <SocialPrimaryButton
            label={creating ? t('groups.creating') : t('groups.createSubmit')}
            onPress={() => void handleCreate()}
            disabled={!canSubmit}
            loading={creating}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  flex: {flex: 1},
  scroll: {flex: 1},
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  imagePicker: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  imagePreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: colors.primary + '40',
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
    fontSize: 11,
  },
  label: {
    ...typography.small,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  labelInline: {
    ...typography.small,
    fontWeight: '700',
    color: colors.text,
  },
  optionalTag: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  inputCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  inputCardFocused: {
    borderColor: colors.primary + '55',
  },
  input: {
    ...typography.body,
    color: colors.text,
  },
  nameInput: {
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    lineHeight:
      Platform.OS === 'ios'
        ? typography.body.fontSize
        : typography.body.lineHeight,
    ...(Platform.OS === 'android'
      ? {includeFontPadding: false, textAlignVertical: 'center' as const}
      : null),
  },
  textArea: {
    minHeight: 64,
    maxHeight: 96,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  friendSearch: {marginBottom: spacing.sm},
  emptyFriends: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  inviteLaterHint: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    marginBottom: spacing.xs,
  },
  friendRowSelected: {
    backgroundColor: colors.primary + '08',
    borderColor: colors.primary + '40',
  },
  friendRowPressed: {
    opacity: 0.92,
  },
  avatarRing: {
    marginRight: spacing.md,
  },
  friendBody: {flex: 1, minWidth: 0},
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  friendUser: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});

export default CreateGroupScreen;
