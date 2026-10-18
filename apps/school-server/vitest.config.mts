import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * NestJS relies on `emitDecoratorMetadata` (design:paramtypes) for dependency
 * injection. Vitest's default esbuild transform does not emit it, so we compile
 * with SWC and turn decorator metadata on.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    // e2e specs boot a full Nest app in `beforeAll`; under `turbo` parallel runs
    // that can exceed the 10s default and fail the hook.
    hookTimeout: 30_000,
  },
});
