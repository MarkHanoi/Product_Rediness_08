# Phase 1 Drift Closeout — Specific Implementation Required

**Audit reference:** Phase 1 audit (this session) — three drift items identified vs `docs/00_NEW_ARCHITECTURE/phases/PHASE-1A…1D`.
**Status:** Phase 1 is otherwise complete; this document specifies the exact work required to close the remaining gaps and lock the M12 alpha gate in writing.
**Scope:** Code, ADRs, tests, and CI gates only — no doc-to-doc rewrites.

---

## Item 1 — Wall handler count drift (Phase 1B / ADR-0008)

### Observation
- ADR `docs/architecture/adr/0008-wall-handler-triage.md` specifies the 22→**14** consolidation of PRYZM 1 wall commands into PRYZM 2 handlers.
- Code under `plugins/wall/src/handlers/` ships **15** handler classes (count excludes `index.ts`):

  ```
  BulkSetWallVisuals, ChangeWallLevel, CreateWallBetweenMarks, CreateWallOpening,
  CreateWallsFromSlab, CreateWall, CutWall, DeleteWall, JoinWall, MoveWall,
  SetWallColor, SetWallDimensions, SetWallLayers, SetWallSystemType, TransformWall
  ```

- The extra is `BulkSetWallVisuals.ts`, added in S10-T2 (per its file header). It merges two PRYZM 1 bulk commands (`SetAllWallsWidth`, `SetAllWallsVisualProperties`) that ADR-0008 originally scoped into the per-wall `SetWallColor` / `SetWallDimensions` handlers via UI-side iteration.

### Decision
**Keep the handler. Refresh ADR-0008 to formalise the 22→15 consolidation.**

Rationale: the code header explicitly justifies the bulk handler with auditability + replay (one forward / one inverse patch for N walls vs N stack entries). Folding it back into per-wall handlers would regress the undo UX.

### Required changes

#### 1.1 — Update ADR-0008
**File:** `docs/architecture/adr/0008-wall-handler-triage.md`

- Change the title and any "22 → 14" references to "22 → 15".
- Add a new row to the consolidation table:

  ```
  | BulkSetWallVisualsHandler | wall.bulkSetVisuals | SetAllWallsWidthCommand,
                                                       SetAllWallsVisualPropertiesCommand
                                                     | S10-T2 (bulk auditability) |
  ```

- Add a "Status: Amended (S10-T2)" note at the top with date `2026-04-28`.
- Cross-link the amendment in `docs/00_NEW_ARCHITECTURE/phases/PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md`.

#### 1.2 — Lock the count in CI
**File:** `scripts/check-adr-code-drift.mjs` (already exists)

Add (or extend the existing wall block to add) the explicit assertion:

```js
// ADR-0008 — wall handler count is locked at 15 (22 → 15 triage).
const wallHandlers = readdirSync('plugins/wall/src/handlers')
  .filter(f => f.endsWith('.ts') && f !== 'index.ts');
if (wallHandlers.length !== 15) {
  console.error(
    `[adr-drift] ADR-0008 expects 15 wall handlers, found ${wallHandlers.length}: ` +
    wallHandlers.join(', ')
  );
  process.exit(1);
}
```

#### 1.3 — Verify handler registry agrees with ADR
**File:** `plugins/wall/src/handlers/index.ts`

Confirm `BulkSetWallVisualsHandler` is exported and registered. (Spot-check during the ADR refresh; no code change expected.)

#### 1.4 — Acceptance
- `node scripts/check-adr-code-drift.mjs` exits 0.
- ADR-0008 header carries the amendment note and the consolidation table sums to 15.

**Owner:** Phase 1B steward. **Effort:** ~30 min.

---

## Item 2 — Built-in type catalogue gap (Phase 1C / ADR-017)

### Observation
- `packages/types-builtin/src/` currently ships only **7** family folders: `ceiling, curtain-wall, door, handrail, roof, stair, window`.
- The 12 element families implemented in `plugins/*` and `packages/geometry-kernel/src/producers/*` are: the 7 above **+ column, beam, slab, furniture, grid, plumbing, lighting, structural**.
- `packages/types-builtin/package.json` only declares `exports` paths for door / window / roof / curtain-wall.
- ADR `docs/00_NEW_ARCHITECTURE/adrs/ADR-017-type-catalog-scope.md` is the source of truth for what belongs in this package.

### Decision
**Split the gap. Backfill the 4 elements that benefit from a v1 starter set; explicitly defer the other 4 in ADR-017.**

| Family | Action | Reason |
|---|---|---|
| `column` | **Backfill** v1 starter | Discrete catalogue: rectangular, round, I-section, HSS — mirrors PRYZM 1 column types. |
| `beam` | **Backfill** v1 starter | Discrete catalogue: rectangular, I-section, channel — mirrors PRYZM 1 beam types. |
| `slab` | **Backfill** v1 starter | Layered assembly catalogue (concrete, composite, hollow-core) consistent with `roof`. |
| `furniture` | **Backfill** v1 starter | The plugin already ships GLB packs; needs a typed registry to keep the picker honest. |
| `grid` | **Defer in ADR-017** | Project-instance configuration; no industry-standard discrete types. |
| `plumbing` | **Defer in ADR-017** | Routing primitive; types belong in MEP catalogue (Phase 4 BIM-2). |
| `lighting` | **Defer in ADR-017** | Photometric/IES catalogue is out-of-scope for built-in types (vendor data). |
| `structural` | **Defer in ADR-017** | Analytical model; types live in the structural plugin's own analytical schema. |

### Required changes

#### 2.1 — Create 4 new type-catalogue folders

Use `packages/types-builtin/src/door/index.ts` as the canonical template (file shape, header comment, exports). For each new family create exactly one `index.ts`:

| File | Type interface | Constants | Helpers |
|---|---|---|---|
| `packages/types-builtin/src/column/index.ts` | `ColumnType { id, name, family: 'rectangular' \| 'round' \| 'i-section' \| 'hss', width, depth, defaultColor }` | `BUILTIN_COLUMN_TYPES` (≥6 entries: 300×300 RC, Ø400 RC, UC203, UC254, HSS200, HSS250), `DEFAULT_COLUMN_TYPE_ID = 'col-rc-300x300'` | `getColumnType(id)` |
| `packages/types-builtin/src/beam/index.ts` | `BeamType { id, name, family: 'rectangular' \| 'i-section' \| 'channel', width, depth, defaultColor }` | `BUILTIN_BEAM_TYPES` (≥6 entries: 300×600 RC, UB305, UB406, UB533, PFC230, PFC300), `DEFAULT_BEAM_TYPE_ID = 'beam-rc-300x600'` | `getBeamType(id)` |
| `packages/types-builtin/src/slab/index.ts` | `SlabType { id, name, family: 'concrete' \| 'composite' \| 'hollow-core', layers: { material, thickness }[] }` | `BUILTIN_SLAB_TYPES` (≥4 entries: RC-200, RC-300, Composite-150, HollowCore-265), `DEFAULT_SLAB_TYPE_ID = 'slab-rc-200'` | `getSlabType(id)` |
| `packages/types-builtin/src/furniture/index.ts` | `FurnitureType { id, name, family: 'seating' \| 'table' \| 'storage' \| 'fixture', glbPath, defaultBoundsM: { x, y, z } }` | `BUILTIN_FURNITURE_TYPES` (≥8 entries that resolve against existing `public/items/Furniture/*` GLBs), `DEFAULT_FURNITURE_TYPE_ID` | `getFurnitureType(id)` |

All 4 files follow the same conventions as the existing 7:
- Pure data, no Zod.
- Header comment cites `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` and ADR-017.
- `Object.freeze` the array exports.
- Include a default colour appropriate to the family.

#### 2.2 — Wire the new exports

**File:** `packages/types-builtin/package.json`

Extend the `exports` map:

```json
"exports": {
  ".": "./src/index.ts",
  "./door": "./src/door/index.ts",
  "./window": "./src/window/index.ts",
  "./roof": "./src/roof/index.ts",
  "./curtain-wall": "./src/curtain-wall/index.ts",
  "./stair": "./src/stair/index.ts",
  "./handrail": "./src/handrail/index.ts",
  "./ceiling": "./src/ceiling/index.ts",
  "./column": "./src/column/index.ts",
  "./beam": "./src/beam/index.ts",
  "./slab": "./src/slab/index.ts",
  "./furniture": "./src/furniture/index.ts"
}
```

(Note: `stair`, `handrail`, `ceiling` are already exported from `src/index.ts` but missing from `package.json`'s `exports` block — add them too.)

**File:** `packages/types-builtin/src/index.ts`

Append the 4 new re-exports following the existing pattern:

```ts
export {
  BUILTIN_COLUMN_TYPES, DEFAULT_COLUMN_TYPE_ID, getColumnType, type ColumnType,
} from './column/index.js';
export {
  BUILTIN_BEAM_TYPES, DEFAULT_BEAM_TYPE_ID, getBeamType, type BeamType,
} from './beam/index.js';
export {
  BUILTIN_SLAB_TYPES, DEFAULT_SLAB_TYPE_ID, getSlabType, type SlabType,
} from './slab/index.js';
export {
  BUILTIN_FURNITURE_TYPES, DEFAULT_FURNITURE_TYPE_ID, getFurnitureType, type FurnitureType,
} from './furniture/index.js';
```

#### 2.3 — Wire the catalogues into the 4 plugins

For each plugin, replace any inline default with the catalogue lookup (one-line change per plugin):

| Plugin | File | Change |
|---|---|---|
| `plugins/column` | `plugins/column/src/store.ts` (or where `systemTypeId` is initialised) | `import { DEFAULT_COLUMN_TYPE_ID } from '@pryzm/types-builtin/column'` and use it as the default. |
| `plugins/beam` | `plugins/beam/src/store.ts` | Same pattern with `DEFAULT_BEAM_TYPE_ID`. |
| `plugins/slab` | `plugins/slab/src/store.ts` | Same pattern with `DEFAULT_SLAB_TYPE_ID`. |
| `plugins/furniture` | `plugins/furniture/src/store.ts` | Same pattern with `DEFAULT_FURNITURE_TYPE_ID`. Reconcile against the existing GLB picker so the catalogue is the single source. |

#### 2.4 — Update ADR-017
**File:** `docs/00_NEW_ARCHITECTURE/adrs/ADR-017-type-catalog-scope.md`

Add (or amend) two sections:

1. **In-scope (v1):** door, window, roof, curtain-wall, stair, handrail, ceiling, **column, beam, slab, furniture** — 11 families.
2. **Deferred / Out-of-scope (v1):** **grid** (project-instance), **plumbing** (deferred to MEP catalogue, Phase 4 BIM-2), **lighting** (vendor IES, deferred), **structural** (analytical, lives in plugin) — with the rationale from §2 above.

Add an "Amended 2026-04-28" header note.

#### 2.5 — Tests

Add minimal unit tests under `packages/types-builtin/__tests__/` (one file per new family, mirroring the existing pattern):

- Asserts the array is non-empty.
- Asserts the `DEFAULT_*_TYPE_ID` is found by `get*Type()`.
- Asserts every `id` is unique.

If no `__tests__` exists yet for the package, create it with a `vitest.config.ts` matching `packages/file-format/vitest.config.ts`.

#### 2.6 — Lock the catalogue completeness in CI
**File:** `scripts/check-adr-code-drift.mjs`

Add an assertion that the 11 in-scope families each have a folder under `packages/types-builtin/src/` and a row in the root `index.ts` re-exports.

#### 2.7 — Acceptance
- `pnpm --filter @pryzm/types-builtin typecheck` passes.
- `pnpm --filter @pryzm/types-builtin test` passes (new tests included).
- `node scripts/check-adr-code-drift.mjs` exits 0.
- The 4 plugins boot in `apps/editor` with their default `systemTypeId` resolved from the catalogue (smoke-test by creating one element of each kind in the editor).

**Owner:** Phase 1C steward. **Effort:** ~3–4 h (4 files × ~80 lines + 4 plugin one-liners + 4 tests + ADR amendment).

---

## Item 3 — M12-Alpha demo artefacts (Phase 1D)

### Observation
- All Phase 1D **code** deliverables (bake worker, sync server, tier-streamed loader, `.pryzm` v1 format, CI regression gates, release scripts) are present and green per `apps/bench/reports/M12-alpha.md`.
- Two non-code artefacts referenced by the M12 alpha gate are deferred:
  1. `M12-alpha.mp4` walkthrough recording.
  2. Live Honeycomb dashboard for OTel spans emitted from `apps/bake-worker/src/otel.ts`.

### Decision
**Treat as deploy-time deliverables, not code work. Add explicit gating in the release runbook so the alpha gate cannot be marked closed without them.**

### Required changes

#### 3.1 — Extend the release runbook
**File:** `editor/tooling/release/release.sh`

Add a pre-flight check block (no behaviour change, just a printed checklist) that the operator must tick before the script proceeds with an alpha tag:

```sh
if [ "${RELEASE_TRACK:-}" = "alpha" ]; then
  cat <<'EOF'
=========================================================================
  M12 ALPHA GATE — non-code prerequisites (operator confirms with --confirm-alpha):
    [ ] M12-alpha.mp4 walkthrough recorded and uploaded to releases/v0.1-alpha/
    [ ] Honeycomb dataset 'pryzm-bake-worker' receiving spans (last 24h non-zero)
    [ ] Bench report apps/bench/reports/M12-alpha.md is GREEN
=========================================================================
EOF
  if [ "${1:-}" != "--confirm-alpha" ]; then
    echo "[release] Re-run with --confirm-alpha after the checklist is complete."
    exit 2
  fi
fi
```

#### 3.2 — Add an OTel smoke check
**File:** `scripts/check-otel-emission.mjs` (new — ~40 lines)

A script the release operator runs against the staging deploy that:
1. POSTs a synthetic `RebakeChunkJob` payload through `apps/sync-server` (re-using the test fixture under `apps/sync-server/__tests__/`).
2. Polls Honeycomb's API (HONEYCOMB_API_KEY env) for a span with that job's `correlation_id`.
3. Exits 0 if found within 60 s, exits 1 otherwise.

Wire into `editor/tooling/release/release.sh` behind the `--confirm-alpha` flag so the OTel pipeline is verified by machine, not just by checklist.

#### 3.3 — Update the bench report
**File:** `apps/bench/reports/M12-alpha.md`

Add a "Gate Closure Evidence" section at the bottom with three placeholders to be filled at deploy:
- Link to the recorded video.
- Honeycomb dashboard URL.
- Output of `scripts/check-otel-emission.mjs --staging`.

#### 3.4 — Acceptance
- Running `editor/tooling/release/release.sh alpha` (without `--confirm-alpha`) prints the checklist and exits 2.
- Running `scripts/check-otel-emission.mjs --staging` against the staging deploy exits 0.
- `apps/bench/reports/M12-alpha.md` has the three evidence rows populated for any tag created on the alpha track.

**Owner:** Release operator. **Effort:** ~1 h (one shell stanza + one ~40-line script + one report section). Video recording itself is a deploy-day task, not engineering.

---

## Roll-up — Definition of Done for Phase 1 closeout

Phase 1 is closed when **all** of the following are true on `main`:

1. `node scripts/check-adr-code-drift.mjs` exits 0 and asserts:
   - 15 wall handlers (Item 1).
   - 11 in-scope built-in type catalogues (Item 2).
2. `pnpm --filter @pryzm/types-builtin run typecheck && pnpm --filter @pryzm/types-builtin test` exits 0.
3. `editor/tooling/release/release.sh alpha --confirm-alpha` succeeds end-to-end against staging, with `scripts/check-otel-emission.mjs` returning a real span.
4. ADR-0008 header carries the 22→15 amendment note.
5. ADR-017 lists the 11 in-scope and 4 deferred families with rationale.
6. `apps/bench/reports/M12-alpha.md` has a populated "Gate Closure Evidence" section.

Total estimated effort: **~5 h of engineering work** + the deploy-day video recording.

---

## Out of scope for this closeout

The following were **considered and explicitly excluded** from this document because the audit confirmed they are already implemented in code:

- Skeleton & rails packages (Phase 1A) — all 11 packages, both ADR sets, all 4 ESLint rules, both isolation scripts, the dual-mode renderer parity test, and the Hello Cube demo are present.
- Wall recipe (Phase 1B) — geometry kernel, command bus + cascade, scene committer + MaterialPool, picking, view-state, plugin SDK, editor wiring, and ADRs 0008–0013 are present.
- 12 element plugins + producers (Phase 1C) — all present including stair, handrail, ceiling.
- Family runtime / loader / instance / expr-eval (Phase 1C) — present.
- Headless app + benchmarks (Phase 1C) — present with M9-1C, M6-1B, and per-element baselines.
- Bake worker, sync server, tier loader, `.pryzm` v1 format, regression CI (Phase 1D) — present.

No code changes are required for any of the items in this "out of scope" list.
