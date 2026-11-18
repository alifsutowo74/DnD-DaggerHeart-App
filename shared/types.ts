// Types shared by the server and the browser client.

export type GameSystem = 'dnd5e' | 'daggerheart';

/** "online" = players join over the internet (e.g. while on Discord).
 *  "table"  = everyone sits together, each on their own device. */
export type PlayMode = 'online' | 'table';

export type Role = 'gm' | 'player';

export interface PublicPlayer {
  id: string;
  name: string;
  role: Role;
  online: boolean;
}

export interface RoomState {
  code: string;
  system: GameSystem;
  mode: PlayMode;
  createdAt: number;
  players: PublicPlayer[];
}

// ---------- Dice ----------

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface StandardRollRequest {
  kind: 'standard';
  /** e.g. "1d20+5", "2d6+1d4-1", "4d6kh3" */
  expression: string;
  /** D&D advantage/disadvantage: turns a single d20 into 2d20 keep highest/lowest. */
  mode?: RollMode;
  label?: string;
  /** Optional DC / difficulty to compare the total against. */
  target?: number;
  /** GM only: roll is shown to the GM alone. */
  hidden?: boolean;
}

export interface DualityRollRequest {
  kind: 'duality';
  /** Trait + experience + other bonuses. */
  modifier: number;
  /** Daggerheart advantage adds a d6, disadvantage subtracts a d6. */
  mode?: RollMode;
  label?: string;
  target?: number;
  hidden?: boolean;
}

export type RollRequest = StandardRollRequest | DualityRollRequest;

export interface DiceTerm {
  type: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  rolls: number[];
  /** Which rolls count toward the total (false = dropped by kh/kl). */
  kept: boolean[];
  keep?: { which: 'highest' | 'lowest'; n: number };
  subtotal: number;
}

export interface ModTerm {
  type: 'mod';
  value: number;
}

export type Term = DiceTerm | ModTerm;

export interface DualityDetail {
  hope: number;
  fear: number;
  /** Advantage (+) or disadvantage (−) d6, if any. */
  extra?: { sign: 1 | -1; value: number };
  modifier: number;
  /** critical = matching Hope and Fear dice (always a success in Daggerheart). */
  outcome: 'critical' | 'hope' | 'fear';
}

export interface RollResult {
  id: string;
  at: number;
  playerId: string;
  playerName: string;
  kind: 'standard' | 'duality';
  /** Normalised expression actually rolled, e.g. "2d20kh1+5". */
  expression: string;
  label?: string;
  hidden: boolean;
  total: number;
  terms: Term[];
  duality?: DualityDetail;
  /** D&D: natural 20 / natural 1 on a lone d20. */
  natural?: 'crit' | 'fumble';
  target?: number;
  success?: boolean;
}

// ---------- Socket events ----------

export type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface SessionInfo {
  code: string;
  playerId: string;
  /** Secret used to rejoin after a refresh. Keep it private. */
  token: string;
  state: RoomState;
  rolls: RollResult[];
}

export interface ClientToServerEvents {
  'room:create': (
    data: { name: string; system: GameSystem; mode: PlayMode },
    ack: Ack<SessionInfo>,
  ) => void;
  'room:join': (data: { code: string; name: string }, ack: Ack<SessionInfo>) => void;
  'room:rejoin': (data: { code: string; token: string }, ack: Ack<SessionInfo>) => void;
  'room:leave': () => void;
  'dice:roll': (req: RollRequest, ack: Ack<{ roll: RollResult }>) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'dice:rolled': (roll: RollResult) => void;
}
