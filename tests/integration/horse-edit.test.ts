import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkInvariant } from '../../server/db';
import { createRace, stepRace } from '../../server/domain/race';
import type { HorseNumber, HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

function winnerOf(seed: number): HorseNumber {
  let s = createRace(seed);
  while (!s.finished) s = stepRace(s);
  return s.winner!;
}

function seedWonBy(horse: HorseNumber): number {
  for (let seed = 1; ; seed++) if (winnerOf(seed) === horse) return seed;
}

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
let seed: number;
const players: Record<string, { socket: Socket; t: Tracker<PlayerState>; id: number }> = {};

const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const edit = (u: string, horse: number, name: unknown, dorsal: unknown, extra: object = {}) =>
  emitAck(players[u].socket, 'horse:edit', { horse, name, dorsal, ...extra });
const buy = (u: string, horse: number, expectedOwner: string | null = null) =>
  emitAck(players[u].socket, 'horse:buy', { horse, expectedOwner });

async function join(username: string, coins: number) {
  const { cookie } = await server.login(username, 'pw');
  const socket = await server.connectAs(cookie);
  const t = track<PlayerState>(socket);
  const { id } = server.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number };
  players[username] = { socket, t, id };
  await t.waitFor();
  expect(await hostDo('host:adjustBalance', { username, mode: 'add', value: coins })).toEqual({ ok: true });
}

/** Ronda en la que nadie apuesta y gana el caballo 3: el dueño cobra el 10 % del acumulado. */
async function ownedWin() {
  expect(await hostDo('host:openRound')).toEqual({ ok: true });
  expect(await hostDo('host:startRace')).toEqual({ ok: true });
  await hostT.waitFor((s) => s.phase === 'finished');
}

beforeEach(async () => {
  seed = seedWonBy(3);
  server = await startTestServer({ seedFn: () => seed });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  await join('ana', 100);
  await join('beto', 100);
  await players.beto.t.waitFor((s) => s.balance === 100);
  expect(await buy('ana', 3)).toEqual({ ok: true });
});

afterEach(async () => {
  await server.close();
});

describe('editar mis caballos (US3)', () => {
  it('el dueño cambia nombre y número; se ve en el host y en los celulares (US3-1)', async () => {
    expect(await edit('ana', 3, 'Trueno', 77)).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => s.horseDefs[2].name === 'Trueno');
    expect(h.horseDefs[2]).toMatchObject({ number: 3, dorsal: 77, owner: 'ana', color: 'yellow', coat: 'tordo' });
    expect((await players.beto.t.waitFor((s) => s.horseDefs[2].dorsal === 77)).horseDefs[2].name).toBe('Trueno');
    const log = server.db.prepare("SELECT actor_id, target, before, after FROM admin_log WHERE action = 'owner_edit_horse'").get();
    expect(log).toEqual({
      actor_id: players.ana.id,
      target: 'horse:3',
      before: '{"name":"Amarillo","dorsal":3}',
      after: '{"name":"Trueno","dorsal":77}',
    });
  });

  it('nombre y número únicos y en rango (US3-2, US3-3)', async () => {
    expect(await edit('ana', 3, 'Trueno', 5)).toEqual({ ok: false, error: 'Otro caballo ya usa ese número' });
    expect(await edit('ana', 3, 'rojo', 77)).toEqual({ ok: false, error: 'Otro caballo ya se llama así' });
    expect(await edit('ana', 3, 'x'.repeat(17), 77)).toMatchObject({ ok: false });
    expect(await edit('ana', 3, 'Trueno', 100)).toEqual({ ok: false, error: 'El número debe ser un entero de 1 a 99' });
    expect(await emitAck(players.ana.socket, 'horse:edit', null)).toMatchObject({ ok: false });
  });

  it('solo el dueño edita; nunca pelaje ni color (US3-4, US3-5)', async () => {
    expect(await edit('beto', 3, 'Trueno', 77)).toEqual({ ok: false, error: 'Solo el dueño puede editar este caballo' });
    expect(await edit('beto', 1, 'Trueno', 77)).toEqual({ ok: false, error: 'Solo el dueño puede editar este caballo' });
    expect(await hostDo('horse:edit', { horse: 3, name: 'Trueno', dorsal: 77 })).toMatchObject({ ok: false });
    expect(await edit('ana', 3, 'Trueno', 77, { color: 'red', coat: 'pinto' })).toEqual({ ok: true });
    expect(server.db.prepare('SELECT color, coat FROM horses WHERE number = 3').get()).toEqual({ color: 'yellow', coat: 'tordo' });
  });

  it('se puede editar en apuestas, no durante la carrera (US3-6)', async () => {
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await edit('ana', 3, 'Trueno', 77)).toEqual({ ok: true });
    server.db.prepare("UPDATE rounds SET phase = 'racing'").run();
    expect(await edit('ana', 3, 'Rayo', 8)).toEqual({ ok: false, error: 'No se puede durante la carrera' });
  });

  it('lo que le ha generado cada caballo, solo mientras fue suyo (US3-7, US3-8)', async () => {
    expect((await players.ana.t.waitFor((s) => s.myHorses.length === 1)).myHorses).toEqual([{ horse: 3, earned: 0 }]);
    await ownedWin(); // acumulado 30 ⇒ ana 3
    expect(await buy('beto', 1)).toEqual({ ok: true }); // acumulado 27 + 30 = 57
    await ownedWin(); // ⇒ ana 5
    const ana = await players.ana.t.waitFor((s) => s.myHorses[0]?.earned === 8);
    expect(ana.myHorses).toEqual([{ horse: 3, earned: 8 }]);

    expect(await buy('beto', 3, 'ana')).toEqual({ ok: true });
    const beto = await players.beto.t.waitFor((s) => s.myHorses.length === 2);
    expect(beto.myHorses).toEqual([
      { horse: 1, earned: 0 },
      { horse: 3, earned: 0 },
    ]);
    expect((await players.ana.t.waitFor((s) => s.myHorses.length === 0)).myHorses).toEqual([]);
    expect(checkInvariant(server.db)).toBe(true);
  });

  it('con la misma semilla, el resultado no depende de nombres, números ni dueños (SC-005)', async () => {
    expect(await edit('ana', 3, 'Trueno', 77)).toEqual({ ok: true });
    await ownedWin();
    const order = server.db.prepare("SELECT final_order FROM results WHERE status = 'final'").get() as { final_order: string };
    let s = createRace(seed);
    while (!s.finished) s = stepRace(s);
    expect(JSON.parse(order.final_order)[0]).toBe(3);
    expect(s.winner).toBe(3);
  });
});
