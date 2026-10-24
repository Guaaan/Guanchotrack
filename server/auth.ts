import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { Db } from './db';

export const SESSION_COOKIE = 'gt_session';

export interface SessionUser {
  id: number;
  username: string;
  role: 'host' | 'player';
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createSession(db: Db, userId: number): string {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, Date.now());
  return token;
}

export function userFromToken(db: Db, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .get(token) as SessionUser | undefined;
  return row ?? null;
}

export function deleteSession(db: Db, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Cookie de sesión sin `Max-Age`: dura hasta logout (research R4). */
export function cookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/`;
}

/** Borra la cookie de sesión en el navegador. */
export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const MAX_FAILS = 5;
const LOCK_MS = 60_000;

/** Rutas REST de autenticación: login con autoregistro, logout y me. */
export function authRouter(db: Db, now: () => number = Date.now): Router {
  const router = Router();
  // Límite de intentos en memoria por usuario (FR-007a); se pierde al reiniciar.
  const attempts = new Map<string, { fails: number; lockedUntil: number }>();

  router.post('/api/login', async (req, res) => {
    const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      res.status(400).json({ error: 'El usuario debe tener entre 3 y 20 caracteres: letras, números, _ o -' });
      return;
    }
    if (typeof password !== 'string' || password.length === 0) {
      res.status(400).json({ error: 'La contraseña no puede estar vacía' });
      return;
    }

    let user = db.prepare('SELECT id, role, password_hash FROM users WHERE username = ?').get(username) as
      | { id: number; role: 'host' | 'player'; password_hash: string }
      | undefined;
    let created = false;

    if (user) {
      const key = username.toLowerCase();
      const entry = attempts.get(key);
      if (entry && entry.lockedUntil > now()) {
        res.status(429).json({ error: 'Demasiados intentos, espera un minuto' });
        return;
      }
      if (!(await bcrypt.compare(password, user.password_hash))) {
        const fails = (entry && entry.lockedUntil === 0 ? entry.fails : 0) + 1;
        attempts.set(key, { fails, lockedUntil: fails >= MAX_FAILS ? now() + LOCK_MS : 0 });
        res.status(401).json({ error: 'Contraseña incorrecta' });
        return;
      }
      attempts.delete(key);
    } else {
      const hash = await bcrypt.hash(password, 10);
      const info = db
        .prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'player', ?)")
        .run(username, hash, now());
      user = { id: Number(info.lastInsertRowid), role: 'player', password_hash: hash };
      created = true;
    }

    const token = createSession(db, user.id);
    res.setHeader('Set-Cookie', cookieHeader(token));
    res.json({ role: user.role, created });
  });

  router.post('/api/logout', (req, res) => {
    deleteSession(db, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.setHeader('Set-Cookie', clearCookieHeader());
    res.status(204).end();
  });

  router.get('/api/me', (req, res) => {
    const user = userFromToken(db, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (!user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    res.json({ username: user.username, role: user.role });
  });

  return router;
}
