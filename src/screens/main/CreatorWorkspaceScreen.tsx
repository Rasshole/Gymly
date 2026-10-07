import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {isCreatorTierQaSurfaceEnabled} from '@/config/creatorTierSurface';
import {
  CreatorWorkspace,
  fetchMyCreatorWorkspace,
  linkMyOfficialGroup,
  saveMyCreatorProfile,
  unlinkMyOfficialGroup,
} from '@/services/creator/creatorWorkspaceService';
import colors from '@/theme/colors';
import {radius, spacing, typography} from '@/theme/designTokens';

function typeLabel(value: string | null): string {
  if (value === 'coach') {
    return 'Coach';
  }
  if (value === 'gym') {
    return 'Gym';
  }
  return '—';
}

function tierLabel(value: string): string {
  if (value === 'free') {
    return 'Free';
  }
  if (value === 'base') {
    return 'Base';
  }
  if (value === 'pro') {
    return 'Pro';
  }
  return value;
}

function formatWhen(value: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('da-DK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CreatorWorkspaceScreen() {
  const [workspace, setWorkspace] = useState<CreatorWorkspace | null>(null);
  const [description, setDescription] = useState('');
  const [contactUrl, setContactUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isCreatorTierQaSurfaceEnabled()) {
      return;
    }
    setError(null);
    try {
      const next = await fetchMyCreatorWorkspace();
      setWorkspace(next);
      setDescription(next.description);
      setContactUrl(next.contactUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente profilen');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!isCreatorTierQaSurfaceEnabled()) {
    return null;
  }

  const apply = (next: CreatorWorkspace) => {
    setWorkspace(next);
    setDescription(next.description);
    setContactUrl(next.contactUrl);
  };

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      apply(await saveMyCreatorProfile(description, contactUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke gemme');
    } finally {
      setBusy(false);
    }
  };

  const onLink = async (groupId: string) => {
    setBusy(true);
    setError(null);
    try {
      apply(await linkMyOfficialGroup(groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke tilknytte gruppen');
    } finally {
      setBusy(false);
    }
  };

  const onUnlink = async (groupId: string) => {
    setBusy(true);
    setError(null);
    try {
      apply(await unlinkMyOfficialGroup(groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke fjerne tilknytningen');
    } finally {
      setBusy(false);
    }
  };

  const confirmUnlink = (groupId: string, name: string) => {
    Alert.alert(
      'Fjern officiel tilknytning',
      `${name} beholdes med medlemmer og indhold. Kun tilknytningen fjernes.`,
      [
        {text: 'Annuller', style: 'cancel'},
        {text: 'Fjern tilknytning', style: 'destructive', onPress: () => onUnlink(groupId)},
      ],
    );
  };

  const approved = workspace?.status === 'approved';
  const features = workspace?.features;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Lokal QA</Text>
      <Text style={styles.title}>Coach / gym-profil</Text>
      {!workspace ? <ActivityIndicator color={colors.primary} /> : null}
      {workspace ? (
        <View style={styles.card}>
          <Text style={styles.line}>
            {approved
              ? `${typeLabel(workspace.identityType)} · ${tierLabel(workspace.effectiveTier)} · ${workspace.tierReason}`
              : workspace.status === 'none'
                ? 'Ingen coach- eller gym-identitet'
                : `Ikke godkendt · ${workspace.status}`}
          </Text>
          {features?.configStatus === 'provisional_qa' ? (
            <Text style={styles.note}>
              {`Foreløbige QA-grænser · ${features.maxOfficialGroups} ${
                features.maxOfficialGroups === 1 ? 'officiel gruppe' : 'officielle grupper'
              }`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {approved && features?.profile ? (
        <View style={styles.card}>
          <Text style={styles.section}>Beskrivelse</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Kort beskrivelse"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            multiline
          />
          <Text style={styles.section}>Kontaktlink</Text>
          <TextInput
            value={contactUrl}
            onChangeText={setContactUrl}
            placeholder="https://"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.button} onPress={onSave} disabled={busy}>
            <Text style={styles.buttonText}>Gem profil</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {approved && features?.referralCode ? (
        <View style={styles.card}>
          <Text style={styles.section}>Din referral-kode</Text>
          <Text style={styles.value}>{workspace?.referralCode ?? '—'}</Text>
          {features.referralCounts ? (
            <>
              <Text style={styles.line}>Aktive referrals: {workspace?.activeReferrals ?? 0}</Text>
              {workspace?.nextTier && workspace.nextTierRequired != null ? (
                <Text style={styles.line}>
                  Fremdrift mod {tierLabel(workspace.nextTier)}: {workspace.activeReferrals ?? 0} af{' '}
                  {workspace.nextTierRequired}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.note}>Referral-tal er ikke slået til for denne tier.</Text>
          )}
        </View>
      ) : null}

      {approved ? (
        <View style={styles.card}>
          <Text style={styles.section}>Officielt fællesskab</Text>
          {workspace?.officialGroups.length ? (
            workspace.officialGroups.map(group => (
              <View key={group.groupId} style={styles.group}>
                <Text style={styles.groupName}>{group.name}</Text>
                {group.adminAccess && features?.groupSessions ? (
                  <Text style={styles.line}>
                    Fællestræninger: {group.togetherSessions ?? 0}
                    {group.recentSessions[0]
                      ? ` · seneste ${formatWhen(group.recentSessions[0].startedAt)}`
                      : ''}
                  </Text>
                ) : group.adminAccess ? (
                  <Text style={styles.note}>Fællestræninger vises fra Base. Gruppen er bevaret.</Text>
                ) : (
                  <Text style={styles.note}>
                    Ingen administrationsadgang. Tilknytningen ændrer ikke gruppens roller.
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => confirmUnlink(group.groupId, group.name)}
                  disabled={busy}>
                  <Text style={styles.unlink}>Fjern officiel tilknytning</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.note}>
              {features?.maxOfficialGroups
                ? 'Ingen officiel gruppe endnu.'
                : 'Officielt fællesskab er ikke inkluderet i Free.'}
            </Text>
          )}
          {features?.linkOfficialGroup
            ? workspace?.linkableGroups.map(group => (
                <TouchableOpacity
                  key={group.groupId}
                  style={styles.button}
                  onPress={() => onLink(group.groupId)}
                  disabled={busy}>
                  <Text style={styles.buttonText}>Gør {group.name} officiel</Text>
                </TouchableOpacity>
              ))
            : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  kicker: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  title: {
    ...typography.h4,
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface ?? '#F4F1FA',
    gap: spacing.sm,
  },
  section: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  line: {
    ...typography.body,
  },
  value: {
    ...typography.h4,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  group: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  groupName: {
    ...typography.body,
    fontWeight: '600',
  },
  unlink: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border ?? '#E6E1F0',
    borderRadius: radius.md,
    padding: spacing.sm,
    color: colors.text,
    backgroundColor: colors.background ?? '#fff',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    ...typography.caption,
    color: colors.error ?? '#B42318',
  },
});
