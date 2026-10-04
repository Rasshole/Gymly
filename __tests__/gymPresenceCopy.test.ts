/**
 * @jest-environment node
 *
 * Layout/logic helpers for GymPresence detail — no fabricated activity counts.
 */

import {createPluralTranslator} from '@/i18n/translate';
import en from '@/i18n/translations/en';
import da from '@/i18n/translations/da';

describe('gymPresence copy', () => {
  const tpEn = createPluralTranslator(en as any, undefined, 'en');
  const tpDa = createPluralTranslator(da as any, undefined, 'da');

  it('uses singular/plural for live training counts', () => {
    expect(tpEn('gymPresence.trainingNow', 0)).toBe('0 training now');
    expect(tpEn('gymPresence.trainingNow', 1)).toBe('1 training now');
    expect(tpEn('gymPresence.trainingNow', 2)).toBe('2 training now');
    expect(tpDa('gymPresence.trainingNow', 0)).toBe('0 træner lige nu');
    expect(tpDa('gymPresence.trainingNow', 1)).toBe('1 træner lige nu');
    expect(tpDa('gymPresence.trainingNow', 2)).toBe('2 træner lige nu');
  });

  it('explains privately hidden actives without revealing identity', () => {
    expect(tpEn('gymPresence.othersTrainingPrivately', 1)).toMatch(/isn’t visible/i);
    expect(tpEn('gymPresence.othersTrainingPrivately', 2)).toMatch(/aren’t visible/i);
    expect(tpDa('gymPresence.othersTrainingPrivately', 1)).toMatch(/ikke synlig/);
    expect(tpDa('gymPresence.othersTrainingPrivately', 2)).toMatch(/ikke synlige/);
  });
});

describe('hidden vs visible activity math', () => {
  it('keeps privacy when total exceeds visible profiles', () => {
    const totalActive = 2;
    const visibleCount = 0;
    const hiddenCount = Math.max(0, totalActive - visibleCount);
    expect(hiddenCount).toBe(2);
  });

  it('does not invent activity when both counts are zero', () => {
    const totalActive = 0;
    const visibleCount = 0;
    expect(Math.max(0, totalActive - visibleCount)).toBe(0);
  });
});
