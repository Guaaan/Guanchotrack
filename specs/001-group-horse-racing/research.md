# Research: GuanchoTrack — Carreras de caballos 3D en grupo

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-24

Todas las decisiones parten del stack indicado por el usuario y se ajustan solo donde la
constitución v2.0.0 lo exige. No quedan NEEDS CLARIFICATION.

## R1. Un solo proceso y un solo puerto (dev y prod)

- **Decision**: Express crea el servidor HTTP; en desarrollo monta Vite en *middleware mode*
  dentro del mismo proceso (`npm run dev` = `tsx watch server/index.ts`). En producción Express
  sirve `dist/` estático. Socket.IO se adjunta al mismo servidor HTTP. Escucha en `0.0.0.0:3000`
  e imprime las URLs de red local (`os.networkInterfaces()`).
- **Rationale**: un solo origen evita CORS y problemas de cookies entre puertos; un solo proceso
  cumple el principio I y el requisito "un solo comando".
- **Alternatives considered**: Vite dev server + Express por separado con proxy y
  `concurrently` (dos procesos, una dependencia más, cookies vía proxy); descartado.

## R2. Persistencia y saldo derivado

- **Decision**: SQLite con `better-sqlite3` (síncrono), fichero `data/guanchotrack.db`, modo
  WAL. Esquema creado al arrancar con `CREATE TABLE IF NOT EXISTS` (sin herramienta de
  migraciones). El saldo de cada jugador y el pozo acumulado se **derivan** de
  `coin_transactions` con `SUM(amount)`; no existe columna de saldo. El puntaje se deriva de
  las apuestas ganadoras; no existe columna de puntaje.
- **Rationale**: una sola fuente de verdad para monedas (principio XII) sin riesgo de
  desincronizar cache y libro. Con decenas de jugadores y cientos de filas, `SUM` con índice es
  instantáneo. API síncrona = cada operación compuesta va en `db.transaction()` atómica.
- **Alternatives considered**: columna `balance` cacheada + validación periódica (dos fuentes
  de verdad, YAGNI); ORM/migraciones (dependencias innecesarias para 6 tablas).

## R3. Contraseñas y cuenta host

- **Decision**: `bcryptjs` (implementación JS pura del algoritmo bcrypt, cost 10). Al arrancar
  se hace upsert de la cuenta host desde `HOST_USER` / `HOST_PASSWORD` (por defecto `hosttt` /
  `1231`): se crea o se actualiza su hash y rol `host`; cualquier otra cuenta con rol `host`
  pasa a `player`. Con valores por defecto se imprime una advertencia en consola.
- **Rationale**: mismo algoritmo pedido sin una segunda compilación nativa (ya hay
  `better-sqlite3`). El upsert garantiza un único host y que cambiar las variables surta efecto.
- **Alternatives considered**: paquete `bcrypt` nativo (otra dependencia nativa); `scrypt` de
  `node:crypto` (sin dependencia, pero el usuario pidió bcrypt).

## R4. Sesión y autorización

- **Decision**: `POST /api/login` crea una fila en `sessions` con token aleatorio de 32 bytes
  (`crypto.randomBytes`) y lo envía en cookie `gt_session` `HttpOnly; SameSite=Lax; Path=/`, sin
  expiración (dura hasta logout). El handshake de Socket.IO lee la misma cookie del header,
  resuelve el usuario y lo adjunta a `socket.data`. Cada evento de host comprueba
  `socket.data.role === 'host'` en el servidor. Parseo de cookie manual (una función de 5
  líneas); sin `cookie-parser` ni `express-session`.
- **Throttling**: contador en memoria por usuario (5 fallos ⇒ bloqueo de 60 s); sin
  dependencia. Se pierde al reiniciar el servidor, aceptable para una partida en LAN (FR-007a).
- **Rationale**: mínimo código, sin dependencias extra, cumple FR-005 y FR-038.
- **Alternatives considered**: JWT (innecesario con una sola instancia y BD local);
  `express-session` (dependencia para algo trivial).

## R5. Transporte: REST solo para auth, Socket.IO para el juego

- **Decision**: REST para `login`, `logout`, `me` (necesitan fijar cookies). Todo lo demás
  (apostar, acciones de host) son eventos Socket.IO con *ack* `{ ok, error? }`. El servidor emite
  un único evento `state` con un snapshot completo **proyectado por rol**: el host recibe todo;
  cada jugador recibe solo su saldo, su apuesta y los multiplicadores públicos.
- **Rationale**: un solo canal de juego; el snapshot completo simplifica reconexión (se emite
  al conectar). Proyectar por rol cumple FR-029 (el jugador no recibe datos de otros jugadores,
  ni siquiera ocultos en la red).
- **Alternatives considered**: difundir el mismo estado completo a todos (filtraría apuestas
  ajenas a los celulares); eventos incrementales (más código cliente, reconexión más compleja).

## R6. Motor de carrera determinista

- **Decision**: PRNG `mulberry32(seed)` (10 líneas, sin dependencia). Semilla de 32 bits
  generada en el servidor con `crypto.randomInt(2**32)` y guardada en `results.seed`.
  `createRace(seed)` devuelve un estado inicial y `stepRace(state)` avanza un tick: por cada
  caballo 1→6, en orden fijo, `rng() < 0.1` ⇒ avanza 1 casilla. Si uno o más llegan a 40, la
  carrera termina; si son varios, cada empatado recibe `rng()` en orden de número (photo finish)
  y gana el mayor. El orden final: llegados por valor de photo finish, luego el resto por
  casilla desc y número asc.
- **Rationale**: puro y reproducible (principios II y VIII); el orden fijo de consumo del RNG
  hace que la misma semilla dé siempre la misma carrera.
- **Ejecución en servidor**: un `setInterval` de 200 ms llama `stepRace` y emite `state`. El
  resultado no se precalcula ni se envía por adelantado, así que ningún cliente puede conocerlo
  antes de tiempo.
- **Duración esperada**: simulación de 20 000 carreras (40 casillas, p = 0,1, tick 200 ms):
  media 65,5 s, 90 % entre 54 y 76 s, dentro de SC-007 (45–90 s).
- **Alternatives considered**: `seedrandom` (dependencia para 10 líneas); precalcular toda la
  carrera al iniciarla (riesgo de filtrar el resultado y complica reinicios).

- **Actualización US4b**: el intervalo del tick depende de la velocidad que el host elige al
  iniciar (Normal 200 ms, Rápida 100 ms, Turbo 50 ms); el motor y el consumo del RNG no cambian,
  así que con la misma semilla el resultado es idéntico en cualquier velocidad. Ver plan
  "Ajustes US4b" D1.

## R7. Pagos parimutuel con redondeo

- **Decision**: función pura `settle(bets, carry, winner)` →
  `{ payouts: {userId, amount}[], carryOut }`. `pot = Σbets + carry`; si nadie apostó al
  ganador, `payouts = []` y `carryOut = pot`. Si no, por cada apuesta ganadora:
  `exact = amount × pot / horseTotal` calculado en enteros (`amount*pot` y división entera, con
  resto para comparar fracciones sin flotantes); `floor` y el sobrante se reparte de a 1 por
  mayor resto, desempate por `confirmedAt` asc y luego `userId` asc. `multipliers(bets, carry)`
  devuelve `pot / horseTotal` por caballo o `null` si no tiene apuestas.
- **Pago potencial**: para mostrar "recibirías si gana X" se llama `settle(bets, carry, X)` —
  la misma función que liquida (principio XI).
- **Display**: multiplicador truncado a 2 decimales con coma (`2,35×`); montos enteros.
- **Rationale**: aritmética entera exacta = conservación exacta (principio XII) y tests sin
  tolerancias.
- **Alternatives considered**: flotantes con `Math.round` (riesgo de ±1 moneda).

## R8. Ranking

- **Decision**: función pura `rank(players)` ordena por puntaje desc, saldo desc, nombre asc
  (`localeCompare` con `'es'`, sensibilidad base). Marca `isFirst` / `isLast` (si hay ≥ 2).
- **Rationale**: cumple FR-034 y es testeable aislado.

## R9. Paleta única (principio VII)

- **Decision**: `src/palette.ts` es el **único** fichero con literales de color: exporta los 16
  colores PICO-8 con nombre y una función `applyCssTokens()` que, al cargar cada página, define
  `--c-<nombre>` en `:root`. El CSS solo usa `var(--c-…)`; Three.js importa los mismos valores.
  Los caballos (`shared/horses.ts`) referencian el **nombre** del token, no el hex.
- **Rationale**: el usuario pidió variables CSS + módulo TS; generarlas desde el módulo evita
  dos definiciones y cumple "definidos una sola vez".
- **Verificación**: un test Vitest recorre `src/`, `shared/` y `*.html` y falla si encuentra
  `#rgb`, `#rrggbb`, `rgb(`, `hsl(` o nombres de color CSS fuera de `src/palette.ts`, y
  comprueba que la paleta tiene exactamente los 16 valores de la constitución.

## R10. Iluminación sin salirse de la paleta

- **Decision**: la escena usa `MeshLambertMaterial` (estilo low-poly con sombreado, como pidió
  el usuario) y una **pasada final de cuantización a la paleta**: un `ShaderPass` (de
  `three/examples/jsm/postprocessing`, incluido en el paquete `three`) que reemplaza cada pixel
  por el color PICO-8 más cercano. Render sin antialias. Luz ambiental alta y una direccional
  suave para que los colores base caigan sobre sí mismos y solo las caras en sombra salten al
  tono de paleta vecino.
- **Rationale**: Lambert/Toon multiplican el color por la luz y generan tonos fuera de paleta
  (prohibido por el principio VII). La cuantización lo garantiza por construcción, también para
  bordes, texturas canvas y transparencias, y refuerza la estética retro.
- **Alternatives considered**: `MeshBasicMaterial` sin luz con caras sombreadas pintadas a
  mano (más trabajo de modelado, look plano); `MeshToonMaterial` sin cuantizar (sigue generando
  tonos intermedios).

## R11. Tipografía sin assets (principio VI)

- **Decision**: pila de fuentes del sistema monoespaciadas
  (`ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`), en mayúsculas y
  con `letter-spacing` para el aire retro. Los números de los caballos en `CanvasTexture` usan la
  misma pila en negrita.
- **Rationale**: una fuente pixel requiere un fichero de fuente externo, prohibido por el
  principio VI.
- **Alternatives considered**: fuente pixel embebida (es un asset); fuente bitmap dibujada a
  mano en canvas (YAGNI).

- **Actualización US4b**: los números de las mantas usan la pila sans-serif del sistema
  (`system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) en peso normal,
  con contorno fino de contraste; la UI sigue con la pila monoespaciada. Ver plan D3.

## R12. Modelo 3D procedural

- **Decision**: `createHorse({ colorToken, number })` según lo pedido: cuerpo `CapsuleGeometry`,
  cuello/cabeza `BoxGeometry`, 4 patas `CylinderGeometry` dentro de `Group` pivote en la cadera,
  cola `ConeGeometry`, jinete (torso caja, cabeza esfera low-poly, casco media esfera). Pelaje
  `brown` (#AB5236) común; manta y camiseta con el color del caballo. Geometrías creadas una vez
  a nivel de módulo y compartidas; materiales por caballo. Número en `CanvasTexture` (fondo del
  color del caballo; texto `white`/`black` según contraste precalculado por caballo).
- **Galope**: si `|target - x| > ε`, fase `+= dt·k`; patas `rotation.z = sin(fase + offset)·A`
  con offsets por par (delanteras/traseras en contrafase); cuerpo `y = base + |sin(fase)|·h`.
  Quieto ⇒ patas vuelven a 0.
- **Pista**: 6 carriles × 40 casillas, tierra `brown`, líneas `white`, pasto `dark-green`,
  fondo `dark-blue`, meta a cuadros `CanvasTexture` `black`/`white`.
- **Cámara**: lateral, `x` interpolado hacia el caballo líder visible.
- **Interpolación**: el cliente guarda la casilla objetivo por caballo del último `state` y
  hace `lerp` exponencial de la posición mostrada hacia ella cada frame.
- **Photo finish**: si el `state` final trae `photoFinish`, la cámara se acerca a la línea de
  meta, se congela la imagen ~1,5 s con un destello `white` y un rótulo "PHOTO FINISH" antes de
  mostrar el resultado.

- **Actualización US4/US4b**: la fábrica es `createHorse({ color, number, coat })` con pelajes
  fijos por número (castaño, pinto con manchas deterministas, tordo, palomino) y crin separada;
  las piezas de pelaje llevan contorno negro para separarse de la tierra `brown`; el galope es
  continuo durante la carrera con cadencia según la racha de los últimos 10 ticks, cabeceo del
  cuello y posición con resorte críticamente amortiguado (`src/host/motion.ts`). Escala 1,5×,
  carriles de 4,2 unidades y render interno a 0,75. Ver plan D2–D4.

## R13. Vista de jugador sin framework

- **Decision**: `play.ts` construye el DOM una vez por fase y actualiza solo nodos de texto con
  cada `state` (multiplicadores, saldo, pago potencial). El input de monto no se re-renderiza
  mientras tenga foco.
- **Rationale**: re-renderizar con `innerHTML` en cada actualización en vivo borraría lo que el
  jugador está escribiendo.
- **Actualización US7**: tras probar con celulares reales, la vista de jugador muestra en carrera
  y resultado el ranking propio, el lugar del caballo apostado y los 3 primeros; el orden de la
  carrera se envía solo cuando cambia. Campos ≥ 16 px (sin zoom en iPhone) y textos contenidos
  desde 320 px. Ver plan "Ajustes US7" D5–D7.

## R14. Reconexión

- **Decision**: reconexión automática de Socket.IO (por defecto). En `disconnect` se muestra un
  overlay "Reconectando..."; en `connect` el servidor emite el snapshot y se oculta. Si el
  handshake falla por sesión inválida, el servidor responde `connect_error` con
  `unauthorized` y el cliente redirige al login.

## R15. Recuperación tras reinicio del servidor (FR-041)

- **Decision**: al arrancar, si la ronda actual está en fase `racing`, se marca su `results`
  en curso como `annulled` y la ronda vuelve a `betting` con las apuestas intactas
  (equivalente a "reiniciar carrera").

## R16. Tests y puertas de calidad

- **Decision**: Vitest. Unitarios para `server/domain/*` (sin I/O). Integración con SQLite
  `:memory:` y un servidor real en puerto efímero + `socket.io-client` para login con
  autocreación, permisos de host, conservación de monedas en apuestas/cambios/reinicios/
  liquidación y recuperación tras reinicio. Tests de "puerta" para paleta (R9) y assets
  externos (falla si hay imports de `.png/.jpg/.gif/.svg/.glb/.gltf/.woff*/.ttf` o URLs
  `http(s)://` en `src/` o HTML).
- **Rationale**: cubre las puertas del flujo de desarrollo de la constitución sin linters ni
  herramientas adicionales.

## R17. Versión de Node

- **Decision**: `engines.node >= 20`. La máquina de desarrollo tiene Node 24, compatible.
- **Rationale**: el usuario pidió Node 20; no se usa nada exclusivo de versiones posteriores.
