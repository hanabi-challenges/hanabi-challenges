# UI Component Contracts

This document defines the canonical component patterns used across the web app and how they are enforced.

## Goal

Prevent visual/behavior drift by ensuring repeated UI functions are always implemented by one canonical component (or an explicitly named subspecies).

## Canonical Card Patterns

1. `EventCard`
- Function: Public event discovery and participation context.
- Source: `apps/web/src/features/events/EventCard.tsx`
- Used by: public events lists, profile overview event previews.

2. `AdminLinkCard`
- Function: Admin navigation surfaces (home/content hubs).
- Source: `apps/web/src/features/admin/components/AdminEntityCard.tsx`
- Used by: `AdminHomeScreen`, `AdminContentHomeScreen`.

3. `AdminEntityCard`
- Function: Dense admin index rows with right-side controls.
- Source: `apps/web/src/features/admin/components/AdminEntityCard.tsx`
- Used by: Admin events index, admin badge sets index.

4. `SectionCard`
- Function: Form/section framing blocks.
- Source: `apps/web/src/design-system/components/layout/SectionCard/SectionCard.tsx`
- Used by: event wizard sections, badge designer panels, admin user management blocks.

## Enforcement

Lint rules in `eslint.config.mjs` enforce:

1. No `CoreCard` imports in `pages/`, `features/`, `layouts/`.
2. No direct `Card`/`CoreCard` usage in admin index/navigation screens where canonical subspecies are required.

## Extension Rules

When adding a new repeated pattern:

1. Define the function first (what problem the surface solves).
2. If existing canonical pattern matches, reuse it.
3. If behavior/semantics differ materially, create a named subspecies with typed props.
4. Add/adjust lint restrictions so bypassing the canonical component fails CI.

## Danger Action Policy

Buttons and action icons follow a global destructive-action convention:

1. Pre-confirmation triggers are neutral.
- Use default/subtle/outline styling for "review delete" or delete-entry controls.
- Do not use danger/red color for actions that only open a confirmation modal.

2. Danger color is reserved for final irreversible confirmation.
- The confirm button inside a destructive confirmation modal may use red.
- Shared implementation: `apps/web/src/features/shared/modals/DestructiveActionModal.tsx`.

3. Alerts can still use red for error state messaging.
- This policy applies to action affordances, not status feedback.
