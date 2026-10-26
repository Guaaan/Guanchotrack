# Contract: Socket.IO (cambios de la feature 002)

Amplía [001 socket-events](../../001-group-horse-racing/contracts/socket-events.md). Todo lo no
mencionado aquí sigue igual. Tipos en `shared/types.ts`.

## Servidor → cliente

### `state` — campos nuevos

```ts
interface HorseDef {
  number: HorseNumber;
  name: string;               // 1–14 caracteres
  color: ColorToken;          // ∈ BLANKET_COLORS
  numberColor: 'white' | 'black'; // numberColorFor(color)
  coat: CoatName;
}

interface PlayerState {
  // ...campos de 001
  username: string;           // nombre vigente: cambia en vivo si el host lo renombra
  horseDefs: HorseDef[];      // NUEVO: los 6 caballos vigentes, por número
  myRank: { position; total; score } | null; // null también si el jugador está inactivo;
                                             // total = nº de participantes activos
}

interface ParticipantRow {
  id: number;
  username: string;
  score: number;
  balance: number;
  online: boolean;
  active: boolean;
  hasActiveBet: boolean;      // bloquea "Eliminar" en la UI (el servidor lo vuelve a comprobar)
}

interface HostState {
  // ...campos de 001
  horseDefs: HorseDef[];      // NUEVO
  participants: ParticipantRow[]; // NUEVO: jugadores vivos (nunca host ni eliminados), por nombre
  leaderboard: [...];         // ahora solo participantes activos; mismo orden de 001
}
```

Reglas:

- `participants` solo va al host. `PlayerState` sigue sin datos de otros jugadores (FR-029 de 001).
- Nombres de cuentas eliminadas que aparezcan en `horses[].bets` o `result.winners` se envían como
  `"(eliminado)"`.
- Tras cualquier acción `admin:*` con `ok`, el servidor hace `broadcast()`: host y jugadores
  conectados reciben `state` (SC-002). Los jugadores inactivos también reciben sus snapshots.

### `session:ended` — NUEVO

```ts
interface SessionEndedPayload { reason: 'removed' | 'password_reset' }
```

Se emite a la sala `player:<id>` justo antes de desconectar sus sockets cuando el host elimina
al jugador o le restablece la contraseña. El cliente vuelve a `/` (pantalla de ingreso) sin
mostrar "Reconectando...". La cookie ya no es válida aunque el evento no llegue.

## Cliente → servidor (con ack, solo host)

Todos pasan por `hostOnly`: desde un socket sin rol host ⇒ `{ ok: false, error: "No autorizado" }`
sin efectos (FR-002, US1-9). Toda acción con `ok` queda en `admin_log` (FR-003).

| Evento | Payload | Efecto | Errores (`error`) |
|--------|---------|--------|-------------------|
| `admin:setActive` | `{ userId: number, active: boolean }` | marca/desmarca participante activo | `"Jugador no encontrado"`; `"Valor inválido"` |
| `admin:rename` | `{ userId: number, username: string }` | cambia el nombre; sesiones intactas | `"Jugador no encontrado"`; `"El usuario debe tener entre 3 y 20 caracteres: letras, números, _ o -"`; `"Ese nombre ya está en uso"` |
| `admin:resetPassword` | `{ userId: number, password: string }` | nuevo hash; borra sesiones; `session:ended` | `"Jugador no encontrado"`; `"La contraseña no puede estar vacía"` |
| `admin:removePlayer` | `{ userId: number }` | saldo → pozo (2 movimientos `carry_in`); anonimiza; borra sesiones; `session:ended` | `"Jugador no encontrado"`; `"No se puede eliminar: tiene una apuesta activa"` |
| `admin:updateHorse` | `{ number: 1–6, name: string, color: ColorToken, coat: CoatName }` | guarda el caballo | `"Solo se pueden editar los caballos sin ronda en curso"`; `"Caballo inválido"`; `"El nombre debe tener entre 1 y 14 caracteres: letras, números, espacios o guiones"`; `"Otro caballo ya se llama así"`; `"Color no permitido"`; `"Otro caballo ya usa ese color"`; `"Pelaje inválido"` |
| `admin:resetHorses` | `{}` | los 6 vuelven a `DEFAULT_HORSES` | `"Solo se pueden editar los caballos sin ronda en curso"` |

Notas:

- "Jugador no encontrado" cubre: id inexistente, cuenta host y cuenta ya eliminada.
- `admin:rename` acepta cambiar solo mayúsculas del propio nombre ("ana" → "Ana").
- La doble confirmación de eliminar (FR-010) y la de restablecer caballos (FR-017) son de UI; el
  servidor ejecuta al recibir el evento.
- "Sin ronda en curso" = fase `idle` o `finished` (FR-015); en `betting` o `racing` se rechaza.
- `host:adjustBalance` de 001 no cambia (sigue por `username`); la pestaña Admin lo reutiliza.
