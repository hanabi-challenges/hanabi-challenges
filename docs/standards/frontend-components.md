# Frontend Component Standards

## Goal

Ensure visually and behaviorally consistent rendering for like components across pages.

## Canonical Patterns

- Navigation tabs: reuse existing nav-link/tab style used in user/admin spaces.
- Event cards: one standard event card rendering model for public surfaces.
- User pills: use designated colored user pill component in all participant/team contexts.
- Badge rendering: use consolidated saved SVG outside designer; builder-only view may render composition primitives.
- Markdown: route through shared markdown parser/renderer (`MarkdownRenderer`) before display.

## Purposeful Variants (Allowed)

- Admin list views may be denser than public views.
- League event page has admin rail controls; non-league event pages do not.
- Badge previews in admin index are intentionally compact.

## Anti-Patterns

- Ad hoc native HTML controls where a Mantine equivalent exists.
- Same semantic control rendered differently with no documented reason.
- Re-implementing badges/event cards in page-local code.

## Required Documentation for UI Divergence

Any intentional divergence from canonical behavior must be captured in:

- [Component Consistency Matrix](./component-consistency-matrix.md)
