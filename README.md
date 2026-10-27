# GuanchoTrack

Carreras de caballos 3D para jugar en grupo en la red local: un host proyecta la carrera en una
pantalla grande y cada jugador apuesta monedas ficticias desde su celular (pozo común, sin
comisión).

## Requisitos

- Node.js ≥ 20 y npm.
- Un computador conectado a la pantalla grande y los celulares en la **misma red local**.

## Puesta en marcha

```bash
npm install
npm run dev
```

Un solo proceso sirve la app y el tiempo real en el puerto 3000 (`PORT` para cambiarlo). Al
arrancar imprime las URLs de la red local, por ejemplo `http://192.168.1.20:3000`: ábrela en
el computador del host y en los celulares.

Credenciales del host (por defecto `hosttt` / `1231`, con un aviso en consola):

```bash
HOST_USER=juan HOST_PASSWORD=secreto npm run dev
```

Cualquier otro usuario se registra solo al entrar por primera vez, como jugador con 0 monedas;
el host le carga saldo desde su pantalla.

Los datos se guardan en `data/guanchotrack.db` (SQLite; `DB_PATH` para cambiarlo).

Producción local:

```bash
npm run build
npm start
```

## Pestaña Admin

La pantalla del host tiene dos pestañas: **Juego** (la que se proyecta) y **Admin**.

- **Participantes**: solo los activos aparecen en el leaderboard; un inactivo sigue apostando y
  cobrando. Desde cada fila se puede renombrar, poner una contraseña nueva (cierra sus sesiones),
  ajustar el saldo o eliminar la cuenta (no si tiene una apuesta activa): sus monedas pasan al
  pozo acumulado y su nombre queda libre.
- **Caballos**: nombre, número (1–99), color de manta y pelaje de los 6 caballos, tengan o no
  dueño, en cualquier momento salvo durante la carrera. Es solo visual: con la misma semilla la
  carrera da el mismo resultado. "Restablecer caballos" vuelve a los valores por defecto y
  conserva los dueños.
- **Compras de caballos**: historial con fecha, caballo, comprador, vendedor y precio.

Cada acción queda registrada en la tabla `admin_log`.

## Propiedad de caballos

En la sección **Caballos** del celular cada jugador ve los 6 caballos con su dueño y precio:

- Un caballo del establo cuesta **30** monedas, que van al pozo acumulado. Uno de otro jugador
  cuesta **50**, que van íntegras al dueño anterior (no tiene que aceptar). Se puede tener varios.
- Comprar y editar se puede siempre salvo durante la carrera, y solo con saldo suficiente.
- El dueño cambia el nombre (1–16 caracteres) y el número (1–99) de sus caballos; pelaje y
  colores no. Al cambiar de dueño el caballo conserva nombre y número.
- Si gana un caballo con dueño, el dueño recibe el **10 % del pozo** (redondeado hacia abajo) y
  el resto se reparte entre los acertantes; si nadie acertó, el resto pasa al acumulado. Los
  multiplicadores en vivo ya descuentan esa parte. Ser dueño no da puntos.
- Cada caballo propio muestra cuánto le ha generado a su dueño.

## Tests

```bash
npm test
```

Incluye la lógica pura (carrera, pagos, ranking), la integración servidor + Socket.IO y las
puertas de paleta PICO-8 y de assets externos.

## Más

- Validación paso a paso: [specs/001-group-horse-racing/quickstart.md](specs/001-group-horse-racing/quickstart.md)
- Especificación y plan: [specs/001-group-horse-racing/](specs/001-group-horse-racing/)
- Pestaña Admin: [specs/002-host-admin-panel/](specs/002-host-admin-panel/) (validación en
  [quickstart.md](specs/002-host-admin-panel/quickstart.md))
- Propiedad de caballos: [specs/003-horse-ownership/](specs/003-horse-ownership/) (validación en
  [quickstart.md](specs/003-horse-ownership/quickstart.md))
