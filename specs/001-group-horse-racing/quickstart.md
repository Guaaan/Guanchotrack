# Quickstart: validar GuanchoTrack

**Feature**: [spec.md](./spec.md) | **Contracts**: [contracts/](./contracts/) |
**Data model**: [data-model.md](./data-model.md)

## Requisitos

- Node.js ≥ 20 y npm.
- Un computador conectado a una pantalla grande y celulares en la **misma red local**.

## Arranque

```bash
npm install
npm run dev                      # un solo proceso: servidor + frontend en 0.0.0.0:3000
# opcional: HOST_USER=juan HOST_PASSWORD=secreto npm run dev
```

Salida esperada en consola:

- Advertencia si se usan las credenciales de host por defecto (`hosttt` / `1231`).
- URLs de acceso, p. ej. `http://192.168.1.20:3000`.

## Tests automáticos

```bash
npm test
```

Debe pasar todo, incluyendo:

| Suite | Prueba |
|-------|--------|
| `race` | misma semilla ⇒ misma carrera; photo finish con semilla conocida; 40 casillas |
| `payouts` | ejemplos de la spec (pozo 60, 2×; todos al mismo caballo 1×; acumulado 60 + 40 ⇒ 5×; 100 entre 3 ⇒ 34/33/33); nadie acierta ⇒ acumula; Σpagos = pozo |
| `ranking` | orden por puntaje, saldo, nombre; primero/último |
| `race-duration` | SC-007: en Normal ≥ 90 % de carreras entre 45 y 90 s; Rápida y Turbo, la mitad y la cuarta parte |
| `horses` / `motion` | velocidades y pelajes por número; cadencia del galope y movimiento sin saltos |
| `format` | multiplicador `2,35×` y miles con punto |
| `auth` | autocreación; contraseña incorrecta; nombre inválido; host por env; límite de intentos |
| `round-flow` | ronda completa, cambios de apuesta, pagos y acumulado; invariante de [data-model.md](./data-model.md#invariante-de-conservación-principio-xii) tras cada paso |
| `live-updates` / `sync-load` | actualizaciones < 1 s, privacidad del jugador, "apostaron/faltan"; 20 jugadores sincronizados |
| `host-permissions` | cada `host:*` desde jugador ⇒ "No autorizado" sin efectos |
| `resets` | reiniciar ronda y carrera conservando monedas y acumulado |
| `race-speed` | velocidad solo del host y antes de iniciar; misma semilla ⇒ mismo resultado; photo finish con empatados y orden |
| `leaderboard` | orden por aciertos, monedas y nombre; sin el host; conectados |
| `recovery` | servidor reiniciado en `racing` ⇒ `betting` con apuestas intactas |
| `palette` / `assets` | sin colores fuera de `src/palette.ts`; sin assets externos |

## Validación manual (end-to-end)

1. **Login y host** (US2): abrir la URL en el computador, entrar con `hosttt` / `1231` ⇒ vista
   de host con la pista 3D y los 6 caballos de colores. Recargar ⇒ sigue dentro.
2. **Jugadores** (US2): en 3 celulares entrar como `ana`, `beto`, `caro` (cuentas nuevas) ⇒
   vista de jugador con 0 monedas. Probar `ana` con otra contraseña ⇒ error.
3. **Saldos** (US5): en el host, sumar 100 a cada jugador ⇒ cada celular muestra 100 al instante.
   Intentar restar 200 a `ana` ⇒ rechazado.
4. **Apuestas en vivo** (US1, US3): abrir ronda. `ana` apuesta 30 al 1, `beto` 10 al 2, `caro` 20
   al 2 ⇒ host muestra pozo 60, multiplicadores 2,00× en 1 y 2, pagos 60/20/40, "faltan" vacío.
   Cada celular ve su caballo, monto y "recibirías". `beto` cambia a 20 ⇒ todo se recalcula en
   menos de 1 s.
5. **Carrera** (US1, US4, US4b): elegir velocidad (Normal, Rápida o Turbo) e iniciar carrera ⇒
   celulares muestran "carrera en curso, mira la pantalla"; los caballos galopan sin parar con su
   pelaje, la cámara sigue al líder y el leaderboard de carrera se reordena. En Normal dura ~1
   minuto; en Rápida ~30 s; en Turbo ~15 s.
6. **Resultado** (US1): host muestra ganador, acertantes y pagos; celulares muestran
   ganó/perdió y saldo nuevo; el leaderboard general suma +1 a los acertantes. Los pagos
   coinciden con los "recibirías" del paso 4.
7. **Reinicios** (US5): abrir ronda, apostar, reiniciar ronda ⇒ saldos restaurados. Apostar,
   iniciar carrera y reiniciarla ⇒ caballos en la salida, fase de apuestas con apuestas intactas.
8. **Nadie acierta** (US1): forzar con una sola apuesta a un caballo y repetir hasta que gane
   otro ⇒ el host muestra "pasa al acumulado" y la siguiente ronda muestra "incluye N acumulado".
9. **Reconexión**: apagar el wifi de un celular ⇒ overlay "Reconectando..."; al volver, estado al
   día. Detener y relanzar el servidor durante una carrera ⇒ vuelve a fase de apuestas.
10. **Paleta y responsive**: inspeccionar visualmente que no hay colores fuera de PICO-8;
    vista de jugador sin scroll horizontal a 360 px.
