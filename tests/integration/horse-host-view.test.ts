import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
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
let dir: string | null = null;
const players: Record<string, { socket: Socket; t: Tracker<PlayerState>; id: number }> = {};

const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const buy = (u: string, horse: number, expectedOwner: string | null = null) =>
  emitAck(players[u].socket, 'horse:buy', { horse, expectedOwner });

async function start(opts: Parameters<typeof startTestServer>[0] = {}) {
  server = await startTestServer({ seedFn: () => seedWonBy(2), ...opts });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
}

async function join(username: string, coins: number) {
  const { cookie } = await server.login(username, 'pw');
  const socket = await server.connectAs(cookie);
  const t = track<PlayerState>(socket);
  const { id } = server.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number };
  players[username] = { socket, t, id };
  await t.waitFor();
  if (coins) expect(await hostDo('host:adjustBalance', { username, mode: 'add', value: coins })).toEqual({ ok: true });
}

afterEach(async () => {
  await server.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('dueños en la pantalla del host (US4)', () => {
  it('historial de compras: más reciente primero, con nombre y número de ese momento (US4-4, FR-031)', async () => {
    await start();
    await join('ana', 100);
    await join('beto', 100);
    await join('carla', 100);
    expect(await buy('ana', 2)).toEqual({ ok: true });
    expect(await emitAck(players.ana.socket, 'horse:edit', { horse: 2, name: 'Trueno', dorsal: 77 })).toEqual({ ok: true });
    expect(await buy('beto', 2, 'ana')).toEqual({ ok: true });
    expect(await buy('carla', 4)).toEqual({ ok: true });
    expect(await emitAck(players.beto.socket, 'horse:edit', { horse: 2, name: 'Rayo', dorsal: 8 })).toEqual({ ok: true });

    const h = await hostT.waitFor((s) => s.purchases.length === 3 && s.horseDefs[1].name === 'Rayo');
    expect(h.purchases.map(({ at: _at, ...p }) => p)).toEqual([
      { horse: 4, name: 'Verde', dorsal: 4, buyer: 'carla', seller: null, price: 30 },
      { horse: 2, name: 'Trueno', dorsal: 77, buyer: 'beto', seller: 'ana', price: 50 },
      { horse: 2, name: 'Naranjo', dorsal: 2, buyer: 'ana', seller: null, price: 30 },
    ]);
    expect(h.purchases.every((p) => typeof p.at === 'number')).toBe(true);
    expect(JSON.stringify(players.ana.t.latest())).not.toContain('purchases');

    // las cuentas eliminadas aparecen anonimizadas
    expect(await hostDo('admin:removePlayer', { userId: players.ana.id })).toEqual({ ok: true });
    const after = await hostT.waitFor((s) => s.purchases[1]?.seller === '(eliminado)');
    expect(after.purchases[2].buyer).toBe('(eliminado)');
    expect(JSON.stringify(after.purchases)).not.toContain('#deleted');
  });

  it('el resultado muestra cuánto recibió el dueño del ganador y sobrevive a un reinicio (US4-3, FR-030)', async () => {
    dir = mkdtempSync(joinPath(tmpdir(), 'gt-owner-'));
    const dbPath = joinPath(dir, 'gt.db');
    await start({ dbPath });
    await join('ana', 100);
    await join('beto', 100);
    expect(await buy('ana', 2)).toEqual({ ok: true }); // acumulado 30
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await emitAck(players.beto.socket, 'bet:place', { horse: 2, amount: 70 })).toEqual({ ok: true });
    expect(await hostDo('host:startRace')).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => s.phase === 'finished');
    expect(h.result!.winner).toBe(2);
    expect(h.result!.owner).toEqual({ username: 'ana', share: 10 });
    expect(h.result!.winners).toEqual([{ username: 'beto', payout: 90 }]);

    await server.close();
    await start({ dbPath });
    expect(hostT.latest()!.result!.owner).toEqual({ username: 'ana', share: 10 });
  });

  it('ganador sin dueño: result.owner es null', async () => {
    await start();
    await join('beto', 100);
    expect(await hostDo('host:openRound')).toEqual({ ok: true });
    expect(await emitAck(players.beto.socket, 'bet:place', { horse: 2, amount: 70 })).toEqual({ ok: true });
    expect(await hostDo('host:startRace')).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => s.phase === 'finished');
    expect(h.result!.owner).toBeNull();
  });
});
