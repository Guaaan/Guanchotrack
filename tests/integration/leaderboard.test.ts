import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRace, stepRace } from '../../server/domain/race';
import type { HorseNumber, HostState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

const SEED = 777;
let W: HorseNumber;
{
  let s = createRace(SEED);
  while (!s.finished) s = stepRace(s);
  W = s.winner!;
}
const L = ((W % 6) + 1) as HorseNumber;

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
const sockets: Record<string, Socket> = {};

beforeEach(async () => {
  server = await startTestServer({ seedFn: () => SEED });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  for (const u of ['Beto', 'ana', 'carla', 'dani']) {
    const { cookie } = await server.login(u, 'pw');
    if (u !== 'dani') sockets[u] = await server.connectAs(cookie);
    await emitAck(host, 'host:adjustBalance', { username: u, mode: 'set', value: 100 });
  }
});

afterEach(async () => {
  await server.close();
});

async function playRound(bets: [string, HorseNumber, number][]) {
  await emitAck(host, 'host:openRound');
  for (const [u, horse, amount] of bets) expect(await emitAck(sockets[u], 'bet:place', { horse, amount })).toEqual({ ok: true });
  await emitAck(host, 'host:startRace');
  return hostT.waitFor((s) => s.phase === 'finished', 10_000);
}

describe('leaderboard general (US6)', () => {
  it('sin rondas: todos los jugadores con 0 puntos, orden por monedas y nombre; sin el host', async () => {
    const h = await hostT.waitFor((s) => s.leaderboard.length === 4);
    expect(h.leaderboard.map((r) => r.username)).toEqual(['ana', 'Beto', 'carla', 'dani']);
    expect(h.leaderboard.every((r) => r.score === 0 && r.balance === 100)).toBe(true);
    expect(h.leaderboard.find((r) => r.username === 'hosttt')).toBeUndefined();
    expect(h.leaderboard.map((r) => r.online)).toEqual([true, true, true, false]);
    expect(h.leaderboard.map((r) => [r.isFirst, r.isLast])).toEqual([
      [true, false],
      [false, false],
      [false, false],
      [false, true],
    ]);
  });

  it('tras varias rondas ordena por aciertos y luego por monedas', async () => {
    await playRound([
      ['ana', W, 10],
      ['Beto', W, 30],
      ['carla', L, 20],
    ]);
    const h = await playRound([
      ['Beto', W, 5],
      ['ana', L, 5],
    ]);
    const board = h.leaderboard.map((r) => [r.username, r.score, r.balance]);
    // Beto: 2 aciertos; ana: 1; carla y dani: 0 (dani tiene más monedas que carla)
    expect(board.map((r) => r[0])).toEqual(['Beto', 'ana', 'dani', 'carla']);
    expect(board.map((r) => r[1])).toEqual([2, 1, 0, 0]);
    expect(h.leaderboard[0].isFirst).toBe(true);
    expect(h.leaderboard[3]).toMatchObject({ username: 'carla', isLast: true, balance: 80 });
  });

  it('el estado de los jugadores no incluye el leaderboard (FR-029)', async () => {
    const t = track(sockets.ana);
    await emitAck(host, 'host:adjustBalance', { username: 'ana', mode: 'add', value: 1 });
    const s = await t.waitFor((x) => (x as { balance: number }).balance === 101);
    expect(JSON.stringify(s)).not.toMatch(/leaderboard|Beto|carla/);
  });
});
