import { useState, type FormEvent } from 'react';
import type { GameSystem, RollMode, RollRequest, RollResult } from '../../shared/types.ts';
import { request } from '../socket.ts';

interface Props {
  system: GameSystem;
  isGM: boolean;
  disabled: boolean;
  onRolled: (r: RollResult) => void;
}

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

export default function DicePanel({ system, isGM, disabled, onRolled }: Props) {
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>('normal');
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [custom, setCustom] = useState('');
  const [secret, setSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (req: RollRequest, after?: () => void) => {
    setError('');
    setBusy(true);
    try {
      const { roll } = await request('dice:roll', { ...req, hidden: isGM && secret });
      onRolled(roll);
      after?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const targetNum = target.trim() === '' ? undefined : Number(target);

  const rollMain = (e: FormEvent) => {
    e.preventDefault();
    const common = { mode, label: label || undefined, target: targetNum };
    // The label and DC describe one roll, so clear them once it's done.
    const reset = () => {
      setLabel('');
      setTarget('');
    };
    if (system === 'daggerheart') void send({ kind: 'duality', modifier, ...common }, reset);
    else void send({ kind: 'standard', expression: `1d20${fmtMod(modifier)}`, ...common }, reset);
  };

  const rollCustom = (e: FormEvent) => {
    e.preventDefault();
    if (custom.trim()) void send({ kind: 'standard', expression: custom });
  };

  const off = disabled || busy;
  const isDH = system === 'daggerheart';

  return (
    <section className="card dice-panel">
      <div className="dice-head">
        <h2>{isDH ? 'Duality roll' : 'd20 roll'}</h2>
        {isGM && (
          <label className="secret-toggle" title="Only you will see secret rolls">
            <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
            <span>🙈 Secret roll</span>
          </label>
        )}
      </div>
      <p className="muted small">
        {isDH
          ? 'Rolls a Hope d12 and a Fear d12. The higher die decides the outcome; matching dice are a critical success.'
          : 'Ability checks, saves and attacks. Advantage rolls two d20s and keeps the higher.'}
      </p>

      <form className="main-roll" onSubmit={rollMain}>
        <div className="field">
          <span>Modifier</span>
          <div className="stepper">
            <button type="button" onClick={() => setModifier((m) => Math.max(-20, m - 1))} aria-label="Lower modifier">−</button>
            <output aria-live="polite">{fmtMod(modifier) || '+0'}</output>
            <button type="button" onClick={() => setModifier((m) => Math.min(20, m + 1))} aria-label="Raise modifier">+</button>
          </div>
        </div>

        <div className="field">
          <span>{isDH ? 'Advantage die' : 'Advantage'}</span>
          <div className="segmented" role="radiogroup">
            {(['disadvantage', 'normal', 'advantage'] as RollMode[]).map((m) => (
              <button type="button" key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {m === 'normal' ? 'Normal' : m === 'advantage' ? (isDH ? '+d6' : 'Adv') : isDH ? '−d6' : 'Dis'}
              </button>
            ))}
          </div>
        </div>

        <label className="field grow">
          <span>What for? (optional)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={isDH ? 'Agility + Acrobat' : 'Stealth check'} />
        </label>

        <label className="field narrow">
          <span>{isDH ? 'Difficulty' : 'DC'}</span>
          <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))} maxLength={3} placeholder="—" />
        </label>

        <button className={`btn primary big roll-btn ${isDH ? 'duality' : ''}`} disabled={off}>
          {isDH ? 'Roll Hope & Fear' : 'Roll d20'}
        </button>
      </form>

      <div className="divider"><span>Other dice</span></div>

      <div className="quick-dice">
        {QUICK_DICE.map((d) => (
          <button key={d} className="die-btn" disabled={off} onClick={() => void send({ kind: 'standard', expression: `1d${d}` })} aria-label={`Roll a d${d}`}>
            <DieIcon sides={d} />
            <span>d{d}</span>
          </button>
        ))}
      </div>

      <form className="row custom-roll" onSubmit={rollCustom}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={isDH ? 'Damage, e.g. 2d8+3' : 'Any roll, e.g. 2d6+1d4+3 or 4d6kh3'} aria-label="Custom roll" maxLength={80} />
        <button className="btn" disabled={off || !custom.trim()}>Roll</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function fmtMod(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `${n}` : '';
}

function DieIcon({ sides }: { sides: number }) {
  // Simple outlines so each die is recognisable at a glance.
  const shapes: Record<number, string> = {
    4: 'M12 3 L21 20 L3 20 Z',
    6: 'M5 5 H19 V19 H5 Z',
    8: 'M12 2 L21 12 L12 22 L3 12 Z',
    10: 'M12 2 L21 10 L12 22 L3 10 Z',
    12: 'M12 2 L20.5 8 L17.5 19 H6.5 L3.5 8 Z',
    20: 'M12 2 L20.7 7 V17 L12 22 L3.3 17 V7 Z',
    100: 'M12 2 L21 10 L12 22 L3 10 Z',
  };
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <path d={shapes[sides]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
