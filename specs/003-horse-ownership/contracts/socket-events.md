# Contract: Socket.IO (cambios de la feature 003)

Amplía [002 socket-events](../../002-host-admin-panel/contracts/socket-events.md). Todo lo no
mencionado sigue igual. Tipos en `shared/types.ts`. Todas las acciones responden por ack
`{ ok: true } | { ok: false, error }` y, con `ok`, hacen `broadcast()`.

## Cliente → servidor

### `horse:buy` (jugador)

```ts
interface BuyHorsePayload {
  horse: HorseNumber;            // carril
  expectedOwner: string | null;  // dueño que el jugador vio (null = establo)
}
```

Rechazos (mensaje en el ack): no es jugador · carrera en curso · caballo inválido · "Este
caballo ya es tuyo" · "Este caballo cambió de dueño, revisa el precio" · "Saldo insuficiente".

### `horse:edit` (jugador dueño)

```ts
interface EditHorsePayload {
  horse: HorseNumber;
  name: string;    // 1–16
  dorsal: number;  // 1–99
}
```

Rechazos: no es el dueño · carrera en curso · nombre o dorsal inválidos o repetidos.

### `admin:updateHorse` (host, modificado)

`UpdateHorsePayload` gana `dorsal: number`. Ventana: cualquier fase menos `racing` (antes: solo
sin ronda). Funciona con o sin dueño y no cambia el dueño.

### `admin:resetHorses` (host, modificado)

Repone también `dorsal = carril`; conserva dueños. Ventana: cualquier fase menos `racing`.

### `admin:removePlayer` (host, modificado)

Además de 002: los caballos del jugador quedan sin dueño; en `racing` se rechaza si tiene
caballos ("No se puede eliminar a un dueño durante la carrera").

## Servidor → cliente: `state`

```ts
interface HorseDef {
  number: HorseNumber;        // carril
  dorsal: number;             // NUEVO
  name: string;
  color: ColorToken;
  numberColor: 'white' | 'black';
  coat: CoatName;
  owner: string | null;       // NUEVO: nombre del dueño (excepción a FR-029 de 001)
}

interface PlayerState {
  // ...campos de 001/002
  myHorses: { horse: HorseNumber; earned: number }[]; // NUEVO: solo los propios
}

interface HostState {
  // ...campos de 001/002
  result: {
    // ...campos de 001
    owner: { username: string; share: number } | null; // NUEVO
  } | null;
  purchases: {                // NUEVO: últimas 50, más reciente primero
    at: number;
    horse: HorseNumber;
    name: string;             // al momento de la compra
    dorsal: number;
    buyer: string;            // "(eliminado)" si la cuenta fue eliminada
    seller: string | null;    // null = establo
    price: number;
  }[];
}
```

Reglas:

- `odds[].multiplier` (jugador) y `horses[].multiplier` / `bets[].potentialPayout` (host) ya
  descuentan la parte del dueño (FR-020): se calculan con `multipliers`/`settle` con dueños.
- `myBet.potentialPayout` también la descuenta.
- `purchases` solo va al host.
- Cambios de dueño, nombre o dorsal llegan a todas las pantallas en el siguiente `broadcast()`.
