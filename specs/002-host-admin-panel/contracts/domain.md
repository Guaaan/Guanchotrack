# Contract: funciones puras (feature 002)

Amplía [001 domain](../../001-group-horse-racing/contracts/domain.md). Sin I/O, reloj ni estado
global (principio VIII); probadas en `tests/unit/horses.test.ts`.

## shared/horses.ts

```ts
type CoatName = 'castano' | 'pinto' | 'tordo' | 'palomino';     // sin cambios
const COATS: Readonly<Record<CoatName, Coat>>;                  // sin cambios

interface Horse {                                              // = HorseDef en types.ts
  number: HorseNumber;
  name: string;
  color: ColorToken;
  numberColor: 'white' | 'black';
  coat: CoatName;
}

/** Antes `HORSES`: valores por defecto de 001 (FR-017). */
const DEFAULT_HORSES: readonly Horse[];

/** Los 16 tokens menos 'brown', 'dark-green' y 'dark-blue' (research R8). */
const BLANKET_COLORS: readonly ColorToken[];                    // 13 tokens

/** 'white' para black, dark-purple, dark-grey, red, lavender; 'black' para el resto. */
function numberColorFor(color: ColorToken): 'white' | 'black';

/** Recorta extremos y colapsa espacios internos repetidos. */
function normalizeHorseName(raw: string): string;

function isCoatName(value: unknown): value is CoatName;

interface HorseEdit { number: HorseNumber; name: string; color: ColorToken; coat: CoatName }

/**
 * Valida un caballo editado contra los otros 5 de `current`.
 * Devuelve el `Horse` listo para guardar (nombre normalizado, numberColor calculado)
 * o el mensaje de error de contracts/socket-events.md.
 */
function validateHorseEdit(
  current: readonly Horse[],
  edit: unknown,
): { ok: true; horse: Horse } | { ok: false; error: string };
```

Casos de test obligatorios:

- `DEFAULT_HORSES` conserva números, nombres, colores, `numberColor` y pelajes de 001.
- `numberColorFor` de cada color por defecto = `numberColor` por defecto (1 rojo ⇒ `white`).
- `BLANKET_COLORS` tiene 13 tokens, todos de `PALETTE`, sin `brown`, `dark-green`, `dark-blue`.
- Nombre: `"Relámpago"` ✓, `"Ñandú 2"` ✓, `"  Luz   Mala "` ⇒ `"Luz Mala"`, `""`/`"   "` ✗,
  15 caracteres ✗, `"Rojo!"` ✗, `"rojo"` cuando el caballo 1 se llama `"Rojo"` ✗, el mismo
  caballo conservando su nombre ✓.
- Color: fuera de `BLANKET_COLORS` ✗ (`"brown"`), usado por otro caballo ✗ (US2-2), el propio ✓.
- Pelaje desconocido ✗; número fuera de 1–6 ✗.

## server/domain/ranking.ts

Sin cambios. `rank()` recibe solo participantes activos (filtro previo en `Game`), así que el
orden y los desempates de 001 se mantienen (FR-006).

## Motor de carrera

`server/domain/race.ts` no cambia y no recibe definiciones de caballos: con la misma semilla el
resultado es idéntico con o sin personalización (FR-014, SC-004). Se verifica con un test de
integración (misma `seedFn`, caballos por defecto vs. personalizados ⇒ mismo `final_order`).
