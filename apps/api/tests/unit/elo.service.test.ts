import { describe, it, expect } from 'vitest';
import { computeEloDeltas, deriveOutcome } from '../../src/modules/leaderboards/elo.service';

const DEFAULT_CONFIG = { kFactor: 24, participationBonus: 0 };
const CONFIG_WITH_BONUS = { kFactor: 24, participationBonus: 0.5 };

// ---------------------------------------------------------------------------
// computeEloDeltas
// ---------------------------------------------------------------------------

describe('computeEloDeltas', () => {
  it('win against equal opponent increases rating by ~K/2', () => {
    const result = computeEloDeltas(1000, [1000], 'win', DEFAULT_CONFIG);
    // Expected = 0.5, actual = 1, delta = 24 * 0.5 = 12
    expect(result.delta).toBeCloseTo(12);
    expect(result.newRating).toBeCloseTo(1012);
  });

  it('loss against equal opponent decreases rating by ~K/2', () => {
    const result = computeEloDeltas(1000, [1000], 'loss', DEFAULT_CONFIG);
    expect(result.delta).toBeCloseTo(-12);
    expect(result.newRating).toBeCloseTo(988);
  });

  it('draw against equal opponent produces no change', () => {
    const result = computeEloDeltas(1000, [1000], 'draw', DEFAULT_CONFIG);
    expect(result.delta).toBeCloseTo(0);
    expect(result.newRating).toBeCloseTo(1000);
  });

  it('win against much weaker opponent yields small gain', () => {
    // Expected ≈ 0.91, actual = 1, delta ≈ 24 * 0.09 = 2.2
    const result = computeEloDeltas(1200, [800], 'win', DEFAULT_CONFIG);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.delta).toBeLessThan(5);
  });

  it('loss against much stronger opponent yields small loss', () => {
    // Expected ≈ 0.09, actual = 0, delta ≈ 24 * -0.09 = -2.2
    const result = computeEloDeltas(800, [1200], 'loss', DEFAULT_CONFIG);
    expect(result.delta).toBeLessThan(0);
    expect(result.delta).toBeGreaterThan(-5);
  });

  it('win against multiple opponents averages expected score', () => {
    // Two opponents both at 1000, so expected = 0.5 (same as single opponent)
    const single = computeEloDeltas(1000, [1000], 'win', DEFAULT_CONFIG);
    const multi = computeEloDeltas(1000, [1000, 1000], 'win', DEFAULT_CONFIG);
    expect(multi.delta).toBeCloseTo(single.delta);
  });

  it('participation bonus is always added regardless of outcome', () => {
    const win = computeEloDeltas(1000, [1000], 'win', CONFIG_WITH_BONUS);
    const loss = computeEloDeltas(1000, [1000], 'loss', CONFIG_WITH_BONUS);
    const noBonusWin = computeEloDeltas(1000, [1000], 'win', DEFAULT_CONFIG);
    const noBonusLoss = computeEloDeltas(1000, [1000], 'loss', DEFAULT_CONFIG);

    expect(win.delta - noBonusWin.delta).toBeCloseTo(0.5);
    expect(loss.delta - noBonusLoss.delta).toBeCloseTo(0.5);
  });

  it('no opponents → only participation bonus, no ELO change', () => {
    const result = computeEloDeltas(1000, [], 'win', CONFIG_WITH_BONUS);
    expect(result.delta).toBeCloseTo(0.5);
    expect(result.newRating).toBeCloseTo(1000.5);
  });

  it('no opponents with no bonus → zero change', () => {
    const result = computeEloDeltas(1000, [], 'win', DEFAULT_CONFIG);
    expect(result.delta).toBeCloseTo(0);
    expect(result.newRating).toBeCloseTo(1000);
  });

  it('higher-rated player losing yields larger rating drop than lower-rated player losing', () => {
    const highRated = computeEloDeltas(1400, [1000], 'loss', DEFAULT_CONFIG);
    const lowRated = computeEloDeltas(1000, [1400], 'loss', DEFAULT_CONFIG);
    // High-rated player expected to win, so losing is more costly
    expect(Math.abs(highRated.delta)).toBeGreaterThan(Math.abs(lowRated.delta));
  });
});

// ---------------------------------------------------------------------------
// deriveOutcome
// ---------------------------------------------------------------------------

describe('deriveOutcome', () => {
  it('returns win when score beats all opponents', () => {
    expect(deriveOutcome(25, [20, 22, 18])).toBe('win');
  });

  it('returns loss when score is below all opponents', () => {
    expect(deriveOutcome(10, [20, 22, 18])).toBe('loss');
  });

  it('returns draw when score beats some but not all', () => {
    expect(deriveOutcome(20, [18, 22])).toBe('draw');
  });

  it('returns draw when score ties all opponents', () => {
    expect(deriveOutcome(20, [20, 20])).toBe('draw');
  });

  it('returns draw when no opponents', () => {
    expect(deriveOutcome(20, [])).toBe('draw');
  });
});
