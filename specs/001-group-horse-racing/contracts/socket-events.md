# Contract: Socket.IO

Mismo origen y puerto que HTTP. Tipos compartidos en `shared/types.ts`.

## Handshake

- El servidor lee la cookie `gt_session` del handshake. Sin sesión válida ⇒
  `connect_error` con `message: "unauthorized"` ⇒ el cliente vuelve a `/`.
- Al conectar: el socket entra a la sala `host` o `player:<userId>`, se actualiza la presencia
  y el servidor emite `state` a ese socket (snapshot completo para reconexión).

## Servidor → cliente

### `state` (snapshot proyectado por rol)

Se emite al conectar y tras cada cambio: apuesta, acción de host, conexión/desconexión de un
jugador, cada tick de carrera (solo a `host`) y fin de carrera.

```ts
type Phase = 'idle' | 'betting' | 'racing' | 'finished';
type HorseNumber = 1 | 2 | 3 | 4 | 5 | 6;

interface HorseOdds {
  horse: HorseNumber;
  total: number;              // monedas apostadas a este caballo
  bettors: number;
  multiplier: number | null;  // pot / total; null si total = 0
}

interface PlayerState {
  role: 'player';
  username: string;
  balance: number;            // saldo disponible (ya descontada la apuesta activa)
  phase: Phase;
  roundId: number | null;
  odds: HorseOdds[];          // solo en 'betting'; [] en otras fases
  myBet: {
    horse: HorseNumber;
    amount: number;
    potentialPayout: number;  // settle(bets, carry, horse) para este jugador
  } | null;
  myResult: {                 // solo en 'finished'
    participated: boolean;
    won: boolean;
    payout: number;           // 0 si perdió
    winner: HorseNumber;
  } | null;
}

interface HostBetRow {
  username: string;
  amount: number;
  potentialPayout: number;    // en 'betting'; en 'finished' = pago real (0 si perdió)
}

interface HostState {
  role: 'host';
  phase: Phase;
  roundId: number | null;
  pot: number;                // apuestas activas + acumulado
  carry: number;              // pozo acumulado incluido en pot (FR-021a)
  horses: (HorseOdds & { bets: HostBetRow[] })[];
  betStatus: {
    placed: string[];         // usernames con apuesta activa (conectados o no)
    missing: string[];        // conectados sin apuesta (Clarificación Q3)
  };
  race: {
    tick: number;
    positions: Record<HorseNumber, number>;   // casilla 0–40
    order: HorseNumber[];                     // primero a último
  } | null;                   // presente en 'racing' y 'finished'
  result: {
    winner: HorseNumber;
    photoFinish: { horse: HorseNumber; value: number }[] | null;
    winners: { username: string; payout: number }[];
    carriedOver: number;      // > 0 si nadie acertó
  } | null;                   // solo en 'finished'
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
```

Reglas:

- `PlayerState` nunca incluye nombres, apuestas ni saldos de otros jugadores (FR-029).
- `potentialPayout` y los pagos finales salen de la misma función `settle` (principio XI).

## Cliente → servidor (con ack)

Todos responden por *ack* `{ ok: true }` o `{ ok: false, error: string }` (mensaje en español).
Tras un `ok`, el servidor emite `state` a todos los afectados.

| Evento | Rol | Payload | Errores |
|--------|-----|---------|---------|
| `bet:place` | player | `{ horse: 1–6, amount: int ≥ 1 }` | fase distinta de `betting`; saldo insuficiente; valores inválidos |
| `host:openRound` | host | `{}` | ya hay ronda en `betting`/`racing` |
| `host:startRace` | host | `{}` | fase distinta de `betting` |
| `host:resetRound` | host | `{}` | fase distinta de `betting` |
| `host:resetRace` | host | `{}` | fase distinta de `racing` |
| `host:adjustBalance` | host | `{ username, mode: 'set' \| 'add' \| 'subtract', value: int ≥ 0 }` | jugador inexistente o es host; saldo resultante negativo |

- `bet:place` crea la apuesta o la reemplaza (cambio de caballo y/o monto) — FR-016/FR-018.
- Cualquier evento `host:*` desde un socket sin rol host ⇒ `{ ok: false, error: "No autorizado" }`
  y no tiene efectos (FR-038).
