import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  DiceError,
  applyD20Mode,
  detectNatural,
  formatExpression,
  parseExpression,
  rollDuality,
  rollTerms,
  type Rng,
} from '../shared/dice.ts';
import type {
  GameSystem,
  PlayMode,
  PublicPlayer,
  Role,
  RollRequest,
  RollResult,
  RoomState,
} from '../shared/types.ts';

// Rooms live in memory for now. Restarting the server clears them.
// Later steps (characters, maps) will add a database.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid mix-ups
const CODE_LENGTH = 5;
const MAX_PLAYERS = 12;
const MAX_ROLL_HISTORY = 200;
const IDLE_ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const secureRng: Rng = (sides) => randomInt(1, sides + 1);

interface Player {
  id: string;
  token: string;
  name: string;
  role: Role;
  /** Socket ids currently connected as this player (several tabs are fine). */
  sockets: Set<string>;
}

export interface Room {
  code: string;
  system: GameSystem;
  mode: PlayMode;
  createdAt: number;
  lastActiveAt: number;
  players: Map<string, Player>;
  rolls: RollResult[];
}

export class RoomError extends Error {}

export class RoomStore {
  private rooms = new Map<string, Room>();

  constructor(private rng: Rng = secureRng) {}

  get size() {
    return this.rooms.size;
  }

  create(gmName: string, system: GameSystem, mode: PlayMode, socketId: string) {
    const code = this.newCode();
    const now = Date.now();
    const room: Room = {
      code,
      system,
      mode,
      createdAt: now,
      lastActiveAt: now,
      players: new Map(),
      rolls: [],
    };
    this.rooms.set(code, room);
    const player = this.addPlayer(room, gmName, 'gm', socketId);
    return { room, player };
  }

  join(code: string, name: string, socketId: string) {
    const room = this.get(code);
    const clean = cleanName(name);
    const taken = [...room.players.values()].find(
      (p) => p.name.toLowerCase() === clean.toLowerCase(),
    );
    if (taken) throw new RoomError(`${taken.name} is already in this lobby. Pick another name.`);
    if (room.players.size >= MAX_PLAYERS) throw new RoomError('This lobby is full');
    const player = this.addPlayer(room, clean, 'player', socketId);
    return { room, player };
  }

  rejoin(code: string, token: string, socketId: string) {
    const room = this.get(code);
    const player = [...room.players.values()].find((p) => p.token === token);
    if (!player) throw new RoomError('Your seat in this lobby was not found');
    player.sockets.add(socketId);
    room.lastActiveAt = Date.now();
    return { room, player };
  }

  /** Marks a socket as gone. Players keep their seat so they can rejoin. */
  disconnect(code: string, socketId: string) {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    for (const p of room.players.values()) p.sockets.delete(socketId);
    room.lastActiveAt = Date.now();
    return room;
  }

  /** A player chose to leave: free the seat (the GM's seat is kept). */
  leave(code: string, playerId: string) {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    const p = room.players.get(playerId);
    if (p && p.role !== 'gm') room.players.delete(playerId);
    else if (p) p.sockets.clear();
    return room;
  }

  roll(code: string, playerId: string, req: RollRequest): RollResult {
    const room = this.get(code);
    const player = room.players.get(playerId);
    if (!player) throw new RoomError('You are not in this lobby');
    if (req.hidden && player.role !== 'gm') throw new RoomError('Only the GM can roll in secret');

    const label = req.label?.trim().slice(0, 60) || undefined;
    const target =
      typeof req.target === 'number' && Number.isFinite(req.target)
        ? Math.trunc(req.target)
        : undefined;
    const base = {
      id: randomUUID(),
      at: Date.now(),
      playerId: player.id,
      playerName: player.name,
      label,
      hidden: Boolean(req.hidden),
      target,
    };

    let result: RollResult;
    try {
      if (req.kind === 'duality') {
        const { total, duality, expression } = rollDuality(
          Number(req.modifier) || 0,
          req.mode ?? 'normal',
          this.rng,
        );
        result = { ...base, kind: 'duality', expression, total, terms: [], duality };
        // A critical (matching dice) always succeeds in Daggerheart.
        if (target !== undefined) result.success = duality.outcome === 'critical' || total >= target;
      } else {
        const parsed = applyD20Mode(parseExpression(String(req.expression ?? '')), req.mode);
        const { terms, total } = rollTerms(parsed, this.rng);
        result = {
          ...base,
          kind: 'standard',
          expression: formatExpression(parsed),
          total,
          terms,
          natural: detectNatural(terms),
        };
        if (target !== undefined) result.success = total >= target;
      }
    } catch (err) {
      if (err instanceof DiceError) throw new RoomError(err.message);
      throw err;
    }

    room.rolls.push(result);
    if (room.rolls.length > MAX_ROLL_HISTORY) room.rolls.splice(0, room.rolls.length - MAX_ROLL_HISTORY);
    room.lastActiveAt = Date.now();
    return result;
  }

  get(code: string): Room {
    const room = this.rooms.get(normaliseCode(code));
    if (!room) throw new RoomError('No lobby with that code. Check it with your GM.');
    return room;
  }

  /** Rolls a viewer may see: secret GM rolls are only for the GM. */
  visibleRolls(room: Room, viewerId: string) {
    const viewer = room.players.get(viewerId);
    return room.rolls.filter((r) => !r.hidden || viewer?.role === 'gm');
  }

  gmSocketIds(room: Room) {
    return [...room.players.values()].filter((p) => p.role === 'gm').flatMap((p) => [...p.sockets]);
  }

  publicState(room: Room): RoomState {
    return {
      code: room.code,
      system: room.system,
      mode: room.mode,
      createdAt: room.createdAt,
      players: [...room.players.values()].map(
        (p): PublicPlayer => ({ id: p.id, name: p.name, role: p.role, online: p.sockets.size > 0 }),
      ),
    };
  }

  /** Drops rooms nobody has been connected to for a long time. */
  sweep(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      const anyoneOnline = [...room.players.values()].some((p) => p.sockets.size > 0);
      if (!anyoneOnline && now - room.lastActiveAt > IDLE_ROOM_TTL_MS) this.rooms.delete(code);
    }
  }

  private addPlayer(room: Room, name: string, role: Role, socketId: string): Player {
    const player: Player = {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      name: cleanName(name),
      role,
      sockets: new Set([socketId]),
    };
    room.players.set(player.id, player);
    return player;
  }

  private newCode() {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('Could not create a lobby code, try again');
  }
}

export function normaliseCode(code: string) {
  return String(code ?? '').trim().toUpperCase();
}

function cleanName(name: string) {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!clean) throw new RoomError('Please enter a name');
  return clean;
}
