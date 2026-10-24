# Implementation Plan: GuanchoTrack — Carreras de caballos 3D en grupo

**Branch**: `001-group-horse-racing` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-group-horse-racing/spec.md`

## Summary

App web de carreras de caballos para jugar en grupo: un host proyecta la carrera 3D y el panel
de la ronda; los jugadores apuestan monedas ficticias desde el celular en un pozo común
parimutuel sin comisión (con pozo acumulado si nadie acierta). Enfoque: un único proceso
Node.js + TypeScript (Express + Socket.IO + Vite en middleware mode) con SQLite embebido; el
servidor es autoritativo, simula la carrera con un PRNG con semilla (40 casillas, tick 200 ms,
p = 1/10, photo finish) y emite snapshots de estado proyectados por rol. El dinero vive en un
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
60 fps en un portátil común; tick de carrera estable a 200 ms

**Constraints**: un proceso, una partida, sin servicios externos ni CDNs, sin assets
externos, solo paleta PICO-8, monedas enteras

**Scale/Scope**: 1 host + ~20–50 jugadores simultáneos (SC-004); 3 páginas; 6 tablas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución v2.0.0.

| # | Principio | Cumplimiento en el diseño | Estado |
|---|-----------|---------------------------|--------|
| I | Simplicidad Primero | 1 proceso y 1 puerto (Vite middleware en dev); SQLite embebido; 6 deps de runtime, cada una justificada en research; sin ORM, sin framework UI, sin migraciones | ✅ |
| II | Equidad Verificable | 6 caballos sin estadísticas; `mulberry32` con semilla de `crypto.randomInt` solo en servidor; semilla en `results.seed`; cliente sin RNG de juego | ✅ |
| III | Servidor fuente de verdad | Cliente solo emite `bet:place` y `host:*`; validación de fase, rol, saldo y rango en servidor; saldos derivados del libro | ✅ |
| IV | Tiempo real sincronizado | Socket.IO; snapshot `state` a todos tras cada cambio y cada tick; snapshot al reconectar; lerp visual sin afectar resultado | ✅ |
| V | Solo monedas ficticias | Sin integración de pagos; enteros sin valor | ✅ |
| VI | Sin assets externos | Geometría procedural, `CanvasTexture` para números/meta; fuentes del sistema (no fuente pixel); test `assets` | ✅ (ver nota 1) |
| VII | Identidad PICO-8 | `src/palette.ts` único origen; CSS vars generadas desde él; pasada de cuantización a paleta tras Lambert; test `palette` | ✅ (ver nota 2) |
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
└── host/
    ├── main.ts          # orquesta escena + paneles
    ├── panel.ts         # paneles de ronda y leaderboard (DOM)
    ├── scene.ts         # renderer, cámara, luces, composer + cuantización
    ├── horse.ts         # createHorse(), galope
    ├── track.ts         # pista, carriles, meta
    └── quantize.ts      # ShaderPass paleta PICO-8

tests/
├── unit/                # race, payouts, ranking, format
├── integration/         # auth, host-permissions, conservation, recovery
└── gates/               # palette, assets
```

**Structure Decision**: un único paquete npm con tres carpetas de código (`server/`,
`shared/`, `src/`) en lugar de backend/frontend separados: un solo `package.json`, un solo
proceso y tipos compartidos sin publicar paquetes (principio I). La lógica pura vive en
`server/domain/` para aislarla de I/O (principio VIII).

## Complexity Tracking

Sin violaciones de la constitución que justificar.
