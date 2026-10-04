/**
 * Short say-hi composer with suggestion chips. Nothing sent until Send.
 */

import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {useTranslation} from '@/i18n';
import {
  sendSayHiRequest,
  sayHiErrorMessage,
} from '@/services/supabase/sayHiService';
import {SAY_HI_MAX_CHARS, validateSayHiMessage} from '@/utils/contactStatus';

export type SayHiComposerSheetProps = {
  visible: boolean;
  recipientId: string;
  recipientName: string;
  onClose: () => void;
  onSent: () => void;
  /**
   * Render inside an already-presented Modal (e.g. LiveMiniProfileSheet).
   * iOS cannot reliably stack a second RN Modal on top of another.
   */
  embedded?: boolean;
};

const SayHiComposerSheet: React.FC<SayHiComposerSheetProps> = ({
  visible,
  recipientId,
  recipientName,
  onClose,
  onSent,
  embedded = false,
}) => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const suggestions = useMemo(
    () => [
      t('sayHi.suggest1'),
      t('sayHi.suggest2'),
      t('sayHi.suggest3'),
    ],
    [t],
  );

  const onSend = async () => {
    const validated = validateSayHiMessage(text || suggestions[0]);
    if (!validated.ok) {
      Alert.alert(
        t('sayHi.errGeneric'),
        sayHiErrorMessage(
          validated.error === 'too_long' ? 'message_too_long' : 'empty_message',
          t,
        ),
      );
      return;
    }
    setSending(true);
    try {
      const res = await sendSayHiRequest(recipientId, validated.message);
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
      setText('');
      onSent();
    } finally {
      setSending(false);
    }
  };

  if (!visible) {
    return null;
  }

  const body = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.card,
          {paddingBottom: Math.max(insets.bottom, spacing.md)},
        ]}>
        <Text style={styles.title}>
          {t('sayHi.composerTitle', {name: recipientName})}
        </Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={v => setText(v.slice(0, SAY_HI_MAX_CHARS))}
          placeholder={t('sayHi.composerPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={SAY_HI_MAX_CHARS}
          editable={!sending}
        />
        <Text style={styles.counter}>
          {text.trim().length}/{SAY_HI_MAX_CHARS}
        </Text>
        <View style={styles.chips}>
          {suggestions.map(s => (
            <TouchableOpacity
              key={s}
              style={styles.chip}
              onPress={() => setText(s)}
              disabled={sending}>
              <Text style={styles.chipText} numberOfLines={2}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={() => void onSend()}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={t('sayHi.send')}>
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendText}>{t('sayHi.send')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  if (embedded) {
    return <View style={styles.embeddedRoot}>{body}</View>;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}>
      {body}
    </Modal>
  );
};

const styles = StyleSheet.create({
  embeddedRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  flex: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  input: {
    ...typography.body,
    minHeight: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
  counter: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  chips: {gap: 8, marginBottom: spacing.md},
  chip: {
    backgroundColor: colors.primary + '12',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: {
    ...typography.small,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {...typography.bodyBold, color: '#fff'},
  cancel: {alignItems: 'center', paddingVertical: spacing.md},
  cancelText: {...typography.body, color: colors.textMuted},
});

export default SayHiComposerSheet;
