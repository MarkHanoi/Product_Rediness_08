# Phase 1B Sub-phase Q2 M4–M6 — Spec-vs-Code Audit

**Spec:** `docs/00_NEW_ARCHITECTURE/phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` (2,028 lines)
**Sprints in scope:** S07 → S12 (wall plugin → 8-element multiplier)
**Audit date:** 2026-04-27
**Audited by:** main agent
**Reference workspace state:** root `npm run build` green; geometry-kernel 125/125 tests passing.

---

## 1. Verdict

**Overall: AMBER.** All nine elements (wall, door, window, roof, slab, grid, column, beam, curtain-wall) exist as plugins with stores, handlers, committers, tools, intent layers, and pure THREE-free producers in the geometry kernel. Six of seven required ADRs are merged. The cross-element cascade infra (CascadeRunner + slab-wall rule) is in place, and the wall-purity lint is real-enforced.

However, the **sub-phase 1B exit criteria as written in the spec (§S12 lines 1551–1575) are NOT all met** — primarily because the editor bootstrap registers only the wall plugin, the per-element parity-fixture sets are absent for 7 of 9 elements, the per-element bench files are absent for 7 of 9, the mixed-scene integration test does not exist, and no Playwright suites have been written.

The implementation work that *was* done is high-quality and matches the spec's typed contracts; the gap is **scope coverage**, not correctness.

---

## 2. What is GREEN (matches spec)

### 2.1 Plugin layout (S07 + S11 + S12)

Every plugin under `plugins/` has the canonical seven-file layout:

| Plugin | store | handlers/ | committer/ | tool | intent | errors | index |
|---|---|---|---|---|---|---|---|
| wall | ✓ | ✓ + `occupancy.ts` + `system-type-store.ts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| door | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| window | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| roof | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| slab | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| column | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| beam | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| grid | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| curtain-wall | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

`plugins/cross/` contains `index.ts` + `slab-wall.ts` per ADR-012.

### 2.2 Handler triage (counts vs spec)

| Plugin | Implemented | Spec target | Match? |
|---|---|---|---|
| wall (TransformWall consolidates `move\|mirror\|scale\|offset\|referenceEdit`) | 16 | 14 | ≥ spec (extra: `BulkSetWallVisuals`, `CreateWallsFromSlab`) |
| door | 6 (`create`, `delete`, `move`, `setType`, `setSwing`, `setWidth`) | 6 (line 1184) | **✓ exact** |
| window | 5 (`create`, `delete`, `move`, `setType`, `setSize`) | 5 (line 1185) | **✓ exact** |
| roof | 8 (`create`, `delete`, `move`, `setPitch`, `setShape`, `setThickness`, `setOverhang`, `changeLevel`) | 10 (line 1187: also `AddSkylight`, `RemoveSkylight`, `JoinRoofs`) | **GAP: 3 missing**; naming differs (`setPitch`/`setShape` vs spec's `setSlope`/`setKind` — semantic equivalents) |
| slab | 8 (`create`, `delete`, `move`, `setType`, `addHole`, `removeHole`, `setThickness`, `setBaseOffset`) | 8 (line 1471) | **✓ exact** (spec uses `addOpening`/`removeOpening` naming; impl uses `addHole`/`removeHole`) |
| curtain-wall | 9 (`create`, `delete`, `move`, `setGrid`, `setMullionType`, `setTransomType`, `setPanelType`, `setOutline`, `resize`) | 9 (line 1472) | **✓ exact** |
| grid | 4 (`create`, `delete`, `setSpacing`, `setExtent`) | 4 (line 1473) | **✓ exact** |
| column | 5 (`create`, `delete`, `move`, `setType`, `setHeight`) | 5 (line 1474) | **✓ exact** |
| beam | 5 (`create`, `delete`, `move`, `setType`, `setSection`) | 5 (line 1475) | **✓ exact** |

Total handlers across the 9 plugins: **66**.

### 2.3 Geometry-kernel producers (S08 / S10 / S11 / S12)

All nine producers exist under `packages/geometry-kernel/src/producers/`, all use the canonical signature `(dto, joinData, worldY) => BufferGeometryDescriptor` (ADR-009), and all are THREE-free (lint-enforced).

```
producers/
├── wall.ts          ├── door.ts        ├── window.ts
├── roof.ts          ├── slab.ts        ├── grid.ts
├── column.ts        ├── beam.ts        ├── curtainwall.ts
├── _shared/linear-structural.ts   (column+beam share)
└── _internal/       (WallPath, MiterPrism, openings, earcut, hashing, …)
```

Linear-structural shared producer per spec mitigation §S12 blocker row 4 ✓.
Curtain-wall sub-producer split (panels / mullions / transoms / merge) per ADR-011 ✓.

### 2.4 Cross-cutting infrastructure

| Concern | Spec ref | Status |
|---|---|---|
| `CascadeRunner` (Kahn BFS, depth=16, OTel `cascade.cycle.dropped`) | S10 typed contracts L1059 | `packages/command-bus/src/cascade.ts` ✓ |
| `plugins/cross/slab-wall.ts` cascade rule | S12-T6, ADR-010 | ✓ (covers `slab.move`, `slab.setBaseOffset`, `slab.setThickness`) |
| Wall intent resolver (THREE-free port) | ADR-013 | `plugins/wall/src/intent.ts` ✓ |
| `MaterialPool` content-hashed cross-family dedup | S12 blocker row 5 | `packages/scene-committer/src/MaterialPool.ts` ✓ — hash is opaque string supplied by caller; cross-family dedup is correct by construction |
| Producer purity lint (`pryzm/no-three-in-kernel`) | S07-T3, K1B-2 | `tools/eslint-plugin-pryzm/src/rules/no-three-in-kernel.js` ✓ + real-enforcement test in `packages/geometry-kernel/__tests__/lint-fixture.test.ts` |
| Headless / browser-worker runners | S08 D2 | `packages/geometry-kernel/src/runners/{headless-runner,node-worker,browser-worker-runner,worker-entry}.ts` ✓ |
| CSG | S08 D5 fallback | `packages/geometry-kernel/src/csg/KernelCSG.ts` (81 LOC) — lazy `manifold-3d` adapter; **spec-approved fallback path** (line 597) — note: the alternative was a from-scratch `three-bvh-csg` THREE-free port |

### 2.5 ADRs

| ADR | Status |
|---|---|
| 0008 wall-handler-triage | ✓ merged |
| 0009 producer-pure-function-signature | ✓ merged |
| 0010 slab-handler-triage | ✓ merged |
| 0011 curtain-wall-triage-and-producer-split | ✓ merged |
| 0012 cross-element-cascade-rule-registration | ✓ merged |
| 0013 intent-resolver | ✓ merged |
| 0014 persistence-snapshot-threshold | **conditional** — spec line 38 says "drafted only if S09 needs it"; not present, see §3.3 |

### 2.6 Wall + roof completeness (the canonical reference elements)

| Asset | Wall | Roof |
|---|---|---|
| Producer | ✓ | ✓ |
| Parity configs (`tests/parity/<elem>/configs/*.json`) | **30** ✓ (spec line 714) | **20** ✓ (spec line 1313) |
| Snapshot baselines | 30 ✓ | 20 ✓ |
| Per-element bench (`apps/bench/src/benches/produce-<elem>.bench.ts`) | ✓ p95 < 50 ms | ✓ |
| `load-small.bench.ts` cold-load < 800 ms | ✓ (1-wall fixture) | n/a |
| `orbit-fps-walls.bench.ts` | ✓ p95 < 18 ms (per 60 Hz frame) | n/a |

---

## 3. What is RED (gaps vs spec)

### 3.1 P0 — sub-phase 1B exit criteria not met

These items are listed in `§S12 exit criteria` (spec lines 1551–1575) and are **gating** for closing 1B.

#### 3.1.1 Editor bootstrap registers only WALL — 8 of 9 plugins not wired

`apps/editor/src/bootstrap.data.ts` exposes `bootstrapWithWalls()` which constructs `WallStore`, `WallSystemTypeStore`, and the wall handler set. There is **no** equivalent registration for `door | window | roof | slab | grid | column | beam | curtain-wall`.

| Spec citation | Says |
|---|---|
| Line 919 | `pryzm.plugin.register` budget 60 ms — `Promise.all(plugins.map(p => p.register(...)))` |
| Line 1551 | "9 element families parity-tested vs PRYZM 1: Wall, Slab, Door, Window, Roof, Curtain Wall, Grid, Column, Beam" |
| Line 1552 | "Small fixture (1 wall + 1 slab + 1 door) opens in `?pryzm2=1` in < 800 ms cold" |

**Consequence:** the 9-element scene mandated by the §S12 D9 demo (line 1530) cannot be opened in the editor. The plugins are unit-testable in isolation but not integrated.

**Fix sketch:** add `bootstrapWithBim(opts)` in `bootstrap.data.ts` (or extend `bootstrapWithWalls`) that constructs the 8 missing stores and calls each plugin's `register*Handlers(bus)` + each plugin's committer registration on the host.

#### 3.1.2 Per-element produce benches missing for 7 of 9 elements

Existing: `produce-wall.bench.ts`, `produce-roof.bench.ts`.

Spec demands (line 1517): `apps/bench/produce-{slab,curtain-wall,grid,column,beam}.bench.ts each p95 < 50 ms (CW < 80 ms acceptable per ADR-011)`. S11 exit criterion (line 1313) additionally requires `produce-{door,window,roof}.bench.ts`.

**Missing:** `produce-door.bench.ts`, `produce-window.bench.ts`, `produce-slab.bench.ts`, `produce-curtain-wall.bench.ts`, `produce-grid.bench.ts`, `produce-column.bench.ts`, `produce-beam.bench.ts` — **7 bench files**.

**Consequence:** the §S12 exit clause "all bench gates green: `produce-{wall,slab,door,window,roof,curtain-wall}` < 50 ms p95" cannot be evaluated.

#### 3.1.3 Per-element parity fixtures missing for 7 of 9 elements

Existing fixture sets (configs + snapshots):

| Element | Fixtures | Spec required |
|---|---|---|
| wall | 30 / 30 | 30 (spec line 714) |
| roof | 20 / 20 | 20 (spec line 1313) |
| door | 0 (only `door-snapshot.test.ts` exists, no `configs/`) | **15** (spec line 1313) |
| window | 0 (only `window-snapshot.test.ts`) | **12** (spec line 1313) |
| slab | 0 — directory does not exist | **18** (spec line 1517) |
| curtain-wall | 0 — directory does not exist | **25** (spec line 1517) |
| grid | 0 — directory does not exist | **8** (spec line 1517) |
| column | 0 — directory does not exist | **6** (spec line 1517) |
| beam | 0 — directory does not exist | **6** (spec line 1517) |

**Total missing fixtures: 90.** PRYZM 1 reference snapshots exist under `tests/fixtures/pryzm-1-snapshots/{door,window,slab,curtainwall,grid,column,beam,…}/` but no PRYZM 2 capture has been run.

#### 3.1.4 Mixed-scene integration test missing

Spec line 1517 demands `tests/integration/mixed-scene.spec.ts` covering:
- 9-element scene loads in `?pryzm2=1`
- `MaterialPool` dedupes across CW mullion + column (same metal)
- cold-load < 800 ms

`tests/integration/` does not exist.

#### 3.1.5 Playwright integration suites missing

Spec lines 1313 + 1517 require `plugins/{wall,door,window,roof,slab,curtain-wall,grid,column,beam}/__tests__/playwright/integration.spec.ts`. None exist; no Playwright config in the repo.

The §S09 exit criterion (line 810) explicitly requires the wall Playwright suite.

### 3.2 P1 — Spec-mandated tooling absent

#### 3.2.1 Lint rule `pryzm-store-single-channel` missing

Spec §1599 (R1B-09 mitigation, "S07 D2 add"): "Lint rule `pryzm-store-single-channel` errors on multiple subscribe-callsites in a `Store<T>` extension."

`tools/eslint-plugin-pryzm/src/rules/` contains: `affected-stores-required`, `no-three-in-kernel`, `no-three-outside-committer`, `no-raf` — **`store-single-channel` not present**.

Risk this protects against: the PRYZM 1 `WallStore.ts` 3-channel fan-out being silently re-introduced in any future plugin's store extension.

#### 3.2.2 `apps/dev/buffer-diff.ts` missing

Spec lines 593 + 1592 (R1B-02 mitigation): byte-bisection utility that finds the first diverging byte between two `BufferGeometryDescriptor`s. Used when parity snapshots fail.

`apps/dev/` directory does not exist. Currently a parity divergence would have to be debugged by hand.

### 3.3 P2 — Conditional / informational

- **ADR-0014 (persistence-snapshot-threshold)** — spec made this conditional on the S09 cold-load bench failing the 800 ms gate. The `load-small.bench.ts` exists with the gate set; if it has been observed to pass without snapshotting, ADR-0014 is correctly absent. Recommend documenting this decision (one paragraph in the §S09 closing notes).
- **CSG implementation** — uses lazy `manifold-3d` (81 LOC adapter). Spec line 597 explicitly approved this as the fallback to a `three-bvh-csg` THREE-free port. Acceptable; no action needed unless the runtime cost of WASM init becomes a cold-load problem.
- **Roof handler set** — implements 8 handlers but spec listed 10 (with `AddSkylight`, `RemoveSkylight`, `JoinRoofs`). Naming for `setPitch`/`setShape` differs from spec's `setSlope`/`setKind`. The semantic coverage of pitch + shape + overhang + thickness is complete; skylight + join handlers are genuinely missing and should be added or explicitly deferred via an ADR amendment.

---

## 4. Sprint-by-sprint roll-up

| Sprint | Theme | Status |
|---|---|---|
| S07 | Wall plugin scaffold + handler triage | **GREEN** — 16 handlers, ADR-008 merged, kernel lint enforced. Missing: `pryzm-store-single-channel` lint. |
| S08 | Wall producer + 30 parity fixtures + `produce-wall` bench | **GREEN** — 30/30 fixtures green, bench in place. Missing: `apps/dev/buffer-diff.ts`. |
| S09 | Wall committer + tool + cold-load + orbit-fps + bootstrap dev-handle | **AMBER** — committer/tool/load-small/orbit benches all in. Missing: Playwright integration suite, ADR-0014 disposition note. |
| S10 | Roof producer + intent resolver + cascade infra | **GREEN** — roof producer + 20/20 fixtures + cascade.ts + ADR-013. |
| S11 | Door + Window + Roof plugins | **AMBER** — handlers + producers + committers + tools all done. Missing: door/window parity-fixture configs (15 + 12), per-element benches (3), Playwright suites. Roof handler set short by 3. |
| S12 | Slab + Grid + Column + Beam + Curtain-Wall + cross + bootstrap registration | **AMBER** — plugins complete with correct handler counts, ADR-010/011/012 merged, slab-wall cascade rule live. Missing: editor bootstrap registration of 8 plugins, parity fixtures for 5 elements (63 total), per-element benches (5), mixed-scene integration test, Playwright suites. |

---

## 5. Recommended order to close the gap

The smallest set of work that flips the §S12 exit criteria from RED to GREEN, in dependency order:

1. **Bootstrap registration** (§3.1.1) — wires the existing plugins into the editor; without this, no integration test can run.
2. **Parity fixture capture for door / window / slab / grid / column / beam / curtain-wall** (§3.1.3) — 90 fixtures total. The capture script that produced the 30 wall and 20 roof fixtures is the template. This is the tallest single task.
3. **Per-element produce benches** (§3.1.2) — 7 thin bench files; each ~60 LOC modeled on `produce-wall.bench.ts`.
4. **Mixed-scene integration test** (§3.1.4) — depends on (1).
5. **Playwright integration suites** (§3.1.5) — depends on (1); add Playwright to dev deps + `playwright.config.ts`.
6. **`pryzm-store-single-channel` lint** (§3.2.1) — guards against R1B-09 regression.
7. **`apps/dev/buffer-diff.ts`** (§3.2.2) — debugging affordance for (2).
8. **Roof handler completeness** (§3.3) — add `AddSkylight` / `RemoveSkylight` / `JoinRoofs` OR amend ADR-008 to defer them.
9. **ADR-0014 disposition** (§3.3) — one-paragraph note in §S09 close-out, marking it formally not-needed.

Items 1–5 are the §S12 exit-criteria lift. Items 6–9 are spec hygiene.

---

## 6. What I did NOT audit

This audit covers the spec sections within S07 → S12 only. Deliberately out of scope:

- Phase 1A (S01–S06) skeleton-rails compliance — assumed green from prior audit.
- The `packages/types-builtin/{door,window,roof,…}/` v1 starter type catalogues (spec §S11 type-catalog gate, line 1180) — not inventoried here.
- SPEC-05 §3 layer composition for slab/floor types and SPEC-05 §4 material library reachability (spec §S12 exit criteria last two rows) — not inventoried here.
- Bundle-size gate (1A S06) — assumed green; no per-plugin code-split was verified.
- Production OTel surface — `otel.ts` files exist in command-bus and scene-committer, not deeply audited.
