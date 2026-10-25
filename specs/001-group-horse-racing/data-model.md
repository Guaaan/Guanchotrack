# Data Model: GuanchoTrack

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-10-24

SQLite (`better-sqlite3`), fichero `data/guanchotrack.db`. Seis tablas. Las monedas son
`INTEGER`. Fechas en milisegundos epoch (`INTEGER`). Saldo, pozo acumulado y puntaje **no se
almacenan**: se derivan (ver "Valores derivados").

## Tablas

### users

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | INTEGER PK | autoincrement |
| username | TEXT | `UNIQUE COLLATE NOCASE`; 3–20 chars `[A-Za-z0-9_-]` (FR-007) |
| password_hash | TEXT | bcrypt, cost 10 (FR-006) |
| role | TEXT | `'host'` \| `'player'`; exactamente un `host` (upsert al arrancar) |
| created_at | INTEGER | |

- Alta automática en el login si no existe (FR-002): rol `player`, sin transacciones ⇒ saldo 0.
- El nombre de la cuenta host (`HOST_USER`) no puede registrarse como jugador.

### sessions

| Campo | Tipo | Reglas |
|-------|------|--------|
| token | TEXT PK | 32 bytes aleatorios en hex |
| user_id | INTEGER FK → users | |
| created_at | INTEGER | |

- Sin expiración; se borra en logout (FR-005).

### rounds

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | INTEGER PK | |
| phase | TEXT | `'betting'` \| `'racing'` \| `'finished'` |
| winner_horse | INTEGER NULL | 1–6, al terminar |
| carry_used | INTEGER NULL | pozo acumulado que entró en la liquidación (auditoría) |
| opened_at | INTEGER | |
| finished_at | INTEGER NULL | |

- Ronda actual = la de mayor `id`. Sin filas ⇒ fase pública `idle`.
- Como máximo una ronda con `phase IN ('betting','racing')` (garantizado por la máquina de
  estados en una transacción).

### bets

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | INTEGER PK | |
| round_id | INTEGER FK → rounds | |
| user_id | INTEGER FK → users | solo rol `player` |
| horse | INTEGER | 1–6 |
| amount | INTEGER | ≥ 1 |
| status | TEXT | `'active'` \| `'refunded'` \| `'won'` \| `'lost'` |
| payout | INTEGER NULL | monedas recibidas si `won` |
| confirmed_at | INTEGER | hora de la última confirmación o cambio (desempate de redondeo) |

- Índice único parcial: `(round_id, user_id) WHERE status = 'active'` ⇒ máximo una apuesta
  activa por jugador y ronda (FR-016).
- Cambiar apuesta (FR-018): en una transacción, `UPDATE` de `horse`, `amount`,
  `confirmed_at` + transacciones `bet_refund` (monto anterior) y `bet_place` (monto nuevo).
- No existe cancelación por el jugador (Clarificación Q2).

### results

Una fila por carrera ejecutada (incluidas las anuladas por reinicio).

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | INTEGER PK | |
| round_id | INTEGER FK → rounds | |
| seed | INTEGER | semilla 32 bits generada en servidor (principio II) |
| status | TEXT | `'running'` \| `'annulled'` \| `'final'` |
| winner_horse | INTEGER NULL | |
| final_order | TEXT NULL | JSON `number[]` de 6 caballos, primero a último |
| photo_finish | TEXT NULL | JSON `{ horse, value }[]` de los empatados, si hubo |
| ticks | INTEGER NULL | ticks hasta la meta |
| speed | TEXT | `'normal'` \| `'fast'` \| `'turbo'`, por defecto `'normal'`; velocidad elegida al iniciar (US4b) |
| started_at | INTEGER | |
| ended_at | INTEGER NULL | |

- `speed` solo cambia la duración del tick (200 / 100 / 50 ms); con la misma semilla, el
  resultado es idéntico en cualquier velocidad. En bases creadas antes de US4b, `openDb` agrega
  la columna con un `ALTER TABLE` idempotente (ver plan, Complexity Tracking).
- Máximo una fila `final` por ronda. Con la semilla, `final_order` puede reproducirse con el
  motor puro (auditoría).

### coin_transactions (libro de movimientos)

Solo inserción. Nunca `UPDATE` ni `DELETE`.

| Campo | Tipo | Reglas |
|-------|------|--------|
| id | INTEGER PK | |
| user_id | INTEGER NULL FK → users | `NULL` = cuenta del pozo acumulado |
| round_id | INTEGER NULL FK → rounds | |
| bet_id | INTEGER NULL FK → bets | |
| kind | TEXT | ver tabla siguiente |
| amount | INTEGER | ≠ 0, con signo |
| actor_id | INTEGER FK → users | quién provocó el movimiento (jugador, host o sistema = host) |
| note | TEXT NULL | p. ej. `"set 50"`, `"reset round"`, `"reset race"` |
| created_at | INTEGER | |

| kind | Cuenta | Signo | Cuándo |
|------|--------|-------|--------|
| `bet_place` | jugador | − | apuesta nueva o nuevo monto al cambiar |
| `bet_refund` | jugador | + | monto anterior al cambiar; reinicio de ronda |
| `payout` | jugador | + | liquidación con acertantes |
| `host_adjust` | jugador | ± | fijar/sumar/restar del host (`set` se guarda como delta) |
| `carry_in` | pozo (`NULL`) | + | liquidación sin acertantes: suma de apuestas de la ronda |
| `carry_out` | pozo (`NULL`) | − | liquidación con acertantes que consume el acumulado |

- `carry_in` y `carry_out` **no se insertan cuando su monto es 0**: ronda sin apuestas que
  termina sin acertantes (no hay nada que acumular) o liquidación con acertantes sin pozo
  acumulado previo (no hay nada que consumir). Esto respeta la regla `amount ≠ 0`.

## Valores derivados

- **Saldo de jugador** = `SUM(amount) WHERE user_id = ?`.
- **Pozo acumulado** = `SUM(amount) WHERE user_id IS NULL`.
- **Pozo de la ronda** = `SUM(bets.amount WHERE status='active')` + pozo acumulado.
- **Puntaje** = `COUNT(bets WHERE user_id = ? AND status = 'won')` (FR-023).
- **Orden del leaderboard general** (FR-034): puntaje desc; a igual puntaje, monedas (saldo
  derivado) desc; si persiste el empate, `username` asc sin distinguir mayúsculas
  (`localeCompare('es', { sensitivity: 'base' })`). Solo jugadores (rol `player`); el host no
  aparece. Implementado por `rank()` en `server/domain/ranking.ts`.

## Invariante de conservación (principio XII)

```
Σ coin_transactions.amount (todas las filas) + Σ bets.amount (status='active')
  = Σ coin_transactions.amount (kind='host_adjust')
```

Se verifica en tests tras cada operación (apostar, cambiar, reiniciar ronda, reiniciar carrera,
liquidar con y sin acertantes, ajuste de host) y puede ejecutarse al arrancar como chequeo.

## Máquina de estados de la ronda

```
           openRound (host)
idle ───────────────────────► betting ◄───────────────┐
finished ───────────────────►    │  ▲                  │ resetRace (host)
                                 │  │ resetRound        │ o reinicio del servidor
                     startRace   │  │ (host: devuelve   │ (results.status='annulled',
                      (host)     ▼  │  apuestas)        │  apuestas intactas)
                              racing ──────────────────┘
                                 │
                                 │ un caballo llega a la meta (servidor)
                                 ▼
                              finished  (liquidación + puntos en una transacción)
```

| Transición | Precondición | Efectos (una transacción) |
|------------|--------------|---------------------------|
| openRound | fase `idle` o `finished` | `INSERT rounds(phase='betting')` |
| placeBet | fase `betting`; rol player; `1 ≤ amount ≤ saldo + apuesta activa` | insert/update `bets` + ledger |
| resetRound | fase `betting` | apuestas activas → `refunded` + `bet_refund` por cada una |
| startRace | fase `betting` | `INSERT results(status='running', seed)`; `phase='racing'` |
| resetRace | fase `racing` | `results.status='annulled'`; `phase='betting'` |
| finish | carrera llega a meta | `results` → `final`; liquidar (`settle`); apuestas → `won`/`lost` + `payout`; ledger `payout` y `carry_out` (si el acumulado > 0), o `carry_in` (si hubo apuestas); `phase='finished'` |
| hostAdjust | cualquier fase; destino rol player; saldo resultante ≥ 0 | ledger `host_adjust` |

## Estado en memoria (no persistido)

- Carrera en curso: `{ resultId, seed, rngState, positions[6], tick }`; se reconstruye con
  `createRace(seed)` si hiciera falta, pero tras reinicio del servidor la carrera se anula
  (FR-041).
- Presencia: `Map<userId, nº de sockets>` para "faltan por apostar" (Clarificación Q3).
