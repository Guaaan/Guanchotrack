# Implementation Plan: Panel de administración del host

**Branch**: `002-host-admin-panel` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-host-admin-panel/spec.md`

## Summary

La pantalla del host gana dos pestañas, "Juego" y "Admin". En "Admin" el host gestiona a los
jugadores (activo/inactivo para el leaderboard, renombrar, restablecer contraseña, eliminar con
traspaso del saldo al pozo acumulado) y personaliza los 6 caballos (nombre, color de manta de una
lista permitida de la paleta, pelaje). Enfoque: sin dependencias nuevas; el esquema SQLite gana
dos columnas en `users` (`active`, `deleted_at`) y dos tablas (`horses`, `admin_log`); las
acciones viajan como eventos Socket.IO `admin:*` validados por rol y ejecutados en un módulo
nuevo `server/admin.ts`; los snapshots `state` llevan la definición vigente de los caballos
(`horseDefs`) y, al host, la lista de participantes. La eliminación mueve el saldo al pozo con
dos movimientos `carry_in` de signo opuesto (suma cero, invariante intacto). La validación de
caballos y el color del número son funciones puras en `shared/horses.ts`. El motor de carrera
no cambia, por lo que la personalización no puede alterar resultados.

## Technical Context

**Language/Version**: TypeScript 5 sobre Node.js ≥ 20 (servidor) y navegador moderno (cliente)

**Primary Dependencies**: las de 001 (express, socket.io, socket.io-client, better-sqlite3,
bcryptjs, three); ninguna nueva

**Storage**: SQLite embebido (`data/guanchotrack.db`); `ALTER TABLE users` idempotente +
tablas nuevas `horses` y `admin_log` con `CREATE TABLE IF NOT EXISTS`

**Testing**: Vitest — unitarios puros (`horses`, `ranking`) e integración con SQLite `:memory:`
y Socket.IO real (`tests/helpers/server.ts`)

**Target Platform**: igual que 001 (servidor en LAN; host en navegador de escritorio)

**Project Type**: aplicación web (servidor + cliente en un solo paquete)

**Performance Goals**: cambios de admin visibles en todas las pantallas < 1 s (SC-002);
acción típica en < 10 s desde que se abre "Admin" (SC-001)

**Constraints**: un proceso, sin servicios externos, solo paleta PICO-8, monedas enteras,
conservación de monedas (Σ movimientos + Σ apuestas activas = Σ `host_adjust`)

**Scale/Scope**: ~20–50 jugadores en la lista; 6 caballos; 1 pestaña nueva; 2 tablas y 2
columnas nuevas; 6 eventos de socket nuevos + 1 evento servidor → cliente

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución v2.0.1.

| # | Principio | Cumplimiento en el diseño | Estado |
|---|-----------|---------------------------|--------|
| I | Simplicidad Primero | Sin dependencias ni procesos nuevos; un módulo servidor (`admin.ts`) y uno cliente (`host/admin.ts`); migración mínima con `ALTER TABLE` condicionado (patrón ya usado en 001) | ✅ |
| II | Equidad Verificable | Personalización solo visual: `server/domain/race.ts` no recibe caballos; misma semilla ⇒ mismo resultado (test de integración con caballos personalizados); estadísticas inexistentes | ✅ |
| III | Servidor fuente de verdad | Eventos `admin:*` con `hostOnly`; validación de fase, unicidad, formato, existencia y apuesta activa en servidor; el cliente solo envía intenciones | ✅ |
| IV | Tiempo real sincronizado | `horseDefs` y `participants` viajan en el snapshot `state` (también al reconectar); cada acción hace `broadcast()`; cambiar de pestaña no toca el socket ni la escena | ✅ |
| V | Solo monedas ficticias | Sin cambios | ✅ |
| VI | Sin assets externos | Selector de color con muestras CSS de tokens; mantas por `CanvasTexture` como en 001 | ✅ |
| VII | Identidad PICO-8 | Colores de manta = subconjunto de tokens (`BLANKET_COLORS`); color de número por tabla de tokens; ningún literal fuera de `src/palette.ts`; gate `palette` cubre ficheros nuevos | ✅ |
| VIII | Testeabilidad determinista | `validateHorseEdit`, `numberColorFor`, `normalizeHorseName` puros con tests; `rank()` sin cambios (el filtro de activos se aplica antes); tests de conservación tras eliminar | ✅ |
| IX | UI clara y responsive | "Admin" solo en el host (escritorio, spec Assumptions); "Juego" sigue siendo la vista proyectable por defecto; el celular solo muestra nombres/colores vigentes | ✅ |
| X | Parimutuel | El saldo del eliminado entra al pozo acumulado y se reparte en la próxima ronda liquidada; sin comisión | ✅ |
| XI | Transparencia en vivo | Eliminar en `betting` cambia el acumulado ⇒ `broadcast()` recalcula multiplicadores y pagos potenciales con `settle()` | ✅ |
| XII | Conservación | Eliminación = 2 movimientos `carry_in` (−X jugador, +X pozo) en una transacción; rechazo con apuesta activa; test `checkInvariant()` tras cada acción admin | ✅ (ver Complexity Tracking) |
| XIII | Control del host | Acciones validadas por rol y registradas en `admin_log` (autor, acción, objetivo, antes/después, fecha); ajuste de saldo sigue en el libro como `host_adjust` | ✅ |

**Gate inicial**: PASA. **Re-check post-diseño (Phase 1)**: PASA — data model, contratos y
quickstart no introducen violaciones; las dos desviaciones menores están justificadas abajo.

## Project Structure

### Documentation (this feature)

```text
specs/002-host-admin-panel/
├── plan.md              # Este fichero
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── socket-events.md # eventos admin:*, session:ended y cambios en los snapshots
│   └── domain.md        # firmas puras de shared/horses.ts y cambios en ranking/proyecciones
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

Solo ficheros nuevos o modificados:

```text
server/
├── db.ts                # + columnas users.active/deleted_at, tablas horses y admin_log,
│                        #   seed de caballos por defecto, getHorses(), logAdmin()
├── admin.ts             # NUEVO: setActive, renamePlayer, resetPassword, removePlayer,
│                        #   updateHorse, resetHorses (transacciones + admin_log)
├── auth.ts              # login/userFromToken ignoran cuentas eliminadas; deleteUserSessions()
├── game.ts              # ranking solo activos; envío a jugadores por presencia (no por ranking);
│                        #   horseDefs en ambos snapshots; participants en HostState; phase()
├── socket.ts            # eventos admin:* con hostOnly; session:ended + disconnectSockets
└── index.ts             # sin cambios relevantes (Game ya recibe db)

shared/
├── horses.ts            # DEFAULT_HORSES (antes HORSES), BLANKET_COLORS, numberColorFor(),
│                        #   normalizeHorseName(), validateHorseEdit(), isCoatName()
└── types.ts             # horseDefs, participants, payloads admin:*, SessionEndedPayload

src/
├── net.ts               # escucha session:ended ⇒ vuelve a "/"
├── horses.ts            # NUEVO: definiciones vigentes en el cliente (set/get/onChange)
├── play.ts              # usa definiciones vigentes; actualiza cabecera con state.username
└── host/
    ├── main.ts          # pestañas "Juego" / "Admin" (DOM oculto, escena viva)
    ├── admin.ts         # NUEVO: tabla de participantes y editor de caballos
    ├── panel.ts         # usa definiciones vigentes; mensaje "No hay participantes activos"
    ├── scene.ts         # setHorses(defs): reconstruye mallas si cambian (solo fuera de carrera)
    └── horse.ts         # numberColor recibido por parámetro (no desde HORSES)

tests/
├── unit/                # horses (validación, numberColorFor, por defecto)
└── integration/         # admin-participants, admin-remove, admin-horses, admin-permissions
```

**Structure Decision**: se mantiene el paquete único de 001. La lógica de administración va en
un módulo propio (`server/admin.ts`) para no engordar `game.ts` (536 líneas); las reglas puras de
caballos van en `shared/horses.ts` porque las usan servidor (validación) y cliente (selector de
colores libres y color del número).

## Complexity Tracking

| Desviación | Por qué | Alternativa más simple descartada |
|------------|---------|-----------------------------------|
| `ALTER TABLE users ADD COLUMN active` / `deleted_at` condicionados a `PRAGMA table_info` en `openDb` | La base `data/guanchotrack.db` ya existe con jugadores y saldos; `CREATE TABLE IF NOT EXISTS` no agrega columnas | Herramienta de migraciones (dependencia innecesaria); borrar la base (pierde saldos) |
| El traspaso al pozo al eliminar usa `kind = 'carry_in'` en ambas patas (jugador −X, pozo +X) | La restricción `CHECK (kind IN (...))` de `coin_transactions` no puede ampliarse sin reconstruir la tabla del libro; `carry_in` ya significa "entra al pozo acumulado" y las dos patas suman 0, así que el invariante sigue igual | Nuevo `kind` (reconstruir el libro solo-inserción con copia de filas: riesgo sobre datos reales); usar `host_adjust` (rompe el invariante: el total de ajustes cambiaría sin que cambie el total de monedas) |
| La cuenta eliminada conserva su fila con `username = '#deleted-<id>'` | Libera el nombre (índice `UNIQUE COLLATE NOCASE`) sin borrar la fila a la que apuntan `bets`, `sessions` y `coin_transactions` (claves foráneas); `#` no es válido en el registro, así que nadie puede entrar con ella | Borrar la fila (rompe FKs e historial); índice único parcial (exige reconstruir `users`) |
