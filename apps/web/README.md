# @hanabi-challenges/web

Vite + React + TypeScript frontend for Hanabi Events.

## Development

From the repo root, run the full dev environment (API + web):

```bash
pnpm run dev
```

Or run the web app in isolation:

```bash
pnpm --filter @hanabi-challenges/web run dev
```

## Building

```bash
pnpm --filter @hanabi-challenges/web run build
```

Output goes to `dist/`.

## Testing

```bash
pnpm --filter @hanabi-challenges/web run test
```

## Linting & formatting

Run from the repo root alongside all other packages:

```bash
pnpm run lint
pnpm run format:fix
```
