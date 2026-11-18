import { describe, expect, it } from 'vitest';
import {
  DiceError,
  applyD20Mode,
  detectNatural,
  formatExpression,
  parseExpression,
  rollDuality,
  rollTerms,
} from '../shared/dice.ts';

/** RNG that returns the given values in order. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('rng exhausted');
    return values[i++];
  };
};

describe('parseExpression', () => {
  it('parses dice, modifiers and spaces', () => {
    expect(formatExpression(parseExpression(' 2d6 + 1d4 - 1 '))).toBe('2d6+1d4-1');
    expect(formatExpression(parseExpression('d20+5'))).toBe('1d20+5');
    expect(formatExpression(parseExpression('d%'))).toBe('1d100');
    expect(formatExpression(parseExpression('4d6kh3'))).toBe('4d6kh3');
    expect(formatExpression(parseExpression('-1d4+3'))).toBe('-1d4+3');
  });

  it('rejects junk and silly sizes', () => {
    for (const bad of ['', 'hello', '1d1', '1000d6', '1d5000', '2d6kh3', '1d20*2', '1d']) {
      expect(() => parseExpression(bad), bad).toThrow(DiceError);
    }
  });
});

describe('rollTerms', () => {
  it('adds dice and modifiers', () => {
    const { total, terms } = rollTerms(parseExpression('2d6+1d4-1'), seq(3, 5, 2));
    expect(total).toBe(3 + 5 + 2 - 1);
    expect(terms).toHaveLength(3);
  });

  it('keeps highest for ability score rolls', () => {
    const { total, terms } = rollTerms(parseExpression('4d6kh3'), seq(1, 6, 4, 4));
    expect(total).toBe(14);
    expect(terms[0].type === 'dice' && terms[0].kept).toEqual([false, true, true, true]);
  });

  it('subtracts negative dice', () => {
    expect(rollTerms(parseExpression('10-1d4'), seq(3)).total).toBe(7);
  });
});

describe('D&D advantage', () => {
  it('rolls 2d20 and keeps the higher one', () => {
    const parsed = applyD20Mode(parseExpression('1d20+5'), 'advantage');
    expect(formatExpression(parsed)).toBe('2d20kh1+5');
    const { total, terms } = rollTerms(parsed, seq(7, 20));
    expect(total).toBe(25);
    expect(detectNatural(terms)).toBe('crit');
  });

  it('disadvantage keeps the lower one and spots a natural 1', () => {
    const parsed = applyD20Mode(parseExpression('d20+2'), 'disadvantage');
    const { total, terms } = rollTerms(parsed, seq(1, 15));
    expect(total).toBe(3);
    expect(detectNatural(terms)).toBe('fumble');
  });

  it('needs exactly one d20', () => {
    expect(() => applyD20Mode(parseExpression('2d6'), 'advantage')).toThrow(DiceError);
    expect(() => applyD20Mode(parseExpression('1d20+1d20'), 'advantage')).toThrow(DiceError);
  });

  it('does not report naturals for multiple d20s', () => {
    const { terms } = rollTerms(parseExpression('2d20'), seq(20, 20));
    expect(detectNatural(terms)).toBeUndefined();
  });
});

describe('Daggerheart duality dice', () => {
  it('higher Hope die means "with Hope"', () => {
    const r = rollDuality(2, 'normal', seq(9, 4));
    expect(r.total).toBe(15);
    expect(r.duality.outcome).toBe('hope');
    expect(r.expression).toBe('2d12+2');
  });

  it('higher Fear die means "with Fear"', () => {
    expect(rollDuality(0, 'normal', seq(3, 11)).duality.outcome).toBe('fear');
  });

  it('matching dice are a critical success', () => {
    expect(rollDuality(-1, 'normal', seq(6, 6)).duality.outcome).toBe('critical');
  });

  it('advantage adds a d6 and disadvantage subtracts one', () => {
    expect(rollDuality(1, 'advantage', seq(5, 2, 4)).total).toBe(12);
    const dis = rollDuality(1, 'disadvantage', seq(5, 2, 4));
    expect(dis.total).toBe(4);
    expect(dis.expression).toBe('2d12-1d6+1');
  });
});
