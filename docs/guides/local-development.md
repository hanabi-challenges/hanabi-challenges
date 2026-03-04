# Local Development Guide

## Prerequisites

- Node 20+
- pnpm via Corepack
- Docker

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
```

## Start

```bash
pnpm run dev
```

This performs:

1. Docker DB startup (`infra/dev/start-dev-env.sh`)
2. Optional reset only when `DEV_RESET_DB=1`
3. API and web dev servers

## Useful Commands

- `pnpm run lint`
- `pnpm run build`
- `pnpm run test`
- `pnpm run test:api:integration`

## DB Reset (Opt-in)

```bash
DEV_RESET_DB=1 pnpm run dev
```

## Troubleshooting

See [Troubleshooting Runbook](../runbooks/troubleshooting.md).
