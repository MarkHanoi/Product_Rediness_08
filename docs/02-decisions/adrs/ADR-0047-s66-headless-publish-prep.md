# ADR-0047 — S66 Headless npm-publish prep

- **Status**: Accepted (sprint-scoped, S66)
- **Date**: 2026-04-28
- **Related**: ADR-0046 (S66 webhooks), `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S66 D3

## Context

`apps/headless` is the Node 20+ headless runner that drives PRYZM
project bake/export/import operations from the command line.  Per the
S66 D3 work-item it must become **publish-ready** to npm, although the
actual `npm publish` invocation is held for the S66 demo cutover and
NOT performed in this sprint.  The package today is `private: true`
and lacks the metadata required for a public package: `engines`,
`license`, `repository`, `homepage`, `bugs`, `files`, `bin`, and a
public `keywords` list.

The persistence backend export was also still importing
`FileSystemBackend` from the universal barrel of
`@pryzm/persistence-client`, dragging Node-only modules
(`node:fs/promises`, `node:path`) into browser bundles that depend on
the same package.  This had to be resolved before any publish-prep
work could land cleanly.

## Decisions

### A. Keep `private: true` until cutover

The package metadata becomes publish-ready in S66 but `private` stays
`true` so a stray `npm publish` cannot ship by accident.  The S66 D3
demo flips this single flag and runs `pnpm publish --no-git-checks`
against the `@pryzm` scope; that flip is its own commit, gated by the
demo checklist, and is intentionally NOT part of the S66 D1 PR.

### B. Engines pinned to Node `>=20.0.0 <23.0.0`

S65 verified the package builds and tests pass under Node 20.x.  We
intentionally cap below 23 until the V8 ABI implications of the
upstream 23 release have been audited for the AI host worker pool.
S67 will widen the cap once that audit lands.

### C. `bin` entry exposes `pryzm-headless`

Publish exposes a single CLI entry-point under the `pryzm-headless`
binary name (existing `dist/cli.js` shape).  This name is reserved on
npm under the `@pryzm` scope so external consumers can run
`npx @pryzm/headless` from CI without a local install.

### D. `files` whitelist limits the published tarball

We ship `dist/`, `README.md`, `LICENSE`, `package.json` only.  Source
TypeScript and the test directory are excluded so the public surface
matches the published `.d.ts` exactly.

### E. `FileSystemBackend` moved to the `/node` sub-entry

The Node-only filesystem backend was split out of
`@pryzm/persistence-client`'s default barrel into a
`@pryzm/persistence-client/node` sub-export so browser consumers can
import the cross-platform surface without dragging
`node:fs/promises` into their bundles.  `apps/headless/src/index.ts`
now imports from the sub-entry; the public types are unchanged.

### F. SBOM + license scan deferred to demo PR

Generating a Software Bill of Materials and running a license scan
against the publishable tree is part of the S66 D3 demo PR, not the
S66 D1 prep PR documented here.  Capturing this explicitly avoids a
later "wait, did we run that?" moment during the demo run.

## Consequences

- `apps/headless/package.json` now carries publish-required metadata
  but flipping `private: false` is a one-line change for the demo
  cutover.
- Browser-side consumers of `@pryzm/persistence-client` regain a clean
  bundle; Node-side consumers of `FileSystemBackend` import from the
  documented `/node` sub-entry.
- A Node 20.x compatibility test (`__tests__/node-compat.test.ts`)
  asserts the runtime version range and the public CLI shape so
  regressions are caught at PR-time, not at demo-time.
