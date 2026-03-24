import { describe, it, expect } from 'vitest';
import {
  nextPowerOfTwo,
  getRound1Pairings,
  advanceSlots,
} from '../../src/modules/stages/bracket.service';

// ---------------------------------------------------------------------------
// nextPowerOfTwo
// ---------------------------------------------------------------------------

describe('nextPowerOfTwo', () => {
  it('returns 1 for 1', () => expect(nextPowerOfTwo(1)).toBe(1));
  it('returns 2 for 2', () => expect(nextPowerOfTwo(2)).toBe(2));
  it('returns 4 for 3', () => expect(nextPowerOfTwo(3)).toBe(4));
  it('returns 4 for 4', () => expect(nextPowerOfTwo(4)).toBe(4));
  it('returns 8 for 5', () => expect(nextPowerOfTwo(5)).toBe(8));
  it('returns 8 for 6', () => expect(nextPowerOfTwo(6)).toBe(8));
  it('returns 8 for 8', () => expect(nextPowerOfTwo(8)).toBe(8));
  it('returns 16 for 9', () => expect(nextPowerOfTwo(9)).toBe(16));
  it('returns 16 for 16', () => expect(nextPowerOfTwo(16)).toBe(16));
});

// ---------------------------------------------------------------------------
// getRound1Pairings
// ---------------------------------------------------------------------------

describe('getRound1Pairings', () => {
  it('4 teams — no byes, 4 expected pairings', () => {
    const pairs = getRound1Pairings(4);
    expect(pairs).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });

  it('8 teams — no byes, 4 pairings', () => {
    const pairs = getRound1Pairings(8);
    expect(pairs).toHaveLength(4);
    expect(pairs).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
  });

  it('6 teams — 2 byes for seeds 1 and 2', () => {
    const pairs = getRound1Pairings(6);
    expect(pairs).toHaveLength(4);
    expect(pairs[0]).toEqual([1, null]); // seed 1 bye
    expect(pairs[1]).toEqual([2, null]); // seed 2 bye
    expect(pairs[2]).toEqual([3, 6]);
    expect(pairs[3]).toEqual([4, 5]);
  });

  it('5 teams — 3 byes for seeds 1, 2, 3', () => {
    const pairs = getRound1Pairings(5);
    expect(pairs).toHaveLength(4);
    expect(pairs[0]).toEqual([1, null]);
    expect(pairs[1]).toEqual([2, null]);
    expect(pairs[2]).toEqual([3, null]);
    expect(pairs[3]).toEqual([4, 5]);
  });

  it('3 teams — 1 bye for seed 1', () => {
    const pairs = getRound1Pairings(3);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual([1, null]);
    expect(pairs[1]).toEqual([2, 3]);
  });
});

// ---------------------------------------------------------------------------
// advanceSlots
// ---------------------------------------------------------------------------

describe('advanceSlots', () => {
  it('advances 4 teams correctly from round 1', () => {
    // 4 slots (P=4): {1:teamA, 2:teamB, 3:teamC, 4:teamD}
    // Match: (1v4) → teamA wins; (2v3) → teamC wins
    const slots = new Map([
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 40],
    ]);
    const matches = [
      { team1_id: 10, team2_id: 40, winner_team_id: 10 }, // teamA wins
      { team1_id: 20, team2_id: 30, winner_team_id: 30 }, // teamC wins
    ];
    const next = advanceSlots(slots, matches, 4);
    expect(next.size).toBe(2);
    expect(next.get(1)).toBe(10); // teamA in slot 1
    expect(next.get(2)).toBe(30); // teamC in slot 2
  });

  it('bye teams advance without a match (6 entries, P=8)', () => {
    // 6 entries at slots 1..6, bracket size P=8 (slots 7,8 are absent = byes for seeds 1,2)
    // Pairs: (1v8)→slot8 absent→T1 bye, (2v7)→slot7 absent→T2 bye, (3v6)→match, (4v5)→match
    const slots = new Map([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
    const matches = [
      { team1_id: 3, team2_id: 6, winner_team_id: 3 }, // T3 wins
      { team1_id: 4, team2_id: 5, winner_team_id: 5 }, // T5 wins
    ];
    const next = advanceSlots(slots, matches, 8);
    expect(next.get(1)).toBe(1); // T1 auto-advances (bye)
    expect(next.get(2)).toBe(2); // T2 auto-advances (bye)
    expect(next.get(3)).toBe(3); // T3 won (3v6)
    expect(next.get(4)).toBe(5); // T5 won (4v5)
    expect(next.size).toBe(4);
  });

  it('produces correct round-2 size from 8-team round 1', () => {
    const slots = new Map([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
      [7, 7],
      [8, 8],
    ]);
    const matches = [
      { team1_id: 1, team2_id: 8, winner_team_id: 1 },
      { team1_id: 2, team2_id: 7, winner_team_id: 2 },
      { team1_id: 3, team2_id: 6, winner_team_id: 3 },
      { team1_id: 4, team2_id: 5, winner_team_id: 4 },
    ];
    const next = advanceSlots(slots, matches, 8);
    expect(next.size).toBe(4);
    expect(next.get(1)).toBe(1);
    expect(next.get(2)).toBe(2);
    expect(next.get(3)).toBe(3);
    expect(next.get(4)).toBe(4);
  });
});
