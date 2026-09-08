/**
 * Profile Feed/Data segmented control — layout contracts (no absolute icon overlap).
 */

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('@/utils/haptics', () => ({triggerHaptic: jest.fn()}));

import fs from 'fs';
import path from 'path';
import {segmentedTabWidth} from '@/components/ui/SegmentedControl';

const CONTROL_SRC = fs.readFileSync(
  path.join(__dirname, '../src/components/ui/SegmentedControl.tsx'),
  'utf8',
);
const PROFILE_SRC = fs.readFileSync(
  path.join(__dirname, '../src/screens/main/ProfileScreen.tsx'),
  'utf8',
);

describe('segmentedTabWidth', () => {
  it('splits track into equal widths for two tabs', () => {
    expect(segmentedTabWidth(320, 2)).toBe((320 - 6) / 2);
    expect(segmentedTabWidth(390, 2)).toBe(segmentedTabWidth(390, 2));
  });

  it('keeps equal halves on narrow iPhone widths', () => {
    for (const w of [320, 350, 375, 390, 428]) {
      const half = segmentedTabWidth(w, 2);
      expect(half).toBeCloseTo(w / 2 - 3, 5);
      expect(half * 2).toBeCloseTo(w - 6, 5);
    }
  });

  it('returns 0 for invalid input', () => {
    expect(segmentedTabWidth(0, 2)).toBe(0);
    expect(segmentedTabWidth(100, 0)).toBe(0);
  });
});

describe('SegmentedControl tab layout contracts', () => {
  it('uses equal-width tab slots via flex:1 (not GymlyPressable as row child)', () => {
    expect(CONTROL_SRC).toMatch(/tabSlot:\s*\{[^}]*flex:\s*1/s);
    expect(CONTROL_SRC).toMatch(/minWidth:\s*0/);
    // Tabs variant should press via Pressable inside tabSlot, not GymlyPressable row children
    const tabsReturn = CONTROL_SRC.slice(CONTROL_SRC.indexOf('accessibilityRole="tablist"'));
    expect(tabsReturn).toMatch(/style=\{styles\.tabSlot\}/);
    expect(tabsReturn).toMatch(/<Pressable/);
    expect(tabsReturn).not.toMatch(/<GymlyPressable/);
  });

  it('groups each tab icon and label inside one content wrapper', () => {
    expect(CONTROL_SRC).toMatch(/styles\.tabContent/);
    expect(CONTROL_SRC).toMatch(/tabContent:\s*\{[^}]*flexDirection:\s*'row'/s);
    expect(CONTROL_SRC).toMatch(/tabContent:\s*\{[^}]*gap:/s);
    expect(CONTROL_SRC).toMatch(/tabIcon:\s*\{[^}]*flexShrink:\s*0/s);
  });

  it('does not absolutely position tab icons', () => {
    // Slider may be absolute; icons must not be.
    const iconBlocks = CONTROL_SRC.match(/<Icon[\s\S]*?\/>/g) ?? [];
    expect(iconBlocks.length).toBeGreaterThan(0);
    for (const block of iconBlocks) {
      expect(block).not.toMatch(/position:\s*['"]absolute['"]/);
      expect(block).not.toMatch(/absoluteFill/);
    }
    expect(CONTROL_SRC).toMatch(/tabIcon:\s*\{[^}]*flexShrink:\s*0[^}]*\}/s);
    expect(CONTROL_SRC).not.toMatch(/tabIcon:\s*\{[^}]*position:\s*['"]absolute['"]/s);
  });

  it('exposes two independent tab press targets via testIDs', () => {
    expect(CONTROL_SRC).toMatch(/testID=\{`segment-tab-\$\{seg\.key\}`\}/);
    expect(CONTROL_SRC).toMatch(/testID=\{`segment-tab-content-\$\{seg\.key\}`\}/);
    expect(CONTROL_SRC).toMatch(/accessibilityRole="tab"/);
    expect(CONTROL_SRC).toMatch(/accessibilityState=\{\{selected: active\}\}/);
  });
});

describe('ProfileScreen Feed/Data segmented usage', () => {
  it('wires exactly two Feed and Data segments with icons and labels', () => {
    expect(PROFILE_SRC).toMatch(/SegmentedControl<ProfileTab>/);
    expect(PROFILE_SRC).toMatch(/key:\s*'feed'/);
    expect(PROFILE_SRC).toMatch(/key:\s*'data'/);
    expect(PROFILE_SRC).toMatch(/t\('profile\.feedTab'\)/);
    expect(PROFILE_SRC).toMatch(/t\('profile\.dataTab'\)/);
    expect(PROFILE_SRC).toMatch(/newspaper-outline/);
    expect(PROFILE_SRC).toMatch(/stats-chart-outline/);
  });

  it('keeps tab switching on the same SegmentedControl onChange', () => {
    expect(PROFILE_SRC).toMatch(/onChange=\{setTab\}/);
    expect(PROFILE_SRC).toMatch(/tab === 'feed'/);
    expect(PROFILE_SRC).toMatch(/useState<ProfileTab>\('feed'\)/);
  });
});
