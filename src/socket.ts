import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.ts';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same origin: in development Vite proxies /socket.io to the Node server.
export const socket: AppSocket = io();

type RequestEvent = 'room:create' | 'room:join' | 'room:rejoin' | 'dice:roll';
type Reply<E extends RequestEvent> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];
type OkReply<E extends RequestEvent> = Extract<Reply<E>, { ok: true }>;

/** Emits an event and resolves with the server's reply, or throws its error message. */
export function request<E extends RequestEvent>(
  event: E,
  data: Parameters<ClientToServerEvents[E]>[0],
): Promise<OkReply<E>> {
  return new Promise((resolve, reject) => {
    const emitter = socket.timeout(8000) as unknown as {
      emit: (ev: E, payload: unknown, cb: (err: Error | null, res: Reply<E>) => void) => void;
    };
    emitter.emit(event, data, (err, res) => {
      if (err) return reject(new Error('The server did not answer. Check your connection.'));
      if (!res.ok) return reject(new Error(res.error));
      resolve(res as OkReply<E>);
    });
  });
}
