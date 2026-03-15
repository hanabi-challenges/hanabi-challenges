import { describe, it, expect } from 'vitest';
import {
  computeMatchPlayStandings,
  type RawMatchData,
  type RawTeamData,
} from '../../src/modules/leaderboards/leaderboards.service';

function makeTeam(id: number): RawTeamData {
  return { id, display_name: `Team${id}`, members: [] };
}

function makeTeamMap(...ids: number[]): Map<number, RawTeamData> {
  return new Map(ids.map((id) => [id, makeTeam(id)]));
}

function makeMatch(
  id: number,
  round: number,
  team1: number,
  team2: number,
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' = 'PENDING',
  winner: number | null = null,
): RawMatchData {
  return {
    id,
    round_number: round,
    team1_id: team1,
    team2_id: team2,
    status,
    winner_team_id: winner,
    game_results: [],
  };
}

describe('computeMatchPlayStandings', () => {
  it('returns empty state when no matches', () => {
    const result = computeMatchPlayStandings([], new Map());
    expect(result.rounds).toEqual([]);
    expect(result.entries).toEqual([]);
    expect(result.current_round).toBeNull();
  });

  it('groups matches into rounds', () => {
    const matches = [
      makeMatch(1, 1, 1, 2),
      makeMatch(2, 1, 3, 4),
      makeMatch(3, 2, 1, 3), // hypothetical round 2
    ];
    const teams = makeTeamMap(1, 2, 3, 4);
    const result = computeMatchPlayStandings(matches, teams);
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].round_number).toBe(1);
    expect(result.rounds[0].matches).toHaveLength(2);
    expect(result.rounds[1].round_number).toBe(2);
    expect(result.rounds[1].matches).toHaveLength(1);
  });

  it('sets current_round to lowest round with pending/in-progress matches', () => {
    const matches = [
      makeMatch(1, 1, 1, 2, 'COMPLETE', 1),
      makeMatch(2, 1, 3, 4, 'COMPLETE', 3),
      makeMatch(3, 2, 1, 3, 'PENDING'),
    ];
    const result = computeMatchPlayStandings(matches, makeTeamMap(1, 2, 3, 4));
    expect(result.current_round).toBe(2);
  });

  it('sets current_round to null when all matches are complete', () => {
    const matches = [
      makeMatch(1, 1, 1, 2, 'COMPLETE', 1),
      makeMatch(2, 1, 3, 4, 'COMPLETE', 3),
      makeMatch(3, 2, 1, 3, 'COMPLETE', 1),
    ];
    const result = computeMatchPlayStandings(matches, makeTeamMap(1, 2, 3, 4));
    expect(result.current_round).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Status determination
  // ---------------------------------------------------------------------------

  it('marks champion (winner of final round, bracket complete)', () => {
    const matches = [
      makeMatch(1, 1, 1, 2, 'COMPLETE', 1),
      makeMatch(2, 1, 3, 4, 'COMPLETE', 3),
      makeMatch(3, 2, 1, 3, 'COMPLETE', 1),
    ];
    const result = computeMatchPlayStandings(matches, makeTeamMap(1, 2, 3, 4));
    const champion = result.entries.find((e) => e.status === 'champion');
    expect(champion).toBeDefined();
    expect(champion!.team.id).toBe(1);
    expect(champion!.placement).toBe(1);
  });

  it('marks eliminated teams with correct placements (2-round bracket)', () => {
    const matches = [
      makeMatch(1, 1, 1, 2, 'COMPLETE', 1),
      makeMatch(2, 1, 3, 4, 'COMPLETE', 3),
      makeMatch(3, 2, 1, 3, 'COMPLETE', 1),
    ];
    const result = computeMatchPlayStandings(matches, makeTeamMap(1, 2, 3, 4));
    const eliminated = result.entries.filter((e) => e.status === 'eliminated');
    expect(eliminated).toHaveLength(3);

    const runnerUp = eliminated.find((e) => e.team.id === 3);
    expect(runnerUp!.placement).toBe(2); // lost in round 2 (final)

    const thirdPlace = eliminated.filter((e) => [2, 4].includes(e.team.id));
    expect(thirdPlace[0].placement).toBe(3); // lost in round 1 (semi-final)
    expect(thirdPlace[1].placement).toBe(3);
  });

  it('marks in-progress round teams as active', () => {
    const matches = [makeMatch(1, 1, 1, 2, 'COMPLETE', 1), makeMatch(2, 1, 3, 4, 'PENDING')];
    const result = computeMatchPlayStandings(matches, makeTeamMap(1, 2, 3, 4));

    const team2 = result.entries.find((e) => e.team.id === 2);
    expect(team2!.status).toBe('eliminated');

    // Teams 3 and 4 haven't finished yet
    const team3 = result.entries.find((e) => e.team.id === 3);
    const team4 = result.entries.find((e) => e.team.id === 4);
    expect(team3!.status).toBe('active');
    expect(team4!.status).toBe('active');

    // Team 1 won round 1 but round 2 hasn't happened yet
    const team1 = result.entries.find((e) => e.team.id === 1);
    expect(team1!.status).toBe('active');
  });

  it('includes match game_results on each match', () => {
    const match = makeMatch(1, 1, 1, 2, 'COMPLETE', 1);
    match.game_results = [{ id: 10, game_index: 1, team1_score: 3, team2_score: 2 }];
    const result = computeMatchPlayStandings([match], makeTeamMap(1, 2));
    expect(result.rounds[0].matches[0].game_results).toHaveLength(1);
    expect(result.rounds[0].matches[0].game_results[0].team1_score).toBe(3);
  });

  it('placement for 3-round bracket: round 1 losers placed 5th', () => {
    // 8 teams, 3 rounds
    const matches = [
      makeMatch(1, 1, 1, 2, 'COMPLETE', 1), // team 2 eliminated
      makeMatch(2, 1, 3, 4, 'COMPLETE', 3), // team 4 eliminated
      makeMatch(3, 1, 5, 6, 'COMPLETE', 5), // team 6 eliminated
      makeMatch(4, 1, 7, 8, 'COMPLETE', 7), // team 8 eliminated
      makeMatch(5, 2, 1, 3, 'COMPLETE', 1), // team 3 eliminated
      makeMatch(6, 2, 5, 7, 'COMPLETE', 5), // team 7 eliminated
      makeMatch(7, 3, 1, 5, 'COMPLETE', 1), // team 5 eliminated → runner-up
    ];
    const result = computeMatchPlayStandings(matches, makeTeamMap(1, 2, 3, 4, 5, 6, 7, 8));

    const champion = result.entries.find((e) => e.status === 'champion');
    expect(champion!.team.id).toBe(1);
    expect(champion!.placement).toBe(1);

    const runnerUp = result.entries.find((e) => e.team.id === 5);
    expect(runnerUp!.placement).toBe(2);

    // Round 2 losers: teams 3 and 7 → placement 3
    const semiFinalLosers = result.entries.filter((e) => [3, 7].includes(e.team.id));
    semiFinalLosers.forEach((e) => expect(e.placement).toBe(3));

    // Round 1 losers: teams 2, 4, 6, 8 → placement 5
    const qfLosers = result.entries.filter((e) => [2, 4, 6, 8].includes(e.team.id));
    qfLosers.forEach((e) => expect(e.placement).toBe(5));
  });
});
