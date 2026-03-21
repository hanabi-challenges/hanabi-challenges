# Event Model Implementation Plan

Companion to [ADR 0004](adr/0004-event-model-redesign.md). Each ticket is ~1 day of senior-dev work. Tickets are sequential; prerequisites must be complete before starting. Mark tickets complete with `[x]` as work finishes.

---

## Phase 0 — Decisions

These must be resolved before dependent implementation begins. Each ticket is a discussion + written outcome, not a code task.

---

- [x] **T-001 — Decision: Data migration strategy**
  - **Prerequisites:** None
  - **Context:** The current DB has live event data under the old schema (`event_format`, `event_stages` with SINGLE/ROUND_ROBIN/BRACKET/GAUNTLET types, `event_game_templates`, `event_games`, `event_session_*`, etc.). The new schema is a complete redesign with no compatible table shapes. A clean break means old event data is lost unless archived.
  - **Options:** (A) Clean break — export old event data to a JSON snapshot, drop old tables, build new. (B) Parallel schemas — keep old tables read-only, new tables alongside, two code paths until old events are retired. (C) Full migration script — port existing events into the new schema programmatically.
  - **Recommendation:** Option A. The schema shapes are too different for a reliable automated migration. Export a JSON snapshot of all current events, stages, and results before dropping tables. Old event pages can be preserved as static archives if needed.
  - **Done when:** Decision is recorded here. T-006 is unblocked.

---

- [x] **T-002 — Decision: Award and badge system integration**
  - **Prerequisites:** None
  - **Context:** The existing system has `badge_sets`, `event_badges`, `event_badge_awards`, and `event_badge_set_links` — a display-oriented badge system with pre-designed visuals, tiers, and notification triggers. ADR 0004 introduces `event_awards` and `event_award_grants` — a more flexible criteria-based award system. Both are retained in the schema. The question is how they relate going forward.
  - **Options:** (A) Parallel systems — badges handle visual presentation (SVG, tiers, shapes); awards handle criteria logic. Award grants can optionally trigger badge grants. (B) Unified — `event_awards` eventually replaces `event_badges`. Awards have a display config that covers badge visuals. Migration path required. (C) Awards are abstract; badges are one visual implementation. `event_award_grants` triggers badge grant via the existing notification system.
  - **Recommendation:** Option A for now. The badge system has significant visual/design investment. `event_awards` handles criteria-based logic and automated grants. Awards can optionally reference a `badge_id` to trigger a badge grant when the award is given, wiring the two systems together without collapsing them. Revisit unification later.
  - **Done when:** Decision recorded. T-035 (Award definition API) and T-038 (Award/badge wiring) are unblocked with clear scope.

---

- [x] **T-003 — Decision: Scoring config schemas**
  - **Prerequisites:** None
  - **Context:** ADR 0004 defines two unlocked JSON scoring configs per stage. `game_scoring_config_json` governs how individual game results are evaluated and compared (e.g., tiebreaker chains). `stage_scoring_config_json` governs how game results roll up into stage standings. Neither has a locked format yet; this ticket defines the initial supported shapes.
  - **Scope:** Define and document the supported config shapes:
    - `game_scoring_config_json`: supported fields are `primary` (always `"score"`), `tiebreakers` (ordered array of strings from the set: `"bdr_desc"`, `"bdr_asc"`, `"turns_remaining_desc"`, `"turns_remaining_asc"`). Example: `{"primary": "score", "tiebreakers": ["bdr_desc"]}`. Empty `{}` means score only, no tiebreaking.
    - `stage_scoring_config_json`: supported `method` values: `"sum"` (sum of game scores), `"best_attempt"` (GAUNTLET — best complete attempt), `"win_loss"` (MATCH_PLAY — win/loss record), `"elo"` (with `k_factor` and `participation_bonus` fields). `"best_n_of_m"` with `n` field for partial-participation aggregation at the event level (in `aggregate_config_json`).
    - `aggregate_config_json` on events: `method` values: `"sum"`, `"best_n_of_m"` (with `n`), `"rank_points"` (with `points_map` array).
  - **Done when:** Spec is documented here in this ticket or in a reference doc. T-010, T-029, T-030, T-032 are unblocked.

---

- [x] **T-004 — Decision: Active registration UX and team formation flow**
  - **Prerequisites:** None
  - **Context:** Events with `registration_mode: ACTIVE` require explicit sign-up. `team_scope` determines whether teams are event-wide (same team all stages) or stage-scoped (team formed per stage). For `SELF_FORMED` + `EVENT` scope: players must register as a team. For `SELF_FORMED` + `STAGE` scope (like Boom & Bloom weeks): players register individually and form a team per stage. `QUEUED` stages bypass team formation entirely — the system draws teams.
  - **Scope:** Define the registration flows:
    - **SELF_FORMED + EVENT scope:** One player initiates a team registration (selects team size, invites partner by username). Partner must confirm. Team is not active until all members have confirmed. Pending state exists.
    - **SELF_FORMED + STAGE scope:** Individual registers for the event. Before each stage opens, they either (a) nominate a partner (partner confirms) or (b) enter the solo queue via `event_stage_opt_ins`. Teams are created when both sides confirm or when the admin runs the queued draw.
    - **QUEUED:** Individual registers for the event. They opt in per stage and may indicate a preferred partner. Admin runs the draw before the stage opens.
  - **Done when:** Flows documented. T-019–T-023 (Registration APIs) and T-074–T-076 (Registration UI) are unblocked with clear scope.

---

- [x] **T-005 — Decision: Backend module restructure**
  - **Prerequisites:** None
  - **Context:** The current API (`apps/api/src/modules/`) has modules for `events`, `variants`, and others. The new event model requires significantly restructured modules. Old event modules handle `challenge`/`tournament`/`session_ladder` logic that will be replaced.
  - **Scope:** Define the new module structure:
    - `events` — event CRUD, admin management, status inference (replaces old `events` module)
    - `stages` — stage CRUD, relationships, game definitions, propagation
    - `registrations` — event registrations, team management, stage opt-ins
    - `results` — game result submission, gauntlet attempts, match management
    - `leaderboards` — all read-only leaderboard and standings queries
    - `awards` — award definitions, grant evaluation, grant management
    - `ratings` — ELO computation and materialized ratings
    - `variants` — unchanged
    - Old session-ladder modules (`event_sessions`, `event_session_rounds`, etc.) are deleted after T-006 migration.
  - **Done when:** Module structure documented. Old modules to be deleted identified. T-009 is unblocked.

---

## Phase 1 — Database

---

- [x] **T-006 — Migration: drop old event tables, create new schema**
  - **Prerequisites:** T-001 (migration strategy decision)
  - **Context:** Full schema in ADR 0004. Tables to drop: `event_session_ladder_config`, `event_sessions`, `event_session_rounds`, `event_session_presence`, `event_session_round_players`, `event_session_round_team_results`, `event_player_ratings` (old), `event_rating_ledger`, `event_game_templates`, `event_games`, `event_stage_team_statuses`, `event_player_eligibilities`, `event_teams` (old), `team_memberships`, `pending_team_members`, `event_stages` (old), `events` (old). Tables retained: `users`, `hanabi_variants`, `hanabi_variant_sync_state`, `badge_sets`, `event_badge_set_links`, `event_challenge_badge_config`, `event_badges`, `event_badge_awards`, `user_notifications`, `admin_access_requests`, `schema_migrations`.
  - **Scope:** Write `apps/api/db/migrations/002_new_event_model.sql`. Steps: (1) export snapshot of old event data to a JSON file (optional, per T-001 decision). (2) DROP old tables in dependency order. (3) CREATE all new tables per ADR 0004 schema. (4) Re-seed `hanabi_variants` code 0 row if needed. (5) Insert migration record into `schema_migrations`.
  - **Key schema:** See ADR 0004 for all CREATE TABLE statements. Requires PostgreSQL 15+ for `NULLS NOT DISTINCT`.
  - **Done when:** Migration runs cleanly on a fresh DB and on a DB with old schema applied. All new tables exist. All old event tables are gone.

---

- [x] **T-007 — Update schema.sql to canonical new state**
  - **Prerequisites:** T-006
  - **Context:** `apps/api/db/schema.sql` is the canonical "fresh install" schema. It must reflect the post-migration state so new dev environments don't need to run migrations.
  - **Scope:** Rewrite `schema.sql` to include: all retained tables (users, hanabi_variants, etc.), all new event model tables (from ADR 0004), the `notify_badge_award_insert` trigger (update if needed for new award tables), the schema_migrations seed row for `002_new_event_model.sql`. Remove all old event table definitions.
  - **Done when:** Running `schema.sql` on a blank DB produces an identical schema to running all migrations in sequence.

---

- [x] **T-008 — Update sample_data.sql for new schema**
  - **Prerequisites:** T-007
  - **Context:** `apps/api/db/sample_data.sql` seeds dev/test data. It currently seeds events, stages, teams, and games using the old schema shape.
  - **Scope:** Rewrite `sample_data.sql` to seed: (1) two or three users, (2) a simple SEEDED_LEADERBOARD event (e.g., "No Variant Challenge") with one stage, two event_stage_games, two teams, and submitted game results. (3) A multi-stage event with a stage relationship. Enough data to exercise registration, result submission, and leaderboard queries in dev.
  - **Done when:** `sample_data.sql` runs cleanly against the new schema. Dev environment shows populated data.

---

## Phase 2 — Backend Infrastructure

---

- [x] **T-009 — Scaffold new backend module structure**
  - **Prerequisites:** T-005, T-007
  - **Context:** Module structure per T-005 decision: `events`, `stages`, `registrations`, `results`, `leaderboards`, `awards`, `ratings`. Each module gets a routes file, service file, and types file. Old session-ladder module files are deleted.
  - **Scope:** Create empty module scaffolds (routes, service, types) for all new modules. Delete old session-ladder files. Update the main router to mount new modules. Confirm the API server starts without errors.
  - **Done when:** Server starts. All old session-ladder routes are gone. New module directories exist with placeholder files.

---

- [x] **T-010 — Seed formula and variant propagation utility**
  - **Prerequisites:** T-003, T-009
  - **Context:** Admins define a seed formula at the event or stage level (e.g., `{eID}-{sID}-{gID}`). When game slots are created, the formula is evaluated and written to `event_stage_games.seed_payload`. This is a creation-time computation — no runtime inheritance. Supported tokens: `{eID}` (event id), `{sID}` (stage id), `{gID}` (game index), `{tSize}` (team size). Variant propagation works similarly: if a `variant_rule_json` is set at stage level, the admin can apply it to all game slots in that stage.
  - **Scope:** Write a utility function `resolveSeedPayload(formula: string, context: {eventId, stageId, gameIndex, teamSize}): string`. Write `resolveVariantId(variantRule: VariantRule | null, stageRule: VariantRule | null, eventRule: VariantRule | null): number | null` that walks the hierarchy. Write a batch `propagateToGameSlots(stageId, options)` service function that applies event/stage rules to all game slots in a stage.
  - **Done when:** Unit tests cover formula evaluation with all token types. Propagation function correctly writes to game slots without touching manually-overridden slots.

---

- [x] **T-011 — Status inference utilities**
  - **Prerequisites:** T-009
  - **Context:** Stage and event status are never stored — they are computed from stage dates and `time_policy`. Stage statuses: `ANNOUNCED` (published, registration not open), `REGISTRATION_OPEN`, `UPCOMING`, `IN_PROGRESS` (WINDOW stage currently active), `LIVE` (SCHEDULED stage currently active), `COMPLETE`. Event status is derived from its stages. `LIVE` takes precedence over `IN_PROGRESS`. Only SCHEDULED stages can produce `LIVE`.
  - **Scope:** Write `inferStageStatus(stage: Stage, now: Date): StageStatus`. Write `inferEventStatus(event: Event, stages: Stage[], now: Date): EventStatus`. Write `inferEventDates(stages: Stage[]): { startsAt, endsAt }` (MIN/MAX of stage dates). Export these from a shared `status.utils.ts`.
  - **Done when:** Unit tests cover all status transitions for both stage types (WINDOW and SCHEDULED) and edge cases (no stages, all stages future, mixed states).

---

- [x] **T-012 — Team display name utility**
  - **Prerequisites:** T-009
  - **Context:** Teams have no stored name. Display name is derived: sort member `display_name` values alphabetically (case-insensitive), take the first, prepend "Team ". Example: members Alex and Jordan → "Team Alex". Solo team (1 member): "Team Alex". Used everywhere teams are displayed.
  - **Scope:** Write `deriveTeamDisplayName(members: { display_name: string }[]): string`. This is a pure function. Ensure it handles empty member arrays gracefully. Add to shared utils. Use this function in all team-related query result formatters going forward.
  - **Done when:** Unit tests cover alphabetical sorting, single member, case-insensitivity.

---

## Phase 3 — Events & Stages API

---

- [x] **T-013 — Events CRUD API**
  - **Prerequisites:** T-009, T-011
  - **Context:** Schema: `events(id, slug, name, short_description, long_description, published, registration_mode, allowed_team_sizes, combined_leaderboard, variant_rule_json, seed_rule_json, aggregate_config_json, registration_opens_at, registration_cutoff, allow_late_registration, created_at)`. Status and dates are inferred from stages (use T-011 utilities). Admin-only for create/update/delete. Public read for published events.
  - **Scope:** Implement in `modules/events/`:
    - `GET /api/events` — list published events with inferred status and dates
    - `GET /api/events/:slug` — single event detail
    - `POST /api/events` — create (admin only)
    - `PUT /api/events/:slug` — update
    - `PATCH /api/events/:slug/publish` — toggle published
    - `DELETE /api/events/:slug` — delete (superadmin only; cascade deletes everything)
    - Include inferred `status`, `starts_at`, `ends_at` in all responses.
  - **Done when:** All endpoints respond correctly. Auth guards in place. Integration tests cover create/read/update/publish.

---

- [x] **T-014 — Event admins API**
  - **Prerequisites:** T-013
  - **Context:** Schema: `event_admins(event_id, user_id, role ['OWNER'|'ADMIN'], granted_by, granted_at)`. Partial unique index enforces one OWNER per event. Superadmin bypasses all checks. OWNER can add/remove ADMINs and transfer ownership. ADMIN cannot manage other admins.
  - **Scope:**
    - `GET /api/events/:slug/admins` — list admins and their roles (OWNER/ADMIN can view)
    - `POST /api/events/:slug/admins` — add admin (OWNER only)
    - `PATCH /api/events/:slug/admins/:userId/role` — change role; transferring OWNER atomically updates old OWNER to ADMIN
    - `DELETE /api/events/:slug/admins/:userId` — remove admin (OWNER only; cannot remove self if OWNER)
  - **Done when:** Ownership transfer works atomically (no window where there is no owner or two owners). Superadmin can perform all operations regardless of event role.

---

- [x] **T-015 — Stages CRUD API**
  - **Prerequisites:** T-013
  - **Context:** Schema: `event_stages(id, event_id, label, stage_index, mechanism, team_policy, team_scope, attempt_policy, time_policy, game_scoring_config_json, stage_scoring_config_json, variant_rule_json, seed_rule_json, config_json, starts_at, ends_at, created_at)`. Valid mechanism values: `SEEDED_LEADERBOARD`, `GAUNTLET`, `MATCH_PLAY`. Valid team_policy: `SELF_FORMED`, `QUEUED`. Valid team_scope: `EVENT`, `STAGE`. Valid attempt_policy: `SINGLE`, `REQUIRED_ALL`, `BEST_OF_N`, `UNLIMITED_BEST`. Valid time_policy: `WINDOW`, `ROLLING`, `SCHEDULED`.
  - **Scope:**
    - `GET /api/events/:slug/stages` — list all stages for event (include inferred status per T-011)
    - `GET /api/events/:slug/stages/:stageId` — single stage detail
    - `POST /api/events/:slug/stages` — create stage (admin only)
    - `PUT /api/events/:slug/stages/:stageId` — update stage
    - `PATCH /api/events/:slug/stages/:stageId/reorder` — update `stage_index`
    - `DELETE /api/events/:slug/stages/:stageId` — delete (blocks if game results exist)
  - **Done when:** Validation rejects invalid dimension combinations. Reordering updates `stage_index` correctly. Deletion blocked when results exist.

---

- [x] **T-016 — Stage relationships API**
  - **Prerequisites:** T-015
  - **Context:** Schema: `event_stage_relationships(id, source_stage_id, target_stage_id, filter_type, filter_value, seeding_method)`. `filter_type` values: `ALL`, `TOP_N`, `THRESHOLD`, `MANUAL`. `seeding_method` values: `RANKED`, `RANDOM`, `MANUAL`. Both stages must belong to the same event.
  - **Scope:**
    - `GET /api/events/:slug/stage-relationships` — list all relationships for event
    - `POST /api/events/:slug/stage-relationships` — create relationship (admin only; validate same-event constraint)
    - `PUT /api/events/:slug/stage-relationships/:id` — update filter/seeding config
    - `DELETE /api/events/:slug/stage-relationships/:id` — delete
  - **Done when:** Cross-event stage relationships are rejected. `filter_value` is required when `filter_type` is `TOP_N` or `THRESHOLD`.

---

- [x] **T-017 — Game definitions API**
  - **Prerequisites:** T-015, T-010
  - **Context:** Schema: `event_stage_games(id, stage_id, game_index, team_size, variant_id, seed_payload, max_score, created_at)`. `team_size` is null for single-track or combined-leaderboard events; populated per size for per-track events. `variant_id` FK to `hanabi_variants.code`. `UNIQUE NULLS NOT DISTINCT (stage_id, game_index, team_size)` prevents duplicate slots. Only used by `SEEDED_LEADERBOARD` and `GAUNTLET` stages.
  - **Scope:**
    - `GET /api/events/:slug/stages/:stageId/games` — list game slots (optionally filtered by team_size)
    - `POST /api/events/:slug/stages/:stageId/games` — create single slot (admin)
    - `POST /api/events/:slug/stages/:stageId/games/batch` — create multiple slots at once
    - `PUT /api/events/:slug/stages/:stageId/games/:gameId` — update slot (variant, seed, max_score)
    - `DELETE /api/events/:slug/stages/:stageId/games/:gameId` — delete (blocks if results exist)
    - `POST /api/events/:slug/stages/:stageId/games/propagate` — apply event/stage propagation rules to all slots in this stage (calls T-010 utility)
  - **Done when:** Batch creation works. Propagation endpoint applies formula and variant rules and writes to game slots. Blocks deletion when results exist.

---

## Phase 4 — Registration & Teams API

---

- [x] **T-018 — Event registration API**
  - **Prerequisites:** T-013, T-004
  - **Context:** Schema: `event_registrations(id, event_id, user_id, status ['PENDING'|'ACTIVE'|'WITHDRAWN'], registered_at)`. `registration_mode: ACTIVE` requires explicit registration. `registration_mode: PASSIVE` — registration is created automatically on first result submission. Registration is always at the individual level. `allow_late_registration` and `registration_cutoff` govern timing.
  - **Scope:**
    - `POST /api/events/:slug/register` — register current user (checks cutoff, allow_late_registration)
    - `DELETE /api/events/:slug/register` — withdraw registration (sets status WITHDRAWN; blocks if active game results exist for a STAGE-scoped team, warns if EVENT-scoped)
    - `GET /api/events/:slug/registrations` — list all registrations (admin only)
    - `GET /api/events/:slug/registrations/me` — current user's registration status
    - `PATCH /api/events/:slug/registrations/:userId` — admin approve/withdraw/reinstate
  - **Done when:** Cutoff and late-registration logic work correctly. Passive auto-registration is triggered in the result submission flow (T-024).

---

- [x] **T-019 — Team management API — EVENT scope**
  - **Prerequisites:** T-018, T-004
  - **Context:** Schema: `event_teams(id, event_id, stage_id, team_size, source, created_at)` + `event_team_members(id, event_team_id, user_id)`. EVENT-scoped teams have `stage_id IS NULL`. Used for `team_scope: EVENT` stages. All members must be registered for the event. Team size must be in `event.allowed_team_sizes`. Display name derived via T-012.
  - **Scope:**
    - `POST /api/events/:slug/teams` — create team (initiator + invite partners by userId; team starts PENDING until all members confirm)
    - `POST /api/events/:slug/teams/:teamId/confirm` — confirm membership (invited user accepts)
    - `DELETE /api/events/:slug/teams/:teamId/members/:userId` — remove member / decline invite
    - `GET /api/events/:slug/teams` — list all teams (admin); or teams containing current user
    - `GET /api/events/:slug/teams/:teamId` — team detail with members and derived display name
  - **Done when:** Teams cannot be created with unregistered players. Display name derived correctly. Confirmation flow works.

---

- [x] **T-020 — Team management API — STAGE scope**
  - **Prerequisites:** T-019
  - **Context:** STAGE-scoped teams have `stage_id` populated. Used for `team_scope: STAGE` stages (e.g., Boom & Bloom weeks). A player can have different team compositions across stages. All members must be registered for the event (not re-registered per stage). `source: REGISTERED` for self-formed teams.
  - **Scope:**
    - `POST /api/events/:slug/stages/:stageId/teams` — create stage-scoped team (same confirm flow as EVENT scope)
    - `GET /api/events/:slug/stages/:stageId/teams` — list stage teams
    - `GET /api/events/:slug/stages/:stageId/teams/me` — current user's team for this stage (if any)
    - Reuse team detail/confirm/remove endpoints from T-019 (they work by teamId regardless of scope)
  - **Done when:** A user can have a team in stage 1 and a different team in stage 2 of the same event. Cannot have two active stage-scoped teams for the same stage.

---

- [x] **T-021 — Stage opt-in API**
  - **Prerequisites:** T-018
  - **Context:** Schema: `event_stage_opt_ins(id, stage_id, user_id, partner_user_id, created_at)`. Used for `QUEUED` stages. `partner_user_id IS NULL` = entering solo queue. Non-null = pre-arranged partner (requires mutual opt-in before teams are drawn). User must be registered for the event.
  - **Scope:**
    - `POST /api/events/:slug/stages/:stageId/opt-in` — opt in (with optional partner_user_id)
    - `DELETE /api/events/:slug/stages/:stageId/opt-in` — opt out
    - `GET /api/events/:slug/stages/:stageId/opt-ins` — list opt-ins (admin only)
    - `GET /api/events/:slug/stages/:stageId/opt-ins/me` — current user's opt-in status
  - **Done when:** Both sides of a pre-arranged pair must opt in before the pair is considered confirmed. Solo queue opt-ins are independent.

---

- [x] **T-022 — QUEUED team draw API**
  - **Prerequisites:** T-021, T-048 (QUEUED draw algorithm — see Phase 11; can stub for now)
  - **Context:** Admin-triggered draw for `QUEUED` stages. Collects confirmed opt-ins, runs the draw algorithm (T-048), creates `event_teams` + `event_team_members` with `source: QUEUED`. Draw is idempotent if no teams exist yet. Blocked if teams already exist for this stage.
  - **Scope:**
    - `POST /api/events/:slug/stages/:stageId/draw` — admin only; runs draw, returns proposed teams for review
    - `POST /api/events/:slug/stages/:stageId/draw/confirm` — admin confirms, persists teams
    - `POST /api/events/:slug/stages/:stageId/draw/reset` — admin resets draw (deletes QUEUED teams for stage, does not delete REGISTERED or FORMED teams)
  - **Done when:** Draw creates teams for all opted-in players. Odd number of players is handled (one trio or one player is unmatched with a notification). Confirmed draw cannot be reset if results exist.

---

## Phase 5 — Games & Results API

---

- [x] **T-023 — Game result submission API**
  - **Prerequisites:** T-019, T-020, T-017
  - **Context:** Schema: `event_game_results(id, event_team_id, stage_game_id, attempt_id, score, zero_reason, bottom_deck_risk, hanabi_live_game_id, played_at)` + `event_game_result_participants(id, game_result_id, user_id)`. `attempt_id` is null for SEEDED_LEADERBOARD; populated for GAUNTLET (T-025). `UNIQUE NULLS NOT DISTINCT (event_team_id, stage_game_id, attempt_id)` prevents duplicate submissions. Only players on the team (or admins) can submit. Passive registration (T-018) is triggered here if needed.
  - **Scope:**
    - `POST /api/events/:slug/stages/:stageId/games/:gameId/results` — submit result (validates: team belongs to event, game belongs to stage, team_size matches game's team_size or null, score ≥ 0 and ≤ max_score or zero with zero_reason)
    - `GET /api/events/:slug/stages/:stageId/games/:gameId/results` — list results for game (admin); or own team's result
    - `GET /api/events/:slug/stages/:stageId/results` — all results for stage (admin) or own team's results
  - **Done when:** Duplicate submission returns 409. Score validation enforces max_score. Participants recorded. Passive registration auto-creates a registration if event allows it.

---

- [x] **T-024 — Game result management API (admin corrections)**
  - **Prerequisites:** T-023
  - **Context:** Admins need to correct or delete submitted results. Deletion should cascade cleanly and not corrupt leaderboard state.
  - **Scope:**
    - `PUT /api/events/:slug/results/:resultId` — admin override result (score, zero_reason, BDR, hanabi_live_game_id)
    - `DELETE /api/events/:slug/results/:resultId` — admin delete result
    - Both endpoints: admin only; update `played_at` to now unless explicitly provided; log the correcting admin's userId in metadata.
  - **Done when:** Corrected results appear immediately in leaderboard queries. Deletion removes participants record too.

---

- [x] **T-025 — Gauntlet attempt API**
  - **Prerequisites:** T-023
  - **Context:** Schema: `event_gauntlet_attempts(id, event_team_id, stage_id, attempt_number, completed, total_score, started_at, completed_at)`. A team can have multiple attempts. Games within an attempt must be submitted in order (game_index 1, then 2, etc.). Attempt is completed when all game slots have results. `completed = false` attempts with partial results are in-progress. Stage leaderboard uses best complete attempt (T-030).
  - **Scope:**
    - `POST /api/events/:slug/stages/:stageId/attempts` — start new attempt (creates attempt row, returns attempt_id)
    - `GET /api/events/:slug/stages/:stageId/attempts` — list attempts for own team (include completion status, total score)
    - `GET /api/events/:slug/stages/:stageId/attempts/:attemptId` — attempt detail with per-game results
    - Game results within an attempt use T-023's endpoint with `attempt_id` in body
    - `POST /api/events/:slug/stages/:stageId/attempts/:attemptId/complete` — mark complete (validates all games submitted; computes total_score)
  - **Done when:** Partial attempt blocks starting another until complete or abandoned. Games submitted out of order are rejected. `total_score` is computed on completion.

---

- [x] **T-026 — Match management API**
  - **Prerequisites:** T-019, T-020
  - **Context:** Schema: `event_matches(id, stage_id, round_number, team1_id, team2_id, status, winner_team_id)` + `event_match_game_results(id, match_id, game_index, variant_id, seed_payload, team1_score, team2_score)`. Only `MATCH_PLAY` stages have matches. Matches are generated by the bracket draw (T-042). Both teams in a match must be registered entries for the stage.
  - **Scope:**
    - `GET /api/events/:slug/stages/:stageId/matches` — list all matches (include round_number, teams, status)
    - `GET /api/events/:slug/stages/:stageId/matches/:matchId` — match detail
    - `PUT /api/events/:slug/stages/:stageId/matches/:matchId/status` — admin update status (PENDING → IN_PROGRESS → COMPLETE)
    - `POST /api/events/:slug/stages/:stageId/matches/:matchId/results` — submit game results for a match (both teams' scores for each game_index)
    - `PATCH /api/events/:slug/stages/:stageId/matches/:matchId/winner` — admin set winner (override or manual assignment)
  - **Done when:** Winner is auto-computed from game results (per match format in `config_json`). Manual override available for admin.

---

## Phase 6 — Leaderboards & Scoring

---

- [x] **T-027 — Stage leaderboard: SEEDED_LEADERBOARD**
  - **Prerequisites:** T-023, T-003, T-012
  - **Context:** For each team, compute their stage score by aggregating game results according to `stage_scoring_config_json`. If `method: "sum"` — sum all game scores. Apply `game_scoring_config_json` for tiebreaking when teams have equal stage scores. For per-track events (`combined_leaderboard: false`), group results by team_size. Display name from T-012.
  - **Scope:** Write `leaderboards.service.ts` function `getSeededLeaderboard(stageId): LeaderboardEntry[]`. Each entry: `{ rank, team: { id, display_name, members }, stage_score, game_scores: [{game_index, score, bdr, turns}], team_size }`. Tiebreaking applies `game_scoring_config_json.tiebreakers` in order. For per-track: return separate ranked lists per team_size. For combined: single ranked list.
  - **Done when:** Unit tests cover sum scoring, tiebreaking by BDR, per-track vs combined. Empty stage returns empty leaderboard.

---

- [x] **T-028 — Stage leaderboard: GAUNTLET**
  - **Prerequisites:** T-025, T-003
  - **Context:** For each team, find their best complete attempt (highest `total_score` among `completed = true` attempts). Rank teams by best attempt score. Tiebreaking per `game_scoring_config_json` (applied to the best attempt's game scores).
  - **Scope:** Write `getGauntletLeaderboard(stageId): LeaderboardEntry[]`. Each entry includes best attempt number, total score, and individual game scores within the best attempt. Teams with no complete attempt are not ranked (or shown as DNF at the bottom).
  - **Done when:** Teams with multiple attempts only show their best. DNF teams appear below all ranked teams.

---

- [x] **T-029 — Stage leaderboard: MATCH_PLAY**
  - **Prerequisites:** T-026
  - **Context:** MATCH_PLAY standings show bracket state: who has won/lost each round, current round, and final placement for eliminated teams. Unlike other mechanisms, this is not a sorted score list — it is a bracket tree with round-by-round results.
  - **Scope:** Write `getMatchPlayStandings(stageId): BracketState`. `BracketState` includes: `rounds` (array of round objects, each with matches and results), `entries` (all enrolled teams with current status: `active`, `eliminated`, `champion`), `currentRound`. For completed brackets, include final placement (1st, 2nd, 3rd/4th, etc.).
  - **Done when:** Round-by-round state is accurate. Champion and eliminated placements are correct. Handles in-progress rounds (some matches complete, some pending).

---

- [x] **T-030 — Aggregate event leaderboard**
  - **Prerequisites:** T-027, T-028, T-003
  - **Context:** Combines stage scores across all stages that feed into the event aggregate (per `event_stage_relationships` and `aggregate_config_json`). Methods per T-003: `"sum"` (add all stage scores), `"best_n_of_m"` (best N stage scores per player), `"rank_points"` (convert per-stage rank to points using `points_map`). Attribution is per player (individual scores across potentially different team compositions).
  - **Scope:** Write `getEventAggregate(eventId): AggregateLeaderboardEntry[]`. For each player: collect their stage scores across contributing stages, apply aggregate method, rank. Each entry: `{ rank, user: { id, display_name }, total_score, stage_scores: [{stage_id, stage_label, score}] }`. Handle players who missed stages (absent = 0 for `sum`; absent = not counted for `best_n_of_m`).
  - **Done when:** All three aggregate methods work correctly. Players who participated in zero stages are excluded. `best_n_of_m` correctly ignores lowest scores.

---

- [x] **T-031 — Leaderboard and status API endpoints**
  - **Prerequisites:** T-027, T-028, T-029, T-030, T-011
  - **Context:** Exposes leaderboard queries and status inference as API endpoints. Public for published events; admin-only for unpublished.
  - **Scope:**
    - `GET /api/events/:slug/leaderboard` — event aggregate leaderboard
    - `GET /api/events/:slug/stages/:stageId/leaderboard` — stage leaderboard (mechanism-appropriate shape)
    - `GET /api/events/:slug/status` — inferred event status + inferred dates
    - `GET /api/events/:slug/stages/:stageId/status` — inferred stage status
    - All leaderboard endpoints accept optional `?team_size=N` param for per-track filtering.
  - **Done when:** Correct leaderboard shape returned for each mechanism. Status correctly inferred at runtime.

---

## Phase 7 — Awards

---

- [x] **T-032 — Award definition CRUD API**
  - **Prerequisites:** T-015, T-002
  - **Context:** Schema: `event_awards(id, event_id, stage_id, name, description, icon, criteria_type, criteria_value, attribution, team_size, sort_order)`. `stage_id` null = event aggregate award. `criteria_type` values: `RANK_POSITION` (criteria_value: `{"positions": [1]}`), `SCORE_THRESHOLD` (criteria_value: `{"min_percentage": 0.9}` or `{"min_score": 20}`), `PARTICIPATION` (criteria_value: `{"min_stages": 4}`), `MANUAL`. `attribution`: `INDIVIDUAL` or `TEAM`. Per T-002: awards optionally reference a `badge_id` from `event_badges` to trigger badge grants.
  - **Scope:**
    - `GET /api/events/:slug/awards` — list all awards for event (grouped by stage)
    - `POST /api/events/:slug/awards` — create award (admin)
    - `PUT /api/events/:slug/awards/:awardId` — update
    - `DELETE /api/events/:slug/awards/:awardId` — delete (blocks if grants exist)
    - `PATCH /api/events/:slug/awards/reorder` — update sort_order for display sequence
  - **Done when:** Validation enforces criteria_value shape matches criteria_type. `stage_id` must belong to the same event.

---

- [x] **T-033 — Award grant evaluation engine**
  - **Prerequisites:** T-032, T-027, T-028, T-029, T-030
  - **Context:** When a stage completes (all required results submitted) or an admin triggers evaluation, the engine evaluates all `event_awards` for that stage (or the event aggregate) against the current leaderboard and issues `event_award_grants`. For `RANK_POSITION`: grant to teams/players at the specified rank positions. For `SCORE_THRESHOLD`: grant to all who meet the threshold. For `PARTICIPATION`: grant based on stages played count. For `MANUAL`: no automatic grant. Per T-002: if award has a `badge_id`, also insert into `event_badge_awards` (triggering the existing notification).
  - **Scope:** Write `evaluateAwards(eventId: number, stageId?: number)` service function. Idempotent — does not create duplicate grants (check existing before inserting). Returns list of new grants created. Called by admin endpoint (T-034) and optionally by a webhook/trigger on stage completion.
  - **Done when:** Each criteria_type evaluates correctly. Idempotent — calling twice produces same set of grants. Badge grants created when `badge_id` is present.

---

- [x] **T-034 — Award grant API**
  - **Prerequisites:** T-033
  - **Context:** Schema: `event_award_grants(id, award_id, user_id, event_team_id, granted_at)`.
  - **Scope:**
    - `POST /api/events/:slug/awards/evaluate` — admin triggers evaluation; returns new grants created
    - `GET /api/events/:slug/awards/:awardId/grants` — list grants for an award
    - `GET /api/events/:slug/grants/me` — current user's grants for this event
    - `POST /api/events/:slug/awards/:awardId/grants` — manual grant (admin; MANUAL criteria_type only)
    - `DELETE /api/events/:slug/awards/:awardId/grants/:grantId` — revoke grant (admin)
  - **Done when:** Manual grants only allowed for MANUAL-criteria awards. Revoking a grant also revokes the corresponding badge grant if one exists.

---

## Phase 8 — ELO Ratings

---

- [x] **T-035 — ELO computation utility**
  - **Prerequisites:** T-009
  - **Context:** `stage_scoring_config_json: { method: "elo", k_factor: 24, participation_bonus: 0.5 }`. ELO is per-player, per-stage. After a game result for a SEEDED_LEADERBOARD + ELO stage: compare the team's score against opponents' scores on the same game slots to compute win/loss, then apply ELO formula. `participation_bonus` is a flat rating delta added for playing regardless of outcome.
  - **Scope:** Write `computeEloDeltas(teamRating: number, opponentRatings: number[], outcome: 'win'|'loss'|'draw', kFactor: number, participationBonus: number): { newRating, delta }`. Pure function, fully unit-tested. Handle the case where one team plays a seed and has no direct head-to-head opponent (treat field average as opponent).
  - **Done when:** Standard ELO formula implemented and tested. Participation bonus applied correctly. Edge cases (no opponents, all same score) handled.

---

- [x] **T-036 — ELO rating materialization**
  - **Prerequisites:** T-035, T-023
  - **Context:** Schema: `event_player_ratings(stage_id, user_id, rating, games_played, last_played_at, updated_at)`. Ratings are updated after each game result is submitted for a `scoring_method: ELO_DELTA` stage. Update is transactional with the result insert.
  - **Scope:** After inserting an `event_game_result` for a SEEDED_LEADERBOARD + ELO stage: (1) Fetch current ratings for all members of the submitting team. (2) Compute deltas using T-035 utility. (3) Upsert into `event_player_ratings`. Wrap in a transaction with the result insert. Add `event_player_ratings` to the leaderboard query for ELO stages (T-027 uses rating as the ranking value for ELO method).
  - **Done when:** Rating updates are atomic with result submission. Ratings are correct after 5+ game results in a sequence. Concurrent submissions handled safely.

---

## Phase 9 — Match Play: Bracket

---

- [x] **T-037 — Match play bracket enrollment**
  - **Prerequisites:** T-019, T-020, T-016
  - **Context:** Schema: `event_match_play_entries(id, stage_id, event_team_id, seed)`. Entries are either: (a) manually added by admin, or (b) auto-populated by the stage relationship qualification logic (top-N teams from prior stage aggregate). `seed` is the bracket seeding position — null until draw is run.
  - **Scope:**
    - `GET /api/events/:slug/stages/:stageId/entries` — list enrolled teams (with seed if set)
    - `POST /api/events/:slug/stages/:stageId/entries` — manually add team to bracket (admin)
    - `DELETE /api/events/:slug/stages/:stageId/entries/:entryId` — remove entry (admin; blocks if matches exist)
    - `POST /api/events/:slug/stages/:stageId/entries/qualify` — admin triggers auto-population from stage relationships; fetches qualifying teams from prior stage leaderboard, creates entries with RANKED seeds
  - **Done when:** Qualification correctly selects top-N (or threshold) teams from prior stage. Seeds assigned in rank order.

---

- [x] **T-038 — Single-elimination bracket draw**
  - **Prerequisites:** T-037
  - **Context:** Given N seeded entries, generate round-1 match pairings using standard single-elimination seeding (seed 1 vs seed N, seed 2 vs seed N-1, etc.). Handle byes when N is not a power of 2 (highest seeds receive byes). Match variant/seed assignment: per `config_json.variant_assignment` — either `"inherit"` (use stage's variant/seed rules) or `"manual"` (admin assigns per match).
  - **Scope:** Write `generateSingleEliminationBracket(entries: Entry[], stageConfig): Match[]`. Creates `event_matches` rows for round 1. Byes represented as a match where one team is null (auto-advanced). Returns created matches. Expose as `POST /api/events/:slug/stages/:stageId/draw` (admin only; blocked if matches already exist).
  - **Done when:** Bracket correctly pairs 8, 16, and non-power-of-2 entry counts. Byes handled. Draw blocked if already drawn.

---

- [x] **T-039 — Bracket advancement logic**
  - **Prerequisites:** T-038, T-026
  - **Context:** When all matches in the current round are complete, the next round's matches are generated from winners. For single-elimination: winners advance, losers are eliminated. Final match winner is the champion. Admin triggers advancement.
  - **Scope:** Write `advanceBracket(stageId)` service function: (1) Verify all current-round matches are `COMPLETE`. (2) Collect winners. (3) Generate next round's matches using the same seeding pattern. (4) If only one match remains and it's complete, mark the bracket stage as done. Expose as `POST /api/events/:slug/stages/:stageId/advance` (admin only).
  - **Done when:** Correct next-round pairings generated. Championship correctly identified. Blocked if any current-round match is not COMPLETE.

---

- [x] **T-040 — Match variant/seed assignment**
  - **Prerequisites:** T-038, T-010
  - **Context:** When a match is created (by bracket draw or manually), its games need variant and seed values. These come from the stage's `variant_rule_json` and `seed_rule_json` (resolved per T-010), or are assigned manually by admin. Match game results store their own `variant_id` and `seed_payload`.
  - **Scope:** When creating match rows via the bracket draw, auto-populate `event_match_game_results` skeleton rows (one per game_index per match, per `config_json.match_format.games_count`) with variant/seed resolved from stage rules. Leave `team1_score`/`team2_score` null until results submitted. Add `PATCH /api/events/:slug/stages/:stageId/matches/:matchId/games/:gameIndex` for admin to manually set variant/seed before results come in.
  - **Done when:** Match game skeletons created automatically on bracket draw. Admin can override variant/seed per game.

---

## Phase 10 — Gauntlet Mechanism

---

- [x] **T-041 — Gauntlet attempt state machine**
  - **Prerequisites:** T-025
  - **Context:** A Gauntlet stage has a sequence of game slots. An attempt is an ordered run through all slots. Games must be submitted in `game_index` order. A team can have at most one in-progress attempt at a time (`completed = false`). `UNLIMITED_BEST` attempt policy means unlimited attempts. `BEST_OF_N` limits to N total attempts. `REQUIRED_ALL` is not applicable to GAUNTLET.
  - **Scope:** Enforce in T-025's attempt API: (a) block new attempt if one is in-progress, (b) enforce game submission order (reject out-of-order), (c) enforce attempt limit per `attempt_policy`. Add `DELETE /api/events/:slug/stages/:stageId/attempts/:attemptId` to abandon an in-progress attempt (sets a `abandoned = true` flag or deletes). Validate `attempt_policy` constraints on attempt creation.
  - **Done when:** In-order submission enforced. Attempt limit enforced. Abandoned attempts don't count toward the limit for `BEST_OF_N`.

---

- [x] **T-042 — Gauntlet best-attempt scoring integration**
  - **Prerequisites:** T-028, T-041
  - **Context:** The Gauntlet leaderboard (T-028) selects the best complete attempt per team. This needs to be re-evaluated after every new completion. Award evaluation (T-033) should run after a Gauntlet stage's best-attempt state changes.
  - **Scope:** After `complete` is called on an attempt: (1) Check if this attempt improves the team's best score. (2) If so, update any cached/materialized best-attempt record if we choose to cache it (or leave fully computed — see T-028). (3) Trigger award re-evaluation for the stage (or mark stage for deferred evaluation). Add `GET /api/events/:slug/stages/:stageId/attempts/leaderboard` endpoint that returns current best-attempt standings.
  - **Done when:** Leaderboard immediately reflects new best after completion. Re-evaluation is efficient (doesn't recompute all attempts unless needed).

---

## Phase 11 — QUEUED Team Assignment

---

- [x] **T-043 — QUEUED random draw algorithm**
  - **Prerequisites:** T-021
  - **Context:** For a QUEUED stage: (1) Collect all `event_stage_opt_ins` for the stage. (2) Separate confirmed pre-arranged pairs (`partner_user_id IS NOT NULL` + mutual opt-in confirmed) from solo queue players. (3) Shuffle solo queue players. (4) Pair them sequentially. (5) If odd number of solo players: either create one trio (if `team_size` allows it) or leave one player unmatched (notify admin). (6) Return proposed pairings for admin review before confirming.
  - **Scope:** Write `runQueuedDraw(stageId): DrawProposal`. `DrawProposal` includes confirmed pre-arranged pairs, proposed solo pairings, and any unmatched players. Does not persist teams until admin confirms (T-022's confirm endpoint). Write unit tests with 2, 3, 4, 5, 6 solo queue players.
  - **Done when:** Pre-arranged pairs always grouped together. Solo queue randomized. Odd-number cases handled cleanly. Unmatched players surfaced to admin.

---

## Phase 12 — Admin UI: Foundation

---

- [x] **T-044 — Admin route structure and event list page**
  - **Prerequisites:** T-013, T-015
  - **Context:** The existing admin section needs new routes for the new event model. Follow the existing design system (`docs/standards/design-system.md`, `docs/standards/frontend-components.md`). The admin event list is the entry point for all event management.
  - **Scope:** Add admin routes: `/admin/events`, `/admin/events/new`, `/admin/events/:slug`, `/admin/events/:slug/stages`, `/admin/events/:slug/stages/:stageId`, `/admin/events/:slug/registrations`, `/admin/events/:slug/results`, `/admin/events/:slug/awards`. Build the event list page (`/admin/events`): table of all events (published + unpublished), columns: name, status (inferred), team sizes, stage count, quick actions (edit, publish toggle). Use existing `CoreTable` or equivalent.
  - **Done when:** List page loads with real data. Status badges show inferred status. Navigation to detail pages works.

---

- [x] **T-045 — Admin event overview page**
  - **Prerequisites:** T-044
  - **Context:** `/admin/events/:slug` is the hub for managing a specific event. Shows event metadata, list of stages with their statuses, quick links to sub-sections (registrations, results, awards).
  - **Scope:** Build overview page with: event metadata card (name, status, team sizes, registration mode, dates), stages list (each stage showing: label, mechanism badge, status, game slot count, team count), section links. Include "Publish" / "Unpublish" action button. Include "Open Registration" / "Close Registration" time controls. Admin-only guard.
  - **Done when:** All stage statuses correctly shown. Actions update event state and reflect immediately.

---

## Phase 13 — Admin UI: Event & Stage Management

---

- [x] **T-046 — Admin create/edit event form**
  - **Prerequisites:** T-044, T-013, T-014
  - **Context:** Fields: name, slug (auto-derived from name, editable), short description, long description, team sizes (multi-select: 2-6), combined leaderboard toggle, registration mode (ACTIVE/PASSIVE), allow late registration, registration opens at, registration cutoff.
  - **Scope:** Build form at `/admin/events/new` and `/admin/events/:slug/edit`. Use existing form component patterns. Slug auto-derived from name but editable. Team size multi-select. Variant/seed rule fields are optional (used as propagation templates — labeled "Seed formula" and "Default variant"). Save calls create or update endpoint. After save, redirect to event overview.
  - **Done when:** Form validates all required fields. Slug uniqueness error from API is surfaced inline. Variant/seed formula field has token hint (e.g., "Available tokens: {eID}, {sID}, {gID}, {tSize}").

---

- [x] **T-047 — Admin stage editor**
  - **Prerequisites:** T-046, T-015**
  - **Context:** Stages are the behavioral core of an event. Each stage needs: label, mechanism (SEEDED_LEADERBOARD / GAUNTLET / MATCH_PLAY), team_policy (SELF_FORMED / QUEUED), team_scope (EVENT / STAGE), attempt_policy, time_policy, starts_at, ends_at, game/stage scoring configs, variant/seed rules, mechanism-specific config.
  - **Scope:** Build stage editor as a drawer or full page at `/admin/events/:slug/stages/new` and `/admin/events/:slug/stages/:stageId/edit`. Show/hide fields based on mechanism (e.g., attempt_policy only shown for SEEDED_LEADERBOARD and GAUNTLET; bracket config only for MATCH_PLAY). `game_scoring_config_json` and `stage_scoring_config_json` as structured form inputs (not raw JSON). `config_json` for mechanism-specific knobs (bracket type for MATCH_PLAY, etc.). Inline validation.
  - **Done when:** Invalid combinations (e.g., MATCH_PLAY + REQUIRED_ALL) are blocked at UI level with clear error. Scoring config forms produce valid JSON shapes per T-003.

---

- [x] **T-048 — Admin stage relationship editor**
  - **Prerequisites:** T-047, T-016
  - **Context:** Stage relationships define which teams advance from one stage to the next. For most events this is a simple linear sequence; for Boom & Bloom it's 8 stages converging into 1.
  - **Scope:** Build a relationship editor on the event overview page (or a dedicated `/admin/events/:slug/flow` page). Display stages as nodes with relationship edges. Allow adding/removing edges: select source stage, target stage, filter type (ALL / TOP_N / THRESHOLD / MANUAL), filter value, seeding method. A simple table view is acceptable if a visual DAG is too complex for now. Warn when a stage has no incoming relationship (orphaned from entry path) or no outgoing relationship (dead end, not the final stage).
  - **Done when:** Relationships can be created and deleted. Filter configuration is validated (filter_value required for TOP_N and THRESHOLD).

---

- [x] **T-049 — Admin game slot editor**
  - **Prerequisites:** T-047, T-017
  - **Context:** Game slots define the seeds and variants for a SEEDED_LEADERBOARD or GAUNTLET stage. For per-track events (multiple team sizes), each game index has one slot per size. For single-track or combined events, one slot per game index.
  - **Scope:** Build game slot editor at `/admin/events/:slug/stages/:stageId/games`. Table view: rows are game slots, columns are game_index, team_size (if per-track), variant (dropdown from hanabi_variants), seed_payload, max_score. Inline editing. "Add game" button adds a new row. "Propagate from stage/event" button calls the propagation endpoint (T-017) and refreshes the table. Propagation preview shows what values will be written before confirming. Warn if a slot's seed_payload would be overwritten by propagation.
  - **Done when:** Inline editing works. Propagation preview shows diffs. Variant dropdown loads from `/api/variants`.

---

## Phase 14 — Admin UI: Registration & Teams

---

- [x] **T-050 — Admin registration management**
  - **Prerequisites:** T-044, T-018, T-019, T-020
  - **Context:** Admin needs to see who has registered, their status, and their team assignments.
  - **Scope:** Build `/admin/events/:slug/registrations`. Table: registrant display name, status (PENDING/ACTIVE/WITHDRAWN), registered_at, team assignment (EVENT-scope team name or "Stage-scoped"). Actions: approve pending, withdraw active, reinstate withdrawn. For EVENT-scope teams: show team composition inline. Bulk export as CSV.
  - **Done when:** All registration statuses shown. Admin actions work. Team display names derived correctly (T-012).

---

- [x] **T-051 — Admin team management**
  - **Prerequisites:** T-050
  - **Context:** Admin may need to manually create or adjust teams — especially for corrections or for seeding a MATCH_PLAY bracket.
  - **Scope:** Within the registrations page or a dedicated teams sub-tab: list all EVENT-scoped teams with members and derived name. List STAGE-scoped teams grouped by stage. Admin can: create a team (select members from registered players), add/remove members from a team, delete a team (blocks if results exist). Show team source (REGISTERED / QUEUED / FORMED).
  - **Done when:** Admin can manually form any team. Team size validation enforced (must be in `allowed_team_sizes`).

---

- [x] **T-052 — Admin QUEUED draw UI**
  - **Prerequisites:** T-051, T-022
  - **Context:** For QUEUED stages, admin runs the draw to create teams from opt-ins. This is a two-step flow: preview proposed pairings, then confirm.
  - **Scope:** Add a "Run Draw" section per stage (when the stage has `team_policy: QUEUED`). Show current opt-ins (solo queue vs pre-arranged pairs). "Preview Draw" button calls the draw API and shows proposed pairings. Admin can manually swap pairs before confirming. "Confirm Draw" creates the teams. Show unmatched players prominently with a warning. After confirming, show created teams.
  - **Done when:** Preview shows proposed pairings with swap controls. Confirm creates teams and disables re-draw unless admin resets. Unmatched player warning is unmissable.

---

## Phase 15 — Admin UI: Results

---

- [x] **T-053 — Admin result entry**
  - **Prerequisites:** T-050, T-023, T-024
  - **Context:** Admin can enter results on behalf of a team, or correct existing results.
  - **Scope:** Build `/admin/events/:slug/results`. Filter by stage, then by game slot. For each game slot: show which teams have submitted and which haven't. Click a team to enter/edit their result: score (integer), zero_reason (dropdown: Strike Out / Time Out / VTK, only if score = 0), bottom_deck_risk (integer, optional), hanabi_live_game_id (bigint, optional). For per-track events, group by team_size. Show submitted results with edit icon.
  - **Done when:** Admin can enter results for any team. Edit updates existing result. Score validation enforced (0 ≤ score ≤ max_score, or 0 with zero_reason).

---

- [x] **T-054 — Admin match result entry**
  - **Prerequisites:** T-053, T-026
  - **Context:** For MATCH_PLAY stages, results are entered per match game, not per stage game slot.
  - **Scope:** Add a match results sub-section for MATCH_PLAY stages within the results page. Show matches grouped by round. For each match: teams, status, game-by-game scores. Enter team1_score and team2_score for each game_index. Winner auto-computed; override available. "Mark Complete" button finalizes the match and triggers bracket advancement check (shows "Advance to Round N" button if all matches are complete).
  - **Done when:** Match results can be entered and updated. Winner display updates after save. Advancement prompt appears when round is complete.

---

## Phase 16 — Admin UI: Awards & Brackets

---

- [x] **T-055 — Admin award definition editor**
  - **Prerequisites:** T-044, T-032
  - **Context:** Awards are defined per stage or for the event aggregate. The criteria builder needs to be ergonomic — not raw JSON.
  - **Scope:** Build award editor within the event overview page (collapsible section per stage + one for the event aggregate). For each award: name, description, icon (emoji or icon picker), criteria type selector, criteria value form (dynamically shaped by criteria type: positions multi-select for RANK_POSITION; percentage or raw score input for SCORE_THRESHOLD; min stages for PARTICIPATION), attribution (INDIVIDUAL / TEAM), team_size scope (optional), sort_order drag-handle. "Evaluate Awards" button triggers the grant engine and shows a preview of who would receive grants.
  - **Done when:** All criteria types can be configured without touching JSON. Evaluation preview shows recipients before committing.

---

- [x] **T-056 — Admin bracket view and management**
  - **Prerequisites:** T-044, T-037, T-038, T-039
  - **Context:** Admin needs to manage the MATCH_PLAY bracket: enroll teams, run the draw, view bracket state, advance rounds.
  - **Scope:** Build `/admin/events/:slug/stages/:stageId/bracket`. Sections: (1) Enrollment — list enrolled teams with seeds; "Qualify from prior stage" button; manual add/remove. (2) Draw — "Run Draw" button (disabled if matches exist); shows proposed bracket; "Confirm" persists it. (3) Bracket view — tree diagram or round-by-round table showing matches, scores, and winners. Round advancement section: "Advance to Round N" button (when current round is complete). Show champion prominently when bracket is complete.
  - **Done when:** Full bracket lifecycle works: enroll → draw → enter results → advance → champion. Bracket view accurately reflects current state.

---

## Phase 17 — Public UI: Event Discovery

---

- [x] **T-057 — Public event listing page**
  - **Prerequisites:** T-013, T-031
  - **Context:** The main entry point for users to discover events. Shows all published events.
  - **Scope:** Build or update the events listing page. Cards or table rows per event: name, inferred status badge, team sizes supported, brief description, dates (inferred from stages). Filter/sort by: status (REGISTRATION_OPEN, IN_PROGRESS, UPCOMING, COMPLETE), team size. Link to event detail page. Follow design system for status badge colors.
  - **Done when:** All published events appear. Status badges are accurate. Filters work client-side or via API params.

---

- [x] **T-058 — Public event detail page: overview and navigation**
  - **Prerequisites:** T-057, T-018
  - **Context:** The event detail page is the hub for participants. It needs to surface: event info, registration status, current stage activity, and navigation to leaderboards.
  - **Scope:** Build `/events/:slug`. Page sections (as tabs or anchor nav): Overview (description, team sizes, schedule of stages), Register (CTA based on current user's registration status), Stages (list of stages with status and links), Leaderboard (aggregate leaderboard if multiple stages). Header: event name, status banner (e.g., "Registration Open — closes March 25"), team sizes. Sidebar or inline: current user's registration status and team.
  - **Done when:** Status banner dynamically reflects inferred status. Registration CTA changes based on user's registration state (not registered → register; registered → view team; registration closed → closed state).

---

## Phase 18 — Public UI: Registration Flow

---

- [x] **T-059 — Active registration flow**
  - **Prerequisites:** T-058, T-018, T-019, T-020
  - **Context:** For `registration_mode: ACTIVE` events. Flow varies by `team_scope`: EVENT scope — register as a team; STAGE scope — register individually, form teams per stage.
  - **Scope:** Build registration flow accessible from the event detail page. **EVENT scope flow:** (1) Click "Register". (2) Select team size (if multiple allowed). (3) Search for partner(s) by username. (4) Submit — creates PENDING team; partner(s) receive a notification/invite. (5) Confirmation page showing pending status. **STAGE scope flow:** (1) Click "Register". (2) Confirm individual registration (no partner selection at this step). (3) Redirect to registration status page. For each stage, a separate "Join this week" flow (T-060).
  - **Done when:** Both flows complete end-to-end. Pending team state shown clearly. Partner invitation is actionable.

---

- [x] **T-060 — Stage participation flow (STAGE scope)**
  - **Prerequisites:** T-059, T-020, T-021
  - **Context:** For events with `team_scope: STAGE`, participants form a new team each stage. This flow appears on the stage page when a stage is UPCOMING or IN_PROGRESS.
  - **Scope:** On the stage detail page (T-061), show a "Playing this week?" section if user is registered. Options: (1) "I have a partner" — search and invite partner (creates STAGE-scoped team pending confirmation). (2) "I need a partner" — opt in to solo queue (creates `event_stage_opt_ins` row with null `partner_user_id`). (3) "Sitting out this week" — no action needed. Show current week's team if already formed, or pending status if invite sent.
  - **Done when:** Partner invite flow produces a pending STAGE-scoped team. Solo queue opt-in is confirmed with clear UI state. "Sitting out" requires no action but gives user clear info.

---

## Phase 19 — Public UI: Results & Leaderboards

---

- [x] **T-061 — Public stage detail page: SEEDED_LEADERBOARD**
  - **Prerequisites:** T-058, T-027, T-031
  - **Context:** The stage page for a SEEDED_LEADERBOARD stage shows game slots, allows result submission, and shows the live leaderboard.
  - **Scope:** Build `/events/:slug/stages/:stageId`. For SEEDED_LEADERBOARD: (1) Stage info header (label, variant if uniform, dates, status). (2) Game slots list: each slot shows variant, seed, and the current team's result (or "Submit" if unsubmitted). (3) Result submission inline form (score, BDR, zero reason, hanabi.live game ID). (4) Leaderboard table — rank, team display name, stage score, per-game scores. For per-track events: tabs per team size. Live updates not required; page-refresh or poll acceptable.
  - **Done when:** Users can submit their result directly from the stage page. Leaderboard updates after submission. Submitted result shows edit option.

---

- [x] **T-062 — Public result submission form**
  - **Prerequisites:** T-061, T-023
  - **Context:** Result submission is the primary player action. It must be clear, validated, and low-friction.
  - **Scope:** Inline form on the stage page (or modal): score field (integer, 0 to max_score shown), BDR field (integer, optional, labeled "Bottom Deck Risk"), zero reason (only shown when score = 0, dropdown: Strike Out / Time Out / VTK), hanabi.live game ID (bigint, optional, with a link template to the replay). Client-side validation: score range, zero_reason required when score is 0. Submission shows loading state. Success shows the submitted result inline. Error messages for duplicate submission (409) and validation failures.
  - **Done when:** Validation prevents invalid submissions client-side. Server-side errors surfaced clearly. Submitted state persists after page refresh.

---

- [x] **T-063 — Public stage detail page: GAUNTLET**
  - **Prerequisites:** T-025, T-028, T-041
  - **Context:** Gauntlet stages require displaying attempt history and the best-attempt score. The UX is different from SEEDED_LEADERBOARD.
  - **Scope:** Build GAUNTLET variant of the stage page. Sections: (1) Current best attempt — shows total score or "No complete attempt yet". (2) Attempt history — list of past attempts (completed and abandoned) with per-game scores. (3) "Start New Attempt" button — creates a new attempt. (4) Active attempt section — shows each game in sequence, with submit form for the current game (game_index N, previous games locked). (5) Leaderboard — ranked by best attempt score.
  - **Done when:** Sequential game submission enforced in UI (next game only unlocked after previous submitted). Best attempt correctly shown.

---

- [x] **T-064 — Public stage detail page: MATCH_PLAY**
  - **Prerequisites:** T-029, T-038, T-039
  - **Context:** MATCH_PLAY stages show a bracket diagram and match results.
  - **Scope:** Build MATCH_PLAY variant of the stage page. Sections: (1) Bracket diagram — round-by-round tree view. Each match node shows: teams (with derived display names), scores if complete, "TBD" if pending. Current user's matches highlighted. (2) My match section — if current user has a pending or in-progress match, show the game slots and submission form (same as T-062 but scoped to match game results). (3) Results summary — completed matches with scores. Static bracket diagram acceptable (no interactive drag-drop).
  - **Done when:** Bracket accurately reflects current state. User's active match is clearly surfaced. Scores update after submission.

---

- [x] **T-065 — Public aggregate event leaderboard**
  - **Prerequisites:** T-030, T-031
  - **Context:** For multi-stage events, the aggregate leaderboard shows cumulative standings across all stages.
  - **Scope:** Build aggregate leaderboard section on the event detail page (or `/events/:slug/leaderboard`). Table columns: rank, player display name, total score (or aggregate value), per-stage score breakdown (one column per contributing stage). Highlight current user's row. For per-track events: show per team size. For `best_n_of_m` method: show which stages are counted vs. dropped for each player. Empty state for events with no results yet.
  - **Done when:** Aggregate correctly computed for all three methods (sum, best_n_of_m, rank_points). Per-stage breakdown visible.

---

## Phase 20 — Public UI: Awards & Profile

---

- [x] **T-066 — Award display on event page**
  - **Prerequisites:** T-058, T-034
  - **Context:** Players should see what awards are available and who has earned them.
  - **Scope:** Add awards section to event detail page. List all `event_awards` grouped by stage (then event aggregate). For each award: name, icon, description, criteria summary in plain language (e.g., "Awarded to 1st place overall"). Show grantees (display names, avatars if available). Highlight if current user has earned the award. For SCORE_THRESHOLD awards on an IN_PROGRESS stage, show current user's progress toward the threshold if possible.
  - **Done when:** Awards section shows all defined awards. Granted users shown. Current user highlight works.

---

- [x] **T-067 — User profile: awards and event history**
  - **Prerequisites:** T-066, T-034
  - **Context:** Users should be able to see all awards they've earned across all events.
  - **Scope:** Update the user profile page (or create `/profile` section). Add: (1) Awards earned — grid of award icons/names with event name and date. Filter by event or year. (2) Event participation history — list of events the user has participated in, with their stage results and final ranking. Respect existing badge display if badges are awarded via the existing system.
  - **Done when:** All award grants for the user are shown. Event history is accurate (pulls from results and registrations).

---

- [x] **T-068 — Award grant notification**
  - **Prerequisites:** T-033, T-067
  - **Context:** The existing notification system (`user_notifications`, `notify_badge_award_insert` trigger) fires when a badge is awarded. New award grants that also create badge grants will trigger this naturally. For award grants without a corresponding badge, a notification should still be sent.
  - **Scope:** In the award grant evaluation engine (T-033): after inserting an `event_award_grants` row, if no `badge_id` is associated, directly insert a `user_notifications` row (`kind: 'award_granted'`, with payload including award name and event name). Update the `user_notifications.kind` CHECK constraint to include `'award_granted'`. Ensure the existing notification display UI handles this new kind.
  - **Done when:** Users receive a notification when any award is granted, regardless of whether it has a badge visual. Notification links to the event page.

---

## Phase 21 — Cleanup & Integration

---

- [x] **T-069 — Remove old event API modules**
  - **Prerequisites:** All Phase 3–11 tickets complete
  - **Context:** The old event modules (challenge format, tournament format, session ladder) should be fully deleted once all functionality has been replaced by the new modules.
  - **Scope:** Delete old module files (identified in T-005). Remove their route registrations. Confirm no references remain in the codebase. Run full test suite. Remove any old API endpoint tests that reference the old event format.
  - **Done when:** No old session-ladder or old challenge/tournament-specific module code remains. Server starts cleanly. All tests pass.

---

- [x] **T-070 — Variant sync compatibility check**
  - **Prerequisites:** T-007
  - **Context:** The `hanabi_variants` table and its sync service (`variants.service.ts`) are retained unchanged. However, the new `event_stage_games.variant_id` FK references `hanabi_variants.code`. Confirm the sync service still runs correctly against the new schema and that `variant_id = 0` ("No Variant") seed row is present.
  - **Scope:** Run the variant sync service against a DB with the new schema. Confirm no errors. Confirm FK constraint is satisfied. Add a startup check that `hanabi_variants` has at least the "No Variant" row (code = 0). Confirm the admin variant dropdown in the game slot editor (T-049) pulls correct data.
  - **Done when:** Variant sync runs without error. Game slot editor shows current variant catalog.

---

- [x] **T-071 — End-to-end integration test: SEEDED_LEADERBOARD**
  - **Prerequisites:** T-017, T-023, T-027, T-031, T-033
  - **Context:** Full happy-path test for the most common event pattern.
  - **Scope:** Write an automated integration test (using existing test framework): (1) Create an event with 2 SEEDED_LEADERBOARD stages and a stage relationship (ALL → stage 2). (2) Create game slots for both stages. (3) Register two teams. (4) Submit game results for all slots in stage 1. (5) Query stage 1 leaderboard — verify rankings. (6) Query event aggregate — verify aggregate. (7) Trigger award evaluation — verify grants. (8) Register teams for stage 2 (auto-qualified via ALL relationship). (9) Submit results for stage 2. (10) Verify updated aggregate.
  - **Done when:** Full scenario runs without errors. All assertions pass.

---

- [x] **T-072 — End-to-end integration test: MATCH_PLAY**
  - **Prerequisites:** T-037, T-038, T-039, T-026
  - **Context:** Tests the bracket lifecycle.
  - **Scope:** Integration test: (1) Create a MATCH_PLAY stage with 4 enrolled teams (seeded). (2) Run single-elimination draw — verify 2 round-1 matches created. (3) Submit results for both round-1 matches. (4) Advance bracket — verify 1 final match created with correct teams. (5) Submit final match result. (6) Verify champion identified. (7) Trigger award evaluation.
  - **Done when:** Bracket lifecycle completes correctly. Champion correctly identified.

---

- [x] **T-073 — End-to-end integration test: GAUNTLET**
  - **Prerequisites:** T-025, T-028, T-033
  - **Context:** Tests Gauntlet attempt flow and best-attempt leaderboard.
  - **Scope:** Integration test: (1) Create a GAUNTLET stage with 3 sequential game slots. (2) Register a team. (3) Start attempt 1, submit games in order. Complete attempt. (4) Start attempt 2, submit games, complete with higher total score. (5) Query leaderboard — verify attempt 2 is shown as best. (6) Abandon attempt 3 mid-way — verify it does not appear on leaderboard.
  - **Done when:** Best-attempt logic correct. Abandoned attempts excluded.

---

- [x] **T-074 — End-to-end integration test: QUEUED team draw**
  - **Prerequisites:** T-021, T-022, T-043
  - **Context:** Tests the QUEUED team formation lifecycle.
  - **Scope:** Integration test: (1) Create a QUEUED + STAGE-scope stage. (2) Register 5 players. (3) 3 players opt in solo; 2 opt in as a pre-arranged pair. (4) Run draw — verify 2 teams created (1 solo pair + 1 pre-arranged pair + 1 unmatched player surfaced). (5) Confirm draw. (6) Verify teams created with correct members and `source: QUEUED`.
  - **Done when:** Pre-arranged pair always grouped. Solo queue randomized. Unmatched player surfaced.

---

*Total: 74 tickets. On completion of all tickets, the new event model is fully implemented and the old system fully retired.*
