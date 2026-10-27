import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balanceOf, carryBalance, checkInvariant } from '../../server/db';
import { createRace, stepRace } from '../../server/domain/race';
import type { HorseNumber, HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
let seeds: number[];
const ids: Record<string, number> = {};

const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const idOf = (username: string) =>
  (server.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined)?.id;
const txCount = () => (server.db.prepare('SELECT COUNT(*) AS c FROM coin_transactions').get() as { c: number }).c;

/** Monedas totales: saldos + apuestas activas + pozo acumulado. */
function totalCoins(): number {
  const { s } = server.db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions').get() as { s: number };
  const { a } = server.db.prepare("SELECT COALESCE(SUM(amount), 0) AS a FROM bets WHERE status = 'active'").get() as {
    a: number;
  };
  return s + a;
}

function winnerOf(seed: number): HorseNumber {
  let s = createRace(seed);
  while (!s.finished) s = stepRace(s);
  return s.winner!;
}

async function join(username: string) {
  const socket = await server.connectAs((await server.login(username, 'pw')).cookie);
  const t = track<PlayerState>(socket);
  await t.waitFor();
  return { socket, t };
}

/** Ronda en la que `username` apuesta `amount` a un caballo perdedor ⇒ todo al acumulado. */
async function losingRound(socket: Socket, amount: number) {
  await hostDo('host:openRound');
  const loser = winnerOf(seeds[0]) === 1 ? 2 : 1;
  await emitAck(socket, 'bet:place', { horse: loser, amount });
  await hostDo('host:startRace');
  await hostT.waitFor((s) => s.phase === 'finished');
}

beforeEach(async () => {
  seeds = [11, 12, 13, 14];
  let i = 0;
  server = await startTestServer({ seedFn: () => seeds[i++] });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  for (const u of ['ana', 'beto', 'carla']) {
    await server.login(u, 'pw');
    ids[u] = idOf(u)!;
  }
});

afterEach(async () => {
  await server.close();
});

describe('eliminar jugador', () => {
  it('se rechaza con apuesta activa y no cambia nada (US1-6)', async () => {
    const ana = await join('ana');
    await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 50 });
    await hostDo('host:openRound');
    await emitAck(ana.socket, 'bet:place', { horse: 1, amount: 10 });
    const h = await hostT.waitFor((s) => s.participants.find((p) => p.id === ids.ana)?.hasActiveBet === true);
    expect(h.participants.find((p) => p.id === ids.ana)?.hasActiveBet).toBe(true);
    const before = txCount();
    expect(await hostDo('admin:removePlayer', { userId: ids.ana })).toEqual({
      ok: false,
      error: 'No se puede eliminar: tiene una apuesta activa',
    });
    expect(txCount()).toBe(before);
    expect(idOf('ana')).toBe(ids.ana);
    expect(ana.socket.connected).toBe(true);
  });

  it('el saldo pasa al pozo acumulado, se cierra la sesión y el nombre queda libre (US1-7)', async () => {
    const carla = await join('carla');
    await hostDo('host:adjustBalance', { username: 'carla', mode: 'add', value: 20 });
    await losingRound(carla.socket, 20);
    expect(carryBalance(server.db)).toBe(20);

    const beto = await join('beto');
    await hostDo('host:adjustBalance', { username: 'beto', mode: 'add', value: 80 });
    const total = totalCoins();
    const ended = new Promise((resolve) => beto.socket.once('session:ended', resolve));

    expect(await hostDo('admin:removePlayer', { userId: ids.beto })).toEqual({ ok: true });
    expect(await ended).toEqual({ reason: 'removed' });
    expect(carryBalance(server.db)).toBe(100);
    expect(balanceOf(server.db, ids.beto)).toBe(0);
    expect(totalCoins()).toBe(total);
    expect(checkInvariant(server.db)).toBe(true);
    const legs = server.db
      .prepare("SELECT user_id, kind, amount FROM coin_transactions WHERE note LIKE 'remove%' ORDER BY id")
      .all();
    expect(legs).toEqual([
      { user_id: ids.beto, kind: 'carry_in', amount: -80 },
      { user_id: null, kind: 'carry_in', amount: 80 },
    ]);

    const h = await hostT.waitFor((s) => !s.participants.some((p) => p.id === ids.beto));
    expect(h.leaderboard.map((r) => r.username)).not.toContain('beto');

    // registrar de nuevo el nombre crea una cuenta nueva vacía
    const again = await server.login('beto', 'pw');
    expect(again.body.created).toBe(true);
    expect(idOf('beto')).not.toBe(ids.beto);
    expect(balanceOf(server.db, idOf('beto')!)).toBe(0);

    const log = server.db.prepare("SELECT * FROM admin_log WHERE action = 'remove_player'").get() as Record<string, unknown>;
    expect(log).toMatchObject({ target: `user:${ids.beto}`, before: '{"username":"beto","balance":80}', after: '{"carry":100}' });
  });

  it('en fase de apuestas recalcula pozo y multiplicadores en vivo', async () => {
    const ana = await join('ana');
    await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 30 });
    await hostDo('host:adjustBalance', { username: 'beto', mode: 'add', value: 30 });
    await hostDo('host:openRound');
    await emitAck(ana.socket, 'bet:place', { horse: 1, amount: 10 });
    await hostT.waitFor((s) => s.pot === 10);
    await hostDo('admin:removePlayer', { userId: ids.beto });
    const h = await hostT.waitFor((s) => s.pot === 40);
    expect(h.carry).toBe(30);
    expect(h.horses[0].multiplier).toBe(4);
    const a = await ana.t.waitFor((s) => s.myBet?.potentialPayout === 40);
    expect(a.odds[0].multiplier).toBe(4);
  });

  it('con saldo 0 no mueve monedas', async () => {
    const before = txCount();
    expect(await hostDo('admin:removePlayer', { userId: ids.carla })).toEqual({ ok: true });
    expect(txCount()).toBe(before);
    expect(checkInvariant(server.db)).toBe(true);
  });

  it('el historial queda anonimizado como "(eliminado)"', async () => {
    const ana = await join('ana');
    await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 10 });
    await hostDo('host:openRound');
    await emitAck(ana.socket, 'bet:place', { horse: winnerOf(seeds[0]), amount: 10 });
    await hostDo('host:startRace');
    await hostT.waitFor((s) => s.phase === 'finished');
    expect(await hostDo('admin:removePlayer', { userId: ids.ana })).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => !s.participants.some((p) => p.id === ids.ana));
    expect(h.result?.winners).toEqual([{ username: '(eliminado)', payout: 10 }]);
    expect(JSON.stringify(h)).not.toContain('#deleted');
    expect(checkInvariant(server.db)).toBe(true);
  });

  it('no encuentra al host, a ids inexistentes ni a cuentas ya eliminadas', async () => {
    const notFound = { ok: false, error: 'Jugador no encontrado' };
    expect(await hostDo('admin:removePlayer', { userId: idOf('hosttt') })).toEqual(notFound);
    expect(await hostDo('admin:removePlayer', { userId: 9999 })).toEqual(notFound);
    await hostDo('admin:removePlayer', { userId: ids.carla });
    expect(await hostDo('admin:removePlayer', { userId: ids.carla })).toEqual(notFound);
    expect(await hostDo('admin:rename', { userId: ids.carla, username: 'carla2' })).toEqual(notFound);
  });

  it('los caballos del eliminado vuelven al establo con su nombre y número (FR-034)', async () => {
    const beto = await join('beto');
    await hostDo('host:adjustBalance', { username: 'beto', mode: 'add', value: 60 });
    expect(await emitAck(beto.socket, 'horse:buy', { horse: 3, expectedOwner: null })).toEqual({ ok: true });
    server.db.prepare("UPDATE horses SET name = 'Trueno', dorsal = 77 WHERE number = 3").run();
    expect(await hostDo('admin:removePlayer', { userId: ids.beto })).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => !s.participants.some((p) => p.id === ids.beto));
    expect(h.horseDefs[2]).toMatchObject({ number: 3, name: 'Trueno', dorsal: 77, owner: null });
    // vuelve a costar 30, al establo
    const ana = await join('ana');
    await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 30 });
    expect(await emitAck(ana.socket, 'horse:buy', { horse: 3, expectedOwner: null })).toEqual({ ok: true });
    expect(balanceOf(server.db, ids.ana)).toBe(0);
    expect(checkInvariant(server.db)).toBe(true);
  });

  it('con una carrera en curso no se puede eliminar a un dueño, sí a quien no tiene caballos', async () => {
    const beto = await join('beto');
    await hostDo('host:adjustBalance', { username: 'beto', mode: 'add', value: 30 });
    expect(await emitAck(beto.socket, 'horse:buy', { horse: 1, expectedOwner: null })).toEqual({ ok: true });
    await hostDo('host:openRound');
    // ronda en carrera sin avanzar ticks: así sigue en curso al intentar eliminar
    server.db.prepare("UPDATE rounds SET phase = 'racing'").run();
    expect(await hostDo('admin:removePlayer', { userId: ids.beto })).toEqual({
      ok: false,
      error: 'No se puede eliminar a un dueño durante la carrera',
    });
    expect(idOf('beto')).toBe(ids.beto);
    expect(await hostDo('admin:removePlayer', { userId: ids.carla })).toEqual({ ok: true });
  });
});
