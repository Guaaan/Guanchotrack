import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { balanceOf, checkInvariant } from '../../server/db';
import type { HostState } from '../../shared/types';
import { emitAck, startTestServer, track, type TestServer } from '../helpers/server';

let dir: string;
let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
  rmSync(dir, { recursive: true, force: true });
});

describe('recuperación tras reinicio del servidor (FR-041)', () => {
  it('una carrera en curso se anula y la ronda vuelve a betting con apuestas intactas', async () => {
    dir = mkdtempSync(join(tmpdir(), 'guanchotrack-'));
    const dbPath = join(dir, 'test.db');

    server = await startTestServer({ dbPath, tickMs: 1000 });
    const host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    const ana = await server.connectAs((await server.login('ana', 'pw')).cookie);
    await emitAck(host, 'host:adjustBalance', { username: 'ana', mode: 'add', value: 100 });
    await emitAck(host, 'host:openRound');
    await emitAck(ana, 'bet:place', { horse: 4, amount: 35 });
    expect(await emitAck(host, 'host:startRace')).toEqual({ ok: true });
    await server.close();

    server = await startTestServer({ dbPath, tickMs: 1 });
    const db = server.db;
    expect(db.prepare('SELECT phase FROM rounds').all()).toEqual([{ phase: 'betting' }]);
    expect(db.prepare('SELECT status FROM results').all()).toEqual([{ status: 'annulled' }]);
    expect(db.prepare('SELECT horse, amount, status FROM bets').all()).toEqual([{ horse: 4, amount: 35, status: 'active' }]);
    const anaId = (db.prepare("SELECT id FROM users WHERE username = 'ana'").get() as { id: number }).id;
    expect(balanceOf(db, anaId)).toBe(65);
    expect(checkInvariant(db)).toBe(true);

    // el host ve la ronda en apuestas y puede volver a correrla
    const host2 = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    const t = track<HostState>(host2);
    const h = await t.waitFor((s) => s.phase === 'betting');
    expect(h.pot).toBe(35);
    expect(h.race).toBeNull();
    expect(await emitAck(host2, 'host:startRace')).toEqual({ ok: true });
    await t.waitFor((s) => s.phase === 'finished', 10_000);
    expect(checkInvariant(db)).toBe(true);
  });

  it('los saldos y las cuentas sobreviven al reinicio', async () => {
    dir = mkdtempSync(join(tmpdir(), 'guanchotrack-'));
    const dbPath = join(dir, 'test.db');
    server = await startTestServer({ dbPath });
    const host = await server.connectAs((await server.login('hosttt', '1231')).cookie);
    await server.login('ana', 'pw');
    await emitAck(host, 'host:adjustBalance', { username: 'ana', mode: 'add', value: 42 });
    await server.close();

    server = await startTestServer({ dbPath });
    const login = await server.login('ana', 'pw');
    expect(login.body).toEqual({ role: 'player', created: false });
    const anaId = (server.db.prepare("SELECT id FROM users WHERE username = 'ana'").get() as { id: number }).id;
    expect(balanceOf(server.db, anaId)).toBe(42);
  });
});
