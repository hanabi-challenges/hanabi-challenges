# ADR 0005: Stage Groups

**Status:** Accepted — pending implementation
**Date:** 2026-03-16
**Context:** Addendum to ADR 0004 (Event Model Redesign)

---

## Motivation

ADR 0004 models events as a graph of stages connected by explicit relationships. This is sufficient for the most common pattern — linear chain of stages, possibly converging into a bracket. However, it cannot cleanly express **multi-session series that produce a single combined leaderboard**.

The concrete case: **Boom** (a time-constrained variant of Boom & Bloom) runs 8 independent sessions of `SEEDED_LEADERBOARD`, each with 4 games, spaced across separate weekly time windows. All 32 games contribute to a single aggregate score that determines playoff qualification. The 8 sessions are genuinely separate stages (independent windows, independent teams, independent game sets), but they collectively act as one qualification unit.

Under the base ADR 0004 model, there are three options:

| Option | Approach | Problem |
|---|---|---|
| A | One large stage with 32 games | Breaks the time-window model; conflates structurally distinct play sessions |
| B | Event-level `aggregate_config_json` | Only supports aggregating all stages; cannot mix grouped and ungrouped stages in the same event |
| C | A grouping layer above stages | Contains, additive, no changes to existing stage mechanics |

**Option C is chosen.** It requires no changes to how individual stages work, adds a new optional entity, and can coexist with ungrouped stages in the same event.

---

## Core Design Decisions

### 1. Groups are optional and additive

An `event_stage_group` is an optional container that holds one or more stages. Ungrouped stages continue to work exactly as described in ADR 0004 — no behavioral change, no required migration for existing data.

A group:
- Has a label and display index (for ordering in the event UI)
- Holds N ≥ 1 stages (though a single-stage group is unusual)
- Produces its own leaderboard by aggregating stage scores across its member stages

---

### 2. Groups are not a mechanism — they are an aggregation layer

A group has no `mechanism` of its own. Its member stages each have their own mechanism, time windows, and configuration. The group only specifies *how to combine* the results of those stages into a single ranked output.

**Aggregation is locked to Score for non-MATCH stages.** For `SEEDED_LEADERBOARD` and `GAUNTLET`, the group score is always derived from game scores. For MATCH_PLAY, head-to-head match results are the only meaningful output and groups over MATCH_PLAY stages are not supported (matches already produce an inherent ranking within the stage).

Supported group aggregation methods (stored in `scoring_config_json`):
- `sum` — total score across all stages (default)
- `best_of_n` — best N stage scores contribute

**The same aggregation method must be consistent across all member stages.** A group cannot mix stages with incompatible scoring approaches (e.g., SEEDED_LEADERBOARD and GAUNTLET in the same group is allowed only if their stage-level scoring produces comparable values; the admin bears responsibility for this).

---

### 3. Stage relationships become polymorphic

The `event_stage_relationships` table currently supports `source_stage_id → target_stage_id`. Groups must also be able to feed into subsequent stages (e.g., a combined group leaderboard feeds into a playoff bracket).

The source of a relationship is either a stage **or** a group, never both. This is enforced with a CHECK constraint.

**New columns on `event_stage_relationships`:**
- `source_stage_id` — nullable (was NOT NULL, now nullable)
- `source_group_id` — nullable FK to `event_stage_groups`
- `CHECK ((source_stage_id IS NOT NULL) <> (source_group_id IS NOT NULL))` — exactly one must be set

Stages that are grouped **do not** carry individual output relationships to a downstream stage. The group itself carries the relationship. If a stage is in a group and also has its own downstream relationship, that relationship is treated as an error by the admin UI.

---

### 4. Group leaderboard computation

A group leaderboard is computed by:
1. For each team that participated in at least one member stage, collect their stage scores.
2. Absent stage scores (team didn't play a given stage) are treated as `null` by default. Whether `null` is coerced to `0` or excluded from the aggregation depends on `absent_score_policy` in `scoring_config_json`:
   - `null_as_zero` — substitute 0 for missing stage scores (default for score-based events)
   - `exclude` — missing stages are simply not counted toward the aggregate

3. Apply the aggregation method to produce a group score per team.
4. Sort descending by group score. Ties at the group level carry no tiebreaker logic (the group leaderboard is a qualification tool, not a final ranking).

---

### 5. Team continuity across grouped stages

Each member stage retains its own `team_scope` setting. The group leaderboard must reconcile teams across stages:

- **EVENT-scoped teams**: the same team entity participates in every stage. Aggregation is straightforward — one team row spans all stages.
- **STAGE-scoped teams**: a different team entity may represent the same players in each stage. Teams are linked at the player level: a "group team" is the set of players who appeared together at least once across the member stages.

The exact player-linking algorithm for STAGE-scoped teams is deferred (Phase 2 concern). For the immediate Boom & Bloom use case, stages use `team_scope: STAGE` and teams play the same seed with the same partners each week, so tracking is straightforward.

---

### 6. Admin UI representation

In the admin stage list, grouped stages are visually nested under their group header. A group header shows the group label, aggregation method, and a computed aggregate leaderboard link. Ungrouped stages remain at the top level.

Stage relationships from a group to a downstream stage appear on the group row, not on individual stage rows.

---

## Schema Additions

### `event_stage_groups`
```sql
CREATE TABLE event_stage_groups (
  id                    SERIAL PRIMARY KEY,
  event_id              INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label                 TEXT NOT NULL,
  group_index           INTEGER NOT NULL,
  scoring_config_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, group_index)
);
```

`scoring_config_json` shape (example):
```json
{ "method": "sum", "absent_score_policy": "null_as_zero" }
{ "method": "best_of_n", "n": 6, "absent_score_policy": "exclude" }
```

---

### `event_stages` — new column
```sql
ALTER TABLE event_stages
  ADD COLUMN group_id INTEGER REFERENCES event_stage_groups(id) ON DELETE SET NULL;
```

`group_id` null = ungrouped stage (behavior unchanged from ADR 0004).

---

### `event_stage_relationships` — polymorphic source
```sql
ALTER TABLE event_stage_relationships
  ALTER COLUMN source_stage_id DROP NOT NULL,
  ADD COLUMN source_group_id INTEGER REFERENCES event_stage_groups(id) ON DELETE CASCADE,
  ADD CONSTRAINT chk_relationship_source
    CHECK ((source_stage_id IS NOT NULL)::int + (source_group_id IS NOT NULL)::int = 1);
```

---

## Known Patterns Expressed with Groups

### Boom (8-session qualifying series → playoffs)
```
Event:
  allowed_team_sizes: {2}
  registration_mode: ACTIVE

Stage Group "Qualifying" (group_index: 0):
  scoring_config_json: { method: "sum", absent_score_policy: "null_as_zero" }
  Relationship: → Stage 9, filter_type: TOP_N, filter_value: 16, seeding_method: RANKED

Stages 1–8 (SEEDED_LEADERBOARD):
  group_id: → "Qualifying" group
  team_scope: STAGE
  attempt_policy: REQUIRED_ALL
  time_policy: WINDOW
  (no individual stage relationships)

Stage 9 (Playoffs — MATCH_PLAY):
  group_id: null  (ungrouped)
  team_scope: EVENT
```

### Standard event with ungrouped stages (no change)
```
All stages have group_id = null.
event_stage_relationships use source_stage_id as before.
```

---

## Deferred / Out of Scope

- **Player-level team linking** for STAGE-scoped grouped stages — deferred to Phase 2; the immediate use case (Boom) uses consistent teams across sessions.
- **Mixed-mechanism groups** (e.g., GAUNTLET + SEEDED_LEADERBOARD in the same group) — permitted by the schema, but the admin UI should warn when stage scoring methods diverge.
- **Group-level awards** — `event_awards.stage_id` could be extended to also accept a `group_id`; deferred until needed.
- **Nested groups** — explicitly rejected. Groups contain stages, not other groups. Depth > 1 adds complexity with no known use case.

---

## Build Phase

This feature is **Phase 1, step 8a** (inserted between aggregate leaderboard queries and award grants):

1. `event_stage_groups` table migration
2. `group_id` column on `event_stages`
3. Polymorphic source on `event_stage_relationships`
4. Group leaderboard service (aggregate from stage scores)
5. Stage relationship resolution updated to handle group sources
6. Admin UI: group creation, stage assignment to group, group relationship editor
