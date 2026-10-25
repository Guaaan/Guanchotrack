import Database from 'better-sqlite3';

export type Db = Database.Database;

export type TxKind = 'bet_place' | 'bet_refund' | 'payout' | 'host_adjust' | 'carry_in' | 'carry_out';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'player')),
  created_at INTEGER NOT NULL
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
`;

export function openDb(path: string): Db {
  const db = new Database(path);
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Bases creadas antes de US4b: agrega la columna de velocidad (idempotente).
  const columns = db.prepare('PRAGMA table_info(results)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'speed')) {
    db.exec(
      "ALTER TABLE results ADD COLUMN speed TEXT NOT NULL DEFAULT 'normal' CHECK (speed IN ('normal', 'fast', 'turbo'))",
    );
  }
  return db;
}

/** Saldo derivado del libro de movimientos. */
export function balanceOf(db: Db, userId: number): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions WHERE user_id = ?')
    .get(userId) as { s: number };
  return row.s;
}

/** Pozo acumulado: cuenta del pozo (`user_id IS NULL`). */
export function carryBalance(db: Db): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions WHERE user_id IS NULL')
    .get() as { s: number };
  return row.s;
}

/** Puntaje: apuestas ganadas. */
export function scoreOf(db: Db, userId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM bets WHERE user_id = ? AND status = 'won'")
    .get(userId) as { c: number };
  return row.c;
}

export interface TxInput {
  userId: number | null;
  roundId?: number | null;
  betId?: number | null;
  kind: TxKind;
  amount: number;
  actorId: number;
  note?: string | null;
  createdAt?: number;
}

export function addTx(db: Db, tx: TxInput): void {
  if (!Number.isInteger(tx.amount) || tx.amount === 0) {
    throw new Error(`Movimiento inválido: amount = ${tx.amount}`);
  }
  db.prepare(
    `INSERT INTO coin_transactions (user_id, round_id, bet_id, kind, amount, actor_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    tx.userId,
    tx.roundId ?? null,
    tx.betId ?? null,
    tx.kind,
    tx.amount,
    tx.actorId,
    tx.note ?? null,
    tx.createdAt ?? Date.now(),
  );
}

/**
 * Invariante de conservación (principio XII):
 * Σ movimientos + Σ apuestas activas = Σ ajustes del host.
 */
export function checkInvariant(db: Db): boolean {
  const { all, adjusts } = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS "all",
              COALESCE(SUM(CASE WHEN kind = 'host_adjust' THEN amount ELSE 0 END), 0) AS adjusts
       FROM coin_transactions`,
    )
    .get() as { all: number; adjusts: number };
  const { active } = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS active FROM bets WHERE status = 'active'")
    .get() as { active: number };
  return all + active === adjusts;
}
