import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { checkInvariant, getHorses, openDb } from '../../server/db';
import { DEFAULT_HORSES } from '../../shared/horses';

let dir: string | null = null;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const columns = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe('esquema de administración', () => {
  it('agrega active y deleted_at a una base de 001 sin perder jugadores (idempotente)', () => {
    dir = mkdtempSync(join(tmpdir(), 'gt-schema-'));
    const path = join(dir, 'old.db');
    const old = new Database(path);
    old.exec(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('host', 'player')),
      created_at INTEGER NOT NULL
    )`);
    old.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES ('ana', 'x', 'player', 1)").run();
    old.close();

    openDb(path).close();
    const db = openDb(path);
    expect(columns(db, 'users')).toEqual(expect.arrayContaining(['active', 'deleted_at']));
    const ana = db.prepare("SELECT active, deleted_at FROM users WHERE username = 'ana'").get();
    expect(ana).toEqual({ active: 1, deleted_at: null });
    expect(checkInvariant(db)).toBe(true);
    db.close();
  });

  it('siembra los 6 caballos por defecto y crea admin_log', () => {
    const db = openDb(':memory:');
    expect(
      getHorses(db).map(({ number, name, color, coat, numberColor }) => ({ number, name, color, coat, numberColor })),
    ).toEqual(DEFAULT_HORSES.map(({ number, name, color, coat, numberColor }) => ({ number, name, color, coat, numberColor })));
    expect(columns(db, 'admin_log')).toEqual(['id', 'actor_id', 'action', 'target', 'before', 'after', 'created_at']);
    expect(checkInvariant(db)).toBe(true);
    db.close();
  });
});
