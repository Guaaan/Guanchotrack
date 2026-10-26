# Feature Specification: Panel de administración del host

**Feature Branch**: `002-host-admin-panel`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "vamos a hacer que cada caballo sea personalizable por el host en una pestaña admin, ahí también se podrán escoger los participantes activos que son los que irán a ladderboard, editarse, eliminarse y así"

**Contexto**: amplía la feature [001-group-horse-racing](../001-group-horse-racing/spec.md). Hoy los 6
caballos tienen nombre, color y pelaje fijos, y todos los jugadores registrados aparecen en el
leaderboard general sin que el host pueda gestionarlos.

## Clarifications

### Session 2026-10-25

- Q: ¿Qué significa que un jugador esté "inactivo"? → A: Solo sale del leaderboard general;
  puede seguir entrando, apostando y cobrando como cualquier jugador.
- Q: ¿Qué pasa con las monedas y el historial de un jugador eliminado? → A: Al eliminarlo, su
  saldo pasa automáticamente al pozo acumulado (queda en juego para la próxima ronda que se
  liquide); su historial se conserva, anonimizado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gestionar participantes: activos, edición y eliminación (Priority: P1)

El host abre la pestaña "Admin" de su pantalla y ve la lista de todos los jugadores registrados
con su puntaje, sus monedas, si están conectados y si están activos. Marca quiénes son
participantes activos de la partida: solo ellos aparecen en el leaderboard general. Puede editar
a un jugador (cambiar su nombre de usuario o restablecer su contraseña) y eliminar cuentas que ya
no se usan: sus monedas pasan al pozo acumulado, así que no se pierden ni se crean monedas.

**Why this priority**: es lo que más se necesita al jugar con grupos que cambian: hoy el
leaderboard se llena de cuentas de prueba o de gente que ya no juega y el host no puede
limpiarlo.

**Independent Test**: con 5 jugadores registrados (uno con monedas, uno con apuesta activa),
marcar 3 como activos y comprobar el leaderboard; renombrar uno y restablecer la contraseña de
otro; intentar eliminar al que tiene apuesta activa y eliminar a uno sin monedas.

**Acceptance Scenarios**:

1. **Given** 5 jugadores registrados y todos activos, **When** el host desmarca a 2 como
   participantes activos, **Then** el leaderboard general del host muestra solo a los 3 activos,
   con el mismo orden y desempates de siempre.
2. **Given** un jugador desmarcado como activo, **When** el host lo vuelve a marcar, **Then**
   reaparece en el leaderboard con su puntaje y monedas intactos.
3. **Given** un jugador nuevo que se registra por primera vez, **When** el host mira la lista,
   **Then** el jugador aparece como participante activo.
4. **Given** el jugador "ana", **When** el host la renombra a "anita", **Then** "ana" ya no puede
   entrar, "anita" entra con la misma contraseña y conserva saldo, puntaje e historial; y si ya
   existe otra cuenta "Anita" (sin distinguir mayúsculas), el cambio se rechaza.
5. **Given** el jugador "beto" que olvidó su contraseña, **When** el host le asigna una nueva,
   **Then** "beto" entra con la nueva, la anterior deja de servir y sus sesiones abiertas se
   cierran.
6. **Given** un jugador con una apuesta activa en la ronda actual, **When** el host intenta
   eliminarlo, **Then** la eliminación se rechaza con un mensaje que explica el motivo.
7. **Given** un jugador sin apuesta activa con 80 monedas y un pozo acumulado de 20, **When** el
   host lo elimina y confirma, **Then** desaparece de la lista y del leaderboard, no puede volver
   a entrar con esa cuenta, sus sesiones abiertas se cierran, el pozo acumulado pasa a 100 y la
   suma total de monedas no cambia.
8. **Given** un jugador inactivo, **When** entra y apuesta, **Then** puede hacerlo con normalidad
   y cobra si acierta, pero no aparece en el leaderboard general.
9. **Given** un jugador sin rol de host, **When** intenta cualquiera de estas acciones, **Then**
   el sistema la rechaza.

---

### User Story 2 - Personalizar los caballos (Priority: P2)

En la pestaña "Admin", el host ve los 6 caballos y puede cambiar el nombre, el color y el pelaje
de cada uno, eligiendo solo entre los colores de la paleta del juego y los pelajes disponibles.
Los cambios se ven en la pista 3D, en los paneles del host y en los celulares de los jugadores.
Las estadísticas de los caballos no cambian: siguen siendo idénticas.

**Why this priority**: da identidad a cada partida (nombres de la oficina, colores del grupo),
pero el juego funciona sin ello.

**Independent Test**: con el juego en espera, renombrar el caballo 3 a "Relámpago", cambiar su
color a lavanda (libre) y su pelaje a pinto; intentar ponerle azul, que ya usa el caballo 5, y
ver que se rechaza; comprobar la pista 3D, el panel de apuestas y un celular, y correr una carrera para verificar que el resultado no depende de la personalización.

**Acceptance Scenarios**:

1. **Given** el juego en espera o con la ronda terminada, **When** el host cambia el nombre del
   caballo 3 a "Relámpago", **Then** la pista, los paneles del host y los celulares muestran
   "Relámpago" con el número 3.
2. **Given** el caballo 1 rojo y el caballo 2 naranjo, **When** el host intenta poner rojo al
   caballo 2, **Then** el cambio se rechaza porque dos caballos no pueden compartir color.
3. **Given** el editor de un caballo, **When** el host elige su color, **Then** solo puede elegir
   entre los colores de la paleta del juego permitidos para mantas, y el número del caballo se
   muestra en blanco o negro según el que contraste mejor.
4. **Given** una ronda en fase de apuestas o una carrera en curso, **When** el host intenta
   modificar un caballo, **Then** el cambio se rechaza hasta que la ronda termine.
5. **Given** caballos personalizados, **When** se corre una carrera con una semilla conocida,
   **Then** el ganador y el orden son los mismos que con los caballos por defecto.
6. **Given** caballos personalizados, **When** el host pulsa "Restablecer caballos", **Then**
   vuelven los nombres, colores y pelajes por defecto.
7. **Given** caballos personalizados, **When** se reinicia el servidor, **Then** la
   personalización se conserva.

---

### User Story 3 - Pestañas "Juego" y "Admin" en la pantalla del host (Priority: P3)

La pantalla del host se organiza en dos pestañas: "Juego" (la carrera 3D, los paneles y los
controles de siempre) y "Admin" (participantes y caballos). Cambiar de pestaña no interrumpe la
partida ni la sincronización.

**Why this priority**: es el contenedor de las dos historias anteriores; sin él, las funciones de
administración podrían vivir en un panel aparte, pero quedarían mezcladas con la vista que se
proyecta.

**Independent Test**: con una carrera en curso, pasar a "Admin" y volver a "Juego": la carrera
sigue en su posición real y nada se reinicia.

**Acceptance Scenarios**:

1. **Given** la pantalla del host, **When** se abre, **Then** muestra la pestaña "Juego" por
   defecto.
2. **Given** una carrera en curso, **When** el host pasa a "Admin" y vuelve a "Juego", **Then** la
   carrera sigue sincronizada con el servidor y los paneles están al día.
3. **Given** la pestaña "Admin", **When** un jugador se conecta, apuesta o cambia su saldo,
   **Then** la lista de participantes se actualiza en vivo sin recargar.

---

### Edge Cases

- **Desactivar a un jugador con apuesta activa**: la apuesta sigue vigente y se liquida
  normalmente; deja de figurar en el leaderboard general (ver FR-007).
- **Jugador inactivo que acierta**: suma su punto y cobra normalmente; si se lo vuelve a activar,
  aparece en el leaderboard con todo lo ganado.
- **Eliminar durante la fase de apuestas**: el saldo del eliminado entra al pozo acumulado en ese
  momento, de modo que el pozo y los multiplicadores mostrados se recalculan en vivo.
- **Eliminar a un jugador con saldo 0**: no se mueve ninguna moneda; solo se elimina la cuenta.
- **Desactivar a todos**: el leaderboard general queda vacío con el mensaje "No hay participantes
  activos"; la partida sigue funcionando.
- **Renombrar a un nombre inválido o al del host**: se rechaza con las mismas reglas del registro
  (3–20 caracteres, letras, números, guion o guion bajo; único sin distinguir mayúsculas).
- **Renombrar a un jugador conectado**: su celular pasa a mostrar el nombre nuevo sin cerrar la
  sesión.
- **Eliminar al host o cambiarle el nombre desde la pestaña Admin**: no es posible; la cuenta del
  host no aparece en la lista de participantes.
- **Eliminar a un jugador conectado**: su celular vuelve a la pantalla de ingreso.
- **Registrar un nombre de una cuenta eliminada**: se permite crear una cuenta nueva con ese
  nombre, que empieza con 0 monedas y 0 puntos.
- **Nombre de caballo vacío, repetido o demasiado largo**: se rechaza; el nombre tiene entre 1 y
  14 caracteres y no puede repetirse entre caballos (sin distinguir mayúsculas).
- **Color de manta que no contrasta con la pista**: los colores permitidos para mantas excluyen
  los que se confunden con la tierra o el pasto de la pista.
- **Dos pantallas de host abiertas**: un cambio hecho en una se refleja en la otra en menos de
  1 segundo.

## Requirements *(mandatory)*

### Functional Requirements

**Pestaña de administración**

- **FR-001**: La pantalla del host MUST ofrecer dos pestañas, "Juego" (por defecto) y "Admin";
  cambiar de pestaña MUST NOT interrumpir la partida ni la sincronización en vivo.
- **FR-002**: Solo el host MUST poder ver la pestaña "Admin" y ejecutar sus acciones; el sistema
  MUST validar el rol en cada acción y rechazar cualquier intento de otro usuario.
- **FR-003**: Toda acción de administración (activar, desactivar, renombrar, restablecer
  contraseña, eliminar, personalizar o restablecer caballos) MUST quedar registrada con autor,
  acción, objetivo y fecha.

**Participantes**

- **FR-004**: La pestaña "Admin" MUST listar a todos los jugadores registrados (nunca al host)
  con nombre, puntaje, monedas, si están conectados y si son participantes activos, actualizada en
  vivo.
- **FR-005**: El host MUST poder marcar y desmarcar a cada jugador como participante activo; los
  jugadores nuevos MUST quedar activos al registrarse.
- **FR-006**: El leaderboard general (pantalla del host y posición propia en el celular) MUST
  incluir solo a los participantes activos, con el mismo orden y desempates de la feature 001.
  El total de jugadores de la posición propia MUST contar solo a los activos.
- **FR-007**: Un jugador inactivo MUST quedar fuera del leaderboard general y de la cuenta de
  "total de jugadores", pero MUST poder seguir entrando, apostando, cobrando y sumando puntos como
  cualquier jugador; su posición propia en el celular no se muestra mientras esté inactivo.
- **FR-008**: El host MUST poder renombrar a un jugador con las mismas reglas de nombre del
  registro; el jugador MUST conservar contraseña, saldo, puntaje, apuestas e historial, y sus
  sesiones abiertas MUST seguir válidas.
- **FR-009**: El host MUST poder asignar una contraseña nueva a un jugador; la anterior MUST dejar
  de servir y las sesiones abiertas de ese jugador MUST cerrarse.
- **FR-010**: El host MUST poder eliminar a un jugador sin apuesta activa, con una confirmación
  previa en dos pasos; con apuesta activa la eliminación MUST rechazarse. Al eliminarlo, todo su
  saldo MUST pasar al pozo acumulado en una sola operación registrada en el libro de movimientos
  (salida del jugador y entrada al pozo por el mismo importe). Tras eliminarlo, la cuenta MUST NOT
  poder iniciar sesión, sus sesiones MUST cerrarse y MUST desaparecer de la lista y del
  leaderboard. Su historial (apuestas y movimientos) MUST conservarse, anonimizado como
  "(eliminado)", y su nombre de usuario MUST quedar libre para un registro nuevo.
- **FR-011**: Ninguna acción de administración MUST crear ni destruir monedas (constitución,
  principio XII): eliminar a un jugador traslada su saldo al pozo acumulado y los ajustes de
  saldo siguen siendo los únicos que cambian el total.

**Caballos**

- **FR-012**: El host MUST poder personalizar cada uno de los 6 caballos: nombre (1–14
  caracteres, único entre caballos sin distinguir mayúsculas), color de manta y pelaje (castaño,
  pinto, tordo o palomino). El número de cada caballo (1–6) MUST NOT cambiar.
- **FR-013**: El color de manta MUST elegirse solo entre los colores de la paleta del juego
  permitidos para mantas (excluye los que se confunden con la pista, el pasto o el fondo), y dos
  caballos MUST NOT compartir color. El color del número (blanco o negro) MUST calcularse
  automáticamente según el contraste con la manta.
- **FR-014**: La personalización MUST ser solo visual: las estadísticas de los caballos MUST
  seguir siendo idénticas y, con la misma semilla, el resultado de la carrera MUST ser el mismo
  con o sin personalización.
- **FR-015**: Los caballos solo MUST poder modificarse con el juego en espera o con la ronda
  terminada; con una ronda en fase de apuestas o una carrera en curso el cambio MUST rechazarse.
- **FR-016**: Los cambios de caballos MUST verse en la pista 3D, en todos los paneles del host y
  en los celulares de los jugadores en menos de 1 segundo, y MUST persistir tras reiniciar el
  sistema.
- **FR-017**: El host MUST poder restablecer los 6 caballos a los valores por defecto de la
  feature 001 (1 Rojo, 2 Naranjo, 3 Amarillo, 4 Verde, 5 Azul, 6 Rosado, con sus pelajes) con
  una confirmación previa.
- **FR-018**: El historial de resultados MUST identificar a los caballos por número; los
  nombres mostrados en pantallas y resultados son los vigentes en cada momento.

### Key Entities

- **Participante**: un jugador registrado visto desde la administración; además de lo que ya
  tiene (nombre, contraseña, saldo, puntaje, sesiones), tiene un estado "activo" (aparece en el
  leaderboard) y puede quedar eliminado (su saldo va al pozo acumulado y su historial queda
  anonimizado).
- **Caballo personalizado**: uno de los 6 caballos fijos (número 1–6) con nombre, color de manta,
  color de número calculado y pelaje elegidos por el host; sin estadísticas propias.
- **Registro de administración**: entrada inmutable por cada acción del host en la pestaña Admin
  (autor, acción, objetivo, valores antes y después cuando aplique, fecha).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El host marca o desmarca a un participante, o renombra un caballo, en menos de 10
  segundos desde que abre la pestaña "Admin".
- **SC-002**: Los cambios de participantes y de caballos se reflejan en todas las pantallas
  conectadas (host y celulares) en menos de 1 segundo.
- **SC-003**: En el 100 % de las acciones de administración, incluidas las eliminaciones, la suma
  de saldos, apuestas activas y pozo acumulado no cambia (solo los ajustes de saldo del host la
  cambian).
- **SC-004**: Con la misma semilla, el 100 % de las carreras dan el mismo resultado con caballos
  personalizados que con los caballos por defecto.
- **SC-005**: Cambiar entre las pestañas "Juego" y "Admin" durante una carrera nunca reinicia ni
  desincroniza la carrera en la pantalla del host.

## Assumptions

- La cantidad de caballos sigue siendo 6, con números fijos del 1 al 6; no se agregan ni quitan
  caballos.
- Los colores de manta permitidos son los de la paleta del juego que no se confunden con la pista
  (tierra marrón), el pasto (verde oscuro) ni el fondo (azul oscuro); el resto de colores de la
  paleta queda disponible. Los pelajes son los 4 de la feature 001.
- El nombre del caballo admite letras (incluidas tildes y ñ), números, espacios y guiones.
- Restablecer la contraseña la fija el host en el momento (no hay correo ni recuperación por el
  propio jugador, que siguen fuera de alcance).
- La pestaña "Admin" se usa en la pantalla del host (computador); no hace falta que sea cómoda en
  celular.
- El ajuste de saldo existente (fijar, sumar, restar) se mantiene donde está y puede repetirse en
  la pestaña "Admin" junto a cada participante.
- Los participantes activos afectan solo al leaderboard y a la posición propia (FR-007); el
  pozo, las apuestas y la carrera no dependen de ese estado.
- La eliminación es definitiva: no hay papelera ni forma de recuperar una cuenta eliminada (sus
  monedas ya están en el pozo acumulado).
