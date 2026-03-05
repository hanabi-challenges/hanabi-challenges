import { describe, expect, it } from 'vitest';
import {
  classifyVictoryType,
  computeTeamCompetitiveDeltas,
  resolveRoundPairwiseKFactor,
} from '../../../src/modules/session-ladder/session-ladder.service';

describe('session-ladder Elo logic', () => {
  it('maps known outcomes to expected victory type', () => {
    expect(classifyVictoryType({ endCondition: 3, bottomDeckRisk: null })).toBe('turns');
    expect(classifyVictoryType({ endCondition: 4, bottomDeckRisk: null })).toBe('turns');
    expect(classifyVictoryType({ endCondition: 10, bottomDeckRisk: null })).toBe('turns');
    expect(classifyVictoryType({ endCondition: 1, bottomDeckRisk: null })).toBe('score');
    expect(classifyVictoryType({ endCondition: 999, bottomDeckRisk: null })).toBe('score');
    expect(classifyVictoryType({ endCondition: 3, bottomDeckRisk: 0 })).toBe('bottom_deck_risk');
  });

  it('resolves K matrix by team count bucket and mode', () => {
    expect(
      resolveRoundPairwiseKFactor({
        teamCount: 2,
        defaultK: 24,
        endCondition: 1,
        bottomDeckRisk: null,
      }),
    ).toBe(48);
    expect(
      resolveRoundPairwiseKFactor({
        teamCount: 3,
        defaultK: 24,
        endCondition: 4,
        bottomDeckRisk: null,
      }),
    ).toBe(10);
    expect(
      resolveRoundPairwiseKFactor({
        teamCount: 4,
        defaultK: 24,
        endCondition: 1,
        bottomDeckRisk: 2,
      }),
    ).toBe(16);
    expect(
      resolveRoundPairwiseKFactor({
        teamCount: 1,
        defaultK: 24,
        endCondition: 1,
        bottomDeckRisk: null,
      }),
    ).toBe(24);
  });

  it('computes expected deltas for two-team equal-rating win/loss', () => {
    const deltas = computeTeamCompetitiveDeltas({
      teams: [
        { team_no: 1, score: 25, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
        { team_no: 2, score: 24, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
      ],
      defaultK: 24,
    });
    const a = deltas.find((d) => d.team_no === 1);
    const b = deltas.find((d) => d.team_no === 2);
    expect(a?.delta).toBeCloseTo(24, 6);
    expect(b?.delta).toBeCloseTo(-24, 6);
    expect(a?.k_used).toBe(48);
    expect(b?.k_used).toBe(48);
  });

  it('computes expected deltas for three-team rank ordering', () => {
    const deltas = computeTeamCompetitiveDeltas({
      teams: [
        { team_no: 1, score: 25, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
        { team_no: 2, score: 20, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
        { team_no: 3, score: 10, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
      ],
      defaultK: 24,
    });
    expect(deltas.find((d) => d.team_no === 1)?.delta).toBeCloseTo(30, 6);
    expect(deltas.find((d) => d.team_no === 2)?.delta).toBeCloseTo(0, 6);
    expect(deltas.find((d) => d.team_no === 3)?.delta).toBeCloseTo(-30, 6);
  });

  it('yields zero deltas for full tie at equal ratings', () => {
    const deltas = computeTeamCompetitiveDeltas({
      teams: [
        { team_no: 1, score: 18, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
        { team_no: 2, score: 18, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
        { team_no: 3, score: 18, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
        { team_no: 4, score: 18, avg_rating: 1000, end_condition: 1, bottom_deck_risk: null },
      ],
      defaultK: 24,
    });
    deltas.forEach((row) => expect(row.delta).toBeCloseTo(0, 6));
  });
});

