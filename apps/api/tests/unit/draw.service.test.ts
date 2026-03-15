import { describe, it, expect } from 'vitest';
import { runQueuedDraw } from '../../src/modules/stages/draw.service';

type Player = { user_id: number; display_name: string; partner_user_id: number | null };

function solo(id: number, name: string): Player {
  return { user_id: id, display_name: name, partner_user_id: null };
}

function paired(id: number, name: string, partnerId: number): Player {
  return { user_id: id, display_name: name, partner_user_id: partnerId };
}

const SIZES_2 = [2];
const SIZES_2_3 = [2, 3];

describe('runQueuedDraw', () => {
  it('2 solo players → 1 proposed pair', () => {
    const result = runQueuedDraw([solo(1, 'alice'), solo(2, 'bob')], SIZES_2);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].kind).toBe('PROPOSED_PAIR');
    expect(result.teams[0].user_ids).toEqual(expect.arrayContaining([1, 2]));
    expect(result.unmatched).toHaveLength(0);
  });

  it('3 solo players with size-2 only → 1 pair + 1 unmatched', () => {
    const result = runQueuedDraw([solo(1, 'alice'), solo(2, 'bob'), solo(3, 'charlie')], SIZES_2);
    expect(result.teams).toHaveLength(1);
    expect(result.unmatched).toHaveLength(1);
  });

  it('3 solo players with sizes [2,3] → 1 trio', () => {
    const result = runQueuedDraw([solo(1, 'alice'), solo(2, 'bob'), solo(3, 'charlie')], SIZES_2_3);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].kind).toBe('PROPOSED_TRIO');
    expect(result.teams[0].user_ids).toHaveLength(3);
    expect(result.unmatched).toHaveLength(0);
  });

  it('4 solo players → 2 proposed pairs', () => {
    const result = runQueuedDraw(
      [solo(1, 'alice'), solo(2, 'bob'), solo(3, 'charlie'), solo(4, 'dave')],
      SIZES_2,
    );
    expect(result.teams).toHaveLength(2);
    expect(result.teams.every((t) => t.kind === 'PROPOSED_PAIR')).toBe(true);
    expect(result.unmatched).toHaveLength(0);
  });

  it('5 solo players with sizes [2,3] → 1 pair + 1 trio', () => {
    const result = runQueuedDraw(
      [solo(1, 'alice'), solo(2, 'bob'), solo(3, 'charlie'), solo(4, 'dave'), solo(5, 'eve')],
      SIZES_2_3,
    );
    expect(result.teams).toHaveLength(2);
    const kinds = result.teams.map((t) => t.kind).sort();
    expect(kinds).toEqual(['PROPOSED_PAIR', 'PROPOSED_TRIO']);
    expect(result.unmatched).toHaveLength(0);
  });

  it('6 solo players → 3 proposed pairs', () => {
    const result = runQueuedDraw(
      [solo(1, 'a'), solo(2, 'b'), solo(3, 'c'), solo(4, 'd'), solo(5, 'e'), solo(6, 'f')],
      SIZES_2,
    );
    expect(result.teams).toHaveLength(3);
    expect(result.unmatched).toHaveLength(0);
  });

  it('confirmed mutual pair is identified correctly', () => {
    const optIns: Player[] = [paired(1, 'alice', 2), paired(2, 'bob', 1)];
    const result = runQueuedDraw(optIns, SIZES_2);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].kind).toBe('CONFIRMED_PAIR');
    expect(result.unmatched).toHaveLength(0);
  });

  it('one-sided partner request falls into solo pool', () => {
    // Alice names Bob, but Bob opted in solo
    const optIns: Player[] = [paired(1, 'alice', 2), solo(2, 'bob')];
    const result = runQueuedDraw(optIns, SIZES_2);
    // Not a confirmed pair — both end up in solo pool → proposed pair
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].kind).toBe('PROPOSED_PAIR');
  });

  it('confirmed pair + 2 solos → 1 confirmed pair + 1 proposed pair', () => {
    const optIns: Player[] = [
      paired(1, 'alice', 2),
      paired(2, 'bob', 1),
      solo(3, 'charlie'),
      solo(4, 'dave'),
    ];
    const result = runQueuedDraw(optIns, SIZES_2);
    expect(result.teams).toHaveLength(2);
    const confirmed = result.teams.filter((t) => t.kind === 'CONFIRMED_PAIR');
    const proposed = result.teams.filter((t) => t.kind === 'PROPOSED_PAIR');
    expect(confirmed).toHaveLength(1);
    expect(proposed).toHaveLength(1);
  });

  it('empty opt-in list → empty draw', () => {
    const result = runQueuedDraw([], SIZES_2);
    expect(result.teams).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
  });

  it('pairs are sorted alphabetically for determinism', () => {
    // Regardless of input order, alice comes before bob in the pair
    const result = runQueuedDraw([solo(2, 'bob'), solo(1, 'alice')], SIZES_2);
    expect(result.teams[0].display_names[0]).toBe('alice');
    expect(result.teams[0].display_names[1]).toBe('bob');
  });
});
