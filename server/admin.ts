import bcrypt from 'bcryptjs';
import type {
  RemovePlayerPayload,
  RenamePayload,
  ResetPasswordPayload,
  SessionEndedPayload,
  SetActivePayload,
} from '../shared/types';
import { deleteUserSessions, USERNAME_RE } from './auth';
import { addTx, balanceOf, carryBalance, logAdmin, type Db } from './db';
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
      const now = this.now();
      const balance = balanceOf(this.db, user.id);
      if (balance > 0) {
        addTx(this.db, { userId: user.id, kind: 'carry_in', amount: -balance, actorId, note: 'remove', createdAt: now });
        addTx(this.db, { userId: null, kind: 'carry_in', amount: balance, actorId, note: `remove ${user.id}`, createdAt: now });
      }
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
}
