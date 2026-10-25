import { describe, expect, it } from 'vitest';
import { advancesInWindow, damp, gallopRate, type DampState } from '../../src/host/motion';

describe('advancesInWindow', () => {
  // historial: tick → posiciones de los 6 caballos
  const history = new Map<number, number[]>();
  for (let t = 0; t <= 20; t++) history.set(t, [t, Math.floor(t / 5), 0, t >= 15 ? t - 14 : 0, 3, 3]);

  it('cuenta avances en los últimos 10 ticks', () => {
    expect(advancesInWindow(history, 20, 0)).toBe(10); // racha: avanzó en cada tick
    expect(advancesInWindow(history, 20, 1)).toBe(2); // avanzó en los ticks 15 y 20
    expect(advancesInWindow(history, 20, 2)).toBe(0); // estancado
    expect(advancesInWindow(history, 20, 3)).toBe(6);
  });

  it('usa los ticks disponibles si hay menos de 10', () => {
    expect(advancesInWindow(history, 4, 0)).toBe(4);
    const partial = new Map([[30, [5, 5, 5, 5, 5, 5]], [33, [7, 5, 5, 5, 5, 5]]]);
    expect(advancesInWindow(partial, 33, 0)).toBe(2);
    expect(advancesInWindow(new Map(), 0, 0)).toBe(0);
  });
});

describe('gallopRate', () => {
  it('> 0 estancado, crece con los avances y tiene tope', () => {
    const rates = [0, 1, 2, 3, 4, 6, 10].map((a) => gallopRate(a, 200));
    expect(rates[0]).toBeGreaterThan(0);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
    expect(rates[3]).toBeGreaterThan(rates[0]);
    expect(gallopRate(10, 200)).toBe(gallopRate(50, 200));
  });

  it('escala ×2 en Rápida y ×4 en Turbo', () => {
    for (const a of [0, 2, 5]) {
      expect(gallopRate(a, 100)).toBeCloseTo(gallopRate(a, 200) * 2);
      expect(gallopRate(a, 50)).toBeCloseTo(gallopRate(a, 200) * 4);
    }
  });
});

describe('damp', () => {
  const run = (target: number, omega: number, steps: number, dt = 1 / 60, start: DampState = { x: 0, v: 0 }) => {
    const xs: number[] = [];
    let s = start;
    for (let i = 0; i < steps; i++) {
      s = damp(s, target, dt, omega);
      xs.push(s.x);
    }
    return { xs, s };
  };

  it('converge a la casilla destino', () => {
    const { s } = run(10, 8, 600);
    expect(s.x).toBeCloseTo(10, 3);
    expect(Math.abs(s.v)).toBeLessThan(1e-3);
  });

  it('no sobrepasa el destino partiendo del reposo', () => {
    for (const omega of [2, 8, 20]) {
      const { xs } = run(2, omega, 600);
      for (const x of xs) expect(x).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it('sin saltos: el cambio por frame está acotado y la velocidad es continua', () => {
    const dt = 1 / 60;
    const { xs } = run(2, 10, 120, dt);
    let prev = 0;
    let prevStep = 0;
    for (const x of xs) {
      const step = x - prev;
      expect(Math.abs(step)).toBeLessThan(0.25); // menos de 1/8 de casilla por frame
      expect(Math.abs(step - prevStep)).toBeLessThan(0.05);
      prev = x;
      prevStep = step;
    }
  });

  it('es estable con dt grande', () => {
    const { s } = run(4, 30, 20, 0.1);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(s.x).toBeLessThanOrEqual(4 + 1e-9);
  });
});
