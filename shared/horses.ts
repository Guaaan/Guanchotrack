import type { ColorToken } from '../src/palette';
import type { HorseNumber } from './types';

export type CoatName = 'castano' | 'pinto' | 'tordo' | 'palomino';

export interface Coat {
  body: ColorToken;
  mane: ColorToken;
  tail: ColorToken;
  /** Manchas irregulares sobre el cuerpo (solo pinto). */
  spots: ColorToken | null;
}

/** Pelajes puramente visuales, solo con tokens de la paleta (plan US4b D2). */
export const COATS: Readonly<Record<CoatName, Coat>> = {
  castano: { body: 'brown', mane: 'black', tail: 'black', spots: null },
  pinto: { body: 'brown', mane: 'black', tail: 'black', spots: 'white' },
  tordo: { body: 'light-grey', mane: 'dark-grey', tail: 'dark-grey', spots: null },
  palomino: { body: 'peach', mane: 'white', tail: 'white', spots: null },
};

export interface Horse {
  /** Carril 1–6: identidad interna (apuestas, resultados, motor). */
  number: HorseNumber;
  /** Número visible 1–99 que elige el dueño o el host (feature 003). */
  dorsal: number;
  name: string;
  color: ColorToken;
  numberColor: NumberColor;
  coat: CoatName;
  /** Nombre del dueño; `null` = establo. */
  owner: string | null;
}

export type NumberColor = 'white' | 'black';

/** Valores por defecto de los 6 caballos (feature 001), sin dueño; el host puede personalizarlos. */
export const DEFAULT_HORSES: readonly Horse[] = [
  { number: 1, dorsal: 1, name: 'Rojo', color: 'red', numberColor: 'white', coat: 'castano', owner: null },
  { number: 2, dorsal: 2, name: 'Naranjo', color: 'orange', numberColor: 'black', coat: 'pinto', owner: null },
  { number: 3, dorsal: 3, name: 'Amarillo', color: 'yellow', numberColor: 'black', coat: 'tordo', owner: null },
  { number: 4, dorsal: 4, name: 'Verde', color: 'green', numberColor: 'black', coat: 'palomino', owner: null },
  { number: 5, dorsal: 5, name: 'Azul', color: 'blue', numberColor: 'black', coat: 'pinto', owner: null },
  { number: 6, dorsal: 6, name: 'Rosado', color: 'pink', numberColor: 'black', coat: 'castano', owner: null },
];

/** Colores de manta: toda la paleta menos tierra (`brown`), pasto (`dark-green`) y fondo (`dark-blue`). */
export const BLANKET_COLORS: readonly ColorToken[] = [
  'black',
  'dark-purple',
  'dark-grey',
  'light-grey',
  'white',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'lavender',
  'pink',
  'peach',
];

const WHITE_NUMBER: readonly ColorToken[] = ['black', 'dark-purple', 'dark-grey', 'red', 'lavender'];

/** Color del número sobre la manta: tabla fija que conserva los valores de 001 (research R8). */
export function numberColorFor(color: ColorToken): NumberColor {
  return WHITE_NUMBER.includes(color) ? 'white' : 'black';
}

export const isCoatName = (value: unknown): value is CoatName =>
  typeof value === 'string' && Object.hasOwn(COATS, value);

/** Recorta los extremos y colapsa los espacios internos repetidos. */
export function normalizeHorseName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Letras (con tildes y ñ), números, espacios y guiones; 1–16 caracteres (003 FR-009). */
const HORSE_NAME_RE = /^[\p{L}\p{N} -]{1,16}$/u;

export interface HorseEdit {
  number: HorseNumber;
  dorsal: number;
  name: string;
  color: ColorToken;
  coat: CoatName;
}

const isLane = (n: unknown): n is HorseNumber => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 6;

/**
 * Nombre y número visible de un caballo, únicos frente a los otros 5 de `current` (003 FR-009,
 * FR-010). La usan el dueño (`horse:edit`) y el host (`validateHorseEdit`).
 */
export function validateHorseIdentity(
  current: readonly Horse[],
  lane: unknown,
  name: unknown,
  dorsal: unknown,
): { ok: true; name: string; dorsal: number } | { ok: false; error: string } {
  if (!isLane(lane)) return { ok: false, error: 'Caballo inválido' };
  const others = current.filter((h) => h.number !== lane);
  const clean = typeof name === 'string' ? normalizeHorseName(name) : '';
  if (!HORSE_NAME_RE.test(clean)) {
    return { ok: false, error: 'El nombre debe tener entre 1 y 16 caracteres: letras, números, espacios o guiones' };
  }
  // sin distinguir mayúsculas, pero sí tildes: "Relampago" ≠ "Relámpago"
  const lower = clean.toLocaleLowerCase('es');
  if (others.some((h) => h.name.toLocaleLowerCase('es') === lower)) {
    return { ok: false, error: 'Otro caballo ya se llama así' };
  }
  if (!Number.isInteger(dorsal) || (dorsal as number) < 1 || (dorsal as number) > 99) {
    return { ok: false, error: 'El número debe ser un entero de 1 a 99' };
  }
  if (others.some((h) => h.dorsal === dorsal)) return { ok: false, error: 'Otro caballo ya usa ese número' };
  return { ok: true, name: clean, dorsal: dorsal as number };
}

/**
 * Valida un caballo editado por el host contra los otros 5 de `current` (002 FR-012, FR-013;
 * 003 FR-012). Devuelve el caballo listo para guardar (nombre normalizado, color del número
 * calculado, dueño sin tocar) o el mensaje de error.
 */
export function validateHorseEdit(
  current: readonly Horse[],
  edit: unknown,
): { ok: true; horse: Horse } | { ok: false; error: string } {
  const { number, dorsal, name, color, coat } = (edit ?? {}) as Partial<Record<keyof HorseEdit, unknown>>;
  const identity = validateHorseIdentity(current, number, name, dorsal);
  if (!identity.ok) return identity;
  const lane = number as HorseNumber;
  const others = current.filter((h) => h.number !== lane);
  if (!BLANKET_COLORS.includes(color as ColorToken)) return { ok: false, error: 'Color no permitido' };
  if (others.some((h) => h.color === color)) return { ok: false, error: 'Otro caballo ya usa ese color' };
  if (!isCoatName(coat)) return { ok: false, error: 'Pelaje inválido' };
  const token = color as ColorToken;
  const owner = current.find((h) => h.number === lane)?.owner ?? null;
  return {
    ok: true,
    horse: {
      number: lane,
      dorsal: identity.dorsal,
      name: identity.name,
      color: token,
      numberColor: numberColorFor(token),
      coat,
      owner,
    },
  };
}

/** Precio de un caballo sin dueño (va al pozo acumulado) y de uno de otro jugador (va al dueño). */
export const HORSE_PRICE_STABLE = 30;
export const HORSE_PRICE_PLAYER = 50;
/** Parte del pozo que cobra el dueño del ganador, redondeada hacia abajo (constitución X). */
export const OWNER_SHARE_PERCENT = 10;

/** Precio que paga `buyerId` por un caballo cuyo dueño es `ownerId`; `null` si ya es suyo. */
export function purchasePrice(ownerId: number | null, buyerId: number): number | null {
  if (ownerId === null) return HORSE_PRICE_STABLE;
  return ownerId === buyerId ? null : HORSE_PRICE_PLAYER;
}

export const TRACK_LENGTH = 40;

/** Milisegundos por tick de cada velocidad; solo cambian la duración, nunca el resultado. */
export const RACE_SPEEDS = { normal: 200, fast: 100, turbo: 50 } as const;
export type RaceSpeed = keyof typeof RACE_SPEEDS;
export const DEFAULT_SPEED: RaceSpeed = 'normal';
export const TICK_MS = RACE_SPEEDS.normal;

export const isRaceSpeed = (value: unknown): value is RaceSpeed =>
  typeof value === 'string' && Object.hasOwn(RACE_SPEEDS, value);
