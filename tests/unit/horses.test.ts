import { describe, expect, it } from 'vitest';
import { COATS, DEFAULT_SPEED, HORSES, RACE_SPEEDS, TICK_MS } from '../../shared/horses';
import { PALETTE } from '../../src/palette';

describe('velocidades', () => {
  it('Normal 200, Rápida 100, Turbo 50; por defecto Normal', () => {
    expect(RACE_SPEEDS).toEqual({ normal: 200, fast: 100, turbo: 50 });
    expect(DEFAULT_SPEED).toBe('normal');
    expect(TICK_MS).toBe(200);
  });
});

describe('pelajes', () => {
  it('fijos por número: 1 castaño, 2 pinto, 3 tordo, 4 palomino, 5 pinto, 6 castaño', () => {
    expect(HORSES.map((h) => h.coat)).toEqual(['castano', 'pinto', 'tordo', 'palomino', 'pinto', 'castano']);
  });

  it('usan exactamente los tokens del plan D2', () => {
    expect(COATS).toEqual({
      castano: { body: 'brown', mane: 'black', tail: 'black', spots: null },
      pinto: { body: 'brown', mane: 'black', tail: 'black', spots: 'white' },
      tordo: { body: 'light-grey', mane: 'dark-grey', tail: 'dark-grey', spots: null },
      palomino: { body: 'peach', mane: 'white', tail: 'white', spots: null },
    });
    for (const coat of Object.values(COATS)) {
      for (const token of Object.values(coat)) {
        if (token !== null) expect(Object.keys(PALETTE)).toContain(token);
      }
    }
  });

  it('los hex del spec corresponden a esos tokens', () => {
    expect(PALETTE.brown).toBe('#AB5236');
    expect(PALETTE.black).toBe('#000000');
    expect(PALETTE.white).toBe('#FFF1E8');
    expect(PALETTE['light-grey']).toBe('#C2C3C7');
    expect(PALETTE['dark-grey']).toBe('#5F574F');
    expect(PALETTE.peach).toBe('#FFCCAA');
  });
});
