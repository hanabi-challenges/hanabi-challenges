import { describe, expect, it } from 'vitest';
import { deriveTeamDisplayName } from '../../../src/utils/team.utils';

describe('deriveTeamDisplayName', () => {
  it('returns "Team" for an empty member list', () => {
    expect(deriveTeamDisplayName([])).toBe('Team');
  });

  it('handles a single member', () => {
    expect(deriveTeamDisplayName([{ display_name: 'Alice' }])).toBe('Team Alice');
  });

  it('picks the alphabetically first member', () => {
    expect(deriveTeamDisplayName([{ display_name: 'Jordan' }, { display_name: 'Alex' }])).toBe(
      'Team Alex',
    );
  });

  it('sorts case-insensitively', () => {
    expect(
      deriveTeamDisplayName([
        { display_name: 'Zara' },
        { display_name: 'alice' },
        { display_name: 'Bob' },
      ]),
    ).toBe('Team alice');
  });

  it('preserves original casing of the chosen name', () => {
    expect(deriveTeamDisplayName([{ display_name: 'MORGAN' }, { display_name: 'Bailey' }])).toBe(
      'Team Bailey',
    );
  });

  it('handles three members', () => {
    expect(
      deriveTeamDisplayName([
        { display_name: 'Charlie' },
        { display_name: 'Alex' },
        { display_name: 'Bailey' },
      ]),
    ).toBe('Team Alex');
  });

  it('does not mutate the original array', () => {
    const members = [{ display_name: 'Zoe' }, { display_name: 'Amy' }];
    deriveTeamDisplayName(members);
    expect(members[0].display_name).toBe('Zoe');
  });
});
