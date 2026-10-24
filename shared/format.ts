/** Multiplicador truncado a 2 decimales con coma: 2.356 → "2,35×". */
export function formatMultiplier(m: number | null): string {
  if (m === null) return 'sin apuestas';
  const cents = Math.floor(m * 100 + 1e-9);
  const int = Math.floor(cents / 100);
  const dec = String(cents % 100).padStart(2, '0');
  return `${int},${dec}×`;
}

/** Monedas enteras con punto de miles: 12345 → "12.345". */
export function formatCoins(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
