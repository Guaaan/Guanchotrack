import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { checkInvariant } from '../../server/db';
import { mulberry32 } from '../../server/domain/rng';
import type { HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

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

describe('conservación de monedas con caballos con dueño (SC-003, SC-004)', () => {
  it('secuencia pseudoaleatoria de compras, ediciones, apuestas, carreras, reinicios y eliminaciones', async () => {
    server = await startTestServer({ tickMs: 1, seedFn: (() => {
      let seed = 100;
      return () => seed++;
    })() });
    const host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    const hostT = track<HostState>(host);
    await hostT.waitFor();
    const rand = mulberry32(2027);
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
    const players = new Map<string, { socket: Socket; t: Tracker<PlayerState> }>();
    let created = 0;
    let ownedWins = 0;

    const newPlayer = async () => {
      const name = `jug${created++}`;
      const socket = await server.connectAs((await server.login(name, 'pw')).cookie);
      players.set(name, { socket, t: track<PlayerState>(socket) });
      await emitAck(host, 'host:adjustBalance', { username: name, mode: 'add', value: 40 + Math.floor(rand() * 120) });
    };
    for (let i = 0; i < 4; i++) await newPlayer();

    const idOf = (name: string) =>
      (server.db.prepare('SELECT id FROM users WHERE username = ?').get(name) as { id: number } | undefined)?.id;

    for (let step = 0; step < 90; step++) {
      const total = totalCoins();
      const adjustBefore = adjusts();
      const names = [...players.keys()];
      const phase = server.game.phase();
      const action = pick(['round', 'round', 'bet', 'bet', 'buy', 'buy', 'edit', 'resetRound', 'remove', 'join']);
      if (action === 'round') {
        if (phase === 'betting') {
          const finals = (server.db.prepare("SELECT COUNT(*) AS c FROM results WHERE status = 'final'").get() as { c: number }).c;
          await emitAck(host, 'host:startRace');
          await hostT.waitFor((s) => s.phase === 'finished', 5000);
          const last = server.db
            .prepare("SELECT id, round_id, owner_share FROM results WHERE status = 'final' ORDER BY id DESC")
            .get() as { round_id: number; owner_share: number };
          expect((server.db.prepare("SELECT COUNT(*) AS c FROM results WHERE status = 'final'").get() as { c: number }).c).toBe(finals + 1);
          if (last.owner_share > 0) ownedWins++;
        } else {
          await emitAck(host, 'host:openRound');
        }
      } else if (action === 'bet' && names.length > 0) {
        await emitAck(players.get(pick(names))!.socket, 'bet:place', {
          horse: 1 + Math.floor(rand() * 6),
          amount: 1 + Math.floor(rand() * 15),
        });
      } else if (action === 'buy' && names.length > 0) {
        const horse = 1 + Math.floor(rand() * 6);
        const owner = (server.db
          .prepare('SELECT u.username FROM horses h LEFT JOIN users u ON u.id = h.owner_id WHERE h.number = ?')
          .get(horse) as { username: string | null }).username;
        await emitAck(players.get(pick(names))!.socket, 'horse:buy', { horse, expectedOwner: owner });
      } else if (action === 'edit' && names.length > 0) {
        await emitAck(players.get(pick(names))!.socket, 'horse:edit', {
          horse: 1 + Math.floor(rand() * 6),
          name: `C${step}`,
          dorsal: 10 + step,
        });
      } else if (action === 'resetRound') {
        await emitAck(host, 'host:resetRound');
      } else if (action === 'remove' && names.length > 1) {
        const name = pick(names);
        if ((await emitAck(host, 'admin:removePlayer', { userId: idOf(name) })).ok) players.delete(name);
      } else if (action === 'join') {
        await newPlayer();
      }
      expect(checkInvariant(server.db)).toBe(true);
      // las monedas solo cambian por ajustes del host
      expect(totalCoins() - total).toBe(adjusts() - adjustBefore);
    }
    // la secuencia ejercita compras y al menos una carrera ganada por un caballo con dueño
    expect((server.db.prepare('SELECT COUNT(*) AS c FROM horse_purchases').get() as { c: number }).c).toBeGreaterThan(3);
    expect(ownedWins).toBeGreaterThan(0);
  }, 30000);
});
