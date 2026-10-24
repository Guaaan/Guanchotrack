import type { ColorToken } from '../src/palette';
import type { HorseNumber } from './types';

export interface Horse {
  number: HorseNumber;
  name: string;
  color: ColorToken;
  numberColor: ColorToken;
}

export const HORSES: readonly Horse[] = [
  { number: 1, name: 'Rojo', color: 'red', numberColor: 'white' },
  { number: 2, name: 'Naranjo', color: 'orange', numberColor: 'black' },
  { number: 3, name: 'Amarillo', color: 'yellow', numberColor: 'black' },
  { number: 4, name: 'Verde', color: 'green', numberColor: 'black' },
  { number: 5, name: 'Azul', color: 'blue', numberColor: 'black' },
  { number: 6, name: 'Rosado', color: 'pink', numberColor: 'black' },
];

export const TRACK_LENGTH = 40;
export const TICK_MS = 200;
