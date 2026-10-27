<!--
Sync Impact Report
- Version change: 2.0.1 → 2.1.0 (MINOR: ampliación material por caballos con dueño)
- Principios modificados:
  X. Apuestas por Pozo Común (Parimutuel): si el ganador tiene dueño, el dueño recibe el
     10 % del pozo (floor) y el resto va por parimutuel a los acertantes; sin dueño, 100 % a
     los apostadores. Sigue sin comisión de la casa.
  XI. Transparencia de Apuestas en Tiempo Real: los multiplicadores en vivo ya descuentan la
     parte del dueño.
  XII. Conservación de Monedas: la compra de caballos solo transfiere monedas entre cuentas
     existentes (jugador → pozo acumulado, jugador → jugador); compras y parte del dueño se
     registran en el libro de movimientos.
- Principios sin cambios: I–IX, XIII
- Secciones modificadas: Flujo de Desarrollo y Puertas de Calidad (tests de parte del dueño
  y conservación en compras)
- Secciones añadidas/eliminadas: ninguna
- Impacto en artefactos: lógica de pagos (función pura de liquidación y pago potencial) y
  sus tests deberán actualizarse en la feature que introduzca dueños de caballos.
- Decisión por defecto a confirmar: si gana un caballo con dueño y nadie le apostó, el dueño
  cobra su 10 % y el 90 % restante se acumula para la siguiente ronda.
- TODOs diferidos: ninguno
-->

# GuanchoTrack Constitution

## Core Principles

### I. Simplicidad Primero

- La infraestructura MUST ser la mínima posible: un único proceso servidor que sirve la app
  web y gestiona el tiempo real.
- La persistencia MUST usar una base de datos embebida y liviana (p. ej. SQLite) dentro del
  mismo proceso. Prohibido depender de servicios externos (bases de datos gestionadas, colas,
  caches remotas, APIs de terceros, CDNs).
- Toda dependencia o capa de abstracción nueva MUST justificarse por escrito en el plan de la
  feature; ante la duda, YAGNI.

**Rationale**: una app para jugar en grupo debe poder levantarse con un solo comando y sin
coste operativo.

### II. Equidad Verificable

- Todos los caballos MUST tener exactamente las mismas estadísticas base. Ninguna mecánica
  puede otorgar ventaja persistente a un caballo concreto.
- Toda aleatoriedad (resultado de carrera, eventos, variaciones) MUST generarse únicamente en
  el servidor mediante un PRNG con semilla. El cliente NUNCA genera aleatoriedad que afecte al
  juego.
- La semilla de cada carrera MUST registrarse para que el resultado pueda reproducirse y
  auditarse a posteriori.

**Rationale**: los jugadores apuestan entre sí; la confianza exige que el resultado sea justo
y comprobable.

### III. El Servidor es la Fuente de Verdad

- Estado de carrera, sesiones, apuestas, saldos y puntajes MUST calcularse y validarse en el
  servidor.
- El cliente solo envía intenciones (unirse, apostar, listo) y renderiza el estado recibido.
  Toda entrada del cliente MUST validarse en el servidor (saldo suficiente, fase de juego
  correcta, valores en rango) antes de aplicarse.
- El cliente NUNCA calcula ni persiste resultados, pagos o saldos autoritativos.

**Rationale**: evita trampas y estados divergentes entre jugadores.

### IV. Tiempo Real Sincronizado

- Todos los clientes de una sesión MUST ver el mismo estado de carrera con latencia mínima,
  usando un canal persistente bidireccional (p. ej. WebSocket).
- El servidor MUST difundir el estado (o la semilla y eventos necesarios para reconstruirlo
  de forma determinista) para que todos los clientes converjan al mismo resultado.
- El cliente puede interpolar visualmente, pero la interpolación NUNCA altera el resultado.
- Los clientes que se reconectan MUST recibir el estado actual completo.

**Rationale**: la experiencia es grupal y simultánea; ver carreras distintas la rompe.

### V. Solo Monedas Ficticias

- Todo saldo y apuesta MUST usar monedas ficticias sin valor monetario.
- Prohibido integrar pagos, compras, retiros, canje o cualquier conversión a dinero real o
  bienes con valor.

**Rationale**: el juego es entretenimiento social, no apuestas reales; evita riesgos legales
y éticos.

### VI. Sin Assets Externos

- Todo lo visual en 3D (caballos, pista, escenario, efectos) MUST generarse por código
  (geometría procedural, materiales de color plano).
- Prohibido cargar modelos, texturas, imágenes o fuentes desde ficheros externos o URLs de
  terceros. Iconografía y tipografía MUST resolverse con código o fuentes del sistema.

**Rationale**: mantiene el proyecto autocontenido, liviano y coherente con la estética.

### VII. Identidad Visual PICO-8 (Estricta)

- Toda la UI y la escena 3D MUST usar exclusivamente la paleta PICO-8 de 16 colores, debe haber un archivo para definir los tokens de color y no se permite usar colores fuera de esta paleta. Los colores default son:
  `#000000`, `#1D2B53`, `#7E2553`, `#008751`, `#AB5236`, `#5F574F`, `#C2C3C7`, `#FFF1E8`,
  `#FF004D`, `#FFA300`, `#FFEC27`, `#00E436`, `#29ADFF`, `#83769C`, `#FF77A8`, `#FFCCAA`.
- Los colores MUST definirse una sola vez como tokens en un único módulo fuente, compartido
  por CSS y por la escena 3D. Ningún otro fichero puede declarar literales de color.
- Prohibido cualquier valor fuera de la paleta, incluidos degradados, transparencias que
  generen colores nuevos en UI, o iluminación/sombreado 3D que produzca tonos fuera de paleta
  (usar materiales sin iluminación o cuantizados a la paleta).

**Rationale**: identidad visual reconocible y verificable automáticamente.

### VIII. Testeabilidad Determinista (NO NEGOCIABLE)

- La lógica de carrera, pagos y ranking MUST implementarse como funciones puras: mismas
  entradas y misma semilla producen siempre la misma salida, sin E/S, reloj ni estado global.
- Esta lógica MUST tener tests unitarios obligatorios, incluyendo casos de semilla fija con
  resultado esperado, conservación de monedas en los pagos y desempates de ranking.
- Ningún cambio en estos módulos se integra sin tests que lo cubran y pasen.

**Rationale**: el determinismo hace posible la equidad verificable (II) y la sincronización
(IV); los tests la garantizan.

### IX. UI Clara y Responsive

- La vista del host MUST estar diseñada para proyectarse en pantalla grande: carrera 3D
  protagonista, texto legible a distancia, información esencial (posiciones, apuestas,
  ranking) siempre visible.
- La vista de jugador MUST funcionar en celular (desde ~360 px de ancho), con controles
  táctiles grandes y el flujo unirse → apostar → ver resultado sin scroll horizontal.
- Cada pantalla muestra solo la información necesaria para la fase actual del juego.

**Rationale**: el juego se vive en grupo, con una pantalla compartida y un celular por
jugador.

### X. Apuestas por Pozo Común (Parimutuel)

- Todas las apuestas de una ronda, más el pozo acumulado de rondas anteriores, MUST formar
  un único pozo común. El pago por moneda de cada
  caballo depende de cuánto se apostó a él respecto del total del pozo: cuanto más se apuesta
  a un caballo, menor es su pago por moneda.
- La casa NUNCA retiene comisión: todo el pozo MUST repartirse entre jugadores.
- Si el caballo ganador tiene dueño, el dueño MUST recibir exactamente
  `floor(pozo × 10 / 100)` monedas, y el resto del pozo MUST repartirse entre las apuestas
  ganadoras en proporción a lo apostado por cada una. Si el ganador no tiene dueño, el 100 %
  del pozo MUST repartirse entre las apuestas ganadoras.
- Como la moneda es entera, el reparto MUST usar una regla de redondeo determinista y
  documentada que asigne el resto sobrante a ganadores, de modo que la parte del dueño más
  la suma de pagos sea exactamente igual al pozo.
- Si ninguna apuesta acierta al ganador, la parte del pozo destinada a apostadores MUST
  acumularse para la siguiente ronda liquidada; nunca se pierde ni se asigna a la casa. La
  parte del dueño, si lo hay, se le paga igualmente.

**Rationale**: los jugadores compiten entre sí, no contra la casa; el pago refleja el
consenso del grupo, y tener un caballo da un incentivo acotado y predecible.

### XI. Transparencia de Apuestas en Tiempo Real

- Durante la fase de apuestas, el servidor MUST recalcular y difundir en vivo el total en
  juego y el pago potencial por moneda de cada caballo ante cada apuesta nueva, modificada o
  cancelada.
- El pago potencial mostrado MUST calcularse con la misma función pura que liquida la carrera,
  de forma que coincida exactamente con el pago final si el pozo no cambia.
- Los multiplicadores mostrados en vivo MUST descontar ya la parte del dueño de cada caballo
  que lo tenga; nunca se muestra un pago que la liquidación no vaya a abonar.
- Al cerrarse la fase de apuestas, los pagos potenciales quedan congelados y son los que se
  liquidan.

**Rationale**: cada jugador decide con información completa y verificable.

### XII. Conservación de Monedas

- Ninguna operación puede crear ni destruir monedas (MUST NOT), salvo los ajustes explícitos
  del host. La suma de saldos de jugadores, apuestas activas y pozo acumulado MUST ser
  invariante ante apuestas, cambios, devoluciones, liquidaciones, compras de caballos y
  reinicios.
- La compra de caballos MUST limitarse a transferir monedas entre cuentas existentes
  (jugador → pozo acumulado, o jugador → jugador); nunca crea ni destruye monedas.
- Todo movimiento de saldo (apuesta, modificación, devolución, pago, parte del dueño,
  compra de caballo, ajuste del host, entrada o salida del pozo acumulado) MUST
  registrarse en un libro de movimientos persistente, solo de inserción, con actor, motivo,
  importe, ronda y fecha.
- El saldo de cada jugador MUST poder reconstruirse a partir del libro de movimientos.

**Rationale**: la economía del juego es auditable y cualquier discrepancia es detectable.

### XIII. Control Total del Host

- El host MUST poder editar el saldo de cualquier jugador, reiniciar la ronda de apuestas y
  reiniciar la carrera en curso.
- Reiniciar la ronda de apuestas MUST devolver íntegramente a cada jugador las monedas
  apostadas en ella, registrando cada devolución en el libro de movimientos; el pozo
  acumulado se conserva.
- Reiniciar la carrera en curso MUST conservar las apuestas activas sin pérdida (ninguna
  moneda se devuelve, se pierde ni se liquida), anular el resultado de esa carrera y volver a
  la fase de apuestas.
- Las acciones de host MUST validarse en el servidor (solo el host de la sesión puede
  ejecutarlas) y quedar registradas; los ajustes de saldo constan como tales en el libro.

**Rationale**: quien organiza la partida necesita corregir errores y gestionar el grupo sin
romper la conservación de monedas.

## Restricciones Técnicas

- Aplicación web: cliente en navegador y un servidor único; sin apps nativas.
- Persistencia: base de datos embebida en el proceso servidor; sin servicios externos.
- Tiempo real: canal persistente bidireccional entre servidor y clientes.
- Render 3D: librería WebGL ejecutada en el cliente, con geometría y materiales generados por
  código y colores tomados solo de los tokens de paleta.
- Aleatoriedad: PRNG con semilla, ejecutado solo en el servidor.
- Moneda: unidad ficticia entera (sin decimales) para evitar errores de redondeo en pagos.
- Libro de movimientos: tabla de solo inserción en la base de datos embebida; los saldos son
  derivables de ella.

## Flujo de Desarrollo y Puertas de Calidad

- Cada feature sigue el flujo Spec Kit: specify → plan → tasks → implement.
- El plan de cada feature MUST incluir una verificación explícita contra los principios
  I–XIII; cualquier desviación se documenta y justifica en la sección de complejidad.
- Puertas obligatorias antes de integrar:
  - Tests unitarios de lógica de carrera, pagos y ranking en verde, incluyendo: reparto
    parimutuel sin comisión, parte del dueño (10 % redondeado hacia abajo, y 0 sin dueño),
    regla de redondeo, caso sin ganadores con acumulación del pozo, igualdad entre pago
    potencial y pago final, y conservación de monedas en apuestas, pagos, compras de
    caballos y reinicios.
  - Comprobación automática de que no existen literales de color fuera del módulo de tokens
    ni valores fuera de la paleta PICO-8.
  - Comprobación de que no se cargan assets externos (modelos, texturas, imágenes, fuentes).
  - Revisión de que toda acción de cliente se valida en el servidor.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica o preferencia del proyecto.
- Enmiendas: se proponen por escrito con motivación e impacto, se registran en este fichero
  con un Sync Impact Report y, si afectan a código existente, con un plan de migración.
- Versionado semántico de la constitución:
  - MAJOR: eliminación o redefinición incompatible de un principio.
  - MINOR: principio o sección nuevos, o ampliación material de una guía.
  - PATCH: aclaraciones y correcciones de redacción sin cambio semántico.
- Cumplimiento: toda revisión de spec, plan y código MUST verificar conformidad con estos
  principios; la complejidad añadida MUST justificarse.

**Version**: 2.1.0 | **Ratified**: 2026-10-24 | **Last Amended**: 2026-10-26
