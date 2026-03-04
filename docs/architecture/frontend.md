# Frontend Architecture

## Stack

- React 19
- TypeScript
- Vite (rolldown-vite)
- Mantine for primary UI controls/layout
- React Router for route composition

## Structural Layers

- `src/pages`: route-level containers.
- `src/features`: domain modules (events, users, notifications, admin).
- `src/layouts`: shared shells and global navigation.
- `src/ui`: shared rendering primitives (markdown renderer, etc.).
- `src/design-system`: custom DS primitives/components.

## State and Data Access

- Auth state via `AuthContext`.
- Network API helpers in `src/lib/api.ts`, `src/api/**`, and feature API files.
- Realtime feed wiring in feature/localized modules and top-level layout for site-wide notifications.

## Routing Conventions

- Public event/user pages live under primary routes.
- Admin pages are grouped and guard-wrapped (`RequireAdmin`, `RequireSuperAdmin`).
- User profile supports “me” and “you” variants with route-aware behavior.

## Styling Conventions

- Prefer Mantine component props and tokenized values.
- Local CSS only when necessary for geometry/complex visuals.
- Keep one source of visual truth for repeated UI patterns (cards, tabs, pills).
- `src/mantine.tsx` is the import boundary for `@mantine/core`.
- Frontend JSX uses Mantine/design-system primitives rather than native HTML tags.

## Atomicity Model

- Route pages orchestrate; feature modules contain domain behavior.
- Design-system components define shared form; pages invoke rather than restyle.
- New repeated UI form should be promoted into `src/design-system` or feature-local component modules.
