# Contributing

## Ground rules

1. Work **one phase at a time**, in the order in `docs/CBT-Build-Phases-Overview.md`.
   Do not start the next phase until the current one passes its verification.
2. Tests before or with code for `packages/exam-core`, authentication,
   permissions, sync and marking.
3. Run `pnpm verify` before saying anything is done.
4. Never invent endpoints, tables or fields that the specs name differently.
   If something is missing, add it to the spec in the same change and flag it.
5. Keep pull requests small: one concern each, with a description naming the
   `US-` stories it covers where applicable.
6. No secrets in the repository. No real student data in fixtures.

## Code style

- TypeScript, `strict` and `noUncheckedIndexedAccess` on (see `packages/config/tsconfig.base.json`).
- No `any` without a comment explaining why.
- Prettier for formatting, ESLint (`eslint.config.mjs`) for linting.
- Conventional Commits.

## Before opening a PR

```bash
pnpm verify
```

## Tests

- Unit tests: Vitest.
- API tests: Supertest.
- End-to-end: Playwright (added in a later phase).
- Load: k6 (added in a later phase).

## Reporting conflicts

If two specifications disagree, follow the precedence in
`CBT-04-Build-Specification.md` section 1.2, record the conflict and your choice
in `docs/questions.md`, and continue with the safest option.
