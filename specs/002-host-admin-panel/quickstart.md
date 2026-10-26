# Quickstart: validar el panel de administración

**Feature**: [spec.md](./spec.md) | **Contracts**: [contracts/](./contracts/) |
**Data model**: [data-model.md](./data-model.md)

## Requisitos

Los de [001](../001-group-horse-racing/quickstart.md). Para validar sin tocar la partida real,
usar una base temporal y otro puerto (nunca `data/guanchotrack.db`):

```bash
DB_PATH="$(mktemp -d)/admin.db" PORT=3100 npm run dev
```

Para comprobar la migración con datos reales, copiar antes la base:
`cp data/guanchotrack.db /tmp/gt-copy.db && DB_PATH=/tmp/gt-copy.db PORT=3100 npm run dev`
⇒ arranca sin errores, los jugadores existentes aparecen activos, los caballos con sus valores
por defecto y sin aviso de invariante en consola.

## Tests automáticos

```bash
npm test
```

Además de las suites de 001, deben pasar:

| Suite | Prueba |
|-------|--------|
| `unit/horses` | casos de [contracts/domain.md](./contracts/domain.md): por defecto, `BLANKET_COLORS`, `numberColorFor`, validación de nombre/color/pelaje |
| `integration/admin-participants` | US1-1…5, US1-8: activos en leaderboard y `myRank`; reactivar conserva datos; nuevo registro activo; renombrar (login viejo falla, nuevo entra, choque de mayúsculas rechazado); restablecer contraseña cierra sesiones (`session:ended`); inactivo apuesta y cobra |
| `integration/admin-remove` | US1-6/7: rechazo con apuesta activa; eliminar con 80 y pozo 20 ⇒ pozo 100, `checkInvariant()` true, login imposible, `session:ended`, nombre libre (registro nuevo con 0); eliminar en `betting` recalcula multiplicadores; saldo 0 ⇒ sin movimientos; historial muestra `(eliminado)` |
| `integration/admin-horses` | US2-1…7: cambio visible en `horseDefs` de host y jugador; color repetido o no permitido rechazado; rechazo en `betting`/`racing`; misma semilla ⇒ mismo `final_order` con personalización; restablecer; persistencia tras reabrir la base |
| `integration/admin-permissions` | cada `admin:*` desde un jugador ⇒ `"No autorizado"` sin efectos; el host no figura en `participants`; `admin_log` tiene una fila por acción con autor y fecha |
| `gates/palette`, `gates/assets` | siguen en verde con `src/host/admin.ts` y `src/horses.ts` |

## Validación manual (capturas en Chrome)

Con el servidor de prueba en `:3100`, host en una ventana de escritorio y 2–3 jugadores (pueden
ser ventanas de 390 px):

1. **Pestañas (US3)**: `/host` abre en "Juego". Abrir ronda, apostar, iniciar carrera; pasar a
   "Admin" a mitad de carrera y volver ⇒ la carrera sigue en su posición real, sin reinicio, y el
   resultado aparece normal.
2. **Participantes (US1)**: en "Admin", la lista muestra nombre, puntaje, monedas, conexión y
   activo, y cambia en vivo cuando un jugador apuesta o se conecta. Desmarcar a uno ⇒ desaparece
   del leaderboard de "Juego"; desmarcar a todos ⇒ "No hay participantes activos". En el celular
   del inactivo no aparece la línea de ranking, pero puede apostar.
3. **Renombrar / contraseña**: renombrar a un jugador conectado ⇒ su cabecera muestra el nombre
   nuevo sin salir. Restablecer la contraseña ⇒ su celular vuelve a la pantalla de ingreso y entra
   con la nueva.
4. **Eliminar**: con apuesta activa, el botón está deshabilitado (y el servidor rechaza). Sin
   apuesta: "Eliminar" ⇒ confirmación en dos pasos ⇒ desaparece, el pozo acumulado sube en su
   saldo y su celular vuelve al ingreso.
5. **Caballos (US2)**: en `idle`/`finished`, caballo 3 ⇒ "Relámpago", lavanda, pinto; intentar
   azul ⇒ error (lo usa el 5). La pista 3D, el panel de apuestas y el celular muestran
   el cambio en < 1 s; el número se ve blanco/negro según la manta. El selector de color solo
   ofrece los 13 permitidos y marca los ocupados. Con apuestas abiertas, el editor está
   deshabilitado. "Restablecer caballos" (con confirmación) vuelve a los valores de 001. Reiniciar
   el servidor ⇒ la personalización se conserva.
6. **Paleta**: capturas de "Admin" y de la pista con caballos personalizados sin colores fuera de
   PICO-8 en el lienzo 3D (mismo criterio que 001).
