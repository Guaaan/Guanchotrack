import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { balanceOf, carryBalance, checkInvariant, openDb } from '../../server/db';

let dir: string | null = null;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

/** Esquema tal como lo dejó la feature 002 (sin dueños, dorsales ni tipos nuevos en el libro). */
const SCHEMA_002 = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('host', 'player')),
    created_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase TEXT NOT NULL CHECK (phase IN ('betting', 'racing', 'finished')),
    winner_horse INTEGER CHECK (winner_horse BETWEEN 1 AND 6),
    carry_used INTEGER,
    opened_at INTEGER NOT NULL,
    finished_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL REFERENCES rounds(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    horse INTEGER NOT NULL CHECK (horse BETWEEN 1 AND 6),
    amount INTEGER NOT NULL CHECK (amount >= 1),
    status TEXT NOT NULL CHECK (status IN ('active', 'refunded', 'won', 'lost')),
    payout INTEGER,
    confirmed_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS bets_one_active
    ON bets (round_id, user_id) WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL REFERENCES rounds(id),
    seed INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'annulled', 'final')),
    winner_horse INTEGER CHECK (winner_horse BETWEEN 1 AND 6),
    final_order TEXT,
    photo_finish TEXT,
    ticks INTEGER,
    speed TEXT NOT NULL DEFAULT 'normal' CHECK (speed IN ('normal', 'fast', 'turbo')),
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS coin_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    round_id INTEGER REFERENCES rounds(id),
    bet_id INTEGER REFERENCES bets(id),
    kind TEXT NOT NULL CHECK (kind IN ('bet_place', 'bet_refund', 'payout', 'host_adjust', 'carry_in', 'carry_out')),
    amount INTEGER NOT NULL CHECK (amount <> 0),
    actor_id INTEGER NOT NULL REFERENCES users(id),
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS coin_transactions_user ON coin_transactions (user_id);

  CREATE TABLE IF NOT EXISTS horses (
    number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 6),
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    coat TEXT NOT NULL CHECK (coat IN ('castano', 'pinto', 'tordo', 'palomino'))
  );

  CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK (action IN ('set_active', 'rename', 'reset_password', 'remove_player', 'update_horse', 'reset_horses')),
    target TEXT NOT NULL,
    before TEXT,
    after TEXT,
    created_at INTEGER NOT NULL
  );
`;

const columns = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

const ledger = (db: Database.Database) => db.prepare('SELECT * FROM coin_transactions ORDER BY id').all();

/** Base de 002 con host, 2 jugadores, una ronda terminada, pagos, un ajuste y un acumulado. */
function build002(path: string): void {
  const old = new Database(path);
  old.exec(SCHEMA_002);
  const user = old.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, 'x', ?, 1)");
  user.run('hosttt', 'host');
  user.run('ana', 'player');
  user.run('beto', 'player');
  const horse = old.prepare('INSERT INTO horses (number, name, color, coat) VALUES (?, ?, ?, ?)');
  [['Rojo', 'red', 'castano'], ['Naranjo', 'orange', 'pinto'], ['Trueno', 'yellow', 'tordo'], ['Verde', 'green', 'palomino'], ['Azul', 'blue', 'pinto'], ['Rosado', 'pink', 'castano']].forEach(
    ([name, color, coat], i) => horse.run(i + 1, name, color, coat),
  );
  old.exec(`
    INSERT INTO rounds (id, phase, winner_horse, carry_used, opened_at, finished_at) VALUES (1, 'finished', 2, 0, 1, 2);
    INSERT INTO results (round_id, seed, status, winner_horse, final_order, ticks, speed, started_at, ended_at)
      VALUES (1, 7, 'final', 2, '[2,1,3,4,5,6]', 50, 'normal', 1, 2);
    INSERT INTO bets (id, round_id, user_id, horse, amount, status, payout, confirmed_at) VALUES (1, 1, 2, 2, 10, 'won', 30, 1);
    INSERT INTO bets (id, round_id, user_id, horse, amount, status, payout, confirmed_at) VALUES (2, 1, 3, 4, 20, 'lost', NULL, 1);
    INSERT INTO coin_transactions (user_id, kind, amount, actor_id, note, created_at) VALUES (2, 'host_adjust', 100, 1, 'add 100', 1);
    INSERT INTO coin_transactions (user_id, kind, amount, actor_id, note, created_at) VALUES (3, 'host_adjust', 60, 1, 'add 60', 1);
    INSERT INTO coin_transactions (user_id, round_id, bet_id, kind, amount, actor_id, created_at) VALUES (2, 1, 1, 'bet_place', -10, 2, 1);
    INSERT INTO coin_transactions (user_id, round_id, bet_id, kind, amount, actor_id, created_at) VALUES (3, 1, 2, 'bet_place', -20, 3, 1);
    INSERT INTO coin_transactions (user_id, round_id, bet_id, kind, amount, actor_id, created_at) VALUES (2, 1, 1, 'payout', 30, 1, 2);
    INSERT INTO coin_transactions (user_id, kind, amount, actor_id, note, created_at) VALUES (3, 'carry_in', -40, 1, 'remove', 3);
    INSERT INTO coin_transactions (user_id, kind, amount, actor_id, note, created_at) VALUES (NULL, 'carry_in', 40, 1, 'remove 3', 3);
    INSERT INTO admin_log (actor_id, action, target, created_at) VALUES (1, 'reset_horses', 'horses', 3);
  `);
  old.close();
}

describe('migración a la feature 003', () => {
  it('agrega dueños y dorsales, amplía el libro sin perder filas y es idempotente', () => {
    dir = mkdtempSync(join(tmpdir(), 'gt-003-'));
    const path = join(dir, 'old.db');
    build002(path);
    const before = new Database(path);
    const rows = ledger(before);
    const balances = { ana: balanceOf(before, 2), beto: balanceOf(before, 3), carry: carryBalance(before) };
    before.close();

    const db = openDb(path);
    expect(columns(db, 'horses')).toEqual(expect.arrayContaining(['dorsal', 'owner_id']));
    expect(db.prepare('SELECT number, dorsal, owner_id, name FROM horses ORDER BY number').all()).toEqual(
      ['Rojo', 'Naranjo', 'Trueno', 'Verde', 'Azul', 'Rosado'].map((name, i) => ({ number: i + 1, dorsal: i + 1, owner_id: null, name })),
    );
    expect(columns(db, 'results')).toEqual(expect.arrayContaining(['owner_id', 'owner_share']));
    expect(db.prepare('SELECT owner_id, owner_share FROM results').get()).toEqual({ owner_id: null, owner_share: 0 });
    expect(columns(db, 'horse_purchases')).toEqual(
      expect.arrayContaining(['horse', 'buyer_id', 'seller_id', 'price', 'name', 'dorsal', 'round_id', 'created_at']),
    );
    expect(ledger(db)).toEqual(rows);
    expect({ ana: balanceOf(db, 2), beto: balanceOf(db, 3), carry: carryBalance(db) }).toEqual(balances);
    expect(checkInvariant(db)).toBe(true);

    db.prepare("INSERT INTO coin_transactions (user_id, kind, amount, actor_id, created_at) VALUES (2, 'owner_share', 5, 1, 4)").run();
    db.prepare("INSERT INTO coin_transactions (user_id, kind, amount, actor_id, created_at) VALUES (2, 'horse_buy', -5, 2, 4)").run();
    db.prepare("INSERT INTO admin_log (actor_id, action, target, created_at) VALUES (2, 'owner_edit_horse', 'horse:2', 4)").run();
    expect(checkInvariant(db)).toBe(true);
    const migrated = ledger(db);
    db.close();

    const again = openDb(path);
    expect(ledger(again)).toEqual(migrated);
    expect(again.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name LIKE '%_new'").get()).toEqual({ c: 0 });
    expect(again.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'coin_transactions_user'").get()).toEqual({ c: 1 });
    again.close();
  });

  it('una base nueva ya trae dueños vacíos y dorsales 1–6', () => {
    const db = openDb(':memory:');
    expect(db.prepare('SELECT number, dorsal, owner_id FROM horses ORDER BY number').all()).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, dorsal: n, owner_id: null })),
    );
    db.close();
  });
});
