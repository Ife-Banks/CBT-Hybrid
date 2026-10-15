# @cbt/config

Shared TypeScript configuration for the CBT monorepo.

## `tsconfig.base.json`

Every workspace package extends this file:

```jsonc
{
  "extends": "../../packages/config/tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
}
```

The base targets CommonJS (matching NestJS) with `strict` and
`noUncheckedIndexedAccess` on, per `CBT-04-Build-Specification.md` section 2.2.

Front-end packages (Vite/Next) override `module` and `moduleResolution`.

> Note: the repo-wide ESLint flat config currently lives at the repository root
> (`eslint.config.mjs`) because flat-config `ignores` patterns resolve relative
> to the file that declares them. See `docs/questions.md`.
