# Contract: REST (solo autenticación)

Base: mismo origen que la app (`http://<ip-lan>:3000`). JSON. Cookie de sesión `gt_session`
(`HttpOnly; SameSite=Lax; Path=/`, sin `Max-Age`).

## POST /api/login

Request:

```json
{ "username": "ana", "password": "x1" }
```

| Caso | Status | Body | Cookie |
|------|--------|------|--------|
| Usuario nuevo válido | 200 | `{ "role": "player", "created": true }` | set |
| Usuario existente, contraseña correcta | 200 | `{ "role": "player" \| "host", "created": false }` | set |
| Contraseña incorrecta | 401 | `{ "error": "Contraseña incorrecta" }` | — |
| Nombre inválido (FR-007) o contraseña vacía | 400 | `{ "error": "<mensaje en español>" }` | — |

- `username` se compara sin distinguir mayúsculas; se guarda tal cual se escribió la primera vez.
- Si se intenta crear una cuenta con el nombre del host: es una cuenta existente ⇒ se valida su
  contraseña (nunca se crea un segundo host).

## POST /api/logout

Borra la fila de `sessions` y la cookie. `204`.

## GET /api/me

| Caso | Status | Body |
|------|--------|------|
| Sesión válida | 200 | `{ "username": "ana", "role": "player" }` |
| Sin sesión | 401 | `{ "error": "No autenticado" }` |

## Páginas

| Ruta | Sirve | Regla |
|------|-------|-------|
| `/` | `index.html` (login) | con sesión válida, el cliente redirige según rol |
| `/play` | `play.html` | sin sesión ⇒ `/`; host ⇒ `/host` |
| `/host` | `host.html` | sin sesión ⇒ `/`; player ⇒ `/play` |

La redirección es comodidad del cliente; la autorización real está en el servidor (eventos
Socket.IO, ver [socket-events.md](./socket-events.md)).
