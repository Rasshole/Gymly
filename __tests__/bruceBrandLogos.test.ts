/**
 * Bruce / Energii brand logo resolution — official bundled assets only.
 */
import {getLogoSource, detectGymChain} from '@/services/gymLogoService';

describe('Bruce brand logos', () => {
  it('resolves Energii locations (incl. suffix names) to energii local logo', () => {
    const cases = [
      {brand: 'Energii', name: 'Energii'},
      {brand: 'Energii', name: 'Energii — Vesterport'},
      {brand: 'Energii', name: 'Energii — Amager Strand'},
      {brand: undefined, name: 'Energii — Guldbergsgade'},
    ];
    for (const c of cases) {
      const source = getLogoSource(c.brand, c.name);
      expect(source.chain).toBe('energii');
      expect(source.type).toBe('local');
      expect(source.localAsset).toBeTruthy();
    }
  });

  it('resolves InZhape to inzhape local logo', () => {
    const source = getLogoSource('InZhape', 'InZhape');
    expect(source.chain).toBe('inzhape');
    expect(source.type).toBe('local');
  });

  it('resolves Power House + Power Studio variants to shared power_house logo', () => {
    const cases = [
      {brand: 'Power House', name: 'Power House'},
      {brand: 'Power House Vejle', name: 'Power House Vejle'},
      {brand: 'Power Studio by Power House', name: 'Power Studio by Power House'},
      {
        brand: 'Power Studio by Power House Aarhus',
        name: 'Power Studio by Power House Aarhus',
      },
      {brand: undefined, name: 'Power House Aalborg'},
    ];
    for (const c of cases) {
      const source = getLogoSource(c.brand, c.name);
      expect(source.chain).toBe('power_house');
      expect(source.type).toBe('local');
      expect(detectGymChain(c.brand, c.name).displayName).toBe('Power House');
    }
  });

  it('does not override SATS / PureGym official logos', () => {
    expect(getLogoSource('SATS', 'SATS — Valby').chain).toBe('sats');
    expect(getLogoSource('SATS', 'SATS — Valby').type).toBe('local');
    expect(getLogoSource('PureGym', 'PureGym — Test').chain).toBe('puregym');
    expect(getLogoSource('PureGym', 'PureGym — Test').type).toBe('local');
  });

  it('does not map Power Yoga / PowerHour to Power House', () => {
    expect(getLogoSource('Power Yoga Copenhagen', 'Power Yoga Copenhagen').chain).not.toBe(
      'power_house',
    );
    expect(getLogoSource('PowerHour by Wellcome', 'PowerHour by Wellcome').chain).not.toBe(
      'power_house',
    );
  });

  it('keeps unknown boutique Bruce studios on fallback (no invented logo)', () => {
    const source = getLogoSource('108 Yoga', '108 Yoga');
    expect(source.type).toBe('none');
    expect(source.chain).toBe('unknown');
  });
});
