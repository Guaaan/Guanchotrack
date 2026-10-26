# Data Model: Panel de administración del host

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-26

Amplía el modelo de [001](../001-group-horse-racing/data-model.md). Solo se describen cambios.

## Esquema SQLite

### `users` (modificada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `active` | `INTEGER NOT NULL DEFAULT 1` | 1 = participante activo (aparece en el leaderboard). Nuevo registro ⇒ 1 (FR-005). Sin efecto en apuestas ni cobros (FR-007) |
| `deleted_at` | `INTEGER` | NULL = cuenta viva; timestamp = eliminada (FR-010) |

Se agregan con `ALTER TABLE` condicionado a `PRAGMA table_info(users)` (research R1).

Reglas derivadas:
- Jugador vivo: `role = 'player' AND deleted_at IS NULL`. Solo estos aparecen en la lista Admin.
- Participante del leaderboard: jugador vivo con `active = 1`.
- Cuenta eliminada: `username = '#deleted-<id>'`, `active = 0`, `deleted_at` fijado, sin filas en
  `sessions`, saldo derivado 0. Se muestra como `"(eliminado)"` en cualquier proyección.
- La cuenta host nunca es objetivo de acciones Admin (todas filtran `role = 'player'`).

### `horses` (nueva)

```sql
CREATE TABLE IF NOT EXISTS horses (
  number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 6),
  name   TEXT NOT NULL,
  color  TEXT NOT NULL,
  coat   TEXT NOT NULL CHECK (coat IN ('castano', 'pinto', 'tordo', 'palomino'))
);
```

- Sembrada en `openDb` con `INSERT OR IGNORE` desde `DEFAULT_HORSES` (1 Rojo/red/castaño,
  2 Naranjo/orange/pinto, 3 Amarillo/yellow/tordo, 4 Verde/green/palomino, 5 Azul/blue/pinto,
  6 Rosado/pink/castaño). Siempre 6 filas; no se insertan ni borran después.
- Validación en servidor con `validateHorseEdit()` ([contracts/domain.md](./contracts/domain.md)):
  - `name`: normalizado, 1–14 caracteres, `/^[\p{L}\p{N} -]+$/u`, único entre los 6 sin distinguir
    mayúsculas (FR-012).
  - `color`: ∈ `BLANKET_COLORS` (13 tokens: todos menos `brown`, `dark-green`, `dark-blue`) y
    distinto del de los otros 5 (FR-013).
  - `coat`: ∈ `CoatName`.
- `numberColor` no se almacena: `numberColorFor(color)` (FR-013, research R8).
- Modificable solo con fase `idle` o `finished` (FR-015).

### `admin_log` (nueva, solo inserción)

```sql
CREATE TABLE IF NOT EXISTS admin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   INTEGER NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL CHECK (action IN ('set_active', 'rename', 'reset_password',
                                             'remove_player', 'update_horse', 'reset_horses')),
  target     TEXT NOT NULL,          -- 'user:<id>' | 'horse:<n>' | 'horses'
  before     TEXT,                   -- JSON o NULL
  after      TEXT,                   -- JSON o NULL
  created_at INTEGER NOT NULL
);
```

| Acción | `before` | `after` |
|--------|----------|---------|
| `set_active` | `{"active":true}` | `{"active":false}` |
| `rename` | `{"username":"ana"}` | `{"username":"anita"}` |
| `reset_password` | NULL | NULL (nunca hash ni contraseña) |
| `remove_player` | `{"username":"beto","balance":80}` | `{"carry":100}` |
| `update_horse` | `{"name","color","coat"}` | `{"name","color","coat"}` |
| `reset_horses` | los 6 anteriores | los 6 por defecto |

Se escribe en la misma transacción que la acción (FR-003).

### `coin_transactions` (sin cambios de esquema)

Uso nuevo al eliminar un jugador con saldo X > 0 (research R3, FR-010):

| user_id | kind | amount | actor_id | note |
|---------|------|--------|----------|------|
| jugador | `carry_in` | −X | host | `remove` |
| NULL (pozo) | `carry_in` | +X | host | `remove <id>` |

Suma 0 ⇒ `checkInvariant()` se mantiene (FR-011, SC-003).

## Transiciones de un jugador

```text
          registro
             │
             ▼
   ┌──── activo ◄────────┐
   │        │  desmarcar  │ marcar
   │        ▼             │
   │     inactivo ────────┘
   │        │
   └────────┴──► eliminado   (sin apuesta activa; saldo → pozo; definitivo)
```

- Renombrar y restablecer contraseña no cambian el estado.
- Restablecer contraseña y eliminar borran sus `sessions` y cierran sus sockets.
- Eliminar con `bets.status = 'active'` en la ronda actual ⇒ rechazo, sin efectos.

## Proyecciones (snapshots)

Cambios en `shared/types.ts` (detalle en [contracts/socket-events.md](./contracts/socket-events.md)):

- `HorseDef` = `{ number, name, color, numberColor, coat }` (igual que el `Horse` de 001).
- `PlayerState.horseDefs` y `HostState.horseDefs`: los 6 caballos vigentes, ordenados por número.
- `HostState.participants`: todos los jugadores vivos con `{ id, username, score, balance, online,
  active, hasActiveBet }`, ordenados por nombre.
- `HostState.leaderboard`: solo activos, con el mismo `rank()` de 001 (FR-006).
- `PlayerState.myRank`: `null` si el jugador está inactivo; `total` cuenta solo activos.
- Usernames de cuentas eliminadas en `result.winners` y `horses[].bets` ⇒ `"(eliminado)"`.
