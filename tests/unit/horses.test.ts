import { describe, expect, it } from 'vitest';
import {
  BLANKET_COLORS,
  validateHorseIdentity,
  COATS,
  DEFAULT_HORSES,
  DEFAULT_SPEED,
  HORSE_PRICE_PLAYER,
  HORSE_PRICE_STABLE,
  normalizeHorseName,
  numberColorFor,
  purchasePrice,
  RACE_SPEEDS,
  TICK_MS,
  validateHorseEdit,
  type Horse,
} from '../../shared/horses';
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
    expect(DEFAULT_HORSES.map((h) => h.coat)).toEqual(['castano', 'pinto', 'tordo', 'palomino', 'pinto', 'castano']);
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

describe('caballos personalizables (feature 002)', () => {
  const edit = (over: Record<string, unknown>) => ({ number: 3, dorsal: 3, name: 'Amarillo', color: 'yellow', coat: 'tordo', ...over });
  const errorOf = (over: Record<string, unknown>, current: readonly Horse[] = DEFAULT_HORSES) => {
    const r = validateHorseEdit(current, edit(over));
    return r.ok ? null : r.error;
  };
  const NAME_ERROR = 'El nombre debe tener entre 1 y 16 caracteres: letras, números, espacios o guiones';

  it('los valores por defecto son los de 001', () => {
    expect(DEFAULT_HORSES.map((h) => [h.number, h.name, h.color, h.numberColor])).toEqual([
      [1, 'Rojo', 'red', 'white'],
      [2, 'Naranjo', 'orange', 'black'],
      [3, 'Amarillo', 'yellow', 'black'],
      [4, 'Verde', 'green', 'black'],
      [5, 'Azul', 'blue', 'black'],
      [6, 'Rosado', 'pink', 'black'],
    ]);
    for (const h of DEFAULT_HORSES) expect(numberColorFor(h.color)).toBe(h.numberColor);
  });

  it('13 colores de manta de la paleta, sin tierra, pasto ni fondo', () => {
    expect(BLANKET_COLORS).toHaveLength(13);
    for (const c of BLANKET_COLORS) expect(Object.keys(PALETTE)).toContain(c);
    for (const c of ['brown', 'dark-green', 'dark-blue']) expect(BLANKET_COLORS).not.toContain(c);
  });

  it('normaliza espacios del nombre', () => {
    expect(normalizeHorseName('  Luz   Mala ')).toBe('Luz Mala');
  });

  it('valida el nombre', () => {
    expect(errorOf({ name: 'Relámpago' })).toBeNull();
    expect(errorOf({ name: 'Ñandú 2' })).toBeNull();
    expect(errorOf({ name: 'Pura-Sangre' })).toBeNull();
    for (const bad of ['', '   ', 'x'.repeat(17), 'Rojo!', 42]) expect(errorOf({ name: bad })).toBe(NAME_ERROR);
    expect(errorOf({ number: 2, dorsal: 2, name: 'rojo', color: 'orange', coat: 'pinto' })).toBe('Otro caballo ya se llama así');
    expect(errorOf({ number: 1, dorsal: 1, name: 'Rojo', color: 'red', coat: 'castano' })).toBeNull();
    const withAccent = DEFAULT_HORSES.map((h) => (h.number === 1 ? { ...h, name: 'Relámpago' } : h));
    expect(errorOf({ name: 'Relampago' }, withAccent)).toBeNull();
    expect(errorOf({ name: 'RELÁMPAGO' }, withAccent)).toBe('Otro caballo ya se llama así');
  });

  it('valida color, pelaje y número', () => {
    expect(errorOf({ color: 'brown' })).toBe('Color no permitido');
    expect(errorOf({ color: '#FF0000' })).toBe('Color no permitido');
    expect(errorOf({ number: 2, dorsal: 2, name: 'Naranjo', color: 'red', coat: 'pinto' })).toBe('Otro caballo ya usa ese color');
    expect(errorOf({ color: 'yellow' })).toBeNull();
    expect(errorOf({ coat: 'cebra' })).toBe('Pelaje inválido');
    expect(errorOf({ number: 7 })).toBe('Caballo inválido');
    expect(validateHorseEdit(DEFAULT_HORSES, null)).toEqual({ ok: false, error: 'Caballo inválido' });
  });

  it('devuelve el caballo listo para guardar, con nombre normalizado y color de número', () => {
    expect(validateHorseEdit(DEFAULT_HORSES, edit({ name: ' Relámpago ', color: 'lavender', coat: 'pinto' }))).toEqual({
      ok: true,
      horse: { number: 3, dorsal: 3, name: 'Relámpago', color: 'lavender', numberColor: 'white', coat: 'pinto', owner: null },
    });
  });
});

describe('propiedad de caballos (feature 003)', () => {
  it('precio: 30 sin dueño, 50 de otro jugador, null si es propio', () => {
    expect(HORSE_PRICE_STABLE).toBe(30);
    expect(HORSE_PRICE_PLAYER).toBe(50);
    expect(purchasePrice(null, 1)).toBe(30);
    expect(purchasePrice(2, 1)).toBe(50);
    expect(purchasePrice(1, 1)).toBeNull();
  });

  it('los caballos por defecto no tienen dueño y su dorsal es el carril', () => {
    expect(DEFAULT_HORSES.map((h) => [h.number, h.dorsal, h.owner])).toEqual([
      [1, 1, null],
      [2, 2, null],
      [3, 3, null],
      [4, 4, null],
      [5, 5, null],
      [6, 6, null],
    ]);
  });
});

describe('nombre y número del caballo (feature 003)', () => {
  const ok = (lane: unknown, name: unknown, dorsal: unknown) => validateHorseIdentity(DEFAULT_HORSES, lane, name, dorsal);
  const errorOf = (lane: unknown, name: unknown, dorsal: unknown) => {
    const r = ok(lane, name, dorsal);
    return r.ok ? null : r.error;
  };
  const NAME_ERROR = 'El nombre debe tener entre 1 y 16 caracteres: letras, números, espacios o guiones';
  const DORSAL_ERROR = 'El número debe ser un entero de 1 a 99';

  it('nombre de 1 a 16 caracteres, normalizado', () => {
    expect(ok(3, '  Trueno   Azul ', 77)).toEqual({ ok: true, name: 'Trueno Azul', dorsal: 77 });
    expect(errorOf(3, 'x'.repeat(16), 7)).toBeNull();
    for (const bad of ['', '   ', 'x'.repeat(17), 'Rayo!', 5]) expect(errorOf(3, bad, 7)).toBe(NAME_ERROR);
  });

  it('número entero de 1 a 99', () => {
    expect(errorOf(3, 'Trueno', 7)).toBeNull();
    expect(errorOf(3, 'Trueno', 99)).toBeNull();
    for (const bad of [0, 100, 2.5, '7', null, -1]) expect(errorOf(3, 'Trueno', bad)).toBe(DORSAL_ERROR);
  });

  it('nombre y número únicos entre los 6 caballos; el mismo caballo puede conservar los suyos', () => {
    expect(errorOf(3, 'Trueno', 5)).toBe('Otro caballo ya usa ese número');
    expect(errorOf(3, 'rojo', 77)).toBe('Otro caballo ya se llama así');
    expect(errorOf(3, 'Amarillo', 3)).toBeNull();
  });

  it('carril inválido', () => {
    for (const lane of [0, 7, '3', null]) expect(errorOf(lane, 'Trueno', 77)).toBe('Caballo inválido');
  });
});
