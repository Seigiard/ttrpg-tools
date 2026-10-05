# Upstream

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Copied from: `skills/install-anti-slop/assets/anti-slop/`
- Installed at: `tools/oxlint/anti-slop/`
- Generic entry point: `tools/oxlint/anti-slop/index.ts`
- Oxlint and `@oxlint/plugins`: `1.86.0` (exact versions).

The plugin source is unchanged. The upstream MIT license is included here.
The nested ESLint Stylistic license and provenance are preserved under `vendor/`.
All generic rules and `oxc/no-accumulating-spread` are enabled as errors in
`.oxlintrc.json`. Effect rules are not registered because the project has no
direct Effect dependency. Existing lint scope and ignores are preserved.

The nested `vendor/eslint-stylistic/UPSTREAM.md` describes the upstream anti-slop
repository. Its pnpm commands and named test files apply there; those tests are
not included in this copy. After a local update, run this project's CI checks.
Then run `bun run lint:fix` followed by `bun run format` and confirm that a second
pass leaves the files unchanged.
