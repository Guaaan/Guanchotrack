import { describe, expect, it } from 'vitest';
import { createRace, raceOrder, stepRace, TRACK_LENGTH, type RaceState } from '../../server/domain/race';

function run(seed: number): { history: number[][]; final: RaceState } {
  let state = createRace(seed);
  const history: number[][] = [];
  while (!state.finished) {
    state = stepRace(state);
    history.push([...state.positions]);
    if (history.length > 100_000) throw new Error('la carrera no termina');
  }
  return { history, final: state };
}

describe('race', () => {
  it('misma semilla ⇒ misma secuencia, ganador y nº de ticks', () => {
    for (const seed of [1, 42, 123456789, 2 ** 32 - 1]) {
      const a = run(seed);
      const b = run(seed);
      expect(a.history).toEqual(b.history);
      expect(a.final.winner).toBe(b.final.winner);
      expect(a.final.tick).toBe(b.final.tick);
      expect(a.final.tick).toBe(a.history.length);
    }
  });

  it('semillas distintas dan carreras distintas', () => {
    expect(run(1).history).not.toEqual(run(2).history);
  });

  it('posiciones nunca superan 40 y avanzan como mucho 1 por tick', () => {
    for (let seed = 0; seed < 50; seed++) {
      let prev = [0, 0, 0, 0, 0, 0];
      for (const positions of run(seed).history) {
        positions.forEach((p, i) => {
          expect(p).toBeLessThanOrEqual(TRACK_LENGTH);
          expect(p - prev[i]).toBeGreaterThanOrEqual(0);
          expect(p - prev[i]).toBeLessThanOrEqual(1);
        });
        prev = positions;
      }
    }
  });

  it('la carrera siempre termina con un ganador que está en la meta', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { final } = run(seed);
      expect(final.finished).toBe(true);
      expect(final.winner).not.toBeNull();
      expect(final.positions[final.winner! - 1]).toBe(TRACK_LENGTH);
    }
  });

  it('stepRace no hace nada si la carrera terminó', () => {
    const { final } = run(7);
    const after = stepRace(final);
    expect(after.tick).toBe(final.tick);
    expect(after.positions).toEqual(final.positions);
  });

  it('photo finish: un solo ganador, el de mayor value, y lista todos los empatados', () => {
    let found: RaceState | null = null;
    for (let seed = 0; seed < 5000 && !found; seed++) {
      const { final } = run(seed);
      if (final.photoFinish) found = final;
    }
    expect(found).not.toBeNull();
    const pf = found!.photoFinish!;
    const atFinish = found!.positions.map((p, i) => (p === TRACK_LENGTH ? i + 1 : 0)).filter(Boolean);
    expect(pf.map((e) => e.horse)).toEqual(atFinish);
    expect(pf.length).toBeGreaterThanOrEqual(2);
    const best = pf.reduce((a, b) => (b.value > a.value ? b : a));
    expect(found!.winner).toBe(best.horse);
    expect(raceOrder(found!)[0]).toBe(found!.winner);
  });

  it('carreras sin photo finish tienen un único caballo en la meta', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { final } = run(seed);
      if (!final.photoFinish) {
        expect(final.positions.filter((p) => p === TRACK_LENGTH)).toHaveLength(1);
      }
    }
  });

  it('raceOrder: llegados por value desc, resto por casilla desc y número asc', () => {
    const state: RaceState = {
      rng: () => 0,
      tick: 10,
      positions: [40, 12, 40, 30, 12, 40],
      finished: true,
      winner: 3,
      photoFinish: [
        { horse: 1, value: 0.2 },
        { horse: 3, value: 0.9 },
        { horse: 6, value: 0.5 },
      ],
    };
    expect(raceOrder(state)).toEqual([3, 6, 1, 4, 2, 5]);
  });

  it('raceOrder en carrera en curso ordena por casilla y número', () => {
    const state: RaceState = {
      rng: () => 0,
      tick: 3,
      positions: [1, 2, 0, 2, 1, 0],
      finished: false,
      winner: null,
      photoFinish: null,
    };
    expect(raceOrder(state)).toEqual([2, 4, 1, 5, 3, 6]);
  });
});
