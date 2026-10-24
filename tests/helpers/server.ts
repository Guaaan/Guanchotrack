import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp, type App, type AppOptions } from '../../server/index';
import type { Ack, HostState, PlayerState } from '../../shared/types';

export interface TestServer extends App {
  url: string;
  login(username: string, password: string): Promise<{ status: number; body: any; cookie: string | null }>;
  connectAs(cookie: string | null): Promise<Socket>;
  close(): Promise<void>;
}

export async function startTestServer(opts: Partial<AppOptions> = {}): Promise<TestServer> {
  let seed = 1;
  const app = await createApp({
    dbPath: ':memory:',
    dev: false,
    port: 0,
    hostUser: 'hosttt',
    hostPassword: '1231',
    tickMs: 1,
    seedFn: () => seed++,
    ...opts,
  });
  const url = `http://127.0.0.1:${app.port}`;
  const sockets: Socket[] = [];

  return {
    ...app,
    url,
    async login(username, password) {
      const res = await fetch(`${url}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const setCookie = res.headers.get('set-cookie');
      const text = await res.text();
      return {
        status: res.status,
        body: text ? JSON.parse(text) : null,
        cookie: setCookie ? setCookie.split(';')[0] : null,
      };
    },
    connectAs(cookie) {
      const socket = ioClient(url, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: cookie ? { cookie } : {},
      });
      sockets.push(socket);
      // El snapshot inicial llega junto al connect: se guarda para no perderlo.
      initialStates.set(socket, nextState(socket, () => true, 5000).catch(() => null));
      return new Promise((resolve, reject) => {
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    },
    async close() {
      for (const s of sockets) s.disconnect();
      await app.close();
    },
  };
}

const initialStates = new WeakMap<Socket, Promise<HostState | PlayerState | null>>();

/** Snapshot que el servidor envía al conectar. */
export async function initialState<T extends HostState | PlayerState>(socket: Socket): Promise<T> {
  const s = await initialStates.get(socket);
  if (!s) throw new Error('sin snapshot inicial');
  return s as T;
}

/** Próximo `state` que cumpla `predicate` (por defecto, el siguiente). */
export function nextState<T extends HostState | PlayerState>(
  socket: Socket,
  predicate: (s: T) => boolean = () => true,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('state', onState);
      reject(new Error('timeout esperando state'));
    }, timeoutMs);
    const onState = (s: T) => {
      if (!predicate(s)) return;
      clearTimeout(timer);
      socket.off('state', onState);
      resolve(s);
    };
    socket.on('state', onState);
  });
}

export function emitAck(socket: Socket, event: string, payload: unknown = {}): Promise<Ack> {
  return socket.timeout(2000).emitWithAck(event, payload);
}

export interface Tracker<T> {
  latest(): T | undefined;
  /** Último `state` que cumpla `predicate`, ya recibido o el próximo que llegue. */
  waitFor(predicate?: (s: T) => boolean, timeoutMs?: number): Promise<T>;
}

/** Registra todos los `state` de un socket; llamar justo tras `connectAs` para no perder el inicial. */
export function track<T extends HostState | PlayerState>(socket: Socket): Tracker<T> {
  let last: T | undefined;
  const waiters = new Set<() => void>();
  initialStates.get(socket)?.then((s) => {
    if (s && last === undefined) last = s as T;
    waiters.forEach((w) => w());
  });
  socket.on('state', (s: T) => {
    last = s;
    waiters.forEach((w) => w());
  });
  return {
    latest: () => last,
    waitFor(predicate = () => true, timeoutMs = 3000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (last !== undefined && predicate(last)) {
            clearTimeout(timer);
            waiters.delete(check);
            resolve(last);
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`timeout esperando state; último: ${JSON.stringify(last)}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
  };
}
