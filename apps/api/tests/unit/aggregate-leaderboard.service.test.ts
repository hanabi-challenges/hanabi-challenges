import { describe, it, expect } from 'vitest';
import {
  computeAggregateRankings,
  type TeamContribution,
} from '../../src/modules/leaderboards/leaderboards.service';

function makeTeam(
  id: number,
  contributions: { stageId: number; score: number; rank?: number | null }[],
): TeamContribution {
  return {
    team_id: id,
    team_display_name: `Team${id}`,
    members: [{ user_id: id, display_name: `Player${id}` }],
    contributions: contributions.map((c) => ({
      stage_id: c.stageId,
      stage_label: `Stage${c.stageId}`,
      score: c.score,
      rank: c.rank ?? null,
    })),
  };
}

describe('computeAggregateRankings', () => {
  // ---------------------------------------------------------------------------
  // method: sum
  // ---------------------------------------------------------------------------

  it('returns empty array when no teams', () => {
    expect(computeAggregateRankings([], { method: 'sum' })).toEqual([]);
  });

  it('excludes teams with no contributions', () => {
    const teams = [makeTeam(1, [{ stageId: 1, score: 40 }]), makeTeam(2, [])];
    const result = computeAggregateRankings(teams, { method: 'sum' });
    expect(result).toHaveLength(1);
    expect(result[0].team.id).toBe(1);
  });

  it('sums stage scores across stages', () => {
    const teams = [
      makeTeam(1, [
        { stageId: 1, score: 20 },
        { stageId: 2, score: 15 },
      ]),
    ];
    const result = computeAggregateRankings(teams, { method: 'sum' });
    expect(result[0].total_score).toBe(35);
    expect(result[0].stage_scores).toHaveLength(2);
  });

  it('ranks teams by total_score descending', () => {
    const teams = [
      makeTeam(1, [{ stageId: 1, score: 30 }]),
      makeTeam(2, [{ stageId: 1, score: 50 }]),
    ];
    const result = computeAggregateRankings(teams, { method: 'sum' });
    expect(result[0].team.id).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('assigns same rank on ties', () => {
    const teams = [
      makeTeam(1, [{ stageId: 1, score: 40 }]),
      makeTeam(2, [{ stageId: 1, score: 40 }]),
      makeTeam(3, [{ stageId: 1, score: 30 }]),
    ];
    const result = computeAggregateRankings(teams, { method: 'sum' });
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // method: best_n_of_m
  // ---------------------------------------------------------------------------

  it('best_n_of_m sums only top N scores', () => {
    const teams = [
      makeTeam(1, [
        { stageId: 1, score: 10 },
        { stageId: 2, score: 20 },
        { stageId: 3, score: 30 },
      ]),
    ];
    const result = computeAggregateRankings(teams, { method: 'best_n_of_m', n: 2 });
    expect(result[0].total_score).toBe(50); // 30 + 20, ignores 10
  });

  it('best_n_of_m: absent stage does not count (not zero)', () => {
    // Team 1 has scores 40 + 10 = 50, top 2 = 50
    // Team 2 has scores 30 + 30 = 60, top 2 = 60
    const teams = [
      makeTeam(1, [
        { stageId: 1, score: 40 },
        { stageId: 2, score: 10 },
      ]),
      makeTeam(2, [
        { stageId: 1, score: 30 },
        { stageId: 2, score: 30 },
      ]),
    ];
    const result = computeAggregateRankings(teams, { method: 'best_n_of_m', n: 2 });
    expect(result[0].team.id).toBe(2);
    expect(result[0].total_score).toBe(60);
    expect(result[1].total_score).toBe(50);
  });

  it('best_n_of_m: n larger than contributions uses all', () => {
    const teams = [makeTeam(1, [{ stageId: 1, score: 20 }])];
    const result = computeAggregateRankings(teams, { method: 'best_n_of_m', n: 5 });
    expect(result[0].total_score).toBe(20);
  });

  // ---------------------------------------------------------------------------
  // method: rank_points
  // ---------------------------------------------------------------------------

  it('rank_points converts rank to points from points_map', () => {
    const pointsMap = [25, 18, 15, 12, 10];
    const teams = [
      makeTeam(1, [{ stageId: 1, score: 0, rank: 1 }]),
      makeTeam(2, [{ stageId: 1, score: 0, rank: 2 }]),
      makeTeam(3, [{ stageId: 1, score: 0, rank: 3 }]),
    ];
    const result = computeAggregateRankings(teams, {
      method: 'rank_points',
      points_map: pointsMap,
    });
    expect(result[0].total_score).toBe(25);
    expect(result[1].total_score).toBe(18);
    expect(result[2].total_score).toBe(15);
  });

  it('rank_points: rank beyond points_map gets 0', () => {
    const teams = [makeTeam(1, [{ stageId: 1, score: 0, rank: 6 }])];
    const result = computeAggregateRankings(teams, {
      method: 'rank_points',
      points_map: [10, 8, 6],
    });
    expect(result[0].total_score).toBe(0);
  });

  it('rank_points: null rank contributes 0', () => {
    const teams = [makeTeam(1, [{ stageId: 1, score: 0, rank: null }])];
    const result = computeAggregateRankings(teams, { method: 'rank_points', points_map: [10] });
    expect(result[0].total_score).toBe(0);
  });

  it('rank_points: accumulates across multiple stages', () => {
    const pointsMap = [10, 7, 5];
    const teams = [
      makeTeam(1, [
        { stageId: 1, score: 0, rank: 1 },
        { stageId: 2, score: 0, rank: 2 },
      ]), // 10 + 7 = 17
      makeTeam(2, [
        { stageId: 1, score: 0, rank: 2 },
        { stageId: 2, score: 0, rank: 1 },
      ]), // 7 + 10 = 17
    ];
    const result = computeAggregateRankings(teams, {
      method: 'rank_points',
      points_map: pointsMap,
    });
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1); // tie
    expect(result[0].total_score).toBe(17);
  });

  it('defaults to sum method when no method specified', () => {
    const teams = [makeTeam(1, [{ stageId: 1, score: 25 }])];
    const result = computeAggregateRankings(teams, {});
    expect(result[0].total_score).toBe(25);
  });
});
