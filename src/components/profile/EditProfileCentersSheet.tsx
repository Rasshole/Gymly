/**
 * Bottom sheet: rediger op til 3 foretrukne centre (rækkefølge = primær først).
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getActiveDanishGyms, type DanishGym} from '@/data/danishGyms';
import GymLogoView from '@/components/ui/GymLogoView';
import {formatGymDisplayName, findGymById} from '@/utils/gymDisplay';
import colors from '@/theme/colors';
import {radius, spacing, typography, shadows} from '@/theme/designTokens';

const SCREEN_H = Dimensions.get('window').height;
const ALL_GYMS = getActiveDanishGyms();
const MAX_CENTERS = 3;

const springOpen = {
  stiffness: 420,
  damping: 36,
  mass: 0.85,
  useNativeDriver: true,
} as const;

const springClose = {
  stiffness: 520,
  damping: 40,
  mass: 0.9,
  useNativeDriver: true,
} as const;

function gymHaystack(gym: DanishGym): string {
  return `${gym.name} ${gym.brand ?? ''} ${gym.city ?? ''} ${gym.address ?? ''} ${gym.postalCode ?? ''}`
    .toLowerCase()
    .replace(/,/g, ' ');
}

function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((id, i) => id === b[i]);
}

export type EditProfileCentersSheetProps = {
  visible: boolean;
  initialCenterIds: string[];
  onClose: () => void;
  onSave: (orderedIds: string[]) => Promise<void>;
  onLimitReached?: () => void;
};

export const EditProfileCentersSheet: React.FC<EditProfileCentersSheetProps> = ({
  visible,
  initialCenterIds,
  onClose,
  onSave,
  onLimitReached,
}) => {
  const insets = useSafeAreaInsets();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;
  const baselineIdsRef = useRef<string[]>([]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSaving(false);
      return;
    }
    const ids = initialCenterIds.slice(0, MAX_CENTERS);
    baselineIdsRef.current = [...ids];
    setSelectedIds(ids);
    setQuery('');
    // Kun ved åbning (visible true) — ikke når parent opdaterer ids under gem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdrop, {toValue: 1, duration: 220, useNativeDriver: true}),
        Animated.spring(sheetY, {toValue: 0, ...springOpen}),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdrop, {toValue: 0, duration: 180, useNativeDriver: true}),
        Animated.spring(sheetY, {toValue: SCREEN_H, ...springClose}),
      ]).start();
    }
  }, [visible, backdrop, sheetY]);

  const hasChanges = useMemo(
    () => !idsEqual(selectedIds, baselineIdsRef.current),
    [selectedIds],
  );

  const selectedGyms = useMemo(
    () =>
      selectedIds
        .map(id => findGymById(id) ?? ALL_GYMS.find(g => g.id === id))
        .filter((g): g is DanishGym => g != null),
    [selectedIds],
  );

  const filteredGyms = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    let list = ALL_GYMS;
    if (tokens.length > 0) {
      list = ALL_GYMS.filter(g => tokens.every(t => gymHaystack(g).includes(t)));
    }
    const selectedSet = new Set(selectedIds);
    return [...list].sort((a, b) => {
      const aSel = selectedSet.has(a.id) ? 0 : 1;
      const bSel = selectedSet.has(b.id) ? 0 : 1;
      if (aSel !== bSel) {
        return aSel - bSel;
      }
      return formatGymDisplayName(a).localeCompare(formatGymDisplayName(b), 'da');
    });
  }, [query, selectedIds]);

  const toggleGym = useCallback(
    (gymId: string) => {
      setSelectedIds(prev => {
        if (prev.includes(gymId)) {
          return prev.filter(id => id !== gymId);
        }
        if (prev.length >= MAX_CENTERS) {
          onLimitReached?.();
          return prev;
        }
        return [...prev, gymId];
      });
    },
    [onLimitReached],
  );

  const moveSelected = useCallback((index: number, dir: -1 | 1) => {
    setSelectedIds(prev => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) {
        return prev;
      }
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (saving || !hasChanges) {
      return;
    }
    setSaving(true);
    try {
      await onSave(selectedIds);
      baselineIdsRef.current = [...selectedIds];
      onClose();
    } catch {
      /* Fejl håndteres i parent (toast); sheet forbliver åben */
    } finally {
      setSaving(false);
    }
  }, [saving, hasChanges, onSave, selectedIds, onClose]);

  const sheetHeight = Math.min(SCREEN_H * 0.9, SCREEN_H - insets.top - 16);
  const saveDisabled = saving || !hasChanges;

  const renderSelectedSection = () => {
    if (selectedGyms.length === 0) {
      return (
        <View style={styles.emptyPickCard}>
          <Icon name="location-outline" size={18} color={colors.primary} />
          <Text style={styles.emptyPickText}>Vælg op til 3 centre</Text>
        </View>
      );
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}>
        {selectedGyms.map((gym, index) => (
          <View key={gym.id} style={styles.chip}>
            {index === 0 ? (
              <View style={styles.chipPrimaryBadge}>
                <Text style={styles.chipPrimaryText}>Primært</Text>
              </View>
            ) : null}
            <View style={styles.chipTopRow}>
              <View style={styles.chipLogoWrap}>
                <GymLogoView gymName={gym.name} brand={gym.brand} size={32} surface="lavender" />
              </View>
              <TouchableOpacity
                onPress={() => toggleGym(gym.id)}
                hitSlop={8}
                style={styles.chipRemove}>
                <Icon name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.chipName} numberOfLines={2}>
              {formatGymDisplayName(gym)}
            </Text>
            {gym.city ? (
              <Text style={styles.chipCity} numberOfLines={1}>
                {gym.city}
              </Text>
            ) : null}
            {selectedGyms.length > 1 ? (
              <View style={styles.chipReorder}>
                <TouchableOpacity
                  onPress={() => moveSelected(index, -1)}
                  disabled={index === 0}
                  hitSlop={6}
                  style={index === 0 && styles.chipReorderDisabled}>
                  <Icon
                    name="chevron-back"
                    size={16}
                    color={index === 0 ? colors.textMuted : colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveSelected(index, 1)}
                  disabled={index === selectedGyms.length - 1}
                  hitSlop={6}
                  style={index === selectedGyms.length - 1 && styles.chipReorderDisabled}>
                  <Icon
                    name="chevron-forward"
                    size={16}
                    color={
                      index === selectedGyms.length - 1 ? colors.textMuted : colors.primary
                    }
                  />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderGymRow = ({item}: {item: DanishGym}) => {
    const selected = selectedIds.includes(item.id);
    const isPrimary = selected && selectedIds[0] === item.id;
    return (
      <TouchableOpacity
        style={[styles.listRow, selected && styles.listRowSelected]}
        activeOpacity={0.72}
        onPress={() => toggleGym(item.id)}>
        <View style={styles.listLogoWrap}>
          <GymLogoView gymName={item.name} brand={item.brand} size={40} surface="lavender" />
        </View>
        <View style={styles.listBody}>
          <View style={styles.listTitleRow}>
            <Text style={styles.listName} numberOfLines={2}>
              {formatGymDisplayName(item)}
            </Text>
            {isPrimary ? (
              <View style={styles.listPrimaryBadge}>
                <Text style={styles.listPrimaryText}>Primært</Text>
              </View>
            ) : null}
          </View>
          {item.city ? (
            <Text style={styles.listCity} numberOfLines={1}>
              {item.city}
            </Text>
          ) : null}
        </View>
        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
          {selected ? (
            <Icon name="checkmark" size={16} color={colors.white} />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, {opacity: backdrop}]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
              transform: [{translateY: sheetY}],
            },
          ]}>
          <View style={styles.handle} />

          <View style={styles.headerBlock}>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>Rediger dine centre</Text>
              <Text style={styles.subtitle}>Vælg de centre du træner mest i</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {selectedIds.length}/{MAX_CENTERS} valgt
              </Text>
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Icon name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Søg efter center…"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>

          <Text style={styles.sectionLabel}>Dine valg</Text>
          <View style={styles.selectedSection}>{renderSelectedSection()}</View>

          <Text style={[styles.sectionLabel, styles.sectionLabelList]}>Alle centre</Text>
          <FlatList
            data={filteredGyms}
            keyExtractor={g => g.id}
            renderItem={renderGymRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.listGap} />}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
            onPress={() => void handleSave()}
            disabled={saveDisabled}
            activeOpacity={0.88}>
            {saving ? (
              <View style={styles.saveBtnInner}>
                <ActivityIndicator color={colors.white} size="small" />
                <Text style={styles.saveBtnText}>Gemmer…</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>Gem centre</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const SHEET_RADIUS = radius.xxl;

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
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: {width: 0, height: -6},
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: {elevation: 16},
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: typography.h4.fontSize,
    fontWeight: '700',
    lineHeight: typography.h4.lineHeight,
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  countPill: {
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '28',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginTop: 2,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F4F4F5',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  sectionLabelList: {
    marginTop: spacing.xs,
  },
  selectedSection: {
    marginBottom: spacing.lg,
    minHeight: 56,
  },
  emptyPickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '08',
    borderWidth: 1,
    borderColor: colors.primary + '22',
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  emptyPickText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipsScroll: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  chip: {
    width: 148,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '35',
    padding: spacing.sm,
    ...shadows.sm,
  },
  chipPrimaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginBottom: 6,
  },
  chipPrimaryText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  chipTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  chipLogoWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipRemove: {
    marginTop: -2,
    marginRight: -2,
  },
  chipName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 17,
  },
  chipCity: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  chipReorder: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  chipReorderDisabled: {
    opacity: 0.35,
  },
  list: {
    flex: 1,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.sm,
  },
  listGap: {
    height: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  listRowSelected: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '07',
  },
  listLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  listBody: {
    flex: 1,
    minWidth: 0,
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  listName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  listPrimaryBadge: {
    backgroundColor: colors.primary + '14',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  listPrimaryText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  listCity: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  checkCircleSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.xs,
    ...shadows.sm,
  },
  saveBtnDisabled: {
    backgroundColor: colors.primary + '55',
    ...shadows.sm,
  },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  saveBtnText: {
    ...typography.bodyBold,
    color: colors.white,
    fontSize: 16,
  },
});
