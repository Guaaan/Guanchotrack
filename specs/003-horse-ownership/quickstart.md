# Quickstart: validar la propiedad de caballos

**Feature**: [spec.md](./spec.md) | **Contracts**: [contracts/](./contracts/) |
**Data model**: [data-model.md](./data-model.md)

## Requisitos

Los de [001](../001-group-horse-racing/quickstart.md). Validar con base temporal y otro puerto
(nunca `data/guanchotrack.db`):

```bash
DB_PATH="$(mktemp -d)/owners.db" PORT=3100 npm run dev
```

Migración con datos reales (reconstruye `coin_transactions` y `admin_log`, R3/R8): copiar antes
la base:
`cp data/guanchotrack.db /tmp/gt-copy.db && DB_PATH=/tmp/gt-copy.db PORT=3100 npm run dev`
⇒ arranca sin errores, saldos y pozo acumulado iguales a antes, los 6 caballos sin dueño con
dorsal = carril, y sin aviso de invariante en consola.

## Tests automáticos

```bash
npm test
```

Además de las suites de 001 y 002:

| Suite | Prueba |
|-------|--------|
| `unit/payouts` | casos de [contracts/domain.md](./contracts/domain.md): parte del dueño, sin dueño, sin acertantes, pozo < 10, redondeo, multiplicador neto |
| `unit/horses` | `purchasePrice`, `validateHorseIdentity` (16 caracteres, dorsal 1–99, unicidad) |
| `integration/horse-buy` | compra al establo (pozo +30), a jugador (+50 al vendedor), propia, sin saldo, en carrera, concurrente/dueño cambiado |
| `integration/horse-owner-payout` | dueño + acertante, sin acertantes (resto al acumulado), dueño que apuesta a sí mismo, multiplicadores en vivo antes/después de una compra |
| `integration/horse-edit` | dueño edita nombre/dorsal; no dueño rechazado; host edita todo; restablecer conserva dueños; en carrera rechazado |
| `integration/horse-conservation` | `checkInvariant()` tras cada compra, liquidación y eliminación de un dueño |
| `integration/horse-migration` | base con datos de 001/002 ⇒ migra, conserva filas e `id` del libro, invariante intacto, idempotente |
| `integration/admin-remove` (ampliada) | eliminar dueño ⇒ caballos al establo; en carrera rechazado si tiene caballos |
| gates `palette`/`assets` | sin literales de color ni assets nuevos en `src/stable.ts` |

## Validación manual (capturas)

Con el servidor de prueba en :3100, host y tres jugadores (`ana` 100, `beto` 60, `carla` 70 por
ajuste de saldo):

1. **Compra al establo**: ana abre "Caballos" (6 sin dueño, precio 30), compra el 2 ⇒ saldo 70,
   pozo acumulado del host +30, el 2 figura "tú" en ana y "ana" en beto.
2. **Compra a jugador**: beto compra el 2 por 50 ⇒ beto 10, ana 120; historial del host muestra
   ambas compras (establo → ana, ana → beto).
3. **Edición**: beto renombra el 2 a "Trueno", dorsal 77 ⇒ manta 77 en la pista y "Trueno 77 · de
   beto" en los paneles y en los celulares. Intentar dorsal 5 ⇒ rechazo.
4. **Multiplicador neto**: abrir ronda; carla apuesta 70 al 4, ana 35 al 2 (con pozo 30
   acumulado el pozo es 135) ⇒ multiplicador del 2 = (135 − 13) ÷ 35 ≈ 3,49.
5. **Carrera** (semilla de prueba o repetir hasta que gane el 2): resultado muestra "Dueño beto
   recibe 13"; ana recibe 122; "te ha generado 13" en el 2 de beto.
6. **Carrera en curso**: botón "Comprar" y "Editar" deshabilitados; un `horse:buy` forzado
   devuelve error.
7. **Eliminar a beto** (fuera de carrera) ⇒ el 2 vuelve al establo como "Trueno 77", precio 30.
8. Celular a 320 y 360 px: la sección "Caballos" sin scroll horizontal.
