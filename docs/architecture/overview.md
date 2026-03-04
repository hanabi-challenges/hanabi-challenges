# Architecture Overview

## System Summary

Hanabi Challenges is a pnpm monorepo with:

- `apps/api`: Express + TypeScript API backed by PostgreSQL.
- `apps/web`: React + Mantine + TypeScript frontend.
- `packages/shared`: shared types/utilities consumed across apps.

## High-Level Flows

1. User authenticates via JWT issued by API auth routes.
2. Web client calls REST API for core data (events, users, standings, content).
3. Web client opens websocket connection for live updates (session ladder live state, notifications).
4. API persists state in PostgreSQL and emits websocket events from server-side modules.

## Primary Domains

- Auth and identities
- Events (Challenge, Tournament, Session Ladder/League)
- Teams and results
- Badges and awards
- CMS content pages
- Notifications
- Admin access requests

## Design Constraints

- Admin tooling and user-facing surfaces share design language.
- Event pages use a unified layout pattern (header/meta/tabs/content).
- Realtime orchestration must degrade safely to polling/reload behavior.
- Database should not reset by default in local development.

## Source of Truth

- API contracts: `apps/api/src/modules/**`
- Frontend routes/pages: `apps/web/src/pages/**` and `apps/web/src/features/**`
- DB schema: `apps/api/db/schema.sql`
