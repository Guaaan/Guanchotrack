# Research: Panel de administración del host

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-26

Parte del stack y de las decisiones de [001](../001-group-horse-racing/research.md). No se
agregan dependencias. No quedan NEEDS CLARIFICATION.

## R1. Estado "activo" y "eliminado" en `users`

- **Decision**: dos columnas nuevas en `users`: `active INTEGER NOT NULL DEFAULT 1` y
  `deleted_at INTEGER` (NULL = cuenta viva). `openDb` las agrega con `ALTER TABLE` solo si
  `PRAGMA table_info(users)` no las tiene (mismo patrón que `results.speed` en 001). Los jugadores
  existentes quedan activos (FR-005: los nuevos también, por el `DEFAULT 1`).
- **Rationale**: una bandera por jugador es lo mínimo para filtrar el leaderboard; `deleted_at`
  conserva la fila (FKs de `bets`, `sessions`, `coin_transactions`) y deja constancia de la fecha.
- **Alternatives considered**: tabla aparte de participantes activos (join extra sin beneficio);
  borrar la fila al eliminar (rompe FKs y el historial que FR-010 pide conservar).

## R2. Eliminación: liberar el nombre y anonimizar

- **Decision**: al eliminar, en una transacción: `username = '#deleted-' || id`, `deleted_at =
  now`, `active = 0`; se borran sus filas de `sessions`. Las proyecciones muestran
  `"(eliminado)"` para cualquier `deleted_at IS NOT NULL` (p. ej. ganadores de la ronda ya
  terminada). `login` nunca encuentra la cuenta: `#` no pasa `USERNAME_RE`; además
  `userFromToken` y la búsqueda de login filtran `deleted_at IS NULL` como defensa.
- **Rationale**: el índice `UNIQUE COLLATE NOCASE` de `username` impediría reutilizar el nombre;
  renombrar a un valor imposible lo libera sin reconstruir la tabla. Registrar después ese nombre
  crea una cuenta nueva con 0 monedas y 0 puntos (spec Edge Cases) porque no hay filas que lo
  vinculen.
- **Alternatives considered**: índice único parcial `WHERE deleted_at IS NULL` (requiere
  reconstruir `users` en SQLite); guardar el nombre original para auditoría (ya queda en
  `admin_log.before`).

## R3. Traspaso del saldo al pozo sin romper la conservación

- **Decision**: si el saldo X > 0, dos movimientos en la misma transacción que el borrado lógico:
  `{ user_id: jugador, kind: 'carry_in', amount: -X, note: 'remove' }` y
  `{ user_id: NULL, kind: 'carry_in', amount: +X, note: 'remove <id>' }`, ambos con
  `actor_id = host`. Con saldo 0 no se escribe nada. Con apuesta activa en la ronda actual
  (`bets.status = 'active'`) se rechaza con "No se puede eliminar: tiene una apuesta activa".
- **Rationale**: las patas suman 0, así que `checkInvariant()` (Σ movimientos + Σ activas =
  Σ `host_adjust`) sigue valiendo; `balanceOf` del eliminado queda en 0 y `carryBalance` sube X.
  `carry_in` ya es el tipo "entra al pozo acumulado"; el CHECK del libro no admite tipos nuevos sin
  reconstruir la tabla. Con apuestas activas no hay caso: devolverlas o dejarlas huérfanas
  complicaría la liquidación.
- **Alternatives considered**: tipo nuevo `player_removed` (reconstrucción del libro, riesgo sobre
  datos reales); `host_adjust` (rompe el invariante); repartir el saldo entre jugadores (no pedido).
- **Efecto en vivo**: en `betting` el acumulado cambia ⇒ `broadcast()` recalcula multiplicadores
  y pagos potenciales (principio XI). En `racing` el acumulado entra en la liquidación de esa
  carrera, porque `finishRace` lee `carryBalance` al terminar. En `finished` el pozo mostrado sigue
  siendo `carry_used`; las monedas esperan a la siguiente ronda.

## R4. Cierre de sesiones (eliminar y restablecer contraseña)

- **Decision**: `admin.ts` devuelve los `userId` cuyas sesiones se cerraron; `socket.ts` emite
  `session:ended { reason }` a la sala `player:<id>` y luego `io.in(room).disconnectSockets(true)`.
  El cliente (`net.ts`) ante `session:ended` va a `/` sin mostrar "Reconectando...". Las filas de
  `sessions` se borran en la misma transacción que la acción, así que la cookie deja de servir
  aunque el evento no llegue.
- **Rationale**: un `disconnect` iniciado por el servidor no reconecta solo en Socket.IO, y sin
  aviso el celular se quedaría en "Reconectando..."; el aviso explícito deja la UX clara.
- **Alternatives considered**: solo borrar sesiones (el socket abierto seguiría recibiendo
  estado); recargar la página por `state` (mezcla estado de juego con control de sesión).

## R5. Renombrar y restablecer contraseña

- **Decision**: renombrar valida con el mismo `USERNAME_RE` del registro (se exporta desde
  `auth.ts`) y unicidad sin distinguir mayúsculas excluyendo al propio jugador (cambiar solo
  mayúsculas está permitido). Las sesiones siguen válidas (se resuelven por `user_id`). El celular
  toma el nombre de `PlayerState.username` y actualiza la cabecera. Restablecer usa
  `bcrypt.hashSync(password, 10)` (como `upsertHost`), contraseña no vacía (mismas reglas que el
  registro), y borra todas las sesiones del jugador. El límite de intentos en memoria de `auth.ts`
  se limpia para ese nombre.
- **Rationale**: reutiliza reglas existentes; `hashSync` (~70 ms) es aceptable en una acción
  manual y mantiene el `run()` síncrono de `socket.ts`.
- **Alternatives considered**: `bcrypt.hash` async (obliga a un camino async en `socket.ts` solo
  para esto).

## R6. Leaderboard solo con activos y envío a jugadores

- **Decision**: `Game` lee una vez a todos los jugadores vivos (`role='player' AND deleted_at IS
  NULL`) con puntaje, saldo, `active` y si tienen apuesta activa; de ahí salen `participants`
  (lista Admin, todos) y `ranking = rank(activos)` (sin tocar `rank()`). `broadcastPlayers` pasa
  a recorrer los jugadores conectados (`presence`) y no el ranking, porque un inactivo sigue
  jugando y necesita sus snapshots. `myRank` es `null` si el jugador está inactivo (FR-007).
  `betStatus.missing` excluye eliminados.
- **Rationale**: el orden y desempates de 001 quedan intactos (FR-006) porque el filtro va antes
  de `rank()`; recorrer `presence` arregla el único acoplamiento entre ranking y envío.
- **Alternatives considered**: parámetro de filtro dentro de `rank()` (mezcla dominio puro con
  reglas de administración).

## R7. Caballos personalizables: almacenamiento y distribución

- **Decision**: tabla `horses (number PK 1–6, name, color, coat)` sembrada con
  `INSERT OR IGNORE` desde `DEFAULT_HORSES` al abrir la base; `numberColor` no se guarda, se
  calcula con `numberColorFor(color)`. Las definiciones viajan en cada snapshot como
  `horseDefs: Horse[]` (host y jugadores) — 6 objetos pequeños, también en reconexión. Edición de
  un caballo por evento (`admin:updateHorse`), validada contra los otros 5 con la función pura
  `validateHorseEdit()`; restablecer (`admin:resetHorses`) reescribe los 6 con `DEFAULT_HORSES`.
  Ambas solo en fase `idle` o `finished` (FR-015).
- **Rationale**: persistencia tras reinicio (FR-016) con la base existente; el snapshot ya es el
  mecanismo de sincronización y reconexión (principio IV), así que no hace falta otro evento. Con
  13 colores permitidos y 6 caballos siempre hay ≥ 7 libres, por lo que intercambiar colores entre
  dos caballos se hace en dos pasos sin bloquearse.
- **Alternatives considered**: guardar en un JSON en disco (segunda fuente de persistencia);
  evento `horses` aparte (otro camino de sincronización y de reconexión); editar los 6 a la vez
  (UI más pesada para un cambio típico de un caballo).

## R8. Colores de manta permitidos y color del número

- **Decision**: `BLANKET_COLORS` = los 16 tokens menos `brown` (tierra de la pista),
  `dark-green` (pasto) y `dark-blue` (fondo de la escena): 13 colores. El color del número sale de
  una tabla fija por token: `white` sobre `black`, `dark-purple`, `dark-grey`, `red` y `lavender`;
  `black` sobre el resto. La tabla reproduce los valores por defecto de 001 (1 rojo ⇒ blanco,
  resto ⇒ negro).
- **Rationale**: son los tokens que `src/host/track.ts` y `scene.ts` usan para pista, pasto y
  fondo (spec Assumptions). Una tabla explícita es determinista, verificable con tests y evita que
  un cálculo de contraste WCAG cambie el número del caballo rojo (WCAG daría negro sobre
  `#FF004D`), que ya conocen los jugadores; el dígito tiene contorno del color opuesto, así que
  ambos se leen.
- **Alternatives considered**: contraste WCAG calculado (cambia el caballo 1 por defecto);
  dejar elegir el color del número al host (FR-013 lo pide automático).

## R9. Nombre del caballo

- **Decision**: `normalizeHorseName(raw)` recorta espacios en los extremos y colapsa espacios
  internos repetidos; válido si cumple `/^[\p{L}\p{N} -]{1,14}$/u` tras normalizar (letras con
  tildes y ñ, números, espacios y guiones; spec Assumptions) y no coincide con el de otro caballo
  comparando con `toLocaleLowerCase('es')`, de modo que "relámpago" choca con "Relámpago" pero
  "Relampago" sigue siendo distinto.
- **Rationale**: FR-012 pide unicidad "sin distinguir mayúsculas", no sin tildes.
- **Alternatives considered**: `sensitivity: 'base'` (también ignora tildes, más estricto de lo
  pedido).

## R10. Pestañas del host sin interrumpir la carrera

- **Decision**: `src/host/main.ts` crea una barra con dos botones y dos contenedores; cambiar de
  pestaña solo alterna `hidden`. El socket, `scene.setRace()` y los `render*` siguen recibiendo
  cada snapshot aunque la pestaña esté oculta. `scene.ts` ya ignora tamaños 0 en `resize()` y el
  `ResizeObserver` restaura el tamaño al volver. "Juego" es la pestaña inicial en cada carga
  (escenario US3-1). La lista de participantes y el editor de caballos se renderizan desde el
  mismo snapshot (`participants`, `horseDefs`), así que se actualizan en vivo (US3-3).
- **Rationale**: un solo socket y una sola escena: no hay nada que reiniciar ni resincronizar
  (SC-005).
- **Alternatives considered**: página `/host/admin` aparte (segundo socket y estado duplicado);
  destruir/crear la escena al cambiar de pestaña (perdería la animación en curso).

## R11. Caballos vigentes en el cliente

- **Decision**: `src/horses.ts` guarda las definiciones del último snapshot (`setHorseDefs`,
  `horseDef(n)`, `onHorseDefsChange`). `panel.ts` y `play.ts` leen de ahí en lugar de importar
  `HORSES`; `play.ts` actualiza en el sitio nombres y muestras de los botones de apuesta.
  `scene.setHorses(defs)` compara con lo dibujado y, si cambió, reconstruye las mallas afectadas;
  como el servidor solo acepta cambios en `idle`/`finished`, nunca ocurre a mitad de carrera.
  `createHorse` recibe `numberColor` en vez de buscarlo en `HORSES`.
- **Rationale**: un único punto de verdad en el cliente, alimentado por el servidor (principio III).
- **Alternatives considered**: pasar `horseDefs` por parámetro a cada `render*` (más cambios de
  firma sin ventaja).

## R12. Registro de administración

- **Decision**: tabla solo-inserción `admin_log (id, actor_id, action, target, before, after,
  created_at)`, con `before`/`after` como JSON (o NULL). Acciones: `set_active`, `rename`,
  `reset_password` (sin hash en el log), `remove_player`, `update_horse`, `reset_horses`. Se
  escribe dentro de la misma transacción que la acción. No hay vista en la UI (FR-003 solo pide
  registro).
- **Rationale**: auditoría mínima exigida por FR-003 y principio XIII; los movimientos de monedas
  siguen en `coin_transactions`.
- **Alternatives considered**: reutilizar `coin_transactions.note` (no cubre acciones sin
  monedas); log en consola (no persiste).
