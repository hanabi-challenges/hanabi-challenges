# Badges API

## Scope

Badge set design persistence, preview SVG storage, event attachments, awards.

## Key Endpoints (Representative)

- `GET /badges/sets`
- `GET /badges/sets/:id`
- `POST /badges/sets`
- `PATCH /badges/sets/:id`
- `DELETE /badges/sets/:id`
- Event attachment/award endpoints (event domain integration)

## Data Contract

Saved badge set should include:

1. Builder configuration JSON
2. Consolidated preview SVG string

All non-builder render paths should prefer stored SVG.
