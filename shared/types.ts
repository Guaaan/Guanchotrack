import type { RaceSpeed } from './horses';

export type Phase = 'idle' | 'betting' | 'racing' | 'finished';
export type HorseNumber = 1 | 2 | 3 | 4 | 5 | 6;

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
