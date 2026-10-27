import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balanceOf, carryBalance, checkInvariant, scoreOf } from '../../server/db';
import { createRace, stepRace } from '../../server/domain/race';
import type { HorseNumber, HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

function winnerOf(seed: number): HorseNumber {
  let s = createRace(seed);
  while (!s.finished) s = stepRace(s);
  return s.winner!;
}

/** Primera semilla en la que gana `horse`. */
function seedWonBy(horse: HorseNumber): number {
  for (let seed = 1; ; seed++) if (winnerOf(seed) === horse) return seed;
}

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
let seed: number;
const players: Record<string, { socket: Socket; t: Tracker<PlayerState>; id: number }> = {};

const invariant = () => expect(checkInvariant(server.db)).toBe(true);
const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const bet = (u: string, horse: number, amount: number) => emitAck(players[u].socket, 'bet:place', { horse, amount });
const buy = (u: string, horse: number, expectedOwner: string | null = null) =>
  emitAck(players[u].socket, 'horse:buy', { horse, expectedOwner });
const balance = (u: string) => balanceOf(server.db, players[u].id);
const ledger = (u: string | null, kind: string) =>
  server.db
    .prepare(`SELECT amount FROM coin_transactions WHERE ${u === null ? 'user_id IS NULL' : 'user_id = ?'} AND kind = ? ORDER BY id`)
    .all(...(u === null ? [kind] : [players[u].id, kind]))
    .map((r) => (r as { amount: number }).amount);

async function join(username: string, coins: number) {
  const { cookie } = await server.login(username, 'pw');
  const socket = await server.connectAs(cookie);
  const t = track<PlayerState>(socket);
  const { id } = server.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number };
  players[username] = { socket, t, id };
  await t.waitFor();
  expect(await hostDo('host:adjustBalance', { username, mode: 'add', value: coins })).toEqual({ ok: true });
}

async function race() {
  expect(await hostDo('host:startRace')).toEqual({ ok: true });
  return hostT.waitFor((s) => s.phase === 'finished');
}

beforeEach(async () => {
  seed = seedWonBy(2);
  server = await startTestServer({ seedFn: () => seed });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  await join('ana', 100);
  await join('beto', 100);
  await join('carla', 100);
  await players.carla.t.waitFor((s) => s.balance === 100);
});

afterEach(async () => {
  await server.close();
});

describe('cobrar como dueño (US2)', () => {
  it('dueño + acertante: pozo 135 ⇒ dueño 13, acertante 122; el multiplicador mostrado coincide (US2-1, US2-5)', async () => {
    expect(await buy('ana', 2)).toEqual({ ok: true }); // acumulado 30
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await bet('beto', 2, 35)).toEqual({ ok: true });
    expect(await bet('carla', 4, 70)).toEqual({ ok: true });

    const h = await hostT.waitFor((s) => s.pot === 135);
    const two = h.horses.find((x) => x.horse === 2)!;
    expect(two.multiplier).toBe((135 - 13) / 35);
    expect(two.bets).toEqual([{ username: 'beto', amount: 35, potentialPayout: 122 }]);
    const beto = await players.beto.t.waitFor((s) => s.myBet?.potentialPayout === 122);
    expect(beto.odds.find((o) => o.horse === 2)!.multiplier).toBe((135 - 13) / 35);
    expect(beto.odds.find((o) => o.horse === 4)!.multiplier).toBe(135 / 70);

    await race();
    expect(ledger('ana', 'owner_share')).toEqual([13]);
    expect(ledger('beto', 'payout')).toEqual([122]);
    expect(balance('ana')).toBe(70 + 13);
    expect(balance('beto')).toBe(65 + 122);
    expect(carryBalance(server.db)).toBe(0);
    expect(server.db.prepare("SELECT owner_id, owner_share FROM results WHERE status = 'final'").get()).toEqual({
      owner_id: players.ana.id,
      owner_share: 13,
    });
    // ser dueño no da puntos
    expect(scoreOf(server.db, players.ana.id)).toBe(0);
    expect(scoreOf(server.db, players.beto.id)).toBe(1);
    invariant();
  });

  it('sin acertantes: el dueño cobra su parte y el resto pasa al acumulado (US2-3)', async () => {
    expect(await buy('ana', 2)).toEqual({ ok: true }); // acumulado 30
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await bet('carla', 4, 50)).toEqual({ ok: true }); // pozo 80
    await race();
    expect(ledger('ana', 'owner_share')).toEqual([8]);
    expect(carryBalance(server.db)).toBe(72);
    invariant();
  });

  it('el acumulado paga la parte del dueño si lo apostado no alcanza', async () => {
    expect(await buy('ana', 2)).toEqual({ ok: true });
    expect(await buy('beto', 1)).toEqual({ ok: true });
    expect(await buy('carla', 3)).toEqual({ ok: true }); // acumulado 90
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await bet('carla', 4, 5)).toEqual({ ok: true }); // pozo 95 ⇒ dueño 9
    await race();
    expect(ledger('ana', 'owner_share')).toEqual([9]);
    expect(carryBalance(server.db)).toBe(86);
    expect(ledger(null, 'carry_out')).toEqual([-4]);
    invariant();
  });

  it('ganador sin dueño: el libro queda igual que en 001 (US2-2)', async () => {
    expect(await buy('ana', 5)).toEqual({ ok: true }); // acumulado 30, pero el 2 no tiene dueño
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await bet('beto', 2, 35)).toEqual({ ok: true });
    expect(await bet('carla', 4, 70)).toEqual({ ok: true });
    await race();
    expect(ledger('beto', 'payout')).toEqual([135]);
    expect(server.db.prepare("SELECT COUNT(*) AS c FROM coin_transactions WHERE kind = 'owner_share'").get()).toEqual({ c: 0 });
    expect(server.db.prepare("SELECT owner_id, owner_share FROM results WHERE status = 'final'").get()).toEqual({
      owner_id: null,
      owner_share: 0,
    });
    invariant();
  });

  it('el dueño que apuesta a su caballo cobra ambas cosas por separado (US2-4)', async () => {
    expect(await buy('ana', 2)).toEqual({ ok: true }); // acumulado 30
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await bet('ana', 2, 20)).toEqual({ ok: true });
    expect(await bet('carla', 4, 50)).toEqual({ ok: true }); // pozo 100 ⇒ dueño 10
    await race();
    expect(ledger('ana', 'owner_share')).toEqual([10]);
    expect(ledger('ana', 'payout')).toEqual([90]);
    expect(scoreOf(server.db, players.ana.id)).toBe(1);
    invariant();
  });

  it('comprar durante las apuestas recalcula los multiplicadores con el dueño nuevo (US2-6)', async () => {
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await bet('beto', 2, 50)).toEqual({ ok: true });
    expect(await bet('carla', 4, 50)).toEqual({ ok: true });
    await hostT.waitFor((s) => s.horses.find((x) => x.horse === 2)?.multiplier === 2);
    expect(await buy('ana', 2)).toEqual({ ok: true }); // pozo 130 ⇒ dueño 13
    const h = await hostT.waitFor((s) => s.pot === 130);
    expect(h.horses.find((x) => x.horse === 2)!.multiplier).toBe((130 - 13) / 50);
    expect(h.horses.find((x) => x.horse === 4)!.multiplier).toBe(130 / 50);
    await players.beto.t.waitFor((s) => s.myBet?.potentialPayout === 117);
    await race();
    expect(ledger('beto', 'payout')).toEqual([117]);
    invariant();
  });
});
