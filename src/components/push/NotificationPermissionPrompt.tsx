import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import colors from '@/theme/colors';
import {spacing, typography} from '@/theme/designTokens';

type Props = {
  visible: boolean;
  onAllow: () => void;
  onLater: () => void;
};

/**
 * Venlig præsentation før iOS system-popup (tilladelse til notifikationer).
 */
const NotificationPermissionPrompt: React.FC<Props> = ({
  visible,
  onAllow,
  onLater,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Slå notifikationer til</Text>
          <Text style={styles.body}>
            Få besked når venner skriver, inviterer dig til træning eller tjekker ind.
          </Text>
          <TouchableOpacity style={styles.primary} onPress={onAllow} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Tillad notifikationer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onLater} activeOpacity={0.7}>
            <Text style={styles.secondaryText}>Ikke nu</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  secondary: {
    marginTop: spacing.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

export default NotificationPermissionPrompt;
