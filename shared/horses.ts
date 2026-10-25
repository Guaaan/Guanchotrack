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
  number: HorseNumber;
  name: string;
  color: ColorToken;
  numberColor: ColorToken;
  coat: CoatName;
}

export const HORSES: readonly Horse[] = [
  { number: 1, name: 'Rojo', color: 'red', numberColor: 'white', coat: 'castano' },
  { number: 2, name: 'Naranjo', color: 'orange', numberColor: 'black', coat: 'pinto' },
  { number: 3, name: 'Amarillo', color: 'yellow', numberColor: 'black', coat: 'tordo' },
  { number: 4, name: 'Verde', color: 'green', numberColor: 'black', coat: 'palomino' },
  { number: 5, name: 'Azul', color: 'blue', numberColor: 'black', coat: 'pinto' },
  { number: 6, name: 'Rosado', color: 'pink', numberColor: 'black', coat: 'castano' },
];

export const TRACK_LENGTH = 40;

/** Milisegundos por tick de cada velocidad; solo cambian la duración, nunca el resultado. */
export const RACE_SPEEDS = { normal: 200, fast: 100, turbo: 50 } as const;
export type RaceSpeed = keyof typeof RACE_SPEEDS;
export const DEFAULT_SPEED: RaceSpeed = 'normal';
export const TICK_MS = RACE_SPEEDS.normal;

export const isRaceSpeed = (value: unknown): value is RaceSpeed =>
  typeof value === 'string' && Object.hasOwn(RACE_SPEEDS, value);
