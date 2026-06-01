# Parallel-safe worklist — zero-risk while S21–S24 are in flight

> **Purpose**: a strict whitelist of work units that an agent can execute
> simultaneously with the S21-S24 (PHASE-1D) agent **with zero file
> collisions**.
>
> **Companion to**: `PHASE-1-COMPLETION-PLAN.md` — the full plan has the
> code sketches and acceptance gates. This file is the *contract* for
> safe parallelism.
>
> **Date**: 2026-04-27.
>
> **Hard rule**: an agent working from this file **must not touch any
> path that is not in the whitelist below**. If a unit's natural scope
> drifts into a forbidden path, the agent halts and surfaces the drift.

---

## §0 The seven units in scope

Only these seven. Nothing else from the completion plan is in scope here.

| # | Unit | Severity | Effort |
|---|---|---|---|
| 1 | W-1A-1 — `pryzm-store-single-channel` ESLint rule | LOW | 1 d |
| 2 | W-1B-1 — `MoveWall` → `TransformWall` façade | LOW | 0.5 d |
| 3 | W-1C-2 — Migrate door / window / slab / grid / column / beam to disk-based parity | HIGH | 5–6 d |
| 4 | W-1C-3 — Curtain-wall parity 8 → 25 fixtures | HIGH | 3–4 d |
| 5 | W-1C-4 — Stair / handrail / ceiling parity top-up | MEDIUM | 2–3 d |
| 6 | W-1C-5 — Roof skylights + JoinRoofs + schema extension | HIGH | 3–4 d |
| 7 | W-1C-8 — `view-state-2a-readiness` integration test | LOW | 1–2 d |

**Total**: ~16–22 person-days. ~70 % of the 1C parity-and-fixture mass.

---

## §1 Whitelist — paths the parallel agent MAY create or modify

Every path below is verified absent from the S21-S24 footprints in
`phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`.

### §1.1 Tooling (W-1A-1)

```
tools/eslint-plugin-pryzm/src/rules/pryzm-store-single-channel.js
tools/eslint-plugin-pryzm/src/rules/__tests__/pryzm-store-single-channel.test.js
tools/eslint-plugin-pryzm/src/index.js
eslint.config.js                                ← root
packages/legacy-shim/src/two-stores.bad.ts
```

### §1.2 Wall plugin façade (W-1B-1)

```
plugins/wall/src/handlers/MoveWall.ts
plugins/wall/src/handlers/index.ts
plugins/wall/src/index.ts
docs/00_NEW_ARCHITECTURE/code-level-adrs/0008-wall-handler-triage.md
```

### §1.3 Six-family parity migration (W-1C-2)

For each family in `{door, window, slab, grid, column, beam}`:

```
tests/parity/<family>/<family>-snapshot.test.ts
tests/parity/<family>/configs/                  ← directory; files generated on first refresh
tests/parity/<family>/snapshots/                ← directory; files generated on first refresh
packages/geometry-kernel/__tests__/__configs__/<family>-index.ts
apps/bench/src/benches/produce-<family>.bench.ts
```

### §1.4 Curtain-wall parity expansion (W-1C-3)

```
packages/geometry-kernel/__tests__/__configs__/curtainwall-index.ts
tests/parity/curtain-wall/configs/cw-09-…json   … cw-25-…json   (17 new)
tests/parity/curtain-wall/snapshots/cw-09-….snap.json … cw-25-….snap.json (17 new)
```

The curtain-wall driver `tests/parity/curtain-wall/cw-snapshot.test.ts`
**stays unchanged** — it already iterates `CW_FIXTURES.length`.

### §1.5 Stair / handrail / ceiling top-up (W-1C-4)

```
packages/geometry-kernel/__tests__/__configs__/stair-index.ts
packages/geometry-kernel/__tests__/__configs__/handrail-index.ts
packages/geometry-kernel/__tests__/__configs__/ceiling-index.ts
tests/parity/stair/configs/        + snapshots/   (4 new each)
tests/parity/handrail/configs/     + snapshots/   (2 new each)
tests/parity/ceiling/configs/      + snapshots/   (2 new each)
```

### §1.6 Roof skylights + JoinRoofs (W-1C-5)

```
packages/schemas/src/elements/Roof.ts
packages/schemas/src/elements/index.ts
packages/schemas/__tests__/Roof.test.ts
packages/geometry-kernel/src/producers/roof.ts
packages/geometry-kernel/__tests__/__configs__/roof-index.ts
plugins/roof/src/handlers/AddSkylight.ts          ← new
plugins/roof/src/handlers/RemoveSkylight.ts       ← new
plugins/roof/src/handlers/JoinRoofs.ts            ← new
plugins/roof/src/handlers/index.ts
plugins/roof/src/index.ts
plugins/roof/src/errors.ts
plugins/cross/src/roof-roof.ts                    ← new
plugins/cross/__tests__/roof-roof.test.ts         ← new
tests/parity/roof/configs/roof-21-….json … roof-23-….json     (3 new)
tests/parity/roof/snapshots/roof-21-….snap.json … roof-23-….snap.json (3 new)
apps/bench/src/benches/produce-roof.bench.ts      ← only if this file already exists
```

### §1.7 View-state 2A readiness test (W-1C-8)

```
tests/integration/view-state-2a-readiness.test.ts   ← single new file
```

---

## §2 Forbidden paths — the parallel agent MUST NOT touch

These are reserved for the S21–S24 agent or for the W-1C-1 anchor unit
that has not yet been sequenced. Any edit here breaks the parallel-safe
contract.

### §2.1 Editor composition root (reserved for S22 / S24 / W-1C-1)

```
apps/editor/src/bootstrap.ts                     ← S22 + S24 finalise this
apps/editor/src/bootstrap.data.ts                ← W-1C-1 will refactor
apps/editor/src/bootstrap.render.data.ts         ← W-1C-1 will refactor
apps/editor/src/bootstrap.render.shared.ts       ← W-1C-1 will create
apps/editor/src/bootstrap.everything.ts          ← W-1C-1 will create
apps/editor/src/bootstrap.render.everything.ts   ← W-1C-1 will create
apps/editor/src/PluginRegistry.ts                ← W-1C-1 will create
apps/editor/src/index.ts
apps/editor/src/main.ts
apps/editor/src/dev/                             ← W-1B-3 (Playwright) will populate
```

### §2.2 Bake worker / sync server / loader (reserved for S21–S23)

```
apps/bake-worker/                                ← entire app, S21
apps/sync-server/                                ← entire app, S22
packages/persistence-client/loader.ts            ← S22 / S23
packages/persistence-client/event-log.ts         ← S21 enqueue wiring
apps/headless/src/cli.ts                         ← W-1C-7 (not in this list)
apps/headless/src/commands/                      ← W-1C-7 (not in this list)
```

### §2.3 Bench infra and dashboard (reserved for S24 / W-1C-6)

```
apps/bench/package.json
apps/bench/src/save-baseline.ts
apps/bench/dashboard/                            ← W-1C-6
apps/bench/reports/                              ← S24 + W-1B-2 + W-1C-6
apps/bench/run-all.sh                            ← S24
apps/bench/generate-report.js                    ← S24
apps/bench/{load-small,load-medium,load-large,bake-incremental,
          sync-roundtrip,save-edit,idle-cpu,orbit-fps,bundle-size,
          undo-single,pack-unpack}.ts            ← S24 owns each
```

> **Carve-out**: under W-1C-2 / W-1C-3 / W-1C-4 / W-1C-5 the parallel
> agent **may** edit
> `apps/bench/src/benches/produce-<family>.bench.ts` files **only** to
> change their fixture-import path to the shared `<family>-index.ts`.
> No new bench files. No edits to `apps/bench/package.json`.

### §2.4 Root config and shared docs (reserved or shared)

```
package.json                                     ← root; do not edit
.gitignore                                       ← do not edit
playwright.config.ts                             ← W-1B-3, not in this list
replit.md                                        ← do not edit
docs/04-reference/architecture-detail/                               ← S21–S24 own bake-worker.md,
                                                   sync-server-protocol.md, loader.md;
                                                   W-1C-9 owns picking.md etc.
docs/03-execution/status/sprints/                                    ← S24 owns S25.md; W-1C-9 owns S18-retro.md
docs/03-execution/status/retros/                                     ← S24 owns PHASE-1-CLOSE.md
docs/05-guides/developer/demos/                                      ← S24 + W-1C-9
docs/bench/                                      ← W-1C-6
docs/file-format/                                ← S20
docs/00_NEW_ARCHITECTURE/                        ← do not edit (only the audit
                                                   and completion plan live here;
                                                   ADR backfill is W-1C-1's scope)
```

### §2.5 Plugins outside scope

The parallel agent **only** edits:

- `plugins/wall/` — but only the three files in §1.2.
- `plugins/roof/` — but only the files in §1.6.
- `plugins/cross/` — but only `roof-roof.ts` and its test.

Every other plugin (`door`, `window`, `slab`, `curtain-wall`, `stair`,
`handrail`, `ceiling`, `column`, `beam`, `grid`, `view`) is **read-only**
to the parallel agent. The parity migration in W-1C-2 / W-1C-3 / W-1C-4
operates on `tests/parity/` and `packages/geometry-kernel/__tests__/`,
not on the plugin source.

---

## §3 Execution order recommendation

These can run in any order, but the dependency-light ones first
maximise momentum and surface schema issues early.

```
Day 0–1     W-1A-1   (lint rule, isolated)        ─┐
Day 0–1     W-1B-1   (façade, isolated)           ─┤  ← independent kick-off
Day 1–2     W-1C-8   (single test file)           ─┘

Day 1–6     W-1C-2   (six families, mechanical)   ─┐
Day 1–4     W-1C-3   (CW, fixture-authoring)      ─┤  ← parity track,
Day 1–3     W-1C-4   (stair/handrail/ceiling)     ─┘   independent of each other

Day 2–6     W-1C-5   (roof + schema + producer)   ───  ← schema-touching;
                                                          best done by a
                                                          contributor with
                                                          producer experience
```

A two-contributor split: contributor A takes {W-1A-1, W-1B-1, W-1C-2,
W-1C-8}; contributor B takes {W-1C-3, W-1C-4, W-1C-5}. Wall-clock
collapses to ~7–9 days.

---

## §4 Pre-flight check the parallel agent must run

Before opening any file, the agent runs this guard once. It surfaces any
drift between the whitelist above and the live tree.

```bash
# 1) Confirm forbidden paths are not currently in the agent's diff.
git diff --name-only main... | grep -E '^(apps/editor/src/(bootstrap|main|index|dev)|apps/(bake-worker|sync-server)/|apps/bench/(package\.json|run-all\.sh|generate-report\.js|src/save-baseline\.ts|dashboard/|reports/|load-|sync-|save-edit|idle-cpu|orbit-fps|bundle-size|undo-single|pack-unpack|bake-incremental))' && echo "❌ FORBIDDEN PATH TOUCHED" || echo "✅ clean"

# 2) Confirm root config and shared docs are not touched.
git diff --name-only main... | grep -E '^(package\.json|\.gitignore|playwright\.config\.ts|replit\.md|docs/(sprints|retros|demos|bench|file-format)/)' && echo "❌ FORBIDDEN PATH TOUCHED" || echo "✅ clean"

# 3) Confirm only whitelisted plugin sources are edited.
git diff --name-only main... | grep -E '^plugins/' | grep -vE '^plugins/(wall/src/(handlers/(MoveWall|index)\.ts|index\.ts)|roof/src/(handlers/(AddSkylight|RemoveSkylight|JoinRoofs|index)\.ts|index\.ts|errors\.ts)|cross/(src|__tests__)/roof-roof)' && echo "❌ NON-WHITELISTED PLUGIN EDIT" || echo "✅ clean"
```

If any check prints `❌`, the agent stops and surfaces the drift before
continuing.

---

## §5 Acceptance summary (per unit, one line each)

Full acceptance gates are in `PHASE-1-COMPLETION-PLAN.md` §2-§4. One-line
recap so the agent can tick boxes:

- **W-1A-1** — Rule registered; negative fixture fails one error; all 17 plugins lint clean.
- **W-1B-1** — `MoveWall.ts` is a < 30-line façade routing through `TransformWallHandler`; all wall tests stay green; ADR-0008 errata paragraph added.
- **W-1C-2** — 66 disk fixtures + 66 disk snapshots across 6 families; six driver tests use byte-equal pattern; six bench files import from shared `<family>-index.ts`.
- **W-1C-3** — `CW_FIXTURES.length === 25`; 17 new disk configs + 17 new snapshots; CI passes; bench reads all 25.
- **W-1C-4** — Stair 10 / handrail 6 / ceiling 6 disk fixtures; 8 new disk artefact pairs total.
- **W-1C-5** — `Roof` schema carries `skylights` + `joinedToRoofIds` (`.default([])`); producer cuts skylights via CSG; 11 roof handlers (was 8); 3 new parity fixtures pass; cross-roof cascade test green.
- **W-1C-8** — Seven contract assertions pass on a single new test file.

---

## §6 What this file is NOT

- Not a re-statement of `PHASE-1-COMPLETION-PLAN.md` — it is a strict subset.
- Not a green light for the amber units (W-1B-2, W-1B-3, W-1C-6, W-1C-7, W-1C-9). Those need a separate namespace agreement.
- Not a green light for W-1C-1 (`bootstrapWithEverything`) — that unit hard-conflicts with S22 + S24 and must be sequenced, not parallelised.

If a future iteration wants to expand this list, the test is simple: a unit joins the whitelist only when **every path it touches** is absent from the S21-S24 footprint and from every other in-flight unit's whitelist.

---

*End of parallel-safe worklist.*
