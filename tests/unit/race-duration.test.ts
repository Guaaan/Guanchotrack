import { describe, expect, it } from 'vitest';
import { createRace, stepRace } from '../../server/domain/race';
import { RACE_SPEEDS } from '../../shared/horses';

/** Ticks hasta la meta de las carreras con semilla 1..n (motor puro, sin temporizadores). */
function tickCounts(n: number): number[] {
  const counts: number[] = [];
  for (let seed = 1; seed <= n; seed++) {
    let s = createRace(seed);
    while (!s.finished) s = stepRace(s);
    counts.push(s.tick);
  }
  return counts;
}

describe('duración de carrera (SC-007)', () => {
  const ticks = tickCounts(5000);
  const seconds = (speedMs: number) => ticks.map((t) => (t * speedMs) / 1000).sort((a, b) => a - b);

  it('en Normal, ≥ 90 % entre 45 y 90 s y mediana entre 55 y 70 s', () => {
    const normal = seconds(RACE_SPEEDS.normal);
    const inRange = normal.filter((s) => s >= 45 && s <= 90).length / normal.length;
    expect(inRange).toBeGreaterThanOrEqual(0.9);
    const median = normal[Math.floor(normal.length / 2)];
    expect(median).toBeGreaterThanOrEqual(55);
    expect(median).toBeLessThanOrEqual(70);
  });

  it('Rápida y Turbo duran la mitad y la cuarta parte con los mismos ticks', () => {
    const normal = seconds(RACE_SPEEDS.normal);
    const fast = seconds(RACE_SPEEDS.fast);
    const turbo = seconds(RACE_SPEEDS.turbo);
    normal.forEach((s, i) => {
      expect(fast[i]).toBeCloseTo(s / 2, 9);
      expect(turbo[i]).toBeCloseTo(s / 4, 9);
    });
  });
});
