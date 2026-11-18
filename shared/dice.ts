import type {
  DiceTerm,
  DualityDetail,
  RollMode,
  Term,
} from './types.ts';

/** Returns an integer in [1, sides]. Swappable for tests. */
export type Rng = (sides: number) => number;

export const LIMITS = { maxTerms: 20, maxCount: 100, maxSides: 1000, maxMod: 10000 };

export class DiceError extends Error {}

interface ParsedDice {
  type: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { which: 'highest' | 'lowest'; n: number };
}
interface ParsedMod {
  type: 'mod';
  value: number;
}
type Parsed = ParsedDice | ParsedMod;

const TERM_RE = /^(\d*)d(\d+|%)(?:(kh|kl)(\d+))?$|^(\d+)$/;

/** Parses expressions like "1d20+5", "2d6 + 1d4 - 1", "d%", "4d6kh3". */
export function parseExpression(input: string): Parsed[] {
  const src = input.toLowerCase().replace(/\s+/g, '');
  if (!src) throw new DiceError('Type something to roll, like 1d20+3');
  if (!/^[+-]?[0-9d%khl+-]+$/.test(src)) {
    throw new DiceError('Only dice (like 2d6), numbers, + and - are allowed');
  }
  const pieces = src.match(/[+-]?[^+-]+/g) ?? [];
  if (pieces.length === 0) throw new DiceError('Nothing to roll');
  if (pieces.length > LIMITS.maxTerms) throw new DiceError(`At most ${LIMITS.maxTerms} parts per roll`);

  return pieces.map((piece) => {
    const sign: 1 | -1 = piece.startsWith('-') ? -1 : 1;
    const body = piece.replace(/^[+-]/, '');
    const m = TERM_RE.exec(body);
    if (!m) throw new DiceError(`I don't understand "${piece}"`);
    if (m[5] !== undefined) {
      const value = Number(m[5]);
      if (value > LIMITS.maxMod) throw new DiceError('That modifier is too big');
      return { type: 'mod', value: sign * value } as ParsedMod;
    }
    const count = m[1] === '' ? 1 : Number(m[1]);
    const sides = m[2] === '%' ? 100 : Number(m[2]);
    if (count < 1) throw new DiceError('Roll at least one die');
    if (count > LIMITS.maxCount) throw new DiceError(`At most ${LIMITS.maxCount} dice at once`);
    if (sides < 2) throw new DiceError('Dice need at least 2 sides');
    if (sides > LIMITS.maxSides) throw new DiceError(`At most ${LIMITS.maxSides} sides`);
    const dice: ParsedDice = { type: 'dice', sign, count, sides };
    if (m[3]) {
      const n = Number(m[4]);
      if (n < 1 || n > count) throw new DiceError(`Can't keep ${n} of ${count} dice`);
      dice.keep = { which: m[3] === 'kh' ? 'highest' : 'lowest', n };
    }
    return dice;
  });
}

/** D&D advantage/disadvantage: a lone, positive 1d20 becomes 2d20kh1 / 2d20kl1. */
export function applyD20Mode(terms: Parsed[], mode: RollMode = 'normal'): Parsed[] {
  if (mode === 'normal') return terms;
  const d20s = terms.filter((t) => t.type === 'dice' && t.sides === 20);
  if (d20s.length !== 1) throw new DiceError('Advantage needs exactly one d20 in the roll');
  const d20 = d20s[0] as ParsedDice;
  if (d20.count !== 1 || d20.keep || d20.sign !== 1) {
    throw new DiceError('Advantage works on a single 1d20');
  }
  return terms.map((t) =>
    t === d20
      ? { ...d20, count: 2, keep: { which: mode === 'advantage' ? 'highest' : 'lowest', n: 1 } }
      : t,
  );
}

export function formatExpression(terms: Parsed[]): string {
  return terms
    .map((t, i) => {
      const sign = t.type === 'mod' ? (t.value < 0 ? '-' : '+') : t.sign < 0 ? '-' : '+';
      const body =
        t.type === 'mod'
          ? String(Math.abs(t.value))
          : `${t.count}d${t.sides}${t.keep ? (t.keep.which === 'highest' ? 'kh' : 'kl') + t.keep.n : ''}`;
      return i === 0 && sign === '+' ? body : sign + body;
    })
    .join('');
}

export function rollTerms(parsed: Parsed[], rng: Rng): { terms: Term[]; total: number } {
  const terms: Term[] = parsed.map((p) => {
    if (p.type === 'mod') return { type: 'mod', value: p.value };
    const rolls = Array.from({ length: p.count }, () => rng(p.sides));
    const kept = rolls.map(() => true);
    if (p.keep) {
      const order = rolls
        .map((v, i) => ({ v, i }))
        .sort((a, b) => (p.keep!.which === 'highest' ? b.v - a.v : a.v - b.v) || a.i - b.i);
      kept.fill(false);
      order.slice(0, p.keep.n).forEach(({ i }) => (kept[i] = true));
    }
    const sum = rolls.reduce((acc, v, i) => acc + (kept[i] ? v : 0), 0);
    const term: DiceTerm = {
      type: 'dice',
      sign: p.sign,
      count: p.count,
      sides: p.sides,
      rolls,
      kept,
      keep: p.keep,
      subtotal: p.sign * sum,
    };
    return term;
  });
  const total = terms.reduce((acc, t) => acc + (t.type === 'mod' ? t.value : t.subtotal), 0);
  return { terms, total };
}

/** Natural 20 / natural 1 when the roll has exactly one d20 that counts. */
export function detectNatural(terms: Term[]): 'crit' | 'fumble' | undefined {
  const d20s = terms.filter((t): t is DiceTerm => t.type === 'dice' && t.sides === 20 && t.sign === 1);
  if (d20s.length !== 1) return undefined;
  const keptRolls = d20s[0].rolls.filter((_, i) => d20s[0].kept[i]);
  if (keptRolls.length !== 1) return undefined;
  if (keptRolls[0] === 20) return 'crit';
  if (keptRolls[0] === 1) return 'fumble';
  return undefined;
}

/** Daggerheart duality roll: 2d12 (Hope + Fear) + modifier, ±d6 for advantage. */
export function rollDuality(
  modifier: number,
  mode: RollMode,
  rng: Rng,
): { total: number; duality: DualityDetail; expression: string } {
  if (!Number.isInteger(modifier) || Math.abs(modifier) > 100) {
    throw new DiceError('Modifier must be a whole number between -100 and 100');
  }
  const hope = rng(12);
  const fear = rng(12);
  const extra =
    mode === 'normal' ? undefined : { sign: (mode === 'advantage' ? 1 : -1) as 1 | -1, value: rng(6) };
  const total = hope + fear + modifier + (extra ? extra.sign * extra.value : 0);
  const outcome = hope === fear ? 'critical' : hope > fear ? 'hope' : 'fear';
  let expression = '2d12';
  if (extra) expression += extra.sign > 0 ? '+1d6' : '-1d6';
  if (modifier) expression += modifier > 0 ? `+${modifier}` : `${modifier}`;
  return { total, expression, duality: { hope, fear, extra, modifier, outcome } };
}
