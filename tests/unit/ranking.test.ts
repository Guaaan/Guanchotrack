import { describe, expect, it } from 'vitest';
import { rank } from '../../server/domain/ranking';

const p = (username: string, score: number, balance: number) => ({ username, score, balance });

describe('rank (FR-034)', () => {
  it('ordena por puntaje desc', () => {
    expect(rank([p('a', 1, 0), p('b', 3, 0), p('c', 0, 0)]).map((r) => r.username)).toEqual(['b', 'a', 'c']);
  });

  it('a igual puntaje, más monedas primero', () => {
    expect(rank([p('a', 2, 10), p('b', 2, 50), p('c', 2, 30)]).map((r) => r.username)).toEqual(['b', 'c', 'a']);
  });

  it('a igual puntaje y monedas, nombre asc sin distinguir mayúsculas', () => {
    expect(rank([p('Beto', 1, 5), p('ana', 1, 5), p('carla', 1, 5)]).map((r) => r.username)).toEqual(['ana', 'Beto', 'carla']);
    expect(rank([p('Ana', 0, 0), p('ana', 0, 0)]).map((r) => r.username)).toHaveLength(2);
  });

  it('isFirst solo en el primero; isLast solo en el último y con ≥ 2 jugadores', () => {
    const r = rank([p('a', 3, 0), p('b', 1, 0), p('c', 0, 0)]);
    expect(r.map((x) => [x.isFirst, x.isLast])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
    expect(rank([p('solo', 1, 1)])).toEqual([{ username: 'solo', score: 1, balance: 1, isFirst: true, isLast: false }]);
  });

  it('entrada vacía devuelve [] y no muta la entrada', () => {
    expect(rank([])).toEqual([]);
    const input = [p('b', 0, 0), p('a', 1, 0)];
    rank(input);
    expect(input.map((x) => x.username)).toEqual(['b', 'a']);
  });

  it('conserva campos adicionales (p. ej. online)', () => {
    const r = rank([{ ...p('a', 1, 0), online: true }]);
    expect(r[0]).toMatchObject({ username: 'a', online: true });
  });
});
