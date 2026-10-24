import { describe, expect, it } from 'vitest';
import { multipliers, settle, type BetInput } from '../../server/domain/payouts';
import { mulberry32 } from '../../server/domain/rng';
import type { HorseNumber } from '../../shared/types';

const bet = (userId: number, horse: HorseNumber, amount: number, confirmedAt = userId): BetInput => ({
  userId,
  horse,
  amount,
  confirmedAt,
});

describe('multipliers', () => {
  it('pot / total por caballo y null sin apuestas', () => {
    const m = multipliers([bet(1, 1, 30), bet(2, 2, 10), bet(3, 2, 20)], 0);
    expect(m).toEqual({ 1: 2, 2: 2, 3: null, 4: null, 5: null, 6: null });
  });

  it('incluye el acumulado', () => {
    const m = multipliers([bet(1, 1, 20), bet(2, 2, 20)], 60);
    expect(m[1]).toBe(5);
    expect(m[2]).toBe(5);
  });
});

describe('settle', () => {
  it('ejemplo del spec: A 30→1, B 10→2, C 20→2, gana 2', () => {
    const r = settle([bet(1, 1, 30), bet(2, 2, 10), bet(3, 2, 20)], 0, 2);
    expect(r.payouts).toEqual(
      expect.arrayContaining([
        { userId: 2, amount: 20 },
        { userId: 3, amount: 40 },
      ]),
    );
    expect(r.payouts).toHaveLength(2);
    expect(r.carryOut).toBe(0);
  });

  it('todos al mismo caballo sin acumulado ⇒ cada uno recupera lo suyo', () => {
    const r = settle([bet(1, 4, 10), bet(2, 4, 25), bet(3, 4, 7)], 0, 4);
    expect(r.payouts).toEqual(
      expect.arrayContaining([
        { userId: 1, amount: 10 },
        { userId: 2, amount: 25 },
        { userId: 3, amount: 7 },
      ]),
    );
  });

  it('acumulado 60 + A 20→1, B 20→2, gana 1 ⇒ A 100', () => {
    const r = settle([bet(1, 1, 20), bet(2, 2, 20)], 60, 1);
    expect(r.payouts).toEqual([{ userId: 1, amount: 100 }]);
    expect(r.carryOut).toBe(0);
  });

  it('pozo 100 con tres ganadores de 10 ⇒ 34, 33, 33 (sobrante al más temprano)', () => {
    const r = settle([bet(7, 3, 10, 2), bet(8, 3, 10, 1), bet(9, 3, 10, 3)], 70, 3);
    const byUser = Object.fromEntries(r.payouts.map((p) => [p.userId, p.amount]));
    expect(byUser).toEqual({ 8: 34, 7: 33, 9: 33 });
  });

  it('a igual confirmedAt desempata por userId asc', () => {
    const r = settle([bet(5, 3, 10, 1), bet(4, 3, 10, 1), bet(6, 3, 10, 1)], 70, 3);
    const byUser = Object.fromEntries(r.payouts.map((p) => [p.userId, p.amount]));
    expect(byUser).toEqual({ 4: 34, 5: 33, 6: 33 });
  });

  it('mayor resto gana el sobrante aunque haya confirmado después', () => {
    // pot 10, T 3: user 1 ⇒ 3,33 (resto 1); user 2 ⇒ 6,66 (resto 2)
    const r = settle([bet(1, 1, 1, 1), bet(2, 1, 2, 99), bet(3, 2, 7, 5)], 0, 1);
    const byUser = Object.fromEntries(r.payouts.map((p) => [p.userId, p.amount]));
    expect(byUser).toEqual({ 1: 3, 2: 7 });
  });

  it('sin apuestas al ganador ⇒ payouts [] y carryOut = pot', () => {
    const r = settle([bet(1, 1, 30), bet(2, 2, 10)], 15, 6);
    expect(r).toEqual({ payouts: [], carryOut: 55 });
  });

  it('sin apuestas con acumulado ⇒ carryOut = carry', () => {
    expect(settle([], 40, 2)).toEqual({ payouts: [], carryOut: 40 });
    expect(settle([], 0, 2)).toEqual({ payouts: [], carryOut: 0 });
  });

  it('propiedad: conservación exacta y pagos enteros', () => {
    const rng = mulberry32(2024);
    const int = (n: number) => Math.floor(rng() * n);
    for (let i = 0; i < 2000; i++) {
      const bets: BetInput[] = [];
      const n = int(15);
      for (let u = 1; u <= n; u++) {
        bets.push(bet(u, (int(6) + 1) as HorseNumber, int(500) + 1, int(10)));
      }
      const carry = int(3) === 0 ? int(1000) : 0;
      const winner = (int(6) + 1) as HorseNumber;
      const r = settle(bets, carry, winner);
      const paid = r.payouts.reduce((s, p) => s + p.amount, 0);
      expect(paid + r.carryOut).toBe(bets.reduce((s, b) => s + b.amount, 0) + carry);
      for (const p of r.payouts) {
        expect(Number.isInteger(p.amount)).toBe(true);
        expect(p.amount).toBeGreaterThanOrEqual(0);
      }
      const winners = bets.filter((b) => b.horse === winner);
      expect(r.payouts).toHaveLength(winners.length);
      if (winners.length > 0) expect(r.carryOut).toBe(0);
    }
  });
});
