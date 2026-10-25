import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRace, stepRace } from '../../server/domain/race';
import type { HorseNumber, HostState, PlayerState } from '../../shared/types';
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
const players: Record<string, { socket: Socket; t: Tracker<PlayerState> }> = {};

beforeEach(async () => {
  // ticks de 5 ms para poder observar la fase `racing`
  server = await startTestServer({ seedFn: () => SEED, tickMs: 5 });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  for (const u of ['Beto', 'ana', 'carla', 'dani']) {
    const { cookie } = await server.login(u, 'pw');
    if (u !== 'dani') {
      const socket = await server.connectAs(cookie);
      players[u] = { socket, t: track<PlayerState>(socket) };
    }
    await emitAck(host, 'host:adjustBalance', { username: u, mode: 'set', value: 100 });
  }
});

afterEach(async () => {
  await server.close();
});

describe('posición propia del jugador (US7, FR-028a)', () => {
  it('null en espera y apuestas; presente en carrera y resultado, igual al leaderboard del host', async () => {
    const ana = players.ana.t;
    expect((await ana.waitFor((s) => s.balance === 100)).myRank).toBeNull();

    await emitAck(host, 'host:openRound');
    const betting = await ana.waitFor((s) => s.phase === 'betting');
    expect(betting.myRank).toBeNull();

    await emitAck(players.ana.socket, 'bet:place', { horse: W, amount: 10 });
    await emitAck(players.Beto.socket, 'bet:place', { horse: W, amount: 30 });
    await emitAck(players.carla.socket, 'bet:place', { horse: L, amount: 20 });
    expect(ana.latest()!.myRank).toBeNull();

    await emitAck(host, 'host:startRace');
    const racing = await ana.waitFor((s) => s.phase === 'racing');
    expect(racing.myRank).toEqual({ position: expect.any(Number), total: 4, score: 0 });

    const h = await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    for (const [name, { t }] of Object.entries(players)) {
      const s = await t.waitFor((x) => x.phase === 'finished');
      const position = h.leaderboard.findIndex((r) => r.username === name) + 1;
      const row = h.leaderboard[position - 1];
      expect(s.myRank).toEqual({ position, total: 4, score: row.score });
    }
    // Beto (más monedas) primero, ana segunda; carla perdió y queda última
    expect(players.Beto.t.latest()!.myRank).toEqual({ position: 1, total: 4, score: 1 });
    expect(players.ana.t.latest()!.myRank).toEqual({ position: 2, total: 4, score: 1 });
    expect(players.carla.t.latest()!.myRank).toEqual({ position: 4, total: 4, score: 0 });
  });

  it('el estado del jugador no incluye nombres, puntajes ni saldos de otros (FR-029)', async () => {
    await emitAck(host, 'host:openRound');
    await emitAck(players.Beto.socket, 'bet:place', { horse: W, amount: 37 });
    await emitAck(host, 'host:startRace');
    await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    const s = await players.carla.t.waitFor((x) => x.phase === 'finished' && x.myRank !== null);
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/Beto|ana|dani|hosttt/);
    expect(Object.keys(s.myRank!).sort()).toEqual(['position', 'score', 'total']);
    expect(json.match(/"balance"/g)).toHaveLength(1);
  });
});
