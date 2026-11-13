# Tests

- **Unit tests** live next to the code they test (`packages/*/src/**/*.test.ts`) and run with `npm test`.
- **`tests/integration/`** — cross-package tests (e.g. storage + editor content round-trips). Put new ones here as `*.test.ts`; Vitest picks them up.
- **`tests/acceptance/`** — the manual MVP acceptance checklist (`CHECKLIST.md`) until browser automation is added.
- **Backend** tests live in `backend/tests` and run with `pytest`.

See `docs/TESTING.md`.
