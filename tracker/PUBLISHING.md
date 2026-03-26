# Tracker — Publishing Procedures

## Branch Strategy

All tracker work follows a two-tier branch structure:

```
main
  └── tracker                    ← long-lived; never merges to main until the project is complete
        ├── tracker/ticket-001   ← per-ticket branch; merges into tracker when green
        ├── tracker/ticket-002
        └── ...
```

- **`tracker`** is the long-lived integration branch. It represents all completed, passing tracker work at any given moment. It is never merged into `main` until every ticket is done and the full E2E suite is green.
- **Per-ticket branches** are named `tracker/ticket-NNN` (e.g. `tracker/ticket-015`). They branch off `tracker` and merge back into `tracker` when complete.
- Direct pushes to `tracker` are blocked — all changes arrive via PR from a per-ticket branch.
- Work is strictly sequential. A new per-ticket branch is never started until the previous ticket's PR has been merged into `tracker` with green CI.

> **Git namespace note:** Because git cannot hold both a branch named `tracker` and branches named `tracker/*` as local refs simultaneously, delete the local `tracker` branch after pushing it to the remote. All per-ticket work is done on `tracker/ticket-NNN` branches that track `origin/tracker`. Merges to `origin/tracker` are done via GitHub PR; no local `tracker` branch is required.

---

## Commit Conventions

All commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Types used in this project:

| Type        | Purpose                                                    |
| ----------- | ---------------------------------------------------------- |
| `feat`      | New functionality                                          |
| `fix`       | A bug fix                                                  |
| `chore`     | Tooling, configuration, scaffolding with no production code change |
| `test`      | Test additions or modifications                            |
| `docs`      | Documentation changes only                                 |
| `refactor`  | Code restructuring without behaviour change                |
| `perf`      | Performance improvements                                   |
| `ci`        | CI pipeline changes                                        |
| `migration` | Database migration additions                               |

**Scope** is optional but encouraged where it adds clarity: `feat(tickets):`, `feat(discord):`, `fix(lifecycle):`, `migration(users):`.

**Subject line rules:** imperative mood ("add vote endpoint" not "added vote endpoint"), under 72 characters, no trailing period.

**Body and footer:** used when context is needed — explain *why*, not *what*. Document any design decision made during implementation that deviated from the spec, any constraint discovered that future tickets should know about, and any migration that requires special handling on deploy.

---

## Merge Policy

When merging a per-ticket branch into `tracker`, use **squash merge** — one commit per ticket on the `tracker` branch. The squash commit message follows this format:

```
type(scope): description (#NNN)
```

Example: `feat(tickets): implement ticket creation endpoint (#015)`

The full commit history is preserved on the per-ticket branch. The `tracker` branch stays clean and readable.

---

## The "Never Progress Until Green" Rule

This is an absolute rule with no exceptions:

1. CI must be green on the per-ticket branch before a PR can be opened
2. CI must be green on the PR before it can be merged into `tracker`
3. A new per-ticket branch is never started while CI is red on any open PR
4. If CI breaks on `tracker` itself, all other work stops until it is fixed

If CI is failing, that is the only work. There is no parallel progress.

---

## PR Requirements

Every PR from a per-ticket branch into `tracker` must include:

- **Summary**: one paragraph describing what this ticket implements in plain English
- **Design decisions**: any decisions made during implementation that deviated from the spec or required judgment not captured in the ticket — this is the permanent record of *why* things were built a certain way
- **Verification steps**: the specific commands or manual steps needed to verify the work locally
- **Test coverage**: what the tests cover and, honestly, what they do not
- **Follow-on notes**: anything the next ticket needs to know — constraints discovered, assumptions made, technical debt incurred

---

## Staging Verification Checklist

Before promoting any build to production, verify the following on staging:

- [ ] All CI jobs green on the `tracker` branch
- [ ] `GET /tracker/health` and `GET /tracker/health/db` return 200
- [ ] A ticket can be submitted end-to-end by a community member account
- [ ] A ticket can be triaged by a moderator account
- [ ] A committee member can make a decision with a resolution note
- [ ] The Discord outbound webhook delivers a message to the mod channel (requires staging Discord configuration)
- [ ] The Discord `/token` command successfully links an identity on staging

---

## Go/No-Go Criteria for Production Promotion

All of the following must be true before promoting to production:

- [ ] All CI jobs green on the `tracker` branch
- [ ] Staging verification checklist complete
- [ ] `tracker/SECURITY_REVIEW.md` complete with no unresolved findings
- [ ] `tracker/QUERY_REVIEW.md` complete with no unresolved performance concerns
- [ ] All environment variables confirmed provisioned in production
- [ ] Rollback procedure tested on staging within the last 7 days
- [ ] The final `tracker` to `main` PR has been reviewed

---

## The Final Merge to Main

When all 48 tickets are complete and the `tracker` branch is fully green including the E2E suite, one PR is opened from `tracker` into `main`. That PR's description serves as the release notes: what the tracker is, what it does, and the go-live checklist. The final merge to `main` is the only moment the tracker becomes part of the production codebase.

---

## Go-Live Activation for Dormant Integrations

These steps require no deployment — configuration only:

- **Discord outbound webhook**: set `DISCORD_MOD_WEBHOOK_URL` in the production environment. The dispatcher activates on the next ticket submission.
- **Discord bot**: set `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `DISCORD_MOD_ROLE_NAME` in the production environment, then redeploy so the bot process starts. Verify by running `/token` in the Discord server.

---

## Migration Safety Requirements

Every database migration must be backwards-compatible with the previous deployed server version:

- New columns must have defaults or be nullable
- No column may be dropped or renamed in the same migration that introduces code depending on the new shape — breaking schema changes must be split across at least two deployments
- Every migration must have a working `down` function — rollback is tested before the migration is considered complete
- Migration filenames use timestamps (`YYYYMMDDHHMMSS_description.sql`) — never sequential numbers, to prevent merge conflicts

---

## Rollback Procedure

1. Revert the deployment to the previous build artifact
2. Assess whether any migrations need to be rolled back — check `tracker_schema_migrations` against the previous build's expected schema
3. If rollback migrations are needed: run `pnpm tracker:db:rollback` for each migration added since the previous build, in reverse order
4. Confirm `GET /tracker/health/db` returns 200
5. Confirm a ticket can be submitted end-to-end
6. Document the rollback in this file under the [Hotfixes and Rollbacks](#hotfixes-and-rollbacks) section with timestamp and reason

---

## Hotfix Procedure

If an urgent fix is needed after go-live:

1. Branch `tracker/hotfix-NNN` off `main` (not off `tracker`)
2. Fix, test, CI green
3. PR into `main` directly
4. Immediately cherry-pick the fix into `tracker` to keep branches consistent
5. Document the hotfix below

---

## Hotfixes and Rollbacks

_No hotfixes or rollbacks recorded yet._
