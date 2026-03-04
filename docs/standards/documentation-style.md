# Documentation Style Guide

## Objectives

- Canonical: one source of truth per topic.
- Orthogonal: architecture, standards, API, runbooks remain separated.
- Operational: include commands, paths, and ownership assumptions.
- Navigable: every major docs folder has an index `README.md`.

## Writing Rules

- Prefer imperative, actionable language.
- Include file paths and route names explicitly.
- Separate current behavior from planned behavior.
- Avoid stale roadmap text in canonical docs.

## Doc Layout Requirements

Each doc should include:

- Scope
- Current behavior
- Constraints
- Operational guidance (where relevant)
- Links to adjacent docs

For new docs, start from templates in [`docs/templates`](../templates/README.md).

## Change Management

When behavior changes:

1. Update relevant domain docs in this tree.
2. Update ADR if architectural decision changed.
3. Update runbook if operational procedure changed.
4. Update section index pages if files are added, moved, or removed.
