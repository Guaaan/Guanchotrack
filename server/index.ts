import { mkdirSync } from 'node:fs';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import express from 'express';
import { Server } from 'socket.io';
import type { RaceSpeed } from '../shared/horses';
import { Admin, type LoginAttempts } from './admin';
import { authRouter } from './auth';
import { checkInvariant, openDb, type Db } from './db';
import { Game } from './game';
import { attachSocket } from './socket';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface AppOptions {
  dbPath: string;
  dev: boolean;
  port: number;
  hostUser: string;
  hostPassword: string;
  tickMs?: number;
  tickMsBySpeed?: Record<RaceSpeed, number>;
  seedFn?: () => number;
}

export interface App {
  httpServer: HttpServer;
  io: Server;
  game: Game;
  db: Db;
  port: number;
  close(): Promise<void>;
}

/** Crea o actualiza la cuenta host desde la configuración; nunca hay más de un host (research R3). */
function upsertHost(db: Db, username: string, password: string): void {
  const hash = bcrypt.hashSync(password, 10);
  db.transaction(() => {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE users SET role = 'host', password_hash = ? WHERE id = ?").run(hash, existing.id);
    } else {
      db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'host', ?)").run(
        username,
        hash,
        Date.now(),
      );
    }
    db.prepare("UPDATE users SET role = 'player' WHERE role = 'host' AND username <> ?").run(username);
  })();
  if (username === 'hosttt' && password === '1231') {
    console.warn('⚠ Usando credenciales de host por defecto (hosttt / 1231). Define HOST_USER y HOST_PASSWORD.');
  }
}

const PAGES: Record<string, string> = { '/play': '/play.html', '/host': '/host.html' };

export async function createApp(opts: AppOptions): Promise<App> {
  const db = openDb(opts.dbPath);
  upsertHost(db, opts.hostUser, opts.hostPassword);
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer);

  const game = new Game({
    db,
    emit: (target, state) => {
      io.to(target === 'host' ? 'host' : `player:${target.userId}`).emit('state', state);
    },
    tickMs: opts.tickMs,
    tickMsBySpeed: opts.tickMsBySpeed,
    seedFn: opts.seedFn,
  });

  const loginAttempts: LoginAttempts = new Map();
  const admin = new Admin({ db, game, loginAttempts });

  app.use(express.json());
  app.use(authRouter(db, Date.now, loginAttempts));

  app.use((req, _res, next) => {
    const page = PAGES[req.path];
    if (page) req.url = page;
    next();
  });

  let closeVite = async () => {};
  if (opts.dev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: ROOT,
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'mpa',
    });
    app.use(vite.middlewares);
    closeVite = () => vite.close();
  } else {
    app.use(express.static(join(ROOT, 'dist')));
  }

  game.recoverOnBoot();
  // Auditoría de conservación de monedas (principio XII): no bloquea el arranque, solo avisa.
  if (!checkInvariant(db)) {
    console.warn(
      '⚠ El libro de movimientos no cumple el invariante de conservación de monedas. Revisa coin_transactions y bets antes de seguir jugando.',
    );
  }
  attachSocket(io, db, game, admin);

  await new Promise<void>((resolve) => httpServer.listen(opts.port, '0.0.0.0', resolve));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    httpServer,
    io,
    game,
    db,
    port,
    async close() {
      game.stop();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await closeVite();
      db.close();
    },
  };
}

function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) urls.push(`http://${net.address}:${port}`);
    }
  }
  return urls;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = process.env.DB_PATH ?? join(ROOT, 'data', 'guanchotrack.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const { port } = await createApp({
    dbPath,
    dev: process.env.NODE_ENV !== 'production',
    port: Number(process.env.PORT ?? 3000),
    hostUser: process.env.HOST_USER ?? 'hosttt',
    hostPassword: process.env.HOST_PASSWORD ?? '1231',
  });
  console.log('GuanchoTrack escuchando en:');
  for (const url of lanUrls(port)) console.log(`  ${url}`);
  console.log(`  http://localhost:${port}`);
}
