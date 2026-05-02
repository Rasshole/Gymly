/**
 * Create Group Screen
 * Opret ny gruppe – navn, beskrivelse, offentlig/privat, lokation, fokus
 */

import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import ScreenHeader from '@/components/ui/ScreenHeader';
import {Card} from '@/components/ui/Card';
import type {Group} from '@/types/group.types';
import {getActiveDanishGyms, DanishGym} from '@/data/danishGyms';

const GROUP_GYM_LIST = getActiveDanishGyms();
import {useAppStore} from '@/store/appStore';
import {useGymlyGroupsStore} from '@/store/gymlyGroupsStore';
import {createGymlyGroupRpc} from '@/services/supabase/gymlyGroupsService';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import SocialPrimaryButton from '@/components/social/SocialPrimaryButton';
import SocialSearchBar from '@/components/social/SocialSearchBar';

const FOCUS_OPTIONS = [
  'Konsistens',
  'Styrke',
  'Kondition',
  'Community',
  'Morgen træning',
  'Weekend',
];

const CreateGroupScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {user} = useAppStore();
  const refreshGymly = useGymlyGroupsStore(s => s.refresh);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedGym, setSelectedGym] = useState<DanishGym | null>(null);
  const [selectedCity, setSelectedCity] = useState('');
  const [gymModalVisible, setGymModalVisible] = useState(false);
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [gymSearchQuery, setGymSearchQuery] = useState('');
  const [focus, setFocus] = useState('');

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const g of GROUP_GYM_LIST) {
      if (g.city?.trim()) {
        set.add(g.city.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'da'));
  }, []);

  const filteredGyms = useMemo(() => {
    const q = gymSearchQuery.trim().toLowerCase();
    if (!q) {
      return GROUP_GYM_LIST;
    }
    return GROUP_GYM_LIST.filter(
      g =>
        g.name.toLowerCase().includes(q) ||
        (g.city && g.city.toLowerCase().includes(q)) ||
        (g.brand && g.brand.toLowerCase().includes(q)),
    );
  }, [gymSearchQuery]);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Mangler navn', 'Indtast venligst et gruppenavn');
      return;
    }
    if (!selectedGym) {
      Alert.alert('Vælg center', 'Vælg hvilket lokale center gruppen hører til');
      return;
    }
    if (!selectedCity.trim()) {
      Alert.alert('Vælg by', 'Tryk på Lokation og vælg hvilken by gruppen er i');
      return;
    }
    if (!user?.id) {
      Alert.alert('Log ind', 'Du skal være logget ind for at oprette en gruppe');
      return;
    }
    setCreating(true);
    try {
      const gid = await createGymlyGroupRpc({
        name: name.trim(),
        description: description.trim() || 'Ingen beskrivelse',
        isPrivate,
        centerId: selectedGym.id,
        city: selectedCity.trim(),
        focus: focus || '',
        imageUrl: null,
      });
      await refreshGymly(user.id);
      const row = useGymlyGroupsStore.getState().groups.find(g => g.id === gid);
      const mems = row?.members ?? [
        {id: user.id, name: user.displayName || 'Dig', avatar: undefined},
      ];
      const groupForDetail = {
        id: gid,
        name: name.trim(),
        description: description.trim() || 'Ingen beskrivelse',
        biography: description.trim() || 'Ingen beskrivelse',
        image: row?.image_url ?? undefined,
        isPrivate,
        adminId: user.id,
        members: mems.map(m => ({
          id: m.id,
          name: m.name,
          avatar: m.avatar,
          isOnline: false,
        })),
        totalWorkouts: 0,
        totalTimeTogether: 0,
        createdAt: new Date(),
        groupId: gid,
        lastMessagePreview: row?.last_message_preview,
      };
      navigation.replace('GroupDetail', {group: groupForDetail, groupId: gid});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('gymly_') ||
        msg.includes('function') ||
        msg.includes('does not exist')
      ) {
        Alert.alert(
          'Database',
          'Grupper er ikke aktiveret på serveren endnu. Kør den seneste Supabase-migration (gymly groups).',
        );
      } else {
        Alert.alert('Kunne ikke oprette', msg);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Opret gruppe"
        onBack={() => navigation.goBack()}
        showBack
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>Gruppenavn *</Text>
          <TextInput
            style={styles.input}
            placeholder="F.eks. Weekend Warriors"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Beskrivelse</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Beskriv gruppens formål og hvem den er for..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.label}>Offentlig gruppe</Text>
              <Text style={styles.hint}>
                {isPrivate
                  ? 'Kun medlemmer kan se gruppen'
                  : 'Alle kan søge og finde gruppen'}
              </Text>
            </View>
            <Switch
              value={!isPrivate}
              onValueChange={v => setIsPrivate(!v)}
              trackColor={{false: colors.surface, true: colors.primary}}
              thumbColor={colors.white}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Lokalt center *</Text>
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => setGymModalVisible(true)}
            activeOpacity={0.85}>
            <Icon name="business-outline" size={22} color={colors.primary} />
            <Text
              style={[styles.pickerText, !selectedGym && styles.pickerPlaceholder]}
              numberOfLines={2}>
              {selectedGym
                ? formatGymDisplayName(selectedGym)
                : 'Vælg fitnesscenter'}
            </Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Lokation (by) *</Text>
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => setCityModalVisible(true)}
            activeOpacity={0.85}>
            <Icon name="location-outline" size={22} color={colors.primary} />
            <Text
              style={[styles.pickerText, !selectedCity && styles.pickerPlaceholder]}
              numberOfLines={1}>
              {selectedCity || 'Vælg by'}
            </Text>
            <Icon name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Modal
          visible={gymModalVisible}
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          onRequestClose={() => setGymModalVisible(false)}>
          <View style={styles.modalRoot}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vælg center</Text>
              <TouchableOpacity
                onPress={() => setGymModalVisible(false)}
                style={styles.modalClose}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                <Icon name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
            <SocialSearchBar
              value={gymSearchQuery}
              onChangeText={setGymSearchQuery}
              placeholder="Søg efter center, by eller kæde..."
              autoCapitalize="none"
              style={styles.modalSearchOuter}
            />
            <FlatList
              data={filteredGyms}
              keyExtractor={item => String(item.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedGym(item);
                    if (item.city?.trim()) {
                      setSelectedCity(item.city.trim());
                    }
                    setGymModalVisible(false);
                    setGymSearchQuery('');
                  }}
                  activeOpacity={0.7}>
                  <Text style={styles.modalRowTitle}>{formatGymDisplayName(item)}</Text>
                  {item.city ? (
                    <Text style={styles.modalRowSub}>{item.city}</Text>
                  ) : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>Ingen centre fundet</Text>
              }
            />
          </View>
        </Modal>

        <Modal
          visible={cityModalVisible}
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          onRequestClose={() => setCityModalVisible(false)}>
          <View style={styles.modalRoot}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vælg by</Text>
              <TouchableOpacity
                onPress={() => setCityModalVisible(false)}
                style={styles.modalClose}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                <Icon name="close" size={28} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={cities}
              keyExtractor={item => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedCity(item);
                    setCityModalVisible(false);
                  }}
                  activeOpacity={0.7}>
                  <Text style={styles.modalRowTitle}>{item}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>Ingen byer i listen</Text>
              }
            />
          </View>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.label}>Fokus / mål</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {FOCUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, focus === opt && styles.chipActive]}
                onPress={() => setFocus(focus === opt ? '' : opt)}
                activeOpacity={0.8}>
                <Text
                  style={[
                    styles.chipText,
                    focus === opt && styles.chipTextActive,
                  ]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

      </ScrollView>

      <View
        style={[
          styles.footer,
          {paddingBottom: Math.max(insets.bottom, 12) + 8},
        ]}>
        <SocialPrimaryButton
          label="Opret gruppe"
          iconName="add-circle"
          onPress={handleCreate}
          disabled={!name.trim()}
          loading={creating}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {flex: 1},
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  section: {
    marginBottom: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
    color: colors.text,
  },
  textArea: {
    minHeight: 100,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerText: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  pickerPlaceholder: {
    color: colors.textMuted,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'ios' ? spacing.sm : spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
  },
  modalClose: {
    padding: spacing.xs,
  },
  modalSearchOuter: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  modalRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalRowTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  modalRowSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  modalEmpty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: '#F2F2F7',
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
  },
});

export default CreateGroupScreen;
