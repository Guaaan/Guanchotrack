import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balanceOf, carryBalance, checkInvariant } from '../../server/db';
import { createRace, stepRace } from '../../server/domain/race';
import type { HorseNumber, HostState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
const sockets: Record<string, Socket> = {};
const ids: Record<string, number> = {};

const invariant = () => expect(checkInvariant(server.db)).toBe(true);
const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const txCount = () => (server.db.prepare('SELECT COUNT(*) AS c FROM coin_transactions').get() as { c: number }).c;

/** Semilla cuya carrera no la gana el caballo 1 (para generar acumulado). */
function seedNotWonBy(horse: HorseNumber): number {
  for (let seed = 1; ; seed++) {
    let s = createRace(seed);
    while (!s.finished) s = stepRace(s);
    if (s.winner !== horse) return seed;
  }
}

let seeds: number[] = [];

beforeEach(async () => {
  const first = seedNotWonBy(1);
  let n = 0;
  seeds = [];
  server = await startTestServer({
    tickMs: 5,
    seedFn: () => {
      const seed = n++ === 0 ? first : first + 1000 + n;
      seeds.push(seed);
      return seed;
    },
  });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  for (const u of ['ana', 'beto']) {
    sockets[u] = await server.connectAs((await server.login(u, 'pw')).cookie);
    ids[u] = (server.db.prepare('SELECT id FROM users WHERE username = ?').get(u) as { id: number }).id;
    await hostDo('host:adjustBalance', { username: u, mode: 'add', value: 100 });
  }
});

afterEach(async () => {
  await server.close();
});

describe('reiniciar ronda de apuestas', () => {
  it('devuelve todas las apuestas, conserva el acumulado y sigue en betting', async () => {
    // ronda previa sin acertantes para tener acumulado
    await hostDo('host:openRound');
    await emitAck(sockets.ana, 'bet:place', { horse: 1, amount: 10 });
    await hostDo('host:startRace');
    await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    expect(carryBalance(server.db)).toBe(10);

    await hostDo('host:openRound');
    await emitAck(sockets.ana, 'bet:place', { horse: 2, amount: 30 });
    await emitAck(sockets.beto, 'bet:place', { horse: 3, amount: 20 });
    await emitAck(sockets.beto, 'bet:place', { horse: 4, amount: 25 });
    expect(balanceOf(server.db, ids.ana)).toBe(60);
    expect(balanceOf(server.db, ids.beto)).toBe(75);
    invariant();

    expect(await hostDo('host:resetRound')).toEqual({ ok: true });
    expect(balanceOf(server.db, ids.ana)).toBe(90);
    expect(balanceOf(server.db, ids.beto)).toBe(100);
    expect(carryBalance(server.db)).toBe(10);
    const bets = server.db.prepare('SELECT status FROM bets WHERE round_id = 2').all();
    expect(bets).toEqual([{ status: 'refunded' }, { status: 'refunded' }]);
    const refunds = server.db
      .prepare("SELECT user_id, amount FROM coin_transactions WHERE note = 'reset round' AND kind = 'bet_refund' ORDER BY id")
      .all();
    expect(refunds).toEqual(
      expect.arrayContaining([
        { user_id: ids.ana, amount: 30 },
        { user_id: ids.beto, amount: 25 },
      ]),
    );
    expect(refunds).toHaveLength(2);

    const h = await hostT.waitFor((s) => s.phase === 'betting' && s.pot === 10);
    expect(h.carry).toBe(10);
    expect(h.horses.every((x) => x.total === 0 && x.bets.length === 0)).toBe(true);
    invariant();

    // se puede volver a apostar en la misma ronda
    expect(await emitAck(sockets.ana, 'bet:place', { horse: 5, amount: 5 })).toEqual({ ok: true });
    invariant();
  });

  it('fuera de betting se rechaza', async () => {
    expect((await hostDo('host:resetRound')).ok).toBe(false);
    await hostDo('host:openRound');
    await hostDo('host:startRace');
    expect((await hostDo('host:resetRound')).ok).toBe(false);
    await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    expect((await hostDo('host:resetRound')).ok).toBe(false);
  });
});

describe('reiniciar carrera', () => {
  it('anula la carrera, vuelve a betting con las apuestas intactas y usa nueva semilla', async () => {
    await hostDo('host:openRound');
    await emitAck(sockets.ana, 'bet:place', { horse: 2, amount: 30 });
    await hostDo('host:startRace');
    await hostT.waitFor((s) => s.phase === 'racing' && (s.race?.tick ?? 0) > 0);
    const before = txCount();

    expect(await hostDo('host:resetRace')).toEqual({ ok: true });
    expect(txCount()).toBe(before);
    expect(server.db.prepare('SELECT status FROM results').all()).toEqual([{ status: 'annulled' }]);
    expect(server.db.prepare('SELECT status, amount FROM bets').all()).toEqual([{ status: 'active', amount: 30 }]);
    let h = await hostT.waitFor((s) => s.phase === 'betting');
    expect(h.race).toBeNull();
    expect(h.pot).toBe(30);
    invariant();

    // la carrera anulada no sigue corriendo
    await new Promise((r) => setTimeout(r, 100));
    expect(hostT.latest()!.phase).toBe('betting');

    // las apuestas siguen editables
    expect(await emitAck(sockets.ana, 'bet:place', { horse: 3, amount: 40 })).toEqual({ ok: true });
    expect(balanceOf(server.db, ids.ana)).toBe(60);
    invariant();

    await hostDo('host:startRace');
    h = await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    const results = server.db.prepare('SELECT seed, status FROM results ORDER BY id').all() as { seed: number; status: string }[];
    expect(results.map((r) => r.status)).toEqual(['annulled', 'final']);
    expect(results[0].seed).not.toBe(results[1].seed);
    invariant();
  });

  it('fuera de racing se rechaza', async () => {
    expect((await hostDo('host:resetRace')).ok).toBe(false);
    await hostDo('host:openRound');
    expect((await hostDo('host:resetRace')).ok).toBe(false);
    await hostDo('host:startRace');
    await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    expect((await hostDo('host:resetRace')).ok).toBe(false);
  });
});
