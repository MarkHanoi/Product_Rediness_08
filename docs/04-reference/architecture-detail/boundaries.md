# Layered architecture boundaries

**Status**: closes the boundaries-policy half of W-16
(`PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`).
**Date**: 2026-04-28.

This document is the canonical reference for the boundary policy
enforced by the root `eslint.config.js` and by the
`tools/eslint-plugin-pryzm/*` rule set.  Any future audit must read
this file before flagging a "boundary violation" — many of the
exemptions are intentional and listed here.

## 1 — Layer matrix (L0 → L7)

The matrix is defined in `eslint.config.js` under the
`boundaries/element-types` rule. The summary:

| Layer | Examples                          | May import from         |
|-------|-----------------------------------|-------------------------|
| L0    | `persistence-client`, `loader`    | (none — leaf)           |
| L1    | `protocol`, `schemas`, `stores`   | L0                      |
| L2    | `command-bus`                     | L0, L1                  |
| L3    | `sync`, `awareness`               | L0, L1, L2              |
| L4    | `geometry-kernel`, `picking`, `intent-resolver`, `cascade` | L0, L1, L2 |
| L5    | `frame-scheduler`, `scene-committer`, `renderer`, `view-state`, `material-pool`, `selection`, `drawing-primitives` | L0, L1, L2, L4 |
| L6    | `tools`, `families`, `cascade-rules` plus all `plugins/*` | L0–L5 |
| L7    | `apps/editor`, `apps/headless`, `apps/component-editor`, `apps/bench` | L0–L6 |

Lower layers MUST NOT import from higher layers — the rule fails
hard on every PRYZM 2 package.  The PRYZM 1 legacy `src/**` tree is
exempt (see §3 below).

## 2 — Custom rules

| Rule                                | Scope                                              | Severity         |
|-------------------------------------|----------------------------------------------------|------------------|
| `pryzm/no-three-in-kernel`          | `packages/{geometry-kernel,intent-resolver,cascade}/**` | **error**        |
| `pryzm/no-three-outside-committer`  | All PRYZM 2 packages outside the allow-list (renderer, scene-committer, render-runtime, material-pool, view-plugin, bench) | **error**, with `warn` on legacy `src/**` |
| `pryzm/no-raf`                      | All PRYZM 2 packages outside `frame-scheduler`     | **error**, with `warn` on legacy `src/**` |
| `pryzm/store-single-channel`        | `packages/command-bus`, all `plugins/*`            | **error**        |
| `pryzm/no-handler-in-store`         | `packages/stores`                                  | **error**        |

The `*.bad.ts` and `*.good.ts` fixtures for every rule live in
`tools/scripts/check-lint-fixtures.mjs`; some fixtures additionally
need to live in a real package on disk so the path-keyed rules
(`pryzm/no-raf`, `pryzm/store-single-channel`) actually fire — that
is what `@pryzm/legacy-shim` exists for (see §3).

## 3 — Process-only packages

These workspace members exist for tooling/lint reasons and are not
part of the runtime tree.  They are exempt from the boundary matrix
and from runtime gates (bundle size, raf snapshot, etc.).

| Package                | Why it's exempt                                              |
|------------------------|--------------------------------------------------------------|
| `@pryzm/legacy-shim`   | Holds intentional `*.bad.ts` fixtures consumed by `tools/scripts/check-lint-fixtures.mjs`. The two rules it triggers (`pryzm/no-raf`, `pryzm/store-single-channel`) key off the file path, so the fixtures must live on disk inside `packages/**`. Will be deleted at S66. See `packages/legacy-shim/README.md` for the full rationale. |
| `@pryzm/test-audit-log-s57` | Workspace-member purely so `vitest` resolves under pnpm; not shipped. |

`eslint.config.js` carries explicit overrides for both packages
(`boundaries/element-types: 'off'`, `pryzm/no-raf: 'off'`) — do NOT
remove those without first deleting the package.

## 4 — Legacy `src/**` (PRYZM 1)

The PRYZM 1 codebase still lives under `src/**` and is being sunset
in stages (`tools/pryzm1-sunset/*`).  It is configured at the bottom
of `eslint.config.js` with **warn-only** custom rules so editors
surface drift without breaking the build.  Two rules in particular
land as `warn` for `src/**` only:

* `pryzm/no-raf` — there are existing `requestAnimationFrame` call
  sites in PRYZM 1 paint loops.  The hard-fail companion is
  `tools/scripts/check-raf-count.mjs` which snapshot-diffs the count.
* `pryzm/no-three-outside-committer` — PRYZM 1 imports THREE freely;
  the rule warns to make new violations visible during sunset PRs.

The boundary matrix (L0 → L7) is **not** applied to `src/**` — that
tree predates the layer system.

## 5 — Audit checklist

When auditing a new package or plugin, verify:

* [ ] It is listed in the layer matrix above (or in
      `docs/03_PRYZM3/archive/superseded-audits/PHASE-1-PACKAGE-CLASSIFICATION.md`
      as a Phase-2 / Phase-3 stub).
* [ ] Its imports satisfy the layer matrix.
* [ ] If it imports `three`, it is on the
      `no-three-outside-committer` allow-list and that allow-list
      entry is justified in the rule source.
* [ ] If it calls `requestAnimationFrame`, it is `frame-scheduler`
      itself or a `*.bad.ts` fixture in `@pryzm/legacy-shim`.
* [ ] If it is process-only, it has an entry in §3 above and the
      corresponding `eslint.config.js` override.

---

## Editor bootstrap

The editor has exactly one public bootstrap entry point:
`bootstrapWithEverything` (re-exported from `@pryzm/editor`).  See
[`docs/architecture/bootstrap.md`](./bootstrap.md) for the contract,
the deleted `bootstrap.render.data.ts` rationale (W-15), and the
contract test that prevents a parallel bootstrap from re-emerging.

**Boundary lint**: the lower-level `bootstrap()` in
`apps/editor/src/bootstrap.ts` is internal — it is not exported from
`apps/editor/package.json` and must not be deep-imported.
