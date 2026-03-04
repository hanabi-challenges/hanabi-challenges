# API Test Factories

This folder is the canonical location for reusable test data builders and DB seed helpers.

Guidelines:

- Keep builders deterministic by default.
- Prefer explicit overrides per test over hidden randomness.
- Use `tests/support/` for transport and harness utilities, not data shaping.
