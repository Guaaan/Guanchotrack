import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { checkInvariant } from '../../server/db';
import { mulberry32 } from '../../server/domain/rng';
import type { HostState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer } from '../helpers/server';

let server: TestServer;

afterEach(async () => {
  await server.close();
});

/** Monedas totales: saldos + apuestas activas + pozo acumulado. */
function totalCoins(): number {
  const { s } = server.db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions').get() as { s: number };
  const { a } = server.db.prepare("SELECT COALESCE(SUM(amount), 0) AS a FROM bets WHERE status = 'active'").get() as {
    a: number;
  };
  return s + a;
}

const adjusts = () =>
  (server.db.prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions WHERE kind = 'host_adjust'").get() as {
    s: number;
  }).s;

describe('conservación de monedas con acciones de admin (SC-003)', () => {
  it('secuencia pseudoaleatoria de apuestas, carreras y acciones admin', async () => {
    server = await startTestServer({ tickMs: 1 });
    const host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    const hostT = track<HostState>(host);
    await hostT.waitFor();
    const rand = mulberry32(2026);
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
    const players = new Map<string, Socket>();
    let created = 0;

    const newPlayer = async () => {
      const name = `jug${created++}`;
      players.set(name, await server.connectAs((await server.login(name, 'pw')).cookie));
      await emitAck(host, 'host:adjustBalance', { username: name, mode: 'add', value: 20 + Math.floor(rand() * 80) });
    };
    for (let i = 0; i < 4; i++) await newPlayer();

    const idOf = (name: string) =>
      (server.db.prepare('SELECT id FROM users WHERE username = ?').get(name) as { id: number } | undefined)?.id;

    for (let step = 0; step < 60; step++) {
      const total = totalCoins();
      const adjustBefore = adjusts();
      const names = [...players.keys()];
      const phase = server.game.phase();
      const action = pick(['round', 'bet', 'bet', 'active', 'rename', 'remove', 'horses', 'join']);
      if (action === 'round') {
        if (phase === 'betting') {
          await emitAck(host, 'host:startRace');
          await hostT.waitFor((s) => s.phase === 'finished', 5000);
        } else {
          await emitAck(host, 'host:openRound');
        }
      } else if (action === 'bet' && names.length > 0) {
        await emitAck(players.get(pick(names))!, 'bet:place', { horse: 1 + Math.floor(rand() * 6), amount: 1 + Math.floor(rand() * 15) });
      } else if (action === 'active' && names.length > 0) {
        await emitAck(host, 'admin:setActive', { userId: idOf(pick(names)), active: rand() < 0.5 });
      } else if (action === 'rename' && names.length > 0) {
        const old = pick(names);
        const name = `ren${created++}`;
        if ((await emitAck(host, 'admin:rename', { userId: idOf(old), username: name })).ok) {
          players.set(name, players.get(old)!);
          players.delete(old);
        }
      } else if (action === 'remove' && names.length > 0) {
        const name = pick(names);
        if ((await emitAck(host, 'admin:removePlayer', { userId: idOf(name) })).ok) players.delete(name);
      } else if (action === 'horses') {
        await emitAck(host, 'admin:resetHorses');
      } else if (action === 'join') {
        await newPlayer();
      }
      expect(checkInvariant(server.db), `paso ${step}: ${action}`).toBe(true);
      // solo los ajustes del host cambian el total de monedas
      expect(totalCoins() - total, `paso ${step}: ${action}`).toBe(adjusts() - adjustBefore);
    }
    // la secuencia sí ejercita lo importante: eliminaciones con saldo y rondas liquidadas
    const count = (sql: string) => (server.db.prepare(sql).get() as { c: number }).c;
    expect(count("SELECT COUNT(*) AS c FROM coin_transactions WHERE note LIKE 'remove %'")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) AS c FROM rounds WHERE phase = 'finished'")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) AS c FROM bets WHERE status IN ('won', 'lost')")).toBeGreaterThan(0);
  }, 30000);
});
