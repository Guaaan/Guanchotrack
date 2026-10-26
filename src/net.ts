import { io, type Socket } from 'socket.io-client';
import type { Ack, HostState, PlayerState } from '../shared/types';

let socket: Socket | null = null;
let overlay: HTMLElement | null = null;
/** La sesión la cerró el host: no mostrar "Reconectando...". */
let ended = false;

function showOverlay(visible: boolean): void {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.textContent = 'Reconectando...';
    document.body.append(overlay);
  }
  overlay.hidden = !visible;
}

export function connect(onState: (state: HostState | PlayerState) => void): Socket {
  socket = io();
  socket.on('connect', () => showOverlay(false));
  socket.on('disconnect', () => showOverlay(!ended));
  // cuenta eliminada o contraseña restablecida por el host: volver al ingreso
  socket.on('session:ended', () => {
    ended = true;
    location.replace('/');
  });
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') location.href = '/';
  });
  socket.on('state', onState);
  return socket;
}

export function emitAck(event: string, payload: unknown = {}): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'Sin conexión' });
    socket.timeout(5000).emit(event, payload, (err: Error | null, ack: Ack) => {
      resolve(err ? { ok: false, error: 'Sin respuesta del servidor' } : ack);
    });
  });
}

export async function fetchMe(): Promise<{ username: string; role: 'host' | 'player' } | null> {
  const res = await fetch('/api/me');
  return res.ok ? res.json() : null;
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' });
}
