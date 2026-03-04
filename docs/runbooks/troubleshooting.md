# Troubleshooting Runbook

## API: `DATABASE_URL is not set`

- Ensure `apps/api/.env` exists.
- Copy from `apps/api/.env.example` if missing.
- Confirm `DATABASE_URL` points to local mapped port (`55432` in dev script defaults).

## Web: Vite Proxy `ECONNREFUSED`

- API server is not running/reachable.
- Verify `pnpm -C apps/api run dev` is healthy.

## DB Appears Reset Unexpectedly

- Confirm startup command did not use `DEV_RESET_DB=1`.
- Default startup path should skip reset.

## Badge Save Failures

- Check unique name constraint.
- Confirm icon token resolves.
- Inspect API error body/status in network tab.

## Event Create/Edit Failures

- Verify owner user exists and FK constraints pass.
- Verify event schema includes expected owner column.
- Check API logs for SQL error code and message.

## Page Fails to Render

- Run `pnpm -C apps/web run lint`.
- Check browser console for missing symbol/import errors.
