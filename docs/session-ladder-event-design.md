# Session Ladder Event Design

## Goal
Add a new event type where players can drop in/out across scheduled sessions, get randomly assigned teams each game, play predetermined seeds, and earn per-event Elo with live standings and history.

Working name: `session_ladder`.

## Product Behavior
1. Admin creates a `session_ladder` event with a date range and weekly sessions (example: 8 sessions across 2 months).
2. Each session contains one or more rounds (games).
3. For each round:
   - Present users in `playing` role are randomly assigned into teams.
   - All teams receive the same predetermined seed.
   - Teams submit scores.
   - Elo updates immediately.
4. Players may attend any subset of sessions/rounds.
5. Home page is websocket-backed for live presence, role selection (`playing` / `spectating`), assignments, and score/status updates.
6. Standings page shows current Elo ladder.
7. History page shows round-by-round assignment, seeds, results, and rating deltas.
8. Admin can set event lifecycle status on the event page: `DORMANT`, `LIVE`, `COMPLETE` (display names can be adjusted later).

## Data Model
Keep existing `challenge` / `tournament` flow unchanged. Add parallel tables for `session_ladder`.

### Existing table update
- `events.event_format` check constraint:
  - from: `('challenge', 'tournament')`
  - to: `('challenge', 'tournament', 'session_ladder')`

### New tables
- `event_session_ladder_config`
  - `event_id PK/FK events(id)`
  - `team_size_mode` (`fixed` | `hybrid_3_4`, default `hybrid_3_4`)
  - `team_size` nullable (used when `team_size_mode=fixed`)
  - `k_factor` (default 24)
  - `participation_bonus` (default 0.5)
  - `rounds_per_session` (default 1, configurable)
  - `random_seed_salt` (for deterministic assignment if needed)

- `event_sessions`
  - `id PK`
  - `event_id FK`
  - `session_index` (1..N, unique per event)
  - `starts_at` nullable, `ends_at` nullable
  - `status` (`scheduled`, `live`, `closed`)
  - unique `(event_id, session_index)`

- `event_session_rounds`
  - `id PK`
  - `session_id FK`
  - `round_index` (1..M)
  - `seed_payload`
  - `status` (`pending`, `assigning`, `playing`, `scoring`, `finalized`)
  - unique `(session_id, round_index)`

- `event_session_presence`
  - `session_id FK`
  - `user_id FK`
  - `role` (`playing`, `spectating`)
  - `state` (`online`, `offline`)
  - `last_seen_at`
  - PK `(session_id, user_id)`

- `event_session_round_players`
  - `round_id FK`
  - `user_id FK`
  - `role` (`playing`, `spectating`) snapshot for that round
  - `assigned_team_no` nullable (null for spectators)
  - `joined_at`
  - PK `(round_id, user_id)`

- `event_session_round_team_results`
  - `id PK`
  - `round_id FK`
  - `team_no`
  - `score`
  - `submitted_by_user_id FK`
  - `submitted_at`
  - unique `(round_id, team_no)`

- `event_player_ratings`
  - `event_id FK`
  - `user_id FK`
  - `rating` (default 1000)
  - `games_played`
  - `sessions_played`
  - `last_played_at`
  - PK `(event_id, user_id)`

- `event_rating_ledger`
  - `id PK`
  - `event_id FK`
  - `round_id FK`
  - `user_id FK`
  - `old_rating`
  - `delta_competitive`
  - `delta_participation`
  - `new_rating`
  - `created_at`
  - index `(event_id, user_id, created_at desc)`

## Elo Model
Per round:
1. Build teams from `event_session_round_players` (`role=playing`).
2. Team score determines rank (higher score better; ties supported).
3. Compute team average pre-round rating.
4. Multi-team Elo via pairwise comparisons:
   - For each team pair `(A,B)`:
     - `expected_A = 1 / (1 + 10^((Rb - Ra)/400))`
     - `actual_A = 1, 0.5, or 0` based on score comparison.
   - Team delta = `K * (sum(actual - expected) / pair_count)`
5. Split team delta equally across players on that team.
6. Add participation bonus (`+B`) to each player who played that round.
7. Persist per-player ledger row and update `event_player_ratings`.

Notes:
- This intentionally allows slight inflation via `participation_bonus` (per your requirement).
- Cap bonus per session if needed later (e.g., max bonus for first 3 rounds/session).

## API Surface
Add `apps/api/src/modules/session-ladder/*` with routes under `/api/session-ladder`.

### Admin
- `POST /api/events/:slug/session-ladder/config`
- `POST /api/events/:slug/session-ladder/sessions/generate`
- `POST /api/session-ladder/sessions/:sessionId/start`
- `POST /api/session-ladder/sessions/:sessionId/close`
- `POST /api/session-ladder/rounds/:roundId/finalize`

### Player / client
- `GET /api/events/:slug/session-ladder/standings`
- `GET /api/events/:slug/session-ladder/history`
- `GET /api/session-ladder/sessions/:sessionId/state`
- `POST /api/session-ladder/sessions/:sessionId/role` (`playing|spectating`)
- `POST /api/session-ladder/rounds/:roundId/submit-score`

## WebSocket Design
Use one websocket namespace/endpoint (e.g., `/ws`) with room keys:
- `event:{eventId}`
- `session:{sessionId}`

Client->server events:
- `session:join {sessionId}`
- `session:role:set {sessionId, role}`
- `presence:heartbeat {sessionId}`
- `round:ready {roundId}`
- `round:score:submit {roundId, teamNo, score}`

Server->client events:
- `session:presence:update`
- `round:assignment:published`
- `round:seed:published`
- `round:scoreboard:update`
- `round:finalized`
- `standings:update`

Participation inference:
- A user is considered present if websocket connected + heartbeat <= threshold (e.g., 20s).
- At round lock time, server snapshots present users into `event_session_round_players`.

## Team Assignment Algorithm
For each round:
1. Gather present users with role `playing`.
2. Shuffle deterministically with server RNG seed:
   - `seed = hash(event_id, session_id, round_index, random_seed_salt)`
3. Build team partitions using default policy `hybrid_3_4`:
   - valid team sizes are 3 and 4.
   - maximize assigned players.
   - among equal-max assignments, prefer more 3-player teams.
   - examples:
     - 8 players => `4 + 4`
     - 12 players => `3 + 3 + 3 + 3`
4. If players still remain after best partition, bench extras and rotate bench priority each round.
5. Persist assignment before round start.

## Frontend Pages
- `EventDetailPage`:
  - If `event_format=session_ladder`, show “Live Session” CTA.
  - Show owner/delegate controls for event/session lifecycle.
- New `SessionHomePage`:
  - websocket presence
  - role toggle: `playing` / `spectating`
  - live assignment + seed + status
  - score submission (authorized players/admin)
- New `SessionStandingsPage`:
  - rating ladder, games played, sessions played, last change
- New `SessionHistoryPage`:
  - timeline of sessions/rounds with teams, seeds, scores, per-player deltas

## Security / Integrity
- Auth required for all participation endpoints.
- Only `playing` users in assigned team can submit that team score (or admin override).
- Round finalization idempotent and transactional.
- Ledger writes + rating updates in one DB transaction.
- Do not allow edits after round finalized (except admin repair endpoint).

## Decision Log
- Ownership + permissions:
  - `SUPERADMIN`: full access to all events.
  - `owner_user_id` on event: full management access.
  - delegated admins (`event_admins`): full management access when granted by owner/superadmin.
  - other `ADMIN`s: read-only unless delegated.
  - applies to all event formats; operationally important for `session_ladder`.

## Owner Control Surface
Goal: keep high-frequency controls in one place, with low-frequency setup controls on event admin.

### Access locations
- `EventDetailPage` (owner/delegate-only control panel):
  - Event lifecycle status: `DORMANT` / `LIVE` / `COMPLETE`
  - Session setup entry points (create session, seed plan, open session)
  - Session list with quick actions
- `SessionHomePage` (owner/delegate live operations panel):
  - Open room / close room
  - Set/override seed for current round
  - Trigger team assignment for next round
  - Force finalize round / admin override score

### Minimum required owner/delegate controls
1. Initialize session:
   - create session record
   - optionally leave `starts_at`/`ends_at` null
2. Set seeds:
   - pre-load all round seeds or set per-round ad hoc
3. Open room:
   - marks session `live`
   - enables presence + role toggles
4. Trigger team assignment:
   - snapshots present `playing` users
   - generates team partitions with `hybrid_3_4` policy
5. Close room:
   - marks session `closed`
   - freezes new round creation
6. Complete event:
   - marks event `COMPLETE`
   - locks operational controls except admin repair endpoints

## In-Session Round Transition Rules
We do not require explicit “close game” from each team. Transition is driven by assignment/finalization state.

### Default transition behavior
1. `Assign next round` is blocked while current round has missing scores.
2. Owner/delegate can still proceed via explicit override prompt:
   - message: `X team(s) have not submitted scores for game N. Start game N+1 anyway?`
3. If override accepted:
   - current round is marked `finalized_partial`
   - missing teams receive `no_submission` marker (no Elo competitive delta, optional participation policy)
4. Next round assignment starts immediately.

### Additional safeguards
- Require reason text for override (audit trail).
- Emit websocket event so all clients see the transition + unresolved teams.
- Keep round status machine explicit:
  - `pending -> assigning -> playing -> scoring -> finalized`
  - optional override terminal: `finalized_partial`

## Rollout Plan
1. **Phase 1: Schema + read endpoints**
   - migrations + standings/history queries
2. **Phase 2: Round engine**
   - assignment, score submit, Elo finalize
3. **Phase 3: Realtime session home**
   - websocket presence + role + live state
4. **Phase 4: Admin scheduling UX**
   - create sessions and seed plan from wizard

## Open Decisions
1. Final naming for event lifecycle statuses on UI labels.
2. Participation bonus value and cap strategy.
3. Should standings include only active players (recent sessions) or all?
4. Whether to expose deterministic assignment seed for transparency.
5. Exact treatment of `no_submission` in Elo and participation bonus.
