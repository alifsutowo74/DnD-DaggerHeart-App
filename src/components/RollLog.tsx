import { useEffect, useRef } from 'react';
import type { RollResult, Term } from '../../shared/types.ts';

export default function RollLog({ rolls, me }: { rolls: RollResult[]; me: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  const newest = rolls[rolls.length - 1]?.id;

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [newest]);

  return (
    <section className="card roll-log">
      <h2>Rolls</h2>
      {rolls.length === 0 ? (
        <p className="muted small">No rolls yet. Everyone at the table sees every roll here.</p>
      ) : (
        <ol ref={listRef} className="rolls" aria-live="polite">
          {[...rolls].reverse().map((r) => (
            <RollItem key={r.id} roll={r} mine={r.playerId === me} fresh={r.id === newest} />
          ))}
        </ol>
      )}
    </section>
  );
}

function RollItem({ roll, mine, fresh }: { roll: RollResult; mine: boolean; fresh: boolean }) {
  const time = new Date(roll.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const d = roll.duality;
  const tone = d
    ? d.outcome
    : roll.natural === 'crit'
      ? 'crit'
      : roll.natural === 'fumble'
        ? 'fumble'
        : '';

  return (
    <li className={`roll ${tone} ${fresh ? 'fresh' : ''} ${roll.hidden ? 'hidden-roll' : ''}`}>
      <div className="roll-meta">
        <strong>{mine ? 'You' : roll.playerName}</strong>
        {roll.label && <span className="roll-label">{roll.label}</span>}
        {roll.hidden && <span className="badge secret">Secret</span>}
        <time className="muted">{time}</time>
      </div>

      <div className="roll-body">
        <div className="roll-total" aria-label={`Total ${roll.total}`}>{roll.total}</div>
        <div className="roll-detail">
          {d ? (
            <>
              <div className="duality-dice">
                <span className="die hope" title="Hope die">{d.hope}<small>Hope</small></span>
                <span className="die fear" title="Fear die">{d.fear}<small>Fear</small></span>
                {d.extra && (
                  <span className={`die extra ${d.extra.sign < 0 ? 'neg' : ''}`} title={d.extra.sign > 0 ? 'Advantage d6' : 'Disadvantage d6'}>
                    {d.extra.sign > 0 ? '+' : '−'}{d.extra.value}<small>d6</small>
                  </span>
                )}
                {d.modifier !== 0 && <span className="mod">{d.modifier > 0 ? `+${d.modifier}` : `−${-d.modifier}`}</span>}
              </div>
              <div className="outcome">
                {d.outcome === 'critical' ? '✨ Critical success!' : d.outcome === 'hope' ? 'with Hope' : 'with Fear'}
                {roll.success !== undefined && <SuccessTag ok={roll.success} target={roll.target!} />}
              </div>
            </>
          ) : (
            <>
              <div className="terms">{roll.terms.map((t, i) => <TermView key={i} term={t} first={i === 0} />)}</div>
              <div className="outcome">
                <code>{roll.expression}</code>
                {roll.natural === 'crit' && <span className="nat"> · Natural 20!</span>}
                {roll.natural === 'fumble' && <span className="nat"> · Natural 1</span>}
                {roll.success !== undefined && <SuccessTag ok={roll.success} target={roll.target!} />}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function SuccessTag({ ok, target }: { ok: boolean; target: number }) {
  return <span className={`badge ${ok ? 'success' : 'fail'}`}>{ok ? 'Success' : 'Fail'} vs {target}</span>;
}

function TermView({ term, first }: { term: Term; first: boolean }) {
  if (term.type === 'mod') {
    return <span className="mod">{term.value < 0 ? `−${-term.value}` : `+${term.value}`}</span>;
  }
  return (
    <span className="term">
      {(!first || term.sign < 0) && <span className="op">{term.sign < 0 ? '−' : '+'}</span>}
      {term.rolls.map((v, i) => (
        <span
          key={i}
          className={`die d${term.sides} ${term.kept[i] ? '' : 'dropped'} ${v === term.sides ? 'max' : v === 1 ? 'min' : ''}`}
          title={`d${term.sides}`}
        >
          {v}
        </span>
      ))}
    </span>
  );
}
