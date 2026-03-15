// Seed formula and variant resolution utilities (T-010)
//
// Seed formulas are evaluated at game-slot creation time and stored as
// literal strings — no runtime inheritance. Supported tokens:
//   {eID}   — event id
//   {sID}   — stage id
//   {gID}   — game index
//   {tSize} — team size (empty string when null)

export type SeedContext = {
  eventId: number;
  stageId: number;
  gameIndex: number;
  teamSize: number | null;
};

export function resolveSeedPayload(formula: string, context: SeedContext): string {
  return formula
    .replace(/\{eID\}/g, String(context.eventId))
    .replace(/\{sID\}/g, String(context.stageId))
    .replace(/\{gID\}/g, String(context.gameIndex))
    .replace(/\{tSize\}/g, context.teamSize !== null ? String(context.teamSize) : '');
}

// A VariantRule stored in variant_rule_json on events or stages.
// The admin UI resolves names to IDs at save time, so the rule always
// carries a numeric variantId by the time it reaches this function.
export type VariantRule = { type: 'specific'; variantId: number } | { type: 'none' }; // explicitly no variant → variant_id = 0

// Walk game-level → stage-level → event-level rules, return the first
// resolved variant_id, or null if no rule is set at any level.
export function resolveVariantId(
  gameRule: VariantRule | null,
  stageRule: VariantRule | null,
  eventRule: VariantRule | null,
): number | null {
  for (const rule of [gameRule, stageRule, eventRule]) {
    if (rule === null) continue;
    if (rule.type === 'specific') return rule.variantId;
    if (rule.type === 'none') return 0;
  }
  return null;
}
