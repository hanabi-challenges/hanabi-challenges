export type BadgeTierKey = 'gold' | 'silver' | 'bronze' | 'participant';

const TIER_ORDER: BadgeTierKey[] = ['gold', 'silver', 'bronze', 'participant'];

/**
 * Resolves set-notation text by tier.
 * Example: "S2 {Winner, Medalist, Medalist, Participant}".
 * If there are fewer entries than tiers, the final provided entry is reused.
 * Escaped braces (\{ and \}) are treated as literals.
 */
export function resolveBadgeTextTemplate(template: string, tier: BadgeTierKey): string {
  const leftSentinel = '__LBRACE__';
  const rightSentinel = '__RBRACE__';
  const protectedTemplate = template
    .replaceAll('\\{', leftSentinel)
    .replaceAll('\\}', rightSentinel);
  const tierIndex = Math.max(0, TIER_ORDER.indexOf(tier));
  const resolved = protectedTemplate.replace(/\{([^{}]*)\}/g, (_match, inner: string) => {
    const values = inner.split(',').map((value) => value.trim());
    if (values.length === 0) return '';
    const choice =
      values[Math.min(tierIndex, values.length - 1)] ?? values[values.length - 1] ?? '';
    return choice;
  });
  return resolved.replaceAll(leftSentinel, '{').replaceAll(rightSentinel, '}');
}
