import { describe, expect, it } from 'vitest';
import {
  resolveSeedPayload,
  resolveVariantId,
  type VariantRule,
} from '../../../src/utils/seed.utils';

describe('resolveSeedPayload', () => {
  it('substitutes core tokens as plain integers ({gID} is 1-based)', () => {
    expect(
      resolveSeedPayload('e{eID}s{sID}g{gID}', {
        eventId: 3,
        stageId: 7,
        gameIndex: 2,
      }),
    ).toBe('e3s7g3');
  });

  it('substitutes optional tokens when provided', () => {
    expect(
      resolveSeedPayload('{eID}-{mID}-{aID}-{tID}', {
        eventId: 3,
        stageId: 7,
        gameIndex: 2,
        matchId: 5,
        attemptId: 8,
        teamId: 42,
      }),
    ).toBe('3-5-8-42');
  });

  it('substitutes optional tokens as empty string when null', () => {
    expect(
      resolveSeedPayload('{eID}-{mID}-{aID}-{tID}', {
        eventId: 1,
        stageId: 1,
        gameIndex: 1,
        matchId: null,
        attemptId: null,
        teamId: null,
      }),
    ).toBe('1---');
  });

  it('substitutes optional tokens as empty string when absent', () => {
    expect(
      resolveSeedPayload('{eID}-{sID}-{gID}-{mID}-{aID}-{tID}', {
        eventId: 1,
        stageId: 1,
        gameIndex: 1,
      }),
    ).toBe('1-1-2---');
  });

  it('handles a formula with only some tokens', () => {
    expect(
      resolveSeedPayload('NVC-{eID}-{gID}', {
        eventId: 5,
        stageId: 2,
        gameIndex: 3,
      }),
    ).toBe('NVC-5-4');
  });

  it('replaces multiple occurrences of the same token', () => {
    expect(
      resolveSeedPayload('{eID}:{eID}:{gID}', {
        eventId: 9,
        stageId: 1,
        gameIndex: 1,
      }),
    ).toBe('9:9:2');
  });

  it('returns formula unchanged when no tokens are present', () => {
    expect(
      resolveSeedPayload('static-seed', {
        eventId: 1,
        stageId: 1,
        gameIndex: 1,
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
