export interface RankInput {
  username: string;
  score: number;
  balance: number;
}

/**
 * Leaderboard general (FR-034): puntaje desc, saldo desc y nombre asc sin distinguir
 * mayúsculas. `isFirst` marca al primero; `isLast` al último solo si hay ≥ 2 jugadores.
 */
export function rank<T extends RankInput>(players: readonly T[]): (T & { isFirst: boolean; isLast: boolean })[] {
  const sorted = [...players].sort(
    (a, b) =>
      b.score - a.score || b.balance - a.balance || a.username.localeCompare(b.username, 'es', { sensitivity: 'base' }),
  );
  return sorted.map((p, i) => ({ ...p, isFirst: i === 0, isLast: sorted.length >= 2 && i === sorted.length - 1 }));
}
