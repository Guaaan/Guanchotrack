---

description: "Task list for GuanchoTrack — carreras de caballos 3D en grupo"
---

# Tasks: GuanchoTrack — Carreras de caballos 3D en grupo

**Input**: Design documents from `/specs/001-group-horse-racing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUIDOS. El plan los pide (Vitest) y la constitución los exige (principio VIII:
lógica de carrera, pagos y ranking con tests obligatorios; puertas de paleta y assets). Los
tests de cada historia se escriben primero y deben fallar antes de implementar.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Paquete único en la raíz (ver plan.md): `server/` (backend), `server/domain/` (puro),
`shared/` (tipos y helpers compartidos), `src/` (cliente), `tests/` (`unit/`, `integration/`,
`gates/`, `helpers/`). Referencias: [contracts/socket-events.md](./contracts/socket-events.md),
[contracts/rest-api.md](./contracts/rest-api.md), [contracts/domain.md](./contracts/domain.md),
[data-model.md](./data-model.md).

**Orden de fases**: US2 (login, P1) va antes que US1 (ronda, P1) porque toda conexión de juego
necesita sesión. Ambas son P1 y juntas forman el MVP.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create `package.json` at repo root: `"type": "module"`, `"engines": { "node": ">=20" }`, scripts `dev` = `tsx watch server/index.ts`, `start` = `NODE_ENV=production tsx server/index.ts`, `build` = `vite build`, `test` = `vitest run`; runtime deps `express`, `socket.io`, `socket.io-client`, `better-sqlite3`, `bcryptjs`, `three`, `tsx` (runtime because `start` uses it); dev deps `typescript`, `vite`, `vitest`, `@types/express`, `@types/better-sqlite3`, `@types/bcryptjs`, `@types/three`, `@types/node`; then run `npm install`
- [X] T002 [P] Create `tsconfig.json` (strict, `target` ES2022, `module`/`moduleResolution` `bundler`, `lib` `["ES2022","DOM"]`, `noEmit`, include `server`, `shared`, `src`, `tests`)
- [X] T003 [P] Create `vite.config.ts`: multi-page build with inputs `index.html`, `play.html`, `host.html`, `build.outDir = "dist"`; `test` block for Vitest with `environment: "node"`, `include: ["tests/**/*.test.ts"]`
- [X] T004 [P] Create `.gitignore` with `node_modules/`, `dist/`, `data/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] Create `src/palette.ts` — the ONLY file allowed to contain color literals: export `PALETTE` as a frozen object of exactly 16 named PICO-8 colors (`black #000000`, `dark-blue #1D2B53`, `dark-purple #7E2553`, `dark-green #008751`, `brown #AB5236`, `dark-grey #5F574F`, `light-grey #C2C3C7`, `white #FFF1E8`, `red #FF004D`, `orange #FFA300`, `yellow #FFEC27`, `green #00E436`, `blue #29ADFF`, `lavender #83769C`, `pink #FF77A8`, `peach #FFCCAA`), type `ColorToken`, helper `hex(token)` returning number for Three.js, and `applyCssTokens()` that sets `--c-<token>` on `document.documentElement` (research R9)
- [X] T006 [P] Create gate test `tests/gates/palette.test.ts`: assert `PALETTE` has exactly the 16 constitution values; scan every file under `src/`, `shared/`, `server/` and root `*.html` (excluding `src/palette.ts`) and fail on hex literals `#[0-9a-fA-F]{3}`/`{4}`/`{6}`/`{8}` that appear as a value (inside quotes, after `:` or `=`, or as a function argument — not CSS id selectors), `rgb(`, `rgba(`, `hsl(`, `hsla(`, `0x[0-9a-fA-F]{6}` numeric color literals, and CSS named colors only when used as a property value (`/:\s*(red|white|black|blue|green|yellow|orange|pink|gray|grey|purple|brown)\b/i`); ignore any `var(--c-*)` references
- [X] T007 [P] Create gate test `tests/gates/assets.test.ts`: scan `src/`, `shared/`, root `*.html` and `src/styles.css`; fail on imports/references of `.png .jpg .jpeg .gif .svg .webp .glb .gltf .obj .woff .woff2 .ttf .otf`, `@font-face`, `url(` pointing to files, or any `http://`/`https://` URL (principle VI)
- [X] T008 [P] Create `shared/types.ts` exactly per [contracts/socket-events.md](./contracts/socket-events.md): `Phase`, `HorseNumber`, `HorseOdds`, `PlayerState`, `HostBetRow`, `HostState`, `Ack = { ok: true } | { ok: false; error: string }`, payload types `BetPlacePayload { horse: HorseNumber; amount: number }`, `AdjustBalancePayload { username: string; mode: 'set' | 'add' | 'subtract'; value: number }`
- [X] T009 [P] Create `shared/horses.ts`: `HORSES` array of 6 `{ number, name, color: ColorToken, numberColor: ColorToken }` — 1 Rojo `red`, 2 Naranjo `orange`, 3 Amarillo `yellow`, 4 Verde `green`, 5 Azul `blue`, 6 Rosado `pink`; `numberColor` `white` or `black` by contrast (use `black` on `yellow`, `green`, `orange`, `pink`, `blue`; `white` on `red`). Tokens only, never hex; import the token type with `import type { ColorToken } from '../src/palette'` so server code importing this module never loads client code. Export `TRACK_LENGTH = 40`, `TICK_MS = 200`
- [X] T010 [P] Create `shared/format.ts`: `formatMultiplier(m: number | null)` → truncates to 2 decimals with comma and `×` (`2.356` → `"2,35×"`, `1` → `"1,00×"`, `null` → `"sin apuestas"`); `formatCoins(n)` → integer with `.` thousands separator; and `tests/unit/format.test.ts` covering those cases
- [X] T011 Create `server/db.ts`: `openDb(path: string)` using `better-sqlite3` (WAL unless `:memory:`), creating the 6 tables with `CREATE TABLE IF NOT EXISTS` exactly per [data-model.md](./data-model.md): `users` (`username TEXT UNIQUE COLLATE NOCASE`, `role` CHECK `'host'|'player'`), `sessions`, `rounds` (`phase` CHECK `'betting'|'racing'|'finished'`, `winner_horse`, `carry_used`, `opened_at`, `finished_at`), `bets` (`horse` CHECK 1–6, `amount` CHECK `>= 1`, `status` CHECK `'active'|'refunded'|'won'|'lost'`, `payout`, `confirmed_at`, partial unique index `(round_id, user_id) WHERE status = 'active'`), `results` (`seed`, `status` CHECK `'running'|'annulled'|'final'`, `winner_horse`, `final_order` JSON, `photo_finish` JSON, `ticks`, `started_at`, `ended_at`), `coin_transactions` (`user_id` NULL = pot account, `kind` CHECK `'bet_place'|'bet_refund'|'payout'|'host_adjust'|'carry_in'|'carry_out'`, `amount` CHECK `<> 0`, `actor_id`, `note`, `created_at`; index on `user_id`); plus query helpers `balanceOf(userId)`, `carryBalance()`, `scoreOf(userId)`, `addTx({...})` (throws if `amount === 0`), and `checkInvariant()` implementing the conservation equation from data-model.md
- [X] T012 Create `server/auth.ts` session core (no routes yet): `parseCookies(header)` (manual, ~5 lines), `createSession(db, userId)` → 32-byte hex token via `crypto.randomBytes`, `userFromToken(db, token)`, `deleteSession(db, token)`, `SESSION_COOKIE = "gt_session"` and `cookieHeader(token)` → `HttpOnly; SameSite=Lax; Path=/` without `Max-Age` (research R4)
- [X] T013 Create `server/game.ts` skeleton: class `Game` constructed with `{ db, emit, now = Date.now, seedFn = () => crypto.randomInt(2 ** 32), tickMs = TICK_MS }` where `emit` is a callback `(target: 'host' | { userId: number }, state) => void`; methods `playerState(userId): PlayerState` and `hostState(): HostState` returning `phase: 'idle'` defaults; `broadcast()` that emits `hostState()` to `'host'` and `playerState(id)` to each connected player; in-memory `presence: Map<number, number>` with `connect(userId)` / `disconnect(userId)`
- [X] T014 Create `server/socket.ts`: `attachSocket(io, db, game)` — handshake middleware reads `gt_session` from `socket.handshake.headers.cookie`, resolves user via `userFromToken`, rejects with `new Error("unauthorized")` if missing; on connection joins room `host` or `player:<id>`, calls `game.connect`, emits `state` snapshot to that socket, then `game.broadcast()`; on disconnect calls `game.disconnect` and broadcasts. Helper `hostOnly(handler)` that answers `{ ok: false, error: "No autorizado" }` when `socket.data.role !== 'host'` (FR-038)
- [X] T015 Create `server/index.ts`: export `createApp({ dbPath, dev, port, hostUser, hostPassword, tickMs?, seedFn? })` returning `{ httpServer, io, game, db, close() }`; Express with `express.json()`; in dev mount Vite via `createServer({ server: { middlewareMode: true }, appType: 'mpa' })`, in prod serve `dist/` statically; rewrite `/play` → `play.html`, `/host` → `host.html`; attach Socket.IO to the same HTTP server and call `attachSocket`; when run directly, read `PORT` (default 3000), `HOST_USER`, `HOST_PASSWORD`, `DB_PATH` (default `data/guanchotrack.db`, create `data/` dir), listen on `0.0.0.0` and print `http://<ip>:<port>` for every non-internal IPv4 from `os.networkInterfaces()` (research R1)
- [X] T016 [P] Create `src/styles.css`: only `var(--c-*)` colors; system monospace stack `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`, uppercase headings, `letter-spacing`; base layout, buttons (min 48px touch target), `.overlay` full-screen class, `.is-first` / `.is-last` highlight classes (research R11)
- [X] T017 [P] Create `src/net.ts`: `connect(onState)` creating a `socket.io-client` socket (same origin), showing a `.overlay` "Reconectando..." on `disconnect` and hiding it on `connect`; on `connect_error` with message `unauthorized` redirect to `/`; `emitAck(event, payload): Promise<Ack>` helper; `fetchMe()` and `logout()` helpers for `/api/me` and `/api/logout` (research R14)
- [X] T018 [P] Create `index.html`, `play.html`, `host.html` at repo root: minimal shells (`lang="es"`, viewport meta, `<div id="app">`), each loading its entry module (`/src/login.ts`, `/src/play.ts`, `/src/host/main.ts`) and `src/styles.css`; no inline colors
- [X] T019 Create test harness `tests/helpers/server.ts`: `startTestServer(opts?)` calling `createApp({ dbPath: ':memory:', dev: false, port: 0, hostUser: 'hosttt', hostPassword: '1231', tickMs: 1, seedFn })` and listening on an ephemeral port; helpers `login(username, password)` → `{ status, body, cookie }` via `fetch`, `connectAs(cookie)` → connected `socket.io-client` socket with the cookie in `extraHeaders`, `nextState(socket)` promise, `emitAck(socket, event, payload)`

**Checkpoint**: Foundation ready — `npm test` runs the palette, assets and format tests; user story implementation can now begin

---

## Phase 3: User Story 2 - Ingreso con usuario y contraseña (Priority: P1) 🎯 MVP

**Goal**: Pantalla única de login con autoregistro, cuenta host desde variables de entorno y
sesión persistente al recargar.

**Independent Test**: Crear un usuario nuevo, recargar, probar contraseña incorrecta y
correcta, y entrar como `hosttt` / `1231` (spec US2).

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T020 [P] [US2] Integration test `tests/integration/auth.test.ts` per [contracts/rest-api.md](./contracts/rest-api.md): new user → 200 `{ role: 'player', created: true }` + `Set-Cookie gt_session` with `HttpOnly`; same user wrong password → 401 `"Contraseña incorrecta"`; `ANA` vs `ana` is the same account; invalid names (`ab`, 21 chars, `ana!`) and empty password → 400; `hosttt`/`1231` → `role: 'host'`; `GET /api/me` with cookie → 200, without → 401; `POST /api/logout` → 204 and cookie no longer valid; socket connection without cookie fails with `unauthorized`; new player starts with `balance: 0` in its first `state`; password stored is not plain text

### Implementation for User Story 2

- [X] T021 [US2] Add routes to `server/auth.ts` as `authRouter(db)`: `POST /api/login` (validate username `^[A-Za-z0-9_-]{3,20}$` and non-empty password → 400 with Spanish message; lookup `COLLATE NOCASE`; if missing create `role 'player'` with `bcryptjs.hash(password, 10)`; if present `bcryptjs.compare` → 401 `"Contraseña incorrecta"`; create session, set cookie, respond `{ role, created }`), `POST /api/logout` (delete session, clear cookie, 204), `GET /api/me` (`{ username, role }` or 401 `"No autenticado"`); mount it in `server/index.ts`
- [X] T022 [US2] In `server/index.ts` `createApp`, upsert host at boot: create or update user `hostUser` with role `host` and hash of `hostPassword`; set `role = 'player'` on any other user with role `host`; if `hostUser === 'hosttt' && hostPassword === '1231'` print a console warning that default host credentials are in use (research R3)
- [X] T023 [US2] Add login throttling to `server/auth.ts` (FR-007a): in-memory `Map<lowercased username, { fails, lockedUntil }>`; after 5 failed `bcryptjs.compare` set `lockedUntil = now + 60_000` and answer 429 `"Demasiados intentos, espera un minuto"` while locked (checked before comparing); reset on success; extend `tests/integration/auth.test.ts` with: 5 wrong passwords ⇒ 6th attempt 429 even with correct password; other usernames unaffected
- [X] T024 [P] [US2] Create `src/login.ts`: call `applyCssTokens()`; on load `fetchMe()` and redirect to `/host` or `/play` if already logged in; render form (usuario, contraseña, botón "Entrar"), `POST /api/login`, show error text from response, redirect by `role`
- [X] T025 [P] [US2] Create guarded entry stubs `src/play.ts` and `src/host/main.ts`: call `applyCssTokens()`, `fetchMe()` → redirect to `/` if 401 or to the other view if role mismatches; render header with username and "Salir" button calling `logout()` then redirecting to `/`; call `connect(onState)` and log state for now

**Checkpoint**: Login, autoregistro, host, límite de intentos y recarga funcionan; `auth.test.ts` pasa

---

## Phase 4: User Story 1 - Ronda completa: apostar, correr y cobrar (Priority: P1) 🎯 MVP

**Goal**: Ciclo completo: el host abre ronda y carga monedas, los jugadores apuestan desde el
celular con multiplicadores en vivo, la carrera corre en el servidor y se liquida el pozo
parimutuel (con pozo acumulado si nadie acierta) y el puntaje.

**Independent Test**: Con host y 2–3 jugadores con saldo, jugar una ronda completa y verificar
ganador, pagos, saldos, puntajes y conservación de monedas (spec US1). Incluye la carga de
saldo del host (`host:adjustBalance`) porque los jugadores parten con 0.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T026 [P] [US1] Unit test `tests/unit/race.test.ts` per [contracts/domain.md](./contracts/domain.md): same seed ⇒ identical position sequence, winner and tick count across two runs; positions never exceed 40 and advance at most 1 per tick; race always finishes; find (by brute force over seeds inside the test) a seed with a photo finish and assert a single winner equal to the highest `value` and `photoFinish` listing all tied horses; `raceOrder` puts finishers by `value` desc then rest by position desc, number asc
- [X] T027 [P] [US1] Unit test `tests/unit/payouts.test.ts`: spec example A 30→1, B 10→2, C 20→2 ⇒ pot 60, multipliers 1 = 2, 2 = 2, winner 2 ⇒ B 20, C 40; all on same horse no carry ⇒ 1× each gets stake back; carry 60 + A 20→1, B 20→2 ⇒ multipliers 5, winner 1 ⇒ A 100, `carryOut 0`; pot 100 with three winners of 10 (`confirmedAt` 1,2,3) ⇒ 34, 33, 33 (extra to earliest); largest-remainder case with unequal stakes; no bets on winner ⇒ `payouts []`, `carryOut = pot`; empty bets with carry ⇒ `carryOut = carry`; property check over random inputs: `Σ payouts + carryOut === Σ amount + carry` and all payouts integers; `multipliers` returns `null` for horses without bets
- [X] T028 [P] [US1] Integration test `tests/integration/round-flow.test.ts` (fixed `seedFn`, `tickMs: 1`): host adds 100 to three players; `host:openRound`; `bet:place` A 30→1 etc. updates balances (70…) and `myBet.potentialPayout`; changing bet refunds old and charges new in one step; rejects amount 0, non-integer, horse 7, amount > balance + current bet, bet outside `betting`; `host:startRace` ⇒ players get `phase: 'racing'`; on finish players get `myResult` with correct `won`/`payout`/`balance`, winners score +1, `potentialPayout` before start equals final payout; non-participant gets `participated: false`; no-winner round ⇒ next round host state shows `carry` and pot including it; `checkInvariant()` holds after every step; `carry_in`/`carry_out` rows never have amount 0; `host:adjustBalance` set/add/subtract works and rejects negative result and unknown/host username

### Implementation for User Story 1

- [X] T029 [P] [US1] Create `server/domain/rng.ts`: `mulberry32(seed: number): () => number` returning floats in `[0, 1)`
- [X] T030 [P] [US1] Create `server/domain/race.ts` per [contracts/domain.md](./contracts/domain.md): `TRACK_LENGTH` (import from `shared/horses.ts`), `ADVANCE_PROBABILITY = 0.1`, `createRace(seed)`, `stepRace(state)` (horses 1→6 in fixed order consume `rng()`; `< 0.1` ⇒ +1 capped at 40; if ≥ 1 at 40 ⇒ `finished`; several ⇒ each tied horse in number order gets `value = rng()`, highest wins, set `photoFinish`), `raceOrder(state)`; no I/O, no `Date`, no `Math.random`
- [X] T031 [P] [US1] Create `server/domain/payouts.ts`: `multipliers(bets, carry)` and `settle(bets, carry, winner)` with pure integer math — `pot = Σ amount + carry`; no bets on winner ⇒ `{ payouts: [], carryOut: pot }`; else `T` = total on winner, per bet `q = floor(amount*pot / T)`, `r = (amount*pot) mod T`, distribute `pot − Σq` one coin each by `r` desc, `confirmedAt` asc, `userId` asc; `carryOut = 0`
- [X] T032 [US1] Implement round state machine in `server/game.ts` per [data-model.md](./data-model.md) transitions, each in a `db.transaction()`: `openRound()` (only from `idle`/`finished`), `placeBet(userId, { horse, amount })` (phase `betting`, role player, integers, `1 ≤ amount ≤ balance + current active bet`; insert or update the active bet with new `confirmed_at = now()`; ledger `bet_refund` of previous amount then `bet_place` of new amount), `startRace()` (insert `results` with `seedFn()` and `status 'running'`, `phase 'racing'`, start `setInterval(tickMs)` calling `stepRace` and `broadcast()`), `finishRace()` (stop interval; `results` → `final` with `winner_horse`, `final_order`, `photo_finish`, `ticks`; `settle` with current carry; bets → `won`/`lost` with `payout`; ledger `payout` per winner and `carry_out` = −carry only if carry > 0, or `carry_in` = Σ round bets only if > 0; `rounds.carry_used`, `winner_horse`, `phase 'finished'`); every mutation ends with `broadcast()`
- [X] T033 [US1] Implement `adjustBalance(actorId, { username, mode, value })` in `server/game.ts`: target must exist with role `player` else `"Jugador no encontrado"`; `value` integer ≥ 0; delta = `value − balance` for `set`, `+value` for `add`, `−value` for `subtract`; reject if resulting balance < 0 with `"El saldo no puede quedar negativo"`; skip insert if delta is 0; ledger `host_adjust` with `note` like `"set 50"`; allowed in any phase
- [X] T034 [US1] Implement projections in `server/game.ts` per [contracts/socket-events.md](./contracts/socket-events.md): `playerState(userId)` (`balance`, `phase`, `odds` only in `betting`, `myBet` with `potentialPayout` from `settle(bets, carry, myBet.horse)`, `myResult` in `finished`) never including other players' data; `hostState()` (`pot`, `carry`, `horses` with `total`, `bettors`, `multiplier`, `bets[]` rows with `potentialPayout` from `settle` for that horse — or real payout in `finished`, `race` with `tick`, `positions`, `order`, `result` with `winner`, `photoFinish`, `winners`, `carriedOver`, `trackLength: 40`); `betStatus` and `leaderboard` may return empty arrays until US3/US6
- [X] T035 [US1] Wire events in `server/socket.ts` with ack `{ ok, error? }`: `bet:place` (role player), `host:openRound`, `host:startRace`, `host:adjustBalance` (all `hostOnly`); catch thrown domain errors and return their Spanish message
- [X] T036 [P] [US1] Implement player view in `src/play.ts` (research R13): build DOM once per phase and update only text nodes on each `state`; always show balance; `betting` ⇒ 6 horse buttons (color swatch via `var(--c-<token>)`, number, `formatMultiplier`), integer amount input (`inputmode="numeric"`, max = balance + current bet) not re-rendered while focused, button "Apostar" / "Cambiar apuesta" calling `emitAck('bet:place')` and showing ack errors; with `myBet` show horse, amount and "Recibirías si gana: N"; `racing` ⇒ "Carrera en curso, mira la pantalla"; `finished` ⇒ "¡Ganaste N monedas!" / "Perdiste" / "No participaste en esta ronda" plus new balance; `idle` ⇒ "Esperando que el host abra una ronda"; no 3D, no other players' data
- [X] T037 [P] [US1] Create `src/host/panel.ts` with `renderControls(state)` and `renderResult(state)` and wire them in `src/host/main.ts`: phase label; buttons "Abrir ronda" (enabled in `idle`/`finished`) and "Iniciar carrera" (enabled in `betting`) calling `emitAck`; pot display; balance editor (username text input, mode select Fijar/Sumar/Restar, value input, "Aplicar") showing ack errors; result panel in `finished` with winner horse (color + number), "PHOTO FINISH" note if `photoFinish`, winners with payout, or "Nadie acertó: N monedas pasan al acumulado"

**Checkpoint**: Ronda completa jugable con texto en el host; `race`, `payouts` y `round-flow` pasan — MVP (US2 + US1)

---

## Phase 5: User Story 3 - Seguimiento en vivo de apuestas en la pantalla grande (Priority: P2)

**Goal**: Panel del host con pozo (incluye acumulado), detalle por caballo y lista de
"apostaron"/"faltan" en vivo; actualizaciones en todos los celulares en menos de 1 s.

**Independent Test**: Con la ronda abierta, apostar y cambiar apuestas desde varios clientes y
ver la pantalla del host y los celulares actualizarse sin recargar (spec US3).

### Tests for User Story 3 ⚠️

- [X] T038 [P] [US3] Integration test `tests/integration/live-updates.test.ts`: after A bets, host and B receive a new `state` within 1000 ms with updated `pot`, `multiplier` and A's row; B's `PlayerState` JSON contains no other username, bet or balance (FR-029); `betStatus.missing` lists connected players without bet, a player disconnecting without bet leaves `missing`, a player who bet and disconnects stays in `placed`, reconnecting player reappears in `missing`; reconnect receives full snapshot immediately
- [X] T039 [P] [US3] Integration test `tests/integration/sync-load.test.ts` (SC-004): connect host + 20 player sockets, host adds coins, all 20 bet on random horses, start race with `tickMs: 1`; assert every host socket receives identical `race.positions` per tick and the same `result`, every player's `myResult.payout` matches the host's `result.winners`, all bet/state updates arrive within 1000 ms, and `checkInvariant()` holds

### Implementation for User Story 3

- [X] T040 [US3] In `server/game.ts` compute `betStatus` (`placed` = usernames with an active bet in the current round regardless of connection; `missing` = connected players (`presence` > 0, role player) without an active bet); presence changes already broadcast via T014, no socket changes needed
- [X] T041 [US3] Add `renderBetting(state)` to `src/host/panel.ts`: pot as "Pozo: N" plus "incluye N acumulado" when `carry > 0` (FR-021a); one card per horse (color swatch, number, total apostado, nº apostadores, `formatMultiplier`, list of `username — apuesta → recibiría`); "Apostaron" and "Faltan" lists; large legible text for a projected screen; update in place on every `state`

**Checkpoint**: US1 + US3 funcionan; `live-updates` y `sync-load` pasan

---

## Phase 6: User Story 4 - Carrera 3D en pantalla grande con leaderboard en vivo (Priority: P2)

**Goal**: Pista recta 3D procedural con 6 caballos con jinete que galopan, cámara que sigue al
líder, photo finish animado y leaderboard de la carrera.

**Independent Test**: Iniciar una carrera y comprobar caballos distinguibles por color y
número, avance gradual, orden del panel igual a la pista y mismas posiciones en dos pantallas
de host (spec US4).

### Implementation for User Story 4

- [X] T042 [P] [US4] Create `src/host/quantize.ts`: `createQuantizePass()` returning a `ShaderPass` (from `three/examples/jsm/postprocessing/ShaderPass.js`) whose fragment shader maps each pixel to the nearest of the 16 `PALETTE` colors (uniform `vec3[16]` built from `src/palette.ts`, Euclidean RGB distance), no dithering (research R10)
- [X] T043 [P] [US4] Create `src/host/track.ts`: `createTrack()` returning a `THREE.Group` with 6 lanes × 40 squares (square length constant, e.g. 2 units), dirt `brown`, lane lines `white`, grass `dark-green` around, start line and checkered finish line via `CanvasTexture` (`black`/`white`, drawn with palette values), `MeshLambertMaterial`; export `squareToX(square)` and `laneZ(index)`
- [X] T044 [P] [US4] Create `src/host/horse.ts`: module-level shared geometries; `createHorse({ color, numberColor, number })` returning a `THREE.Group` with body `CapsuleGeometry`, neck and head `BoxGeometry`, 4 legs `CylinderGeometry` each inside a hip pivot `Group`, tail `ConeGeometry`, rider (torso box, head low-poly sphere, helmet half sphere); coat `brown` shared material; saddle cloth and rider shirt in the horse `color`; number on a `CanvasTexture` (background `color`, digit `numberColor`, system monospace bold) on both cloth sides and rider back (superseded by T073–T075: `createHorse({ color, number, coat })`, sans-serif numbers, neck pivot and mane); `MeshLambertMaterial`; export `updateGallop(horse, dt, moving)` — legs `rotation.z = sin(phase + offset) * A` with front/back pairs in counter-phase, body bob `|sin(phase)| * h`, legs ease back to 0 when not moving (research R12)
- [X] T045 [US4] Create `src/host/scene.ts`: `createScene(container)` with `WebGLRenderer({ antialias: false })`, background `dark-blue`, high ambient + soft directional light, perspective side camera, `EffectComposer` with `RenderPass` + quantize pass, resize handling, `requestAnimationFrame` loop; `setRace(race | null)` storing target squares; per frame exponential lerp of each horse x toward `squareToX(target)` (superseded by T076: damped spring and continuous gallop), `updateGallop(moving = |target − x| > ε)`, camera x lerped toward the leading horse; when `setRace(null)` is called (betting/idle phase, e.g. after `host:resetRace`) or targets reset to 0, snap all horses to square 0 and stop the gallop
- [X] T046 [US4] Add photo finish sequence to `src/host/scene.ts`: when a `state` arrives with `phase 'finished'` and `result.photoFinish`, move camera close to the finish line, freeze for ~1.5 s with a `white` flash overlay and a "PHOTO FINISH" label (DOM); expose `scene.whenIdle(): Promise<void>` that resolves when the sequence ends (immediately if there is none)
- [X] T047 [US4] Add `renderRaceBoard(state)` to `src/host/panel.ts`: during `racing` list `race.order` first to last with horse color/number, current square and usernames that bet on each horse (from `horses[].bets`)
- [X] T048 [US4] Wire `src/host/main.ts`: layout with 3D canvas as protagonist and side/bottom panels; on each `state` call `scene.setRace(state.race)` and the panel renderers for the current phase; when entering `finished`, await `scene.whenIdle()` before calling `renderResult` so the photo finish plays before the result panel

**Checkpoint**: Carrera 3D visible y sincronizada; panel de carrera en vivo

---

## Phase 7: User Story 5 - Control del host sobre la partida y los saldos (Priority: P2)

**Goal**: Reiniciar ronda de apuestas (devuelve todo, conserva acumulado), reiniciar carrera
(conserva apuestas, vuelve a apuestas), autorización estricta de host y recuperación tras
reinicio del servidor.

**Independent Test**: Cargar monedas, reiniciar una ronda con apuestas y una carrera en curso,
verificar saldos, apuestas e historial; intentar acciones de host como jugador (spec US5).

### Tests for User Story 5 ⚠️

- [X] T049 [P] [US5] Integration test `tests/integration/host-permissions.test.ts`: from a player socket, each of `host:openRound`, `host:startRace`, `host:resetRound`, `host:resetRace`, `host:adjustBalance` returns `{ ok: false, error: "No autorizado" }` and DB state (rounds, bets, coin_transactions counts) is unchanged; host cannot `bet:place`
- [X] T050 [P] [US5] Integration test `tests/integration/resets.test.ts`: `host:resetRound` in `betting` ⇒ all active bets `refunded`, each player balance restored exactly, one `bet_refund` per bet with `note "reset round"`, carry unchanged, phase still `betting` with empty pot (except carry); `host:resetRace` in `racing` ⇒ `results.status 'annulled'`, phase `betting`, bets still `active` and editable, no ledger rows added; next `startRace` uses a new seed; resets out of phase rejected; `checkInvariant()` holds after each step
- [X] T051 [P] [US5] Integration test `tests/integration/recovery.test.ts`: using a temp-file DB, start a race, `close()` the app mid-race, recreate with same `dbPath` ⇒ round in `betting`, previous `results` row `annulled`, bets intact, balances unchanged (FR-041)

### Implementation for User Story 5

- [X] T052 [US5] Implement in `server/game.ts`: `resetRound(actorId)` (only `betting`; active bets → `refunded` + `bet_refund` each with `note "reset round"`; carry untouched) and `resetRace()` (only `racing`; stop interval, discard in-memory race, `results.status = 'annulled'`, `phase = 'betting'`, bets untouched), both in a transaction followed by `broadcast()`
- [X] T053 [US5] Implement `recoverOnBoot()` in `server/game.ts` (if current round is `racing`: mark its `running` result `annulled`, set `phase 'betting'`) and call it from `createApp` in `server/index.ts` before accepting connections
- [X] T054 [US5] Wire `host:resetRound` and `host:resetRace` in `server/socket.ts` with `hostOnly` and ack
- [X] T055 [US5] Add to `src/host/panel.ts` buttons "Reiniciar apuestas" (enabled in `betting`) and "Reiniciar carrera" (enabled in `racing`) with an inline two-step confirmation ("¿Seguro? Sí / No", no `confirm()`), showing ack errors; other controls disabled outside their phase

**Checkpoint**: Reinicios, permisos y recuperación verificados

---

## Phase 8: US4b - Ajustes visuales y velocidad (Priority: P2)

**Goal**: El host elige la velocidad de cada carrera (Normal 200 ms, Rápida 100 ms, Turbo 50 ms)
antes de iniciarla; los caballos son ~1,5× más grandes, tienen pelaje fijo por número, números
más finos con contorno de contraste y un galope continuo con cadencia según su racha,
cabeceo y crin, con posición amortiguada sin saltos (spec FR-009a, FR-030a–c; plan "Ajustes US4b").

**Independent Test**: Correr una carrera en cada velocidad y comprobar duración, registro de la
velocidad y mismo resultado con la misma semilla; en la pantalla del host, verificar pelajes,
6 carriles visibles, números legibles y galope continuo (spec US4, escenarios 4–9).

### Tests for US4b ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T064 [P] [US4b] Integration test `tests/integration/race-speed.test.ts` (`startTestServer({ tickMs: undefined, tickMsBySpeed: { normal: 8, fast: 4, turbo: 2 } })`; `tickMs` must be explicitly `undefined` because the harness default `tickMs: 1` overrides every speed): `host:startRace` sin payload ⇒ `results.speed = 'normal'` y `HostState.race.speed = 'normal'`, `race.tickMs = 8`; con `{ speed: 'fast' }` y `{ speed: 'turbo' }` ⇒ se guarda esa velocidad; valores no permitidos (`'ultra'`, `50`, `null`, `{}`) ⇒ `{ ok: false, error: "Velocidad no válida" }`, la ronda sigue en `betting` y no se inserta fila en `results`; desde un socket de jugador ⇒ `"No autorizado"` sin efectos; con la carrera en curso, `host:startRace` con otra velocidad se rechaza y `results.speed` no cambia; tras `host:resetRace` se puede reiniciar con otra velocidad y la nueva fila de `results` la registra; misma semilla (`seedFn` fija) en dos rondas, una `normal` y otra `turbo` ⇒ mismos `winner_horse`, `final_order`, `photo_finish` y `ticks`, y la carrera turbo tarda menos en tiempo real; `checkInvariant()` se cumple
- [X] T065 [P] [US4b] Unit test `tests/unit/horses.test.ts`: `RACE_SPEEDS` es exactamente `{ normal: 200, fast: 100, turbo: 50 }` y `DEFAULT_SPEED = 'normal'`; pelajes por número 1 castaño, 2 pinto, 3 tordo, 4 palomino, 5 pinto, 6 castaño; `COATS` usa exactamente los tokens del plan D2 y todos son claves de `PALETTE`
- [X] T066 [P] [US4b] Unit test `tests/unit/motion.test.ts` per plan D4: `advancesInWindow` cuenta avances en los últimos 10 ticks (y usa los disponibles si hay menos); `gallopRate` es > 0 con 0 avances, crece de forma monótona con los avances, tiene tope y escala ×2 en `fast` y ×4 en `turbo` respecto de `normal`; `damp` converge a la casilla destino, no sobrepasa el destino partiendo del reposo y no produce saltos de posición (cambio por frame acotado por velocidad × dt)
- [X] T078 [P] [US4b] Unit test `tests/unit/race-duration.test.ts` (SC-007): simulate seeds 1..5000 with `createRace`/`stepRace` from `server/domain/race.ts` (pure, no timers) and compute `ticks × RACE_SPEEDS.normal`; assert ≥ 90 % of races last 45–90 s and the median is 55–70 s; assert `fast` and `turbo` durations are exactly `ticks × 100` and `ticks × 50` ms (half and quarter of Normal, same tick count)

### Implementation for US4b

- [X] T067 [US4b] Update design docs for the new contract: `contracts/socket-events.md` (`host:startRace` con `{ speed?: 'normal' | 'fast' | 'turbo' }`, error "Velocidad no válida", `HostState.race.speed` y `race.tickMs`) and `data-model.md` (`results.speed` con su CHECK y la nota del `ALTER TABLE` idempotente)
- [X] T068 [P] [US4b] In `shared/horses.ts` add `RACE_SPEEDS`, `RaceSpeed`, `DEFAULT_SPEED` (with `TICK_MS = RACE_SPEEDS.normal`), `CoatName`, `coat` on each `HORSES` entry and `COATS` per plan D1/D2; in `shared/types.ts` add `StartRacePayload { speed?: RaceSpeed }` and `speed`, `tickMs` to `HostState.race`
- [X] T069 [US4b] In `server/db.ts` add `speed TEXT NOT NULL DEFAULT 'normal' CHECK (speed IN ('normal','fast','turbo'))` to `results` in the schema, plus an idempotent `ALTER TABLE results ADD COLUMN ...` when `PRAGMA table_info(results)` lacks `speed` (existing `data/guanchotrack.db`)
- [X] T070 [US4b] In `server/game.ts`: `startRace(speed = DEFAULT_SPEED)` validates the value (`GameError("Velocidad no válida")` before any write), stores `speed` in `results`, runs `setInterval` with `tickMsBySpeed[speed]` (option in `GameOptions`, default `RACE_SPEEDS`; existing `tickMs` option overrides every speed); `hostState().race` adds `speed` and `tickMs` (from `results` when replaying a finished race); in `server/index.ts` pass `tickMsBySpeed` through `createApp`; in `server/socket.ts` pass the `host:startRace` payload's `speed`
- [X] T071 [US4b] Add the speed selector to `src/host/panel.ts` (Normal / Rápida / Turbo next to "Iniciar carrera", enabled only in `betting`, remembers the last choice in page memory, sends `{ speed }` with `host:startRace`); show "Velocidad: …" during `racing`
- [X] T072 [P] [US4b] Create `src/host/motion.ts` with `advancesInWindow`, `gallopRate` and `damp` per plan D4 (pure, no `three` or DOM imports)
- [X] T073 [US4b] Coats and mane in `src/host/horse.ts`: `createHorse({ color, number, coat })` reads `COATS[coat]` (body, mane, tail tokens); pinto body with a deterministic per-number `CanvasTexture` of irregular `white` spots on `brown` (no `Math.random`); mane as separate geometry on the neck; keep the black outline on coat parts; update callers in `src/host/scene.ts`
- [X] T074 [US4b] Number texture in `src/host/horse.ts` per plan D3: 128 px canvas, system sans-serif stack, normal weight, thin digit in `numberColor` with a thin outline in the opposite token (`white` ↔ `black`)
- [X] T075 [US4b] Neck/head pivot and gallop in `src/host/horse.ts`: `updateGallop(horse, dt, rate)` where `rate = 0` eases to standing; neck and head inside a pivot that pitches forward and down with the stride phase, synced with the legs; mane inside that pivot with a small phase lag
- [X] T076 [US4b] Update `src/host/scene.ts`: horses scaled ×1.5; follow and photo-finish cameras re-framed so the 6 lanes stay visible; keep a per-tick position history from `state.race`; while `racing`, every horse gallops continuously with `gallopRate(advancesInWindow(...), race.tickMs)`; positions follow targets with `damp` (`omega` from `race.tickMs`); horses stop when `finished` (after reaching their square) or on reset (`setRace(null)`)
- [X] T077 [US4b] Visual validation on a separate test instance (own port and temp DB, not `data/`): screenshots of `/host` during a race in each speed and during a photo finish; verify every canvas pixel is one of the 16 palette colors, the 6 lanes are visible, each coat is recognizable, every mane number is legible on its color, and gallop pose changes between frames for leading and stalled horses; fix issues found
- [X] T079 [US4b] Complete FR-033 in `renderResult` (`src/host/panel.ts`): when `result.photoFinish` exists, list the tied horses (color badge + number + name) sorted by `value` desc with the winner first, and always show the final order from `race.order` (1.º…6.º with color badge); extend `tests/integration/race-speed.test.ts` (seed 12 already produces a photo finish) to assert `HostState.result.photoFinish` lists every horse at square 40 and `race.order[0] === result.winner`

**Checkpoint**: Velocidad elegible y registrada sin alterar resultados; caballos más grandes, con pelaje, números legibles y galope continuo; resultado con empatados y orden final (FR-033); `race-speed`, `race-duration`, `horses` y `motion` pasan

---

## Phase 9: User Story 6 - Leaderboard general (Priority: P3)

**Goal**: Todos los jugadores ordenados por puntaje con monedas, primero y último destacados.

**Independent Test**: Jugar varias rondas y comprobar orden y puntajes (spec US6).

### Tests for User Story 6 ⚠️

- [X] T056 [P] [US6] Unit test `tests/unit/ranking.test.ts`: order by score desc; ties by balance desc; then username asc case-insensitive (`"ana"` before `"Beto"`); `isFirst` only on first; `isLast` only on last and only with ≥ 2 players; empty input returns `[]`

### Implementation for User Story 6

- [X] T057 [P] [US6] Create `server/domain/ranking.ts`: `rank(players)` per [contracts/domain.md](./contracts/domain.md) using `localeCompare(b, 'es', { sensitivity: 'base' })`
- [X] T058 [US6] Fill `hostState().leaderboard` in `server/game.ts`: all users with role `player` (never the host), `score` = count of `won` bets, `balance` derived, `online` from presence, passed through `rank()`
- [X] T059 [US6] Add `renderLeaderboard(state)` to `src/host/panel.ts`: position, username, puntaje, monedas, online marker; `.is-first` and `.is-last` highlight classes; always visible on the host screen

**Checkpoint**: Todas las historias funcionan de forma independiente

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T060 [P] Responsive and legibility pass in `src/styles.css`: player view usable from 360 px wide without horizontal scroll and with ≥ 48 px touch targets; host view text sized for a 50" screen at 4 m (SC-009); verify no non-palette color sneaks in
- [X] T061 [P] In `server/index.ts`, run `checkInvariant()` at boot and log a clear console warning if it fails (principle XII audit)
- [X] T062 [P] Create `README.md` with a short run guide (requirements, `npm install`, `npm run dev`, `HOST_USER`/`HOST_PASSWORD`, LAN URL, `npm test`) linking to `specs/001-group-horse-racing/quickstart.md`
- [X] T080 [P] Mark superseded decisions in `specs/001-group-horse-racing/research.md`: append an "Actualización US4b" note to R6 (tick per speed: 200 / 100 / 50 ms, engine unchanged), R11 (mane numbers use the system sans-serif stack, normal weight, thin contrast outline; UI keeps the monospace stack) and R12 (`createHorse({ color, number, coat })`, coats per number, black outline, continuous gallop with streak cadence and damped spring), each pointing to plan "Ajustes US4b" D1–D4
- [X] T063 Run `npm test` (all unit, integration and gate suites green) and walk through the manual steps in `specs/001-group-horse-racing/quickstart.md`, fixing any issue found

---

## Phase 11: User Story 7 - Comodidad y posición en la vista móvil (Priority: P2)

**Goal**: Mostrar al jugador su posición en el leaderboard general durante la carrera y en el
resultado, contener los textos en pantallas chicas y evitar el zoom de iPhone en el campo de
monto (spec US7, FR-028a, FR-029, FR-029a, SC-010; plan D5–D6).

**Independent Test**: con varios jugadores y rondas jugadas, abrir `/play` a 320, 360 y 390 px:
posición visible solo en carrera y resultado, sin datos ajenos, sin desbordes y con campos
≥ 16 px (spec US7).

### Tests for User Story 7 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T081 [P] [US7] Integration test `tests/integration/player-rank.test.ts`: with 4 players (one offline) and a finished round with known winners, each connected player's `PlayerState.myRank` in `finished` equals `{ position, total: 4, score }` matching the host `leaderboard` order (same `rank()` tie-breaks); `myRank` is also present in `racing` and is `null` in `idle` and `betting`; the player's `state` JSON contains no other username, score or balance

### Implementation for User Story 7

- [X] T082 [US7] In `shared/types.ts` add `myRank: { position: number; total: number; score: number } | null` to `PlayerState`; in `server/game.ts` compute it in `playerState(userId, ranking?)` from `rank()` (only in `racing`/`finished`), and in `broadcast()` compute the ranking once and pass it to every `playerState` call
- [X] T083 [US7] In `src/play.ts` show "Ranking: N.º de M · P puntos" (singular "punto" when P = 1) under the racing message and in the result view, updated in place on each `state`; hidden when `myRank` is `null`
- [X] T084 [P] [US7] In `src/styles.css` per plan D6: `input, select { font-size: max(16px, 1em) }` (also inside `label`), `-webkit-text-size-adjust: 100%` on `html`, `touch-action: manipulation` on buttons and inputs, `overflow-wrap: anywhere` on headings and messages, fluid heading sizes with `clamp()` and reduced `letter-spacing` under 420 px, header username with ellipsis; no `user-scalable=no`
- [X] T085 [US7] Validation on a separate test instance (own port and temp DB): `/play` at 320, 360 and 390 px in `betting`, `racing` and `finished` with a 20-character username and a payout ≥ 1.000; assert no horizontal scroll, no element with `scrollWidth > clientWidth` among texts, every `input`/`select` computed `font-size` ≥ 16 px and every control ≥ 48 px tall; screenshots; fix issues found

- [X] T086 [P] [US7] Integration test `tests/integration/player-race-order.test.ts` (`tickMs: 5`, fixed seed): in `racing` a player receives `raceOrder` with the 6 horses and gets several updates with different orders during the race; every update differs from the previous one (no repeated orders sent to players); at `finished` the player's `raceOrder` equals the host `race.order` and starts with `result.winner`; `raceOrder` is `null` in `idle` and `betting`; the player receives fewer `state` messages than the host during the race; still no other usernames in the player `state`
- [X] T087 [US7] In `shared/types.ts` add `raceOrder: HorseNumber[] | null` to `PlayerState` and update `contracts/socket-events.md`; in `server/game.ts` fill it from `raceOrder(run.state)` in `racing`/`finished`, and in `tick()` emit player snapshots only when the order changed since the last one sent (split `broadcast()` into host and players; reset the remembered order on start, finish and `resetRace`)
- [X] T088 [US7] In `src/play.ts` add a race block to the racing and result views: "Tu caballo: N Nombre · va X.º" (or "terminó X.º") when the player bet, and "Adelante" / "Podio" with the first 3 horses (color badge via `var(--c-<token>)`, number and name), updated in place on each `state`; styles in `src/styles.css` contained from 320 px
- [X] T089 [US7] Re-run the T085 validation for the racing and result views with the new block (320/360/390 px: no horizontal scroll, no overflowing text) and update `tests/integration/live-updates.test.ts` key list for `raceOrder`

**Checkpoint**: Posición propia, lugar del caballo apostado y top 3 visibles en carrera y resultado; vista móvil sin desbordes ni zoom; `player-rank` y `player-race-order` pasan

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **US2 (Phase 3)**: Depends on Foundational — provides sessions/login used by every later story
- **US1 (Phase 4)**: Depends on US2 (needs authenticated sockets)
- **US3, US4, US5 (Phases 5–7)**: Depend on US1 (round state machine and projections); independent of each other
- **US4b (Phase 8)**: Depends on US4 (escena 3D) and US5 (`host:resetRace`, usado en los tests de velocidad)
- **US6 (Phase 9)**: Depends on US1; independent of US3–US4b
- **Polish (Phase 10)**: Depends on all user stories being complete (already done before US7)
- **US7 (Phase 11)**: Added after field testing; depends on US1 (player view) and US6 (`rank()` and leaderboard); re-run `npm test` at its checkpoint

### User Story Dependencies

- **US2 (P1)**: after Foundational — no story dependencies
- **US1 (P1)**: after US2
- **US3 (P2)**: after US1 — touches `server/game.ts`, `src/host/panel.ts`
- **US4 (P2)**: after US1 — mostly new files under `src/host/`; `panel.ts`/`main.ts` shared
- **US5 (P2)**: after US1 — touches `server/game.ts`, `server/socket.ts`, `src/host/panel.ts`
- **US6 (P3)**: after US1 — touches `server/game.ts`, `src/host/panel.ts`
- **US4b (P2)**: after US4 and US5 — touches `shared/horses.ts`, `shared/types.ts`, `server/db.ts`, `server/game.ts`, `server/socket.ts`, `src/host/panel.ts`, `src/host/horse.ts`, `src/host/scene.ts`

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Pure domain modules before `server/game.ts`
- `server/game.ts` before `server/socket.ts`
- Server before client views
- Story complete before moving to next priority

### Parallel Opportunities

- Setup: T002, T003, T004 in parallel after T001
- Foundational: T005–T010, T016, T017, T018 in parallel; T011 → T012 → T013 → T014 → T015 → T019 in sequence
- US2: T020, T024, T025 in parallel; T021 → T022 → T023
- US3: tests T038, T039 in parallel; then T040 → T041
- US1: tests T026–T028 in parallel; T029–T031 in parallel; then T032 → T033 → T034 → T035; T036 and T037 in parallel after T035
- US3/US4/US5/US6 can be developed in parallel by different people after US1, coordinating edits to `server/game.ts` and `src/host/panel.ts`
- US4: T042, T043, T044 in parallel, then T045 → T046, T047 → T048
- US4b: tests T064, T065, T066, T078 in parallel; T067, T068, T072 in parallel; server T069 → T070 → T071; visuals T073 → T074 → T075 → T076 (same files); T077 last; T079 after T071 (same file `src/host/panel.ts`)
- US6: T056 and T057 in parallel; then T058 → T059
- Polish: T060, T061, T062, T080 in parallel; T063 last
- US7: T081 and T084 in parallel; then T082 → T083; T085; then T086 → T087 → T088 → T089

---

## Parallel Example: User Story 1

```bash
# Tests first (all in parallel):
Task: "Unit test tests/unit/race.test.ts"
Task: "Unit test tests/unit/payouts.test.ts"
Task: "Integration test tests/integration/round-flow.test.ts"

# Pure domain modules (in parallel):
Task: "Create server/domain/rng.ts"
Task: "Create server/domain/race.ts"
Task: "Create server/domain/payouts.ts"

# Client views after server events are wired (in parallel):
Task: "Implement player view in src/play.ts"
Task: "Create src/host/panel.ts controls and result panel"
```

## Parallel Example: User Story 4

```bash
Task: "Create src/host/quantize.ts"
Task: "Create src/host/track.ts"
Task: "Create src/host/horse.ts"
```

---

## Implementation Strategy

### MVP First (US2 + US1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: US2 (login)
4. Complete Phase 4: US1 (ronda completa, host en modo texto)
5. **STOP and VALIDATE**: jugar una ronda real con celulares en la LAN
6. Demo if ready

### Incremental Delivery

1. Setup + Foundational → base lista
2. US2 + US1 → MVP jugable (texto en el host)
3. US3 → panel de apuestas en vivo
4. US4 → carrera 3D (el espectáculo)
5. US5 → reinicios y recuperación
6. US4b → velocidad de carrera, pelajes, tamaño y galope continuo
7. US6 → leaderboard general
8. Polish → responsive, README, research al día, validación quickstart
9. US7 → posición propia y comodidad en la vista móvil (tras probar con celulares)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Never write color literals outside `src/palette.ts`; the palette gate test enforces it
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Task IDs keep their original numbers so completed work and earlier reports stay traceable; tasks added later (T078–T080) were appended to the phase they belong to, so IDs are not strictly sequential inside a phase
