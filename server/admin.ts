import bcrypt from 'bcryptjs';
import { DEFAULT_HORSES, validateHorseEdit, type Horse } from '../shared/horses';
import type {
  RemovePlayerPayload,
  RenamePayload,
  ResetPasswordPayload,
  SessionEndedPayload,
  SetActivePayload,
} from '../shared/types';
import { deleteUserSessions, USERNAME_RE } from './auth';
import { addTx, balanceOf, carryBalance, getHorses, logAdmin, type Db } from './db';
import { GameError, type Game } from './game';

/** Sesiones que `socket.ts` debe cerrar tras la acción (research R4). */
export interface AdminResult {
  endSessions: { userId: number; reason: SessionEndedPayload['reason'] }[];
}

export type LoginAttempts = Map<string, { fails: number; lockedUntil: number }>;

export interface AdminOptions {
  db: Db;
  game: Game;
  loginAttempts: LoginAttempts;
  now?: () => number;
}

const NONE: AdminResult = { endSessions: [] };

/** Lo que el host elige de un caballo (para `admin_log`). */
const look = ({ name, dorsal, color, coat }: Horse) => ({ name, dorsal, color, coat });

/**
 * Acciones de la pestaña Admin. Cada una valida en servidor, se ejecuta en una transacción con
 * su fila de `admin_log` y termina con `game.broadcast()`. Las reglas incumplidas lanzan
 * `GameError`, cuyo mensaje vuelve al host por el ack.
 */
export class Admin {
  readonly db: Db;
  readonly game: Game;
  readonly loginAttempts: LoginAttempts;
  readonly now: () => number;

  constructor({ db, game, loginAttempts, now = Date.now }: AdminOptions) {
    this.db = db;
    this.game = game;
    this.loginAttempts = loginAttempts;
    this.now = now;
  }

  /** Jugador vivo (nunca el host ni una cuenta eliminada). */
  private player(userId: unknown): { id: number; username: string; active: number } {
    const row = Number.isInteger(userId)
      ? (this.db
          .prepare("SELECT id, username, active FROM users WHERE id = ? AND role = 'player' AND deleted_at IS NULL")
          .get(userId) as { id: number; username: string; active: number } | undefined)
      : undefined;
    if (!row) throw new GameError('Jugador no encontrado');
    return row;
  }

  /** Ejecuta la acción en una transacción y difunde el estado nuevo. */
  private apply(action: () => AdminResult): AdminResult {
    const result = this.db.transaction(action)();
    this.game.broadcast();
    return result;
  }

  setActive(actorId: number, payload: SetActivePayload): AdminResult {
    const { userId, active } = (payload ?? {}) as Partial<SetActivePayload>;
    return this.apply(() => {
      const user = this.player(userId);
      if (typeof active !== 'boolean') throw new GameError('Valor inválido');
      this.db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, user.id);
      logAdmin(this.db, {
        actorId,
        action: 'set_active',
        target: `user:${user.id}`,
        before: { active: user.active === 1 },
        after: { active },
        createdAt: this.now(),
      });
      return NONE;
    });
  }

  /** Mismas reglas que el registro; las sesiones siguen válidas (FR-008). */
  renamePlayer(actorId: number, payload: RenamePayload): AdminResult {
    const { userId, username } = (payload ?? {}) as Partial<RenamePayload>;
    return this.apply(() => {
      const user = this.player(userId);
      if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
        throw new GameError('El usuario debe tener entre 3 y 20 caracteres: letras, números, _ o -');
      }
      const taken = this.db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(username, user.id);
      if (taken) throw new GameError('Ese nombre ya está en uso');
      this.db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, user.id);
      logAdmin(this.db, {
        actorId,
        action: 'rename',
        target: `user:${user.id}`,
        before: { username: user.username },
        after: { username },
        createdAt: this.now(),
      });
      return NONE;
    });
  }

  /** Nueva contraseña fijada por el host; la anterior y las sesiones abiertas dejan de servir (FR-009). */
  resetPassword(actorId: number, payload: ResetPasswordPayload): AdminResult {
    const { userId, password } = (payload ?? {}) as Partial<ResetPasswordPayload>;
    return this.apply(() => {
      const user = this.player(userId);
      if (typeof password !== 'string' || password.length === 0) {
        throw new GameError('La contraseña no puede estar vacía');
      }
      this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), user.id);
      deleteUserSessions(this.db, user.id);
      this.loginAttempts.delete(user.username.toLowerCase());
      logAdmin(this.db, { actorId, action: 'reset_password', target: `user:${user.id}`, createdAt: this.now() });
      return { endSessions: [{ userId: user.id, reason: 'password_reset' }] };
    });
  }

  /**
   * Elimina la cuenta: su saldo pasa al pozo acumulado con dos movimientos `carry_in` que suman 0
   * (research R3), el nombre queda libre y el historial anonimizado (FR-010).
   */
  removePlayer(actorId: number, payload: RemovePlayerPayload): AdminResult {
    const { userId } = (payload ?? {}) as Partial<RemovePlayerPayload>;
    return this.apply(() => {
      const user = this.player(userId);
      const bet = this.db.prepare("SELECT 1 FROM bets WHERE user_id = ? AND status = 'active'").get(user.id);
      if (bet) throw new GameError('No se puede eliminar: tiene una apuesta activa');
      // el dueño del ganador no puede cambiar durante la carrera (research R6)
      const owns = this.db.prepare('SELECT 1 FROM horses WHERE owner_id = ?').get(user.id);
      if (owns && this.game.phase() === 'racing') throw new GameError('No se puede eliminar a un dueño durante la carrera');
      const now = this.now();
      const balance = balanceOf(this.db, user.id);
      if (balance > 0) {
        addTx(this.db, { userId: user.id, kind: 'carry_in', amount: -balance, actorId, note: 'remove', createdAt: now });
        addTx(this.db, { userId: null, kind: 'carry_in', amount: balance, actorId, note: `remove ${user.id}`, createdAt: now });
      }
      // sus caballos vuelven al establo con su nombre y número; nada se devuelve (FR-034)
      this.db.prepare('UPDATE horses SET owner_id = NULL WHERE owner_id = ?').run(user.id);
      this.db
        .prepare("UPDATE users SET username = '#deleted-' || id, active = 0, deleted_at = ? WHERE id = ?")
        .run(now, user.id);
      deleteUserSessions(this.db, user.id);
      logAdmin(this.db, {
        actorId,
        action: 'remove_player',
        target: `user:${user.id}`,
        before: { username: user.username, balance },
        after: { carry: carryBalance(this.db) },
        createdAt: now,
      });
      return { endSessions: [{ userId: user.id, reason: 'removed' }] };
    });
  }

  /**
   * Nombre, número, manta y pelaje de un caballo, tenga o no dueño (003 FR-012); el dueño no
   * cambia. Solo visual: el motor de carrera no los conoce (002 FR-014). Fuera de la carrera.
   */
  updateHorse(actorId: number, payload: unknown): AdminResult {
    return this.apply(() => {
      this.game.requireNotRacing();
      const current = getHorses(this.db);
      const result = validateHorseEdit(current, payload);
      if (!result.ok) throw new GameError(result.error);
      const { number, dorsal, name, color, coat } = result.horse;
      this.db
        .prepare('UPDATE horses SET name = ?, dorsal = ?, color = ?, coat = ? WHERE number = ?')
        .run(name, dorsal, color, coat, number);
      logAdmin(this.db, {
        actorId,
        action: 'update_horse',
        target: `horse:${number}`,
        before: look(current[number - 1]),
        after: look(result.horse),
        createdAt: this.now(),
      });
      return NONE;
    });
  }

  /** Vuelven los 6 caballos de la feature 001 (002 FR-017); los dueños se conservan (003 FR-014). */
  resetHorses(actorId: number): AdminResult {
    return this.apply(() => {
      this.game.requireNotRacing();
      const before = getHorses(this.db).map(look);
      const update = this.db.prepare('UPDATE horses SET name = ?, dorsal = ?, color = ?, coat = ? WHERE number = ?');
      for (const h of DEFAULT_HORSES) update.run(h.name, h.dorsal, h.color, h.coat, h.number);
      logAdmin(this.db, {
        actorId,
        action: 'reset_horses',
        target: 'horses',
        before,
        after: DEFAULT_HORSES.map(look),
        createdAt: this.now(),
      });
      return NONE;
    });
  }
}
