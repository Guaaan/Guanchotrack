import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_HORSES } from '../../shared/horses';
import type { HostState, PlayerState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer, type Tracker } from '../helpers/server';

let server: TestServer;
let host: Socket;
let hostT: Tracker<HostState>;
let dir: string | null = null;

const hostDo = (event: string, payload: unknown = {}) => emitAck(host, event, payload);
const PHASE_ERROR = { ok: false, error: 'Solo se pueden editar los caballos sin ronda en curso' };
const RELAMPAGO = { number: 3, name: 'Relámpago', color: 'lavender', coat: 'pinto' };

async function start(opts: Parameters<typeof startTestServer>[0] = {}) {
  server = await startTestServer({ seedFn: () => 5, ...opts });
  host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
  hostT = track<HostState>(host);
  await hostT.waitFor();
}

/** Ronda completa sin apuestas; devuelve el orden final guardado. */
async function runRace(): Promise<string> {
  await hostDo('host:openRound');
  await hostDo('host:startRace');
  const h = await hostT.waitFor((s) => s.phase === 'finished');
  return (server.db.prepare('SELECT final_order FROM results WHERE round_id = ?').get(h.roundId) as { final_order: string })
    .final_order;
}

afterEach(async () => {
  await server.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('personalizar caballos', () => {
  it('el cambio llega al host y a los celulares (US2-1)', async () => {
    await start();
    const ana = await server.connectAs((await server.login('ana', 'pw')).cookie);
    const anaT = track<PlayerState>(ana);
    await anaT.waitFor();
    expect(await hostDo('admin:updateHorse', RELAMPAGO)).toEqual({ ok: true });
    const expected = { ...RELAMPAGO, numberColor: 'white' };
    expect((await hostT.waitFor((s) => s.horseDefs[2].name === 'Relámpago')).horseDefs[2]).toEqual(expected);
    expect((await anaT.waitFor((s) => s.horseDefs[2].name === 'Relámpago')).horseDefs[2]).toEqual(expected);
    const log = server.db.prepare("SELECT * FROM admin_log WHERE action = 'update_horse'").get() as Record<string, unknown>;
    expect(log).toMatchObject({
      target: 'horse:3',
      before: '{"name":"Amarillo","color":"yellow","coat":"tordo"}',
      after: '{"name":"Relámpago","color":"lavender","coat":"pinto"}',
    });
  });

  it('rechaza un color usado por otro caballo (US2-2) y datos inválidos', async () => {
    await start();
    expect(await hostDo('admin:updateHorse', { ...RELAMPAGO, color: 'blue' })).toEqual({
      ok: false,
      error: 'Otro caballo ya usa ese color',
    });
    expect(await hostDo('admin:updateHorse', { ...RELAMPAGO, color: 'brown' })).toEqual({
      ok: false,
      error: 'Color no permitido',
    });
    expect(server.db.prepare('SELECT name FROM horses WHERE number = 3').get()).toEqual({ name: 'Amarillo' });
  });

  it('solo sin ronda en curso: rechaza en apuestas y en carrera, acepta al terminar (US2-4)', async () => {
    await start({ tickMs: 5 });
    await hostDo('host:openRound');
    expect(await hostDo('admin:updateHorse', RELAMPAGO)).toEqual(PHASE_ERROR);
    expect(await hostDo('admin:resetHorses')).toEqual(PHASE_ERROR);
    await hostDo('host:startRace');
    // la carrera dura cientos de ticks: justo después de iniciar sigue en curso
    expect(server.game.phase()).toBe('racing');
    expect(await hostDo('admin:updateHorse', RELAMPAGO)).toEqual(PHASE_ERROR);
    await hostT.waitFor((s) => s.phase === 'finished', 4000);
    expect(await hostDo('admin:updateHorse', RELAMPAGO)).toEqual({ ok: true });
  });

  it('con la misma semilla el resultado no depende de la personalización (US2-5, SC-004)', async () => {
    await start();
    const before = await runRace();
    const custom = [
      { number: 1, name: 'Uno', color: 'peach', coat: 'palomino' },
      { number: 2, name: 'Dos', color: 'black', coat: 'tordo' },
      { number: 3, name: 'Tres', color: 'white', coat: 'castano' },
      { number: 4, name: 'Cuatro', color: 'dark-purple', coat: 'pinto' },
      { number: 5, name: 'Cinco', color: 'lavender', coat: 'castano' },
      { number: 6, name: 'Seis', color: 'light-grey', coat: 'pinto' },
    ];
    for (const h of custom) expect(await hostDo('admin:updateHorse', h)).toEqual({ ok: true });
    expect(await runRace()).toBe(before);
  });

  it('restablecer vuelve a los valores por defecto (US2-6)', async () => {
    await start();
    await hostDo('admin:updateHorse', RELAMPAGO);
    expect(await hostDo('admin:resetHorses')).toEqual({ ok: true });
    const h = await hostT.waitFor((s) => s.horseDefs[2].name === 'Amarillo');
    expect(h.horseDefs).toEqual(DEFAULT_HORSES);
    expect(server.db.prepare("SELECT COUNT(*) AS c FROM admin_log WHERE action = 'reset_horses'").get()).toEqual({ c: 1 });
  });

  it('la personalización persiste tras reiniciar el servidor (US2-7)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'gt-horses-'));
    const dbPath = join(dir, 'gt.db');
    await start({ dbPath });
    await hostDo('admin:updateHorse', RELAMPAGO);
    await server.close();
    await start({ dbPath });
    expect(hostT.latest()?.horseDefs[2]).toEqual({ ...RELAMPAGO, numberColor: 'white' });
  });
});
