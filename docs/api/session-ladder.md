# Session Ladder (League) API

## Scope

League sessions, queued games, ready checks, assignments, scoring, and standings.

## Key Endpoints (Representative)

- Session state retrieval
- Presence/join/leave controls
- Ready-check response and finalize
- Round start/finalize actions
- Team score submission
- Standings and per-session history

## Operational Rules

- Starting next game may finalize active game by admin confirmation.
- Unsubmitted teams on forced finalize receive forfeit-equivalent scoring treatment.
- Ongoing games must be ended on session end/event end.
