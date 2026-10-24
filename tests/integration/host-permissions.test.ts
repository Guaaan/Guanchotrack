import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitAck, startTestServer, type TestServer } from '../helpers/server';

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

const counts = () =>
  ['rounds', 'bets', 'coin_transactions', 'results'].map(
    (t) => (server.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c,
  );

describe('autorización de host (FR-038)', () => {
  it('un jugador no puede ejecutar ninguna acción de host, en ninguna fase', async () => {
    const host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    const ana = await server.connectAs((await server.login('ana', 'pw')).cookie);
    await emitAck(host, 'host:adjustBalance', { username: 'ana', mode: 'add', value: 50 });

    const events: [string, unknown][] = [
      ['host:openRound', {}],
      ['host:startRace', {}],
      ['host:resetRound', {}],
      ['host:resetRace', {}],
      ['host:adjustBalance', { username: 'ana', mode: 'add', value: 1000 }],
    ];
    const attempt = async () => {
      const before = counts();
      for (const [event, payload] of events) {
        expect(await emitAck(ana, event, payload)).toEqual({ ok: false, error: 'No autorizado' });
      }
      expect(counts()).toEqual(before);
    };

    await attempt(); // idle
    await emitAck(host, 'host:openRound');
    await emitAck(ana, 'bet:place', { horse: 1, amount: 10 });
    await attempt(); // betting
    await emitAck(host, 'host:startRace');
    await attempt(); // racing
  });

  it('el host no puede apostar', async () => {
    const host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    await emitAck(host, 'host:openRound');
    const before = counts();
    const ack = await emitAck(host, 'bet:place', { horse: 1, amount: 1 });
    expect(ack.ok).toBe(false);
    expect(counts()).toEqual(before);
  });
});
