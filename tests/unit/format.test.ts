import { describe, expect, it } from 'vitest';
import { formatCoins, formatMultiplier } from '../../shared/format';

describe('formatMultiplier', () => {
  it('trunca a 2 decimales con coma', () => {
    expect(formatMultiplier(2.356)).toBe('2,35×');
    expect(formatMultiplier(2.359)).toBe('2,35×');
  });
  it('enteros con dos ceros', () => {
    expect(formatMultiplier(1)).toBe('1,00×');
    expect(formatMultiplier(2)).toBe('2,00×');
  });
  it('valores exactos con flotante impreciso', () => {
    expect(formatMultiplier(1.1)).toBe('1,10×');
    expect(formatMultiplier(60 / 30)).toBe('2,00×');
  });
  it('null es "sin apuestas"', () => {
    expect(formatMultiplier(null)).toBe('sin apuestas');
  });
});

describe('formatCoins', () => {
  it('separa miles con punto', () => {
    expect(formatCoins(0)).toBe('0');
    expect(formatCoins(999)).toBe('999');
    expect(formatCoins(1000)).toBe('1.000');
    expect(formatCoins(1234567)).toBe('1.234.567');
  });
  it('negativos', () => {
    expect(formatCoins(-1500)).toBe('-1.500');
  });
});
