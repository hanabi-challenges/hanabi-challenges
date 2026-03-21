# ADR 0004: Event Model Redesign

**Status:** Accepted — pending implementation
**Date:** 2026-03-15
**Context:** Full greenfield redesign of the event, stage, and scoring data model

---

## Motivation

The existing event model hardcodes three event formats (`challenge`, `tournament`, `session_ladder`) with parallel, largely non-overlapping table structures. This made it impossible to represent the **Boom & Bloom Spring Open** — an 8-week async challenge series followed by a playoff bracket — and would require bespoke engineering for any future event that doesn't fit one of the three fixed shapes.

The redesign goal: a composable model where any known competitive event pattern can be expressed through configuration values, and adding a new pattern requires no schema changes.

---

## Core Design Decisions

### 1. Events are inert containers

Events hold metadata and registration configuration only. All competitive behavior lives in stages. The `event_format` field is removed as a behavioral driver (it can remain as a display/category label if desired, but has no effect on logic).

**Removed from events:** `event_format`, `status` (inferred), `starts_at`/`ends_at` (inferred), `owner_user_id` (moved to `event_admins`), `round_robin_enabled`, `max_teams`, `max_rounds`.

---

### 2. Three and only three stage mechanisms

After evaluating what makes competitive structures genuinely distinct (different implementation logic, not just different parameter values):

| Mechanism | Description |
|---|---|
| `SEEDED_LEADERBOARD` | All participants play the same fixed seeds; scores compared openly across the field. Covers challenges, league weeks, ladders — they differ only in configuration. |
| `GAUNTLET` | An ordered sequence of seeds played as a single indivisible attempt. Partial runs produce no score. Multiple attempts allowed; stage score = best complete attempt. |
| `MATCH_PLAY` | Two specific opponents play the same seeds head-to-head. Match results determine advancement. Bracket structure (single-elim, double-elim, round-robin, Swiss) is configuration of this mechanism, not a separate mechanism. A 64-team bracket is one MATCH_PLAY stage, not 63 stages. |

**Explicitly rejected:** `Challenge` and `Ladder` as separate mechanisms. They are identical in structure; differences in time window, team assignment, and scoring method are configuration values.

---

### 3. Stages have independent behavioral dimensions

A stage is not a "type" — it is a combination of values across independent axes:

| Dimension | Values | Notes |
|---|---|---|
| `mechanism` | `SEEDED_LEADERBOARD`, `GAUNTLET`, `MATCH_PLAY` | See above |
| `team_policy` | `SELF_FORMED`, `QUEUED` | Who assembles the team |
| `team_scope` | `EVENT`, `STAGE` | How long the team persists |
| `attempt_policy` | `SINGLE`, `REQUIRED_ALL`, `BEST_OF_N`, `UNLIMITED_BEST` | How many plays are allowed |
| `time_policy` | `WINDOW`, `ROLLING`, `SCHEDULED` | Temporal structure of play |
| `game_scoring_config_json` | Open JSON | How individual game results are evaluated (e.g., tiebreaker chains: score → BDR → turns) |
| `stage_scoring_config_json` | Open JSON | How game results roll up into stage standings (e.g., sum, ELO, win%) |

**Scoring enums are intentionally not locked.** Both scoring configs use open JSON to allow future methods without schema changes.

**`config_json`** holds mechanism-specific knobs (bracket type and match format for MATCH_PLAY; k-factor and participation bonus for ELO stages; attempt limit for BEST_OF_N).

---

### 4. Stage relationships are first-class entities

Stages are connected by explicit edges, not implicit ordering. An edge describes who qualifies from the source stage into the target stage and how they are seeded. This models:

- Linear chains (most events)
- Multiple qualifying stages converging into one bracket (Boom & Bloom: 8 challenge stages → 1 bracket)
- Branching or multi-group structures

`stage_index` is retained for display ordering but has no bearing on data flow.

---

### 5. Team size is event-level configuration

**Decision:** Team size is configured at the event level, not the stage level.

**Rationale:** No plausible competitive Hanabi event requires team size to vary between stages. The probability is very low; the complexity cost of stage-level team size is high and pervasive (touches registration, game definitions, leaderboards, participation tracking); and refactoring from event-level to stage-level later is tractable (moderate scope, well-contained).

**Model:**
- `allowed_team_sizes INTEGER[]` — e.g., `{2}` for 2p-only, `{2,3,4,5,6}` for all tracks
- `combined_leaderboard BOOLEAN` — `false` = separate leaderboard per team size (per-track); `true` = all sizes on one leaderboard (flexible)

A "fixed size" event is simply `allowed_team_sizes = {N}` with any `combined_leaderboard` value.

---

### 6. Individual-first registration; teams are the unit of play

**Registration** is always at the individual player level (`event_registrations`). Teams are a separate, derived concept.

**Teams** (`event_teams`) represent the group that plays together for a stage or event. They are scoped by `team_scope`:
- `EVENT` scope: same team throughout (traditional tournament)
- `STAGE` scope: team formed per stage (weekly partner variation, randomized leagues)

**Team display names** are derived at query time — alphabetical sort of member `display_name` values, take the first, prepend "Team ". Never stored.

**Registration modes:**
- `ACTIVE`: player must explicitly sign up (challenges, Boom & Bloom)
- `PASSIVE`: participation established by playing (legacy League behavior)

**FLUID team policy was rejected.** What was called FLUID is just `SELF_FORMED` + `STAGE` scope — the same mechanism as FIXED, different scope. The `team_policy` dimension becomes `SELF_FORMED | QUEUED`.

---

### 7. Variant/seed cascade is creation-time propagation, not runtime inheritance

**Decision:** All variant and seed values are stored explicitly at the game level (`event_stage_games.variant_id`, `event_stage_games.seed_payload`). There is no runtime null-means-inherit logic.

**How it works:** The admin defines propagation templates at the event level (`variant_rule_json`, `seed_rule_json`) and optionally overrides at the stage level. When game slots are created, the admin UI evaluates these templates and writes the resulting values directly to the game record. For example, seed formula `{eID}-{sID}-{gID}` is evaluated at creation time and stored as a literal string.

**Implication:** Changing a template after games are created does not retroactively update existing games. The UI should either prevent reordering stages after games exist, or surface an explicit "regenerate seeds" action.

`variant_rule_json` and `seed_rule_json` on events and stages are stored as admin UI helpers (so templates can be referenced or reused), but are never consulted at query time.

---

### 8. Event and stage status is inferred, never stored

Status is computed from stage dates and time policies. The full vocabulary:

| Status | Condition |
|---|---|
| `ANNOUNCED` | Published; registration not yet open |
| `REGISTRATION_OPEN` | Within the registration window |
| `UPCOMING` | Registration closed; no stage has started |
| `IN_PROGRESS` | At least one `WINDOW` stage is currently active |
| `LIVE` | A `SCHEDULED` stage is currently active |
| `COMPLETE` | All stages have ended |

`LIVE` only surfaces when a `SCHEDULED` stage is active. `LIVE` takes precedence over `IN_PROGRESS` if both conditions hold simultaneously. Async events (`WINDOW`) never show `LIVE`.

---

### 9. Awards are stage-level with flexible criteria

Awards are defined per stage (or per event aggregate). They support rank-based (`RANK_POSITION`), score-threshold (`SCORE_THRESHOLD`), participation (`PARTICIPATION`), and manual (`MANUAL`) criteria — all expressed as open JSON in `criteria_value`.

This supports both "1st/2nd/3rd" and "90%+/80%+/70%+" patterns without enum changes. Awards have `team_size` scoping for per-track events and `sort_order` for display sequencing.

---

### 10. ELO ratings are materialized

A `event_player_ratings` table stores current rating per player per stage. Updated transactionally when results are processed. Scoped to stage (not event) since multiple stages in an event could theoretically use different scoring methods.

---

### 11. Ownership model

`owner_user_id` is removed from events. Ownership is a role within `event_admins`:
- `OWNER` — full control, transferable; enforced as exactly one per event via partial unique index
- `ADMIN` — co-administrator; multiple allowed

Superadmin (`users.role = 'SUPERADMIN'`) bypasses all event-level permission checks in application logic.

---

### 12. PostgreSQL 15+

`NULLS NOT DISTINCT` on unique constraints (used in `event_stage_games` to handle nullable `team_size`) requires PostgreSQL 15. Migration to 15+ is accepted.

---

## The Schema

### `events`
```sql
CREATE TABLE events (
  id                       SERIAL PRIMARY KEY,
  slug                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL UNIQUE,
  short_description        TEXT,
  long_description         TEXT NOT NULL,
  published                BOOLEAN NOT NULL DEFAULT FALSE,
  registration_mode        TEXT NOT NULL DEFAULT 'ACTIVE'
                             CHECK (registration_mode IN ('ACTIVE', 'PASSIVE')),
  allowed_team_sizes       INTEGER[] NOT NULL,
  combined_leaderboard     BOOLEAN NOT NULL DEFAULT FALSE,
  variant_rule_json        JSONB,
  seed_rule_json           JSONB,
  aggregate_config_json    JSONB,
  registration_opens_at    TIMESTAMPTZ,
  registration_cutoff      TIMESTAMPTZ,
  allow_late_registration  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);
```

### `event_admins`
```sql
CREATE TABLE event_admins (
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN')),
  granted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE UNIQUE INDEX uq_event_one_owner
  ON event_admins (event_id)
  WHERE role = 'OWNER';
```

### `event_stages`
```sql
CREATE TABLE event_stages (
  id                        SERIAL PRIMARY KEY,
  event_id                  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  stage_index               INTEGER NOT NULL,
  mechanism                 TEXT NOT NULL
                              CHECK (mechanism IN ('SEEDED_LEADERBOARD', 'GAUNTLET', 'MATCH_PLAY')),
  team_policy               TEXT NOT NULL
                              CHECK (team_policy IN ('SELF_FORMED', 'QUEUED')),
  team_scope                TEXT NOT NULL
                              CHECK (team_scope IN ('EVENT', 'STAGE')),
  attempt_policy            TEXT NOT NULL
                              CHECK (attempt_policy IN ('SINGLE', 'REQUIRED_ALL', 'BEST_OF_N', 'UNLIMITED_BEST')),
  time_policy               TEXT NOT NULL
                              CHECK (time_policy IN ('WINDOW', 'ROLLING', 'SCHEDULED')),
  game_scoring_config_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_scoring_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  variant_rule_json         JSONB,
  seed_rule_json            JSONB,
  config_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at                 TIMESTAMPTZ,
  ends_at                   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, stage_index)
);
```

### `event_stage_relationships`
```sql
CREATE TABLE event_stage_relationships (
  id               SERIAL PRIMARY KEY,
  source_stage_id  INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  target_stage_id  INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  filter_type      TEXT NOT NULL
                     CHECK (filter_type IN ('ALL', 'TOP_N', 'THRESHOLD', 'MANUAL')),
  filter_value     NUMERIC,
  seeding_method   TEXT NOT NULL DEFAULT 'RANKED'
                     CHECK (seeding_method IN ('RANKED', 'RANDOM', 'MANUAL')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_stage_id, target_stage_id)
);
```

### `event_stage_games`
```sql
CREATE TABLE event_stage_games (
  id            SERIAL PRIMARY KEY,
  stage_id      INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  game_index    INTEGER NOT NULL,
  team_size     INTEGER CHECK (team_size IN (2, 3, 4, 5, 6)),
  variant_id    INTEGER REFERENCES hanabi_variants(code),
  seed_payload  TEXT,
  max_score     INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (stage_id, game_index, team_size)
);
```

`team_size` null = applies to all sizes (used for `combined_leaderboard` events or single-size events). Populated per size for per-track events.

Only used by `SEEDED_LEADERBOARD` and `GAUNTLET`. `MATCH_PLAY` generates game slots at match time.

### `event_registrations`
```sql
CREATE TABLE event_registrations (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('PENDING', 'ACTIVE', 'WITHDRAWN')),
  registered_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);
```

### `event_stage_opt_ins`
Used for `QUEUED` stages where the system needs to know who is available before drawing teams. Also used for solo queue signaling.

```sql
CREATE TABLE event_stage_opt_ins (
  id               SERIAL PRIMARY KEY,
  stage_id         INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_id, user_id)
);
```

`partner_user_id` null = entering the solo queue. Non-null = pre-arranged partner (pending mutual confirmation).

### `event_teams`
```sql
CREATE TABLE event_teams (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stage_id    INTEGER REFERENCES event_stages(id) ON DELETE CASCADE,
  team_size   INTEGER NOT NULL CHECK (team_size IN (2, 3, 4, 5, 6)),
  source      TEXT NOT NULL DEFAULT 'REGISTERED'
                CHECK (source IN ('REGISTERED', 'QUEUED', 'FORMED')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_team_members (
  id             SERIAL PRIMARY KEY,
  event_team_id  INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (event_team_id, user_id)
);
```

`stage_id` null = event-scoped team (`team_scope: EVENT`). Non-null = stage-scoped team (`team_scope: STAGE`).

### `event_gauntlet_attempts`
```sql
CREATE TABLE event_gauntlet_attempts (
  id             SERIAL PRIMARY KEY,
  event_team_id  INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  stage_id       INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  completed      BOOLEAN NOT NULL DEFAULT FALSE,
  total_score    INTEGER,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  UNIQUE (event_team_id, stage_id, attempt_number)
);
```

### `event_game_results`
```sql
CREATE TABLE event_game_results (
  id                   SERIAL PRIMARY KEY,
  event_team_id        INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  stage_game_id        INTEGER NOT NULL REFERENCES event_stage_games(id) ON DELETE CASCADE,
  attempt_id           INTEGER REFERENCES event_gauntlet_attempts(id) ON DELETE CASCADE,
  score                INTEGER NOT NULL,
  zero_reason          TEXT CHECK (zero_reason IN ('Strike Out', 'Time Out', 'VTK')),
  bottom_deck_risk     INTEGER,
  hanabi_live_game_id  BIGINT,
  played_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (event_team_id, stage_game_id, attempt_id)
);

CREATE TABLE event_game_result_participants (
  id              SERIAL PRIMARY KEY,
  game_result_id  INTEGER NOT NULL REFERENCES event_game_results(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (game_result_id, user_id)
);
```

`attempt_id` null for `SEEDED_LEADERBOARD`; populated for `GAUNTLET`.

### `event_matches`
```sql
CREATE TABLE event_matches (
  id              SERIAL PRIMARY KEY,
  stage_id        INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  round_number    INTEGER NOT NULL,
  team1_id        INTEGER NOT NULL REFERENCES event_teams(id),
  team2_id        INTEGER NOT NULL REFERENCES event_teams(id),
  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE')),
  winner_team_id  INTEGER REFERENCES event_teams(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_match_game_results (
  id           SERIAL PRIMARY KEY,
  match_id     INTEGER NOT NULL REFERENCES event_matches(id) ON DELETE CASCADE,
  game_index   INTEGER NOT NULL,
  variant_id   INTEGER REFERENCES hanabi_variants(code),
  seed_payload TEXT,
  team1_score  INTEGER,
  team2_score  INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (match_id, game_index)
);
```

### `event_match_play_entries`
Explicit bracket enrollment, populated from stage relationship qualification before the draw is run.

```sql
CREATE TABLE event_match_play_entries (
  id             SERIAL PRIMARY KEY,
  stage_id       INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  event_team_id  INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  seed           INTEGER,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_id, event_team_id)
);
```

### `event_awards`
```sql
CREATE TABLE event_awards (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stage_id        INTEGER REFERENCES event_stages(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  criteria_type   TEXT NOT NULL
                    CHECK (criteria_type IN ('RANK_POSITION', 'SCORE_THRESHOLD', 'PARTICIPATION', 'MANUAL')),
  criteria_value  JSONB,
  attribution     TEXT NOT NULL DEFAULT 'INDIVIDUAL'
                    CHECK (attribution IN ('INDIVIDUAL', 'TEAM')),
  team_size       INTEGER CHECK (team_size IN (2, 3, 4, 5, 6)),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_award_grants (
  id             SERIAL PRIMARY KEY,
  award_id       INTEGER NOT NULL REFERENCES event_awards(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_team_id  INTEGER REFERENCES event_teams(id) ON DELETE SET NULL,
  granted_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (award_id, user_id)
);
```

`stage_id` null = event aggregate award. `team_size` null = applies to all sizes or non-per-track events.

### `event_player_ratings`
```sql
CREATE TABLE event_player_ratings (
  stage_id        INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          NUMERIC(10, 3) NOT NULL DEFAULT 1000,
  games_played    INTEGER NOT NULL DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (stage_id, user_id)
);

CREATE INDEX idx_event_player_ratings_rank
  ON event_player_ratings (stage_id, rating DESC);
```

---

## Tables Retained Unchanged

- `users`
- `hanabi_variants`
- `hanabi_variant_sync_state`
- `badge_sets`
- `event_badge_set_links`
- `event_challenge_badge_config`
- `event_badges`
- `event_badge_awards`
- `user_notifications` (trigger may need updating)
- `admin_access_requests`
- `schema_migrations`

---

## Tables Removed in This Redesign

| Removed | Replaced by |
|---|---|
| `event_session_ladder_config` | `event_stages.config_json` |
| `event_sessions` | Stages with `time_policy: ROLLING` |
| `event_session_rounds` | `event_matches` or implicit in results |
| `event_session_presence` | Real-time concern, out of scope |
| `event_session_round_players` | `event_game_result_participants` |
| `event_session_round_team_results` | `event_game_results` |
| `event_player_ratings` (old) | `event_player_ratings` (new, stage-scoped) |
| `event_rating_ledger` | `event_game_results` with delta columns if needed |
| `event_game_templates` | `event_stage_games` |
| `event_games` | `event_game_results` |
| `event_stage_team_statuses` | Derivable from results |
| `event_player_eligibilities` | `event_registrations` |
| `event_teams` (old, named) | `event_teams` (new, unnamed, derived display) |
| `team_memberships` | `event_team_members` |
| `pending_team_members` | Out of scope for now |

---

## Known Patterns Expressed in This Model

### Boom & Bloom Spring Open (2p, 8-week async series + playoffs)
```
Event:
  allowed_team_sizes: {2}
  combined_leaderboard: false
  registration_mode: ACTIVE
  aggregate_config_json: { method: "sum" }

Stages 1–8 (SEEDED_LEADERBOARD):
  mechanism: SEEDED_LEADERBOARD
  team_policy: SELF_FORMED
  team_scope: STAGE
  attempt_policy: REQUIRED_ALL
  time_policy: WINDOW
  stage_scoring_config_json: { method: "sum" }
  variant_rule_json: { type: "specific", name: "<variant for that week>" }

  Relationships: each stage → Stage 9, filter_type: ALL, seeding_method: RANKED

Stage 9 (Playoffs):
  mechanism: MATCH_PLAY
  team_policy: SELF_FORMED
  team_scope: EVENT  (fixed for the bracket)
  time_policy: WINDOW
  config_json: { bracket_type: "SINGLE_ELIMINATION", match_format: "best_of_1" }
```

### Challenge (5 parallel tracks, one per team size)
```
Event:
  allowed_team_sizes: {2, 3, 4, 5, 6}
  combined_leaderboard: false
  registration_mode: ACTIVE

Stage 1 (SEEDED_LEADERBOARD):
  mechanism: SEEDED_LEADERBOARD
  team_policy: SELF_FORMED
  team_scope: EVENT
  attempt_policy: REQUIRED_ALL
  time_policy: WINDOW

  event_stage_games: one row per (game_index, team_size) — 5 seeds per track
```

### League (randomized teams, passive registration, rolling ELO)
```
Event:
  allowed_team_sizes: {3, 4}   (or whatever sizes the league supports)
  combined_leaderboard: true
  registration_mode: PASSIVE

Stage (SEEDED_LEADERBOARD, rolling):
  mechanism: SEEDED_LEADERBOARD
  team_policy: QUEUED
  team_scope: STAGE
  attempt_policy: SINGLE
  time_policy: ROLLING
  stage_scoring_config_json: { method: "elo", k_factor: 24, participation_bonus: 0.5 }
```

---

## Deferred / Out of Scope

- **Pending team members** (invite-by-name for players without accounts) — removed, not yet re-modeled
- **Real-time session presence** — not part of this schema; remains a real-time/WebSocket concern
- **Swiss bracket draw algorithm** — recognized as a valid bracket type for MATCH_PLAY; implementation deferred
- **Double-elimination bracket** — recognized; implementation deferred
- **Rating ledger** — if a full audit trail of ELO changes is needed, a ledger table can be added alongside `event_player_ratings`; deferred
- **Admin UI / event creation wizard** — full UI to be built; no timeline pressure

---

## Build Phases

### Phase 1 — Core SEEDED_LEADERBOARD (target: Boom & Bloom)
1. Schema migration (new tables)
2. Event + stage + relationship CRUD (backend + admin)
3. Active registration flow
4. SELF_FORMED team creation (EVENT and STAGE scope)
5. Game definitions (admin creates slots with variant + seed)
6. Result submission
7. Stage leaderboard queries
8. Aggregate leaderboard queries
9. Award definitions + automated grant evaluation

### Phase 2 — MATCH_PLAY (before Boom & Bloom week 8)
10. Bracket enrollment (`event_match_play_entries`)
11. Bracket draw (single-elimination)
12. Match result submission
13. Bracket advancement logic

### Phase 3 — Remaining mechanisms
14. QUEUED team assignment + stage opt-ins
15. GAUNTLET mechanism (attempt tracking, best-attempt scoring)
16. ELO scoring + materialized ratings
17. Advanced bracket types (double-elim, Swiss)
