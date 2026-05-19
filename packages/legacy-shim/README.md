# `@pryzm/legacy-shim` — process-only fixture package

> **TL;DR**: This package does not ship.  It exists solely so the
> `pryzm/no-raf` and `pryzm/store-single-channel` ESLint rules have a
> real, non-test source location they must police.  Deleting this
> package without touching `tools/scripts/check-lint-fixtures.mjs`
> will break CI.

## Why does this exist?

Custom ESLint rules in PRYZM 2 (`pryzm/no-raf`,
`pryzm/no-three-outside-committer`, `pryzm/store-single-channel`,
`pryzm/no-three-in-kernel`) are validated by
`tools/scripts/check-lint-fixtures.mjs` which runs each rule against:

1. A `*.bad.ts` fixture — must produce **exactly one** error.
2. A `*.good.ts` fixture — must produce **zero** errors.

Two of those rules (`pryzm/no-raf`, `pryzm/store-single-channel`) key
off the file path; they only fire on production-ish code paths
(`packages/**`, `apps/**`, `plugins/**`).  We therefore can't put
their fixtures inside `__tests__/` or under a `*.bad.ts` filename in
an unrelated package — the rule wouldn't fire and the integration
test would silently regress.

`@pryzm/legacy-shim` is the named, intentional violation surface for
those two rules:

| Fixture                        | Rule under test               |
|--------------------------------|-------------------------------|
| `src/raf.bad.ts`               | `pryzm/no-raf`                |
| `src/two-stores.bad.ts`        | `pryzm/store-single-channel`  |

Per `eslint.config.js` the package is exempt from `boundaries/element-types`
and `pryzm/no-raf` (the integration test invokes the rule directly).

## Boundaries / lint integration

* The package is **not** in `tsconfig.json`'s composite project
  graph — `pnpm -r run build` skips it.
* It is **not** in `apps/editor/package.json`'s dependency graph —
  the editor bundle does not include it.
* The bundle-size gate (W-03) ignores it.
* The PRYZM 2 boundaries layer-matrix in `eslint.config.js` excludes
  it via the `packages/legacy-shim/**` override that turns
  `boundaries/element-types` off.

## Lifecycle

This package will be **deleted at S66** alongside `apps/editor` per
`docs/03_PRYZM3/reference/phases/PHASE-3/3-COMPLETION-GA-M25-M36.md`.
At that point custom-rule integration moves to inline string fixtures
inside `tools/scripts/check-lint-fixtures.mjs`, and the layered
`packages/` tree no longer carries an intentional-bad surface.

## What you must not do

* **Do not import** anything from `@pryzm/legacy-shim` in production
  code — the bad fixtures would compile in.
* **Do not silence** the rule by adding `// eslint-disable-next-line` —
  the integration test asserts the warning fires; silencing it makes
  CI flaky in a hard-to-debug way.
* **Do not rename** the `*.bad.ts` files — the integration script's
  fixture table keys off the literal filenames.
* **Do not add new fixtures here** without also adding the matching
  case to `tools/scripts/check-lint-fixtures.mjs` — orphan fixtures
  silently rot.

If you need a new "bad-code" fixture for a new rule, prefer adding it
to this package (one extra `*.bad.ts`) over creating a second shim
package.  See `tools/scripts/check-lint-fixtures.mjs` for the full
case table.

## See also

* `tools/eslint-plugin-pryzm/src/rules/no-raf.js` — the rule source.
* `tools/eslint-plugin-pryzm/src/rules/store-single-channel.js` — the rule source.
* `tools/scripts/check-lint-fixtures.mjs` — the integration script.
* `docs/architecture/boundaries.md` §"Process-only packages" — the
  policy entry that lists every fixture/process package and their
  exemptions.
