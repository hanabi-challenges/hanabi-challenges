import { describe, it, expect } from 'vitest';
import {
  computeSeededRankings,
  type RankableTeam,
} from '../../src/modules/leaderboards/leaderboards.service';

function makeTeam(id: number, score: number, size = 2, bdr: number | null = null): RankableTeam {
  return {
    team_id: id,
    team_size: size,
    stage_score: score,
    game_scores: [],
    total_bdr: bdr,
    members: [{ user_id: id, display_name: `Player${id}` }],
    display_name: `Team Player${id}`,
  };
}

describe('computeSeededRankings', () => {
  // ---------------------------------------------------------------------------
  // Combined leaderboard — sum scoring
  // ---------------------------------------------------------------------------

  it('returns empty array for no teams', () => {
    const result = computeSeededRankings([], [], true);
    expect(result).toEqual([]);
  });

  it('ranks single team as rank 1', () => {
    const result = computeSeededRankings([makeTeam(1, 45)], [], true);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].stage_score).toBe(45);
  });

  it('ranks teams by stage_score descending (combined)', () => {
    const teams = [makeTeam(1, 30), makeTeam(2, 45), makeTeam(3, 25)];
    const result = computeSeededRankings(teams, [], true);
    expect(result[0].team.id).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].team.id).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].team.id).toBe(3);
    expect(result[2].rank).toBe(3);
  });

  it('assigns same rank to tied teams', () => {
    const teams = [makeTeam(1, 40), makeTeam(2, 40), makeTeam(3, 35)];
    const result = computeSeededRankings(teams, [], true);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Tiebreaking by BDR
  // ---------------------------------------------------------------------------

  it('breaks ties with bdr_desc (higher BDR wins)', () => {
    const teams = [makeTeam(1, 40, 2, 3), makeTeam(2, 40, 2, 5)];
    const result = computeSeededRankings(teams, ['bdr_desc'], true);
    expect(result[0].team.id).toBe(2); // higher BDR = rank 1
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('breaks ties with bdr_asc (lower BDR wins)', () => {
    const teams = [makeTeam(1, 40, 2, 5), makeTeam(2, 40, 2, 3)];
    const result = computeSeededRankings(teams, ['bdr_asc'], true);
    expect(result[0].team.id).toBe(2); // lower BDR = rank 1
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('falls back to full tie when BDR is also equal', () => {
    const teams = [makeTeam(1, 40, 2, 4), makeTeam(2, 40, 2, 4)];
    const result = computeSeededRankings(teams, ['bdr_desc'], true);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Per-track leaderboard (combined_leaderboard = false)
  // ---------------------------------------------------------------------------

  it('ranks within team_size groups when not combined', () => {
    const teams = [makeTeam(1, 40, 2), makeTeam(2, 35, 2), makeTeam(3, 50, 3), makeTeam(4, 45, 3)];
    const result = computeSeededRankings(teams, [], false);
    // 2-player teams ranked separately
    const size2 = result.filter((e) => e.team_size === 2);
    const size3 = result.filter((e) => e.team_size === 3);
    expect(size2[0].team.id).toBe(1);
    expect(size2[0].rank).toBe(1);
    expect(size2[1].rank).toBe(2);
    expect(size3[0].team.id).toBe(3);
    expect(size3[0].rank).toBe(1);
    expect(size3[1].rank).toBe(2);
  });

  it('per-track ranks do not bleed across team sizes', () => {
    // 3-player team with lower score than the 2-player rank-1 should still be rank 1 in its track
    const teams = [makeTeam(1, 40, 2), makeTeam(2, 30, 3)];
    const result = computeSeededRankings(teams, [], false);
    const e1 = result.find((e) => e.team.id === 1)!;
    const e2 = result.find((e) => e.team.id === 2)!;
    expect(e1.rank).toBe(1);
    expect(e2.rank).toBe(1); // rank 1 in its own track
  });

  it('combined mode merges all team sizes into one ranking', () => {
    const teams = [makeTeam(1, 40, 2), makeTeam(2, 50, 3)];
    const result = computeSeededRankings(teams, [], true);
    expect(result[0].team.id).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].team.id).toBe(1);
    expect(result[1].rank).toBe(2);
  });
});
