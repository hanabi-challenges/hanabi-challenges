# Site Content API

## Scope

CMS-managed markdown content for About, Legal, FAQ, and related pages.

## Key Endpoints (Representative)

- `GET /site-content/:slug`
- `PATCH /site-content/:slug` (admin)

## Rendering

All markdown content should be rendered through the shared markdown parser/renderer pipeline.
