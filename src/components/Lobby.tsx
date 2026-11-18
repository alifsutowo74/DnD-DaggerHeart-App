import type { RollResult, RoomState } from '../../shared/types.ts';
import InvitePanel from './InvitePanel.tsx';
import PlayerList from './PlayerList.tsx';
import DicePanel from './DicePanel.tsx';
import RollLog from './RollLog.tsx';

interface Props {
  room: RoomState;
  me: string;
  rolls: RollResult[];
  connected: boolean;
  onAddLocalRoll: (r: RollResult) => void;
  onLeave: () => void;
}

export default function Lobby({ room, me, rolls, connected, onAddLocalRoll, onLeave }: Props) {
  const self = room.players.find((p) => p.id === me);
  const isGM = self?.role === 'gm';
  const systemName = room.system === 'dnd5e' ? 'D&D 5e' : 'Daggerheart';

  return (
    <div className={`lobby sys-${room.system}`}>
      <header className="topbar">
        <div className="topbar-title">
          <span className="logo-sm" aria-hidden>🎲</span>
          <div>
            <strong>{systemName}</strong>
            <span className="muted"> · {room.mode === 'online' ? 'Online' : 'At the table'}</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className={`status ${connected ? 'on' : 'off'}`}>{connected ? 'Connected' : 'Reconnecting…'}</span>
          <span className="pill">Code <b>{room.code}</b></span>
          <button className="btn ghost small" onClick={onLeave}>Leave</button>
        </div>
      </header>

      <div className="lobby-grid">
        <aside className="side stack">
          <InvitePanel room={room} />
          <PlayerList players={room.players} me={me} />
        </aside>

        <main className="main stack">
          <DicePanel system={room.system} isGM={isGM} onRolled={onAddLocalRoll} disabled={!connected} />
          <RollLog rolls={rolls} me={me} />
        </main>
      </div>
    </div>
  );
}
