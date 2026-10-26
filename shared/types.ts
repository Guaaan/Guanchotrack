import type { ColorToken } from '../src/palette';
import type { CoatName, Horse, RaceSpeed } from './horses';

export type Phase = 'idle' | 'betting' | 'racing' | 'finished';
export type HorseNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** Caballo vigente (nombre, manta, número y pelaje elegidos por el host). */
export type HorseDef = Horse;

export interface HorseOdds {
  horse: HorseNumber;
  total: number;
  bettors: number;
  multiplier: number | null;
}

export interface PlayerState {
  role: 'player';
  username: string;
  balance: number;
  phase: Phase;
  roundId: number | null;
  odds: HorseOdds[];
  myBet: {
    horse: HorseNumber;
    amount: number;
    potentialPayout: number;
  } | null;
  myResult: {
    participated: boolean;
    horse: HorseNumber | null;
    won: boolean;
    payout: number;
    winner: HorseNumber;
  } | null;
  /** Caballos de primero a último; solo en 'racing' y 'finished' (FR-028b). */
  raceOrder: HorseNumber[] | null;
  /** Posición propia en el leaderboard general; solo en 'racing' y 'finished' (FR-028a). */
  myRank: {
    position: number;
    total: number;
    score: number;
  } | null;
  /** Los 6 caballos vigentes, por número. */
  horseDefs: HorseDef[];
}

export interface HostBetRow {
  username: string;
  amount: number;
  potentialPayout: number;
}

export interface HostState {
  role: 'host';
  phase: Phase;
  roundId: number | null;
  pot: number;
  carry: number;
  horses: (HorseOdds & { bets: HostBetRow[] })[];
  betStatus: {
    placed: string[];
    missing: string[];
  };
  race: {
    tick: number;
    positions: Record<HorseNumber, number>;
    order: HorseNumber[];
    speed: RaceSpeed;
    tickMs: number;
  } | null;
  result: {
    winner: HorseNumber;
    photoFinish: { horse: HorseNumber; value: number }[] | null;
    winners: { username: string; payout: number }[];
    carriedOver: number;
  } | null;
  leaderboard: {
    username: string;
    score: number;
    balance: number;
    online: boolean;
    isFirst: boolean;
    isLast: boolean;
  }[];
  trackLength: 40;
  horseDefs: HorseDef[];
  /** Jugadores vivos (nunca el host ni eliminados), por nombre; solo para la pestaña Admin. */
  participants: ParticipantRow[];
}

export interface ParticipantRow {
  id: number;
  username: string;
  score: number;
  balance: number;
  online: boolean;
  active: boolean;
  hasActiveBet: boolean;
}

export type Ack = { ok: true } | { ok: false; error: string };

export interface BetPlacePayload {
  horse: HorseNumber;
  amount: number;
}

export interface StartRacePayload {
  speed?: RaceSpeed;
}

export interface AdjustBalancePayload {
  username: string;
  mode: 'set' | 'add' | 'subtract';
  value: number;
}

export interface SessionEndedPayload {
  reason: 'removed' | 'password_reset';
}

export interface SetActivePayload {
  userId: number;
  active: boolean;
}

export interface RenamePayload {
  userId: number;
  username: string;
}

export interface ResetPasswordPayload {
  userId: number;
  password: string;
}

export interface RemovePlayerPayload {
  userId: number;
}

export interface UpdateHorsePayload {
  number: HorseNumber;
  name: string;
  color: ColorToken;
  coat: CoatName;
}
