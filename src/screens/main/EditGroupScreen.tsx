/**
 * Edit Group — admin: navn, beskrivelse, billede
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {launchImageLibrary} from 'react-native-image-picker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import {useAppStore} from '@/store/appStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {
  updateGymlyGroup,
  uploadGymlyGroupImage,
} from '@/services/supabase/gymlyGroupsService';
import {useTranslation} from '@/i18n';
import colors from '@/theme/colors';
import {spacing, radius, typography, shadows} from '@/theme/designTokens';

const listCardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: {elevation: 2},
});

const EditGroupScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const {t} = useTranslation();
  const {group: initial, groupId: routeId} =
    (route.params as {
      groupId?: string;
      group?: {
        id: string;
        name?: string;
        description?: string;
        image?: string;
      };
    }) || {};
  const groupId = routeId || initial?.id;
  const user = useAppStore(s => s.user);
  const refreshGymly = useGymlyGroupsStore(s => s.refresh);

  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [imageUri, setImageUri] = useState<string | null>(initial?.image || null);
  const [saving, setSaving] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

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

  const handleSave = async () => {
    if (!groupId || !user?.id) {
      return;
    }
    if (!name.trim()) {
      Alert.alert(t('groups.createMissingNameTitle'), t('groups.createMissingNameBody'));
      return;
    }
    setSaving(true);
    try {
      let imageUrl = imageUri;
      if (
        imageUri &&
        (imageUri.startsWith('file://') ||
          imageUri.startsWith('content://') ||
          imageUri.startsWith('ph://'))
      ) {
        imageUrl = await uploadGymlyGroupImage(user.id, imageUri);
      }
      await updateGymlyGroup(groupId, {
        name: name.trim(),
        description: description.trim() || null,
        imageUrl,
      });
      await refreshGymly(user.id);
      navigation.goBack();
    } catch (e) {
      console.warn('updateGymlyGroup', e);
      Alert.alert(t('groups.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('groups.edit')}
        onBack={() => navigation.goBack()}
        showBack
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingBottom: spacing.xxl + insets.bottom + 72},
          ]}
          keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.imagePicker} onPress={() => void pickImage()}>
            {imageUri ? (
              <Image source={{uri: imageUri}} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Icon name="camera-outline" size={28} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>{t('groups.nameLabel')}</Text>
          <View style={[styles.inputCard, nameFocused && styles.inputCardFocused]}>
            <TextInput
              style={[styles.input, styles.nameInput]}
              value={name}
              onChangeText={setName}
              placeholderTextColor={colors.textMuted}
              maxLength={60}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>

          <Text style={styles.label}>{t('groups.descriptionLabel')}</Text>
          <View style={[styles.inputCard, descFocused && styles.inputCardFocused]}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              placeholderTextColor={colors.textMuted}
              maxLength={280}
              onFocus={() => setDescFocused(true)}
              onBlur={() => setDescFocused(false)}
            />
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {paddingBottom: Math.max(insets.bottom, spacing.md)},
          ]}>
          <SocialPrimaryButton
            label={saving ? t('groups.saving') : t('groups.save')}
            onPress={() => void handleSave()}
            disabled={!canSave}
            loading={saving}
            variant="premium"
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  flex: {flex: 1},
  content: {padding: spacing.lg},
  imagePicker: {alignSelf: 'center', marginBottom: spacing.lg},
  image: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: colors.primary + '55',
  },
  imagePlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  label: {
    ...typography.small,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border + 'CC',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
    ...listCardShadow,
  },
  inputCardFocused: {
    borderColor: colors.primary + '55',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: {width: 0, height: 0},
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {elevation: 3},
    }),
  },
  input: {
    ...typography.body,
    color: colors.text,
  },
  nameInput: {
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    lineHeight: Platform.OS === 'ios' ? typography.body.fontSize : typography.body.lineHeight,
    ...(Platform.OS === 'android'
      ? {includeFontPadding: false, textAlignVertical: 'center' as const}
      : null),
  },
  textArea: {
    minHeight: 100,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});

export default EditGroupScreen;
