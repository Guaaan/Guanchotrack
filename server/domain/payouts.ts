import type { HorseNumber } from '../../shared/types';

export interface BetInput {
  userId: number;
  horse: HorseNumber;
  amount: number;
  confirmedAt: number;
}

const HORSE_NUMBERS: HorseNumber[] = [1, 2, 3, 4, 5, 6];

/** `pot / total` por caballo; `null` si nadie apostó a ese caballo. */
export function multipliers(bets: BetInput[], carry: number): Record<HorseNumber, number | null> {
  const pot = bets.reduce((s, b) => s + b.amount, 0) + carry;
  const out = {} as Record<HorseNumber, number | null>;
  for (const h of HORSE_NUMBERS) {
    const total = bets.reduce((s, b) => (b.horse === h ? s + b.amount : s), 0);
    out[h] = total > 0 ? pot / total : null;
  }
  return out;
}

/**
 * Liquidación parimutuel en enteros: cada ganador recibe `floor(amount × pot / T)` y el
 * sobrante se reparte de a 1 por mayor resto, luego `confirmedAt` asc y `userId` asc.
 */
export function settle(
  bets: BetInput[],
  carry: number,
  winner: HorseNumber,
): { payouts: { userId: number; amount: number }[]; carryOut: number } {
  const pot = bets.reduce((s, b) => s + b.amount, 0) + carry;
  const winners = bets.filter((b) => b.horse === winner);
  const total = winners.reduce((s, b) => s + b.amount, 0);
  if (total === 0) return { payouts: [], carryOut: pot };

  const shares = winners.map((b) => ({
    bet: b,
    amount: Math.floor((b.amount * pot) / total),
    remainder: (b.amount * pot) % total,
  }));
  let leftover = pot - shares.reduce((s, x) => s + x.amount, 0);
  const byPriority = [...shares].sort(
    (a, b) =>
      b.remainder - a.remainder || a.bet.confirmedAt - b.bet.confirmedAt || a.bet.userId - b.bet.userId,
  );
  for (const share of byPriority) {
    if (leftover === 0) break;
    share.amount++;
    leftover--;
  }
  return { payouts: shares.map((s) => ({ userId: s.bet.userId, amount: s.amount })), carryOut: 0 };
}
