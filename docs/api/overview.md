# API Overview

## Base

- Local dev base URL: `http://localhost:4000/api`

## Auth Model

- JWT bearer tokens for protected routes.
- Cookie token support exists for web auth flows.

## Domain Modules

- `auth`
- `users`
- `events`
- `challenges`
- `session-ladder`
- `teams`
- `results`
- `badges`
- `notifications`
- `admin-access`
- `site-content`
- `variants`

## Conventions

- Protected routes require `Authorization: Bearer <token>`.
- State transition endpoints should return updated state where practical.
- Conflict conditions use HTTP `409`.
