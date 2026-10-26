# Contract: funciones puras (feature 003)

Amplía [002 domain](../../002-host-admin-panel/contracts/domain.md). Sin I/O, reloj ni estado
global (principio VIII).

## server/domain/payouts.ts — `tests/unit/payouts.test.ts`

```ts
/** floor(pot × 10 / 100). */
function ownerShare(pot: number): number;

/** (pot − parte del dueño si `owned.has(h)`) / total(h); null si nadie apostó a h. */
function multipliers(
  bets: BetInput[],
  carry: number,
  owned: ReadonlySet<HorseNumber>,
): Record<HorseNumber, number | null>;

/** Reparte `pot − ownerShare` (o `pot` si !owned) con la regla de 001. */
function settle(
  bets: BetInput[],
  carry: number,
  winner: HorseNumber,
  owned: boolean,
): {
  ownerShare: number;                       // 0 si !owned
  payouts: { userId: number; amount: number }[];
  carryOut: number;                         // pot − ownerShare si no hay acertantes; si no, 0
};
```

Casos obligatorios:

| Caso | Entrada | Esperado |
|------|---------|----------|
| Dueño + acertante | pot 105 (beto 35 al 2, carla 70 al 4), gana 2, owned | ownerShare 10; beto 95 |
| Sin dueño | ídem, !owned | beto 105 (igual que 001) |
| Sin acertantes | pot 80 sin apuestas al 2, owned | ownerShare 8; payouts []; carryOut 72 |
| Pozo < 10 | pot 9, owned | ownerShare 0; pagos suman 9 |
| Redondeo | varios acertantes, owned | Σ payouts + ownerShare = pot |
| Multiplicador = pago | toda apuesta al ganador | `floor(amount × mult)` ≤ pago ≤ `ceil` y Σ = pot − share |
| Dueño apuesta a sí mismo | dueño también en `bets` | ownerShare separado de su payout |

## shared/horses.ts — `tests/unit/horses.test.ts`

```ts
interface Horse { /* ver data-model.md: + dorsal, + owner */ }

const HORSE_PRICE_STABLE = 30;
const HORSE_PRICE_PLAYER = 50;
const OWNER_SHARE_PERCENT = 10;

/** 30 sin dueño, 50 de otro, null si ownerId === buyerId. */
function purchasePrice(ownerId: number | null, buyerId: number): number | null;

/** Nombre 1–16 (regex de 002 con 16), único sin mayúsculas; dorsal entero 1–99 único. */
function validateHorseIdentity(
  current: readonly Horse[],
  lane: unknown,
  name: unknown,
  dorsal: unknown,
): { ok: true; name: string; dorsal: number } | { ok: false; error: string };

/** Host: validateHorseIdentity + color y pelaje (002). Devuelve el caballo listo, sin tocar owner. */
function validateHorseEdit(current: readonly Horse[], edit: unknown):
  { ok: true; horse: Horse } | { ok: false; error: string };
```

Casos: nombre de 16 aceptado y 17 rechazado; dorsal 0, 100, 2.5 y `"7"` rechazados; dorsal o
nombre repetido de otro caballo rechazado; el mismo caballo puede conservar su nombre y dorsal;
`purchasePrice(null, 1) = 30`, `purchasePrice(2, 1) = 50`, `purchasePrice(1, 1) = null`.
