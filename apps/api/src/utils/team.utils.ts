// Team display name utility (T-012)
//
// Teams have no stored name. Display name is derived at query time:
// sort members alphabetically (case-insensitive), take the first,
// prepend "Team ". Solo team (1 member) → "Team Alice".
// Empty member list → "Team" (graceful fallback).

export function deriveTeamDisplayName(members: { display_name: string }[]): string {
  if (members.length === 0) return 'Team';

  const sorted = [...members].sort((a, b) =>
    a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase()),
  );

  return `Team ${sorted[0].display_name}`;
}
