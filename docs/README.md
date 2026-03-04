# Documentation

This directory is the canonical documentation source for the Hanabi Challenges monorepo.

## How To Use This Docs Set

1. Start with [Architecture Overview](./architecture/overview.md).
2. Read [Standards Index](./standards/README.md) before making code changes.
3. Use [API Index](./api/README.md) for endpoint contracts.
4. Use [Guides Index](./guides/README.md) for workflows.
5. Use [Runbooks Index](./runbooks/README.md) for operations and incident response.

## Documentation Map

- [Architecture](./architecture/README.md)
- [Standards](./standards/README.md)
- [API](./api/README.md)
- [Guides](./guides/README.md)
- [Runbooks](./runbooks/README.md)
- [ADRs](./adr/README.md)
- [Reference](./reference/README.md)
- [Audit Artifacts](./audit/README.md)
- [Templates](./templates/README.md)
- [UI Component Contracts](./ui-component-contracts.md)

## Change Discipline

- Any behavioral code change should update at least one of:
  - architecture docs,
  - API docs,
  - guides/runbooks,
  - ADRs (for decision-level changes).
- Standards docs should only change when policy changes.
- Audit artifacts are snapshots and can be regenerated.

## Read This First (Minimum Set)

- [Architecture Overview](./architecture/overview.md)
- [Frontend Architecture](./architecture/frontend.md)
- [Backend Architecture](./architecture/backend.md)
- [Code Style and Atomicity](./standards/code-style.md)
- [Frontend Component Standards](./standards/frontend-components.md)
- [Backend API Standards](./standards/backend-api.md)
- [Local Development Guide](./guides/local-development.md)

## Historical Design Notes

- [Session Ladder Event Design](./session-ladder-event-design.md)
- [Fantasy Oscars Alignment Plan](./fantasy-oscars-alignment-plan.md)
