import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balanceOf, carryBalance, checkInvariant } from '../../server/db';
import type { HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
const players: Record<string, { socket: Socket; t: Tracker<PlayerState>; id: number }> = {};

const invariant = () => expect(checkInvariant(server.db)).toBe(true);
const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const buy = (u: string, horse: number, expectedOwner: string | null) =>
  emitAck(players[u].socket, 'horse:buy', { horse, expectedOwner });
const balance = (u: string) => balanceOf(server.db, players[u].id);
const ownerOf = (horse: number) =>
  (server.db.prepare('SELECT owner_id FROM horses WHERE number = ?').get(horse) as { owner_id: number | null }).owner_id;

async function join(username: string, coins: number) {
  const { cookie } = await server.login(username, 'pw');
  const socket = await server.connectAs(cookie);
  const t = track<PlayerState>(socket);
  const { id } = server.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number };
  players[username] = { socket, t, id };
  await t.waitFor();
  if (coins > 0) expect(await hostDo('host:adjustBalance', { username, mode: 'add', value: coins })).toEqual({ ok: true });
  await t.waitFor((s) => s.balance === coins);
}

beforeEach(async () => {
  server = await startTestServer();
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  await join('ana', 100);
  await join('beto', 60);
  await join('carla', 200);
});

afterEach(async () => {
  await server.close();
});

describe('comprar caballos (US1)', () => {
  it('los 6 parten sin dueño (US1-1)', async () => {
    const s = players.ana.t.latest()!;
    expect(s.horseDefs.map((h) => h.owner)).toEqual([null, null, null, null, null, null]);
  });

  it('compra al establo: 30 al pozo acumulado; compra a jugador: 50 al dueño anterior (US1-2, US1-3)', async () => {
    expect(await buy('ana', 3, null)).toEqual({ ok: true });
    const ana = await players.ana.t.waitFor((s) => s.horseDefs[2].owner === 'ana');
    expect(ana.balance).toBe(70);
    expect(carryBalance(server.db)).toBe(30);
    expect((await hostT.waitFor((s) => s.carry === 30)).horseDefs[2].owner).toBe('ana');
    expect(
      server.db
        .prepare("SELECT user_id, kind, amount, actor_id, round_id FROM coin_transactions WHERE kind = 'horse_buy' ORDER BY id")
        .all(),
    ).toEqual([
      { user_id: players.ana.id, kind: 'horse_buy', amount: -30, actor_id: players.ana.id, round_id: null },
      { user_id: null, kind: 'horse_buy', amount: 30, actor_id: players.ana.id, round_id: null },
    ]);
    invariant();

    expect(await buy('beto', 3, 'ana')).toEqual({ ok: true });
    const beto = await players.beto.t.waitFor((s) => s.horseDefs[2].owner === 'beto');
    expect(beto.balance).toBe(10);
    expect(balance('ana')).toBe(120);
    expect(carryBalance(server.db)).toBe(30);
    expect(beto.horseDefs[2]).toMatchObject({ number: 3, dorsal: 3, name: 'Amarillo', color: 'yellow', coat: 'tordo' });
    expect(
      server.db
        .prepare("SELECT user_id, kind, amount, actor_id FROM coin_transactions WHERE kind IN ('horse_buy', 'horse_sale') ORDER BY id")
        .all()
        .slice(2),
    ).toEqual([
      { user_id: players.beto.id, kind: 'horse_buy', amount: -50, actor_id: players.beto.id },
      { user_id: players.ana.id, kind: 'horse_sale', amount: 50, actor_id: players.beto.id },
    ]);
    expect(
      server.db.prepare('SELECT horse, buyer_id, seller_id, price, name, dorsal, round_id FROM horse_purchases ORDER BY id').all(),
    ).toEqual([
      { horse: 3, buyer_id: players.ana.id, seller_id: null, price: 30, name: 'Amarillo', dorsal: 3, round_id: null },
      { horse: 3, buyer_id: players.beto.id, seller_id: players.ana.id, price: 50, name: 'Amarillo', dorsal: 3, round_id: null },
    ]);
    invariant();
  });

  it('rechaza comprar un caballo propio, sin saldo, con dueño cambiado o siendo host (US1-4, US1-5, FR-005)', async () => {
    expect(await buy('ana', 3, null)).toEqual({ ok: true });
    expect(await buy('ana', 3, 'ana')).toEqual({ ok: false, error: 'Este caballo ya es tuyo' });

    // beto vio el 3 sin dueño (precio 30) pero ya es de ana (50)
    expect(await buy('beto', 3, null)).toEqual({ ok: false, error: 'Este caballo cambió de dueño, revisa el precio' });
    expect(balance('beto')).toBe(60);

    // carla se lo compra a ana; beto aún cree que es de ana
    expect(await buy('carla', 3, 'ana')).toEqual({ ok: true });
    expect(await buy('beto', 3, 'ana')).toEqual({ ok: false, error: 'Este caballo cambió de dueño, revisa el precio' });
    expect(balance('beto')).toBe(60);

    expect(await hostDo('host:adjustBalance', { username: 'beto', mode: 'set', value: 25 })).toEqual({ ok: true });
    expect(await buy('beto', 1, null)).toEqual({ ok: false, error: 'Saldo insuficiente' });
    expect(ownerOf(1)).toBeNull();
    expect(balance('beto')).toBe(25);

    expect(await hostDo('horse:buy', { horse: 2, expectedOwner: null })).toEqual({
      ok: false,
      error: 'Solo los jugadores pueden comprar caballos',
    });
    for (const horse of [0, 7, 'x', null]) {
      expect(await buy('ana', horse as number, null)).toEqual({ ok: false, error: 'Caballo inválido' });
    }
    expect(await emitAck(players.ana.socket, 'horse:buy', null)).toEqual({ ok: false, error: 'Caballo inválido' });
    invariant();
  });

  it('saldo exacto deja al comprador en 0; un jugador puede tener varios caballos (US1-8)', async () => {
    expect(await hostDo('host:adjustBalance', { username: 'beto', mode: 'set', value: 30 })).toEqual({ ok: true });
    expect(await buy('beto', 6, null)).toEqual({ ok: true });
    expect(balance('beto')).toBe(0);
    for (const h of [1, 2, 5]) expect(await buy('carla', h, null)).toEqual({ ok: true });
    const carla = await players.carla.t.waitFor((s) => s.horseDefs[4].owner === 'carla');
    expect(carla.horseDefs.filter((h) => h.owner === 'carla').map((h) => h.number)).toEqual([1, 2, 5]);
    expect(carla.balance).toBe(110);
    invariant();
  });

  it('se puede comprar en espera, en apuestas y con la ronda terminada; nunca en carrera (US1-6, US1-7)', async () => {
    expect(await buy('ana', 1, null)).toEqual({ ok: true });
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await buy('ana', 2, null)).toEqual({ ok: true });
    const round = (server.db.prepare('SELECT id FROM rounds ORDER BY id DESC').get() as { id: number }).id;
    expect(server.db.prepare('SELECT round_id FROM horse_purchases WHERE horse = 2').get()).toEqual({ round_id: round });
    expect(
      server.db.prepare("SELECT DISTINCT round_id FROM coin_transactions WHERE kind = 'horse_buy' AND note LIKE 'horse:2 %'").all(),
    ).toEqual([{ round_id: round }]);

    expect(await hostDo('host:startRace')).toEqual({ ok: true });
    expect(await buy('carla', 3, null)).toEqual({ ok: false, error: 'No se puede durante la carrera' });
    expect(ownerOf(3)).toBeNull();
    await hostT.waitFor((s) => s.phase === 'finished');
    expect(await buy('carla', 3, null)).toEqual({ ok: true });
    invariant();
  });

  it('la apuesta activa ya está descontada del saldo disponible', async () => {
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await emitAck(players.beto.socket, 'bet:place', { horse: 1, amount: 40 })).toEqual({ ok: true });
    expect(await buy('beto', 2, null)).toEqual({ ok: false, error: 'Saldo insuficiente' });
    expect(await emitAck(players.beto.socket, 'bet:place', { horse: 1, amount: 30 })).toEqual({ ok: true });
    expect(await buy('beto', 2, null)).toEqual({ ok: true });
    expect(balance('beto')).toBe(0);
    invariant();
  });

  it('comprar en fase de apuestas sube el pozo y recalcula los multiplicadores en vivo', async () => {
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await emitAck(players.ana.socket, 'bet:place', { horse: 1, amount: 20 })).toEqual({ ok: true });
    expect(await emitAck(players.beto.socket, 'bet:place', { horse: 2, amount: 20 })).toEqual({ ok: true });
    await hostT.waitFor((s) => s.pot === 40);
    expect(await buy('carla', 4, null)).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => s.pot === 70);
    expect(h.carry).toBe(30);
    const ana = await players.ana.t.waitFor((s) => s.odds.find((o) => o.horse === 1)?.multiplier === 3.5);
    expect(ana.horseDefs[3].owner).toBe('carla');
    invariant();
  });
});
