# Research: Propiedad de caballos

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-26

Parte del stack y de las decisiones de [001](../001-group-horse-racing/research.md) y
[002](../002-host-admin-panel/research.md). No se agregan dependencias. No quedan NEEDS
CLARIFICATION.

## R1. Identidad del caballo: carril fijo + número visible editable

- **Decision**: `horses.number` (1–6) sigue siendo la clave y la identidad interna (carril): la
  usan `bets.horse`, `results.winner_horse`, `final_order`, el motor de carrera y el tipo
  `HorseNumber`. Se agrega `horses.dorsal INTEGER` (1–99, por defecto = `number`), que es lo que
  la UI llama "número". En `Horse` (shared) se agrega `dorsal: number`; `number` conserva su
  significado de carril.
- **Rationale**: cambiar la identidad tocaría apuestas, resultados, motor y todos los tests; el
  dorsal es solo visual (FR-015) y así el historial sigue identificando por carril.
- **Alternatives considered**: renombrar `number` → `lane` en todo el código (mucho churn sin
  beneficio funcional); usar el dorsal como clave (rompe historial y apuestas al cambiarlo).

## R2. Dueño en `horses` y migración

- **Decision**: `addColumn(horses, 'owner_id', 'INTEGER REFERENCES users(id)')` y
  `addColumn(horses, 'dorsal', 'INTEGER')`, y después `UPDATE horses SET dorsal = number WHERE
  dorsal IS NULL`. Los 6 caballos quedan sin dueño (FR-001). Sin índice único de dorsal: el
  restablecimiento cambia dorsales uno a uno y un índice fallaría con estados intermedios; la
  unicidad se valida en la función pura y en la transacción.
- **Rationale**: mismo patrón idempotente de 001/002 (`PRAGMA table_info`).
- **Alternatives considered**: tabla aparte `horse_owners` (join extra, mismo dato).

## R3. Nuevos tipos de movimiento en el libro

- **Decision**: ampliar `coin_transactions.kind` con `horse_buy`, `horse_sale` y `owner_share`.
  Como SQLite no permite cambiar un `CHECK`, `openDb` reconstruye la tabla **una sola vez**, si
  su `sql` en `sqlite_master` no contiene `owner_share`: en una transacción crea
  `coin_transactions_new` con el `CHECK` ampliado, copia todas las filas con sus `id`, borra la
  vieja, renombra y recrea el índice `coin_transactions_user`. Asientos:
  - compra al establo: `{ user: comprador, kind: horse_buy, −30 }` + `{ user: NULL (pozo),
    kind: horse_buy, +30 }`;
  - compra a jugador: `{ user: comprador, kind: horse_buy, −50 }` + `{ user: vendedor,
    kind: horse_sale, +50 }`;
  - parte del dueño: `{ user: dueño, kind: owner_share, +X, round }`.
  `note` lleva `horse:<carril> purchase:<id>` para enlazar con el historial.
- **Rationale**: FR-019 pide que la parte del dueño y el pago de su apuesta sean movimientos
  distintos, y la auditoría (principio XII) es más clara con tipos propios que reusando
  `carry_in`/`payout` con notas. El invariante `Σ movimientos + Σ apuestas activas = Σ
  host_adjust` no cambia: cada compra suma 0 y la parte del dueño sale del pozo de la ronda
  (ver R5).
- **Alternatives considered**: reusar `carry_in` como en 002 (no existe un tipo razonable para
  jugador → jugador ni para distinguir la parte del dueño); columna nueva `reason` (dos campos
  con el mismo propósito). Riesgo de la reconstrucción: se mitiga con transacción, copia de `id`
  y un test de migración sobre una base con datos de 001/002; el quickstart pide copiar la base
  real antes de arrancar.

## R4. Funciones puras de pago con dueño

- **Decision**: en `server/domain/payouts.ts`:
  - `ownerShare(pot) = Math.floor(pot / 10)` (= floor(pot × 10 / 100)).
  - `settle(bets, carry, winner, owned: boolean)` → `{ ownerShare, payouts, carryOut }`. Si
    `owned`, reparte `pot − ownerShare` con la regla actual (floor + sobrante por mayor resto,
    `confirmedAt`, `userId`); si no, idéntico a hoy con `ownerShare = 0`. Sin acertantes:
    `carryOut = pot − ownerShare`.
  - `multipliers(bets, carry, owned: ReadonlySet<HorseNumber>)`: `(pot − share(h)) / total(h)`
    con `share(h) = owned.has(h) ? ownerShare(pot) : 0`.
  El argumento nuevo es obligatorio para que ningún llamador olvide el descuento.
- **Rationale**: misma función para pago potencial y liquidación (principios VIII y XI; FR-020).
- **Alternatives considered**: restar la parte del dueño en `game.ts` antes de llamar a `settle`
  (duplica la regla entre multiplicador y liquidación).

## R5. Liquidación y pozo acumulado

- **Decision**: en `finishRace`, con `owned = horses.owner_id del ganador IS NOT NULL`:
  - parte del dueño > 0 ⇒ movimiento `owner_share`;
  - con acertantes ⇒ pagos `payout` y `carry_out −carry` (como hoy);
  - sin acertantes ⇒ el pozo acumulado cambia en `staked − ownerShare`: `carry_in` si es
    positivo, `carry_out` si es negativo (el acumulado paga parte del dueño), nada si es 0. Sin
    dueño queda exactamente como hoy (`carry_in staked`).
  `results` gana `owner_id` y `owner_share` (persisten para el resultado tras reiniciar y para
  "lo que te ha generado").
- **Rationale**: conserva los asientos de 001 cuando no hay dueño (los tests existentes no
  cambian) y mantiene el invariante: lo que sale del pozo = pagos + parte del dueño.
- **Alternatives considered**: vaciar siempre el acumulado y reingresar el resto (cambia los
  asientos de 001 sin necesidad).

## R6. El dueño no cambia durante la carrera

- **Decision**: compras y ediciones se rechazan en `racing` (FR-006) y `removePlayer` (002) se
  rechaza en `racing` si el jugador es dueño de algún caballo. Así el dueño al liquidar es el
  dueño al iniciar (FR-022) sin guardar una foto de dueños al iniciar la carrera.
- **Rationale**: lo más simple que cumple FR-022.
- **Alternatives considered**: guardar `owners` en `results` al iniciar (más estado; y pagar a
  una cuenta eliminada dejaría monedas inaccesibles).

## R7. Compra concurrente y precio vigente

- **Decision**: `horse:buy { horse, expectedOwner }`, donde `expectedOwner` es el dueño que el
  jugador vio (`HorseDef.owner`, `null` = establo). En una transacción (better-sqlite3 es
  síncrono, las transacciones no se intercalan) el servidor lee el dueño actual y rechaza si
  difiere de `expectedOwner` ("Este caballo cambió de dueño, revisa el precio"), si es el propio
  comprador, si la fase es `racing` o si `balanceOf < precio`. El precio sale de
  `purchasePrice(ownerId, buyerId)` (30 / 50 / `null` si es propio).
- **Rationale**: FR-005 y Edge Cases (dos compras a la vez, precio cambiado): la segunda compra
  ve otro dueño y se rechaza sin cobrar; también cubre el paso de A a B (mismo precio, otro
  vendedor), que comparar solo el precio no detectaría.
- **Alternatives considered**: enviar el precio esperado (no detecta el cambio de vendedor);
  bloqueo optimista con versión por caballo (campo extra sin beneficio frente al dueño).

## R8. Edición: dueño y host

- **Decision**: funciones puras en `shared/horses.ts`:
  - `validateHorseIdentity(current, lane, name, dorsal)` → nombre normalizado o error (1–16,
    regex de 002 con 16, único sin mayúsculas; dorsal entero 1–99, único).
  - `validateHorseEdit` (host) llama a la anterior y además valida color y pelaje.
  Evento nuevo `horse:edit { horse, name, dorsal }` (jugador dueño) y `admin:updateHorse` gana
  `dorsal`. Ambas ventanas: cualquier fase menos `racing` (FR-006, FR-013); se reemplaza
  `requireNoRound` de 002 por `requireNotRacing`. "Restablecer caballos" repone `name`, `dorsal`,
  `color` y `coat` y no toca `owner_id` (FR-014). Las ediciones del dueño se registran en
  `admin_log` con acción nueva `owner_edit_horse` (actor = jugador).
- **Rationale**: reutiliza las reglas de 002 en una sola función; FR-012 sube el límite a 16.
- **Alternatives considered**: tabla de log aparte para dueños (mismo formato que `admin_log`).
  Ampliar el `CHECK` de `admin_log.action` exige otra reconstrucción: se hace en el mismo paso de
  migración que R3 (tabla pequeña, solo-inserción, misma técnica).

## R9. Historial de compras y "lo que te ha generado"

- **Decision**: tabla `horse_purchases (id, horse, buyer_id, seller_id NULL, price, name,
  dorsal, round_id NULL, created_at)` con nombre y dorsal en el momento de la compra (FR-031).
  El host recibe las últimas 50 en `HostState.purchases` (más recientes primero); nombres de
  cuentas eliminadas como `(eliminado)` (FR-034). "Lo que te ha generado" =
  `SUM(results.owner_share) WHERE owner_id = jugador AND winner_horse = carril AND status =
  'final'`, enviado solo al dueño en `PlayerState.myHorses`.
- **Rationale**: consultas simples sobre datos ya persistidos; suma todas las etapas como dueño
  (FR-024, US3-8).
- **Alternatives considered**: sumar `owner_share` del libro filtrando por `note` (frágil).

## R10. Privacidad del dueño en el celular

- **Decision**: `HorseDef` gana `owner: string | null` (nombre del dueño, o `(eliminado)` nunca
  ocurre porque al eliminar el caballo vuelve al establo). El cliente muestra "tú" comparando con
  `state.username`. Excepción explícita a FR-029 de 001 (FR-025).
- **Rationale**: un solo campo público; nada más de otros jugadores se envía al celular.
- **Alternatives considered**: `ownerId` (expone ids internos sin necesidad).

## R11. Número de dos cifras en la manta

- **Decision**: `numberTexture` recibe el dorsal y reduce el tamaño de fuente para 2 cifras
  (p. ej. 104 px → 80 px) para que quepa en la manta con el mismo contorno; `spotsTexture` sigue
  sembrado por carril (las manchas del pinto no cambian al cambiar el dorsal). La escena
  reconstruye las mallas cuando cambia `horseDefs` (ya existe en 002) y no hay carrera.
- **Rationale**: FR-028 con los criterios de legibilidad de FR-030b de 001.
- **Alternatives considered**: tipografía condensada (fuentes del sistema no garantizadas).

## R12. UI del jugador

- **Decision**: módulo nuevo `src/stable.ts` que pinta la sección "Caballos" en `play.html`
  (debajo de la apuesta, visible en todas las fases; botones deshabilitados en `racing`). Cada
  fila: muestra de manta con dorsal, nombre, pelaje, dueño ("establo", "tú" o nombre) y botón
  "Comprar 30/50". En los propios: "Editar" (nombre + número en línea) y "te ha generado N". El
  resto de `play.ts` pasa a mostrar `dorsal` donde hoy muestra `number`.
- **Rationale**: aísla la sección para no engordar `play.ts` (196 líneas).
- **Alternatives considered**: pestañas en el celular (más navegación en pantallas pequeñas).
