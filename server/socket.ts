import type { Server, Socket } from 'socket.io';
import type { Ack, AdjustBalancePayload, BetPlacePayload } from '../shared/types';
import { parseCookies, SESSION_COOKIE, userFromToken } from './auth';
import type { Db } from './db';
import { GameError, type Game } from './game';

type AckFn = (ack: Ack) => void;
type Handler = (socket: Socket, payload: unknown, ack: AckFn) => void;

/** Ejecuta la acción y responde por ack; los errores de juego se devuelven con su mensaje. */
function run(ack: AckFn, action: () => void): void {
  try {
    action();
    ack({ ok: true });
  } catch (err) {
    if (err instanceof GameError) {
      ack({ ok: false, error: err.message });
    } else {
      console.error(err);
      ack({ ok: false, error: 'Error interno del servidor' });
    }
  }
}

/** Rechaza con "No autorizado" si el socket no es del host (FR-038). */
export function hostOnly(handler: Handler): Handler {
  return (socket, payload, ack) => {
    if (socket.data.role !== 'host') {
      ack({ ok: false, error: 'No autorizado' });
      return;
    }
    handler(socket, payload, ack);
  };
}

export function attachSocket(io: Server, db: Db, game: Game): void {
  io.use((socket, next) => {
    const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    const user = userFromToken(db, token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    socket.data.username = user.username;
    socket.data.role = user.role;
    next();
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data as { userId: number; role: 'host' | 'player' };
    socket.join(role === 'host' ? 'host' : `player:${userId}`);
    game.connect(userId);
    socket.emit('state', role === 'host' ? game.hostState() : game.playerState(userId));
    game.broadcast();

    const on = (event: string, handler: Handler) => {
      socket.on(event, (payload: unknown, ack?: unknown) => {
        handler(socket, payload, typeof ack === 'function' ? (ack as AckFn) : () => {});
      });
    };

    on('bet:place', (s, payload, ack) => run(ack, () => game.placeBet(s.data.userId, payload as BetPlacePayload)));
    on('host:openRound', hostOnly((_s, _p, ack) => run(ack, () => game.openRound())));
    on('host:startRace', hostOnly((_s, _p, ack) => run(ack, () => game.startRace())));
    on(
      'host:adjustBalance',
      hostOnly((s, payload, ack) => run(ack, () => game.adjustBalance(s.data.userId, payload as AdjustBalancePayload))),
    );

    socket.on('disconnect', () => {
      game.disconnect(userId);
      game.broadcast();
    });
  });
}
