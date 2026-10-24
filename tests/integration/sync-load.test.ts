import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkInvariant } from '../../server/db';
import type { HorseNumber, HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

const N = 20;
let server: TestServer;
let hostSockets: Socket[];
let hostTrackers: Tracker<HostState>[];
const players: { username: string; socket: Socket; t: Tracker<PlayerState> }[] = [];
const ticks: Map<number, string>[] = [new Map(), new Map()];

beforeAll(async () => {
  server = await startTestServer({ seedFn: () => 987654 });
  const { cookie } = await server.login('hosttt', '1231');
  hostSockets = [await server.connectAs(cookie), await server.connectAs(cookie)];
  hostTrackers = hostSockets.map((s) => track<HostState>(s));
  hostSockets.forEach((s, i) =>
    s.on('state', (st: HostState) => {
      if (st.race) ticks[i].set(st.race.tick, JSON.stringify(st.race.positions));
    }),
  );
  for (let i = 0; i < N; i++) {
    const username = `jugador${i}`;
    const login = await server.login(username, 'pw');
    const socket = await server.connectAs(login.cookie);
    players.push({ username, socket, t: track<PlayerState>(socket) });
  }
}, 30_000);

afterAll(async () => {
  await server.close();
});

describe('sincronización con 20 jugadores (SC-004)', () => {
  it('apuestas en < 1 s, misma carrera en todos los hosts y pagos coherentes', async () => {
    const host = hostSockets[0];
    for (const p of players) {
      expect(await emitAck(host, 'host:adjustBalance', { username: p.username, mode: 'add', value: 100 })).toEqual({ ok: true });
    }
    expect(await emitAck(host, 'host:openRound')).toEqual({ ok: true });
    await Promise.all(players.map((p) => p.t.waitFor((s) => s.phase === 'betting' && s.balance === 100)));

    const t0 = Date.now();
    await Promise.all(
      players.map((p, i) => emitAck(p.socket, 'bet:place', { horse: ((i * 7) % 6) + 1, amount: 10 + i })),
    );
    const totalStaked = players.reduce((s, _p, i) => s + 10 + i, 0);
    await Promise.all([
      ...hostTrackers.map((t) => t.waitFor((s) => s.pot === totalStaked && s.betStatus.missing.length === 0, 1000)),
      ...players.map((p) => p.t.waitFor((s) => s.odds.reduce((a, o) => a + o.total, 0) === totalStaked, 1000)),
    ]);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(checkInvariant(server.db)).toBe(true);

    expect(await emitAck(host, 'host:startRace')).toEqual({ ok: true });
    const finals = await Promise.all(hostTrackers.map((t) => t.waitFor((s) => s.phase === 'finished', 15_000)));
    expect(finals[0].result).toEqual(finals[1].result);
    expect(finals[0].race).toEqual(finals[1].race);

    // mismas posiciones por tick en ambas pantallas de host
    expect(ticks[0].size).toBeGreaterThan(10);
    expect([...ticks[0].entries()]).toEqual([...ticks[1].entries()]);

    const winner = finals[0].result!.winner as HorseNumber;
    const paid = new Map(finals[0].result!.winners.map((w) => [w.username, w.payout]));
    const ends = await Promise.all(players.map((p) => p.t.waitFor((s) => s.phase === 'finished', 2000)));
    ends.forEach((s, i) => {
      expect(s.myResult!.winner).toBe(winner);
      expect(s.myResult!.payout).toBe(paid.get(players[i].username) ?? 0);
      expect(s.myResult!.won).toBe(paid.has(players[i].username));
    });
    expect(checkInvariant(server.db)).toBe(true);
  }, 30_000);
});
