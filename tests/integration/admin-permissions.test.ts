import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer } from '../helpers/server';

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

const snapshot = () => ({
  users: server.db.prepare('SELECT * FROM users ORDER BY id').all(),
  horses: server.db.prepare('SELECT * FROM horses ORDER BY number').all(),
  log: server.db.prepare('SELECT COUNT(*) AS c FROM admin_log').get(),
});

describe('permisos de administración (FR-002, US1-9)', () => {
  it('un jugador no puede ejecutar ninguna acción admin:*', async () => {
    await server.login('beto', 'pw');
    const anaSocket = await server.connectAs((await server.login('ana', 'pw')).cookie);
    const betoId = (server.db.prepare("SELECT id FROM users WHERE username = 'beto'").get() as { id: number }).id;
    const before = snapshot();
    const attempts: [string, unknown][] = [
      ['admin:setActive', { userId: betoId, active: false }],
      ['admin:rename', { userId: betoId, username: 'otro' }],
      ['admin:resetPassword', { userId: betoId, password: 'x' }],
      ['admin:removePlayer', { userId: betoId }],
      ['admin:updateHorse', { number: 1, name: 'Hackeado', color: 'peach', coat: 'pinto' }],
      ['admin:resetHorses', {}],
    ];
    for (const [event, payload] of attempts) {
      expect(await emitAck(anaSocket, event, payload)).toEqual({ ok: false, error: 'No autorizado' });
    }
    expect(snapshot()).toEqual(before);
  });

  it('el state del jugador no incluye la lista de participantes', async () => {
    const socket = await server.connectAs((await server.login('ana', 'pw')).cookie);
    const s = await track<PlayerState>(socket).waitFor();
    expect(s).not.toHaveProperty('participants');
  });
});
