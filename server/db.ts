import Database from 'better-sqlite3';
import { DEFAULT_HORSES, numberColorFor, type CoatName, type Horse } from '../shared/horses';
import type { ColorToken } from '../src/palette';
import type { HorseNumber } from '../shared/types';

export type Db = Database.Database;

export type TxKind =
  | 'bet_place'
  | 'bet_refund'
  | 'payout'
  | 'host_adjust'
  | 'carry_in'
  | 'carry_out'
  | 'horse_buy'
  | 'horse_sale'
  | 'owner_share';

/**
 * Libro de movimientos y registro de administración. Se definen aparte porque una base anterior a
 * la feature 003 se reconstruye con estos `CHECK` ampliados (research R3, R8).
 */
const coinTransactionsTable = (name: string) => `
CREATE TABLE IF NOT EXISTS ${name} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  round_id INTEGER REFERENCES rounds(id),
  bet_id INTEGER REFERENCES bets(id),
  kind TEXT NOT NULL CHECK (kind IN ('bet_place', 'bet_refund', 'payout', 'host_adjust', 'carry_in', 'carry_out', 'horse_buy', 'horse_sale', 'owner_share')),
  amount INTEGER NOT NULL CHECK (amount <> 0),
  actor_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT,
  created_at INTEGER NOT NULL
);`;

const adminLogTable = (name: string) => `
CREATE TABLE IF NOT EXISTS ${name} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('set_active', 'rename', 'reset_password', 'remove_player', 'update_horse', 'reset_horses', 'owner_edit_horse')),
  target TEXT NOT NULL,
  before TEXT,
  after TEXT,
  created_at INTEGER NOT NULL
);`;

const COIN_TRANSACTIONS_INDEX = 'CREATE INDEX IF NOT EXISTS coin_transactions_user ON coin_transactions (user_id);';

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

${coinTransactionsTable('coin_transactions')}
${COIN_TRANSACTIONS_INDEX}

CREATE TABLE IF NOT EXISTS horses (
  number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 6),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  coat TEXT NOT NULL CHECK (coat IN ('castano', 'pinto', 'tordo', 'palomino')),
  dorsal INTEGER,
  owner_id INTEGER REFERENCES users(id)
);

${adminLogTable('admin_log')}

CREATE TABLE IF NOT EXISTS horse_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  horse INTEGER NOT NULL CHECK (horse BETWEEN 1 AND 6),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER REFERENCES users(id),
  price INTEGER NOT NULL CHECK (price IN (30, 50)),
  name TEXT NOT NULL,
  dorsal INTEGER NOT NULL,
  round_id INTEGER REFERENCES rounds(id),
  created_at INTEGER NOT NULL
);
`;

export type AdminAction =
  | 'set_active'
  | 'rename'
  | 'reset_password'
  | 'remove_player'
  | 'update_horse'
  | 'reset_horses'
  | 'owner_edit_horse';

/** Agrega la columna si la tabla aún no la tiene (bases creadas antes de la feature que la usa). */
function addColumn(db: Db, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Reconstruye `table` con `create(name)` si su definición aún no contiene `marker` (SQLite no
 * permite cambiar un `CHECK`): copia todas las filas con su `id` en una transacción.
 */
function rebuildTable(db: Db, table: string, create: (name: string) => string, marker: string, after = ''): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
    | { sql: string }
    | undefined;
  if (!row || row.sql.includes(marker)) return;
  db.transaction(() => {
    db.exec(create(`${table}_new`));
    db.exec(`INSERT INTO ${table}_new SELECT * FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    if (after) db.exec(after);
  })();
}

export function openDb(path: string): Db {
  const db = new Database(path);
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Bases creadas antes de US4b y de la feature 002 (idempotente).
  addColumn(db, 'results', 'speed', "TEXT NOT NULL DEFAULT 'normal' CHECK (speed IN ('normal', 'fast', 'turbo'))");
  addColumn(db, 'users', 'active', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'users', 'deleted_at', 'INTEGER');
  // Feature 003: dueños, dorsales, parte del dueño y tipos nuevos del libro (idempotente).
  addColumn(db, 'horses', 'dorsal', 'INTEGER');
  addColumn(db, 'horses', 'owner_id', 'INTEGER REFERENCES users(id)');
  addColumn(db, 'results', 'owner_id', 'INTEGER REFERENCES users(id)');
  addColumn(db, 'results', 'owner_share', 'INTEGER NOT NULL DEFAULT 0');
  rebuildTable(db, 'coin_transactions', coinTransactionsTable, 'owner_share', COIN_TRANSACTIONS_INDEX);
  rebuildTable(db, 'admin_log', adminLogTable, 'owner_edit_horse');
  const seed = db.prepare('INSERT OR IGNORE INTO horses (number, name, color, coat, dorsal) VALUES (?, ?, ?, ?, ?)');
  for (const h of DEFAULT_HORSES) seed.run(h.number, h.name, h.color, h.coat, h.dorsal);
  db.exec('UPDATE horses SET dorsal = number WHERE dorsal IS NULL');
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

/** Los 6 caballos vigentes, por carril, con dorsal y dueño; el color del número se calcula (FR-013). */
export function getHorses(db: Db): Horse[] {
  const rows = db
    .prepare(
      `SELECT h.number, h.dorsal, h.name, h.color, h.coat, u.username AS owner
       FROM horses h LEFT JOIN users u ON u.id = h.owner_id
       ORDER BY h.number`,
    )
    .all() as {
    number: HorseNumber;
    dorsal: number;
    name: string;
    color: ColorToken;
    coat: CoatName;
    owner: string | null;
  }[];
  return rows.map(({ number, dorsal, name, color, coat, owner }) => ({
    number,
    dorsal,
    name,
    color,
    numberColor: numberColorFor(color),
    coat,
    owner,
  }));
}

/** Id del dueño del caballo (carril), o `null` si es del establo. */
export function ownerOf(db: Db, horse: HorseNumber): number | null {
  const row = db.prepare('SELECT owner_id FROM horses WHERE number = ?').get(horse) as { owner_id: number | null } | undefined;
  return row?.owner_id ?? null;
}

/** Carriles con dueño (para descontar la parte del dueño en multiplicadores). */
export function ownedHorses(db: Db): Set<HorseNumber> {
  const rows = db.prepare('SELECT number FROM horses WHERE owner_id IS NOT NULL').all() as { number: HorseNumber }[];
  return new Set(rows.map((r) => r.number));
}

export interface AdminLogInput {
  actorId: number;
  action: AdminAction;
  target: string;
  before?: unknown;
  after?: unknown;
  createdAt?: number;
}

/** Registro solo-inserción de acciones de administración (FR-003). */
export function logAdmin(db: Db, entry: AdminLogInput): void {
  db.prepare(
    'INSERT INTO admin_log (actor_id, action, target, before, after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    entry.actorId,
    entry.action,
    entry.target,
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
    entry.createdAt ?? Date.now(),
  );
}
