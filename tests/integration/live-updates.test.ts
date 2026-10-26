import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
const cookies: Record<string, string> = {};

async function join(username: string) {
  const socket = await server.connectAs(cookies[username]);
  const t = track<PlayerState>(socket);
  await t.waitFor();
  return { socket, t };
}

beforeEach(async () => {
  server = await startTestServer();
  const { cookie } = await server.login('hosttt', '1231');
  host = await server.connectAs(cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  for (const u of ['ana', 'beto', 'carla']) {
    cookies[u] = (await server.login(u, 'pw')).cookie!;
    await emitAck(host, 'host:adjustBalance', { username: u, mode: 'add', value: 100 });
  }
  await emitAck(host, 'host:openRound');
});

afterEach(async () => {
  await server.close();
});

describe('actualizaciones en vivo', () => {
  it('una apuesta llega al host y a otros jugadores en menos de 1 s', async () => {
    const ana = await join('ana');
    const beto = await join('beto');
    await beto.t.waitFor((s) => s.phase === 'betting');

    const t0 = Date.now();
    expect(await emitAck(ana.socket, 'bet:place', { horse: 3, amount: 40 })).toEqual({ ok: true });
    const [h, b] = await Promise.all([
      hostT.waitFor((s) => s.pot === 40, 1000),
      beto.t.waitFor((s) => s.odds.find((o) => o.horse === 3)?.total === 40, 1000),
    ]);
    expect(Date.now() - t0).toBeLessThan(1000);

    const horse3 = h.horses.find((x) => x.horse === 3)!;
    expect(horse3.multiplier).toBe(1);
    expect(horse3.bets).toEqual([{ username: 'ana', amount: 40, potentialPayout: 40 }]);
    expect(b.odds.find((o) => o.horse === 3)).toEqual({ horse: 3, total: 40, bettors: 1, multiplier: 1 });

    // cambio de apuesta también se ve en vivo
    expect(await emitAck(ana.socket, 'bet:place', { horse: 5, amount: 25 })).toEqual({ ok: true });
    const h2 = await hostT.waitFor((s) => s.pot === 25, 1000);
    expect(h2.horses.find((x) => x.horse === 3)!.bets).toEqual([]);
    expect(h2.horses.find((x) => x.horse === 5)!.bets).toEqual([{ username: 'ana', amount: 25, potentialPayout: 25 }]);
  });

  it('el state del jugador no contiene datos de otros jugadores (FR-029)', async () => {
    const ana = await join('ana');
    const beto = await join('beto');
    await emitAck(ana.socket, 'bet:place', { horse: 2, amount: 37 });
    await emitAck(beto.socket, 'bet:place', { horse: 4, amount: 11 });
    const b = await beto.t.waitFor((s) => s.odds.find((o) => o.horse === 2)?.total === 37);
    const json = JSON.stringify(b);
    expect(json).not.toMatch(/ana|carla|hosttt/i);
    expect(json.match(/"balance"/g)).toHaveLength(1);
    expect(b.balance).toBe(89);
    expect(Object.keys(b).sort()).toEqual(['balance', 'horseDefs', 'myBet', 'myRank', 'myResult', 'odds', 'phase', 'raceOrder', 'role', 'roundId', 'username']);
  });

  it('betStatus: apostaron y faltan según apuestas y conexión', async () => {
    const ana = await join('ana');
    const beto = await join('beto');
    let h = await hostT.waitFor((s) => s.betStatus.missing.length === 2);
    expect(h.betStatus).toEqual({ placed: [], missing: ['ana', 'beto'] });

    await emitAck(ana.socket, 'bet:place', { horse: 1, amount: 10 });
    h = await hostT.waitFor((s) => s.betStatus.placed.length === 1);
    expect(h.betStatus).toEqual({ placed: ['ana'], missing: ['beto'] });

    // beto se desconecta sin apostar ⇒ sale de "faltan"
    beto.socket.disconnect();
    h = await hostT.waitFor((s) => s.betStatus.missing.length === 0);
    expect(h.betStatus).toEqual({ placed: ['ana'], missing: [] });

    // ana se desconecta con apuesta ⇒ sigue en "apostaron"
    ana.socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    expect(hostT.latest()!.betStatus).toEqual({ placed: ['ana'], missing: [] });

    // beto vuelve ⇒ reaparece en "faltan" y recibe el snapshot completo al conectar
    const again = await join('beto');
    const snap = again.t.latest()!;
    expect(snap.phase).toBe('betting');
    expect(snap.balance).toBe(100);
    expect(snap.odds.find((o) => o.horse === 1)!.total).toBe(10);
    h = await hostT.waitFor((s) => s.betStatus.missing.length === 1);
    expect(h.betStatus).toEqual({ placed: ['ana'], missing: ['beto'] });
  });

  it('dos sockets del mismo jugador: sigue en "faltan" hasta que se cierran ambos', async () => {
    const one = await join('carla');
    const two = await join('carla');
    await hostT.waitFor((s) => s.betStatus.missing.includes('carla'));
    one.socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    expect(hostT.latest()!.betStatus.missing).toEqual(['carla']);
    two.socket.disconnect();
    await hostT.waitFor((s) => s.betStatus.missing.length === 0);
  });
});
