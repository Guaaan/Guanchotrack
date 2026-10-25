import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
let ana: Socket;
let anaT: Tracker<PlayerState>;

beforeEach(async () => {
  server = await startTestServer({ seedFn: () => 4242, tickMs: 5 });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  await server.login('beto', 'pw');
  ana = await server.connectAs((await server.login('ana', 'pw')).cookie);
  anaT = track<PlayerState>(ana);
  await anaT.waitFor();
  await emitAck(host, 'host:adjustBalance', { username: 'ana', mode: 'add', value: 100 });
});

afterEach(async () => {
  await server.close();
});

describe('orden de la carrera en el celular (FR-028b)', () => {
  it('null fuera de carrera; se actualiza solo cuando cambia el orden y termina igual que el host', async () => {
    expect((await anaT.waitFor((s) => s.balance === 100)).raceOrder).toBeNull();
    await emitAck(host, 'host:openRound');
    await emitAck(ana, 'bet:place', { horse: 3, amount: 10 });
    expect((await anaT.waitFor((s) => s.myBet !== null)).raceOrder).toBeNull();

    const playerOrders: string[] = [];
    let hostMessages = 0;
    ana.on('state', (s: PlayerState) => {
      if (s.phase === 'racing') playerOrders.push(JSON.stringify(s.raceOrder));
    });
    host.on('state', (s: HostState) => {
      if (s.phase === 'racing') hostMessages++;
    });

    await emitAck(host, 'host:startRace');
    const h = await hostT.waitFor((s) => s.phase === 'finished', 15_000);
    const end = await anaT.waitFor((s) => s.phase === 'finished');

    expect(playerOrders.length).toBeGreaterThan(3);
    for (const o of playerOrders) expect(JSON.parse(o).slice().sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < playerOrders.length; i++) expect(playerOrders[i]).not.toBe(playerOrders[i - 1]);
    expect(playerOrders.length).toBeLessThan(hostMessages);

    expect(end.raceOrder).toEqual(h.race!.order);
    expect(end.raceOrder![0]).toBe(h.result!.winner);
    expect(JSON.stringify(end)).not.toMatch(/beto|hosttt/);
  });

  it('tras reiniciar la carrera vuelve a null', async () => {
    await emitAck(host, 'host:openRound');
    await emitAck(host, 'host:startRace');
    await anaT.waitFor((s) => s.phase === 'racing' && s.raceOrder !== null);
    expect(await emitAck(host, 'host:resetRace')).toEqual({ ok: true });
    const s = await anaT.waitFor((x) => x.phase === 'betting');
    expect(s.raceOrder).toBeNull();
  });
});
