/**
 * @jest-environment node
 */

import {formatCompactGymAddress} from '@/utils/gymDisplay';

describe('formatCompactGymAddress', () => {
  it('avoids repeating postal code and city already in the street line', () => {
    expect(
      formatCompactGymAddress({
        street: 'Torvegade 17, 2500 Valby',
        postalCode: '2500',
        city: 'Valby',
      }),
    ).toBe('Torvegade 17, 2500 Valby');
  });

  it('joins structured fields when street is plain', () => {
    expect(
      formatCompactGymAddress({
        street: 'Torvegade 17',
        postalCode: '2500',
        city: 'Valby',
      }),
    ).toBe('Torvegade 17, 2500 Valby');
  });

  it('handles duplicated comma form from legacy joins', () => {
    expect(
      formatCompactGymAddress({
        street: 'Torvegade 17, 2500 Valby, 2500, Valby',
        postalCode: '2500',
        city: 'Valby',
      }),
    ).toBe('Torvegade 17, 2500 Valby');
  });
});
