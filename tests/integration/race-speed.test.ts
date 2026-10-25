import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkInvariant } from '../../server/db';
import type { HostState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

// Semilla con photo finish (caballos 1 y 6 empatan en la meta): compara también el desempate.
const SEED = 12;
const TEST_SPEEDS = { normal: 8, fast: 4, turbo: 2 };

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
let ana: Socket;

const results = () =>
  server.db.prepare('SELECT speed, status, winner_horse, final_order, photo_finish, ticks FROM results ORDER BY id').all() as {
    speed: string;
    status: string;
    winner_horse: number;
    final_order: string;
    photo_finish: string | null;
    ticks: number;
  }[];
const hostDo = (event: string, payload?: unknown) => emitAck(host, event, payload ?? {});

beforeEach(async () => {
  // `tickMs: undefined` anula el intervalo único de 1 ms del harness para que cada velocidad use el suyo.
  server = await startTestServer({ tickMs: undefined, tickMsBySpeed: TEST_SPEEDS, seedFn: () => SEED });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
  ana = await server.connectAs((await server.login('ana', 'pw')).cookie);
  await hostDo('host:adjustBalance', { username: 'ana', mode: 'add', value: 100 });
  await hostDo('host:openRound');
  await emitAck(ana, 'bet:place', { horse: 6, amount: 20 });
});

afterEach(async () => {
  await server.close();
});

describe('velocidad de carrera (FR-009a)', () => {
  it('sin velocidad corre en Normal y lo registra', async () => {
    expect(await hostDo('host:startRace')).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => s.phase === 'racing' && s.race !== null);
    expect(h.race!.speed).toBe('normal');
    expect(h.race!.tickMs).toBe(8);
    expect(results()[0].speed).toBe('normal');
  });

  it.each([
    ['fast', 4],
    ['turbo', 2],
    ['normal', 8],
  ] as const)('velocidad %s se usa y se guarda', async (speed, tickMs) => {
    expect(await hostDo('host:startRace', { speed })).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => s.phase === 'racing' && s.race !== null);
    expect(h.race!.speed).toBe(speed);
    expect(h.race!.tickMs).toBe(tickMs);
    expect(results()[0].speed).toBe(speed);
    const done = await hostT.waitFor((s) => s.phase === 'finished', 15_000);
    expect(done.race!.speed).toBe(speed);
  });

  it.each([['ultra'], [50], [null], [{}], ['Turbo']])('rechaza velocidad no permitida %j sin efectos', async (speed) => {
    expect(await hostDo('host:startRace', { speed })).toEqual({ ok: false, error: 'Velocidad no válida' });
    expect(results()).toEqual([]);
    expect(hostT.latest()!.phase).toBe('betting');
    expect(server.db.prepare('SELECT phase FROM rounds').get()).toEqual({ phase: 'betting' });
  });

  it('un jugador no puede iniciar la carrera ni elegir velocidad', async () => {
    expect(await emitAck(ana, 'host:startRace', { speed: 'turbo' })).toEqual({ ok: false, error: 'No autorizado' });
    expect(results()).toEqual([]);
  });

  it('no se puede cambiar la velocidad con la carrera en curso; tras reiniciar sí', async () => {
    await hostDo('host:startRace', { speed: 'normal' });
    await hostT.waitFor((s) => s.phase === 'racing');
    expect((await hostDo('host:startRace', { speed: 'turbo' })).ok).toBe(false);
    expect(results().map((r) => r.speed)).toEqual(['normal']);
    expect(hostT.latest()!.race?.speed ?? 'normal').toBe('normal');

    expect(await hostDo('host:resetRace')).toEqual({ ok: true });
    expect(await hostDo('host:startRace', { speed: 'turbo' })).toEqual({ ok: true });
    expect(results().map((r) => [r.status, r.speed])).toEqual([
      ['annulled', 'normal'],
      ['running', 'turbo'],
    ]);
    const h = await hostT.waitFor((s) => s.phase === 'racing' && s.race?.speed === 'turbo');
    expect(h.race!.tickMs).toBe(2);
  });

  it('photo finish: el resultado lista a los empatados y el orden final empieza por el ganador (FR-033)', async () => {
    await hostDo('host:startRace', { speed: 'turbo' });
    const h = await hostT.waitFor((s) => s.phase === 'finished', 15_000);
    const tied = h.result!.photoFinish!;
    const atFinish = (Object.entries(h.race!.positions) as [string, number][])
      .filter(([, square]) => square === 40)
      .map(([horse]) => Number(horse));
    expect(tied.map((t) => t.horse).sort()).toEqual(atFinish.sort());
    expect(tied.length).toBeGreaterThanOrEqual(2);
    expect(h.race!.order[0]).toBe(h.result!.winner);
    const byValue = [...tied].sort((a, b) => b.value - a.value).map((t) => t.horse);
    expect(h.race!.order.slice(0, tied.length)).toEqual(byValue);
  });

  it('misma semilla: Normal y Turbo dan el mismo resultado; Turbo tarda menos', async () => {
    let t0 = Date.now();
    await hostDo('host:startRace', { speed: 'normal' });
    await hostT.waitFor((s) => s.phase === 'finished', 20_000);
    const normalMs = Date.now() - t0;

    await hostDo('host:openRound');
    await emitAck(ana, 'bet:place', { horse: 6, amount: 20 });
    t0 = Date.now();
    await hostDo('host:startRace', { speed: 'turbo' });
    await hostT.waitFor((s) => s.phase === 'finished' && s.race?.speed === 'turbo', 20_000);
    const turboMs = Date.now() - t0;

    const [normal, turbo] = results();
    expect(normal.speed).toBe('normal');
    expect(turbo.speed).toBe('turbo');
    expect(turbo.winner_horse).toBe(normal.winner_horse);
    expect(turbo.final_order).toBe(normal.final_order);
    expect(turbo.photo_finish).toBe(normal.photo_finish);
    expect(turbo.photo_finish).not.toBeNull();
    expect(turbo.ticks).toBe(normal.ticks);
    expect(turboMs).toBeLessThan(normalMs);
    expect(checkInvariant(server.db)).toBe(true);
  }, 30_000);
});
