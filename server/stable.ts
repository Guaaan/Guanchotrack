import { purchasePrice, validateHorseIdentity } from '../shared/horses';
import type { BuyHorsePayload, EditHorsePayload, HorseNumber } from '../shared/types';
import { addTx, balanceOf, getHorses, logAdmin, ownerOf, type Db } from './db';
import { GameError, type Game } from './game';

const isHorse = (h: unknown): h is HorseNumber => Number.isInteger(h) && (h as number) >= 1 && (h as number) <= 6;

export interface StableOptions {
  db: Db;
  game: Game;
  now?: () => number;
}

/**
 * Acciones de los jugadores sobre los caballos (feature 003): comprar y editar los propios. Cada
 * una valida en servidor dentro de una transacción y termina con `game.broadcast()`; las reglas
 * incumplidas lanzan `GameError`, cuyo mensaje vuelve al jugador por el ack.
 */
export class Stable {
  readonly db: Db;
  readonly game: Game;
  readonly now: () => number;

  constructor({ db, game, now = Date.now }: StableOptions) {
    this.db = db;
    this.game = game;
    this.now = now;
  }

  /** Jugador vivo (nunca el host ni una cuenta eliminada). */
  private player(userId: number): { id: number; username: string } {
    const row = this.db
      .prepare("SELECT id, username FROM users WHERE id = ? AND role = 'player' AND deleted_at IS NULL")
      .get(userId) as { id: number; username: string } | undefined;
    if (!row) throw new GameError('Solo los jugadores pueden comprar caballos');
    return row;
  }

  /**
   * Compra un caballo (research R7): al establo por 30, que van al pozo acumulado, o a otro
   * jugador por 50, que van íntegros al vendedor. Solo transfiere monedas (constitución XII).
   * Se rechaza si el dueño ya no es el que vio el comprador, para no cobrar otro precio.
   */
  buyHorse(userId: number, payload: BuyHorsePayload): void {
    const { horse, expectedOwner } = (payload ?? {}) as Partial<BuyHorsePayload>;
    this.apply(() => {
      const buyer = this.player(userId);
      this.game.requireNotRacing();
      if (!isHorse(horse)) throw new GameError('Caballo inválido');
      const def = getHorses(this.db)[horse - 1];
      const ownerId = ownerOf(this.db, horse);
      if (ownerId === buyer.id) throw new GameError('Este caballo ya es tuyo');
      if (def.owner !== (expectedOwner ?? null)) throw new GameError('Este caballo cambió de dueño, revisa el precio');
      const price = purchasePrice(ownerId, buyer.id)!;
      if (balanceOf(this.db, buyer.id) < price) throw new GameError('Saldo insuficiente');

      const now = this.now();
      const round = this.db.prepare('SELECT id FROM rounds ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined;
      const roundId = round?.id ?? null;
      const purchaseId = Number(
        this.db
          .prepare(
            'INSERT INTO horse_purchases (horse, buyer_id, seller_id, price, name, dorsal, round_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(horse, buyer.id, ownerId, price, def.name, def.dorsal, roundId, now).lastInsertRowid,
      );
      const note = `horse:${horse} purchase:${purchaseId}`;
      const leg = { roundId, actorId: buyer.id, note, createdAt: now };
      addTx(this.db, { ...leg, userId: buyer.id, kind: 'horse_buy', amount: -price });
      if (ownerId === null) addTx(this.db, { ...leg, userId: null, kind: 'horse_buy', amount: price });
      else addTx(this.db, { ...leg, userId: ownerId, kind: 'horse_sale', amount: price });
      this.db.prepare('UPDATE horses SET owner_id = ? WHERE number = ?').run(buyer.id, horse);
    });
  }

  /** El dueño cambia nombre y número visible; nunca pelaje ni colores (FR-009–FR-011). */
  editHorse(userId: number, payload: EditHorsePayload): void {
    const { horse, name, dorsal } = (payload ?? {}) as Partial<EditHorsePayload>;
    this.apply(() => {
      const player = this.player(userId);
      this.game.requireNotRacing();
      if (!isHorse(horse) || ownerOf(this.db, horse) !== player.id) {
        throw new GameError('Solo el dueño puede editar este caballo');
      }
      const current = getHorses(this.db);
      const result = validateHorseIdentity(current, horse, name, dorsal);
      if (!result.ok) throw new GameError(result.error);
      this.db.prepare('UPDATE horses SET name = ?, dorsal = ? WHERE number = ?').run(result.name, result.dorsal, horse);
      const before = current[horse - 1];
      logAdmin(this.db, {
        actorId: player.id,
        action: 'owner_edit_horse',
        target: `horse:${horse}`,
        before: { name: before.name, dorsal: before.dorsal },
        after: { name: result.name, dorsal: result.dorsal },
        createdAt: this.now(),
      });
    });
  }

  /** Ejecuta la acción en una transacción y difunde el estado nuevo. */
  private apply(action: () => void): void {
    this.db.transaction(action)();
    this.game.broadcast();
  }
}
