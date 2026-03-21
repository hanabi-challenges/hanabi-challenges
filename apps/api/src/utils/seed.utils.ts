// Seed formula and variant resolution utilities
//
// seed_payload is stored as-is (pattern or literal) and resolved lazily at
// read/play time — no inheritance is eagerly evaluated or stored.
// Supported tokens:
//   {eID}   — event id (integer)
//   {sID}   — stage id (integer)
//   {gID}   — game number (1-based integer)
//   {mID}   — match id (integer; empty string when not in context)
//   {aID}   — attempt id (integer; empty string when not in context)
//   {tID}   — team id (integer; empty string when not in context)
//
// Recommended usage: include a letter prefix in the formula itself so tokens
// are self-labelling in the resolved seed, e.g. e{eID}s{sID}g{gID} → e1s3g0

export type SeedContext = {
  eventId: number;
  stageId: number;
  gameIndex: number;
  matchId?: number | null;
  attemptId?: number | null;
  teamId?: number | null;
};

export function resolveSeedPayload(formula: string, context: SeedContext): string {
  return formula
    .replace(/\{eID\}/g, String(context.eventId))
    .replace(/\{sID\}/g, String(context.stageId))
    .replace(/\{gID\}/g, String(context.gameIndex + 1))
    .replace(/\{mID\}/g, context.matchId != null ? String(context.matchId) : '')
    .replace(/\{aID\}/g, context.attemptId != null ? String(context.attemptId) : '')
    .replace(/\{tID\}/g, context.teamId != null ? String(context.teamId) : '');
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
