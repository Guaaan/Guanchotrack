import { randomInt } from 'node:crypto';
import { TICK_MS, TRACK_LENGTH } from '../shared/horses';
import type {
  AdjustBalancePayload,
  BetPlacePayload,
  HorseNumber,
  HostBetRow,
  HostState,
  Phase,
  PlayerState,
} from '../shared/types';
import { addTx, balanceOf, carryBalance, type Db } from './db';
import { multipliers, settle, type BetInput } from './domain/payouts';
import { createRace, raceOrder, stepRace, type RaceState } from './domain/race';

export type EmitTarget = 'host' | { userId: number };
export type Emit = (target: EmitTarget, state: HostState | PlayerState) => void;

export interface GameOptions {
  db: Db;
  emit: Emit;
  now?: () => number;
  seedFn?: () => number;
  tickMs?: number;
}

/** Error de regla de juego; su mensaje (en español) se devuelve al cliente en el ack. */
export class GameError extends Error {}

const HORSE_NUMBERS: HorseNumber[] = [1, 2, 3, 4, 5, 6];

interface RoundRow {
  id: number;
  phase: 'betting' | 'racing' | 'finished';
  winner_horse: HorseNumber | null;
  carry_used: number | null;
}

interface BetRow {
  id: number;
  user_id: number;
  username: string;
  horse: HorseNumber;
  amount: number;
  status: 'active' | 'refunded' | 'won' | 'lost';
  payout: number | null;
  confirmed_at: number;
}

interface ResultRow {
  id: number;
  seed: number;
  status: 'running' | 'annulled' | 'final';
  winner_horse: HorseNumber | null;
  photo_finish: string | null;
}

const isHorse = (h: unknown): h is HorseNumber => Number.isInteger(h) && (h as number) >= 1 && (h as number) <= 6;
const toInput = (b: BetRow): BetInput => ({ userId: b.user_id, horse: b.horse, amount: b.amount, confirmedAt: b.confirmed_at });

export class Game {
  readonly db: Db;
  private readonly emit: Emit;
  readonly now: () => number;
  readonly seedFn: () => number;
  readonly tickMs: number;
  /** userId → nº de sockets conectados. */
  readonly presence = new Map<number, number>();
  /** Carrera de la ronda actual (en curso o terminada), solo en memoria. */
  private race: { roundId: number; resultId: number; state: RaceState } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor({ db, emit, now = Date.now, seedFn = () => randomInt(2 ** 32), tickMs = TICK_MS }: GameOptions) {
    this.db = db;
    this.emit = emit;
    this.now = now;
    this.seedFn = seedFn;
    this.tickMs = tickMs;
  }

  connect(userId: number): void {
    this.presence.set(userId, (this.presence.get(userId) ?? 0) + 1);
  }

  disconnect(userId: number): void {
    const n = (this.presence.get(userId) ?? 0) - 1;
    if (n > 0) this.presence.set(userId, n);
    else this.presence.delete(userId);
  }

  /** Detiene el intervalo de carrera (al cerrar la app). */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---------- lecturas ----------

  private currentRound(): RoundRow | null {
    return (
      (this.db
        .prepare('SELECT id, phase, winner_horse, carry_used FROM rounds ORDER BY id DESC LIMIT 1')
        .get() as RoundRow | undefined) ?? null
    );
  }

  /** Apuestas de la ronda que cuentan para el pozo (todas menos las devueltas). */
  private roundBets(roundId: number): BetRow[] {
    return this.db
      .prepare(
        `SELECT b.id, b.user_id, u.username, b.horse, b.amount, b.status, b.payout, b.confirmed_at
         FROM bets b JOIN users u ON u.id = b.user_id
         WHERE b.round_id = ? AND b.status <> 'refunded'
         ORDER BY b.confirmed_at, b.id`,
      )
      .all(roundId) as BetRow[];
  }

  private finalResult(roundId: number): ResultRow | null {
    return (
      (this.db
        .prepare("SELECT id, seed, status, winner_horse, photo_finish FROM results WHERE round_id = ? AND status = 'final'")
        .get(roundId) as ResultRow | undefined) ?? null
    );
  }

  /** Carrera de la ronda; si no está en memoria (p. ej. tras reiniciar) se reproduce con su semilla. */
  private raceFor(round: RoundRow): RaceState | null {
    if (this.race?.roundId === round.id) return this.race.state;
    if (round.phase !== 'finished') return null;
    const result = this.finalResult(round.id);
    if (!result) return null;
    let state = createRace(result.seed);
    while (!state.finished) state = stepRace(state);
    this.race = { roundId: round.id, resultId: result.id, state };
    return state;
  }

  /** Acumulado que entra en el pozo de la ronda: el actual o, si ya terminó, el que se usó. */
  private carryFor(round: RoundRow | null): number {
    if (round?.phase === 'finished') return round.carry_used ?? 0;
    return carryBalance(this.db);
  }

  // ---------- transiciones ----------

  openRound(): void {
    const round = this.currentRound();
    if (round && round.phase !== 'finished') throw new GameError('Ya hay una ronda en curso');
    this.db.prepare("INSERT INTO rounds (phase, opened_at) VALUES ('betting', ?)").run(this.now());
    this.race = null;
    this.broadcast();
  }

  placeBet(userId: number, payload: BetPlacePayload): void {
    const { horse, amount } = (payload ?? {}) as Partial<BetPlacePayload>;
    this.db.transaction(() => {
      const user = this.db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
      if (user?.role !== 'player') throw new GameError('Solo los jugadores pueden apostar');
      const round = this.currentRound();
      if (round?.phase !== 'betting') throw new GameError('No hay una ronda de apuestas abierta');
      if (!isHorse(horse)) throw new GameError('Caballo inválido');
      if (!Number.isInteger(amount) || (amount as number) < 1) {
        throw new GameError('El monto debe ser un número entero mayor que 0');
      }
      const current = this.db
        .prepare("SELECT id, amount FROM bets WHERE round_id = ? AND user_id = ? AND status = 'active'")
        .get(round.id, userId) as { id: number; amount: number } | undefined;
      if (amount! > balanceOf(this.db, userId) + (current?.amount ?? 0)) throw new GameError('Saldo insuficiente');

      const now = this.now();
      let betId: number;
      if (current) {
        betId = current.id;
        this.db.prepare('UPDATE bets SET horse = ?, amount = ?, confirmed_at = ? WHERE id = ?').run(horse, amount, now, betId);
        addTx(this.db, { userId, roundId: round.id, betId, kind: 'bet_refund', amount: current.amount, actorId: userId, createdAt: now });
      } else {
        betId = Number(
          this.db
            .prepare("INSERT INTO bets (round_id, user_id, horse, amount, status, confirmed_at) VALUES (?, ?, ?, ?, 'active', ?)")
            .run(round.id, userId, horse, amount, now).lastInsertRowid,
        );
      }
      addTx(this.db, { userId, roundId: round.id, betId, kind: 'bet_place', amount: -amount!, actorId: userId, createdAt: now });
    })();
    this.broadcast();
  }

  startRace(): void {
    const round = this.currentRound();
    if (round?.phase !== 'betting') throw new GameError('La ronda no está en fase de apuestas');
    const seed = this.seedFn();
    const resultId = this.db.transaction(() => {
      const id = Number(
        this.db
          .prepare("INSERT INTO results (round_id, seed, status, started_at) VALUES (?, ?, 'running', ?)")
          .run(round.id, seed, this.now()).lastInsertRowid,
      );
      this.db.prepare("UPDATE rounds SET phase = 'racing' WHERE id = ?").run(round.id);
      return id;
    })();
    this.race = { roundId: round.id, resultId, state: createRace(seed) };
    this.stop();
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.broadcast();
  }

  private tick(): void {
    if (!this.race) return this.stop();
    this.race.state = stepRace(this.race.state);
    if (this.race.state.finished) this.finishRace();
    else this.emit('host', this.hostState());
  }

  private finishRace(): void {
    this.stop();
    const race = this.race!;
    const state = race.state;
    const winner = state.winner!;
    const now = this.now();
    this.db.transaction(() => {
      const hostId = (this.db.prepare("SELECT id FROM users WHERE role = 'host'").get() as { id: number }).id;
      this.db
        .prepare(
          "UPDATE results SET status = 'final', winner_horse = ?, final_order = ?, photo_finish = ?, ticks = ?, ended_at = ? WHERE id = ?",
        )
        .run(winner, JSON.stringify(raceOrder(state)), state.photoFinish ? JSON.stringify(state.photoFinish) : null, state.tick, now, race.resultId);

      const bets = this.roundBets(race.roundId);
      const carry = carryBalance(this.db);
      const { payouts } = settle(bets.map(toInput), carry, winner);
      const paid = new Map(payouts.map((p) => [p.userId, p.amount]));
      const markBet = this.db.prepare('UPDATE bets SET status = ?, payout = ? WHERE id = ?');
      for (const b of bets) {
        const amount = paid.get(b.user_id);
        markBet.run(amount !== undefined ? 'won' : 'lost', amount ?? null, b.id);
        if (amount) {
          addTx(this.db, { userId: b.user_id, roundId: race.roundId, betId: b.id, kind: 'payout', amount, actorId: hostId, createdAt: now });
        }
      }
      if (payouts.length > 0) {
        if (carry > 0) addTx(this.db, { userId: null, roundId: race.roundId, kind: 'carry_out', amount: -carry, actorId: hostId, createdAt: now });
      } else {
        const staked = bets.reduce((s, b) => s + b.amount, 0);
        if (staked > 0) addTx(this.db, { userId: null, roundId: race.roundId, kind: 'carry_in', amount: staked, actorId: hostId, createdAt: now });
      }
      this.db
        .prepare("UPDATE rounds SET phase = 'finished', winner_horse = ?, carry_used = ?, finished_at = ? WHERE id = ?")
        .run(winner, carry, now, race.roundId);
    })();
    this.broadcast();
  }

  /** Devuelve todas las apuestas activas de la ronda; el acumulado no se toca. */
  resetRound(actorId: number): void {
    const round = this.currentRound();
    if (round?.phase !== 'betting') throw new GameError('Solo se pueden reiniciar las apuestas durante la fase de apuestas');
    const now = this.now();
    this.db.transaction(() => {
      const bets = this.db
        .prepare("SELECT id, user_id, amount FROM bets WHERE round_id = ? AND status = 'active'")
        .all(round.id) as { id: number; user_id: number; amount: number }[];
      const refund = this.db.prepare("UPDATE bets SET status = 'refunded' WHERE id = ?");
      for (const b of bets) {
        refund.run(b.id);
        addTx(this.db, {
          userId: b.user_id,
          roundId: round.id,
          betId: b.id,
          kind: 'bet_refund',
          amount: b.amount,
          actorId,
          note: 'reset round',
          createdAt: now,
        });
      }
    })();
    this.broadcast();
  }

  /** Anula la carrera en curso y vuelve a apuestas con las apuestas intactas. */
  resetRace(): void {
    const round = this.currentRound();
    if (round?.phase !== 'racing') throw new GameError('No hay una carrera en curso');
    this.stop();
    this.race = null;
    this.annulRace(round.id);
    this.broadcast();
  }

  /** Tras reiniciar el servidor, una carrera que estaba en curso se anula (FR-041). */
  recoverOnBoot(): void {
    const round = this.currentRound();
    if (round?.phase === 'racing') this.annulRace(round.id);
  }

  private annulRace(roundId: number): void {
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE results SET status = 'annulled', ended_at = ? WHERE round_id = ? AND status = 'running'")
        .run(this.now(), roundId);
      this.db.prepare("UPDATE rounds SET phase = 'betting' WHERE id = ?").run(roundId);
    })();
  }

  adjustBalance(actorId: number, payload: AdjustBalancePayload): void {
    const { username, mode, value } = (payload ?? {}) as Partial<AdjustBalancePayload>;
    this.db.transaction(() => {
      const target =
        typeof username === 'string'
          ? (this.db.prepare("SELECT id FROM users WHERE username = ? AND role = 'player'").get(username) as
              | { id: number }
              | undefined)
          : undefined;
      if (!target) throw new GameError('Jugador no encontrado');
      if (!Number.isInteger(value) || (value as number) < 0) {
        throw new GameError('El valor debe ser un número entero mayor o igual a 0');
      }
      const balance = balanceOf(this.db, target.id);
      const delta = mode === 'set' ? value! - balance : mode === 'add' ? value! : mode === 'subtract' ? -value! : NaN;
      if (Number.isNaN(delta)) throw new GameError('Modo inválido');
      if (balance + delta < 0) throw new GameError('El saldo no puede quedar negativo');
      if (delta !== 0) {
        addTx(this.db, { userId: target.id, kind: 'host_adjust', amount: delta, actorId, note: `${mode} ${value}`, createdAt: this.now() });
      }
    })();
    this.broadcast();
  }

  // ---------- proyecciones ----------

  playerState(userId: number): PlayerState {
    const user = this.db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const round = this.currentRound();
    const phase: Phase = round?.phase ?? 'idle';
    const state: PlayerState = {
      role: 'player',
      username: user?.username ?? '',
      balance: balanceOf(this.db, userId),
      phase,
      roundId: round?.id ?? null,
      odds: [],
      myBet: null,
      myResult: null,
    };
    if (!round) return state;

    const bets = this.roundBets(round.id);
    const inputs = bets.map(toInput);
    const carry = this.carryFor(round);
    const mine = bets.find((b) => b.user_id === userId);

    if (phase === 'betting') state.odds = this.odds(bets, carry);
    if (mine && phase !== 'finished') {
      const potential = settle(inputs, carry, mine.horse).payouts.find((p) => p.userId === userId)?.amount ?? 0;
      state.myBet = { horse: mine.horse, amount: mine.amount, potentialPayout: potential };
    }
    if (phase === 'finished' && round.winner_horse) {
      state.myResult = {
        participated: Boolean(mine),
        won: mine?.status === 'won',
        payout: mine?.payout ?? 0,
        winner: round.winner_horse,
      };
    }
    return state;
  }

  hostState(): HostState {
    const round = this.currentRound();
    const phase: Phase = round?.phase ?? 'idle';
    const carry = this.carryFor(round);
    const bets = round ? this.roundBets(round.id) : [];
    const inputs = bets.map(toInput);
    const pot = bets.reduce((s, b) => s + b.amount, 0) + carry;

    // pago potencial de cada apuesta si gana su caballo (o el pago real si ya terminó)
    const potential = new Map<number, number>();
    if (phase === 'finished') {
      for (const b of bets) potential.set(b.id, b.payout ?? 0);
    } else {
      for (const h of HORSE_NUMBERS) {
        const paid = new Map(settle(inputs, carry, h).payouts.map((p) => [p.userId, p.amount]));
        for (const b of bets) if (b.horse === h) potential.set(b.id, paid.get(b.user_id) ?? 0);
      }
    }

    const horses = this.odds(bets, carry).map((o) => ({
      ...o,
      bets: bets
        .filter((b) => b.horse === o.horse)
        .map((b): HostBetRow => ({ username: b.username, amount: b.amount, potentialPayout: potential.get(b.id) ?? 0 })),
    }));

    const raceState = round ? this.raceFor(round) : null;
    const race =
      raceState && (phase === 'racing' || phase === 'finished')
        ? {
            tick: raceState.tick,
            positions: Object.fromEntries(raceState.positions.map((p, i) => [i + 1, p])) as Record<HorseNumber, number>,
            order: raceOrder(raceState),
          }
        : null;

    let result: HostState['result'] = null;
    if (phase === 'finished' && round?.winner_horse) {
      const row = this.finalResult(round.id);
      const winners = bets.filter((b) => b.status === 'won');
      result = {
        winner: round.winner_horse,
        photoFinish: row?.photo_finish ? JSON.parse(row.photo_finish) : null,
        winners: winners.map((b) => ({ username: b.username, payout: b.payout ?? 0 })),
        carriedOver: winners.length === 0 ? pot : 0,
      };
    }

    return {
      role: 'host',
      phase,
      roundId: round?.id ?? null,
      pot,
      carry,
      horses,
      betStatus: this.betStatus(round, bets),
      race,
      result,
      leaderboard: [],
      trackLength: TRACK_LENGTH as 40,
    };
  }

  /** Apostaron: con apuesta en la ronda (conectados o no). Faltan: jugadores conectados sin apuesta. */
  private betStatus(round: RoundRow | null, bets: BetRow[]): HostState['betStatus'] {
    if (!round) return { placed: [], missing: [] };
    const byName = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
    const bettors = new Set(bets.map((b) => b.user_id));
    const players = this.db.prepare("SELECT id, username FROM users WHERE role = 'player'").all() as {
      id: number;
      username: string;
    }[];
    return {
      placed: bets.map((b) => b.username).sort(byName),
      missing: players
        .filter((p) => this.presence.has(p.id) && !bettors.has(p.id))
        .map((p) => p.username)
        .sort(byName),
    };
  }

  private odds(bets: BetRow[], carry: number) {
    const mult = multipliers(bets.map(toInput), carry);
    return HORSE_NUMBERS.map((horse) => {
      const mine = bets.filter((b) => b.horse === horse);
      return { horse, total: mine.reduce((s, b) => s + b.amount, 0), bettors: mine.length, multiplier: mult[horse] };
    });
  }

  /** Emite el snapshot del host a la sala `host` y el propio a cada jugador conectado. */
  broadcast(): void {
    this.emit('host', this.hostState());
    const players = this.db.prepare("SELECT id FROM users WHERE role = 'player'").all() as { id: number }[];
    for (const { id } of players) {
      if (this.presence.has(id)) this.emit({ userId: id }, this.playerState(id));
    }
  }
}
