import { TRACK_LENGTH } from '../../shared/horses';
import type { HorseNumber } from '../../shared/types';
import { mulberry32 } from './rng';

export { TRACK_LENGTH };
export const ADVANCE_PROBABILITY = 0.1;

export interface RaceState {
  rng: () => number;
  tick: number;
  /** Índice 0..5 = caballo 1..6. */
  positions: number[];
  finished: boolean;
  winner: HorseNumber | null;
  photoFinish: { horse: HorseNumber; value: number }[] | null;
}

export function createRace(seed: number): RaceState {
  return {
    rng: mulberry32(seed),
    tick: 0,
    positions: [0, 0, 0, 0, 0, 0],
    finished: false,
    winner: null,
    photoFinish: null,
  };
}

/** Avanza un tick. Los caballos consumen el RNG en orden fijo 1→6 para que la semilla reproduzca la carrera. */
export function stepRace(state: RaceState): RaceState {
  if (state.finished) return state;
  const { rng } = state;
  const positions = state.positions.map((p) => (rng() < ADVANCE_PROBABILITY ? Math.min(p + 1, TRACK_LENGTH) : p));
  const next: RaceState = { ...state, tick: state.tick + 1, positions };

  const atFinish = positions.flatMap((p, i) => (p === TRACK_LENGTH ? [(i + 1) as HorseNumber] : []));
  if (atFinish.length === 1) {
    next.finished = true;
    next.winner = atFinish[0];
  } else if (atFinish.length > 1) {
    const photoFinish = atFinish.map((horse) => ({ horse, value: rng() }));
    next.finished = true;
    next.photoFinish = photoFinish;
    next.winner = photoFinish.reduce((a, b) => (b.value > a.value ? b : a)).horse;
  }
  return next;
}

/** Primero a último: llegados por photo finish (o el ganador), luego casilla desc y número asc. */
export function raceOrder(state: RaceState): HorseNumber[] {
  const value = new Map<number, number>(state.photoFinish?.map((e) => [e.horse, e.value]) ?? []);
  if (state.winner !== null && !value.has(state.winner)) value.set(state.winner, 1);
  const horses = [1, 2, 3, 4, 5, 6] as HorseNumber[];
  return horses.sort((a, b) => {
    const va = value.get(a);
    const vb = value.get(b);
    if (va !== undefined || vb !== undefined) {
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      return vb - va;
    }
    return state.positions[b - 1] - state.positions[a - 1] || a - b;
  });
}
