import { useState, type FormEvent } from 'react';
import type { GameSystem, PlayMode, SessionInfo } from '../../shared/types.ts';
import { request } from '../socket.ts';
import { loadName, saveName } from '../session.ts';

interface Props {
  connected: boolean;
  onEnter: (s: SessionInfo) => void;
}

const SYSTEMS: { id: GameSystem; name: string; blurb: string }[] = [
  { id: 'dnd5e', name: 'D&D 5e', blurb: 'd20 checks, advantage, crits' },
  { id: 'daggerheart', name: 'Daggerheart', blurb: 'Hope & Fear duality dice' },
];

const MODES: { id: PlayMode; name: string; blurb: string }[] = [
  { id: 'online', name: 'Online', blurb: 'Share a link, e.g. in Discord' },
  { id: 'table', name: 'At the table', blurb: 'Everyone scans a QR code' },
];

export default function Home({ connected, onEnter }: Props) {
  const initialCode = new URLSearchParams(window.location.search).get('join')?.toUpperCase() ?? '';
  const [tab, setTab] = useState<'join' | 'create'>(initialCode ? 'join' : 'create');
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode);
  const [system, setSystem] = useState<GameSystem>('dnd5e');
  const [mode, setMode] = useState<PlayMode>('online');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    saveName(name.trim());
    try {
      const res =
        tab === 'create'
          ? await request('room:create', { name, system, mode })
          : await request('room:join', { code, name });
      onEnter(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="home">
      <header className="home-hero">
        <div className="logo" aria-hidden>🎲</div>
        <h1>Table of Heroes</h1>
        <p className="muted">Lobbies and shared dice for D&amp;D and Daggerheart.</p>
      </header>

      <section className="card home-card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
            I'm the GM
          </button>
          <button role="tab" aria-selected={tab === 'join'} className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>
            Join a game
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder={tab === 'create' ? 'e.g. Dungeon Master Dan' : 'e.g. Aria the Bard'} required autoFocus />
          </label>

          {tab === 'join' ? (
            <label className="field">
              <span>Lobby code</span>
              <input
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={5}
                placeholder="ABCDE"
                autoCapitalize="characters"
                autoComplete="off"
                required
              />
            </label>
          ) : (
            <>
              <fieldset className="field">
                <legend>Game</legend>
                <div className="choice-grid">
                  {SYSTEMS.map((s) => (
                    <button type="button" key={s.id} className={`choice ${system === s.id ? 'selected' : ''} sys-${s.id}`} aria-pressed={system === s.id} onClick={() => setSystem(s.id)}>
                      <strong>{s.name}</strong>
                      <small>{s.blurb}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="field">
                <legend>How are you playing?</legend>
                <div className="choice-grid">
                  {MODES.map((m) => (
                    <button type="button" key={m.id} className={`choice ${mode === m.id ? 'selected' : ''}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                      <strong>{m.name}</strong>
                      <small>{m.blurb}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          <button className="btn primary big" disabled={busy || !connected}>
            {!connected ? 'Connecting…' : busy ? 'One moment…' : tab === 'create' ? 'Create lobby' : 'Join lobby'}
          </button>
        </form>
      </section>
    </main>
  );
}
