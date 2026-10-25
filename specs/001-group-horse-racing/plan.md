# Implementation Plan: GuanchoTrack — Carreras de caballos 3D en grupo

**Branch**: `001-group-horse-racing` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-group-horse-racing/spec.md`

## Summary

App web de carreras de caballos para jugar en grupo: un host proyecta la carrera 3D y el panel
de la ronda; los jugadores apuestan monedas ficticias desde el celular en un pozo común
parimutuel sin comisión (con pozo acumulado si nadie acierta). Enfoque: un único proceso
Node.js + TypeScript (Express + Socket.IO + Vite en middleware mode) con SQLite embebido; el
servidor es autoritativo, simula la carrera con un PRNG con semilla (40 casillas, p = 1/10,
photo finish; tick de 200, 100 o 50 ms según la velocidad que el host elige antes de iniciar) y
emite snapshots de estado proyectados por rol. El dinero vive en un
libro de movimientos solo-inserción del que se derivan saldos y pozo acumulado. Frontend sin
framework: `/play` en HTML/CSS y `/host` con Three.js procedural y cuantización final a la
paleta PICO-8. Todo lo mínimo posible (YAGNI).

## Technical Context

**Language/Version**: TypeScript 5 sobre Node.js ≥ 20 (servidor) y navegador moderno (cliente)

**Primary Dependencies**: express, socket.io, socket.io-client, better-sqlite3, bcryptjs,
three; dev: vite, tsx, typescript, vitest, @types/*

**Storage**: SQLite embebido (`better-sqlite3`), fichero `data/guanchotrack.db`, WAL

**Testing**: Vitest (unitarios puros + integración con SQLite `:memory:` y Socket.IO real en
puerto efímero)

**Target Platform**: servidor en LAN (macOS/Linux/Windows con Node); clientes Chrome/Safari
móvil y navegador de escritorio con WebGL

**Project Type**: aplicación web (servidor + cliente en un solo paquete)

**Performance Goals**: cambios visibles en todas las pantallas < 1 s (SC-003); escena host a
60 fps en un portátil común; tick de carrera estable a la velocidad elegida (200 / 100 / 50 ms)

**Constraints**: un proceso, una partida, sin servicios externos ni CDNs, sin assets
externos, solo paleta PICO-8, monedas enteras

**Scale/Scope**: 1 host + ~20–50 jugadores simultáneos (SC-004); 3 páginas; 6 tablas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución v2.0.0.

| # | Principio | Cumplimiento en el diseño | Estado |
|---|-----------|---------------------------|--------|
| I | Simplicidad Primero | 1 proceso y 1 puerto (Vite middleware en dev); SQLite embebido; 6 deps de runtime, cada una justificada en research; sin ORM, sin framework UI, sin migraciones | ✅ |
| II | Equidad Verificable | 6 caballos sin estadísticas; `mulberry32` con semilla de `crypto.randomInt` solo en servidor; semilla en `results.seed`; cliente sin RNG de juego; la velocidad solo cambia el intervalo del tick, nunca el consumo del RNG (misma semilla ⇒ mismo resultado); pelajes visuales y deterministas | ✅ |
| III | Servidor fuente de verdad | Cliente solo emite `bet:place` y `host:*`; validación de fase, rol, saldo y rango en servidor; saldos derivados del libro | ✅ |
| IV | Tiempo real sincronizado | Socket.IO; snapshot `state` a todos tras cada cambio y cada tick; snapshot al reconectar; lerp visual sin afectar resultado | ✅ |
| V | Solo monedas ficticias | Sin integración de pagos; enteros sin valor | ✅ |
| VI | Sin assets externos | Geometría procedural, `CanvasTexture` para números/meta; fuentes del sistema (no fuente pixel); test `assets` | ✅ (ver nota 1) |
| VII | Identidad PICO-8 | `src/palette.ts` único origen; CSS vars generadas desde él; pasada de cuantización a paleta tras Lambert; pelajes definidos con tokens; test `palette` | ✅ (ver nota 2) |
| VIII | Testeabilidad determinista | `server/domain/{rng,race,payouts,ranking}.ts` puros; tests de semilla fija, redondeo, conservación, ranking | ✅ |
| IX | UI clara y responsive | `/host` para pantalla grande; `/play` móvil ≥ 360 px; contenido por fase | ✅ |
| X | Parimutuel | `settle()` con pozo = apuestas + acumulado, sin comisión, sobrante por mayor resto, sin acertantes ⇒ `carry_in` | ✅ |
| XI | Transparencia en vivo | Multiplicadores y `potentialPayout` recalculados con `settle()` y emitidos tras cada apuesta | ✅ |
| XII | Conservación | Libro solo-inserción con cuenta de pozo (`user_id NULL`); invariante testeado tras cada operación | ✅ |
| XIII | Control del host | Eventos `host:*` validados por rol; reset ronda devuelve y conserva acumulado; reset carrera conserva apuestas | ✅ |

**Notas de ajuste al input del usuario (para cumplir la constitución):**

1. *Fuente pixel* → pila de fuentes monoespaciadas del sistema: un fichero de fuente sería un
   asset externo (VI). Ver research R11.
2. *MeshLambert/Toon* → se mantiene Lambert, pero se añade una pasada de cuantización a la
   paleta, porque el sombreado genera tonos fuera de PICO-8 (VII). *Variables CSS + palette.ts*
   → las variables CSS se generan desde `palette.ts` para definir cada color una sola vez.
   Ver research R9/R10.
3. *Estado completo por WebSocket* → completo **para cada rol**: los jugadores no reciben datos
   de otros jugadores (FR-029). Ver research R5.
4. *bcrypt* → `bcryptjs` (mismo algoritmo, sin segunda dependencia nativa). Ver research R3.
5. *Pelajes con hex* (US4b) → los pelajes se piden con valores hex, todos de la paleta; en el
   código se expresan con sus tokens (`brown`, `black`, `white`, `light-grey`, `dark-grey`,
   `peach`), nunca con literales (VII).

**Gate inicial**: PASA. **Re-check post-diseño (Phase 1)**: PASA — data model, contratos y
quickstart no introducen violaciones; Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/001-group-horse-racing/
├── plan.md              # Este fichero
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── rest-api.md      # login / logout / me
│   ├── socket-events.md # snapshots por rol y eventos con ack
│   └── domain.md        # firmas de módulos puros
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
package.json             # scripts: dev, build, start, test
tsconfig.json
vite.config.ts           # multi-page: index, play, host
index.html               # login
play.html                # vista jugador
host.html                # vista host

server/
├── index.ts             # arranque: db, host upsert, Express, Vite middleware/static, Socket.IO, URLs LAN
├── db.ts                # esquema + consultas (saldo, acumulado, puntaje, invariante)
├── auth.ts              # login/logout/me, sesiones, parseo de cookie
├── game.ts              # máquina de estados de ronda, carrera en curso, liquidación, proyecciones
├── socket.ts            # handshake, presencia, eventos con ack → game.ts
└── domain/              # puro, sin I/O
    ├── rng.ts
    ├── race.ts
    ├── payouts.ts
    └── ranking.ts

shared/
├── types.ts             # Phase, HorseNumber, PlayerState, HostState, payloads
├── horses.ts            # 6 caballos: número, nombre, token de color (no hex)
└── format.ts            # formatMultiplier, formato de monedas

src/                     # cliente
├── palette.ts           # ÚNICO lugar con colores; applyCssTokens()
├── styles.css           # solo var(--c-*)
├── net.ts               # socket + overlay "Reconectando..."
├── login.ts
├── play.ts
├── session.ts           # comprobación de sesión y cabecera de las vistas protegidas
└── host/
    ├── main.ts          # orquesta escena + paneles
    ├── panel.ts         # paneles de ronda y leaderboard (DOM)
    ├── scene.ts         # renderer, cámara, luces, composer + cuantización
    ├── motion.ts        # puro: cadencia de galope y amortiguación de posición (US4b)
    ├── horse.ts         # createHorse({ color, number, coat }), crin, galope y cabeceo
    ├── track.ts         # pista, carriles, meta
    └── quantize.ts      # ShaderPass paleta PICO-8

tests/
├── unit/                # race, payouts, ranking, format, horses, motion
├── integration/         # auth, round-flow, live-updates, sync-load, host-permissions,
│                        # resets, recovery, race-speed
└── gates/               # palette, assets
```

**Structure Decision**: un único paquete npm con tres carpetas de código (`server/`,
`shared/`, `src/`) en lugar de backend/frontend separados: un solo `package.json`, un solo
proceso y tipos compartidos sin publicar paquetes (principio I). La lógica pura vive en
`server/domain/` para aislarla de I/O (principio VIII).

## Ajustes US4b: velocidad y aspecto de los caballos

Cambios pedidos tras implementar US4. Re-check de la constitución: PASA (ver tabla y nota 5).

### D1. Velocidad de carrera

- `shared/horses.ts`: `RACE_SPEEDS = { normal: 200, fast: 100, turbo: 50 }` (ms por tick),
  tipo `RaceSpeed = 'normal' | 'fast' | 'turbo'`, `DEFAULT_SPEED = 'normal'`. `TICK_MS` pasa a
  ser `RACE_SPEEDS.normal`.
- Contrato: `host:startRace` acepta `{ speed?: RaceSpeed }`; sin `speed` ⇒ `normal`; otro
  valor ⇒ `{ ok: false, error: "Velocidad no válida" }` sin efectos. No existe un evento para
  cambiar la velocidad: se elige solo al iniciar, así que con la carrera en curso no hay forma
  de cambiarla (`host:startRace` ya se rechaza fuera de `betting`).
- `HostState.race` agrega `speed: RaceSpeed` y `tickMs: number` para que el cliente adapte la
  animación. `PlayerState` no cambia.
- Esquema: `results.speed TEXT NOT NULL DEFAULT 'normal' CHECK (speed IN ('normal','fast','turbo'))`.
  Como `CREATE TABLE IF NOT EXISTS` no altera tablas existentes, `openDb` agrega la columna con
  un `ALTER TABLE` condicionado a `PRAGMA table_info(results)` (idempotente; ver Complexity
  Tracking).
- `Game`: `startRace(speed)` usa `tickMsBySpeed[speed]` para el `setInterval` y guarda `speed`
  en `results`. Opción `tickMsBySpeed` (por defecto `RACE_SPEEDS`) inyectable en `createApp`
  para tests; la opción `tickMs` existente sigue forzando un mismo intervalo para todas las
  velocidades (tests rápidos).
- El motor puro (`server/domain/race.ts`) no cambia: no conoce el tiempo, por lo que la
  velocidad no puede alterar el resultado.
- UI host: selector "Velocidad: Normal / Rápida / Turbo" junto a "Iniciar carrera", habilitado
  solo en `betting`; conserva la última elección en memoria de la página. En `racing` se
  muestra la velocidad en curso.

### D2. Pelajes

- `shared/horses.ts`: `CoatName = 'castano' | 'pinto' | 'tordo' | 'palomino'`, campo `coat` en
  cada entrada de `HORSES` (1 castaño, 2 pinto, 3 tordo, 4 palomino, 5 pinto, 6 castaño) y
  `COATS: Record<CoatName, { body: ColorToken; mane: ColorToken; tail: ColorToken; spots: ColorToken | null }>`:
  castaño `brown`/`black`/`black`; pinto `brown`/`black`/`black` con manchas `white`; tordo
  `light-grey`/`dark-grey`/`dark-grey`; palomino `peach`/`white`/`white`.
- `createHorse({ color, number, coat })` es la única fábrica. Manchas del pinto: `CanvasTexture`
  con manchas irregulares generadas de forma determinista a partir del número del caballo
  (sin `Math.random`), aplicada al cuerpo; cuello y patas con manchas fijas simples o lisos.
- Crin: geometría separada (fila de cajas o prisma delgado) dentro de un pivote del cuello.
- Se mantiene el contorno negro (casco invertido) de las piezas de pelaje, añadido en US4 para
  separar el pelaje `brown` de la tierra `brown`.

### D3. Tamaño y legibilidad

- Escala de los caballos ×1,5 (grupo raíz); cámara de seguimiento y de photo finish
  reajustadas (distancia/FOV) para que los 6 carriles queden siempre en cuadro.
- Número de manta: canvas de 128 px, pila sans-serif del sistema
  (`system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`), peso normal,
  dígito en `numberColor` con contorno fino del color opuesto (`white` ↔ `black`). Sin fichero
  de fuente (VI). La legibilidad se valida con capturas, ya que la cuantización y la resolución
  reducida pueden comerse un trazo demasiado fino.
- Ajustes surgidos de la validación con capturas (T077): resolución interna de render 0,75
  (antes 0,5) para que el dígito de peso normal siga legible, manta algo más alta (0,62) y
  carriles de 4,2 unidades (antes 3) para que el jinete de un carril no tape la manta del
  carril contiguo cuando van a la par; cámara de seguimiento más elevada.

### D4. Galope y movimiento

- `src/host/motion.ts` (puro, testeable sin DOM):
  - `advancesInWindow(history, horse, window = 10)`: avances del caballo en los últimos 10 ticks
    a partir del historial de posiciones recibido (si hay menos ticks, usa los disponibles).
  - `gallopRate(advances, tickMs)`: frecuencia de zancada creciente con los avances (mínimo > 0
    con 0 avances, tope con racha), escalada por `RACE_SPEEDS.normal / tickMs`.
  - `damp(state, target, dt, omega)`: resorte críticamente amortiguado (posición y velocidad
    continuas, sin sobrepaso desde reposo); `omega` proporcional a `1 / tickMs`.
- `scene.ts`: guarda el historial de posiciones por tick; en `racing` todos los caballos galopan
  siempre con `gallopRate`; en `finished` (tras llegar) y al reiniciar se detienen.
- `horse.ts`: `updateGallop(horse, dt, rate)` (rate 0 = detenerse). El cuello y la cabeza van en
  un pivote que cabecea hacia adelante y abajo con la fase de la zancada; la crin está dentro de
  ese pivote y agrega un pequeño retardo de fase.

## Complexity Tracking

| Desviación | Por qué | Alternativa más simple descartada |
|------------|---------|-----------------------------------|
| `ALTER TABLE results ADD COLUMN speed` condicionado a `PRAGMA table_info` en `openDb` (US4b) | La base `data/guanchotrack.db` ya existe con saldos reales de la partida; `CREATE TABLE IF NOT EXISTS` no agrega columnas | Herramienta de migraciones (dependencia y estructura innecesarias para una columna); borrar la base (pierde usuarios y saldos) |
