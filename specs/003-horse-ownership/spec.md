# Feature Specification: Propiedad de caballos

**Feature Branch**: `003-horse-ownership`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Agregar a GuanchoTrack la propiedad de caballos: compra al establo
(30 monedas al pozo acumulado), compra forzosa a otro jugador (50 monedas al dueño anterior), solo
fuera de la carrera; el dueño edita nombre y número; cuando gana un caballo con dueño, el dueño
recibe el 10 % del pozo y el resto va a los apostadores; sección "Caballos" en el celular;
número personalizado en la pista, dueño en los paneles, parte del dueño en el resultado e
historial de compras en el host; todo persistente y en el libro de movimientos."

**Contexto**: amplía las features [001-group-horse-racing](../001-group-horse-racing/spec.md) y
[002-host-admin-panel](../002-host-admin-panel/spec.md), y aplica la constitución v2.1.0
(principios X, XI y XII: parte del dueño, multiplicadores netos y compras que solo transfieren
monedas).

## Clarifications

### Session 2026-10-26

- Q: ¿Qué pasa con la personalización de caballos del host (feature 002) ahora que hay dueños?
  → A: El host lo edita todo (nombre, número, color de manta y pelaje) en cualquier caballo,
  tenga o no dueño, con prioridad sobre el dueño. El dueño solo edita nombre y número.
- Q: ¿Qué pasa con los caballos de un jugador que el host elimina? → A: Vuelven al establo: quedan
  sin dueño, conservan nombre y número y se pueden comprar de nuevo por 30. No se devuelve nada.
- Q: ¿Hay algún límite a la compra forzosa entre jugadores? → A: No; siempre se puede comprar si
  hay saldo suficiente y no hay una carrera en curso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Comprar caballos (Priority: P1)

En su celular, el jugador abre la nueva sección "Caballos" y ve los 6 caballos con su nombre,
número, color, pelaje, dueño y precio: 30 monedas si no tiene dueño, 50 si es de otro jugador. Si
le alcanza el saldo y no hay una carrera en curso, pulsa "Comprar" y el caballo pasa a ser suyo.
Las 30 monedas de una compra al establo van al pozo acumulado; las 50 de una compra a otro jugador
van íntegras al dueño anterior, que no tiene que aceptar.

**Why this priority**: es la base de la feature; sin dueños no hay nada que editar ni cobrar.

**Independent Test**: con "ana" (100 monedas), "beto" (60) y el pozo acumulado en 0, ana compra
el caballo 3 al establo y beto se lo compra a ana; comprobar saldos (ana 120, beto 10), pozo
acumulado (30), dueño mostrado y que la suma total de monedas no cambió.

**Acceptance Scenarios**:

1. **Given** el juego recién instalado, **When** un jugador abre "Caballos", **Then** ve los 6
   caballos sin dueño, cada uno con precio 30 y botón "Comprar".
2. **Given** "ana" con 100 monedas, el caballo 3 sin dueño y el pozo acumulado en 20, **When** ana
   compra el caballo 3, **Then** ana queda con 70 monedas, el pozo acumulado pasa a 50, el caballo
   3 figura como de ana y la suma total de monedas no cambia.
3. **Given** el caballo 3 de "ana" y "beto" con 60 monedas, **When** beto lo compra, **Then** beto
   queda con 10, ana recibe 50, el caballo 3 pasa a ser de beto sin que ana tenga que aceptar y
   conserva su nombre y número.
4. **Given** "ana" dueña del caballo 3, **When** mira "Caballos", **Then** el caballo 3 aparece
   como suyo y sin botón "Comprar".
5. **Given** "beto" con 25 monedas, **When** intenta comprar un caballo sin dueño, **Then** la
   compra se rechaza por saldo insuficiente y nada cambia.
6. **Given** una carrera en curso, **When** un jugador intenta comprar cualquier caballo, **Then**
   la compra se rechaza y el botón "Comprar" aparece deshabilitado hasta que la carrera termine.
7. **Given** el juego en espera, en fase de apuestas o con la ronda terminada, **When** un jugador
   con saldo suficiente compra un caballo, **Then** la compra se acepta.
8. **Given** "ana" con 200 monedas, **When** compra los caballos 1, 2 y 5, **Then** es dueña de
   los tres.

---

### User Story 2 - Cobrar como dueño (Priority: P1)

Cuando gana un caballo con dueño, el dueño recibe el 10 % del pozo, redondeado hacia abajo; el
resto se reparte entre los apostadores acertantes con las reglas de siempre. Si nadie le apostó,
el dueño igual cobra su 10 % y el resto pasa al pozo acumulado. Durante la fase de apuestas, los
multiplicadores que se ven en vivo ya descuentan la parte del dueño, así que lo mostrado coincide
con lo que se paga.

**Why this priority**: es el motivo para comprar un caballo; sin la ganancia, la propiedad sería
solo cosmética.

**Independent Test**: "ana" compra el caballo 2 al establo (pozo acumulado 30); en la ronda
"beto" apuesta 35 al 2 y "carla" 70 al 4 (pozo 135); gana el 2 ⇒ ana recibe 13, beto 122, y el
multiplicador mostrado antes de la carrera para el 2 era (135 − 13) ÷ 35.

**Acceptance Scenarios**:

1. **Given** el caballo 2 de "ana" y un pozo de 105 con 35 apostados al 2 (todo de "beto"),
   **When** gana el 2, **Then** ana recibe 10 (10 % de 105, redondeado hacia abajo), beto recibe
   95 y la suma de pagos es exactamente 105.
2. **Given** el caballo 4 sin dueño y un pozo de 105, **When** gana el 4, **Then** el 100 % del
   pozo se reparte entre quienes le apostaron, como en la feature 001.
3. **Given** el caballo 2 de "ana", un pozo de 80 y nadie que le haya apostado, **When** gana el
   2, **Then** ana recibe 8 y los 72 restantes pasan al pozo acumulado de la siguiente ronda.
4. **Given** "ana" dueña del caballo 2 que además le apostó 20, **When** gana el 2, **Then** ana
   recibe por separado su parte de dueña y su pago de apostadora, y ambos movimientos se ven
   distintos en el libro de movimientos.
5. **Given** la fase de apuestas con el caballo 2 de "ana", un pozo de 105 y 35 apostados al 2,
   **When** se ve el multiplicador del 2, **Then** es (105 − 10) ÷ 35 ≈ 2,71, y es el que se
   aplica si nada cambia antes de la carrera.
6. **Given** la fase de apuestas, **When** alguien compra al establo un caballo al que ya hay
   apuestas, **Then** el pozo acumulado sube 30 y los multiplicadores de todos los caballos se
   recalculan en vivo, incluido el descuento del dueño nuevo.
7. **Given** un pozo de 9 y un ganador con dueño, **When** se liquida, **Then** el dueño recibe 0
   y los 9 van a los apostadores.
8. **Given** que gana un caballo con dueño, **When** termina la carrera, **Then** el dueño no suma
   puntos por ser dueño; solo suman los apostadores acertantes, como en la feature 001.

---

### User Story 3 - Editar mis caballos y ver lo que me generan (Priority: P2)

En "Caballos", el jugador ve sus caballos propios con dos acciones: cambiar el nombre (1 a 16
caracteres) y el número (1 a 99), siempre que no los use otro caballo. El pelaje y los colores de
manta y jinete no los puede tocar. Junto a cada caballo propio ve cuántas monedas le ha generado
como dueño.

**Why this priority**: da identidad al caballo y muestra el retorno de la compra, pero comprar y
cobrar funcionan sin ello.

**Independent Test**: "ana" compra el caballo 3, lo renombra a "Trueno" con el número 77, intenta
el número 5 (usado por otro caballo) y ve el rechazo; gana una carrera con él y ve lo que le
generó.

**Acceptance Scenarios**:

1. **Given** "ana" dueña del caballo 3, **When** lo renombra a "Trueno" y le pone el número 77,
   **Then** la pista 3D, los paneles del host y todos los celulares muestran "Trueno" con el 77.
2. **Given** otro caballo con el número 5 o llamado "Rayo", **When** "ana" intenta poner 5 o
   "rayo" a su caballo, **Then** el cambio se rechaza porque nombre y número son únicos entre los
   6 caballos (el nombre sin distinguir mayúsculas).
3. **Given** "ana", **When** intenta poner un nombre vacío, de más de 16 caracteres o un número
   fuera de 1–99, **Then** el cambio se rechaza.
4. **Given** un caballo que no es de "ana", **When** intenta editarlo, **Then** el sistema lo
   rechaza; la vista no le ofrece la acción.
5. **Given** "ana" dueña del caballo 3, **When** busca cómo cambiar su pelaje o el color de manta
   o jinete, **Then** no existe esa opción.
6. **Given** una carrera en curso, **When** "ana" intenta editar su caballo, **Then** el cambio se
   rechaza hasta que termine la carrera.
7. **Given** "ana" recibió 10 y 15 monedas como dueña del caballo 3 en dos carreras, **When**
   mira el caballo, **Then** ve "te ha generado 25".
8. **Given** "beto" compra el caballo 3 a "ana", **When** beto lo mira, **Then** ve "te ha
   generado 0"; lo que generó para ana no cuenta para beto.

---

### User Story 4 - Dueños en la pantalla del host (Priority: P3)

La pantalla del host muestra en la pista 3D el número personalizado de cada caballo y, en los
paneles, su nombre y su dueño. Al terminar la carrera, el resultado indica cuánto recibió el
dueño del ganador. En la pestaña "Admin", el host ve el historial de compras de caballos y sigue
pudiendo editar cualquier caballo.

**Why this priority**: da visibilidad y control al host; el juego funciona sin ello.

**Independent Test**: tras varias compras y una carrera ganada por un caballo con dueño, revisar
la pista, los paneles, el resultado y el historial de compras.

**Acceptance Scenarios**:

1. **Given** el caballo 3 renombrado "Trueno" con el número 77 y dueña "ana", **When** se ve la
   pista 3D, **Then** su manta muestra 77; y los paneles de apuestas, carrera y resultado muestran
   "Trueno", el 77 y "de ana".
2. **Given** un caballo sin dueño, **When** aparece en los paneles, **Then** se indica que no
   tiene dueño (p. ej. "del establo").
3. **Given** que gana un caballo con dueño, **When** termina la carrera, **Then** el resultado
   muestra el dueño y cuánto recibió, además de los apostadores acertantes y sus pagos.
4. **Given** varias compras, **When** el host abre el historial de compras, **Then** ve cada una
   con fecha, caballo (nombre y número de ese momento), comprador, vendedor (o "establo") y
   precio, de la más reciente a la más antigua.
5. **Given** el caballo 3 de "ana", **When** el host le cambia nombre, número, color de manta o
   pelaje, **Then** el cambio se aplica aunque tenga dueño, y ana lo ve en su celular.
6. **Given** caballos con dueño y personalizados, **When** el host pulsa "Restablecer caballos",
   **Then** vuelven los nombres, números (1–6), colores y pelajes por defecto, y los dueños se
   conservan.

---

### Edge Cases

- **Dos jugadores compran el mismo caballo a la vez**: se acepta solo la primera compra; la
  segunda se rechaza y el jugador ve el caballo con su dueño y precio nuevos, sin que se le cobre.
- **El precio cambia mientras el jugador mira**: si el caballo pasó de "sin dueño" (30) a tener
  dueño (50) entre que el jugador lo vio y pulsó "Comprar", la compra se rechaza en vez de cobrar
  un precio distinto al mostrado.
- **Comprar con apuesta activa**: el saldo disponible ya descuenta la apuesta; solo puede comprar
  si el saldo restante alcanza.
- **El dueño es eliminado por el host**: sus caballos vuelven al establo (sin dueño, mismo nombre
  y número, precio 30); su saldo va al pozo acumulado como en la feature 002; nada se devuelve.
  Si ocurre en fase de apuestas, los multiplicadores se recalculan en vivo. Con una carrera en
  curso, eliminar a un jugador que tiene caballos se rechaza hasta que termine (así el dueño del
  ganador al terminar es el mismo que al cerrar las apuestas, FR-022).
- **El dueño está inactivo (feature 002)**: sigue siendo dueño, puede comprar, editar y cobrar.
- **Reiniciar la ronda de apuestas**: devuelve las apuestas; las compras hechas en esa ronda no se
  deshacen y el pozo acumulado conserva lo que aportaron.
- **Reiniciar la carrera en curso**: no se liquida nada, así que el dueño no cobra; la ronda
  vuelve a la fase de apuestas, donde se puede volver a comprar y editar.
- **Photo finish**: la parte del dueño se aplica al caballo declarado ganador tras el desempate.
- **El host edita un caballo mientras su dueño lo edita**: gana el último cambio aceptado; ambos
  ven el resultado en menos de 1 segundo.
- **Restablecer caballos cuando un dueño usa el número 3 en el caballo 5**: tras restablecer, los
  números vuelven a 1–6 por carril, sin conflicto.
- **Nombre con espacios al inicio o al final**: se recortan antes de validar.
- **Saldo exactamente igual al precio**: la compra se acepta y el jugador queda con 0.
- **Comprar en la fase de resultado**: se permite; los pagos de esa carrera ya están liquidados y
  no cambian.

## Requirements *(mandatory)*

### Functional Requirements

**Propiedad y compra**

- **FR-001**: Cada uno de los 6 caballos MUST tener como máximo un dueño, que es un jugador. Al
  instalar el juego, los 6 MUST estar sin dueño. Un jugador MUST poder ser dueño de varios
  caballos. El host no es jugador y MUST NOT poder comprar.
- **FR-002**: Un jugador MUST poder comprar un caballo sin dueño por 30 monedas; esas 30 monedas
  MUST pasar de su saldo al pozo acumulado en una sola operación.
- **FR-003**: Un jugador MUST poder comprar el caballo de otro jugador por 50 monedas, sin
  aceptación del dueño; las 50 monedas MUST pasar íntegras del comprador al dueño anterior en una
  sola operación.
- **FR-004**: Un jugador MUST NOT poder comprar un caballo propio.
- **FR-005**: La compra MUST rechazarse si el saldo disponible del comprador es menor que el
  precio, o si el dueño del caballo cambió desde que el comprador vio el precio.
- **FR-006**: Comprar y editar caballos MUST estar permitido con el juego en espera, en la fase
  de apuestas y en la fase de resultado, y MUST rechazarse con una carrera en curso.
- **FR-007**: Al cambiar de dueño, el caballo MUST conservar nombre, número, color de manta y
  pelaje.
- **FR-008**: Ninguna compra MUST crear ni destruir monedas: solo transfiere entre cuentas
  existentes (jugador → pozo acumulado, o jugador → jugador).

**Edición por el dueño**

- **FR-009**: Solo el dueño de un caballo MUST poder cambiarle el nombre (1 a 16 caracteres tras
  recortar espacios; letras, incluidas tildes y ñ, números, espacios y guiones) y el número
  (entero de 1 a 99).
- **FR-010**: Nombre y número MUST ser únicos entre los 6 caballos (el nombre sin distinguir
  mayúsculas); un cambio que repita otro caballo MUST rechazarse.
- **FR-011**: El dueño MUST NOT poder cambiar el pelaje ni los colores de manta y jinete.

**Edición por el host** (modifica la feature 002, FR-012, FR-015 y FR-017)

- **FR-012**: El host MUST poder editar nombre, número, color de manta y pelaje de cualquier
  caballo, tenga o no dueño, con las mismas reglas de nombre y número de FR-009 y FR-010 y las de
  color de la feature 002 (FR-013). El límite de nombre pasa de 14 a 16 caracteres para todos.
- **FR-013**: La ventana para editar del host MUST ser la misma de FR-006 (fuera de la carrera).
- **FR-014**: "Restablecer caballos" MUST devolver nombre, número (1–6), color de manta y pelaje
  por defecto de la feature 001, y MUST conservar los dueños.
- **FR-015**: Cada carril (1–6) MUST seguir identificando al caballo internamente; el número
  visible es un atributo editable. El historial de resultados MUST seguir identificando al
  caballo por carril y mostrar el nombre y número vigentes.

**Ganancia del dueño** (modifica la feature 001, FR-019 a FR-022)

- **FR-016**: Si el caballo ganador tiene dueño, el dueño MUST recibir floor(pozo × 10 ÷ 100)
  monedas, donde el pozo es el de la feature 001 (apuestas de la ronda más el pozo acumulado). El
  resto MUST repartirse entre las apuestas ganadoras con la regla de la feature 001 (FR-020),
  aplicada sobre ese resto, de modo que parte del dueño + pagos = pozo exactamente.
- **FR-017**: Si el ganador no tiene dueño, el 100 % del pozo MUST repartirse entre los
  apostadores, como en la feature 001.
- **FR-018**: Si nadie apostó al ganador y tiene dueño, el dueño MUST recibir su parte y el resto
  MUST pasar al pozo acumulado; sin dueño, el pozo completo pasa al acumulado como hoy.
- **FR-019**: El dueño MUST cobrar su parte también si apostó a su propio caballo; la parte del
  dueño y el pago de su apuesta MUST registrarse como movimientos distintos.
- **FR-020**: El multiplicador en vivo de un caballo con dueño MUST ser (pozo − parte del dueño) ÷
  total apostado a ese caballo, calculado con la misma regla que la liquidación; MUST
  recalcularse en vivo ante cada apuesta, cambio, compra o eliminación de un dueño.
- **FR-021**: Ser dueño MUST NOT dar puntos; el puntaje sigue siendo +1 por apuesta acertada.
- **FR-022**: Los dueños se fijan al cerrarse las apuestas (al iniciar la carrera): la parte del
  dueño MUST pagarse a quien era dueño del ganador en ese momento.

**Vista del jugador** (amplía la feature 001, FR-024 a FR-029)

- **FR-023**: La vista del jugador MUST ofrecer una sección "Caballos" con los 6 caballos: nombre,
  número, color de manta, pelaje, dueño (nombre del jugador, "tú" o "establo") y precio (30 sin
  dueño, 50 si es de otro; sin precio si es propio), con botón "Comprar" cuando corresponda. El
  botón MUST deshabilitarse con una carrera en curso o si el saldo no alcanza, indicando el motivo.
- **FR-024**: En sus caballos propios, el jugador MUST poder editar nombre y número y ver cuántas
  monedas le ha generado cada uno como dueño (suma de sus partes de dueño cobradas con ese
  caballo mientras fue suyo, en todas sus etapas como dueño).
- **FR-025**: Como excepción a la feature 001 (FR-029), la vista del jugador MUST mostrar el
  nombre del dueño de cada caballo; los demás datos de otros jugadores siguen ocultos.
- **FR-026**: La sección "Caballos" MUST funcionar desde 320 px de ancho y actualizarse en vivo
  (dueños, precios, nombres y números) en menos de 1 segundo.
- **FR-027**: Los nombres y números personalizados MUST verse en todas las pantallas del jugador
  donde aparecen caballos (apuesta, carrera, resultado).

**Vista del host**

- **FR-028**: La pista 3D MUST mostrar en cada manta el número personalizado, de 1 o 2 cifras,
  legible con las mismas reglas de la feature 001 (FR-030b).
- **FR-029**: Los paneles de apuestas, carrera y resultado MUST mostrar nombre, número y dueño de
  cada caballo.
- **FR-030**: El resultado de la carrera MUST mostrar, si el ganador tiene dueño, quién es y
  cuántas monedas recibió.
- **FR-031**: La pestaña "Admin" MUST mostrar el historial de compras: fecha, caballo (nombre y
  número en el momento de la compra), comprador, vendedor (jugador o "establo") y precio, de la
  más reciente a la más antigua.

**Persistencia y auditoría**

- **FR-032**: El dueño actual, nombre y número de cada caballo y el historial de compras MUST
  persistir tras reiniciar el sistema.
- **FR-033**: Todo movimiento de monedas de esta feature (compra al establo, compra a jugador,
  parte del dueño) MUST registrarse en el libro de movimientos con actor, motivo, importe, ronda
  y fecha, de modo que el saldo de cada jugador siga reconstruyéndose desde el libro.
- **FR-034**: Si el host elimina a un jugador (feature 002), sus caballos MUST quedar sin dueño
  conservando nombre y número; el historial de compras MUST conservarse, anonimizado como
  "(eliminado)".
- **FR-035**: Toda compra y edición MUST validarse en el servidor (rol, dueño, fase, saldo, precio
  vigente, unicidad y rangos), nunca solo en la vista.

### Key Entities

- **Caballo**: uno de los 6 carriles fijos (1–6), con nombre, número visible (1–99), color de
  manta, pelaje y dueño opcional; sin estadísticas propias.
- **Dueño**: el jugador que posee un caballo; puede tener varios; acumula, por caballo, lo que ese
  caballo le ha generado.
- **Compra de caballo**: registro inmutable con fecha, caballo (carril, nombre y número en ese
  momento), comprador, vendedor (jugador o establo), precio y ronda.
- **Parte del dueño**: pago de floor(10 % del pozo) al dueño del ganador en una liquidación;
  queda en el libro de movimientos y en el resultado de la carrera.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un jugador compra un caballo en menos de 10 segundos desde que abre "Caballos".
- **SC-002**: Compras y ediciones se reflejan en todas las pantallas conectadas (host y celulares)
  en menos de 1 segundo.
- **SC-003**: En el 100 % de las compras y liquidaciones, la suma de saldos, apuestas activas y
  pozo acumulado no cambia (solo los ajustes de saldo del host la cambian).
- **SC-004**: En el 100 % de las liquidaciones, parte del dueño + pagos (o + lo que pasa al
  acumulado) es exactamente igual al pozo, y el pago final coincide con el multiplicador
  mostrado si el pozo no cambió.
- **SC-005**: Con la misma semilla, el 100 % de las carreras dan el mismo resultado con o sin
  dueños y nombres o números personalizados.
- **SC-006**: Ninguna compra o edición se acepta durante una carrera en curso.

## Assumptions

- Los precios (30 y 50) y el porcentaje del dueño (10 %) son fijos; no se configuran.
- "Saldo disponible" es el de la feature 001: saldo actual sin contar la apuesta activa, que ya
  fue descontada.
- Lo que un caballo "le ha generado" al dueño cuenta solo la parte de dueño, no los pagos de sus
  propias apuestas ni lo que recibió al vender el caballo.
- La parte del dueño no suma puntos ni afecta al leaderboard salvo por las monedas (que sí se
  usan como desempate, igual que cualquier otro cobro).
- El color del jinete es fijo por caballo y deriva del color de manta como hasta ahora; el host
  lo cambia indirectamente al cambiar el color de manta.
- Las compras durante la fase de apuestas cambian el pozo acumulado y, por tanto, los
  multiplicadores de apuestas ya hechas; eso es aceptable porque los multiplicadores son en vivo
  y se congelan al iniciar la carrera.
- Las ediciones del host quedan en el registro de administración de la feature 002; las del dueño
  se registran igual, con el jugador como autor.
- No hay venta al establo ni forma de renunciar a un caballo; solo cambia de dueño por compra o
  por eliminación de la cuenta del dueño.
