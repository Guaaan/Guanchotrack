---

description: "Task list for GuanchoTrack — propiedad de caballos"
---

# Tasks: Propiedad de caballos

**Input**: Design documents from `/specs/003-horse-ownership/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUIDOS. Flujo TDD del proyecto y principio VIII (pagos con dueño y conservación de
monedas con tests obligatorios). Los tests de cada historia se escriben primero y deben fallar
antes de implementar.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Include exact file paths in descriptions

## Path Conventions

Paquete único: `server/`, `shared/`, `src/`, `tests/` (`unit/`, `integration/`, `gates/`,
`helpers/`). Referencias: [contracts/socket-events.md](./contracts/socket-events.md),
[contracts/domain.md](./contracts/domain.md), [data-model.md](./data-model.md),
[research.md](./research.md). Tests de integración con `startTestServer()`, `initialState`,
`nextState`, `emitAck`, `track` de `tests/helpers/server.ts` (SQLite `:memory:`, `tickMs: 1`,
`seedFn` incremental). Terminología: **carril** = `Horse.number` / `HorseNumber` 1–6 (identidad
interna, no cambia); **dorsal** = `Horse.dorsal` 1–99 (lo que la UI llama "número").

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Línea base. Sin dependencias nuevas (plan, principio I).

- [X] T001 Run `npm test` and `npx tsc --noEmit` on the current tree and confirm all 001/002 suites pass before any change (baseline; record failures if any, do not fix them here)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema y migración, tipos, reglas puras compartidas y firma nueva de pagos (sin
cambiar el comportamiento: todo sin dueño)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Write failing test `tests/integration/horse-migration.test.ts`: (a) build a temp-file DB with the 002 schema as it is today (copy the current `SCHEMA` of `server/db.ts` into the test: `coin_transactions.kind` CHECK without the new kinds, `admin_log.action` CHECK without `owner_edit_horse`, `horses` without `dorsal`/`owner_id`, `results` without `owner_id`/`owner_share`), insert a host, 2 players, a finished round with bets, payouts, a `host_adjust` and a `carry_in`; remember all `coin_transactions` rows; (b) `openDb(path)` ⇒ `horses` has `dorsal` = `number` for the 6 rows and `owner_id IS NULL`; `results` has `owner_id` and `owner_share` (= 0 on old rows); table `horse_purchases` exists; `coin_transactions` rows identical (same `id`, values) and an insert with `kind = 'owner_share'` succeeds; an `admin_log` insert with `action = 'owner_edit_horse'` succeeds; `checkInvariant()` true; balances (`balanceOf`) and `carryBalance` unchanged; (c) calling `openDb` again is idempotent (no second rebuild, same rows)
- [X] T003 In `server/db.ts` (research R2, R3, R8; [data-model.md](./data-model.md)): extend `TxKind` with `'horse_buy' | 'horse_sale' | 'owner_share'` and the `SCHEMA` CHECK of `coin_transactions.kind` accordingly; extend `AdminAction` and the `admin_log.action` CHECK with `'owner_edit_horse'`; add to `SCHEMA` `horse_purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, horse INTEGER NOT NULL CHECK (horse BETWEEN 1 AND 6), buyer_id INTEGER NOT NULL REFERENCES users(id), seller_id INTEGER REFERENCES users(id), price INTEGER NOT NULL CHECK (price IN (30, 50)), name TEXT NOT NULL, dorsal INTEGER NOT NULL, round_id INTEGER REFERENCES rounds(id), created_at INTEGER NOT NULL)`; in `openDb`: `addColumn(horses, 'dorsal', 'INTEGER')`, `addColumn(horses, 'owner_id', 'INTEGER REFERENCES users(id)')`, then `UPDATE horses SET dorsal = number WHERE dorsal IS NULL`; `addColumn(results, 'owner_id', 'INTEGER REFERENCES users(id)')`, `addColumn(results, 'owner_share', 'INTEGER NOT NULL DEFAULT 0')`; helper `rebuildTable(db, table, createSql, marker)` that, only when `sqlite_master.sql` for `table` does not contain `marker`, in one transaction creates `<table>_new` with the new CHECK, `INSERT INTO <table>_new SELECT * FROM <table>` (same column order, keeps `id`), `DROP TABLE <table>`, `ALTER TABLE <table>_new RENAME TO <table>` and recreates `coin_transactions_user`; call it for `coin_transactions` (marker `owner_share`) and `admin_log` (marker `owner_edit_horse`); seed `DEFAULT_HORSES` with `dorsal`. Make T002 pass
- [X] T004 [P] In `shared/horses.ts` (contracts/domain.md): add `dorsal: number` and `owner: string | null` to `Horse`; set `dorsal` = `number` and `owner: null` in `DEFAULT_HORSES`; add constants `HORSE_PRICE_STABLE = 30`, `HORSE_PRICE_PLAYER = 50`, `OWNER_SHARE_PERCENT = 10`; add `purchasePrice(ownerId: number | null, buyerId: number): number | null` (30 sin dueño, 50 de otro, `null` si `ownerId === buyerId`)
- [X] T005 [P] Write failing unit tests in `tests/unit/horses.test.ts`: `purchasePrice(null, 1) = 30`, `purchasePrice(2, 1) = 50`, `purchasePrice(1, 1) = null`; `DEFAULT_HORSES` have `dorsal` 1–6 and `owner: null`
- [X] T006 [P] In `shared/types.ts` per [contracts/socket-events.md](./contracts/socket-events.md): `BuyHorsePayload { horse: HorseNumber; expectedOwner: string | null }`, `EditHorsePayload { horse: HorseNumber; name: string; dorsal: number }`; add `dorsal: number` to `UpdateHorsePayload`; add `myHorses: { horse: HorseNumber; earned: number }[]` to `PlayerState`; add `owner: { username: string; share: number } | null` to `HostState['result']`; add `purchases: { at: number; horse: HorseNumber; name: string; dorsal: number; buyer: string; seller: string | null; price: number }[]` to `HostState`
- [X] T007 In `server/db.ts` `getHorses(db)`: select `h.dorsal` and the owner name with `LEFT JOIN users u ON u.id = h.owner_id` (`owner = u.username` or `null`); add helper `ownerOf(db, horse): number | null` and `ownedHorses(db): Set<HorseNumber>`
- [X] T008 In `server/domain/payouts.ts` change signatures without changing results yet (contracts/domain.md): `multipliers(bets, carry, owned: ReadonlySet<HorseNumber>)` and `settle(bets, carry, winner, owned: boolean)` returning `{ ownerShare: 0, payouts, carryOut }`; update callers in `server/game.ts` (`odds()`, `playerState()`, `hostState()`, `finishRace()`) to pass `new Set()` / `false` and existing `tests/unit/payouts.test.ts` calls to pass `new Set()` / `false`
- [X] T009 In `server/game.ts`: fill `myHorses: []` in `playerState()` and `purchases: []`, `result.owner: null` in `hostState()` (filled per story); add a public `requireNotRacing()` that throws `GameError('No se puede durante la carrera')` when `phase() === 'racing'` (do not use it in `server/admin.ts` yet: `requireNoRound` stays until T034, so the 002 suites stay green in T011)
- [X] T010 Create `server/stable.ts` skeleton: class `Stable` built with `{ db, game, now? }`, private `apply(action)` = `db.transaction(action)()` then `game.broadcast()` (same pattern as `server/admin.ts`), and private `player(userId)` that throws `GameError('Solo los jugadores pueden comprar caballos')` unless the user is a live `player`; in `createApp()` of `server/index.ts` create `new Stable({ db, game })` next to `new Admin(...)` and pass it to `attachSocket(io, db, game, admin, stable)` (update the signature in `server/socket.ts`; `tests/helpers/server.ts` needs no change: it uses `createApp()`)
- [X] T011 Run `npm test` and `npx tsc --noEmit`: all 001/002 suites still green (behavior unchanged, horses without owners)

**Checkpoint**: schema migrated, types ready, pagos con firma nueva — user stories can start

---

## Phase 3: User Story 1 - Comprar caballos (Priority: P1) 🎯 MVP

**Goal**: Un jugador compra caballos al establo (30 → pozo acumulado) o a otro jugador (50 → dueño anterior) desde la sección "Caballos" del celular, fuera de la carrera

**Independent Test**: ana (100), beto (60), pozo 0: ana compra el 3 al establo, beto se lo compra a ana ⇒ ana 120, beto 10, pozo 30, dueño visible, suma total intacta

### Tests for User Story 1 ⚠️

- [X] T012 [P] [US1] Write failing test `tests/integration/horse-buy.test.ts` (spec US1 scenarios 1–8 and Edge Cases): fresh state ⇒ every `horseDefs[i].owner === null`; ana (100) `horse:buy { horse: 3, expectedOwner: null }` ⇒ ok, ana 70, `carry` +30, `horseDefs[2].owner === 'ana'`, ledger rows `{ user: ana, kind: 'horse_buy', -30, actor_id: ana, round_id: null }` and `{ user: null, kind: 'horse_buy', +30, actor_id: ana, round_id: null }` (bought in `idle`; a purchase during `betting` stores that round's id), one `horse_purchases` row `{ horse: 3, buyer: ana, seller: null, price: 30, name, dorsal }`; beto (60) `horse:buy { horse: 3, expectedOwner: 'ana' }` ⇒ beto 10, ana 120, rows `horse_buy -50` (beto) / `horse_sale +50` (ana), name and dorsal kept; ana buying her own horse ⇒ error "Este caballo ya es tuyo"; beto (25) buying a stable horse ⇒ "Saldo insuficiente" and nothing changes; balance exactly 30 ⇒ accepted, balance 0; during `racing` ⇒ rejected; in `idle`, `betting` and `finished` ⇒ accepted; ana buys 1, 2 and 5 ⇒ owner of the three; stale `expectedOwner` (null when it already has owner, or 'ana' when it is now 'beto') ⇒ "Este caballo cambió de dueño, revisa el precio" without charging; host socket emitting `horse:buy` ⇒ rejected; balance with active bet: available = `balanceOf` (bet already discounted); `checkInvariant()` true after every step
- [X] T013 [P] [US1] Add a test in `tests/integration/horse-buy.test.ts`: buying a stable horse during `betting` with bets already placed ⇒ host `pot` and `carry` +30 and multipliers recalculated in the next `state` (still without owner discount until US2)

### Implementation for User Story 1

- [X] T014 [US1] In `server/stable.ts` implement `buyHorse(userId, payload: BuyHorsePayload)` (research R7): inside `apply`: `player(userId)`; `game.requireNotRacing()`; validate `horse` 1–6 ("Caballo inválido"); read current owner (`ownerOf`) and its username; if `ownerId === userId` ⇒ "Este caballo ya es tuyo"; if current owner name ≠ `payload.expectedOwner` ⇒ "Este caballo cambió de dueño, revisa el precio"; `price = purchasePrice(ownerId, userId)`; if `balanceOf(db, userId) < price` ⇒ "Saldo insuficiente"; ledger (both legs with `actorId` = buyer, `roundId` = current round id or NULL when there is none, `createdAt = now()`): buyer `horse_buy -price`, then pozo (`userId: null`) `horse_buy +price` if no owner, or seller `horse_sale +price`; `note: 'horse:<n> purchase:<id>'`; `UPDATE horses SET owner_id = ?`; insert `horse_purchases` with current name, dorsal, current round id (or NULL) and `now()`
- [X] T015 [US1] In `server/socket.ts` add `on('horse:buy', (s, payload, ack) => run(ack, () => stable.buyHorse(s.data.userId, payload as BuyHorsePayload)))`; make T012–T013 pass
- [X] T016 [P] [US1] Create `src/stable.ts` (research R12): `mountStable(root, { emitAck })` renders the "Caballos" section with one row per `horseDefs()` entry: swatch (manta color, dorsal in `numberColor`), name, coat label (castaño/pinto/tordo/palomino), owner label ("establo", "tú" when `owner === state.username`, or the owner's name), price ("30" / "50" / none if own) and a "Comprar" button that emits `horse:buy { horse, expectedOwner: owner }` and shows the ack error inline; `update(state: PlayerState)` disables "Comprar" with the reason ("Carrera en curso" in `racing`, "Saldo insuficiente" when `balance < price`); re-render on `onHorseDefsChange`
- [X] T017 [US1] In `src/play.ts` and `play.html` mount the section below the bet/result area, visible in every phase, and call its `update(state)` on each `state`; add styles in `src/styles.css` using only palette tokens (`var(--c-*)`), rows that wrap from 320 px without horizontal scroll and buttons ≥ 44 px tall

**Checkpoint**: US1 complete — buying works end-to-end and coins are conserved

---

## Phase 4: User Story 2 - Cobrar como dueño (Priority: P1)

**Goal**: Si gana un caballo con dueño, el dueño cobra `floor(pozo / 10)` y el resto va por parimutuel; multiplicadores en vivo netos

**Independent Test**: ana compra el 2 al establo (acumulado 30); beto 35 al 2, carla 70 al 4 (pozo 135); gana el 2 ⇒ ana 13, beto 122; el multiplicador mostrado antes era (135 − 13) ÷ 35

### Tests for User Story 2 ⚠️

- [X] T018 [P] [US2] Add failing unit tests to `tests/unit/payouts.test.ts` with the mandatory cases of [contracts/domain.md](./contracts/domain.md): `ownerShare(105) = 10`, `ownerShare(9) = 0`, `ownerShare(0) = 0`; owned winner pot 105 (beto 35 al 2, carla 70 al 4) ⇒ `ownerShare 10`, beto 95; same not owned ⇒ beto 105; owned without winning bets pot 80 ⇒ `ownerShare 8`, `payouts []`, `carryOut 72`; pot 9 owned ⇒ share 0, payouts sum 9; several winners owned ⇒ `Σ payouts + ownerShare = pot` and leftover by largest remainder, then `confirmedAt`, then `userId`; owner also in `bets` ⇒ share independent of his payout; `multipliers(bets, carry, new Set([2]))[2] === (pot - ownerShare(pot)) / total(2)` and unowned horses unchanged
- [X] T019 [P] [US2] Write failing test `tests/integration/horse-owner-payout.test.ts` (spec US2 scenarios 1–8): with horse 2 bought by ana before the round (use a `seedFn` that makes horse 2 win — find it with `createRace`/`stepRace` in the test), beto 35 al 2, carla 70 al 4 and the 30 from ana's purchase in the carry (pot 135) ⇒ after the race ana +13 (`owner_share` row), beto 122 (`payout`), carry 0 (`carry_out -30`), `results.owner_id = ana`, `results.owner_share = 13`; nobody on the winner ⇒ ana gets share and `carryBalance` = previous carry + staked − share (`carry_in` or `carry_out`); unowned winner ⇒ ledger identical to 001 (`carry_in staked` when no winners); ana also betting on her horse ⇒ two separate rows (`owner_share` and `payout`); ana gets no extra point (score unchanged unless her bet won); during `betting` the host `horses[i].multiplier`, `bets[].potentialPayout` and player `odds`/`myBet.potentialPayout` already discount the share and equal the final payout; buying a horse during `betting` recalculates multipliers with the new owner; `checkInvariant()` true; photo finish winner owned ⇒ share applied to the declared winner

### Implementation for User Story 2

- [X] T020 [US2] In `server/domain/payouts.ts` implement `ownerShare(pot) = Math.floor((pot * OWNER_SHARE_PERCENT) / 100)` (import from `shared/horses.ts`); `settle(..., owned)` distributes `pot − share` with the existing floor + largest-remainder rule (`floor(amount × (pot − share) / T)`), returns `ownerShare`, and `carryOut = pot − share` when there are no winning bets; `multipliers(..., owned)` uses `(pot − (owned.has(h) ? share : 0)) / total`; make T018 pass
- [X] T021 [US2] In `server/game.ts` pass `ownedHorses(db)` to `multipliers` in `odds()` and `owned.has(h)` to every `settle` in `playerState()` (`myBet.potentialPayout`) and `hostState()` (potential per horse)
- [X] T022 [US2] In `server/game.ts` `finishRace()` (research R5): `ownerId = ownerOf(db, winner)`; `settle(inputs, carry, winner, ownerId !== null)`; if `ownerShare > 0` add `{ userId: ownerId, kind: 'owner_share', amount: ownerShare, roundId }`; with winners keep `payout` rows and `carry_out -carry`; without winners write the net pot change `staked − ownerShare` as `carry_in` (> 0) or `carry_out` (< 0) or nothing (= 0) — identical to today when there is no owner; `UPDATE results SET owner_id = ?, owner_share = ?`; make T019 pass
- [X] T023 [US2] In `server/admin.ts` `removePlayer` (research R6, FR-034): if `game.phase() === 'racing'` and the player owns any horse ⇒ `GameError('No se puede eliminar a un dueño durante la carrera')`; otherwise `UPDATE horses SET owner_id = NULL WHERE owner_id = ?` in the same transaction; extend `tests/integration/admin-remove.test.ts` with both cases (horse back to stable with same name/dorsal and price 30; rejection during race)

**Checkpoint**: US1 + US2 = MVP — buying has a reward and payouts match what is shown

---

## Phase 5: User Story 3 - Editar mis caballos y ver lo que me generan (Priority: P2)

**Goal**: El dueño cambia nombre (1–16) y dorsal (1–99) únicos; ve cuánto le generó cada caballo; el dorsal se ve en todas las pantallas

**Independent Test**: ana compra el 3, lo renombra "Trueno" con dorsal 77, intenta dorsal 5 (rechazo), gana con él y ve lo generado

### Tests for User Story 3 ⚠️

- [X] T024 [P] [US3] Add failing unit tests to `tests/unit/horses.test.ts` for `validateHorseIdentity(current, lane, name, dorsal)`: name of 16 characters accepted and 17 rejected; empty/only spaces rejected; trimmed and inner spaces collapsed; dorsal `0`, `100`, `2.5` and `"7"` rejected; dorsal or name (case-insensitive) used by another horse rejected; the same horse keeping its own name and dorsal accepted; invalid lane rejected. Also update the 002 cases in the same file: `NAME_ERROR` says "El nombre debe tener entre 1 y 16 caracteres: letras, números, espacios o guiones", `'x'.repeat(15)` becomes `'x'.repeat(17)`, and the base edit used by `errorOf` includes `dorsal` (= lane) so `validateHorseEdit` keeps passing
- [X] T025 [P] [US3] Write failing test `tests/integration/horse-edit.test.ts` (spec US3 scenarios 1–8): ana owner of 3 `horse:edit { horse: 3, name: 'Trueno', dorsal: 77 }` ⇒ host and player `horseDefs[2]` `{ name: 'Trueno', dorsal: 77 }`, `admin_log` row `owner_edit_horse` with actor ana and before/after; dorsal 5 or name "rojo" (another horse) ⇒ rejected; name of 17 chars / dorsal 100 ⇒ rejected; beto editing ana's horse ⇒ "Solo el dueño puede editar este caballo"; payload with `color`/`coat` ⇒ ignored (color and coat unchanged); during `racing` ⇒ rejected; in `betting` ⇒ accepted; ana with two owner shares 10 and 15 from horse 3 ⇒ `myHorses` contains `{ horse: 3, earned: 25 }`; after beto buys horse 3 ⇒ beto `earned: 0` and ana no longer lists it; same seed with renamed/re-numbered horses ⇒ same winner and order (SC-005)

### Implementation for User Story 3

- [X] T026 [US3] In `shared/horses.ts` (research R8): change `HORSE_NAME_RE` to 1–16 (`/^[\p{L}\p{N} -]{1,16}$/u`, message "El nombre debe tener entre 1 y 16 caracteres: letras, números, espacios o guiones"); add `validateHorseIdentity(current, lane, name, dorsal)` ⇒ `{ ok: true, name, dorsal } | { ok: false, error }` ("Caballo inválido", name rules of 002 with 16, "Otro caballo ya se llama así", "El número debe ser un entero de 1 a 99", "Otro caballo ya usa ese número"); make `validateHorseEdit` call it, accept `dorsal` and return the horse with `dorsal` and the current `owner` untouched; make T024 pass
- [X] T027 [US3] In `server/stable.ts` implement `editHorse(userId, payload: EditHorsePayload)`: `player(userId)`; `game.requireNotRacing()`; owner check ("Solo el dueño puede editar este caballo"); `validateHorseIdentity(getHorses(db), horse, name, dorsal)`; `UPDATE horses SET name = ?, dorsal = ? WHERE number = ?` (never color/coat); `logAdmin({ actorId: userId, action: 'owner_edit_horse', target: 'horse:<n>', before: { name, dorsal }, after: { name, dorsal } })`; in `server/socket.ts` add `on('horse:edit', ...)` with `run()`
- [X] T028 [US3] In `server/game.ts` `playerState()`: `myHorses` = horses where `owner_id = userId`, each with `earned = SELECT COALESCE(SUM(owner_share), 0) FROM results WHERE owner_id = ? AND winner_horse = ? AND status = 'final'` (research R9); make T025 pass
- [X] T029 [US3] In `src/stable.ts`: for own horses show "te ha generado N" (from `state.myHorses`) and an "Editar" action with inline inputs for name (`maxlength="16"`, font-size ≥ 16 px) and number (`type="number" min="1" max="99"`), pre-validated with `validateHorseIdentity` before emitting `horse:edit`; show the ack error inline; disabled during `racing`
- [X] T030 [P] [US3] Show the dorsal instead of the lane wherever a horse number is displayed: `src/play.ts` (`swatch()`, "Tu apuesta: … al <dorsal> <name>", "Ganó el <dorsal> …", podium and "Tu caballo"), `src/host/panel.ts` (`horseBadge`), `src/host/admin.ts` (editor badge and aria labels use the dorsal); keep lanes as keys (`buttons`, `cards`, `cardHeads`)
- [X] T031 [P] [US3] In `src/host/horse.ts` `numberTexture(color, numberColor, dorsal)`: font 104 px for 1 digit and ~80 px for 2 digits (same outline) so "77" fits the blanket (research R11); `spotsTexture` stays seeded by lane; in `src/host/scene.ts` pass `dorsal` to `createHorse` and add `dorsal` to `lookOf` so meshes rebuild when it changes

**Checkpoint**: US3 complete — owners personalise and see their return

---

## Phase 6: User Story 4 - Dueños en la pantalla del host (Priority: P3)

**Goal**: Pista con dorsal, paneles con nombre y dueño, parte del dueño en el resultado, historial de compras y edición total del host

**Independent Test**: tras varias compras y una carrera ganada por un caballo con dueño, revisar pista, paneles, resultado e historial; el host edita el caballo de un dueño y restablece conservando dueños

### Tests for User Story 4 ⚠️

- [X] T032 [P] [US4] Extend `tests/integration/admin-horses.test.ts` (spec US4 scenarios 5–6, FR-012–FR-014): host `admin:updateHorse` with `dorsal` on a horse owned by ana ⇒ applied, owner unchanged, ana's `horseDefs` updated; name of 16 chars accepted; update `PHASE_ERROR` to `{ ok: false, error: 'No se puede durante la carrera' }` and rewrite the 002 test "solo sin ronda en curso" (line 72): edit accepted in `betting` and `finished`, rejected in `racing`; `admin:resetHorses` ⇒ default name, `dorsal = number`, color, coat and owners kept; `before`/`after` in `admin_log` include `dorsal`
- [X] T033 [P] [US4] Write failing test `tests/integration/horse-host-view.test.ts` (spec US4 scenarios 1–4, FR-030–FR-031): after purchases (stable → ana, ana → beto, stable → carla) `HostState.purchases` lists 3 rows newest first with name/dorsal at purchase time, buyer, seller (`null` for stable) and price; renaming afterwards does not change old rows; deleted buyer shown as `(eliminado)`; `purchases` absent from `PlayerState`; finished race with owned winner ⇒ `result.owner = { username, share }`; unowned winner ⇒ `result.owner = null`; result survives a server restart (reload from `results.owner_id/owner_share`)

### Implementation for User Story 4

- [X] T034 [US4] In `server/admin.ts`: replace `requireNoRound()` with `game.requireNotRacing()` in `updateHorse` and `resetHorses`; `updateHorse` saves `name`, `dorsal`, `color`, `coat` (never `owner_id`); `resetHorses` sets `dorsal = number` and keeps `owner_id`; `look()` includes `dorsal`; make T032 pass
- [X] T035 [US4] In `server/game.ts` `hostState()`: `result.owner` from `results.owner_id`/`owner_share` of the final result (username or `(eliminado)`; `null` when `owner_share = 0` and no owner); `purchases` = last 50 rows of `horse_purchases` ordered by `id DESC` joined with buyer/seller (`(eliminado)` when `deleted_at IS NOT NULL`, seller `null` for stable); make T033 pass
- [X] T036 [P] [US4] In `src/host/panel.ts`: betting cards, race order and result show name, dorsal and owner ("de ana" / "del establo"); the result shows "Dueño <name> recibe <share>" when `result.owner` is set
- [X] T037 [P] [US4] In `src/host/admin.ts`: horse editor gains a number input (`type="number" min="1" max="99"`), name `maxlength="16"`, an owner label per horse, and sends `dorsal` in `admin:updateHorse`; the editor is disabled only during `racing`; add a "Compras de caballos" table (fecha, caballo, comprador, vendedor/"establo", precio) fed by `state.purchases`

**Checkpoint**: all user stories functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T038 [P] Add a conservation test `tests/integration/horse-conservation.test.ts`: random sequence of purchases (stable and player), edits, bets, races with owned and unowned winners, `resetRound`, `resetRace` and `removePlayer` of an owner ⇒ `checkInvariant()` true after every step and Σ coins changes only by `host_adjust` (SC-003, SC-004)
- [X] T039 [P] Run `npm test` including `tests/gates/palette.test.ts` and `tests/gates/assets.test.ts` with the new files (`src/stable.ts`, `server/stable.ts`); fix any color literal outside `src/palette.ts`
- [X] T040 Run `npx tsc --noEmit` and fix type errors across `server/`, `shared/`, `src/`, `tests/`
- [X] T041 Migration check on a copy of the real DB: `cp data/guanchotrack.db "$CLAUDE_JOB_DIR/tmp/gt-copy.db"` and `DB_PATH=<copy> PORT=3100 npm run dev` ⇒ starts without errors, balances and carry unchanged, horses without owner and `dorsal` = lane, no invariant warning (quickstart)
- [X] T042 Run the manual validation of [quickstart.md](./quickstart.md) (steps 1–8) with headless Chrome screenshots on the `:3100` test server (temp DB, never `data/`): "Caballos" section at 320/360/390 px, purchase history in Admin, dorsal 77 on the 3D track (0 off-palette pixels in the canvas), result with owner share
- [X] T043 [P] Update `README.md` with a short "Propiedad de caballos" section (precios 30/50, compra forzosa, fuera de carrera, 10 % del pozo al dueño, multiplicadores netos, edición de nombre y número)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: after Setup — BLOCKS all user stories
- **US1 (Phase 3)**: after Foundational — MVP part 1
- **US2 (Phase 4)**: after Foundational; its integration test buys horses, so do it after US1 (T014–T015)
- **US3 (Phase 5)**: after Foundational; `myHorses` test needs owner shares (US2) and purchases (US1)
- **US4 (Phase 6)**: after US1 (purchases) and US2 (`results.owner_*`); T037 after T029 (shared rules)
- **Polish (Phase 7)**: after all stories

### Within Each Phase

- T002 (test) before T003; T004 before T003 (seed needs `dorsal`) — do T004 first or together
- T006 before T007–T010; T008 before T011
- US1: T012–T013 (fail) → T014 → T015; T016 in parallel with T014; T017 after T016
- US2: T018–T019 (fail) → T020 → T021 → T022 → T023
- US3: T024–T025 (fail) → T026 → T027 → T028 → T029; T030 and T031 in parallel after T026
- US4: T032–T033 (fail) → T034 → T035; T036 and T037 in parallel after T035
- Tests MUST fail before implementation; server before client

### Parallel Opportunities

- Foundational: T004, T005, T006 in parallel
- US1: T012, T013 in parallel; T016 (client) in parallel with T014 (server)
- US2: T018, T019 in parallel
- US3: T024, T025 in parallel; T030 and T031 in parallel
- US4: T032, T033 in parallel; T036 and T037 in parallel
- Polish: T038, T039, T043 in parallel

---

## Parallel Example: User Story 1

```bash
# Tests first (parallel):
Task: "T012 horse-buy.test.ts"
Task: "T013 buy during betting recalculates pot"
# Server and client in parallel:
Task: "T014 Stable.buyHorse in server/stable.ts"
Task: "T016 src/stable.ts section"
```

## Parallel Example: User Story 3

```bash
Task: "T024 unit validateHorseIdentity"
Task: "T025 horse-edit.test.ts"
# after T026:
Task: "T030 dorsal in play/panel/admin"
Task: "T031 numberTexture 2 digits"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 + Phase 2 (migration, types, pagos con firma nueva)
2. Phase 3 (US1): comprar al establo y a jugadores
3. Phase 4 (US2): parte del dueño y multiplicadores netos
4. **STOP and VALIDATE**: `npm test`, invariant, a race won by an owned horse — comprar ya tiene sentido

### Incremental Delivery

1. MVP (US1 + US2) ⇒ validate
2. US3 (edición del dueño, dorsal visible, lo generado) ⇒ validate phone + 3D
3. US4 (host: paneles, resultado, historial, edición total) ⇒ validate
4. Polish (conservation fuzz, gates, types, migration on DB copy, screenshots, README)

## Notes

- Commits only when the user asks; never push without confirmation
- Never use `data/guanchotrack.db` for tests or screenshots: temp DB + port 3100; copy the DB before checking the migration (it rebuilds `coin_transactions`)
- Constitution v2.1.0: dueño `floor(pot × 10 / 100)`, multiplicadores netos con la misma función que liquida, compras que solo transfieren monedas, todo en el libro
