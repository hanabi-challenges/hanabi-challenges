import { describe, expect, it } from 'vitest';
import {
  END_CONDITIONS_TURNS_VICTORY,
  END_CONDITION_NAMES,
} from '../../../src/modules/session-ladder/session-ladder.end-condition';
import { classifyVictoryType } from '../../../src/modules/session-ladder/session-ladder.service';

describe('session-ladder end-condition mapping', () => {
  it('contains canonical labels and turns mapping', () => {
    expect(END_CONDITION_NAMES[1]).toBe('Perfect');
    expect(END_CONDITION_NAMES[2]).toBe('Strike Out');
    expect(END_CONDITION_NAMES[3]).toBe('Time Out');
    expect(END_CONDITION_NAMES[10]).toBe('Terminated By Vote');
    expect(END_CONDITIONS_TURNS_VICTORY.has(3)).toBe(true);
    expect(END_CONDITIONS_TURNS_VICTORY.has(4)).toBe(true);
    expect(END_CONDITIONS_TURNS_VICTORY.has(10)).toBe(true);
  });

  it('treats unknown end conditions as score mode', () => {
    expect(classifyVictoryType({ endCondition: 999, bottomDeckRisk: null })).toBe('score');
  });
});

