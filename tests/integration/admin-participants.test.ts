import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkInvariant } from '../../server/db';
import { createRace, stepRace } from '../../server/domain/race';
import type { HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

const SEED = 7;
let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
const ids: Record<string, number> = {};

const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const idOf = (username: string) =>
  (server.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number }).id;
const logRows = () => server.db.prepare('SELECT * FROM admin_log ORDER BY id').all() as Record<string, unknown>[];

function winnerOf(seed: number) {
  let s = createRace(seed);
  while (!s.finished) s = stepRace(s);
  return s.winner!;
}

async function join(username: string, password = 'pw') {
  const socket = await server.connectAs((await server.login(username, password)).cookie);
  const t = track<PlayerState>(socket);
  await t.waitFor();
  return { socket, t };
}

beforeEach(async () => {
  server = await startTestServer({ seedFn: () => SEED });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  for (const u of ['ana', 'beto', 'carla', 'dani', 'eva']) {
    await server.login(u, 'pw');
    ids[u] = idOf(u);
  }
  await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 100 });
});

afterEach(async () => {
  await server.close();
});

describe('lista de participantes', () => {
  it('lista a los jugadores vivos por nombre, sin el host, y los nuevos quedan activos (US1-3)', async () => {
    await join('Zoe');
    const h = await hostT.waitFor((s) => s.participants.length === 6);
    expect(h.participants.map((p) => p.username)).toEqual(['ana', 'beto', 'carla', 'dani', 'eva', 'Zoe']);
    expect(h.participants.every((p) => p.active)).toBe(true);
    expect(h.participants[0]).toEqual({
      id: ids.ana,
      username: 'ana',
      score: 0,
      balance: 100,
      online: false,
      active: true,
      hasActiveBet: false,
    });
  });
});

describe('participantes activos', () => {
  it('solo los activos aparecen en el leaderboard, con el mismo orden (US1-1) y vuelven intactos (US1-2)', async () => {
    expect(await hostDo('admin:setActive', { userId: ids.beto, active: false })).toEqual({ ok: true });
    expect(await hostDo('admin:setActive', { userId: ids.dani, active: false })).toEqual({ ok: true });
    let h = await hostT.waitFor((s) => s.leaderboard.length === 3);
    expect(h.leaderboard.map((r) => r.username)).toEqual(['ana', 'carla', 'eva']);
    expect(h.participants.find((p) => p.id === ids.beto)?.active).toBe(false);

    await hostDo('admin:setActive', { userId: ids.beto, active: true });
    h = await hostT.waitFor((s) => s.leaderboard.length === 4);
    expect(h.leaderboard.map((r) => r.username)).toEqual(['ana', 'beto', 'carla', 'eva']);
    expect(logRows().map((r) => [r.action, r.before, r.after])).toEqual([
      ['set_active', '{"active":true}', '{"active":false}'],
      ['set_active', '{"active":true}', '{"active":false}'],
      ['set_active', '{"active":false}', '{"active":true}'],
    ]);
  });

  it('desactivar a todos deja el leaderboard vacío', async () => {
    for (const u of Object.keys(ids)) await hostDo('admin:setActive', { userId: ids[u], active: false });
    const h = await hostT.waitFor((s) => s.participants.every((p) => !p.active));
    expect(h.leaderboard).toEqual([]);
  });

  it('un inactivo apuesta y cobra, pero no tiene posición propia; el total cuenta solo activos (US1-8)', async () => {
    const ana = await join('ana');
    const carla = await join('carla');
    await hostDo('admin:setActive', { userId: ids.ana, active: false });
    await hostDo('host:openRound');
    expect(await emitAck(ana.socket, 'bet:place', { horse: winnerOf(SEED), amount: 10 })).toEqual({ ok: true });
    await hostDo('host:startRace');
    const a = await ana.t.waitFor((s) => s.phase === 'finished');
    expect(a.myResult?.won).toBe(true);
    expect(a.myResult?.payout).toBe(10);
    expect(a.myRank).toBeNull();
    const c = await carla.t.waitFor((s) => s.phase === 'finished');
    expect(c.myRank?.total).toBe(4);
    const h = await hostT.waitFor((s) => s.phase === 'finished');
    expect(h.leaderboard.map((r) => r.username)).not.toContain('ana');
    expect(h.participants.find((p) => p.id === ids.ana)?.score).toBe(1);
  });

  it('rechaza valores inválidos y jugadores inexistentes', async () => {
    expect(await hostDo('admin:setActive', { userId: ids.ana, active: 'no' })).toEqual({ ok: false, error: 'Valor inválido' });
    expect(await hostDo('admin:setActive', { userId: 9999, active: false })).toEqual({
      ok: false,
      error: 'Jugador no encontrado',
    });
    expect(await hostDo('admin:setActive', { userId: idOf('hosttt'), active: false })).toEqual({
      ok: false,
      error: 'Jugador no encontrado',
    });
  });
});

describe('renombrar (US1-4)', () => {
  it('conserva contraseña, saldo e historial; el nombre viejo ya no entra a esa cuenta', async () => {
    const ana = await join('ana');
    expect(await hostDo('admin:rename', { userId: ids.ana, username: 'anita' })).toEqual({ ok: true });
    // el celular conectado ve el nombre nuevo sin cerrar sesión
    const s = await ana.t.waitFor((x) => x.username === 'anita');
    expect(s.balance).toBe(100);
    expect(ana.socket.connected).toBe(true);

    const again = await server.login('anita', 'pw');
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    const old = await server.login('ana', 'pw');
    expect(old.body.created).toBe(true);
    expect(idOf('ana')).not.toBe(ids.ana);
    expect(logRows().at(-1)).toMatchObject({ action: 'rename', before: '{"username":"ana"}', after: '{"username":"anita"}' });
  });

  it('rechaza nombres en uso (sin distinguir mayúsculas) e inválidos; permite cambiar mayúsculas propias', async () => {
    expect(await hostDo('admin:rename', { userId: ids.ana, username: 'Beto' })).toEqual({
      ok: false,
      error: 'Ese nombre ya está en uso',
    });
    expect(await hostDo('admin:rename', { userId: ids.ana, username: 'HOSTTT' })).toEqual({
      ok: false,
      error: 'Ese nombre ya está en uso',
    });
    for (const bad of ['a', 'a b', '#x123', 42]) {
      expect(await hostDo('admin:rename', { userId: ids.ana, username: bad })).toEqual({
        ok: false,
        error: 'El usuario debe tener entre 3 y 20 caracteres: letras, números, _ o -',
      });
    }
    expect(await hostDo('admin:rename', { userId: ids.ana, username: 'Ana' })).toEqual({ ok: true });
    expect(idOf('Ana')).toBe(ids.ana);
  });
});

describe('restablecer contraseña (US1-5)', () => {
  it('la nueva sirve, la anterior no y las sesiones abiertas se cierran', async () => {
    const beto = await join('beto');
    const ended = new Promise((resolve) => beto.socket.once('session:ended', resolve));
    const closed = new Promise((resolve) => beto.socket.once('disconnect', resolve));
    expect(await hostDo('admin:resetPassword', { userId: ids.beto, password: 'nueva' })).toEqual({ ok: true });
    expect(await ended).toEqual({ reason: 'password_reset' });
    await closed;
    expect((await server.login('beto', 'pw')).status).toBe(401);
    expect((await server.login('beto', 'nueva')).status).toBe(200);
    expect(logRows().at(-1)).toMatchObject({ action: 'reset_password', target: `user:${ids.beto}`, before: null, after: null });
  });

  it('rechaza contraseña vacía', async () => {
    expect(await hostDo('admin:resetPassword', { userId: ids.beto, password: '' })).toEqual({
      ok: false,
      error: 'La contraseña no puede estar vacía',
    });
    expect((await server.login('beto', 'pw')).status).toBe(200);
  });

  it('las acciones de admin no crean ni destruyen monedas', async () => {
    await hostDo('admin:setActive', { userId: ids.ana, active: false });
    await hostDo('admin:rename', { userId: ids.beto, username: 'roberto' });
    await hostDo('admin:resetPassword', { userId: ids.carla, password: 'x' });
    expect(checkInvariant(server.db)).toBe(true);
  });
});
