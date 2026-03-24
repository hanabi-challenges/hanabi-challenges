import { describe, it, expect } from 'vitest';
import {
  computeGauntletRankings,
  type RankableGauntletTeam,
  type DnfGauntletTeam,
} from '../../src/modules/leaderboards/leaderboards.service';

function makeTeam(
  id: number,
  score: number,
  attemptNum = 1,
  bdr: number | null = null,
): RankableGauntletTeam {
  return {
    team_id: id,
    team_size: 2,
    total_score: score,
    best_attempt_number: attemptNum,
    game_scores: [],
    total_bdr: bdr,
    members: [{ user_id: id, display_name: `Player${id}` }],
    display_name: `Team Player${id}`,
  };
}

function makeDnf(id: number): DnfGauntletTeam {
  return {
    team_id: id,
    team_size: 2,
    members: [{ user_id: id, display_name: `Player${id}` }],
    display_name: `Team Player${id}`,
  };
}

describe('computeGauntletRankings', () => {
  it('returns empty array when no teams', () => {
    expect(computeGauntletRankings([], [], [])).toEqual([]);
  });

  it('ranks single team as rank 1', () => {
    const result = computeGauntletRankings([makeTeam(1, 75)], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].stage_score).toBe(75);
    expect(result[0].dnf).toBe(false);
  });

  it('ranks teams by total_score descending', () => {
    const teams = [makeTeam(1, 60), makeTeam(2, 75), makeTeam(3, 50)];
    const result = computeGauntletRankings(teams, [], []);
    expect(result[0].team.id).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].team.id).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].team.id).toBe(3);
    expect(result[2].rank).toBe(3);
  });

  it('assigns same rank to tied teams', () => {
    const teams = [makeTeam(1, 70), makeTeam(2, 70), makeTeam(3, 60)];
    const result = computeGauntletRankings(teams, [], []);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  it('uses only best complete attempt (highest score)', () => {
    // team 1 has attempt #2 as best (80 > 50); expect best_attempt_number = 2
    const team1 = makeTeam(1, 80, 2); // caller already resolved to best attempt
    const result = computeGauntletRankings([team1], [], []);
    expect(result[0].best_attempt_number).toBe(2);
    expect(result[0].stage_score).toBe(80);
  });

  it('appends DNF teams after ranked teams with rank null', () => {
    const ranked = [makeTeam(1, 75)];
    const dnf = [makeDnf(2), makeDnf(3)];
    const result = computeGauntletRankings(ranked, dnf, []);
    expect(result).toHaveLength(3);
    expect(result[0].rank).toBe(1);
    expect(result[1].dnf).toBe(true);
    expect(result[1].rank).toBeNull();
    expect(result[2].dnf).toBe(true);
    expect(result[2].rank).toBeNull();
  });

  it('returns only DNF teams when no ranked teams', () => {
    const result = computeGauntletRankings([], [makeDnf(1)], []);
    expect(result).toHaveLength(1);
    expect(result[0].dnf).toBe(true);
    expect(result[0].rank).toBeNull();
    expect(result[0].stage_score).toBeNull();
    expect(result[0].best_attempt_number).toBeNull();
  });

  it('breaks ties with bdr_desc (higher BDR wins)', () => {
    const teams = [makeTeam(1, 70, 1, 3), makeTeam(2, 70, 1, 5)];
    const result = computeGauntletRankings(teams, [], ['bdr_desc']);
    expect(result[0].team.id).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('breaks ties with bdr_asc (lower BDR wins)', () => {
    const teams = [makeTeam(1, 70, 1, 5), makeTeam(2, 70, 1, 3)];
    const result = computeGauntletRankings(teams, [], ['bdr_asc']);
    expect(result[0].team.id).toBe(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('includes game_scores and team fields in entries', () => {
    const team = makeTeam(1, 75);
    team.game_scores = [
      { game_index: 1, score: 25, bdr: null },
      { game_index: 2, score: 50, bdr: null },
    ];
    const result = computeGauntletRankings([team], [], []);
    expect(result[0].game_scores).toHaveLength(2);
    expect(result[0].team.display_name).toBe('Team Player1');
  });
});
