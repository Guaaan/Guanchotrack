import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayerState } from '../../shared/types';
import { initialState, startTestServer, type TestServer } from '../helpers/server';

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

async function rawLogin(body: unknown) {
  const res = await fetch(`${server.url}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, setCookie: res.headers.get('set-cookie'), body: await res.json() };
}

describe('POST /api/login', () => {
  it('crea un usuario nuevo como player con cookie HttpOnly', async () => {
    const res = await rawLogin({ username: 'ana', password: 'x1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: 'player', created: true });
    expect(res.setCookie).toMatch(/^gt_session=[0-9a-f]{64};/);
    expect(res.setCookie).toMatch(/HttpOnly/i);
    expect(res.setCookie).toMatch(/SameSite=Lax/i);
    expect(res.setCookie).toMatch(/Path=\//i);
    expect(res.setCookie).not.toMatch(/Max-Age|Expires/i);
  });

  it('usuario existente: contraseña correcta entra, incorrecta da 401', async () => {
    await server.login('ana', 'x1');
    const ok = await server.login('ana', 'x1');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ role: 'player', created: false });
    expect(ok.cookie).toBeTruthy();

    const bad = await server.login('ana', 'otra');
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: 'Contraseña incorrecta' });
    expect(bad.cookie).toBeNull();
  });

  it('ANA y ana son la misma cuenta', async () => {
    await server.login('ana', 'x1');
    const upper = await server.login('ANA', 'x1');
    expect(upper.body.created).toBe(false);
    expect((await server.login('ANA', 'mal')).status).toBe(401);
    const count = server.db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'player'").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it.each([
    ['ab', 'x1'],
    ['a'.repeat(21), 'x1'],
    ['ana!', 'x1'],
    ['ana', ''],
  ])('rechaza nombre o contraseña inválidos (%s / %s) con 400', async (username, password) => {
    const res = await server.login(username, password);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(res.cookie).toBeNull();
  });

  it('rechaza payload sin campos con 400', async () => {
    const res = await rawLogin({});
    expect(res.status).toBe(400);
  });

  it('hosttt / 1231 entra como host', async () => {
    const res = await server.login('hosttt', '1231');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ role: 'host', created: false });
    expect((await server.login('hosttt', 'mal')).status).toBe(401);
  });

  it('la contraseña no se guarda en texto plano', async () => {
    await server.login('ana', 'secreto123');
    const row = server.db.prepare('SELECT password_hash FROM users WHERE username = ?').get('ana') as {
      password_hash: string;
    };
    expect(row.password_hash).not.toContain('secreto123');
    expect(row.password_hash).toMatch(/^\$2[aby]\$10\$/);
  });
});

describe('GET /api/me y POST /api/logout', () => {
  it('me con cookie devuelve el usuario; sin cookie 401', async () => {
    const { cookie } = await server.login('Ana', 'x1');
    const me = await fetch(`${server.url}/api/me`, { headers: { cookie: cookie! } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ username: 'Ana', role: 'player' });

    const anon = await fetch(`${server.url}/api/me`);
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: 'No autenticado' });
  });

  it('logout responde 204 e invalida la cookie', async () => {
    const { cookie } = await server.login('ana', 'x1');
    const out = await fetch(`${server.url}/api/logout`, { method: 'POST', headers: { cookie: cookie! } });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/gt_session=;/);

    const me = await fetch(`${server.url}/api/me`, { headers: { cookie: cookie! } });
    expect(me.status).toBe(401);
    await expect(server.connectAs(cookie)).rejects.toThrow('unauthorized');
  });
});

describe('sesión en Socket.IO', () => {
  it('sin cookie la conexión falla con unauthorized', async () => {
    await expect(server.connectAs(null)).rejects.toThrow('unauthorized');
    await expect(server.connectAs('gt_session=deadbeef')).rejects.toThrow('unauthorized');
  });

  it('un jugador nuevo empieza con saldo 0 en su primer state', async () => {
    const { cookie } = await server.login('ana', 'x1');
    const socket = await server.connectAs(cookie);
    const state = await initialState<PlayerState>(socket);
    expect(state.role).toBe('player');
    expect(state.username).toBe('ana');
    expect(state.balance).toBe(0);
  });
});

describe('límite de intentos (FR-007a)', () => {
  it('5 contraseñas incorrectas bloquean el 6º intento aunque sea correcto', async () => {
    await server.login('ana', 'x1');
    for (let i = 0; i < 5; i++) {
      expect((await server.login('ana', 'mal')).status).toBe(401);
    }
    const locked = await server.login('ANA', 'x1');
    expect(locked.status).toBe(429);
    expect(locked.body).toEqual({ error: 'Demasiados intentos, espera un minuto' });
    expect(locked.cookie).toBeNull();
  });

  it('el bloqueo de un usuario no afecta a otros', async () => {
    await server.login('ana', 'x1');
    await server.login('beto', 'y2');
    for (let i = 0; i < 5; i++) await server.login('ana', 'mal');
    expect((await server.login('beto', 'y2')).status).toBe(200);
    expect((await server.login('carla', 'z3')).status).toBe(200);
  });

  it('un acierto antes del 5º fallo reinicia el contador', async () => {
    await server.login('ana', 'x1');
    for (let i = 0; i < 4; i++) await server.login('ana', 'mal');
    expect((await server.login('ana', 'x1')).status).toBe(200);
    for (let i = 0; i < 4; i++) await server.login('ana', 'mal');
    expect((await server.login('ana', 'x1')).status).toBe(200);
  });
});

describe('cuenta host al arrancar', () => {
  it('existe un único host y no se puede registrar otro con su nombre', async () => {
    const res = await server.login('HOSTTT', 'otra');
    expect(res.status).toBe(401);
    const hosts = server.db.prepare("SELECT username FROM users WHERE role = 'host'").all();
    expect(hosts).toEqual([{ username: 'hosttt' }]);
  });
});
