import { describe, expect, it } from 'vitest';
import {
  resolveSeedPayload,
  resolveVariantId,
  type VariantRule,
} from '../../../src/utils/seed.utils';

describe('resolveSeedPayload', () => {
  it('substitutes all tokens', () => {
    expect(
      resolveSeedPayload('{eID}-{sID}-{gID}-{tSize}', {
        eventId: 3,
        stageId: 7,
        gameIndex: 2,
        teamSize: 4,
      }),
    ).toBe('3-7-2-4');
  });

  it('substitutes {tSize} as empty string when teamSize is null', () => {
    expect(
      resolveSeedPayload('{eID}-{sID}-{gID}-{tSize}', {
        eventId: 1,
        stageId: 1,
        gameIndex: 1,
        teamSize: null,
      }),
    ).toBe('1-1-1-');
  });

  it('handles a formula with only some tokens', () => {
    expect(
      resolveSeedPayload('NVC-{eID}-{gID}', {
        eventId: 5,
        stageId: 2,
        gameIndex: 3,
        teamSize: 2,
      }),
    ).toBe('NVC-5-3');
  });

  it('replaces multiple occurrences of the same token', () => {
    expect(
      resolveSeedPayload('{eID}:{eID}:{gID}', {
        eventId: 9,
        stageId: 1,
        gameIndex: 1,
        teamSize: 2,
      }),
    ).toBe('9:9:1');
  });

  it('returns formula unchanged when no tokens are present', () => {
    expect(
      resolveSeedPayload('static-seed', {
        eventId: 1,
        stageId: 1,
        gameIndex: 1,
        teamSize: 2,
      }),
    ).toBe('static-seed');
  });
});

describe('resolveVariantId', () => {
  const specific = (id: number): VariantRule => ({ type: 'specific', variantId: id });
  const none: VariantRule = { type: 'none' };

  it('returns game-level rule first', () => {
    expect(resolveVariantId(specific(10), specific(20), specific(30))).toBe(10);
  });

  it('falls through to stage-level when game rule is null', () => {
    expect(resolveVariantId(null, specific(20), specific(30))).toBe(20);
  });

  it('falls through to event-level when game and stage rules are null', () => {
    expect(resolveVariantId(null, null, specific(30))).toBe(30);
  });

  it('returns null when all rules are null', () => {
    expect(resolveVariantId(null, null, null)).toBeNull();
  });

  it('type "none" resolves to 0 (No Variant)', () => {
    expect(resolveVariantId(null, none, specific(5))).toBe(0);
  });

  it('game-level "none" takes precedence over stage "specific"', () => {
    expect(resolveVariantId(none, specific(5), null)).toBe(0);
  });
});
