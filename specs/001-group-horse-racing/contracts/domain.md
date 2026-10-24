# Contract: módulos puros de dominio (`server/domain/`)

Sin I/O, sin reloj, sin estado global (principio VIII). Probados con Vitest.

## rng.ts

```ts
function mulberry32(seed: number): () => number;   // [0, 1)
```

## race.ts

```ts
const TRACK_LENGTH = 40;
const ADVANCE_PROBABILITY = 0.1;

interface RaceState {
  rng: () => number;
  tick: number;
  positions: number[];           // índice 0..5 = caballo 1..6
  finished: boolean;
  winner: HorseNumber | null;
  photoFinish: { horse: HorseNumber; value: number }[] | null;
}

function createRace(seed: number): RaceState;
function stepRace(state: RaceState): RaceState;   // un tick; no-op si finished
function raceOrder(state: RaceState): HorseNumber[];
```

Reglas:

- Por tick, caballos 1→6 en orden fijo: `rng() < 0.1` ⇒ `+1` casilla (tope 40).
- Si tras el tick ≥ 1 caballo está en 40 ⇒ `finished`. Con 1: gana. Con varios: cada uno, en
  orden de número, recibe `value = rng()`; gana el mayor (photo finish).
- `raceOrder`: llegados por `value` desc; resto por casilla desc, luego número asc.
- Misma semilla ⇒ misma secuencia exacta de posiciones y ganador.

## payouts.ts

```ts
interface BetInput { userId: number; horse: HorseNumber; amount: number; confirmedAt: number }

function multipliers(bets: BetInput[], carry: number): Record<HorseNumber, number | null>;

function settle(bets: BetInput[], carry: number, winner: HorseNumber): {
  payouts: { userId: number; amount: number }[];   // solo apuestas ganadoras
  carryOut: number;          // monedas que quedan en el pozo acumulado tras liquidar
};
```

Reglas:

- `pot = Σ amount + carry`.
- Sin apuestas al ganador ⇒ `payouts = []`, `carryOut = pot`.
- Con apuestas al ganador (`T` = total al ganador): `floor(amount × pot / T)` por apuesta; el
  sobrante `pot − Σfloors` se reparte de a 1 por resto (`amount × pot mod T`) desc, luego
  `confirmedAt` asc, luego `userId` asc. `Σ payouts = pot`, `carryOut = 0`.
- Aritmética entera exacta (sin flotantes en montos).

## ranking.ts

```ts
interface RankInput { username: string; score: number; balance: number }

function rank(players: RankInput[]): (RankInput & { isFirst: boolean; isLast: boolean })[];
```

Reglas: puntaje desc, saldo desc, `username` asc (`localeCompare('es', {sensitivity:'base'})`).
`isFirst` para el primero; `isLast` para el último solo si hay ≥ 2 jugadores.

## format.ts (`shared/`, usado por el cliente)

```ts
function formatMultiplier(m: number | null): string;   // 2.356 → "2,35×"; null → "sin apuestas"
```
