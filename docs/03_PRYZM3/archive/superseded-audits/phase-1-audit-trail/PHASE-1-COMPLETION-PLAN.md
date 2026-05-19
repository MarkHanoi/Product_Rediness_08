# PHASE 1 (1A + 1B + 1C) — Implementation plan to 100 / 100

> **Companion to**: `PHASE-1-FULL-AUDIT.md` (sibling file).
> **Date**: 2026-04-27
> **Mode**: documentation only — no code changes.
> **Scope**: every gap the audit identified, broken down into sequenceable work units with precise file paths, code sketches, acceptance gates, and risks.
> **Deliverable definition**: each sub-phase reaches the *exact* exit criteria printed in its phase doc — no stretch goals, no scope creep.

---

## §0 Reading guide

### §0.1 Conventions used in this plan

- **W-1A-N / W-1B-N / W-1C-N** — work units, numbered by sub-phase. Each unit is independently mergeable and has its own acceptance gate.
- **Severity**: CRITICAL > HIGH > MEDIUM > LOW > INFO. Carries through from the audit.
- **Effort estimate**: rough person-day band (1d, 2-3d, 1wk, 2wk). Calibrated to a contributor who is already familiar with the wall-plugin pattern and has the spec docs open. Assumes existing CI is green.
- **Code sketches** are TypeScript-flavoured pseudocode meant to communicate the *shape* of the change. Imports may be elided. They are **not** drop-in code; they exist to fix the contract before the keyboard hits the IDE.
- **Files to add / modify** lists are verified against the live tree as of the audit timestamp; any path printed below either exists today or is being created by this plan.

### §0.2 Audit correction folded into this plan

The audit's `G-1C-1` ("6 of 12 families have empty parity dirs") was technically true at the directory level but understated reality. Door, window, slab, grid, column, beam each ship an **inline-fixture** parity test with the spec-matching count (16 / 12 / 18 / 8 / 6 / 6 = 66 cases). These tests run today and pass meaningfully — they assert vertex count, index count, group count, material count, bounds extent, and the producer hash. What they do **not** assert is byte-equality of the raw float buffers, and they do **not** persist `configs/<id>.json` + `snapshots/<id>.snap.json` artefacts to disk (which is what the wall / ceiling / curtain-wall / stair / handrail families do).

So `G-1C-1` re-grades from CRITICAL ("absent gate") to **HIGH** ("weaker gate; pattern inconsistency"). The work below addresses both: bring all 12 families onto the same disk-based byte-equal pattern.

### §0.3 What "100 / 100" means here

The phase docs end with explicit exit checklists. The plan below maps **one work unit per checklist item that is not yet satisfied**. We do not invent new criteria. When the last unit lands:

- **1A** has all 5 ESLint rules; numbering drifts in ADR space are noted in errata.
- **1B** has reconciled `MoveWall` vs `TransformWall`, all four bench baseline reports published, and a Playwright integration suite for the wall plugin's S09 D7 visual-diff gate.
- **1C** has all 12 families wired into the editor, all 12 families on the disk-based parity pattern with spec-budget fixture counts, all 10 roof handlers, the bench dashboard live with 18+ entries and a published `M9-1C-baseline.md`, the two missing integration spec files, and the handover doc set complete.

---

## §1 Plan summary

### §1.1 Work-unit register

| # | Unit | Severity | Effort | Blocks |
|---|---|---|---|---|
| W-1A-1 | Add ESLint rule `pryzm-store-single-channel` | LOW | 1d | — |
| W-1B-1 | Reconcile `MoveWall.ts` vs `TransformWall { kind: 'move' }` | LOW | 0.5d | — |
| W-1B-2 | Backfill 1B bench baseline reports | LOW | 1d | — |
| W-1B-3 | Stand up Playwright + wall S09 D7 visual-diff suite | MEDIUM | 3-4d | W-1C-5 |
| W-1C-1 | Generalise editor wiring: `bootstrapWithEverything()` + per-plugin barrels | CRITICAL | 4-5d | W-1C-2, W-1C-7, W-1C-9 |
| W-1C-2 | Migrate door/window/slab/grid/column/beam to disk-based parity pattern | HIGH | 5-6d | — (uses existing inline fixtures) |
| W-1C-3 | Bring curtain-wall parity from 8 → 25 fixtures | HIGH | 3-4d | — |
| W-1C-4 | Bring stair / handrail / ceiling to spec budget | MEDIUM | 2-3d | — |
| W-1C-5 | Add 3 missing roof handlers (`AddSkylight`, `RemoveSkylight`, `JoinRoofs`) + schema extension | HIGH | 3-4d | requires `Roof` schema bump |
| W-1C-6 | Build out bench dashboard beyond `types.ts` + publish `M9-1C-baseline.md` | MEDIUM | 4-5d | W-1C-7 |
| W-1C-7 | Add `tests/integration/headless-vs-browser-parity.spec.ts` | MEDIUM | 2-3d | W-1B-3 (Playwright), W-1C-1 |
| W-1C-8 | Add `tests/integration/view-state-2a-readiness.test.ts` | LOW | 1-2d | W-1C-1 |
| W-1C-9 | Backfill handover docs (`docs/architecture/{picking,selection,view-state,camera,headless,element-coupling}.md`) + `M9-1C-headless.mp4` recording + `S18-retro.md` | LOW | 2d | — |

**Total estimated effort**: ~32–42 person-days for a single contributor. With three contributors splitting along plugin / parity / dashboard tracks the wall-clock collapses to roughly 12–16 days.

### §1.2 Sequencing DAG

```text
                        ┌───────────────┐
                        │   W-1A-1      │  (ESLint rule — independent)
                        └───────────────┘

  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │  W-1B-1      │   │  W-1B-2      │   │  W-1B-3      │
  │  MoveWall    │   │  bench       │   │  Playwright  │
  │  reconcile   │   │  baselines   │   │  + S09 visual│
  └──────────────┘   └──────────────┘   └──────────────┘
                                              │
                                              ▼
                                     ┌───────────────┐
                                     │   W-1C-7      │
                                     │   integration │
                                     │   headless-vs-│
                                     │   browser     │
                                     └───────────────┘

  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │  W-1C-2      │   │  W-1C-3      │   │  W-1C-4      │
  │  6-family    │   │  CW parity   │   │  stair /     │
  │  parity      │   │  8→25        │   │  handrail /  │
  │  migration   │   │              │   │  ceiling     │
  └──────────────┘   └──────────────┘   └──────────────┘

  ┌──────────────┐   ┌──────────────┐
  │  W-1C-5      │   │  W-1C-1      │   ← CRITICAL anchor
  │  roof + 3    │   │  bootstrap-  │
  │  handlers    │   │  WithEvery-  │
  └──────────────┘   │  thing()     │
                     └───────┬──────┘
                             │
                ┌────────────┼────────────┬────────────┐
                ▼            ▼            ▼            ▼
       ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐
       │  W-1C-7    │ │  W-1C-8    │ │ W-1C-6   │ │ W-1C-9   │
       │  integ-    │ │  view-     │ │ dashboard│ │  docs +  │
       │  parity    │ │  state-2a  │ │  + base- │ │  demo    │
       │  spec      │ │  readiness │ │  line    │ │          │
       └────────────┘ └────────────┘ └──────────┘ └──────────┘
```

Independent tracks (can ship in parallel): {W-1A-1}, {W-1B-1, W-1B-2}, {W-1C-2, W-1C-3, W-1C-4}, {W-1C-5}.
Sequenced track: W-1B-3 → W-1C-7; W-1C-1 → {W-1C-7, W-1C-8, W-1C-6, W-1C-9}.

---

# §2 Sub-phase 1A — to 100 / 100

Only one delta. The four already-shipped lint rules pin `no-raf`, `no-three-in-kernel`, `no-three-outside-committer`, `affected-stores-required`. The fifth rule is the one the architecture invokes loudest in 1B and 1C handlers but never enforces.

## W-1A-1 — `pryzm-store-single-channel` ESLint rule

**Severity**: LOW.
**Effort**: 1 person-day.
**Why**: 1A spec lists this as one of five hard-rail lint rules. It enforces that a `CommandHandler.handle()` body can only mutate stores that are declared in `affectedStores: readonly (keyof TStores)[]`. The TypeScript type already constrains the *type* of the stores parameter; the lint rule catches the runtime mistake of grabbing a different store via `globalThis.__pryzm2DevHandle.stores.<other>` or via a closure capture of an outer-scope store reference — neither of which TypeScript can catch.

### Files to add

- `tools/eslint-plugin-pryzm/src/rules/pryzm-store-single-channel.js`
- `tools/eslint-plugin-pryzm/src/rules/__tests__/pryzm-store-single-channel.test.js`
- `packages/legacy-shim/src/two-stores.bad.ts` (negative fixture, mirroring `raf.bad.ts`)

### Files to modify

- `tools/eslint-plugin-pryzm/src/index.js` — register the rule in the plugin's `rules` map.
- `eslint.config.js` (root) — opt the rule into `error` for `plugins/**/handlers/**/*.ts`.

### Rule contract

```js
// pryzm-store-single-channel.js
//
// Enforces ADR-0002 §3.B and §1A spec line 1180:
//
//   "A handler must only mutate the stores it declared in
//    `affectedStores`. Cross-store reads are fine; cross-store writes
//    are not. The bus's PatchEmitter is single-channel — it batches
//    per-frame patches under one store key. Two writes from one
//    handler under different keys is a contract violation."
//
// Detection: walk every class declaration that implements
// `CommandHandler<P, S>` (heuristic: has a `static type` string AND a
// `handle(payload, ctx)` method).  Collect the static `affectedStores`
// array (must be a literal). Inside the handle method, every member
// expression of the form `ctx.stores.<key>.<mutating-method>(...)`
// must have <key> in affectedStores.  Non-literal affectedStores (e.g.
// computed) is flagged as "ambiguous; declare explicitly".
//
// Mutating methods (configurable, default list):
//   set / update / mutate / patch / push / pop / shift / unshift /
//   splice / delete / clear / reset / replace
//
// Read-only methods (allowed):
//   get / has / keys / values / entries / find / forEach / size
```

### Code sketch

```js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid cross-store writes inside CommandHandler.handle',
      recommended: true,
    },
    schema: [{
      type: 'object',
      properties: {
        mutators: { type: 'array', items: { type: 'string' } },
      },
    }],
    messages: {
      undeclaredWrite: "Store '{{key}}' is mutated but not in affectedStores ({{declared}}).",
      nonLiteralAffected: "affectedStores must be a literal array.",
      missingAffected: "CommandHandler is missing static affectedStores.",
    },
  },
  create(context) {
    const mutators = new Set(
      (context.options[0]?.mutators) ?? [
        'set','update','mutate','patch','push','pop','shift','unshift',
        'splice','delete','clear','reset','replace',
      ]
    );
    return {
      ClassDeclaration(node) {
        // 1) heuristic: implements CommandHandler<...>
        // 2) read static `type` and static `affectedStores`
        // 3) traverse `handle(...)` method body for member expressions
        //    of shape: ctx.stores.<KEY>.<METHOD>(...)
        // 4) report `undeclaredWrite` if KEY not in affectedStores AND
        //    METHOD in mutators
      },
    };
  },
};
```

### Acceptance criteria

1. Lint rule is published in `eslint-plugin-pryzm` and reachable via `pryzm/pryzm-store-single-channel`.
2. Negative fixture `packages/legacy-shim/src/two-stores.bad.ts` produces exactly one error from the rule.
3. All 17 plugins lint clean against the new rule.
4. Rule is wired in root `eslint.config.js` at `error` level for `plugins/**/handlers/**/*.ts`.
5. Unit test covers: (a) declared-store write passes, (b) undeclared-store write fails, (c) non-literal affectedStores fails, (d) missing affectedStores fails, (e) read-only method on undeclared store passes.

### Risks

- **R-1A-1.1** — The heuristic for identifying a `CommandHandler` class is structural (has `static type` + `handle` method). Risk of false positives in test helper classes. *Mitigation*: also require either `affectedStores` static OR an explicit `implements CommandHandler` clause; default to skipping if neither is present and the file is not under `plugins/**/handlers/`.
- **R-1A-1.2** — A handler that legitimately mutates two declared stores (the wall+selection case) must not trip the rule. *Mitigation*: rule reads the declared list and only reports on writes to keys *not* in it.
- **R-1A-1.3** — Closure-captured store references (`const s = ctx.stores.foo; s.set(...)`) won't be caught by member-expression matching alone. *Mitigation*: documented limitation; companion rule could later use scope analysis. Out of scope for 1A completion.

---

# §3 Sub-phase 1B — to 100 / 100

Three units, all small, all independently mergeable.

## W-1B-1 — Reconcile `MoveWall` vs `TransformWall { kind: 'move' }`

**Severity**: LOW.
**Effort**: 0.5 person-day (decision + housekeeping).
**Why**: 1B spec S10 line 965 says `MoveWall` is renamed/folded into `TransformWall { kind: 'move' }`. The repo today carries both `plugins/wall/src/handlers/MoveWall.ts` and `plugins/wall/src/handlers/TransformWall.ts`. `buildWallHandlerSet()` registers both. `MoveWall` is exported in the plugin barrel (`export { MoveWallHandler, type MoveWallPayload } from './handlers/MoveWall.js';`).

### Decision required (one of three)

| Option | Action | When this is right |
|---|---|---|
| **A — Delete** | Remove `MoveWall.ts`, drop from `buildWallHandlerSet`, drop from barrel; downstream consumers must dispatch `wall.transform` with `kind: 'move'`. | If the spec authority is absolute and no callers remain. |
| **B — Façade** | Keep `MoveWall` as a thin facade that forwards to `wall.transform`; add a deprecation header docblock; mark the export with `@deprecated`. | If undo-stack history or persistence files in the wild emit `wall.move`. |
| **C — Co-equal** | Leave both, document that `wall.move` is the fast-path single-axis API and `wall.transform { kind: 'move' }` is the bulk-transform API; update the spec errata to record the divergence. | If both surfaces are intentionally exposed (UI shortcut vs scripting). |

**Recommendation**: **B (Façade)**. It is the lowest-risk path that honours the spec, keeps existing tests green, and produces a paper trail for 2A when undo/redo persistence is hardened. Facade body becomes a 5-line forward.

### Files to modify (Option B)

- `plugins/wall/src/handlers/MoveWall.ts` — replace body with a façade that constructs and dispatches `TransformWallPayload { kind: 'move', dx, dy, dz }`. Keep type / payload exports stable.
- `plugins/wall/src/handlers/index.ts` — leave `MoveWall` in `buildWallHandlerSet` but add a docblock above it noting the façade status.
- `plugins/wall/src/index.ts` — add `@deprecated` JSDoc to the `MoveWallHandler` and `MoveWallPayload` re-exports.
- `docs/00_NEW_ARCHITECTURE/code-level-adrs/0008-wall-handler-triage.md` — add one paragraph to the "Open questions" section documenting the façade.

### Code sketch (Option B)

```ts
/**
 * @deprecated Since S10 — `MoveWall` is a façade over
 * `TransformWall { kind: 'move' }`.  New callers should dispatch
 * `wall.transform`. This handler is kept so persistence files emitted
 * by S07–S09 remain replayable.
 */
export class MoveWallHandler implements CommandHandler<MoveWallPayload> {
  static readonly type = 'wall.move' as const;
  readonly type = MoveWallHandler.type;
  readonly affectedStores = ['wall'] as const;

  async handle(payload, ctx) {
    return new TransformWallHandler().handle(
      { wallId: payload.wallId, kind: 'move', dx: payload.dx, dy: payload.dy, dz: payload.dz },
      ctx,
    );
  }
}
```

### Acceptance criteria

1. `MoveWall.ts` body is < 30 lines and routes through `TransformWallHandler`.
2. All existing wall-plugin tests stay green.
3. ADR-0008 has the errata paragraph.
4. The plugin barrel re-export carries `@deprecated`.

### Risks

- **R-1B-1.1** — If `TransformWallHandler` mutates the wall in a way that rounds differently from the original `MoveWall`, parity snapshots could shift. *Mitigation*: run the 30-case wall parity suite with `WALL_SNAPSHOT_REFRESH=0` after the change; any drift is a real bug, not a façade artefact.

---

## W-1B-2 — Backfill 1B bench baseline reports

**Severity**: LOW.
**Effort**: 1 person-day.
**Why**: 1B spec asks for `S08-baseline.md`, `S09-baseline.md`, `S10-baseline.md`, `M6-1B-baseline.md` in `apps/bench/reports/`. Today only `produce-wall-baseline.md` exists. Without these, regression detection has no anchor and 1C work cannot show "no 1B regression".

### Files to add

- `apps/bench/reports/S08-baseline.md` — `cmd-execute-latency`, `wall-handlers`, `produce-wall` post-S08.
- `apps/bench/reports/S09-baseline.md` — `load-small`, `orbit-fps-walls`, `cmd-execute-latency` post-S09.
- `apps/bench/reports/S10-baseline.md` — same set post-S10 with cascade overhead measured.
- `apps/bench/reports/M6-1B-baseline.md` — consolidated summary at the 1B exit gate.

### Files to modify

- `apps/bench/src/save-baseline.ts` — extend to accept a `--sprint` flag (`S08`/`S09`/`S10`/`M6-1B`) and emit a markdown report with the bench id, p50/p95/p99, target, hardware string, and timestamp. Reuse the `BenchReport` type already in `apps/bench/dashboard/types.ts`.
- `apps/bench/package.json` — add scripts `bench:baseline:s08`, `bench:baseline:s09`, `bench:baseline:s10`, `bench:baseline:m6-1b`.

### Format (one entry per bench)

```markdown
## bench: cmd-execute-latency
- **sprint**: S08
- **timestamp**: 2026-04-27T14:32:11Z
- **hardware**: linux x64 ; node 20.11 ; CPU AMD EPYC 7B13
- **samples**: 10000
- **p50**: 0.43 ms
- **p95**: 0.91 ms  ← target ≤ 1 ms
- **p99**: 1.32 ms
- **status**: green
```

### Acceptance criteria

1. All four reports exist with at least the benches the spec calls out per sprint.
2. Each entry has p50/p95/p99 and a green/yellow/red status against its target.
3. `apps/bench/dashboard/__tests__/loader.test.ts` (created in W-1C-6) successfully loads all four files.

### Risks

- **R-1B-2.1** — Hardware drift between runs makes baselines unreliable. *Mitigation*: bake the hardware string into each entry; the dashboard's status calculation tolerates ±15% within the same hardware bucket per ADR-0014.

---

## W-1B-3 — Playwright + S09 D7 visual-diff suite

**Severity**: MEDIUM.
**Effort**: 3-4 person-days.
**Why**: 1B spec S09 D7 requires a visual-diff gate at < 5 px between PRYZM 1 and PRYZM 2 wall renders. The 30-case wall parity is kernel-side (descriptor-level); the 5 px gate is render-side (pixel-level). It cannot run without a browser; it cannot run reliably without Playwright. Today there is no `playwright.config*` anywhere in the repo and no `*.spec.ts` files outside vitest's reach.

### Files to add

- `playwright.config.ts` (repo root) — workspaces: `apps/editor`, headless reporter, screenshot on failure, mTLS-friendly (uses `$REPLIT_DEV_DOMAIN` not localhost).
- `tests/visual/wall.spec.ts` — drives the editor at `?pryzm2=1&fixture=<id>` for each of 30 wall fixtures, takes a 1024×768 screenshot, compares against `tests/visual/snapshots/wall/<id>.png`.
- `tests/visual/snapshots/wall/.gitkeep` — empty until first refresh run captures references.
- `apps/editor/src/dev/fixture-loader.ts` — query-string-driven fixture loader that reads from `tests/parity/wall/configs/<id>.json`, dispatches `wall.create` for each, recenters camera. Gated on `?pryzm2=1&fixture=<id>` and `import.meta.env.DEV` so it never ships to production.

### Files to modify

- `package.json` (root) — add `"test:visual": "playwright test"`, `"test:visual:refresh": "playwright test -u"`.
- `apps/editor/src/index.ts` — re-export the fixture-loader hook (dev-only, behind a `if (import.meta.env.DEV)` guard).
- `.gitignore` — add `playwright/.cache`, `tests/visual/__diff__/`.

### Test contract

```ts
// tests/visual/wall.spec.ts
import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';

const FIXTURES = readdirSync('tests/parity/wall/configs')
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

for (const id of FIXTURES) {
  test(`wall fixture ${id} renders within 5px of PRYZM 1`, async ({ page }) => {
    await page.goto(`/?pryzm2=1&fixture=${id}`);
    await page.waitForFunction(() => (window as any).__pryzm2DevHandle?.runtime !== undefined);
    await page.evaluate(() => (window as any).__pryzm2Render?.flush());

    const screenshot = await page.locator('canvas').screenshot({ animations: 'disabled' });
    expect(screenshot).toMatchSnapshot(`wall/${id}.png`, { maxDiffPixels: 25 }); // ~5px in a 1024×768 frame
  });
}
```

### Acceptance criteria

1. `playwright test` runs locally and in CI.
2. 30 wall fixtures each have a captured baseline PNG.
3. The `maxDiffPixels: 25` gate is honoured (≈ 5 px linear distance per spec).
4. CI fails the build if the diff exceeds the gate.
5. `tests/visual/__diff__/` is git-ignored.

### Risks

- **R-1B-3.1** — Anti-aliasing and sub-pixel rendering differences between Linux CI and developer macOS will drift baselines. *Mitigation*: fix Playwright to a single channel (`chromium-headless` only), force `--disable-gpu`, force `device-scale-factor: 1`, snapshot at fixed viewport, store baselines from CI not from dev. Document in `tests/visual/README.md`.
- **R-1B-3.2** — The `?pryzm2=1&fixture=<id>` loader is a dev-only surface but accidentally shipping it to prod would let users load arbitrary fixtures. *Mitigation*: gate on `import.meta.env.DEV` AND on a build-time `PLAYWRIGHT_FIXTURES_ENABLED=1` flag; CI verifies that the prod bundle does not contain the loader path.
- **R-1B-3.3** — The captured baseline depends on the `?pryzm2=1` editor wiring. Until W-1C-1 ships this is wall-only; the visual suite then naturally extends to all 12 families.

---

# §4 Sub-phase 1C — to 100 / 100

The deepest section. Nine units. The order printed below matches the DAG: independent work first, then `W-1C-1` as the central anchor, then the four units that depend on it.

## W-1C-2 — Migrate door / window / slab / grid / column / beam to disk-based parity

**Severity**: HIGH (re-graded from CRITICAL, see §0.2).
**Effort**: 5-6 person-days (fixture extraction + snapshot capture + driver rewrite × 6 families).
**Why**: today these six families parity-test inline with shape-digest assertions. The wall / ceiling / curtain-wall / stair / handrail families parity-test on disk with raw-float byte-equal assertions (the 1B spec format). The asymmetry means: (a) 6 families never produce the `tests/parity/<family>/configs/<id>.json` artefacts that the future PRYZM-1 cross-engine capture scripts (`scripts/capture-pryzm1-<family>-references.ts`) need to feed, and (b) the gate is silently weaker for 6 of 12 families.

This unit *uses the existing 66 inline fixtures verbatim* — no fixture authoring required, only mechanical migration. Each family already has the spec-budget fixture count.

### Pattern to clone

The `wall-snapshot.test.ts` pattern at `tests/parity/wall/wall-snapshot.test.ts` is the canonical disk-based driver. It:

1. Imports `FIXTURES` from `packages/geometry-kernel/__tests__/__configs__/<family>-index.ts`.
2. On every run, writes `configs/<id>.json` (idempotent, keeps disk in sync with TS catalog).
3. On every fixture, runs the producer and writes `snapshots/<id>.snap.json` if absent (or if `<FAMILY>_SNAPSHOT_REFRESH=1`).
4. Asserts byte-equality across `position`, `normal`, `uv`, `index.values`, `index.kind`, `bounds`, `groups`, `materialKeys`, `hash`.

### Per-family work

Repeat the following for each of door, window, slab, grid, column, beam:

| Family | Fixtures source today | Inline count | Spec budget | New disk dir |
|---|---|---|---|---|
| door | inline FIXTURES const in `tests/parity/door/door-snapshot.test.ts` | 16 | 15 | `tests/parity/door/{configs,snapshots}/` |
| window | inline FIXTURES in `tests/parity/window/window-snapshot.test.ts` | 12 | 12 | `tests/parity/window/{configs,snapshots}/` |
| slab | inline FIXTURES in `tests/parity/slab/slab-snapshot.test.ts` | 18 | 18 | `tests/parity/slab/{configs,snapshots}/` |
| grid | inline FIXTURES in `tests/parity/grid/grid-snapshot.test.ts` | 8 | 8 | `tests/parity/grid/{configs,snapshots}/` |
| column | inline FIXTURES in `tests/parity/column/column-snapshot.test.ts` | 6 | 6 | `tests/parity/column/{configs,snapshots}/` |
| beam | inline FIXTURES in `tests/parity/beam/beam-snapshot.test.ts` | 6 | 6 | `tests/parity/beam/{configs,snapshots}/` |

### Files to add (per family — example: door)

- `packages/geometry-kernel/__tests__/__configs__/door-index.ts` — exports `DOOR_FIXTURES` array; *moved out* of the test file so the disk-based driver and any future cross-engine capture script share one source of truth.
- `tests/parity/door/configs/F01-standard-interior.json` … `F16-flush-light-frame.json` (16 files, generated on first run).
- `tests/parity/door/snapshots/F01-standard-interior.snap.json` … `F16-flush-light-frame.snap.json` (16 files, generated on first run with `DOOR_SNAPSHOT_REFRESH=1`).

### Files to modify (per family)

- `tests/parity/door/door-snapshot.test.ts` — replace inline `FIXTURES` const with `import { DOOR_FIXTURES } from '../../../packages/geometry-kernel/__tests__/__configs__/door-index.js'`. Replace `digest()` shape-comparison with the `toSnapshot()` raw-buffer pattern from `wall-snapshot.test.ts`. Replace assertions with the byte-equal block.
- `apps/bench/src/benches/produce-door.bench.ts` — switch to importing `DOOR_FIXTURES` from the new shared location (de-dup).

### Code sketch — driver shape (door, identical for the other 5)

```ts
// tests/parity/door/door-snapshot.test.ts (after migration)
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceDoor } from '../../../packages/geometry-kernel/src/producers/door.js';
import { assertValidDescriptor } from '../../../packages/geometry-kernel/src/types/assertValidDescriptor.js';
import type { BufferGeometryDescriptor } from '../../../packages/geometry-kernel/src/types/BufferGeometryDescriptor.js';
import { DOOR_FIXTURES } from '../../../packages/geometry-kernel/__tests__/__configs__/door-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR   = resolve(__dirname, 'snapshots');
const CONFIG_DIR = resolve(__dirname, 'configs');
const REFRESH    = process.env.DOOR_SNAPSHOT_REFRESH === '1';

mkdirSync(SNAP_DIR,   { recursive: true });
mkdirSync(CONFIG_DIR, { recursive: true });

interface Snapshot {
  position: number[]; normal: number[]; uv: number[];
  index: { kind: 'u16' | 'u32'; values: number[] };
  bounds: BufferGeometryDescriptor['bounds'];
  groups: BufferGeometryDescriptor['groups'];
  materialKeys: readonly string[];
  hash: string;
}
function toSnapshot(d: BufferGeometryDescriptor): Snapshot { /* same as wall */ }

describe(`door snapshot parity (${DOOR_FIXTURES.length} fixtures)`, () => {
  for (const f of DOOR_FIXTURES) {
    writeFileSync(
      resolve(CONFIG_DIR, `${f.id}.json`),
      JSON.stringify({ id: f.id, description: f.description, door: f.door, placement: f.placement }, null, 2) + '\n',
    );
  }
  for (const f of DOOR_FIXTURES) {
    it(`${f.id} matches snapshot`, () => {
      const desc = produceDoor(f.door, f.placement);
      assertValidDescriptor(desc);
      const snap = toSnapshot(desc);
      const path = resolve(SNAP_DIR, `${f.id}.snap.json`);
      if (REFRESH || !existsSync(path)) { writeFileSync(path, JSON.stringify(snap, null, 2) + '\n'); return; }
      const expected = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
      expect(snap.hash).toBe(expected.hash);
      expect(snap.materialKeys).toEqual(expected.materialKeys);
      expect(snap.groups).toEqual(expected.groups);
      expect(snap.bounds).toEqual(expected.bounds);
      expect(snap.index.values).toEqual(expected.index.values);
      expect(snap.position).toEqual(expected.position);
      expect(snap.normal).toEqual(expected.normal);
      expect(snap.uv).toEqual(expected.uv);
    });
  }
});
```

### Capture runbook (per family)

1. Move the inline `FIXTURES` const into `packages/geometry-kernel/__tests__/__configs__/<family>-index.ts` and rename to `<FAMILY>_FIXTURES`. Add `id` field if missing (use `name` as id). Promote `id` and `description` to required.
2. Rewrite the driver to the snapshot above.
3. Run `<FAMILY>_SNAPSHOT_REFRESH=1 pnpm vitest tests/parity/<family>/` once. This populates `configs/` and `snapshots/`.
4. Commit. Subsequent runs without `_REFRESH=1` must pass.
5. Verify `apps/bench/src/benches/produce-<family>.bench.ts` still imports from the new shared location.

### Acceptance criteria

1. Six new directories of `configs/*.json` populated (16+12+18+8+6+6 = 66 files).
2. Six new directories of `snapshots/*.snap.json` populated (66 files).
3. Six driver test files now use the disk-based byte-equal pattern; the inline `FIXTURES` arrays are gone from the test files.
4. Six new fixture catalog files in `packages/geometry-kernel/__tests__/__configs__/<family>-index.ts`.
5. All 12 produce-* benches read from the same shared catalog files (single source of truth across tests + benches).
6. CI runs the disk-based parity suites for all 12 families; total fixture count ≥ 30+20+8+6+4+4 (existing) + 66 (new) = 138.

### Risks

- **R-1C-2.1** — Some inline fixtures may have minor numerical differences from a "true" disk snapshot due to fixture-ID/description-only changes between runs. *Mitigation*: the first refresh-run fixates the values; subsequent runs gate. Diff the fixture contents before/after migration to ensure no semantic change.
- **R-1C-2.2** — `produce-<family>.bench.ts` may have its own inline fixtures duplicating the inline test fixtures. *Mitigation*: as part of this unit, dedup all bench-vs-test fixture pairs onto the shared catalog; this is one of the spec's hidden invariants.
- **R-1C-2.3** — Schema migrations between now and 1D will need to migrate 138 disk snapshots. *Mitigation*: provide a `pnpm parity:refresh:all` script that sets every `_REFRESH=1` env var and re-runs. Document in `tests/parity/README.md`.

---

## W-1C-3 — Curtain-wall parity 8 → 25

**Severity**: HIGH.
**Effort**: 3-4 person-days (fixture authoring is real geometry work).
**Why**: curtain-wall is the second-most operator-dense plugin (13 handlers, panel grid, mullions, transoms, swap/rotate per panel). The 1B/1C spec budgets 25 parity cases for this family. Today there are 8. CW also has the largest cross-element coupling surface (it embeds in walls and slabs). Under-coverage here is the highest geometric regression risk going into 1D.

### Files to modify

- `packages/geometry-kernel/__tests__/__configs__/curtainwall-index.ts` — extend `CW_FIXTURES` from 8 entries to 25.

### Files to add (auto-generated on first refresh)

- `tests/parity/curtain-wall/configs/cw-09-…json` … `cw-25-…json` (17 new files).
- `tests/parity/curtain-wall/snapshots/cw-09-….snap.json` … `cw-25-….snap.json` (17 new files).

### Fixture coverage matrix (the 17 new cases — proposed)

| ID | Scenario | Stresses |
|---|---|---|
| cw-09-curved-baseline | 6 m radius arc baseline | curved producer path |
| cw-10-l-shape-corner | L-shape with mitred corner | corner mullion solving |
| cw-11-mullion-zero-thickness | mullion thickness 0 (degenerate) | guard rails |
| cw-12-panel-swap-mid | panel swap on mid bay | swap-handler descriptor stability |
| cw-13-panel-rotate-90 | rotate corner panel 90° | rotation in-plane |
| cw-14-panel-rotate-45 | rotate panel 45° | sub-cardinal rotation |
| cw-15-tall-slim-3x12 | 3-bay, 12-row | row stress |
| cw-16-mixed-glaze-spandrel | alternating panel types per row | material key dedup |
| cw-17-non-uniform-grid | 1.0 / 1.8 / 2.4 m bay widths | non-uniform grid |
| cw-18-non-uniform-rows | 1.2 / 1.5 / 0.9 m row heights | non-uniform rows |
| cw-19-no-transoms | only mullions, single row | transom-skip path |
| cw-20-no-mullions | only transoms, single column | mullion-skip path |
| cw-21-degenerate-empty | 0×0 grid, no panels | empty descriptor |
| cw-22-single-panel-only | 1×1 grid | minimum case |
| cw-23-large-load-100bays | 100 bays × 1 row | bench-shaped load |
| cw-24-elevated-baseY | worldY = 12.0 | level offset |
| cw-25-mixed-mullion-types | per-bay mullion type override | mullion type variance |

### Capture runbook

Same as W-1C-2 step 3 but for curtain-wall: `CURTAIN_WALL_SNAPSHOT_REFRESH=1 pnpm vitest tests/parity/curtain-wall/`. The driver already lives at `tests/parity/curtain-wall/cw-snapshot.test.ts` and is the canonical pattern — no driver change needed, only fixture authoring.

### Acceptance criteria

1. `CW_FIXTURES.length === 25`.
2. 25 configs + 25 snapshots on disk.
3. Each new fixture has a one-line description that matches the matrix above.
4. CI runs all 25 cases and passes.
5. `apps/bench/src/benches/produce-curtain-wall.bench.ts` reads `CW_FIXTURES` for its bench loop and reports p95 across all 25.

### Risks

- **R-1C-3.1** — Some matrix cases (cw-13 through cw-14, panel rotation) may exercise producer code paths that have never been gated. *Mitigation*: write the first new fixture, run it, fix any producer bugs that surface, then proceed; don't write all 17 at once and find 8 producer bugs.
- **R-1C-3.2** — `cw-23-large-load-100bays` will produce a snapshot file ≥ 1 MB. *Mitigation*: gate the load case behind `CW_HEAVY_FIXTURES=1`; default suite stays under 500 KB total. Add the gate to the driver.

---

## W-1C-4 — Stair / handrail / ceiling fixture top-up

**Severity**: MEDIUM.
**Effort**: 2-3 person-days.
**Why**: stair has 6 disk fixtures, handrail 4, ceiling 4. The 1C exit checklist asks for "all 12 families parity-tested green" — they pass today but at lower density than wall (30) / curtain-wall (25 after W-1C-3) / roof (20). The spec's "rule-of-thumb" budget per the producer's edge-case count: stair ≥ 10, handrail ≥ 6, ceiling ≥ 6.

### Files to modify

- `packages/geometry-kernel/__tests__/__configs__/stair-index.ts` — extend from 6 → 10 fixtures.
- `packages/geometry-kernel/__tests__/__configs__/handrail-index.ts` — extend from 4 → 6.
- `packages/geometry-kernel/__tests__/__configs__/ceiling-index.ts` — extend from 4 → 6.

### Files added on capture run

- 4 new stair configs + snapshots, 2 new handrail, 2 new ceiling = 8 + 8 = 16 disk artefacts.

### Proposed new fixtures

**Stair** (4 to add): `winder-quarter-turn`, `floating-stringer`, `tall-residential-2.7m-rise`, `degenerate-zero-treads` (validation gate).

**Handrail** (2 to add): `helical-spiral-1.5turns`, `square-l-shape-with-newel-posts`.

**Ceiling** (2 to add): `coffered-grid-3x3`, `acoustic-skylight-cutout` (this also tests the W-1C-5 skylight integration once that lands; until then it's a closed boundary).

### Capture runbook

Identical to W-1C-2 / W-1C-3, with env vars `STAIR_SNAPSHOT_REFRESH=1`, `HANDRAIL_SNAPSHOT_REFRESH=1`, `CEILING_SNAPSHOT_REFRESH=1`.

### Acceptance criteria

1. Stair: 10 configs + 10 snapshots.
2. Handrail: 6 configs + 6 snapshots.
3. Ceiling: 6 configs + 6 snapshots.
4. Total parity coverage across 12 families: 30+25+20+18+16+12+10+8+6+6+6+6 = **163 disk fixtures** (vs ~80 today).

### Risks

- **R-1C-4.1** — `degenerate-zero-treads` is a guard-rail fixture; it must throw, not produce. *Mitigation*: the driver has a `negative` flag option; document in stair-index.ts header that the driver expects throw on this fixture and add the matching `expect().toThrow()` branch.

---

## W-1C-5 — Roof handlers: AddSkylight, RemoveSkylight, JoinRoofs (+ schema extension)

**Severity**: HIGH.
**Effort**: 3-4 person-days.
**Why**: 1B/1C spec budgets 10 roof handlers; 8 ship today. The roof handler index file (`plugins/roof/src/handlers/index.ts`) explicitly admits the deferral: *"Skylight handlers are DEFERRED — `Roof` schema lacks the corresponding fields"*. So this work is **schema-first**, then handlers, then producer plumbing, then parity.

### Phase A — Schema extension

Files to modify:

- `packages/schemas/src/elements/Roof.ts` — add to the `Roof` Zod object:
  ```ts
  skylights: z.array(z.object({
    id: SkylightIdSchema,            // branded
    boundary: z.array(Vec2Schema).min(3),
    sillOffsetFromRoofTop: z.number().nonnegative().default(0),
    glazingMaterialId: z.string().optional(),
  })).default([]);
  joinedToRoofIds: z.array(RoofIdSchema).default([]);
  ```
- `packages/schemas/src/elements/index.ts` — re-export `SkylightId` brand.
- `packages/schemas/__tests__/Roof.test.ts` — round-trip case for a roof with 0, 1, 3 skylights and a joined-roof reference.

### Phase B — Producer extension

Files to modify:

- `packages/geometry-kernel/src/producers/roof.ts` — for each skylight in `roof.skylights`, subtract its boundary polygon from the roof top face via the existing CSG runner; emit a `glazing` material group keyed by `glazingMaterialId ?? 'glass.default'`.
- For `joinedToRoofIds` — when present, the producer **does not** consume them; the join is realised at the *handler* layer (which mutates two roofs' shapes). Producer remains pure.

### Phase C — Handlers

Files to add:

- `plugins/roof/src/handlers/AddSkylight.ts`
- `plugins/roof/src/handlers/RemoveSkylight.ts`
- `plugins/roof/src/handlers/JoinRoofs.ts`

Files to modify:

- `plugins/roof/src/handlers/index.ts` — extend `ROOF_HANDLER_TYPES` to include `roof.addSkylight`, `roof.removeSkylight`, `roof.joinRoofs`. Extend `buildRoofHandlerSet()` accordingly. Drop the "DEFERRED" comment.
- `plugins/roof/src/index.ts` — re-export the three new handler classes and payload types.
- `plugins/roof/src/errors.ts` — add `SkylightNotFoundError`, `SkylightOutOfBoundsError`, `RoofJoinIncompatibleError`.

### Code sketch — `AddSkylight`

```ts
import { produceCommand, type CommandHandler, type HandlerContext } from '@pryzm/command-bus';
import type { RoofData, RoofsState } from '../store.js';
import { SkylightOutOfBoundsError } from '../errors.js';

export interface AddSkylightPayload {
  readonly roofId: string;
  readonly skylightId?: string;            // optional caller-provided
  readonly boundary: ReadonlyArray<{ x: number; y: number }>;
  readonly sillOffsetFromRoofTop?: number;
  readonly glazingMaterialId?: string;
}

export class AddSkylightHandler implements CommandHandler<AddSkylightPayload> {
  static readonly type = 'roof.addSkylight' as const;
  readonly type = AddSkylightHandler.type;
  readonly affectedStores = ['roof'] as const;

  validate(payload: AddSkylightPayload) {
    if (payload.boundary.length < 3) return { ok: false, error: new SkylightOutOfBoundsError('boundary < 3 verts') };
    return { ok: true };
  }

  async handle(payload, ctx: HandlerContext<{ roof: RoofsState }>) {
    return produceCommand((draft) => {
      const roof = draft.roof.byId[payload.roofId];
      if (!roof) throw new SkylightOutOfBoundsError('roof not found');
      // Validate boundary lies within roof top face (point-in-polygon × 4)
      // Append skylight
      roof.skylights.push({
        id: payload.skylightId ?? createSkylightId(),
        boundary: [...payload.boundary],
        sillOffsetFromRoofTop: payload.sillOffsetFromRoofTop ?? 0,
        glazingMaterialId: payload.glazingMaterialId,
      });
    }, ctx);
  }
}
```

### Code sketch — `JoinRoofs`

`JoinRoofs` is the cross-roof shape-merge handler. Per ADR-0012, it registers a cross-element cascade rule that re-produces both roofs whenever either changes.

```ts
export class JoinRoofsHandler implements CommandHandler<JoinRoofsPayload> {
  static readonly type = 'roof.joinRoofs' as const;
  readonly affectedStores = ['roof'] as const;

  async handle(payload, ctx) {
    return produceCommand((draft) => {
      const a = draft.roof.byId[payload.roofA];
      const b = draft.roof.byId[payload.roofB];
      if (!a || !b) throw new RoofJoinIncompatibleError('one or both roofs missing');
      if (!a.joinedToRoofIds.includes(payload.roofB)) a.joinedToRoofIds.push(payload.roofB);
      if (!b.joinedToRoofIds.includes(payload.roofA)) b.joinedToRoofIds.push(payload.roofA);
      // The cascade rule (registered at plugin load) will re-run produceRoof
      // for both roofs in the next tick.
    }, ctx);
  }
}
```

### Files to add (cascade)

- `plugins/cross/src/roof-roof.ts` — registers a cascade rule on `roof.update` for any roof with a non-empty `joinedToRoofIds`.

### Phase D — Parity

Add 3 fixtures:

- `roof-21-skylight-single` (single rectangular skylight on hipped roof)
- `roof-22-skylight-multi-3` (three skylights, two adjacent)
- `roof-23-joined-pair-l` (two roofs joined into an L)

Update `packages/geometry-kernel/__tests__/__configs__/roof-index.ts` from 20 → 23.

### Acceptance criteria

1. `Roof` schema round-trips with skylights and joinedToRoofIds.
2. `produceRoof` emits skylight cuts and glazing material groups.
3. `buildRoofHandlerSet()` returns 11 handlers (was 8).
4. Three new parity fixtures pass.
5. `plugins/cross/__tests__/roof-roof.test.ts` proves that mutating roof A re-runs roof B's producer.
6. `apps/bench/src/benches/produce-roof.bench.ts` reads the extended `ROOF_FIXTURES`.

### Risks

- **R-1C-5.1** — Skylight subtraction via the CSG runner can produce tiny degenerate triangles when the skylight boundary nearly grazes the roof edge. *Mitigation*: snap the skylight boundary to the roof's edge tolerance (1 mm) before CSG; this is the same approach `produceWall` uses for openings.
- **R-1C-5.2** — `JoinRoofs` introduces an undirected coupling — care needed in the cascade graph to avoid an infinite loop (A triggers B which triggers A …). *Mitigation*: the existing `CascadeRunner` from 1B has a depth limit of 16 and a cycle-drop guard. The roof-roof rule must mark the cascade with a `kind: 'roof-join'` label so the runner can dedupe identical chains.
- **R-1C-5.3** — Existing 20 roof snapshots will not invalidate (skylights default to `[]`, joinedToRoofIds default to `[]`), but the schema migration must happen as a single commit so persistence files stay readable. *Mitigation*: add a Zod `.default([])` on both new fields.

---

## W-1C-1 — Editor wires all 12 plugins (`bootstrapWithEverything()`)

**Severity**: CRITICAL.
**Effort**: 4-5 person-days.
**Why**: this is the largest single gap in 1C. Today `apps/editor/src/bootstrap.data.ts` exports `bootstrapWithWalls()` and nothing else. The 11 non-wall plugins are reachable only by hand-importing them in tests. The 1C handoff checklist line "all 12 element families end-to-end" cannot be satisfied without this wiring.

This unit must produce: a plugin-registry pattern, a 12-plugin `bootstrapWithEverything()` data-half, a `bootstrapRenderWithEverything()` render-half, and a hello-12-elements demo proving the runtime carries one of each.

### §4-W1.1 Design — plugin descriptor

The wiring must be data-driven so adding a 13th plugin in 2A is one descriptor entry, not a code change in the editor.

**File to add**: `apps/editor/src/PluginRegistry.ts`.

```ts
// PluginRegistry — declarative description of one element-plugin.
// Each plugin in plugins/* exports a default PluginDescriptor (added
// in this unit). The editor's bootstrap iterates the registry rather
// than knowing each plugin by name.

export interface PluginDescriptor<S = unknown, C = unknown> {
  readonly name: string;                                   // 'wall' | 'door' | …
  readonly storeKey: string;                               // key into runtime.stores
  readonly buildStore: () => Store<S>;                     // factory
  readonly buildHandlerSet: (deps: PluginDeps) => readonly CommandHandler<unknown>[];
  /** Render-half — only invoked under bootstrapRenderWithEverything. */
  readonly buildCommitter?: (host: CommitterHost, pool: MaterialPool) => C;
  /** Optional auxiliary stores (e.g., wall systemTypeStore) — exposed
   *  on the runtime under their own key, NOT in `stores`. */
  readonly buildAuxiliary?: () => Record<string, unknown>;
}

export interface PluginDeps {
  readonly stores: Readonly<Record<string, Store<unknown>>>;
  readonly auxiliaries: Readonly<Record<string, unknown>>;
}

export const ALL_PLUGINS: readonly PluginDescriptor[] = [
  WALL_PLUGIN, DOOR_PLUGIN, WINDOW_PLUGIN, SLAB_PLUGIN, ROOF_PLUGIN,
  CURTAIN_WALL_PLUGIN, STAIR_PLUGIN, HANDRAIL_PLUGIN, CEILING_PLUGIN,
  COLUMN_PLUGIN, BEAM_PLUGIN, GRID_PLUGIN, VIEW_PLUGIN,
];
```

### §4-W1.2 Files to add (per plugin)

Each plugin gets a `descriptor.ts` that wraps its existing exports. The 13 descriptor files are mechanical:

- `plugins/wall/src/descriptor.ts`
- `plugins/door/src/descriptor.ts`
- `plugins/window/src/descriptor.ts`
- `plugins/slab/src/descriptor.ts`
- `plugins/roof/src/descriptor.ts`
- `plugins/curtain-wall/src/descriptor.ts`
- `plugins/stair/src/descriptor.ts`
- `plugins/handrail/src/descriptor.ts`
- `plugins/ceiling/src/descriptor.ts`
- `plugins/column/src/descriptor.ts`
- `plugins/beam/src/descriptor.ts`
- `plugins/grid/src/descriptor.ts`
- `plugins/view/src/descriptor.ts`

### §4-W1.3 Code sketch — `plugins/door/src/descriptor.ts`

```ts
import type { PluginDescriptor } from '@pryzm/editor/PluginRegistry';
import { DoorStore } from './store.js';
import { buildDoorHandlerSet } from './handlers/index.js';
import { DoorCommitter } from './committer/index.js';

export const DOOR_PLUGIN: PluginDescriptor = {
  name: 'door',
  storeKey: 'door',
  buildStore: () => new DoorStore() as unknown as Store<object>,
  buildHandlerSet: () => buildDoorHandlerSet(),
  buildCommitter: (_host, pool) => new DoorCommitter(pool),
};
```

For wall (which needs the `WallSystemTypeStore` auxiliary):

```ts
import type { PluginDescriptor } from '@pryzm/editor/PluginRegistry';
import { WallStore, WallSystemTypeStore } from './store.js';
import { buildWallHandlerSet } from './handlers/index.js';
import { WallCommitter, WallSelectionHighlightCommitter } from './committer/index.js';

export const WALL_PLUGIN: PluginDescriptor = {
  name: 'wall',
  storeKey: 'wall',
  buildStore: () => new WallStore() as unknown as Store<object>,
  buildAuxiliary: () => ({ wallSystemTypes: new WallSystemTypeStore() }),
  buildHandlerSet: ({ auxiliaries }) =>
    buildWallHandlerSet({ systemTypeStore: auxiliaries.wallSystemTypes as WallSystemTypeStore }),
  buildCommitter: (_host, pool) => new WallCommitter(pool),
  // Selection highlight is a second committer; descriptor extends
  // optional `extraCommitters: (host, pool, primary) => Committer[]`.
};
```

For view (which lives over `ViewRegistry` not a Store):

```ts
import { ViewRegistry } from '@pryzm/view-state';
import { ActiveViewStore } from '@pryzm/stores';
import { buildViewHandlerSet } from './handlers/index.js';

export const VIEW_PLUGIN: PluginDescriptor = {
  name: 'view',
  storeKey: 'view',
  buildStore: () => new ViewRegistry() as unknown as Store<object>,
  buildAuxiliary: () => ({ activeView: new ActiveViewStore() }),
  buildHandlerSet: () => buildViewHandlerSet(),
  // No committer — views are not rendered as elements.
};
```

### §4-W1.4 Files to add (editor)

- `apps/editor/src/PluginRegistry.ts` — definitions + `ALL_PLUGINS` registry.
- `apps/editor/src/bootstrap.everything.ts` — `bootstrapWithEverything()`.
- `apps/editor/src/bootstrap.render.everything.ts` — `bootstrapRenderWithEverything()`.
- `apps/editor/__tests__/bootstrap.everything.test.ts` — verifies all 13 plugins register, all 13 store keys present, total handler count matches sum of per-plugin sets.
- `apps/editor/__tests__/hello-12-elements.test.ts` — creates one of each element via the bus, asserts the host has 12 committers + each store has one entity.

### §4-W1.5 Code sketch — `bootstrap.everything.ts`

```ts
import { bootstrap } from './bootstrap.js';
import { ALL_PLUGINS } from './PluginRegistry.js';
import type { Store } from '@pryzm/stores';
import type { CommandHandler } from '@pryzm/command-bus';

export interface EverythingRuntime extends EditorRuntime {
  readonly auxiliaries: Readonly<Record<string, unknown>>;  // wall systemTypes, view activeView, etc.
  readonly registeredPlugins: readonly string[];
}

export function bootstrapWithEverything(opts: BootstrapOptions = {}): EverythingRuntime {
  // Phase 1: build all stores + auxiliaries (needed by handler sets).
  const stores: Record<string, Store<object>> = {};
  const auxiliaries: Record<string, unknown> = {};
  for (const p of ALL_PLUGINS) {
    stores[p.storeKey] = p.buildStore();
    if (p.buildAuxiliary) Object.assign(auxiliaries, p.buildAuxiliary());
  }

  // Phase 2: build handler sets with stores+aux deps available.
  const handlers: CommandHandler<unknown>[] = [];
  for (const p of ALL_PLUGINS) {
    handlers.push(...p.buildHandlerSet({ stores, auxiliaries }));
  }

  const inner = bootstrap({
    ...opts,
    stores: { ...stores, ...(opts.stores ?? {}) },
    handlers: [...handlers, ...(opts.handlers ?? [])],
  });

  return {
    ...inner,
    auxiliaries,
    registeredPlugins: ALL_PLUGINS.map((p) => p.name),
  } as EverythingRuntime;
}
```

### §4-W1.6 Code sketch — `bootstrap.render.everything.ts`

Mirror the chicken-and-egg dance from `bootstrap.render.data.ts` (which is well-commented):

```ts
import { bootstrapWithEverything } from './bootstrap.everything.js';
import { renderHalf } from './bootstrap.render.shared.js';     // factor render-half out of bootstrap.render.data.ts
import { ALL_PLUGINS } from './PluginRegistry.js';

export async function bootstrapRenderWithEverything(opts) {
  const data = bootstrapWithEverything(opts);
  const render = await renderHalf(opts, data.host);

  // Register one committer per plugin that defines one.
  const committers: Record<string, unknown> = {};
  const bindings: BindStoreHandle[] = [];
  for (const p of ALL_PLUGINS) {
    if (p.buildCommitter) {
      const c = p.buildCommitter(data.host, data.host.materialPool);
      committers[p.name] = c;
      data.host.register(c);
      const b = bindStore(data.stores[p.storeKey], p.storeKey, data.host);
      bindings.push(b);
    }
  }
  // Wall + selection highlight is a special case (two committers from one plugin).
  // Use an `extraCommitters` hook on the descriptor.

  return { ...render, data, bus: data.bus, committers, tearDown() { /* …same dance */ } };
}
```

### §4-W1.7 Files to modify

- `apps/editor/src/index.ts` — add `export { bootstrapWithEverything, bootstrapRenderWithEverything }`. Keep `bootstrapWithWalls` exported for backward compat (it remains the wall-only path used by S07–S09 tests).
- `apps/editor/src/bootstrap.render.data.ts` — refactor the render-half inner work into `apps/editor/src/bootstrap.render.shared.ts` so `bootstrapRenderWithEverything` can reuse it without copy-paste.
- `apps/editor/src/dev/fixture-loader.ts` (from W-1B-3) — extend to dispatch any-element fixtures, not just walls.
- `replit.md` — add a section "Plugin registry" pointing at `PluginRegistry.ts`.

### Acceptance criteria

1. `bootstrapWithEverything()` returns a runtime with **13 stores** registered (12 elements + view) and **all spec'd handler types** registered (sum across plugins ≈ 75 handler types).
2. `bootstrapRenderWithEverything()` runs in the browser and registers ≥ 12 committers on the host.
3. `apps/editor/__tests__/hello-12-elements.test.ts` creates one wall, one door, one window, one slab, one roof, one curtain-wall, one stair, one handrail, one ceiling, one column, one beam, one grid, one view, and asserts that each store reports `size === 1`.
4. `bootstrapWithWalls` still works unchanged (regression-tested by `bootstrap.data.test.ts` which exists).
5. Adding a 14th plugin (e.g., `room` in 2A) requires only: new descriptor file + add to `ALL_PLUGINS` array. No editor-bootstrap code change.

### Risks

- **R-1C-1.1** — The wall plugin currently builds *two* committers (`WallCommitter` + `WallSelectionHighlightCommitter`). The descriptor pattern needs an `extraCommitters` hook. *Mitigation*: include an optional `buildExtraCommitters(host, pool, primary)` field on `PluginDescriptor`; only wall uses it.
- **R-1C-1.2** — Cross-element cascade rules (`plugins/cross/src/{slab-wall,stair-handrail,roof-roof}.ts`) need to be registered against the `CascadeRunner` once, not per-plugin. *Mitigation*: the `bootstrapWithEverything` body has a Phase 3 that registers all cascade rules from `@pryzm/cross` after handler registration.
- **R-1C-1.3** — Memory budget: 12 plugins each with a Store + a Committer + bindings. *Mitigation*: profile via `apps/bench/src/benches/idle-cpu.bench.ts` after wiring; the spec gate is "idle CPU < 2.5%". If breached, enable the lazy-committer pattern from ADR-0014 (only attach committer when first entity of that type is created).
- **R-1C-1.4** — The `?pryzm2=1` URL path currently calls `bootstrapRenderWithWalls`. After this unit, the editor's main entry must call `bootstrapRenderWithEverything()` instead. *Mitigation*: keep `bootstrapRenderWithWalls` exported for the dual-mode parity test; switch `apps/editor/src/main.ts` (or whatever the URL-routed entry is) to `bootstrapRenderWithEverything`. Add an explicit assertion in the test that the wall-only path is *not* used by main.

---

## W-1C-6 — Bench dashboard build-out + `M9-1C-baseline.md`

**Severity**: MEDIUM.
**Effort**: 4-5 person-days.
**Why**: today `apps/bench/dashboard/` has only `types.ts`. The 1C exit checklist asks for a live dashboard with one entry per element family + post-FX + picking + view + idle + orbit (≥ 18 entries) and a published `M9-1C-baseline.md`. Without this, regression detection rolling into 1D has no anchor and no UI.

### Files to add

- `apps/bench/dashboard/loader.ts` — reads `apps/bench/reports/*.md`, parses each entry into a `BenchReport`, returns aggregated `BenchEntry[]`.
- `apps/bench/dashboard/render.ts` — converts `BenchEntry[]` to static HTML (table, color-coded by status); writes to `docs/bench/dashboard.html`.
- `apps/bench/dashboard/coverage.ts` — asserts that every bench id in `apps/bench/src/benches/*.bench.ts` appears in at least one report. Used to fail CI when a bench has been added but never run.
- `apps/bench/dashboard/index.ts` — barrel.
- `apps/bench/dashboard/__tests__/loader.test.ts` — round-trip a synthetic markdown file → BenchReport.
- `apps/bench/dashboard/__tests__/render.test.ts` — snapshot HTML structure (DOM shape only, not styling).
- `apps/bench/dashboard/__tests__/coverage-audit.test.ts` — runs `coverage.ts` against the live report set; fails if any bench is missing.
- `apps/bench/dashboard/build.ts` — CLI entry: `npm run bench:dashboard` → `docs/bench/dashboard.html`.
- `apps/bench/reports/M9-1C-baseline.md` — consolidated report at the 1C exit gate (≥ 18 entries).
- `docs/bench/dashboard.html` — published static page.

### Files to modify

- `apps/bench/package.json` — add scripts `bench:dashboard:build`, `bench:dashboard:test`.
- `apps/bench/dashboard/types.ts` — keep as-is (already correct).
- `package.json` (root) — add `"docs:bench": "pnpm --filter @pryzm/bench bench:dashboard:build"` for one-shot publishing.

### Dashboard data flow

```text
apps/bench/reports/*.md  ──→  loader.parseFile(path)  ──→ BenchReport
                                                           │
                                                           ▼
                          aggregateAcrossSprints   ──→  BenchEntry[]
                                                           │
                                                           ▼
                                              render.ts  ──→  dashboard.html
                                                           │
                                                           └──→ also drives
                                                                M9-1C-baseline.md
                                                                via the same
                                                                aggregator
```

### Code sketch — `loader.ts`

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BenchReport } from './types.js';

const REPORT_LINE_RE = /^- \*\*(\w+)\*\*:\s*(.+)$/;

export function parseReport(path: string): BenchReport[] {
  const text = readFileSync(path, 'utf8');
  const reports: BenchReport[] = [];
  let current: Partial<BenchReport> | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## bench: ')) {
      if (current?.bench) reports.push(current as BenchReport);
      current = { bench: line.slice('## bench: '.length).trim() };
    } else {
      const m = line.match(REPORT_LINE_RE);
      if (m && current) current[m[1] as keyof BenchReport] = parseValue(m[1], m[2]) as never;
    }
  }
  if (current?.bench) reports.push(current as BenchReport);
  return reports;
}

export function loadAllReports(reportsDir: string): BenchReport[] {
  return readdirSync(reportsDir)
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) => parseReport(resolve(reportsDir, f)));
}
```

### M9-1C-baseline.md required entries (≥ 18)

| # | Bench id | Target | Direction | Sprint reference |
|---|---|---|---|---|
| 1 | `produce-wall` p95 | ≤ 2.0 ms | lower-better | S08 |
| 2 | `produce-slab` p95 | ≤ 2.5 ms | lower-better | S12 |
| 3 | `produce-door` p95 | ≤ 1.0 ms | lower-better | S11 |
| 4 | `produce-window` p95 | ≤ 1.0 ms | lower-better | S11 |
| 5 | `produce-roof` p95 | ≤ 5.0 ms | lower-better | S11 |
| 6 | `produce-curtain-wall` p95 | ≤ 8.0 ms | lower-better | S13 |
| 7 | `produce-stair` p95 | ≤ 4.0 ms | lower-better | S14 |
| 8 | `produce-handrail` p95 | ≤ 3.0 ms | lower-better | S14 |
| 9 | `produce-ceiling` p95 | ≤ 1.5 ms | lower-better | S14 |
| 10 | `produce-column` p95 | ≤ 0.5 ms | lower-better | S12 |
| 11 | `produce-beam` p95 | ≤ 0.5 ms | lower-better | S12 |
| 12 | `produce-grid` p95 | ≤ 0.5 ms | lower-better | S12 |
| 13 | `cmd-execute-latency` p95 | ≤ 1.0 ms | lower-better | S08 |
| 14 | `picking-latency` p95 (1000 elems) | ≤ 12 ms | lower-better | S15 |
| 15 | `view-switch` p95 | ≤ 250 ms | lower-better | S17 |
| 16 | `orbit-fps-walls` p5 | ≥ 50 fps | higher-better | S09 / S16 |
| 17 | `orbit-fps-cw` p5 | ≥ 50 fps | higher-better | S16 |
| 18 | `idle-cpu` mean | ≤ 2.5 % | lower-better | S16 |
| 19 | `render-pass-cost` p95 | ≤ 8 ms | lower-better | S16 |
| 20 | `load-medium` cold | ≤ 1500 ms | lower-better | S18 |

### Acceptance criteria

1. `apps/bench/dashboard/{loader,render,coverage,index}.ts` exist with their tests.
2. `pnpm --filter @pryzm/bench bench:dashboard:build` produces `docs/bench/dashboard.html` with all entries from `apps/bench/reports/*.md`.
3. `apps/bench/reports/M9-1C-baseline.md` has ≥ 18 entries against the table above; each has p50/p95/p99, target, status, and hardware string.
4. `coverage-audit.test.ts` passes — every bench in `apps/bench/src/benches/` is represented in the latest report.
5. CI publishes `docs/bench/dashboard.html` as a build artefact.

### Risks

- **R-1C-6.1** — Hardware drift between local dev and CI will produce different absolute numbers. *Mitigation*: dashboard groups entries by hardware string; targets are evaluated within hardware bucket only.
- **R-1C-6.2** — The dashboard is a static HTML page, not a SPA. *Mitigation*: deliberate — keeps the surface auditable, no JS dependencies for readers, no risk of XSS from bench output.

---

## W-1C-7 — `tests/integration/headless-vs-browser-parity.spec.ts`

**Severity**: MEDIUM.
**Effort**: 2-3 person-days.
**Depends on**: W-1B-3 (Playwright config), W-1C-1 (editor wires all plugins).
**Why**: 1C K1-B *kernel-purity* test (`apps/headless/__tests__/headless-node.test.ts`) proves the kernel runs in Node without DOM/THREE in `require.cache`. That's a static guard. The dynamic guard the spec asks for is **byte-equal output across the two paths**: feed the same fixture through `apps/headless` and through `apps/editor` and prove the resulting `BufferGeometryDescriptor` is identical (same hash, same vertex layout, same material keys).

### Files to add

- `tests/integration/headless-vs-browser-parity.spec.ts` — Playwright spec that:
  1. For each fixture in `tests/parity/<family>/configs/*.json` (across all 12 families):
     - Run `apps/headless` with the fixture → capture descriptor JSON to `__tmp__/<id>.headless.json`.
     - Drive `apps/editor` at `?pryzm2=1&fixture=<id>` → capture `runtime.host.descriptorOf(<id>).toJSON()` via a dev hook → write to `__tmp__/<id>.browser.json`.
     - `expect(headless).toEqual(browser)`.

- `apps/editor/src/dev/descriptor-export.ts` — dev-only `window.__pryzm2DescriptorExport(id) → BufferGeometryDescriptor` hook (gated on `import.meta.env.DEV`).

- `apps/headless/src/commands/capture-descriptor.ts` — `--fixture <path> --out <path>` command that loads a fixture JSON, runs the producer, writes the descriptor JSON to disk.

### Files to modify

- `apps/headless/src/cli.ts` — add `capture-descriptor` subcommand.
- `apps/editor/src/dev/fixture-loader.ts` — already created in W-1B-3, extend to expose `__pryzm2DescriptorExport`.

### Code sketch

```ts
// tests/integration/headless-vs-browser-parity.spec.ts
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const FAMILIES = ['wall','door','window','slab','roof','curtain-wall','stair','handrail','ceiling','column','beam','grid'] as const;

for (const family of FAMILIES) {
  const cfgDir = resolve('tests/parity', family, 'configs');
  if (!readdirSync(cfgDir).some(f => f.endsWith('.json'))) continue;
  for (const cfg of readdirSync(cfgDir).filter(f => f.endsWith('.json')).slice(0, 3)) {  // first 3 per family — full set in nightly
    const id = cfg.replace(/\.json$/, '');
    test(`${family}/${id} headless == browser`, async ({ page }) => {
      // Headless path
      const headlessOut = `__tmp__/${family}-${id}.headless.json`;
      execFileSync('node', ['apps/headless/dist/cli.js', 'capture-descriptor', '--fixture', resolve(cfgDir, cfg), '--out', headlessOut]);
      const headless = JSON.parse(readFileSync(headlessOut, 'utf8'));

      // Browser path
      await page.goto(`/?pryzm2=1&fixture=${family}/${id}`);
      await page.waitForFunction(() => (window as any).__pryzm2DescriptorExport !== undefined);
      const browser = await page.evaluate((primaryId) => (window as any).__pryzm2DescriptorExport(primaryId), id);

      expect(browser.hash).toBe(headless.hash);
      expect(browser.materialKeys).toEqual(headless.materialKeys);
      expect(browser.position).toEqual(headless.position);
      expect(browser.normal).toEqual(headless.normal);
      expect(browser.uv).toEqual(headless.uv);
      expect(browser.index.values).toEqual(headless.index.values);
      expect(browser.bounds).toEqual(headless.bounds);
    });
  }
});
```

### Acceptance criteria

1. The spec runs against ≥ 3 fixtures per family in CI (≥ 36 cases), full ≥ 138 cases in nightly.
2. Each case asserts byte-equal hash + material keys + buffers + bounds.
3. Failures persist `__tmp__/<family>-<id>.{headless,browser}.json` for diffing.
4. The K1-B kernel-purity test stays green (this unit must not introduce DOM/THREE into `apps/headless`).

### Risks

- **R-1C-7.1** — The headless and browser paths use different code paths to invoke producers (CLI command vs editor handler). They must converge on the *same* producer call; if they don't, the spec is reporting equivalence of similar-but-different code. *Mitigation*: the `capture-descriptor` subcommand reads the fixture JSON and calls `produce<Family>(...)` directly — the same function the editor's handler/committer pipeline ultimately calls. Document this in the spec header.
- **R-1C-7.2** — Float64 / Float32 precision drift between Node and Chromium V8. *Mitigation*: the producer types are explicit `Float32Array` / `Uint16Array` — V8 honours IEEE-754; if a drift surfaces, it is a producer non-determinism bug worth catching. No mitigation; surface and fix.

---

## W-1C-8 — `tests/integration/view-state-2a-readiness.test.ts`

**Severity**: LOW.
**Effort**: 1-2 person-days.
**Depends on**: W-1C-1.
**Why**: 1C exit checklist asks for a forward-looking integration test asserting that the view-state surface is shaped to receive 2A's collaborative-cursor and shared-camera features without rework. This is a contract-level test, not a runtime-level test.

### Files to add

- `tests/integration/view-state-2a-readiness.test.ts`

### Test contract

The test asserts seven things that 2A will rely on:

1. `ViewDefinition` is JSON-serialisable (round-trips via `JSON.stringify`/`parse`).
2. `ViewRegistry.get(id)` is O(1) (smoke: 10 000 views, lookup median < 0.05 ms).
3. `ActiveViewStore` emits a patch when the active view changes — the patch shape is `{ kind: 'replace', path: [], value: <id> }`.
4. `view.switchView` undo restores the previous active view (the stack handles it without a custom undo body).
5. `ViewController.beginMotion()` / `endMotion()` are idempotent (calling beginMotion twice does not double-suppress).
6. `ViewDefinition.cameraState` exposes position + target + up + fov + near + far — the seven fields 2A's shared-camera diff will touch.
7. `ViewRegistry.list()` returns views in insertion order (2A's "view list" UI relies on stable ordering).

### Code sketch

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapWithEverything } from '@pryzm/editor';

describe('2A readiness — view-state surface contract', () => {
  it('ViewDefinition is JSON-serialisable', () => {
    const v = { id: 'view:1', name: 'A', cameraState: { position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fov: 50, near: 0.1, far: 1000 } };
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('ViewRegistry lookup is O(1) over 10000 entries', async () => {
    const rt = bootstrapWithEverything();
    for (let i = 0; i < 10_000; i++) rt.bus.executeCommand('view.create', { id: `view:${i}`, name: `V${i}` });
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) rt.stores.view.get(`view:${(i * 97) % 10_000}`);
    const dt = (performance.now() - t0) / 100;
    expect(dt).toBeLessThan(0.05);
  });

  it('switchView undo restores previous active view', async () => {
    const rt = bootstrapWithEverything();
    await rt.bus.executeCommand('view.create', { id: 'view:a', name: 'A' });
    await rt.bus.executeCommand('view.create', { id: 'view:b', name: 'B' });
    await rt.bus.executeCommand('view.switchView', { id: 'view:a' });
    await rt.bus.executeCommand('view.switchView', { id: 'view:b' });
    expect(rt.auxiliaries.activeView.get()).toBe('view:b');
    rt.undoStack.undo();
    expect(rt.auxiliaries.activeView.get()).toBe('view:a');
  });

  // …4 more contract tests
});
```

### Acceptance criteria

1. All seven contract assertions pass.
2. Failures surface as `2A readiness regression: <field>` to make blame obvious in 2A planning.
3. No production code changes.

### Risks

- **R-1C-8.1** — `ViewRegistry.list()` ordering is currently insertion order *by virtue of* JS Map semantics — not by explicit ordering field. If a future implementation switches to an `id`-keyed object, ordering breaks silently. *Mitigation*: this test pins the contract; failure here means the registry implementation must keep ordering or expose an explicit `orderedIds` accessor.

---

## W-1C-9 — Handover docs + S18 retro + demo

**Severity**: LOW.
**Effort**: 2 person-days.
**Why**: 1C spec's deliverable list includes documentation under `docs/architecture/` and an `S18-retro.md`. Today these are not located in the tree.

### Files to add

- `docs/architecture/picking.md` — covers `gpu-pick` vs `bvh-pick`, the boot-time resolver, ADR-0015 cross-reference, latency budget.
- `docs/architecture/selection.md` — `SelectionStore`, the selection-highlight committer, multi-select semantics, hit testing.
- `docs/architecture/view-state.md` — `ViewRegistry`, `ActiveViewStore`, `ViewController`, motion suppression.
- `docs/architecture/camera.md` — `CameraController` orbit/pan/zoom, motion vs idle, ADR-0014 budget.
- `docs/architecture/headless.md` — `apps/headless` package surface, dependency-cruiser config, K1-B test, ADR-0017.
- `docs/architecture/element-coupling.md` — the cross-element cascade rules: slab→walls, stair→handrail, roof↔roof (after W-1C-5), ADR-0012.
- `docs/sprints/S18-retro.md` — what worked, what slipped, decisions deferred to 1D, links to ADRs and gap-closure work units (this plan).
- `docs/demos/M9-1C-headless.mp4` — a 60-90s screen recording showing `apps/headless new-project → add-wall → export-pryzm` and then loading the export in `apps/editor` under `?pryzm2=1`.

### Files to modify

- `replit.md` — add section "Handover docs" pointing at the new architecture files.
- `docs/00_NEW_ARCHITECTURE/README.md` (if exists; otherwise create) — index the architecture docs.

### Each architecture doc should contain

- 1-paragraph "What this is" intro.
- "Public surface" — exact exports and types.
- "Invariants" — what callers can rely on.
- "Internal structure" — files in the package, layering.
- "Performance contract" — bench id + target.
- "ADR references" — all relevant ADRs, both code-level and strategic.
- "Open questions" — anything deferred to 2A.

### Acceptance criteria

1. All six architecture docs exist and conform to the section list.
2. `S18-retro.md` exists and references at least: ADRs 0014–0017, the work units in this plan, the four 1C "definitely deferred to 1D/2A" decisions.
3. The 90s demo recording exists and plays end-to-end.
4. `replit.md` indexes the new docs.

### Risks

- **R-1C-9.1** — Recording artefacts (mp4 in git) is bad practice. *Mitigation*: store the mp4 in an external asset bucket and embed the link in `docs/demos/README.md`; commit only the link, not the binary.

---

# §5 Cross-cutting concerns

## §5.1 Process gate to prevent the recurring failure mode

The audit identified a pattern: scaffolding lands but its data does not. To prevent recurrence in 1D / 2A, two CI checks should land alongside this plan (ideally in W-1C-6's coverage-audit testing footprint):

1. **`tests/parity/<family>/<family>-snapshot.test.ts` requires `configs/` and `snapshots/` to be non-empty.** A vacuous-pass test (zero fixtures) becomes a CI failure.
2. **Bench dashboard's `coverage-audit.test.ts` requires every `*.bench.ts` to appear in the latest baseline report.** Adding a bench file but never running it becomes a CI failure.

Add both as part of W-1C-6's deliverable surface.

## §5.2 ADR backfill

Two existing ADRs need light updates:

- **ADR-0008 (wall handler triage)** — add an "Errata" section noting the `MoveWall` façade decision (W-1B-1).
- **ADR-0010 (slab handler triage)** — add note that the disk-based parity pattern is the canonical pattern across all families (W-1C-2).

One new code-level ADR is worth writing as part of W-1C-1:

- **ADR-0018 (plugin descriptor + bootstrapWithEverything)** — record the registry pattern, the descriptor contract, and why `view` is special-cased (no committer). This is the architectural artefact 1D needs to extend.

## §5.3 Handler-set dependency injection consistency

Today plugins inconsistently accept dependencies in their `buildXHandlerSet()`:

- **wall**: `buildWallHandlerSet({ systemTypeStore })` — dependency injection.
- **slab, door, window, roof, curtain-wall, stair, handrail, ceiling, column, beam, grid, view**: zero-arg.

In the descriptor pattern (W-1C-1), every plugin receives `(deps: PluginDeps)`. Plugins that don't need deps should ignore the parameter. This unifies the contract and makes the registry-iteration loop simple. Document this in ADR-0018.

## §5.4 Effort accounting summary

| Bucket | Days |
|---|---|
| 1A completion (W-1A-1) | 1 |
| 1B completion (W-1B-1, 2, 3) | 4.5 |
| 1C completion — independent track (W-1C-2, 3, 4, 5) | 13–17 |
| 1C completion — anchor (W-1C-1) | 4–5 |
| 1C completion — anchor-dependent (W-1C-6, 7, 8, 9) | 9–12 |
| **Total** | **31.5–39.5 person-days** |

With three contributors splitting along plugin / parity / dashboard tracks, the wall-clock collapses to **12–16 days**.

---

# §6 Consolidated risk register

Top risks across the plan, sorted by impact × likelihood:

| ID | Risk | Likelihood | Impact | Mitigation owner |
|---|---|---|---|---|
| R-1C-1.1 | Wall-plugin's two-committer pattern doesn't fit the descriptor | medium | high | W-1C-1 (extraCommitters hook) |
| R-1C-2.1 | Migrating inline → disk fixtures surfaces real producer bugs in the 6 families | medium | medium | W-1C-2 (refresh-once strategy, fix as encountered) |
| R-1C-3.1 | New CW fixtures expose untested producer paths | high | medium | W-1C-3 (one-fixture-at-a-time) |
| R-1C-5.1 | Skylight CSG produces degenerate triangles | medium | high | W-1C-5 (1mm boundary snap) |
| R-1C-5.2 | `JoinRoofs` cascade infinite loop | low | high | W-1C-5 (cascade depth limit + cycle drop already shipped in 1B) |
| R-1B-3.1 | Playwright AA / sub-pixel drift between dev and CI | high | medium | W-1B-3 (CI-only baselines, fixed device scale, deterministic Chromium) |
| R-1C-7.2 | Float drift between Node and Chromium | low | high | W-1C-7 (surface and fix; producers are explicit-typed-array) |
| R-1C-1.4 | Editor entry forgets to switch to `bootstrapRenderWithEverything()` | medium | critical | W-1C-1 (regression test asserts main entry uses the everything path) |

---

# §7 Acceptance gate for "100 / 100"

A signed-off Phase 1 means **all** of the following are true on `main`:

**1A**
- [ ] `tools/eslint-plugin-pryzm` exposes 5 rules; rule `pryzm-store-single-channel` is wired at `error` for `plugins/**/handlers/**/*.ts`.
- [ ] All 17 plugins lint clean.

**1B**
- [ ] `MoveWall.ts` is either deleted or a documented façade; the choice is recorded in ADR-0008 errata.
- [ ] `apps/bench/reports/{S08,S09,S10,M6-1B}-baseline.md` exist and meet the entry-content requirements.
- [ ] `playwright.config.ts` exists; `tests/visual/wall.spec.ts` runs in CI and gates the 5px diff for 30 wall fixtures.

**1C**
- [ ] `apps/editor/src/PluginRegistry.ts` exists; `bootstrapWithEverything()` registers all 13 plugins; `apps/editor/__tests__/hello-12-elements.test.ts` passes.
- [ ] All 12 element families parity-test on the disk-based byte-equal pattern; total parity fixtures ≥ 163 across 12 families.
- [ ] Curtain-wall has 25 disk fixtures.
- [ ] Stair / handrail / ceiling have ≥ 10 / 6 / 6 disk fixtures.
- [ ] `Roof` schema carries `skylights` and `joinedToRoofIds`; producer honours both; 11 roof handlers ship; 23 roof parity fixtures pass.
- [ ] `apps/bench/dashboard/{loader,render,coverage,build,index}.ts` exist with their tests; `docs/bench/dashboard.html` is built and committed.
- [ ] `apps/bench/reports/M9-1C-baseline.md` has ≥ 18 entries against the table in W-1C-6.
- [ ] `tests/integration/headless-vs-browser-parity.spec.ts` runs in CI against ≥ 3 fixtures per family.
- [ ] `tests/integration/view-state-2a-readiness.test.ts` passes its 7 contract assertions.
- [ ] `docs/architecture/{picking,selection,view-state,camera,headless,element-coupling}.md` exist.
- [ ] `docs/sprints/S18-retro.md` exists.
- [ ] `docs/demos/M9-1C-headless.mp4` (or external link in `docs/demos/README.md`) exists.

**Cross-cutting**
- [ ] CI fails when a parity directory is empty.
- [ ] CI fails when a bench file is added but no report references it.
- [ ] ADR-0018 (plugin descriptor) is committed.
- [ ] `replit.md` indexes the new architecture docs.

When every box above is ticked, Phase 1 has truthfully exited and 1D / 2A planning can proceed against a real foundation.

---

*End of plan.*
