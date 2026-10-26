import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
let anaId: number;

const ana = (s: HostState) => s.participants.find((p) => p.id === anaId);

beforeEach(async () => {
  server = await startTestServer();
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  await server.login('ana', 'pw');
  anaId = (server.db.prepare("SELECT id FROM users WHERE username = 'ana'").get() as { id: number }).id;
});

afterEach(async () => {
  await server.close();
});

describe('lista de participantes en vivo (US3-3, SC-002)', () => {
  it('se actualiza en < 1 s al conectar, ajustar saldo, apostar y desconectar', async () => {
    const socket = await server.connectAs((await server.login('ana', 'pw')).cookie);
    expect(ana(await hostT.waitFor((s) => ana(s)?.online === true, 1000))?.online).toBe(true);

    await emitAck(host, 'host:adjustBalance', { username: 'ana', mode: 'add', value: 50 });
    expect(ana(await hostT.waitFor((s) => ana(s)?.balance === 50, 1000))?.balance).toBe(50);

    await emitAck(host, 'host:openRound');
    await emitAck(socket, 'bet:place', { horse: 2, amount: 10 });
    const h = await hostT.waitFor((s) => ana(s)?.hasActiveBet === true, 1000);
    expect(ana(h)).toMatchObject({ balance: 40, hasActiveBet: true });

    socket.disconnect();
    expect(ana(await hostT.waitFor((s) => ana(s)?.online === false, 1000))?.online).toBe(false);
  });

  it('con dos pantallas de host, el cambio de una llega a la otra', async () => {
    const second = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    const secondT = track<HostState>(second);
    await secondT.waitFor();
    expect(await emitAck(host, 'admin:setActive', { userId: anaId, active: false })).toEqual({ ok: true });
    const s = await secondT.waitFor((x) => ana(x)?.active === false, 1000);
    expect(s.leaderboard).toEqual([]);
  });
});
