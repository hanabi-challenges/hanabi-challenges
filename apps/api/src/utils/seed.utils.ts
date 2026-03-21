// Seed formula and variant resolution utilities
//
// seed_payload is stored as-is (pattern or literal) and resolved lazily at
// read/play time — no inheritance is eagerly evaluated or stored.
// Supported tokens:
//   {eID}       — event id (integer)
//   {sID}       — stage id (integer)
//   {gID}       — game number (1-based integer)
//   {mID}       — match id (integer; empty string when not in context)
//   {aID}       — attempt id (integer; empty string when not in context)
//   {tID}       — team id (integer; empty string when not in context)
//
// All tokens optionally accept an arithmetic offset suffix:
//   {gID+2}     — game number + 2 (e.g., game 1 → "3")
//   {gID-1}     — game number - 1 (e.g., game 1 → "0")
//   {sID+10}    — stage id + 10
//
// Recommended usage: include a letter prefix in the formula itself so tokens
// are self-labelling in the resolved seed, e.g. e{eID}s{sID}g{gID} → e1s3g1

export type SeedContext = {
  eventId: number;
  stageId: number;
  gameIndex: number;
  matchId?: number | null;
  attemptId?: number | null;
  teamId?: number | null;
};

// Matches {TOKEN} or {TOKEN+N} or {TOKEN-N}
const TOKEN_RE = /\{(eID|sID|gID|mID|aID|tID)([+-]\d+)?\}/g;

function applyOffset(value: number | null, offsetStr: string | undefined): string {
  if (value === null) return '';
  const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
  return String(value + offset);
}

export function resolveSeedPayload(formula: string, context: SeedContext): string {
  const baseValues: Record<string, number | null> = {
    eID: context.eventId,
    sID: context.stageId,
    gID: context.gameIndex + 1,
    mID: context.matchId ?? null,
    aID: context.attemptId ?? null,
    tID: context.teamId ?? null,
  };

  return formula.replace(TOKEN_RE, (_match, token: string, offset?: string) => {
    return applyOffset(baseValues[token], offset);
  });
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
