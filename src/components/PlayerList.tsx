import type { PublicPlayer } from '../../shared/types.ts';

export default function PlayerList({ players, me }: { players: PublicPlayer[]; me: string }) {
  const sorted = [...players].sort((a, b) => (a.role === b.role ? 0 : a.role === 'gm' ? -1 : 1));
  return (
    <section className="card">
      <h2>
        At the table <span className="count">{players.filter((p) => p.online).length}/{players.length}</span>
      </h2>
      <ul className="players">
        {sorted.map((p) => (
          <li key={p.id} className={p.online ? '' : 'away'}>
            <span className={`dot ${p.online ? 'on' : 'off'}`} title={p.online ? 'Online' : 'Away'} />
            <span className="avatar" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>
            <span className="pname">
              {p.name}
              {p.id === me && <span className="muted"> (you)</span>}
            </span>
            {p.role === 'gm' && <span className="badge gm">GM</span>}
          </li>
        ))}
      </ul>
      {players.length === 1 && <p className="muted small">Waiting for players to join…</p>}
    </section>
  );
}
