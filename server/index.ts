import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  GameSystem,
  PlayMode,
  ServerToClientEvents,
  SessionInfo,
} from '../shared/types.ts';
import { RoomError, RoomStore, type Room } from './rooms.ts';

const PORT = Number(process.env.PORT ?? 3001);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

const app = express();
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: store.size }));

// In production the server also hosts the built web app (npm run build).
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!socket\.io\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { cors: process.env.NODE_ENV === 'production' ? undefined : { origin: true } },
);

interface SocketData {
  code?: string;
  playerId?: string;
}

const store = new RoomStore();
setInterval(() => store.sweep(), 10 * 60 * 1000).unref();

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const SYSTEMS: GameSystem[] = ['dnd5e', 'daggerheart'];
const MODES: PlayMode[] = ['online', 'table'];

function session(room: Room, player: { id: string; token: string }): SessionInfo {
  return {
    code: room.code,
    playerId: player.id,
    token: player.token,
    state: store.publicState(room),
    rolls: store.visibleRolls(room, player.id),
  };
}

function enter(socket: AppSocket, room: Room, playerId: string) {
  socket.data.code = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
  io.to(room.code).emit('room:state', store.publicState(room));
}

function leaveCurrent(socket: AppSocket) {
  const { code } = socket.data;
  if (!code) return;
  socket.leave(code);
  const room = store.disconnect(code, socket.id);
  socket.data = {};
  if (room) io.to(code).emit('room:state', store.publicState(room));
}

/** Wraps a handler so thrown RoomErrors become friendly ack errors. */
function safely<A extends unknown[]>(
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    const ack = args[args.length - 1];
    try {
      fn(...args);
    } catch (err) {
      const message = err instanceof RoomError ? err.message : 'Something went wrong';
      if (!(err instanceof RoomError)) console.error(err);
      if (typeof ack === 'function') ack({ ok: false, error: message });
    }
  };
}

io.on('connection', (socket: AppSocket) => {
  socket.on(
    'room:create',
    safely((data, ack) => {
      const system = SYSTEMS.includes(data?.system) ? data.system : 'dnd5e';
      const mode = MODES.includes(data?.mode) ? data.mode : 'online';
      leaveCurrent(socket);
      const { room, player } = store.create(data?.name, system, mode, socket.id);
      enter(socket, room, player.id);
      ack({ ok: true, ...session(room, player) });
    }),
  );

  socket.on(
    'room:join',
    safely((data, ack) => {
      leaveCurrent(socket);
      const { room, player } = store.join(data?.code, data?.name, socket.id);
      enter(socket, room, player.id);
      ack({ ok: true, ...session(room, player) });
    }),
  );

  socket.on(
    'room:rejoin',
    safely((data, ack) => {
      leaveCurrent(socket);
      const { room, player } = store.rejoin(data?.code, data?.token, socket.id);
      enter(socket, room, player.id);
      ack({ ok: true, ...session(room, player) });
    }),
  );

  socket.on('room:leave', () => {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return;
    socket.leave(code);
    const room = store.leave(code, playerId);
    socket.data = {};
    if (room) io.to(code).emit('room:state', store.publicState(room));
  });

  socket.on(
    'dice:roll',
    safely((req, ack) => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) throw new RoomError('Join a lobby first');
      const room = store.get(code);
      const roll = store.roll(code, playerId, req);
      if (roll.hidden) {
        for (const id of store.gmSocketIds(room)) io.to(id).emit('dice:rolled', roll);
      } else {
        io.to(code).emit('dice:rolled', roll);
      }
      ack({ ok: true, roll });
    }),
  );

  socket.on('disconnect', () => leaveCurrent(socket));
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
