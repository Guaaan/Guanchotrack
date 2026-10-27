import { OWNER_SHARE_PERCENT } from '../../shared/horses';
import type { HorseNumber } from '../../shared/types';

export interface BetInput {
  userId: number;
  horse: HorseNumber;
  amount: number;
  confirmedAt: number;
}

const HORSE_NUMBERS: HorseNumber[] = [1, 2, 3, 4, 5, 6];

/** Parte del pozo para el dueño del ganador: floor(pot × 10 / 100) (constitución X). */
export function ownerShare(pot: number): number {
  return Math.floor((pot * OWNER_SHARE_PERCENT) / 100);
}

/**
 * `(pot − parte del dueño) / total` por caballo, descontando la parte solo en los caballos con
 * dueño (`owned`); `null` si nadie apostó a ese caballo.
 */
export function multipliers(
  bets: BetInput[],
  carry: number,
  owned: ReadonlySet<HorseNumber>,
): Record<HorseNumber, number | null> {
  const pot = bets.reduce((s, b) => s + b.amount, 0) + carry;
  const share = ownerShare(pot);
  const out = {} as Record<HorseNumber, number | null>;
  for (const h of HORSE_NUMBERS) {
    const total = bets.reduce((s, b) => (b.horse === h ? s + b.amount : s), 0);
    out[h] = total > 0 ? (pot - (owned.has(h) ? share : 0)) / total : null;
  }
  return out;
}

/**
 * Liquidación parimutuel en enteros. Si el ganador tiene dueño (`owned`), el dueño recibe
 * `ownerShare(pot)` y se reparte el resto; si no, todo el pozo. Cada ganador recibe
 * `floor(amount × reparto / T)` y el sobrante se reparte de a 1 por mayor resto, luego
 * `confirmedAt` asc y `userId` asc. Sin acertantes, lo que no es del dueño pasa al acumulado.
 */
export function settle(
  bets: BetInput[],
  carry: number,
  winner: HorseNumber,
  owned: boolean,
): { ownerShare: number; payouts: { userId: number; amount: number }[]; carryOut: number } {
  const pot = bets.reduce((s, b) => s + b.amount, 0) + carry;
  const share = owned ? ownerShare(pot) : 0;
  const prize = pot - share;
  const winners = bets.filter((b) => b.horse === winner);
  const total = winners.reduce((s, b) => s + b.amount, 0);
  if (total === 0) return { ownerShare: share, payouts: [], carryOut: prize };

  const shares = winners.map((b) => ({
    bet: b,
    amount: Math.floor((b.amount * prize) / total),
    remainder: (b.amount * prize) % total,
  }));
  let leftover = prize - shares.reduce((s, x) => s + x.amount, 0);
  const byPriority = [...shares].sort(
    (a, b) =>
      b.remainder - a.remainder || a.bet.confirmedAt - b.bet.confirmedAt || a.bet.userId - b.bet.userId,
  );
  for (const s of byPriority) {
    if (leftover === 0) break;
    s.amount++;
    leftover--;
  }
  return { ownerShare: share, payouts: shares.map((s) => ({ userId: s.bet.userId, amount: s.amount })), carryOut: 0 };
}
