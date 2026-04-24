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
import {useGroupStore} from '@/store/groupStore';
import {useAppStore} from '@/store/appStore';
import {formatGymDisplayName} from '@/utils/gymDisplay';
import colors from '@/theme/colors';
import {spacing, radius, typography} from '@/theme/designTokens';

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
  const {user} = useAppStore();
  const addGroup = useGroupStore(s => s.addGroup);

  const [name, setName] = useState('');
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

  const handleCreate = () => {
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

    const locationLabel = `${selectedCity.trim()} · ${formatGymDisplayName(selectedGym)}`;

    const newGroup: Group = {
      id: `g_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || 'Ingen beskrivelse',
      memberCount: 1,
      isJoined: true,
      isPrivate,
      adminId: user?.id || 'current',
      location: locationLabel,
      focus: focus || undefined,
      activityCount: 0,
      totalCheckIns: 0,
      members: [
        {
          id: user?.id || 'current',
          name: user?.displayName || 'Dig',
          isOnline: true,
        },
      ],
    };

    addGroup({
      id: newGroup.id,
      name: newGroup.name,
      description: newGroup.description,
      members: newGroup.members!.map(m => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
      })),
    });

    const groupForDetail = {
      id: newGroup.id,
      name: newGroup.name,
      description: newGroup.description,
      biography: newGroup.description,
      image: undefined,
      isPrivate: newGroup.isPrivate,
      adminId: newGroup.adminId,
      members: newGroup.members!.map(m => ({
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        isOnline: m.isOnline,
      })),
      totalWorkouts: 0,
      totalTimeTogether: 0,
      createdAt: new Date(),
    };

    Alert.alert('Gruppe oprettet', `"${newGroup.name}" er nu oprettet`, [
      {
        text: 'OK',
        onPress: () => navigation.navigate('GroupDetail', {group: groupForDetail}),
      },
    ]);
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
            <View style={styles.modalSearch}>
              <Icon name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Søg efter center, by eller kæde..."
                placeholderTextColor={colors.textMuted}
                value={gymSearchQuery}
                onChangeText={setGymSearchQuery}
                autoCapitalize="none"
              />
            </View>
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

        <TouchableOpacity
          style={[styles.cta, !name.trim() && styles.ctaDisabled]}
          onPress={handleCreate}
          disabled={!name.trim()}
          activeOpacity={0.8}>
          <Icon name="add-circle" size={24} color={colors.white} />
          <Text style={styles.ctaText}>Opret gruppe</Text>
        </TouchableOpacity>
      </ScrollView>
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
    paddingBottom: spacing.xxxl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.small,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    padding: spacing.md,
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
    borderRadius: radius.md,
    padding: spacing.md,
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
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalSearchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.xs,
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
    padding: spacing.lg,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
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
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    ...typography.h4,
    color: colors.white,
  },
});

export default CreateGroupScreen;
