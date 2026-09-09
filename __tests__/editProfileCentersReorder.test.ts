/**
 * Edit Profile centres — reorder / primary / save / remove / max contracts.
 */

import {
  MAX_PROFILE_CENTERS,
  clampCenterSelection,
  dragPreviewSlotShift,
  idsEqual,
  moveIdInOrder,
  moveSelectedByDir,
  previewPrimaryId,
} from '@/utils/reorderCenterIds';

describe('moveIdInOrder', () => {
  it('reorders from position 2 to 0', () => {
    expect(moveIdInOrder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('makes the moved-to-front center primary (index 0)', () => {
    const next = moveIdInOrder(['home', 'sec', 'third'], 2, 0);
    expect(next[0]).toBe('third');
    expect(previewPrimaryId(['home', 'sec', 'third'], 2, 0)).toBe('third');
  });

  it('moves Primary correctly when reordering the current primary later', () => {
    const next = moveIdInOrder(['p', 'q', 'r'], 0, 2);
    expect(next).toEqual(['q', 'r', 'p']);
    expect(next[0]).toBe('q');
    expect(previewPrimaryId(['p', 'q', 'r'], 0, 2)).toBe('q');
  });

  it('is a no-op for out-of-range or same index', () => {
    const ids = ['a', 'b'];
    expect(moveIdInOrder(ids, 0, 0)).toBe(ids);
    expect(moveIdInOrder(ids, -1, 1)).toBe(ids);
    expect(moveIdInOrder(ids, 0, 5)).toBe(ids);
  });
});

describe('moveSelectedByDir (a11y)', () => {
  it('moves earlier and later', () => {
    expect(moveSelectedByDir(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveSelectedByDir(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });
});

describe('idsEqual / save change detection', () => {
  it('detects order-only changes as dirty for Save gyms', () => {
    const baseline = ['a', 'b', 'c'];
    const reordered = moveIdInOrder(baseline, 2, 0);
    expect(idsEqual(baseline, reordered)).toBe(false);
    expect(idsEqual(baseline, ['a', 'b', 'c'])).toBe(true);
  });

  it('treats identical order as unchanged (dismiss without save keeps baseline)', () => {
    const baseline = ['x', 'y'];
    const draft = [...baseline];
    expect(idsEqual(baseline, draft)).toBe(true);
  });
});

describe('remove and max centres', () => {
  it('remove via filter keeps remaining order', () => {
    const ids = ['a', 'b', 'c'];
    const afterRemove = ids.filter(id => id !== 'b');
    expect(afterRemove).toEqual(['a', 'c']);
    expect(afterRemove[0]).toBe('a');
  });

  it('preserves maximum of 3 selected centres', () => {
    expect(MAX_PROFILE_CENTERS).toBe(3);
    expect(clampCenterSelection(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    const atMax = ['a', 'b', 'c'];
    const blockedAdd =
      atMax.length >= MAX_PROFILE_CENTERS ? atMax : [...atMax, 'd'];
    expect(blockedAdd).toEqual(['a', 'b', 'c']);
  });
});

describe('dragPreviewSlotShift', () => {
  it('shifts neighbours while dragging 2 → 0', () => {
    expect(dragPreviewSlotShift(0, 2, 0)).toBe(1);
    expect(dragPreviewSlotShift(1, 2, 0)).toBe(1);
    expect(dragPreviewSlotShift(2, 2, 0)).toBe(0);
  });
});

describe('EditProfileCentersSheet source contracts', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const sheet = fs.readFileSync(
    path.join(__dirname, '../src/components/profile/EditProfileCentersSheet.tsx'),
    'utf8',
  );
  const row = fs.readFileSync(
    path.join(
      __dirname,
      '../src/components/profile/SelectedCentersReorderRow.tsx',
    ),
    'utf8',
  );

  it('uses drag row instead of chevron reorder buttons', () => {
    expect(sheet).toMatch(/SelectedCentersReorderRow/);
    expect(sheet).not.toMatch(/chevron-back/);
    expect(sheet).not.toMatch(/chevron-forward/);
    expect(row).toMatch(/activateAfterLongPress/);
    expect(row).toMatch(/moveEarlier/);
    expect(row).toMatch(/moveLater/);
    expect(row).toMatch(/selected-center-remove-/);
  });

  it('keys chips by gym id', () => {
    expect(row).toMatch(/key=\{gym\.id\}/);
  });

  it('keeps useAnimatedStyle free of Platform.select (Android Reanimated crash)', () => {
    const animatedBlocks = [
      ...row.matchAll(/useAnimatedStyle\(\(\) => \{([\s\S]*?)\},?\s*\[[^\]]*\]\)/g),
    ].map(m => m[1] ?? '');
    expect(animatedBlocks.length).toBeGreaterThan(0);
    for (const block of animatedBlocks) {
      expect(block).not.toMatch(/Platform\.select/);
      expect(block).not.toMatch(/Platform\.OS/);
    }
    // Elevation/shadow must not be driven via Platform APIs inside the worklet.
    expect(row).not.toMatch(
      /useAnimatedStyle\([\s\S]*Platform\.select[\s\S]*\[[^\]]*\]\)/,
    );
  });

  it('mounts GestureHandlerRootView inside the Modal for Android gestures', () => {
    expect(sheet).toMatch(/<Modal[\s\S]*<GestureHandlerRootView/);
  });

  it('uses pickBrowseGyms for default Alle centre browse (not empty catalog slice)', () => {
    expect(sheet).toMatch(/pickBrowseGyms\(/);
    expect(sheet).toMatch(/searchGyms\(/);
  });
});
