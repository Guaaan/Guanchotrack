# Implementation Plan: Propiedad de caballos

**Branch**: `003-horse-ownership` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-horse-ownership/spec.md`

## Summary

Los 6 caballos pueden tener dueño. Un jugador compra al establo por 30 (van al pozo acumulado) o
a otro jugador por 50 (van al vendedor), fuera de la carrera; el dueño edita nombre (1–16) y
número visible (dorsal 1–99); el host sigue editándolo todo. Cuando gana un caballo con dueño, el
dueño cobra `floor(pozo / 10)` y el resto se reparte por parimutuel; los multiplicadores en vivo
ya lo descuentan. Enfoque: sin dependencias nuevas; el carril 1–6 sigue siendo la identidad
interna y se agrega `dorsal`; `horses` gana `owner_id`; tabla nueva `horse_purchases`; `results`
guarda dueño y parte del dueño; el libro gana los tipos `horse_buy`, `horse_sale` y
`owner_share` (reconstrucción única de la tabla). La regla de pago vive en las funciones puras de
`payouts.ts` con un argumento obligatorio de dueños, de modo que liquidación y pago potencial
usan la misma función. Compras y ediciones de jugador van en un módulo nuevo `server/stable.ts`
con eventos `horse:buy` y `horse:edit`.

## Technical Context

**Language/Version**: TypeScript 5 sobre Node.js ≥ 20 (servidor) y navegador moderno (cliente)

**Primary Dependencies**: las de 001/002 (express, socket.io, socket.io-client, better-sqlite3,
bcryptjs, three); ninguna nueva

**Storage**: SQLite embebido (`data/guanchotrack.db`); columnas nuevas por `addColumn`, tabla
`horse_purchases`, y reconstrucción única de `coin_transactions` y `admin_log` para ampliar sus
`CHECK` (R3, R8)

**Testing**: Vitest — unitarios puros (`payouts`, `horses`) e integración con SQLite `:memory:` y
Socket.IO real (`tests/helpers/server.ts`)

**Target Platform**: igual que 001 (servidor en LAN; host en escritorio; jugadores en celular)

**Project Type**: aplicación web (servidor + cliente en un solo paquete)

**Performance Goals**: compras y ediciones visibles en todas las pantallas < 1 s (SC-002);
compra en < 10 s desde que se abre "Caballos" (SC-001)

**Constraints**: un proceso, sin servicios externos, solo paleta PICO-8, monedas enteras,
conservación de monedas (Σ movimientos + Σ apuestas activas = Σ `host_adjust`), pago potencial
= pago final

**Scale/Scope**: 6 caballos, ~20–50 jugadores; 2 eventos de jugador nuevos; 3 eventos de host
modificados; 1 tabla nueva, 4 columnas nuevas, 3 tipos de movimiento nuevos; 1 sección nueva en
el celular

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución v2.1.0.

| # | Principio | Cumplimiento en el diseño | Estado |
|---|-----------|---------------------------|--------|
| I | Simplicidad Primero | Sin dependencias; un módulo servidor (`stable.ts`) y uno cliente (`src/stable.ts`); migración en `openDb` | ✅ (ver Complexity Tracking) |
| II | Equidad Verificable | Dueño, nombre y dorsal no llegan al motor (`race.ts` sin cambios); misma semilla ⇒ mismo resultado (test) | ✅ |
| III | Servidor fuente de verdad | `horse:buy`/`horse:edit` validan rol, dueño, fase, saldo, dueño esperado, unicidad y rangos en transacción; el cliente solo envía intenciones | ✅ |
| IV | Tiempo real sincronizado | `horseDefs` (con `dorsal`, `owner`), `myHorses` y `purchases` en el snapshot `state`; cada acción hace `broadcast()` | ✅ |
| V | Solo monedas ficticias | Precios en monedas del juego; nada externo | ✅ |
| VI | Sin assets externos | Dorsal en `CanvasTexture` como en 001; muestras de manta en CSS con tokens | ✅ |
| VII | Identidad PICO-8 | Sin colores nuevos; la sección "Caballos" usa tokens; gate `palette` cubre ficheros nuevos | ✅ |
| VIII | Testeabilidad determinista | `ownerShare`, `settle`, `multipliers`, `purchasePrice`, `validateHorseIdentity` puros con tests de redondeo, parte del dueño y conservación | ✅ |
| IX | UI clara y responsive | Sección "Caballos" desde 320 px; en el host dueño y nombre en paneles, dorsal en la pista; historial solo en "Admin" | ✅ |
| X | Parimutuel con dueño | `settle(..., owned)` paga `floor(pot/10)` al dueño y reparte el resto; sin dueño 100 %; sin acertantes el resto al acumulado; sin comisión | ✅ |
| XI | Transparencia | `multipliers(..., owned)` y `settle` son la misma regla para pago potencial y final; recalculo en cada compra/apuesta/eliminación | ✅ |
| XII | Conservación | Compras = 2 asientos que suman 0 (jugador → pozo o jugador → jugador); parte del dueño sale del pozo; `horse_purchases` + libro; `checkInvariant()` en tests | ✅ |
| XIII | Control del host | Host edita cualquier caballo; ediciones y compras quedan registradas; eliminar dueño en carrera se rechaza para no alterar la liquidación | ✅ |

**Gate inicial**: PASA. **Re-check post-diseño (Phase 1)**: PASA — data model, contratos y
quickstart no introducen violaciones; la reconstrucción de tablas está justificada abajo.

## Project Structure

### Documentation (this feature)

```text
specs/003-horse-ownership/
├── plan.md              # Este fichero
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── socket-events.md # horse:buy, horse:edit, cambios admin:* y snapshots
│   └── domain.md        # ownerShare/settle/multipliers con dueño, purchasePrice, validación
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

Solo ficheros nuevos o modificados:

```text
server/
├── db.ts                # + horses.dorsal/owner_id, results.owner_id/owner_share,
│                        #   horse_purchases, reconstrucción de coin_transactions/admin_log,
│                        #   TxKind/AdminAction ampliados, getHorses() con dorsal y owner
├── domain/payouts.ts    # ownerShare(); settle(..., owned); multipliers(..., owned)
├── stable.ts            # NUEVO: buyHorse, editHorse (transacción + libro + historial)
├── game.ts              # finishRace con parte del dueño; odds/potential con dueños;
│                        #   myHorses, result.owner, purchases en snapshots
├── admin.ts             # updateHorse con dorsal y ventana "no racing"; resetHorses conserva
│                        #   dueños; removePlayer libera caballos y bloquea en carrera
├── socket.ts            # horse:buy, horse:edit
└── index.ts             # crea Stable y lo pasa a attachSocket

shared/
├── horses.ts            # Horse + dorsal/owner; precios; purchasePrice();
│                        #   validateHorseIdentity(); validateHorseEdit con dorsal y 16 chars
└── types.ts             # BuyHorsePayload, EditHorsePayload, myHorses, result.owner, purchases

src/
├── stable.ts            # NUEVO: sección "Caballos" del celular (lista, comprar, editar, ganado)
├── play.ts              # monta la sección; muestra dorsal en vez de carril
├── styles.css           # estilos de la sección (tokens)
└── host/
    ├── horse.ts         # numberTexture con dorsal de 1–2 cifras
    ├── scene.ts         # pasa dorsal a las mallas
    ├── panel.ts         # nombre, dorsal y dueño; parte del dueño en el resultado
    └── admin.ts         # editor con dorsal; historial de compras

tests/
├── unit/                # payouts (dueño), horses (precio, identidad)
└── integration/         # horse-buy, horse-owner-payout, horse-edit, horse-conservation,
                         #   horse-migration; admin-horses y admin-remove ampliados
```

**Structure Decision**: paquete único de 001. Las acciones de jugador sobre caballos van en
`server/stable.ts` (análogo a `admin.ts`) para no engordar `game.ts` (581 líneas); la regla de
dinero sigue en `domain/payouts.ts` y las reglas de caballo en `shared/horses.ts`, compartidas
por servidor y cliente (precio y validación previa en la UI).

## Complexity Tracking

| Desviación | Por qué | Alternativa más simple descartada |
|------------|---------|-----------------------------------|
| Reconstrucción única de `coin_transactions` (y `admin_log`) para ampliar el `CHECK` de `kind`/`action` | FR-019 exige distinguir la parte del dueño del pago de apuesta, y no hay tipo existente para jugador → jugador; SQLite no permite `ALTER` de un `CHECK` | Reusar `carry_in`/`payout` con `note` (auditoría ambigua, como admitió 002 al reutilizar `carry_in`); columna `reason` paralela a `kind` (dos campos para lo mismo). Mitigación: transacción, copia de `id`, test de migración y copia de la base antes de arrancar |
| Dos conceptos de "número": carril (`number`, interno) y `dorsal` (visible) | Apuestas, resultados y motor usan el carril; el dorsal editable es solo visual (FR-015) | Renombrar `number` → `lane` en todo el código (churn sin beneficio) |
| `removePlayer` se rechaza en carrera si el jugador tiene caballos | Mantiene FR-022 (dueño al cerrar apuestas = dueño al liquidar) sin guardar una foto de dueños | Foto de dueños en `results` al iniciar (más estado y riesgo de pagar a una cuenta eliminada) |
