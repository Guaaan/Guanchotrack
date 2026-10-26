# Feature Specification: GuanchoTrack — Carreras de caballos 3D en grupo

**Feature Branch**: `001-group-horse-racing`

**Created**: 2026-10-24

**Status**: Implemented (89/89 tareas; validado con celulares el 2026-10-25)

**Input**: User description: "Construir \"GuanchoTrack\", una app web minimalista de carreras de caballos en 3D para jugar en grupo, con dos roles: un HOST y varios JUGADORES. (Login único con autoregistro, cuenta host predefinida, 6 caballos idénticos, vista de jugador en celular, vista de host en pantalla grande con pista 3D, paneles y controles, carrera por ticks con probabilidad 1/10, apuestas por pozo común sin comisión, puntaje por acierto y persistencia completa.)"

## Clarifications

### Session 2026-10-24

- Q: Si dos o más caballos llegan a la meta en el mismo tick, ¿cómo se resuelve el ganador? → A: Photo finish: cada caballo empatado recibe un valor aleatorio del servidor (con la semilla de la carrera) que representa la fracción de casilla que le faltaba; gana el de mayor valor, y la vista del host lo muestra como "photo finish".
- Q: ¿Puede un jugador retirar su apuesta por completo mientras la fase de apuestas siga abierta, o solo cambiarla? → A: Solo cambiarla (caballo y/o monto, mínimo 1 moneda); no existe cancelar. Solo el reinicio de ronda del host devuelve apuestas.
- Q: En el panel del host, ¿la lista "quiénes faltan por apostar" incluye solo a los jugadores conectados o a todos los registrados? → A: Solo los conectados ahora; quien se desconecta sale de "faltan", pero si ya apostó sigue en "apostaron".
- Q: Cuando un pago da decimales, ¿qué se hace con las monedas que sobran al redondear? → A: Cada pago se redondea hacia abajo y el sobrante se reparte de a 1 moneda a los ganadores con mayor parte decimal perdida; a igualdad, a quien confirmó antes su apuesta vigente.
- Q: ¿Cuánto debería durar una carrera típica, desde la salida hasta que llega el ganador? → A: Larga, unos 60 s: pista de 40 casillas y tick de 200 ms. (Ajustado en US4b: 200 ms es la velocidad Normal; el host puede elegir Rápida o Turbo.)

### Ajustes US4b (2026-10-24)

- Velocidad de carrera: el host la elige antes de iniciar cada carrera (no durante): Normal
  200 ms por tick (por defecto), Rápida 100 ms, Turbo 50 ms. La probabilidad de avance (1/10) y
  el largo de pista (40) no cambian; la velocidad solo cambia la duración, nunca el resultado.
  La velocidad usada queda registrada en el resultado de la carrera.
- Pelajes: 4 tipos fijos por número de caballo (1 castaño, 2 pinto, 3 tordo, 4 palomino,
  5 pinto, 6 castaño), solo con colores de la paleta. Son puramente visuales.
- Caballos más grandes en pantalla (~1,5×) con los 6 carriles visibles, y números de manta
  más finos con contorno de contraste.
- Galope continuo durante toda la carrera, con cadencia según las rachas recientes de cada
  caballo, cabeceo de cuello y cabeza, y crin que acompaña el movimiento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ronda completa: apostar, correr y cobrar (Priority: P1)

El host abre una ronda de apuestas. Cada jugador, desde su celular, ve los 6 caballos con su
multiplicador de pago en vivo, elige uno y apuesta parte de sus monedas. El host inicia la
carrera; los jugadores ven "carrera en curso, mira la pantalla" mientras la pantalla grande
muestra la carrera en 3D. Al llegar el primer caballo a la meta, se reparte el pozo entre
quienes acertaron, se suma un punto a cada acertante y cada jugador ve si ganó o perdió y su
nuevo saldo.

**Why this priority**: es el ciclo de juego completo; sin él no hay producto.

**Independent Test**: con el host y 2–3 jugadores con saldo cargado, jugar una ronda de
principio a fin y comprobar que el ganador, los pagos, los saldos y los puntajes son
correctos y que la suma total de monedas se conserva.

**Acceptance Scenarios**:

1. **Given** una ronda de apuestas abierta y un jugador con 100 monedas, **When** apuesta 30 al
   caballo 3, **Then** su saldo disponible pasa a 70 y ve caballo 3, monto 30 y lo que recibiría
   si gana.
2. **Given** apuestas de A: 30 al caballo 1, B: 10 al caballo 2 y C: 20 al caballo 2,
   **When** se observa el panel, **Then** el pozo es 60, el multiplicador del caballo 1 es 2×,
   el del caballo 2 es 2× y A recibiría 60, B 20 y C 40.
3. **Given** el escenario anterior, **When** el caballo 2 gana, **Then** B recibe 20, C recibe 40,
   A no recibe nada, B y C suman +1 punto y la suma de saldos es igual a la previa a apostar.
4. **Given** no hay pozo acumulado y todos los jugadores apostaron al mismo caballo, **When**
   ese caballo gana, **Then** el multiplicador es 1× y cada uno recupera exactamente lo
   apostado.
5. **Given** una ronda en fase de apuestas, **When** el host inicia la carrera aunque falten
   jugadores por apostar, **Then** la carrera comienza y quienes no apostaron quedan fuera de la
   ronda.
6. **Given** una carrera en curso, **When** un caballo llega a la meta, **Then** la carrera
   termina, la vista del host muestra el caballo ganador, los acertantes y cuánto recibe cada
   uno, y cada jugador ve si ganó o perdió y su nuevo saldo.
7. **Given** una ronda con apuestas por 60 monedas en total y ninguna al caballo ganador,
   **When** termina la carrera, **Then** nadie cobra ni suma puntos y las 60 monedas pasan al
   pozo acumulado de la siguiente ronda.
8. **Given** un pozo acumulado de 60 y una nueva ronda con A: 20 al caballo 1 y B: 20 al
   caballo 2, **When** se observa el panel, **Then** el pozo es 100, ambos multiplicadores son
   5× y A o B recibiría 100 si su caballo gana.

---

### User Story 2 - Ingreso con usuario y contraseña (Priority: P1)

Cualquier persona entra con usuario y contraseña en una única pantalla. Si el usuario no
existe, se crea en ese momento y entra como jugador con 0 monedas. Si existe, la contraseña
debe coincidir. La cuenta "hosttt" con contraseña "1231" entra a la vista de host. Al recargar
la página la sesión se mantiene.

**Why this priority**: prerrequisito para identificar jugadores, saldos y el rol de host.

**Independent Test**: crear un usuario nuevo, cerrar y reabrir la página, entrar con contraseña
incorrecta y correcta, y entrar con la cuenta de host.

**Acceptance Scenarios**:

1. **Given** el usuario "ana" no existe, **When** ingresa "ana" / "x1", **Then** se crea la
   cuenta, entra a la vista de jugador y ve 0 monedas.
2. **Given** el usuario "ana" existe con contraseña "x1", **When** ingresa "ana" / "otra",
   **Then** ve un mensaje de error y no entra.
3. **Given** cualquier estado, **When** se ingresa "hosttt" / "1231", **Then** se accede a la
   vista de host.
4. **Given** un jugador con sesión iniciada, **When** recarga la página, **Then** sigue dentro,
   en la vista que corresponde a la fase actual del juego.

---

### User Story 3 - Seguimiento en vivo de apuestas en la pantalla grande (Priority: P2)

Durante la fase de apuestas, la pantalla del host muestra el pozo y, por cada caballo, el
total apostado, la cantidad de apostadores, el multiplicador y la lista de jugadores con su
apuesta y lo que recibirían si ese caballo gana. También muestra quiénes ya apostaron y quiénes
faltan. Todo se actualiza en vivo con cada apuesta nueva o modificada. Los jugadores ven en su
celular el multiplicador de cada caballo y, tras apostar, lo que recibirían, también en vivo.

**Why this priority**: la transparencia en vivo es central para la dinámica social, pero el
juego funciona sin ella.

**Independent Test**: con la ronda abierta, hacer y modificar apuestas desde varios celulares y
comprobar que la pantalla del host y los celulares reflejan los nuevos valores sin recargar.

**Acceptance Scenarios**:

1. **Given** la fase de apuestas abierta, **When** un jugador apuesta o cambia su apuesta,
   **Then** la pantalla del host y todas las vistas de jugador actualizan pozo, multiplicadores
   y pagos potenciales en menos de 1 segundo.
2. **Given** un jugador ya apostó, **When** cambia a otro caballo o a otro monto, **Then** se
   le devuelve la apuesta anterior, se descuenta la nueva y su saldo nunca queda negativo.
3. **Given** 4 jugadores conectados y 2 apostaron, **When** se mira el panel del host,
   **Then** aparecen 2 como "apostaron" y 2 como "faltan".
4. **Given** la fase de apuestas cerrada sin cambios posteriores, **When** termina la carrera,
   **Then** cada pago recibido coincide exactamente con el último pago potencial mostrado.

---

### User Story 4 - Carrera 3D en pantalla grande con leaderboard en vivo (Priority: P2)

La vista del host muestra una pista recta con los 6 caballos con jinete en 3D, cada uno con
su color, número y pelaje. Antes de iniciar la carrera, el host elige su velocidad (Normal,
Rápida o Turbo). Mientras la carrera está en curso, todos los caballos galopan sin parar, más
rápido cuando vienen en racha y más lento cuando están estancados, y se desplazan de forma
suave hacia su casilla. Un panel muestra el orden de los caballos de primero a último y quiénes
apostaron a cada uno.

**Why this priority**: es el espectáculo compartido del juego; la lógica de la ronda (P1) no
depende de lo visual.

**Independent Test**: iniciar una carrera y comprobar que los 6 caballos se distinguen por
color y número, avanzan de forma fluida y el orden del panel coincide con las posiciones en la
pista.

**Acceptance Scenarios**:

1. **Given** una carrera en curso, **When** un caballo avanza una casilla, **Then** se desplaza
   visualmente de forma gradual hasta su nueva posición, sin saltos bruscos.
2. **Given** una carrera en curso, **When** cambian las posiciones, **Then** el leaderboard de la
   carrera se reordena y muestra junto a cada caballo los jugadores que le apostaron.
3. **Given** dos pantallas de host abiertas a la vez, **When** avanza la carrera, **Then** ambas
   muestran las mismas posiciones.
4. **Given** la fase de apuestas abierta, **When** el host elige "Turbo" e inicia la carrera,
   **Then** la carrera avanza un tick cada 50 ms y el resultado registra la velocidad Turbo.
5. **Given** el host no eligió velocidad, **When** inicia la carrera, **Then** corre en Normal
   (200 ms por tick).
6. **Given** una carrera en curso, **When** el host intenta cambiar la velocidad, **Then** no es
   posible: el selector está deshabilitado y el servidor no acepta cambios hasta la próxima
   carrera.
7. **Given** la misma semilla, **When** la carrera se corre en Normal y en Turbo, **Then** las
   posiciones por tick, el ganador y el orden final son idénticos; solo cambia la duración.
8. **Given** una carrera en curso, **When** un caballo no avanzó en los últimos ticks, **Then**
   sigue galopando a ritmo lento; **When** viene avanzando seguido, **Then** galopa más rápido.
   Al terminar o reiniciar la carrera, todos se detienen.
9. **Given** la pantalla del host, **When** se mira la pista, **Then** cada caballo muestra su
   pelaje fijo (1 castaño, 2 pinto, 3 tordo, 4 palomino, 5 pinto, 6 castaño), los 6 carriles son
   visibles y el número de cada manta se lee sobre cualquier color.
10. **Given** el host corrió una carrera en Turbo, **When** abre la siguiente ronda, **Then** el
    selector sigue en Turbo; **When** recarga la página, **Then** vuelve a Normal.

---

### User Story 5 - Control del host sobre la partida y los saldos (Priority: P2)

El host puede abrir una nueva ronda, iniciar la carrera, reiniciar la ronda de apuestas
(anulando y devolviendo todas las apuestas), reiniciar la carrera en curso (volviendo los
caballos a la partida y a la fase de apuestas con las apuestas intactas) y fijar, sumar o
restar monedas a cualquier jugador. Solo el host puede modificar saldos.

**Why this priority**: necesario para arrancar la economía (los jugadores parten con 0) y para
corregir errores, pero una sola carga inicial basta para probar P1.

**Independent Test**: cargar monedas a jugadores, reiniciar una ronda con apuestas y una
carrera en curso, y verificar saldos, apuestas y el historial de movimientos.

**Acceptance Scenarios**:

1. **Given** un jugador con 0 monedas, **When** el host le suma 100, **Then** su saldo pasa a
   100, lo ve en su celular al instante y el ajuste queda registrado en el historial.
2. **Given** un jugador con 50 monedas, **When** el host le fija 20, **Then** su saldo es 20; y
   **When** el host intenta restarle 30, **Then** la operación se rechaza por dejar saldo negativo.
3. **Given** una ronda con apuestas, **When** el host reinicia la ronda de apuestas, **Then**
   todas las apuestas se anulan, cada jugador recupera exactamente lo apostado y la ronda vuelve
   a fase de apuestas vacía.
4. **Given** una carrera en curso, **When** el host reinicia la carrera, **Then** los caballos
   vuelven a la línea de partida, la ronda vuelve a fase de apuestas con las apuestas actuales
   intactas y los jugadores pueden modificarlas antes de que se vuelva a iniciar.
5. **Given** un jugador sin rol de host, **When** intenta cualquier acción de host, **Then** el
   sistema la rechaza.

---

### User Story 6 - Leaderboard general (Priority: P3)

La pantalla del host muestra a todos los jugadores ordenados de primero a último por puntaje,
con su puntaje y sus monedas, destacando claramente al primero y al último.

**Why this priority**: añade competencia a largo plazo, pero no es necesario para jugar rondas.

**Independent Test**: jugar varias rondas y comprobar que el orden y los puntajes coinciden con
la cantidad de aciertos de cada jugador.

**Acceptance Scenarios**:

1. **Given** jugadores con 3, 1 y 0 aciertos, **When** se mira el leaderboard general,
   **Then** aparecen en ese orden con puntajes 3, 1 y 0, el primero y el último destacados.
2. **Given** dos jugadores con igual puntaje, **When** se ordena el leaderboard, **Then** va
   primero el que tiene más monedas y, si persiste el empate, por nombre de usuario en orden
   alfabético.

---

### User Story 7 - Comodidad y posición en la vista móvil (Priority: P2)

Tras probar el juego en celulares, la vista de jugador se ajusta para el uso real: mientras la
carrera está en curso y al ver el resultado, cada jugador ve su posición en el leaderboard
general ("Ranking: 3.º de 8 · 2 puntos"), sin ver nombres ni saldos de otros jugadores. Los textos
quedan contenidos en pantallas chicas y tocar el campo de monto no hace zoom en iPhone.

**Why this priority**: mejora la experiencia en el dispositivo que usa cada jugador; el juego
ya funciona sin ello.

**Independent Test**: con dos o más jugadores y alguna ronda jugada, abrir la vista de jugador
en un celular (o a 320, 360 y 390 px de ancho) y comprobar la posición en carrera y resultado,
que ningún texto se desborda y que el campo de monto no provoca zoom al tocarlo en iPhone.

**Acceptance Scenarios**:

1. **Given** 8 jugadores y "ana" tercera en el leaderboard general con 2 puntos, **When** la
   carrera está en curso o terminó, **Then** el celular de "ana" muestra "Ranking: 3.º de 8 ·
   2 puntos".
2. **Given** la fase de apuestas o la espera, **When** "ana" mira su celular, **Then** no ve su
   posición (la pantalla queda para apostar).
3. **Given** la vista de jugador en cualquier fase, **When** se inspecciona lo que recibe,
   **Then** no contiene nombres, puntajes ni saldos de otros jugadores (solo su posición y el
   total de jugadores).
4. **Given** un iPhone, **When** el jugador toca el campo de monto, **Then** la página no hace
   zoom.
5. **Given** un nombre de usuario de 20 caracteres o un pago con varios miles de monedas,
   **When** se ve en un celular de 320 px de ancho, **Then** ningún texto se sale de la pantalla
   ni de su recuadro, sin scroll horizontal.
6. **Given** una carrera en curso y "ana" apostó al caballo 6, **When** mira su celular,
   **Then** ve en qué lugar va su caballo ("6 Rosado · va 2.º") y los 3 caballos en punta, y
   ambos se actualizan cuando cambia el orden de la carrera.
7. **Given** la carrera terminó, **When** "ana" mira su celular, **Then** ve en qué lugar
   terminó su caballo y el podio (1.º, 2.º y 3.º); quien no apostó ve solo el podio.

---

### Edge Cases

- **Nadie acierta**: el caballo ganador no tiene apuestas. El pozo completo se acumula para la
  siguiente ronda; se suma de nuevo si tampoco hay acertantes, sin límite.
- **Pozo acumulado y reinicios**: reiniciar la ronda de apuestas devuelve solo las apuestas
  de la ronda; el acumulado se conserva. Reiniciar la carrera no toca ni apuestas ni acumulado.
- **Ronda sin apuestas con pozo acumulado**: si nadie apuesta, la carrera se corre igual y el
  acumulado pasa intacto a la siguiente ronda.
- **Empate en la meta (photo finish)**: si dos o más caballos alcanzan la meta en el mismo tick,
  el servidor asigna a cada uno, con la semilla de la carrera, un valor aleatorio que representa
  la fracción de casilla que le faltaba; gana el de mayor valor. Siempre hay un único ganador y
  la vista del host anuncia "photo finish" mostrando a los caballos empatados.
- **Caballo sin apuestas**: su multiplicador se muestra como "sin apuestas" (no hay división
  por cero); si un jugador apostara, el multiplicador se recalcula en vivo.
- **Pago con decimales**: las monedas son enteras; cada pago se redondea hacia abajo y las
  monedas sobrantes se reparten de a una a los ganadores con mayor parte decimal perdida; a
  igualdad, a quien confirmó antes su apuesta vigente (la hora cuenta desde su último cambio).
  Ejemplo: pozo 100, tres ganadores con 10 cada uno → 33,33 cada uno → 33, 33, 33 y la moneda
  sobrante va a quien confirmó primero: 34, 33, 33.
- **Apuesta sin saldo suficiente**: se rechaza con un mensaje; montos menores a 1, no enteros o
  mayores al saldo disponible (más la apuesta anterior, si se está modificando) no se aceptan.
- **Jugador con 0 monedas**: puede ver la ronda pero no puede apostar.
- **Jugador que se arrepiente de apostar**: no puede cancelar; puede bajar su apuesta hasta 1
  moneda o cambiar de caballo. Sigue figurando como "apostó".
- **Ninguna apuesta en la ronda**: el host puede iniciar igual la carrera; al terminar no hay
  pagos ni puntos (el acumulado, si existe, se mantiene).
- **Jugador que entra o recarga a mitad de la carrera**: ve "carrera en curso, mira la
  pantalla"; si apostó en esa ronda, al terminar ve su resultado.
- **Jugador que se desconecta tras apostar**: su apuesta sigue vigente, sigue figurando en
  "apostaron" y se liquida normalmente; su nuevo saldo se ve al volver a entrar.
- **Jugador que se desconecta sin apostar**: deja de figurar en "faltan"; si vuelve a
  conectarse durante la fase de apuestas, reaparece.
- **Ajuste de saldo durante la fase de apuestas o carrera**: se aplica sobre el saldo disponible
  (las monedas ya apostadas no se ven afectadas).
- **Reiniciar la carrera**: la nueva carrera usa una semilla nueva; el resultado de la carrera
  anulada no se aplica.
- **Velocidad tras reiniciar la carrera**: el host puede elegir otra velocidad antes de volver a
  iniciarla; cada carrera registra la suya.
- **Velocidad no válida**: un valor distinto de Normal, Rápida o Turbo se rechaza y la carrera
  no se inicia.
- **Host que recarga a mitad de una carrera Turbo**: recibe el estado actual con la velocidad en
  curso y la animación se adapta a ese ritmo.
- **Registro con el nombre "hosttt"**: no es posible crear otra cuenta con ese nombre.
- **Acciones del host fuera de fase** (p. ej. iniciar carrera sin ronda abierta): se rechazan
  y los controles no disponibles en la fase actual aparecen deshabilitados.

## Requirements *(mandatory)*

### Functional Requirements

**Ingreso y sesión**

- **FR-001**: El sistema MUST ofrecer una única pantalla de ingreso con campos de usuario y
  contraseña para todos los roles.
- **FR-002**: Si el usuario no existe, el sistema MUST crearlo con la contraseña ingresada, con
  rol jugador, 0 monedas y 0 puntos, e iniciar su sesión de inmediato.
- **FR-003**: Si el usuario existe y la contraseña no coincide, el sistema MUST mostrar un error
  y no iniciar sesión.
- **FR-004**: El sistema MUST incluir una cuenta de host cuyas credenciales se configuran al
  arrancar mediante variables de entorno (`HOST_USER`, `HOST_PASSWORD`), con valores por
  defecto "hosttt" / "1231"; si se usan los valores por defecto, el sistema MUST advertirlo al
  arrancar. Esa cuenta accede a la vista de host; toda otra cuenta accede a la vista de jugador.
- **FR-005**: La sesión MUST mantenerse al recargar la página hasta que el usuario cierre sesión.
- **FR-006**: Las contraseñas MUST almacenarse de forma no reversible (nunca en texto plano).
- **FR-007**: Los nombres de usuario MUST ser únicos sin distinguir mayúsculas/minúsculas y
  tener entre 3 y 20 caracteres (letras, números, guion o guion bajo).
- **FR-007a**: Tras 5 intentos fallidos de contraseña para un mismo usuario, el sistema MUST
  rechazar nuevos intentos para ese usuario durante 60 segundos con el mensaje "Demasiados
  intentos, espera un minuto"; un login correcto reinicia el contador.

**Caballos y carrera**

- **FR-008**: Cada carrera MUST tener 6 caballos con jinete, con estadísticas idénticas,
  distinguibles por número y color: 1 Rojo #FF004D, 2 Naranjo #FFA300, 3 Amarillo
  #FFEC27, 4 Verde #00E436, 5 Azul #29ADFF, 6 Rosado #FF77A8. Cada caballo tiene además un
  pelaje fijo (FR-030a), puramente visual, que no afecta a la carrera.
- **FR-009**: La carrera MUST avanzar en ticks sobre una pista de 40 casillas desde la salida
  hasta la meta; en cada tick, cada caballo tiene de forma independiente una probabilidad de 1 en
  10 de avanzar una casilla. La duración del tick la fija la velocidad elegida (FR-009a).
- **FR-009a**: Antes de iniciar cada carrera, el host MUST poder elegir su velocidad: Normal
  (200 ms por tick), Rápida (100 ms) o Turbo (50 ms); por defecto, Normal. La velocidad MUST
  quedar fija durante toda la carrera (no se puede cambiar con la carrera en curso), MUST
  registrarse en el resultado de la carrera y MUST NOT alterar la probabilidad de avance, el
  largo de la pista ni la secuencia de posiciones: con la misma semilla, el resultado es el mismo
  en cualquier velocidad. Solo el host puede elegirla; cualquier otro valor se rechaza.
  En la vista del host, el selector MUST mostrar Normal al cargar la página y conservar la
  última velocidad elegida entre rondas mientras la página siga abierta.
- **FR-010**: Gana el primer caballo en alcanzar la casilla de meta. Si varios la alcanzan en el
  mismo tick, se resuelve por photo finish: cada empatado recibe un valor aleatorio generado por
  el servidor con la semilla de la carrera y gana el de mayor valor; siempre hay un único
  ganador.
- **FR-011**: Toda la aleatoriedad de la carrera MUST generarse en el servidor a partir de una
  semilla registrada, de modo que la carrera pueda reproducirse y auditarse.
- **FR-012**: Todos los clientes MUST ver la misma secuencia de posiciones y el mismo ganador.

**Fases de la ronda**

- **FR-013**: Una ronda MUST pasar por las fases: apuestas abiertas → carrera en curso →
  resultado. Fuera de una ronda el juego está en espera.
- **FR-014**: Solo el host MUST poder abrir una nueva ronda de apuestas, y solo cuando no haya
  una ronda en fase de apuestas o carrera.
- **FR-015**: El host MUST poder iniciar la carrera desde la fase de apuestas aunque falten
  jugadores por apostar; al iniciarla, la fase de apuestas se cierra y quien no apostó queda
  fuera de la ronda.

**Apuestas y pagos**

- **FR-016**: Durante la fase de apuestas, cada jugador MUST poder tener como máximo una apuesta
  activa: un caballo y un monto entero ≥ 1 que no supere su saldo disponible.
- **FR-017**: El monto apostado MUST descontarse del saldo al confirmar la apuesta.
- **FR-018**: El jugador MUST poder cambiar caballo y/o monto mientras la fase de apuestas siga
  abierta; la apuesta anterior se devuelve y la nueva se descuenta en una sola operación. El
  jugador MUST NOT poder retirar su apuesta por completo: una vez confirmada, el monto mínimo
  es 1 moneda; solo el reinicio de ronda del host anula apuestas.
- **FR-019**: El pozo MUST ser la suma de todas las apuestas de la ronda más el pozo acumulado
  de rondas anteriores; el multiplicador de un caballo MUST ser pozo ÷ total apostado a ese
  caballo.
- **FR-020**: Si un caballo gana, cada jugador que le apostó MUST recibir apuesta × multiplicador
  (incluye su apuesta), sin comisión. Cada pago MUST redondearse hacia abajo y las monedas
  sobrantes MUST repartirse de a una a los ganadores con mayor parte decimal perdida (a
  igualdad, a quien confirmó antes su apuesta vigente), de modo que la suma de pagos sea
  exactamente igual al pozo.
- **FR-021**: Si ningún jugador apostó al caballo ganador, el pozo completo MUST pasar al pozo
  acumulado de la siguiente ronda; ese movimiento MUST quedar registrado.
- **FR-021a**: El pozo acumulado MUST mostrarse por separado en la vista del host durante la
  fase de apuestas (p. ej. "pozo: 100, incluye 60 acumulado").
- **FR-022**: El pago potencial mostrado MUST calcularse con la misma regla que la liquidación,
  de modo que coincida exactamente con el pago final si el pozo no cambia.

**Puntaje**

- **FR-023**: Cada jugador que apostó al caballo ganador MUST recibir +1 punto por esa carrera.

**Vista del jugador**

- **FR-024**: La vista del jugador MUST mostrar siempre sus monedas disponibles.
- **FR-025**: Con la fase de apuestas abierta, MUST mostrar los 6 caballos (color y número)
  con el multiplicador actual de cada uno, actualizado en vivo, y permitir elegir caballo y
  monto.
- **FR-026**: Tras apostar, MUST mostrar el caballo elegido, el monto apostado y cuánto
  recibiría si gana, actualizado en vivo.
- **FR-027**: Durante la carrera, MUST mostrar el mensaje "carrera en curso, mira la pantalla".
- **FR-028**: Al terminar, MUST mostrar si ganó o perdió (o que no participó) y su nuevo saldo.
- **FR-028a**: Durante la carrera y en el resultado, MUST mostrar la posición del propio jugador
  en el leaderboard general (mismo orden que FR-034), el total de jugadores y su puntaje, p. ej.
  "Ranking: 3.º de 8 · 2 puntos". En apuestas y en espera no se muestra.
- **FR-028b**: Durante la carrera, la vista del jugador MUST mostrar los 3 caballos en punta y,
  si apostó, el lugar en que va su caballo, actualizados cuando cambia el orden de la carrera;
  al terminar, MUST mostrar el podio y el lugar final de su caballo. El orden es el mismo que
  muestra la pantalla del host (incluido el desempate del photo finish).
- **FR-029**: La vista del jugador MUST NOT mostrar la pista 3D ni datos de otros jugadores
  (nombres, apuestas, puntajes o saldos); solo se permiten la posición propia y el total de
  jugadores (FR-028a), los totales públicos por caballo (FR-025) y el orden de los caballos en
  la carrera (FR-028b).
- **FR-029a**: La vista del jugador MUST evitar el zoom automático al enfocar campos de texto en
  iPhone (tamaño de letra de los campos ≥ 16 px), sin desactivar el zoom manual, y todos los
  textos MUST quedar contenidos en su recuadro desde 320 px de ancho (cortando o partiendo
  líneas cuando haga falta).

**Vista del host**

- **FR-030**: La vista del host MUST mostrar una pista recta con los 6 caballos con jinete en
  3D, que avanzan visualmente de forma gradual.
- **FR-030a**: Cada caballo MUST mostrar un pelaje fijo según su número, generado por código con
  colores de la paleta: 1 castaño, 2 pinto, 3 tordo, 4 palomino, 5 pinto, 6 castaño.
  Castaño: cuerpo #AB5236, crin y cola #000000. Pinto: cuerpo #AB5236 con manchas irregulares
  #FFF1E8, crin y cola #000000. Tordo: cuerpo #C2C3C7, crin y cola #5F574F. Palomino: cuerpo
  #FFCCAA, crin y cola #FFF1E8. Las manchas del pinto MUST ser iguales en todas las pantallas de
  host (deterministas por número de caballo). La crin MUST ser una pieza separada sobre el
  cuello.
- **FR-030b**: Los caballos MUST verse a ~1,5× del tamaño anterior, con los 6 carriles visibles
  en todo momento de la carrera. El número de cada manta MUST usar una fuente sans-serif del
  sistema de peso normal, con trazo fino y un contorno fino de contraste, legible sobre
  cualquier color de manta.
- **FR-030c**: Mientras la carrera está en curso, todos los caballos MUST galopar de forma
  continua y detenerse solo al terminar o reiniciar la carrera. La cadencia del galope de cada
  caballo MUST depender de cuántas veces avanzó en los últimos 10 ticks (estancado = lenta, en
  racha = rápida). Cuello y cabeza MUST cabecear hacia adelante y abajo en cada zancada,
  sincronizados con las patas, y la crin MUST acompañar ese movimiento. La posición MUST
  suavizarse con amortiguación continua hacia la casilla destino, sin saltos visibles.
- **FR-031**: En fase de apuestas, MUST mostrar el pozo y, por caballo: total apostado,
  cantidad de apostadores, multiplicador y lista de jugadores con su apuesta y lo que recibirían
  si ese caballo gana; además, quiénes ya apostaron (conectados o no) y quiénes faltan,
  considerando como "faltan" solo a los jugadores conectados en ese momento que no han
  apostado. Las listas MUST actualizarse en vivo al conectarse o desconectarse un jugador.
- **FR-032**: Durante la carrera, MUST mostrar el orden de los caballos de primero a último y
  los jugadores que apostaron a cada uno.
- **FR-033**: Al terminar, MUST mostrar el caballo ganador, los jugadores que acertaron y
  cuántas monedas recibe cada uno; si hubo photo finish, MUST indicarlo junto con los caballos
  empatados y el orden resultante.
- **FR-034**: MUST mostrar un leaderboard general con todos los jugadores ordenados por puntaje
  (desempate: más monedas, luego nombre alfabético), con puntaje y monedas, destacando al
  primero y al último.

**Controles del host**

- **FR-035**: El host MUST poder reiniciar la ronda de apuestas: anula todas sus apuestas,
  devuelve íntegramente las monedas a cada jugador, conserva el pozo acumulado y deja la
  ronda en fase de apuestas vacía.
- **FR-036**: El host MUST poder reiniciar la carrera en curso: la detiene, devuelve los
  caballos a la partida y vuelve a la fase de apuestas conservando las apuestas actuales.
- **FR-037**: El host MUST poder fijar, sumar o restar monedas a cualquier jugador; una
  operación que deje un saldo negativo MUST rechazarse.
- **FR-038**: Solo el host MUST poder modificar saldos o ejecutar acciones de control; el
  sistema MUST validar el rol en cada acción.

**Economía y persistencia**

- **FR-039**: Ninguna operación puede crear ni destruir monedas (MUST NOT), salvo los ajustes
  del host; todo movimiento de saldo (apuesta, cambio, devolución, pago, ajuste, entrada o
  salida del pozo acumulado) MUST quedar registrado con jugador, tipo, monto, ronda, autor y
  fecha.
- **FR-040**: El sistema MUST persistir usuarios, sesiones, saldos, historial de ajustes del
  host y movimientos, rondas, apuestas, semillas y resultados, de modo que un reinicio del
  sistema no pierda datos.
- **FR-041**: Tras un reinicio del sistema con una carrera en curso, esa carrera MUST
  reanudarse desde el principio con las apuestas intactas en fase de apuestas (equivalente a
  reiniciar la carrera).

### Key Entities

- **Usuario**: cuenta con nombre único, contraseña protegida, rol (host o jugador), saldo de
  monedas y puntaje.
- **Sesión**: vínculo entre un dispositivo y un usuario autenticado; sobrevive a la recarga.
- **Caballo**: uno de 6 participantes fijos con número (1–6), color y pelaje (visual); sin
  estadísticas propias.
- **Ronda**: unidad de juego con fase (apuestas, carrera, resultado), pozo, acumulado recibido
  y caballo ganador. Reiniciar la ronda conserva la misma ronda y marca sus apuestas como
  devueltas.
- **Pozo acumulado**: monedas de rondas sin acertantes que esperan a la siguiente ronda; es
  único, persistente y cada entrada o salida queda en el libro de movimientos.
- **Carrera**: ejecución de la carrera dentro de una ronda, con semilla, velocidad (Normal,
  Rápida o Turbo), posiciones por tick y ganador; una ronda puede tener carreras anuladas por
  reinicio y una sola carrera válida.
- **Apuesta**: jugador, ronda, caballo, monto, hora de confirmación y estado (activa, devuelta,
  ganadora, perdedora) con su pago.
- **Movimiento de saldo**: registro inmutable de cada cambio de saldo con tipo (apuesta,
  devolución, pago, ajuste del host, acumulación al pozo), monto, jugador, ronda, autor y fecha.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un jugador nuevo entra y queda listo para apostar en menos de 30 segundos desde
  que abre la app en su celular.
- **SC-002**: Un jugador hace su apuesta en menos de 15 segundos desde que se abre la ronda.
- **SC-003**: Apuestas, cambios y ajustes de saldo se reflejan en todas las pantallas conectadas
  en menos de 1 segundo.
- **SC-004**: Una partida con 1 host y al menos 20 jugadores conectados funciona sin
  desincronización: todas las pantallas muestran el mismo ganador y los mismos pagos.
- **SC-005**: En el 100 % de las rondas liquidadas, la suma de pagos es exactamente igual al
  pozo (o el pozo completo pasa al acumulado si nadie acierta), y la suma de saldos, apuestas
  activas y pozo acumulado solo cambia por ajustes del host.
- **SC-006**: En el 100 % de las rondas, el pago recibido coincide con el último pago potencial
  mostrado al cierre de apuestas.
- **SC-007**: En velocidad Normal, una carrera dura alrededor de 60 segundos y entre 45 y 90
  segundos en el 90 % de los casos. En Rápida y Turbo dura, respectivamente, la mitad y la
  cuarta parte (aprox. 30 s y 15 s), con el mismo número de ticks.
- **SC-008**: Tras recargar la página o reiniciar el sistema, ningún usuario pierde su sesión,
  saldo, puntaje ni apuestas activas.
- **SC-009**: La vista de jugador es usable sin scroll horizontal en pantallas desde 360 px de
  ancho, y el texto de la vista de host es legible a 4 metros en una pantalla de 50 pulgadas.

## Assumptions

- Existe una única partida compartida (un host, un grupo); no hay múltiples salas.
- Largo de pista (40 casillas) y duración del tick de cada velocidad (200 / 100 / 50 ms) son
  constantes del código (`shared/horses.ts`); si las pruebas mostraran que no se cumple SC-007
  en Normal, se ajustarían ahí y en FR-009a sin cambiar la regla de 1 en 10 (el test
  `race-duration` lo verifica).
- La velocidad elegida no se muestra a los jugadores en el celular (ellos miran la pantalla).
- La cola del pinto es #000000, igual que su crin.
- Las monedas son ficticias y enteras; nunca se convierten a dinero real.
- El host no apuesta ni aparece en el leaderboard general.
- Solo existe un host a la vez; cambiar `HOST_USER` entre arranques convierte en jugador a la
  cuenta host anterior.
- La sesión dura hasta cerrar sesión explícitamente; se ofrece un botón de cerrar sesión en
  ambas vistas.
- Toda la interfaz y la escena 3D usan solo la paleta PICO-8 de la constitución; los colores de
  los caballos pertenecen a esa paleta.
- Quedan fuera de alcance: recuperación de contraseña, chat, perfiles, historial visible para
  jugadores y múltiples hosts simultáneos con roles distintos.
