import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkInvariant, scoreOf } from '../../server/db';
import { createRace, stepRace } from '../../server/domain/race';
import type { HorseNumber, HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

const SEED = 12345;

function winnerOf(seed: number): HorseNumber {
  let s = createRace(seed);
  while (!s.finished) s = stepRace(s);
  return s.winner!;
}

const W = winnerOf(SEED);
const L1 = ((W % 6) + 1) as HorseNumber;
const L2 = ((L1 % 6) + 1) as HorseNumber;

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
const players: Record<string, { socket: Socket; t: Tracker<PlayerState>; id: number }> = {};

async function join(username: string) {
  const { cookie } = await server.login(username, 'pw');
  const socket = await server.connectAs(cookie);
  const t = track<PlayerState>(socket);
  const { id } = server.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number };
  players[username] = { socket, t, id };
  await t.waitFor();
}

const invariant = () => expect(checkInvariant(server.db)).toBe(true);
const bet = (u: string, horse: number, amount: number) => emitAck(players[u].socket, 'bet:place', { horse, amount });
const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);

beforeEach(async () => {
  server = await startTestServer({ seedFn: () => SEED });
  const { cookie } = await server.login('hosttt', '1231');
  host = await server.connectAs(cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  for (const u of ['ana', 'beto', 'carla', 'dani']) await join(u);
  for (const u of ['ana', 'beto', 'carla']) {
    expect(await hostDo('host:adjustBalance', { username: u, mode: 'add', value: 100 })).toEqual({ ok: true });
  }
  await players.carla.t.waitFor((s) => s.balance === 100);
  invariant();
});

afterEach(async () => {
  await server.close();
});

describe('ronda completa', () => {
  it('apostar, cambiar, correr y cobrar', async () => {
    expect(await bet('ana', W, 10)).toMatchObject({ ok: false });
    expect(hostT.latest()!.phase).toBe('idle');

    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await hostDo('host:openRound')).toMatchObject({ ok: false });
    await players.ana.t.waitFor((s) => s.phase === 'betting');

    expect(await bet('ana', W, 30)).toEqual({ ok: true });
    let ana = await players.ana.t.waitFor((s) => s.myBet !== null);
    expect(ana.balance).toBe(70);
    expect(ana.myBet).toEqual({ horse: W, amount: 30, potentialPayout: 30 });
    invariant();

    expect(await bet('beto', L1, 10)).toEqual({ ok: true });
    expect(await bet('carla', W, 20)).toEqual({ ok: true });
    invariant();

    // cambio de apuesta: devuelve 10 y cobra 20 en un paso
    expect(await bet('beto', L2, 20)).toEqual({ ok: true });
    const beto = await players.beto.t.waitFor((s) => s.myBet?.horse === L2);
    expect(beto.balance).toBe(80);
    expect(beto.myBet!.amount).toBe(20);
    const txs = server.db
      .prepare("SELECT kind, amount FROM coin_transactions WHERE user_id = ? AND kind <> 'host_adjust' ORDER BY id")
      .all(players.beto.id);
    expect(txs).toEqual([
      { kind: 'bet_place', amount: -10 },
      { kind: 'bet_refund', amount: 10 },
      { kind: 'bet_place', amount: -20 },
    ]);
    invariant();

    // rechazos
    for (const [horse, amount] of [
      [W, 0],
      [W, 1.5],
      [7, 10],
      [0, 10],
      [W, -5],
      [W, 101],
    ]) {
      const ack = await bet('ana', horse, amount);
      expect(ack.ok).toBe(false);
      expect(typeof (ack as { error: string }).error).toBe('string');
    }
    expect(await emitAck(players.ana.socket, 'bet:place', { horse: 'x', amount: '5' })).toMatchObject({ ok: false });
    expect(await emitAck(players.ana.socket, 'bet:place', null)).toMatchObject({ ok: false });
    expect(await hostDo('bet:place', { horse: W, amount: 1 })).toMatchObject({ ok: false });
    invariant();

    // pozo 70, total al ganador 50 ⇒ ana 42, carla 28
    ana = await players.ana.t.waitFor((s) => s.odds.find((o) => o.horse === W)?.total === 50 && s.odds.some((o) => o.horse === L2 && o.total === 20));
    expect(ana.myBet!.potentialPayout).toBe(42);
    const carla = await players.carla.t.waitFor((s) => s.myBet?.potentialPayout === 28);
    expect(carla.odds).toHaveLength(6);
    expect(carla.odds.find((o) => o.horse === W)).toEqual({ horse: W, total: 50, bettors: 2, multiplier: 70 / 50 });
    expect(JSON.stringify(carla)).not.toMatch(/ana|beto/);

    let h = await hostT.waitFor((s) => s.pot === 70);
    expect(h.carry).toBe(0);
    expect(h.horses.find((x) => x.horse === W)!.bets).toEqual(
      expect.arrayContaining([
        { username: 'ana', amount: 30, potentialPayout: 42 },
        { username: 'carla', amount: 20, potentialPayout: 28 },
      ]),
    );

    // carrera
    expect(await hostDo('host:startRace')).toEqual({ ok: true });
    expect(await hostDo('host:startRace')).toMatchObject({ ok: false });
    expect(await bet('ana', W, 30)).toMatchObject({ ok: false });
    const racing = await players.beto.t.waitFor((s) => s.phase === 'racing');
    expect(racing.odds).toEqual([]);
    h = await hostT.waitFor((s) => s.phase === 'racing' && s.race !== null);
    expect(h.race!.positions).toEqual({ 1: expect.any(Number), 2: expect.any(Number), 3: expect.any(Number), 4: expect.any(Number), 5: expect.any(Number), 6: expect.any(Number) });
    invariant();

    h = await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    expect(h.result!.winner).toBe(W);
    expect(h.race!.order[0]).toBe(W);
    expect(h.race!.positions[W]).toBe(40);
    expect(h.result!.carriedOver).toBe(0);
    expect(h.result!.winners).toEqual(
      expect.arrayContaining([
        { username: 'ana', payout: 42 },
        { username: 'carla', payout: 28 },
      ]),
    );
    invariant();

    const anaEnd = await players.ana.t.waitFor((s) => s.phase === 'finished');
    expect(anaEnd.myResult).toEqual({ participated: true, horse: W, won: true, payout: 42, winner: W });
    expect(anaEnd.balance).toBe(112);
    const betoEnd = await players.beto.t.waitFor((s) => s.phase === 'finished');
    expect(betoEnd.myResult).toEqual({ participated: true, horse: L2, won: false, payout: 0, winner: W });
    expect(betoEnd.balance).toBe(80);
    const daniEnd = await players.dani.t.waitFor((s) => s.phase === 'finished');
    expect(daniEnd.myResult).toEqual({ participated: false, horse: null, won: false, payout: 0, winner: W });

    expect(scoreOf(server.db, players.ana.id)).toBe(1);
    expect(scoreOf(server.db, players.carla.id)).toBe(1);
    expect(scoreOf(server.db, players.beto.id)).toBe(0);

    const result = server.db.prepare('SELECT * FROM results').get() as Record<string, unknown>;
    expect(result).toMatchObject({ seed: SEED, status: 'final', winner_horse: W });
    expect(JSON.parse(result.final_order as string)[0]).toBe(W);
  });

  it('ronda sin acertantes pasa al acumulado y la siguiente lo incluye', async () => {
    await hostDo('host:openRound');
    expect(await bet('ana', L1, 10)).toEqual({ ok: true });
    expect(await bet('beto', L2, 5)).toEqual({ ok: true });
    await hostDo('host:startRace');
    let h = await hostT.waitFor((s) => s.phase === 'finished', 10_000);
    expect(h.result!.winners).toEqual([]);
    expect(h.result!.carriedOver).toBe(15);
    invariant();

    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    h = await hostT.waitFor((s) => s.phase === 'betting');
    expect(h.carry).toBe(15);
    expect(h.pot).toBe(15);
    const carla = await players.carla.t.waitFor((s) => s.phase === 'betting');
    expect(carla.odds.every((o) => o.multiplier === null)).toBe(true);

    expect(await bet('carla', W, 5)).toEqual({ ok: true });
    const c = await players.carla.t.waitFor((s) => s.myBet !== null);
    expect(c.myBet!.potentialPayout).toBe(20);
    await hostDo('host:startRace');
    h = await hostT.waitFor((s) => s.phase === 'finished' && s.roundId !== null && s.result?.winners.length === 1, 10_000);
    expect(h.result!.winners).toEqual([{ username: 'carla', payout: 20 }]);
    expect(h.carry).toBe(15);
    invariant();

    const end = await players.carla.t.waitFor((s) => s.phase === 'finished' && s.myResult?.won === true);
    expect(end.balance).toBe(115);

    const carryRows = server.db
      .prepare("SELECT kind, amount FROM coin_transactions WHERE user_id IS NULL ORDER BY id")
      .all();
    expect(carryRows).toEqual([
      { kind: 'carry_in', amount: 15 },
      { kind: 'carry_out', amount: -15 },
    ]);
    const zero = server.db.prepare('SELECT COUNT(*) AS c FROM coin_transactions WHERE amount = 0').get() as { c: number };
    expect(zero.c).toBe(0);

    // otra ronda sin apuestas y sin acumulado: no se insertan movimientos de 0
    await hostDo('host:openRound');
    await hostDo('host:startRace');
    h = await hostT.waitFor((s) => s.phase === 'finished' && s.pot === 0, 10_000);
    expect(h.result!.carriedOver).toBe(0);
    expect(server.db.prepare('SELECT COUNT(*) AS c FROM coin_transactions WHERE user_id IS NULL').get()).toEqual({ c: 2 });
    invariant();
  });

  it('host:adjustBalance fija, suma y resta con validaciones', async () => {
    expect(await hostDo('host:adjustBalance', { username: 'ANA', mode: 'set', value: 50 })).toEqual({ ok: true });
    await players.ana.t.waitFor((s) => s.balance === 50);
    expect(await hostDo('host:adjustBalance', { username: 'ana', mode: 'subtract', value: 20 })).toEqual({ ok: true });
    await players.ana.t.waitFor((s) => s.balance === 30);
    expect(await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 5 })).toEqual({ ok: true });
    await players.ana.t.waitFor((s) => s.balance === 35);

    expect(await hostDo('host:adjustBalance', { username: 'ana', mode: 'subtract', value: 36 })).toEqual({
      ok: false,
      error: 'El saldo no puede quedar negativo',
    });
    expect(await hostDo('host:adjustBalance', { username: 'nadie', mode: 'add', value: 5 })).toEqual({
      ok: false,
      error: 'Jugador no encontrado',
    });
    expect(await hostDo('host:adjustBalance', { username: 'hosttt', mode: 'add', value: 5 })).toEqual({
      ok: false,
      error: 'Jugador no encontrado',
    });
    for (const value of [-1, 1.5, 'x']) {
      expect((await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value })).ok).toBe(false);
    }
    expect((await hostDo('host:adjustBalance', { username: 'ana', mode: 'multiply', value: 2 })).ok).toBe(false);

    // set al mismo saldo no inserta fila
    const before = server.db.prepare('SELECT COUNT(*) AS c FROM coin_transactions').get();
    expect(await hostDo('host:adjustBalance', { username: 'ana', mode: 'set', value: 35 })).toEqual({ ok: true });
    expect(server.db.prepare('SELECT COUNT(*) AS c FROM coin_transactions').get()).toEqual(before);

    const notes = server.db
      .prepare("SELECT note, amount FROM coin_transactions WHERE user_id = ? ORDER BY id")
      .all(players.ana.id);
    expect(notes).toEqual([
      { note: 'add 100', amount: 100 },
      { note: 'set 50', amount: -50 },
      { note: 'subtract 20', amount: -20 },
      { note: 'add 5', amount: 5 },
    ]);

    // permitido en cualquier fase, también con apuesta activa
    await hostDo('host:openRound');
    await bet('ana', W, 30);
    expect(await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 10 })).toEqual({ ok: true });
    await players.ana.t.waitFor((s) => s.balance === 15);
    invariant();
  });

  it('los jugadores no pueden ejecutar acciones de host', async () => {
    for (const ev of ['host:openRound', 'host:startRace', 'host:adjustBalance']) {
      expect(await emitAck(players.ana.socket, ev, { username: 'ana', mode: 'add', value: 1000 })).toEqual({
        ok: false,
        error: 'No autorizado',
      });
    }
    expect(server.db.prepare('SELECT COUNT(*) AS c FROM rounds').get()).toEqual({ c: 0 });
  });
});
