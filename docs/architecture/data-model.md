# Data Model

## Core Tables (Selected)

- `users`
- `events`
- `teams`, `team_members`
- `results` and related challenge/session tables
- `badge_sets`, `event_badge_sets`, `event_badge_awards`
- `user_notifications`
- `admin_access_requests`

## Event Ownership and Roles

- `events.owner_user_id` identifies creator/owner.
- Delegation and role checks determine management capabilities.
- Superadmin has global operational permissions.

## Session Ladder (League) Entities

- Event config
- Sessions
- Rounds/games
- Presence/ready check snapshots
- Team assignments
- Round results and Elo ledger

## Badges

- Badge set stores both builder configuration and rendered preview SVG.
- Event attachment is pull-based from event setup flow.
- Awards are persisted and displayed on profile surfaces.
