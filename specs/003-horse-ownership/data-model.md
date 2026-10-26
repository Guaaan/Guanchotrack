# Data Model: Propiedad de caballos

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Amplía [002 data-model](../002-host-admin-panel/data-model.md). Solo se describen cambios.

## Esquema SQLite

### `horses` (modificada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `number` | INTEGER PK 1–6 | Carril; identidad interna, no cambia (R1) |
| `name` | TEXT | 1–16 caracteres normalizados; único sin mayúsculas (validado en código) |
| `color` | TEXT | ∈ `BLANKET_COLORS`, único (002) |
| `coat` | TEXT | castano · pinto · tordo · palomino (002) |
| `dorsal` | INTEGER **nueva** | 1–99, único entre los 6 (validado en código); migración: `= number` |
| `owner_id` | INTEGER NULL **nueva** → `users(id)` | Dueño actual; `NULL` = establo |

### `horse_purchases` (nueva, solo inserción)

| Columna | Tipo | Regla |
|---------|------|-------|
| `id` | INTEGER PK | |
| `horse` | INTEGER 1–6 | Carril |
| `buyer_id` | INTEGER → `users(id)` | Jugador comprador |
| `seller_id` | INTEGER NULL → `users(id)` | `NULL` = establo |
| `price` | INTEGER | 30 si `seller_id IS NULL`, 50 si no |
| `name` | TEXT | Nombre del caballo al comprarlo |
| `dorsal` | INTEGER | Número del caballo al comprarlo |
| `round_id` | INTEGER NULL → `rounds(id)` | Ronda vigente al comprar (si hay) |
| `created_at` | INTEGER | ms |

### `results` (modificada)

| Columna | Tipo | Regla |
|---------|------|-------|
| `owner_id` | INTEGER NULL **nueva** | Dueño del ganador al liquidar |
| `owner_share` | INTEGER NOT NULL DEFAULT 0 **nueva** | `floor(pot / 10)` si hubo dueño, si no 0 |

### `coin_transactions` (reconstruida una vez, R3)

`kind` ∈ `bet_place · bet_refund · payout · host_adjust · carry_in · carry_out ·`
**`horse_buy · horse_sale · owner_share`**. Resto sin cambios.

| Operación | Asientos (todos en una transacción) | Σ |
|-----------|--------------------------------------|---|
| Compra al establo | comprador `horse_buy −30`; pozo (`user_id NULL`) `horse_buy +30` | 0 |
| Compra a jugador | comprador `horse_buy −50`; vendedor `horse_sale +50` | 0 |
| Liquidación con dueño y acertantes | dueño `owner_share +S`; acertantes `payout`; pozo `carry_out −carry` | 0 respecto a las apuestas que dejan de estar activas |
| Liquidación con dueño sin acertantes | dueño `owner_share +S`; pozo `carry_in`/`carry_out` por `staked − S` | ídem |

Invariante (sin cambios): `Σ movimientos + Σ apuestas activas = Σ host_adjust`.

### `admin_log` (reconstruida una vez, R8)

`action` gana `owner_edit_horse` (autor = jugador dueño). `update_horse` y `reset_horses`
guardan también `dorsal` en `before`/`after`.

## Tipos compartidos

```ts
interface Horse {            // shared/horses.ts (= HorseDef)
  number: HorseNumber;       // carril 1–6
  dorsal: number;            // NUEVO: 1–99, lo que se muestra como "número"
  name: string;              // 1–16
  color: ColorToken;
  numberColor: 'white' | 'black';
  coat: CoatName;
  owner: string | null;      // NUEVO: nombre del dueño; null = establo
}
```

## Reglas y transiciones

```text
establo ──comprar (30 → pozo)──▶ dueño A ──comprar (50 → A)──▶ dueño B ──…
   ▲                                │
   └──── host elimina a A ──────────┘   (sin devolución)
```

- Compra/edición permitida en `idle`, `betting`, `finished`; rechazada en `racing`.
- Al cambiar de dueño se conservan `name`, `dorsal`, `color`, `coat`.
- `removePlayer` (002): `UPDATE horses SET owner_id = NULL WHERE owner_id = ?` en la misma
  transacción; rechazado en `racing` si el jugador tiene caballos (R6).
- `resetHorses` (002): repone `name`, `dorsal = number`, `color`, `coat`; no toca `owner_id`.
- Ganancia de un dueño por caballo: `SUM(results.owner_share)` con `owner_id = dueño`,
  `winner_horse = carril`, `status = 'final'`.

## Migración (en `openDb`, idempotente)

1. `addColumn(horses, dorsal)`, `addColumn(horses, owner_id)`, `UPDATE horses SET dorsal =
   number WHERE dorsal IS NULL`.
2. `addColumn(results, owner_id)`, `addColumn(results, owner_share … DEFAULT 0)`.
3. `CREATE TABLE IF NOT EXISTS horse_purchases`.
4. Si el `sql` de `coin_transactions` no contiene `owner_share`: reconstruirla con el `CHECK`
   ampliado copiando todas las filas con su `id`; ídem `admin_log` si no contiene
   `owner_edit_horse`. Todo en una transacción; después `checkInvariant()` debe seguir en `true`.
