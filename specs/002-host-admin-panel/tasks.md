---

description: "Task list for GuanchoTrack — panel de administración del host"
---

# Tasks: Panel de administración del host

**Input**: Design documents from `/specs/002-host-admin-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUIDOS. Flujo TDD del proyecto y principio VIII (funciones puras de caballos con
tests; conservación de monedas tras cada acción). Los tests de cada historia se escriben primero
y deben fallar antes de implementar.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Paquete único de 001: `server/`, `shared/`, `src/`, `tests/` (`unit/`, `integration/`, `gates/`,
`helpers/`). Referencias: [contracts/socket-events.md](./contracts/socket-events.md),
[contracts/domain.md](./contracts/domain.md), [data-model.md](./data-model.md),
[research.md](./research.md). Tests de integración con `startTestServer()` de
`tests/helpers/server.ts` (SQLite `:memory:`, `tickMs: 1`, `seedFn` incremental).

**Nota de orden**: la barra de pestañas "Juego"/"Admin" (contenedor de US3) va en Foundational
porque las UIs de US1 y US2 se montan dentro de "Admin"; la fase US3 cubre la sincronización en
vivo de la lista y la verificación de que cambiar de pestaña no interrumpe la carrera.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Línea base. Sin dependencias nuevas (plan, principio I).

- [X] T001 Run `npm test` on `main` and confirm all 001 suites pass before any change (baseline; record failures if any, do not fix them here)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema, tipos, plumbing de eventos `admin:*` y la pestaña "Admin" vacía

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Write failing test `tests/integration/admin-schema.test.ts`: (a) create a temp-file DB with the 001 schema only (copy the 001 `CREATE TABLE users` without `active`/`deleted_at`, insert player `ana`), then `openDb(path)` ⇒ `PRAGMA table_info(users)` has `active` and `deleted_at`, `ana.active = 1`, `deleted_at IS NULL`; calling `openDb` twice is idempotent; (b) fresh `:memory:` DB ⇒ table `horses` has exactly 6 rows equal to `DEFAULT_HORSES` (number, name, color, coat) and table `admin_log` exists; (c) `checkInvariant(db)` stays `true`
- [X] T003 In `server/db.ts`: add to `SCHEMA` the tables from [data-model.md](./data-model.md) — `horses (number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 6), name TEXT NOT NULL, color TEXT NOT NULL, coat TEXT NOT NULL CHECK (coat IN ('castano', 'pinto', 'tordo', 'palomino')))` and `admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL CHECK (action IN ('set_active', 'rename', 'reset_password', 'remove_player', 'update_horse', 'reset_horses')), target TEXT NOT NULL, before TEXT, after TEXT, created_at INTEGER NOT NULL)`; in `openDb` add `users.active INTEGER NOT NULL DEFAULT 1` and `users.deleted_at INTEGER` with `ALTER TABLE` only when missing from `PRAGMA table_info(users)` (same pattern as `results.speed`); seed horses with `INSERT OR IGNORE` from `DEFAULT_HORSES`; add helpers `getHorses(db): Horse[]` (ordered by number, `numberColor = numberColorFor(color)`) and `logAdmin(db, { actorId, action, target, before?, after?, createdAt? })` (JSON-stringify `before`/`after`, NULL when absent)
- [X] T004 [P] In `shared/horses.ts`: rename `HORSES` to `DEFAULT_HORSES` (same values), narrow `Horse.numberColor` to `'white' | 'black'`, add `BLANKET_COLORS` (the 16 tokens of `PALETTE` except `'brown'`, `'dark-green'`, `'dark-blue'` — 13 tokens, in `PALETTE` order) and `numberColorFor(color)` (`'white'` for `black`, `dark-purple`, `dark-grey`, `red`, `lavender`; `'black'` otherwise — research R8); update every importer of `HORSES` (`src/play.ts`, `src/host/panel.ts`, `src/host/scene.ts`, `src/host/horse.ts`, `tests/unit/horses.test.ts`) to `DEFAULT_HORSES` so the build keeps working (they move to live defs in US2)
- [X] T005 [P] In `shared/types.ts` add per [contracts/socket-events.md](./contracts/socket-events.md): `HorseDef` (= `Horse` from `shared/horses.ts`, re-exported as type), `ParticipantRow { id; username; score; balance; online; active; hasActiveBet }`, `SessionEndedPayload { reason: 'removed' | 'password_reset' }`, payloads `SetActivePayload { userId: number; active: boolean }`, `RenamePayload { userId: number; username: string }`, `ResetPasswordPayload { userId: number; password: string }`, `RemovePlayerPayload { userId: number }`, `UpdateHorsePayload { number: HorseNumber; name: string; color: ColorToken; coat: CoatName }`; add `horseDefs: HorseDef[]` to `PlayerState` and `HostState`, and `participants: ParticipantRow[]` to `HostState`
- [X] T006 In `server/game.ts`: add public `phase(): Phase` (current round phase or `'idle'`); fill `horseDefs: getHorses(this.db)` in `playerState()` and `hostState()`; fill `participants: []` for now (filled in US1); keep everything else unchanged so 001 tests still pass
- [X] T007 Create `server/admin.ts` skeleton: `export interface AdminResult { endSessions: { userId: number; reason: 'removed' | 'password_reset' }[] }` and an `Admin` class built with `{ db, game, now?, loginAttempts }` (methods added per story; each mutating method runs in `db.transaction`, writes `logAdmin`, then calls `game.broadcast()`); throw `GameError` (from `server/game.ts`) for rule violations so `run()` in `server/socket.ts` returns the message
- [X] T008 In `server/auth.ts`: export `USERNAME_RE`; make `authRouter(db, now = Date.now, attempts = new Map())` take the attempts map as parameter; add `deleteUserSessions(db, userId)`; filter `AND u.deleted_at IS NULL` in `userFromToken` and `AND deleted_at IS NULL` in the login lookup. In `server/index.ts` create the attempts map once, pass it to `authRouter` and to `new Admin({ db, game, loginAttempts })`, and pass `admin` + `io` to `attachSocket`
- [X] T009 In `server/socket.ts`: change signature to `attachSocket(io, db, game, admin)`; add helper `runAdmin(io, ack, action: () => AdminResult)` that runs like `run()` and, on success, for each `endSessions` item emits `session:ended { reason }` to room `player:<userId>` then calls `io.in('player:<userId>').disconnectSockets(true)` (research R4); no `admin:*` events yet
- [X] T010 [P] In `src/net.ts`: on `session:ended` set a flag that suppresses the "Reconectando..." overlay and do `location.replace('/')`
- [X] T011 In `src/host/main.ts`: add a tab bar with buttons "Juego" (selected by default) and "Admin" above `main`; the current layout (stage + panels) goes in the "Juego" container and a new empty "Admin" container is added; switching only toggles `hidden` and `aria-selected` — the socket handler keeps calling `scene.setRace()` and every `render*` regardless of the visible tab (research R10); styles in `src/styles.css` using only `var(--c-*)` (selected tab vs. not, large readable text)

**Checkpoint**: `npm test` green (001 + `admin-schema`); host page shows "Juego"/"Admin" and "Juego" behaves exactly like before

---

## Phase 3: User Story 1 - Gestionar participantes (Priority: P1) 🎯 MVP

**Goal**: El host marca activos (solo ellos en el leaderboard), renombra, restablece contraseña y elimina jugadores con su saldo yendo al pozo acumulado.

**Independent Test**: con 5 jugadores (uno con monedas, uno con apuesta activa) marcar 3 activos y mirar el leaderboard; renombrar uno y restablecer la contraseña de otro; intentar eliminar al de la apuesta activa y eliminar a uno sin apuesta.

### Tests for User Story 1 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [X] T012 [P] [US1] Write failing `tests/integration/admin-participants.test.ts`: host `participants` lists all live players (never the host) sorted by name with `score`, `balance`, `online`, `active`, `hasActiveBet`; new registration ⇒ `active: true` (US1-3); `admin:setActive {active:false}` on 2 of 5 ⇒ `leaderboard` has the 3 active with the same order/ties as `rank()` (US1-1); reactivating restores score and balance (US1-2); inactive player's `myRank` is `null` in `racing`/`finished` and active players' `myRank.total` counts only actives; inactive player still bets, wins and gets `payout` (US1-8); all inactive ⇒ `leaderboard: []`; `admin:rename` `ana` → `anita` ⇒ `anita` logs in with the same password and keeps balance, score and bets, while logging in as `ana` no longer reaches that account (the free name auto-registers a different user id with 0 coins — US1-4); rename to `"Anita"` when `anita` exists ⇒ `"Ese nombre ya está en uso"`; rename `"ana"` → `"Ana"` (same user) ok; invalid name (`"a"`, `"a b"`) ⇒ registration error message; connected player gets `PlayerState.username` updated without disconnect; `admin:resetPassword` ⇒ old password `401`, new works, the player's open socket receives `session:ended {reason:'password_reset'}` and is disconnected; empty password ⇒ `"La contraseña no puede estar vacía"`; each action writes one `admin_log` row (`reset_password` with NULL `before`/`after`)
- [X] T013 [P] [US1] Write failing `tests/integration/admin-remove.test.ts`: player with active bet in `betting` ⇒ `admin:removePlayer` returns `"No se puede eliminar: tiene una apuesta activa"` and nothing changes (US1-6); player with 80 coins (via `host:adjustBalance`) and carry 20 (build carry with a no-winner round) ⇒ remove ⇒ `carry` 100, two `carry_in` rows (−80 with `user_id` = player, +80 with `user_id` NULL), `checkInvariant()` true, total coins (Σ balances + Σ active bets + carry) unchanged, player missing from `participants`/`leaderboard`, login with old credentials creates a NEW account with 0 coins and 0 score (name freed), open socket gets `session:ended {reason:'removed'}` (US1-7); remove during `betting` (player without bet) ⇒ host `pot`/`carry` and every horse `multiplier` recalculated in the next `state`; balance 0 ⇒ no `coin_transactions` rows added; a removed player who won in the current finished round shows as `"(eliminado)"` in `result.winners`; removing the host id, an unknown id or an already removed id ⇒ `"Jugador no encontrado"`
- [X] T014 [P] [US1] Write failing `tests/integration/admin-permissions.test.ts`: each of `admin:setActive`, `admin:rename`, `admin:resetPassword`, `admin:removePlayer`, `admin:updateHorse`, `admin:resetHorses` from a player socket ⇒ `{ ok: false, error: "No autorizado" }` and DB unchanged (no `admin_log` rows, same users/horses) (US1-9, FR-002); `PlayerState` never contains `participants`

### Implementation for User Story 1

- [X] T015 [US1] In `server/game.ts` replace `ranking()` with one query over live players (`role = 'player' AND deleted_at IS NULL`) returning `id, username, score, balance, active, hasActiveBet` (active bet = `bets.status = 'active'` in the current round); build `participants` (all, sorted by name with `localeCompare('es', { sensitivity: 'base' })`, `online` from `presence`) and `ranking = rank(actives only)` without touching `server/domain/ranking.ts` (research R6); fill `HostState.participants`; `myRank` only if the player is active; `betStatus` players query adds `AND deleted_at IS NULL`; `roundBets()` returns `'(eliminado)'` as `username` when `u.deleted_at IS NOT NULL`
- [X] T016 [US1] In `server/game.ts` change `broadcastPlayers()` to iterate connected players (`presence` keys whose user is a live player) instead of the ranking, so inactive players keep receiving snapshots (research R6); keep the `sentPlayerOrder` behavior
- [X] T017 [US1] In `server/admin.ts` implement `setActive(actorId, payload)` (validate `userId` live player else `"Jugador no encontrado"`, `active` boolean else `"Valor inválido"`; log `set_active` before/after) and `renamePlayer(actorId, payload)` (`USERNAME_RE` else the registration message `"El usuario debe tener entre 3 y 20 caracteres: letras, números, _ o -"`; another user — including host or deleted — with the same name case-insensitively ⇒ `"Ese nombre ya está en uso"`; same user changing case ok; sessions untouched; log `rename` with old/new username); both return `{ endSessions: [] }`
- [X] T018 [US1] In `server/admin.ts` implement `resetPassword(actorId, payload)`: live player check, non-empty string password else `"La contraseña no puede estar vacía"`, `bcrypt.hashSync(password, 10)`, `deleteUserSessions`, delete the lowercase username from `loginAttempts`, log `reset_password` with NULL before/after; return `{ endSessions: [{ userId, reason: 'password_reset' }] }`
- [X] T019 [US1] In `server/admin.ts` implement `removePlayer(actorId, payload)` in one transaction: live player check; active bet in current round ⇒ `"No se puede eliminar: tiene una apuesta activa"`; `X = balanceOf`; if `X > 0` `addTx` `{ userId, kind: 'carry_in', amount: -X, actorId, note: 'remove' }` and `{ userId: null, kind: 'carry_in', amount: X, actorId, note: 'remove <id>' }` (research R3); `UPDATE users SET username = '#deleted-' || id, active = 0, deleted_at = now`; `deleteUserSessions`; log `remove_player` with `before {username, balance: X}` and `after {carry: carryBalance}`; return `{ endSessions: [{ userId, reason: 'removed' }] }`
- [X] T020 [US1] In `server/socket.ts` register `admin:setActive`, `admin:rename`, `admin:resetPassword`, `admin:removePlayer` with `hostOnly` + `runAdmin`; also register `admin:updateHorse` and `admin:resetHorses` as `hostOnly` stubs that ack `{ ok: false, error: 'No disponible' }` until US2 (so T014 passes)
- [X] T021 [US1] In `src/session.ts` return the header name element from `guard()`; in `src/play.ts` set its `textContent` to `state.username` on every `state` (rename visible without logout)
- [X] T022 [US1] Create `src/host/admin.ts` with `mountAdmin(container)` and `renderParticipants(state: HostState)`: table with columns Nombre, Puntaje, Monedas (`formatCoins`), Conectado, Activo (checkbox ⇒ `admin:setActive`), and actions per row: "Renombrar" (inline input + Guardar/Cancelar ⇒ `admin:rename`), "Contraseña" (inline password input ⇒ `admin:resetPassword`), "Saldo" (reuse `host:adjustBalance` by username with set/add/subtract), "Eliminar" (disabled with title "Tiene una apuesta activa" when `hasActiveBet`; two-step inline confirmation "¿Eliminar a X? Sus N monedas pasan al pozo" ⇒ "Sí, eliminar" ⇒ `admin:removePlayer`, never `confirm()`); errors shown inline from the ack; do not rebuild a row that has an open inline editor when a new `state` arrives (keep focus); empty list ⇒ "Aún no hay jugadores"; styles in `src/styles.css` with `var(--c-*)` only
- [X] T023 [US1] In `src/host/main.ts` mount `mountAdmin` in the "Admin" container and call `renderParticipants(s)` on every state; in `src/host/panel.ts` `renderLeaderboard` shows `"No hay participantes activos"` when `leaderboard` is empty but `participants` is not (keep `"Aún no hay jugadores"` when both are empty)

**Checkpoint**: `admin-participants`, `admin-remove`, `admin-permissions` pass; `checkInvariant()` true after every admin action; MVP usable from the "Admin" tab

---

## Phase 4: User Story 2 - Personalizar los caballos (Priority: P2)

**Goal**: El host cambia nombre, color de manta (13 permitidos, sin repetir) y pelaje de los 6 caballos, solo sin ronda en curso; el cambio se ve en pista 3D, paneles y celulares y persiste.

**Independent Test**: en espera, caballo 3 ⇒ "Relámpago", lavanda, pinto; azul rechazado (lo usa el 5); verlo en pista, panel y celular; correr una carrera con semilla conocida y comparar con caballos por defecto.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Extend `tests/unit/horses.test.ts` with the mandatory cases of [contracts/domain.md](./contracts/domain.md): `DEFAULT_HORSES` keeps 001 values; `numberColorFor(h.color) === h.numberColor` for every default; `BLANKET_COLORS` has 13 tokens, all in `PALETTE`, without `brown`/`dark-green`/`dark-blue`; `normalizeHorseName("  Luz   Mala ")` ⇒ `"Luz Mala"`; `validateHorseEdit`: `"Relámpago"` ✓, `"Ñandú 2"` ✓, `""`/`"   "` ✗, 15 chars ✗, `"Rojo!"` ✗, `"rojo"` for horse 2 while horse 1 is `"Rojo"` ⇒ `"Otro caballo ya se llama así"`, horse 1 keeping `"Rojo"` ✓, `"Relampago"` vs existing `"Relámpago"` ✓ (accents distinct), color `brown` ⇒ `"Color no permitido"`, horse 2 `red` ⇒ `"Otro caballo ya usa ese color"`, own color ✓, coat `"cebra"` ⇒ `"Pelaje inválido"`, number 7 ⇒ `"Caballo inválido"`, success returns `numberColor` computed
- [X] T025 [P] [US2] Write failing `tests/integration/admin-horses.test.ts`: in `idle` `admin:updateHorse {number:3, name:'Relámpago', color:'lavender', coat:'pinto'}` ⇒ host and player `horseDefs[2]` updated with `numberColor: 'white'` in the next `state` (US2-1); color `blue` on horse 3 ⇒ `"Otro caballo ya usa ese color"` (US2-2); in `betting` and `racing` ⇒ `"Solo se pueden editar los caballos sin ronda en curso"` and in `finished` ok (US2-4); same `seedFn` seed run with default horses and with all 6 customized ⇒ identical `results.final_order` and winner (US2-5, SC-004); `admin:resetHorses` ⇒ `horseDefs` equals `DEFAULT_HORSES` (US2-6); persistence: with a temp-file `dbPath`, customize, `close()`, start a new test server on the same path ⇒ customization kept (US2-7); `admin_log` rows `update_horse` (before/after name,color,coat) and `reset_horses`

### Implementation for User Story 2

- [X] T026 [P] [US2] In `shared/horses.ts` implement `normalizeHorseName`, `isCoatName` and `validateHorseEdit(current, edit)` exactly per [contracts/domain.md](./contracts/domain.md): name after normalization must match `/^[\p{L}\p{N} -]{1,14}$/u` else `"El nombre debe tener entre 1 y 14 caracteres: letras, números, espacios o guiones"`; uniqueness vs. the other 5 with `toLocaleLowerCase('es')`; `color` ∈ `BLANKET_COLORS` and not used by another horse; `coat` via `isCoatName`; `number` integer 1–6 else `"Caballo inválido"`; returns `{ ok: true, horse }` with `numberColor = numberColorFor(color)`
- [X] T027 [US2] In `server/admin.ts` implement `updateHorse(actorId, payload)` (phase must be `idle` or `finished` via `game.phase()` else `"Solo se pueden editar los caballos sin ronda en curso"`; `validateHorseEdit(getHorses(db), payload)`; `UPDATE horses`; log `update_horse`) and `resetHorses(actorId)` (same phase rule; rewrite the 6 rows from `DEFAULT_HORSES`; log `reset_horses` with the 6 before/after); in `server/socket.ts` replace the T020 stubs with real handlers
- [X] T028 [P] [US2] Create `src/horses.ts` (client store): `setHorseDefs(defs)` (notifies listeners only if changed, compared by JSON), `horseDef(n): HorseDef`, `horseDefs()`, `onHorseDefsChange(fn)`; initial value `DEFAULT_HORSES` (research R11)
- [X] T029 [US2] In `src/host/horse.ts` make `createHorse({ color, number, coat, numberColor })` take `numberColor` as parameter instead of reading `DEFAULT_HORSES`; in `src/host/scene.ts` build the initial horses from `horseDefs()` and add `setHorses(defs)` to `RaceScene`: for each horse whose name/color/coat changed, dispose and recreate its mesh keeping scale, lane and current x (only called outside a race because the server rejects edits in `betting`/`racing`)
- [X] T030 [US2] In `src/host/panel.ts` replace every `DEFAULT_HORSES[...]` use (`horseBadge`, betting rows, race board, result/podium) with `horseDef(n)`; in `src/host/main.ts` call `setHorseDefs(s.horseDefs)` first on each state and `scene.setHorses(s.horseDefs)` when it changed
- [X] T031 [US2] In `src/play.ts` call `setHorseDefs(state.horseDefs)` on each state and replace `DEFAULT_HORSES` uses with `horseDef(n)`; on `onHorseDefsChange` update in place the swatch (background/number color via `var(--c-*)`) and name of each bet button without rebuilding the view or losing the selection
- [X] T032 [US2] In `src/host/admin.ts` add `renderHorses(state)` section "Caballos": one row per horse with number badge, name input (maxlength 14), color picker of `BLANKET_COLORS` as swatch buttons (colors used by other horses shown disabled with a mark; preview of the number in `numberColorFor`), coat `select` (Castaño, Pinto, Tordo, Palomino) and "Guardar" ⇒ `admin:updateHorse`; whole editor disabled with the note "Disponible sin ronda en curso" when `phase` is `betting` or `racing`; "Restablecer caballos" with inline two-step confirmation ⇒ `admin:resetHorses` (FR-017); inline ack errors; do not overwrite inputs the host is editing; call it from `src/host/main.ts`

**Checkpoint**: `horses` and `admin-horses` pass; custom horses visible in 3D, panels and phone; race result independent of customization

---

## Phase 5: User Story 3 - Pestañas "Juego" y "Admin" (Priority: P3)

**Goal**: Cambiar de pestaña nunca interrumpe la carrera; la lista Admin se actualiza en vivo.

**Independent Test**: con carrera en curso, pasar a "Admin" y volver a "Juego": la carrera sigue en su posición real.

### Tests for User Story 3 ⚠️

- [X] T033 [P] [US3] Write failing `tests/integration/admin-live.test.ts`: host receives a `state` with updated `participants` within 1 s when a player connects (`online: true`), disconnects, places a bet (`hasActiveBet: true`) and when the host adjusts its balance (US3-3, SC-002); two host sockets both receive the update after an `admin:setActive` from one of them (spec Edge Case "Dos pantallas de host")

### Implementation for User Story 3

- [X] T034 [US3] Make T033 pass (expected already covered by `broadcast()` on connect/disconnect/bet/adjust; fix any missing broadcast in `server/game.ts` or `server/socket.ts`)
- [X] T035 [US3] Validate tabs manually on a test server (`DB_PATH="$(mktemp -d)/admin.db" PORT=3100 npm run dev`, never `data/`): start a race, switch to "Admin" mid-race and back ⇒ horses at their real positions, no restart, result panel appears after photo finish (SC-005, US3-2); on reload the page opens in "Juego" (US3-1); fix `src/host/main.ts`/`src/host/scene.ts` if the scene needs a resize or the result panel misses the `finished` transition while hidden

**Checkpoint**: `admin-live` passes; tab switching verified with screenshots

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T036 [P] Run `npm test` including `tests/gates/palette.test.ts` and `tests/gates/assets.test.ts` with the new files (`src/host/admin.ts`, `src/horses.ts`); fix any color literal outside `src/palette.ts`
- [X] T037 [P] Add a conservation test in `tests/integration/admin-remove.test.ts` (or new `tests/integration/admin-conservation.test.ts`): random sequence of bets, races, `setActive`, `rename`, `removePlayer` and `resetHorses` ⇒ `checkInvariant()` true after every step and Σ coins changes only by `host_adjust` (SC-003)
- [X] T038 Run `npx tsc --noEmit` and fix type errors across `server/`, `shared/`, `src/`, `tests/`
- [X] T039 Migration check on a copy of the real DB: `cp data/guanchotrack.db "$CLAUDE_JOB_DIR/tmp/gt-copy.db"` (or another temp dir) and `DB_PATH=<copy> PORT=3100 npm run dev` ⇒ no invariant warning, existing players active, default horses (quickstart)
- [X] T040 Run the full manual validation of [quickstart.md](./quickstart.md) (steps 1–6) with headless Chrome screenshots on the `:3100` test server: Admin tab (participants + horse editor), custom horses on the 3D track (0 off-palette pixels in the canvas), phone view at 390 px with renamed horse and inactive player, phone returning to login after removal
- [X] T041 [P] Update `README.md` with a short "Pestaña Admin" section (participantes activos, renombrar, contraseña, eliminar ⇒ pozo, personalizar caballos sin ronda en curso)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — BLOCKS all user stories
- **US1 (Phase 3)**: after Foundational — MVP
- **US2 (Phase 4)**: after Foundational; independent of US1 except shared files (`server/admin.ts`, `server/socket.ts`, `src/host/admin.ts`, `src/host/main.ts`) — do it after US1 to avoid conflicts (T027 replaces the T020 stubs)
- **US3 (Phase 5)**: after US1 (needs `participants`); T035 best after US2 so the editor is also checked
- **Polish (Phase 6)**: after all stories

### Within Each Phase

- T002 (test) before T003; T003 needs T004 (`DEFAULT_HORSES`, `numberColorFor`) — do T004 first or together
- T005 before T006; T007 → T008 → T009 (index/socket wiring)
- US1: T012–T014 first (fail) → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023
- US2: T024, T025 first → T026 → T027; T028 → T029 → T030 → T031 → T032
- Tests MUST fail before implementation; server before client

### Parallel Opportunities

- Foundational: T004, T005, T010 in parallel; T011 in parallel with server tasks T006–T009
- US1: T012, T013, T014 in parallel; T021 (`src/session.ts`, `src/play.ts`) in parallel with T017–T019
- US2: T024, T025, T026, T028 in parallel; T029 (scene/horse) in parallel with T027 (server)
- Polish: T036, T037, T041 in parallel

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "T012 admin-participants.test.ts"
Task: "T013 admin-remove.test.ts"
Task: "T014 admin-permissions.test.ts"
# Then server (sequential, same files): T015 → T016 → T017 → T018 → T019 → T020
# Client in parallel with server: T021 (session/play)
```

## Parallel Example: User Story 2

```bash
Task: "T024 unit horses cases"
Task: "T025 admin-horses.test.ts"
Task: "T026 validateHorseEdit in shared/horses.ts"
Task: "T028 src/horses.ts store"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 + Phase 2 (schema, types, plumbing, empty Admin tab)
2. Phase 3 (US1): participants active/rename/password/remove
3. **STOP and VALIDATE**: `npm test`, invariant, screenshots of the Admin tab — this already solves "leaderboard lleno de cuentas que no juegan"

### Incremental Delivery

1. MVP (US1) ⇒ validate
2. US2 (horses) ⇒ validate 3D/panels/phone
3. US3 (live list + tab switching mid-race) ⇒ validate
4. Polish (gates, types, migration on DB copy, quickstart screenshots, README)

## Notes

- Commits only when the user asks; never push without confirmation
- Never use `data/guanchotrack.db` for tests or screenshots: temp DB + port 3100
- Constitution: no color literals outside `src/palette.ts`; every admin action validated server-side and logged; no coin created or destroyed
