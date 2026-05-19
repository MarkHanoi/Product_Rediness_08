# M28 IFC Import Pipeline — Step-by-Step

> **Purpose**: a concrete, end-to-end walkthrough of how an IFC file flows from the user's disk into a PRYZM 2 project at S55 (~M28), with the PRYZM 1 pain each step eliminates. Useful for: founder reviews, customer demos, onboarding new engineers to the IFC subsystem, prioritising regression tests.
>
> **Audience**: Founder, Architecture lead, customer-facing engineering, anyone reading `[strategic ADR-008]` for the first time.
>
> **Authority**: subordinate to the SPEC and ADR series. Conflict precedence: `specs/SPEC-*` → `adrs/ADR-*` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `phases/PHASE-3B-*.md` → this document. This file is **explanatory**, not contractual.
>
> **Cross-references**:
> - `[strategic ADR-008]` IFC scope (the binding entity table + Pset round-trip contract).
> - `SPEC-12 §2` web-ifc unblock and bundle externals.
> - `SPEC-15 §5–§6` gateway auth + required production env vars.
> - `SPEC-26` `.pryzm` file format (chunk store + import retention).
> - `SPEC-40` buildingSMART RV+DTV certification programme (Phase 4).
> - `07-EXECUTION-PLAYBOOK §14` IFC subsystem migration plan.
> - `[strategic ADR-022]` renderer + backend topology; `[strategic ADR-023]` library rAF quarantine.
> - `docs/IFC-IMPORT-NATIVE-PARITY-IMPLEMENTATION.md` — current PRYZM 1 parity bar (the new path can't regress against this corpus).
> - `docs/06_KNOWN_ISSUES/IFC_Import.md`, `IFC_ImportLevel.md`, `ifc.md` — current failure inventory.
> - `docs/Analysis/PROJECT-OPEN-PERFORMANCE-AUDIT-2026-04.md` — current load-path audit.

---

## §0 Why this document exists

Every IFC pain logged in `06_KNOWN_ISSUES/` and the project-open performance audit can be traced to one of three structural problems in PRYZM 1:

1. **Heavy WASM in the browser, on the main thread, in the initial bundle** — every page load pays for a 3.4 MiB `web-ifc.wasm` even if the user never imports IFC, and import freezes the tab.
2. **Imported IFC is a parallel species** — it lives in `IfcModelStore`, never reaches `wallStore`/`slabStore`/`doorStore`, and therefore cannot participate in the Property Panel, the Visibility-Intent system, multi-user sync, soft locks, the AI approval queue, or the `.pryzm` save format without bespoke patches.
3. **Three competing rAF loops** — `ifcjs-viewer`, `THREE`, and `Cesium` each run their own `requestAnimationFrame`, fighting for frame budget on big IFC models.

PRYZM 2 fixes all three structurally, not via patches. This document walks the new pipeline so each fix is visible.

---

## §1 The pipeline at a glance

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Browser    │    │  apps/api-       │    │  apps/ifc-      │
│  plugin      │ ─► │  gateway         │ ─► │  worker         │
│  (thin UI)   │    │  (auth + R2 +    │    │  (Node + WASM)  │
└──────────────┘    │   BullMQ enqueue)│    └─────────┬───────┘
       ▲            └──────────────────┘              │
       │                                              ▼
       │                                    ┌─────────────────┐
       │                                    │  R2 chunk store │
       │                                    │  source.ifc.zst │
       │                                    │  intermediate-  │
       │                                    │  model.json     │
       │                                    └─────────┬───────┘
       │                                              │
       │   intermediate model + WS progress events    │
       └──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Browser dispatches the SAME native commands that drawing    │
│  tools use: addLevel, addWall, addSlab, addDoor, addWindow,  │
│  addColumn, addBeam, addStair, addRailing, addCurtainWall,   │
│  addRoof, addFurniture, addRoom — into wallStore, slabStore, │
│  doorStore, …                                                │
│                                                              │
│  From this moment on, imported IFC is indistinguishable      │
│  from natively-drawn geometry: same renderer, same           │
│  Visibility-Intent, same multi-user, same soft locks,        │
│  same .pryzm persistence, same Property Panel.               │
└──────────────────────────────────────────────────────────────┘
```

---

## §2 Step 0 — User clicks "Import IFC"

| | PRYZM 1 today | PRYZM 2 (S55) |
|---|---|---|
| Bundle cost up to this point | Initial bundle already pulled `@thatopen/components` + `web-ifc.wasm` (3.4 MiB) + glue (250 KiB) — even users who never import IFC pay for it. (`GAP-REVIEW-2026-04-27.md` line 397: *"For 18 months, every page load is paying for OBC."*) | **Zero** IFC bytes in the initial bundle. `vite.config.ts` marks `@thatopen/components` and `web-ifc` as **external** (SPEC-12 §2.2). |
| Behaviour at click | Nothing extra to load — already paid. | Plugin host fires the manifest's `onCommand:import.ifc` activation event → dynamic `import('plugins/ifc-import')` → 3.4 MiB WASM chunk fetches now (and is cached forever after). UX: progress spinner with "Loading IFC engine…" |
| Pain eliminated | First paint < 800 ms target (SPEC-12 §1) becomes achievable for the 95% of sessions that never touch IFC. | |

---

## §3 Step 1 — Plugin shows file picker, validates, uploads

The browser plugin (`plugins/ifc-import/`) is **deliberately thin** — UI + progress + cleanup, no parsing.

```
plugins/ifc-import/
  src/
    activation.ts            ← onCommand:import.ifc
    UploadPanel.tsx          ← file picker + drag-and-drop + Pset filters UI
    ProgressPanel.tsx        ← progress bar + cancel button
    postImportCleanup.ts     ← snap-to-level, dedupe vertices, optional rebake
  manifest.json
```

Flow:

1. User picks `customer-model.ifc` (e.g. 50 MB).
2. Plugin reads file size + first 64 bytes (header sniff: `IFC4`, `IFC2X3`, `IFC4X3`).
3. Plugin POSTs to `apps/api-gateway`:

   ```
   POST /api/v1/ifc/imports
   Content-Type: multipart/form-data
   Authorization: Bearer <gateway-issued JWT>
   ```

4. Gateway:
   - Verifies JWT (SPEC-15 §5).
   - Streams the body straight to R2 at `r2://pryzm-imports/<workspace>/<project>/<importId>/source.ifc`.
   - Inserts an `ifc_imports` row (`id`, `projectId`, `userId`, `r2Key`, `bytes`, `schema`, `status='queued'`).
   - Enqueues a BullMQ job on Upstash Redis: `{ queue: 'ifc-import', jobId, importId }`.
   - Returns `{ importId, jobId }` to the plugin.

| Pain eliminated | How |
|---|---|
| `5500 ms wasted on /api/projects/:id/ifc-uploads` returning silent 403 (project-open audit, t≈5500 ms entry) | Gateway-issued JWT verification at the gateway, not behind a `.catch(() => false)` wrapper. SPEC-15 §5 makes the gateway the only process that verifies tokens. |
| Browser upload of huge files blocking the tab | Streamed directly to R2 via signed URL; no in-memory accumulation. ADR-003 (object storage). |
| `getaddrinfo ENOTFOUND db.svftphdzoudsaxktjhhc.supabase.co` (audit line 80) | Production cutover at S43–S45 hard-requires `SUPABASE_URL`; startup fails fast (SPEC-15 §6). No more silent DNS failures masked as 500s. |

---

## §4 Step 2 — `apps/ifc-worker` parses on the server

`apps/ifc-worker` is a **Node 20 service**, not a browser worker. It owns `web-ifc.wasm` server-side. Per `07-EXECUTION-PLAYBOOK §14.2`:

```
apps/ifc-worker/
  src/
    queueConsumer.ts         ← BullMQ worker for queue 'ifc-import'
    WebIfcRunner.ts          ← server-side web-ifc lifecycle
    IfcImporter.ts           ← (moved from src/import/ifc/)
    IfcLevelImporter.ts      ← (moved)
    IfcConversionCoordinator.ts
    psetExtractor.ts         ← IFCRELDEFINESBYPROPERTIES scan
    validators/
      bsddSchemaCheck.ts     ← ADR-008 §Validators
      ifc4Add2Tc1.ts         ← ADR-008 §Validators
```

Job flow:

1. Worker pulls the job → downloads source from R2.
2. `WebIfcRunner.init()` boots the WASM in the **Node process**, not a browser tab. Plenty of RAM, no main thread to block.
3. Reads SweptSolid / Brep / BoundingBox / MappedRepresentation / GeometricSet / AdvancedSweptSolid (ADR-008 §Geometry representations §Read).
4. Walks `IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace` to build the spatial structure.
5. Maps each supported entity (the 18-row table in ADR-008) to a PRYZM family — `IfcWallStandardCase` → wall, `IfcSlab` → slab, `IfcDoor` → door, etc.
6. Anything outside the table becomes `IfcBuildingElementProxy` with raw geometry preserved (round-trips back as a proxy on export).
7. **Pset extraction for physical elements** — the full `IFCRELDEFINESBYPROPERTIES` scan (which the 2026-04-16 native-parity contract retrofitted into PRYZM 1) is a first-class step here, not a patch.
8. Runs `bsddSchemaCheck` + `ifc4Add2Tc1` validators; attaches the validation report to the import event.
9. Posts progress events back through Redis pub/sub: `{ importId, phase: 'reading-walls', count: 42 }`. The plugin's progress bar updates live.
10. Output: an **intermediate model** — JSON conforming to `packages/domain/IntermediateModel.schema.ts`, plus per-element geometry blobs uploaded to R2.

| Pain eliminated | How |
|---|---|
| `Cannot pass non-string to std::string` BindingError (`06_KNOWN_ISSUES/IFC_Import.md`) | Server-side `web-ifc` runs against a versioned, pinned binary; pset writer goes through schema-validated builders, not hand-typed `{ type: WEBIFC.IFCREAL, value: v }` objects. |
| Browser tab freezes on 50 MB IFC | Node worker does it; browser is free. |
| No real progress | Redis pub/sub events drive the plugin's progress UI. |
| `IfcImporter.extractElements()` returned records without psets (parity failure 3) | `psetExtractor.ts` runs the full scan once, server-side, and emits psets attached to every physical element. |
| Validation was best-effort | bsdd schema check + IFC4_ADD2_TC1 are mandatory steps; report attached to the event. |

---

## §5 Step 3 — Worker writes the intermediate model + completes the job

1. Worker uploads `intermediate-model.json` + per-chunk geometry blobs to R2 at `r2://pryzm-imports/<workspace>/<project>/<importId>/`.
2. Updates `ifc_imports.status = 'ready'`, sets `intermediateR2Key`, `validationReportR2Key`.
3. Closes the WASM model (`webIfc.CloseModel(modelID)`).
4. ACKs the BullMQ job. Telemetry: span `pryzm.ifc.worker.import` closes with `bytes`, `elementCount`, `wasmDurationMs`.

---

## §6 Step 4 — Browser plugin polls / receives webhook, fetches intermediate model

1. Plugin subscribes to a project-scoped WS topic on `apps/sync-server`: `ifc.import.<importId>`. (Or polls `GET /api/v1/ifc/imports/<importId>` with 1 s exponential backoff if WS is degraded.)
2. On `status='ready'`, plugin issues `GET /api/v1/ifc/imports/<importId>/intermediate` → signed-URL redirect to R2.
3. Plugin downloads the intermediate model — small, schema-shaped JSON, not a 50 MB IFC. A few hundred KB at most for a typical residential model.

---

## §7 Step 5 — Plugin dispatches **native** commands through the same command bus

This is the structural fix for the native-parity problem.

```ts
// In plugins/ifc-import/src/commitImport.ts
async function commitImport(im: IntermediateModel, ctx: PluginContext) {
  await ctx.commands.batch(async (tx) => {
    for (const level of im.levels) {
      tx.dispatch({ kind: 'addLevel', payload: { name: level.name, elevation: level.elevation } });
    }
    for (const wall of im.walls) {
      tx.dispatch({
        kind: 'addWall',                   // ← the SAME command native tools use
        payload: {
          startPoint: wall.startPoint,
          endPoint: wall.endPoint,
          height: wall.height,
          typeId: wall.typeId ?? 'system:basic-wall',
          parameters: { ...wall.params, _ifcCustom: wall.customPsets },
        },
        meta: { source: 'ifc-import', expressID: wall.expressID, importId: im.importId },
      });
    }
    // … same for slabs, doors, windows, columns, beams, stairs, railings, curtainwalls, furniture, rooms, etc.
  });
}
```

Critically:

- `addWall` is **the same command** that the wall tool dispatches when a user clicks two points on the canvas.
- The reducer commits to `wallStore` (not `IfcModelStore`).
- The committer (`packages/kernel/walls`) generates SweptSolid geometry the same way it does for natively-drawn walls.
- The renderer renders them the same way.

| Pain eliminated | How |
|---|---|
| `PropertyPanel shows "Element Type: —"` (parity failure 1) | The element is a wall in `wallStore`. PropertyPanel resolves the schema from `wallStore`, not from `mesh.userData.type`. |
| `IFC elements don't exist in native stores → enrichFromStores() finds nothing` (parity failure 2) | They DO exist in native stores. `enrichFromStores()` is no longer needed — it's a vestigial workaround. |
| `Psets never extracted for physical elements` (parity failure 3) | Psets are attached as `parameters._ifcCustom` per ADR-008 §Property-set round-trip. They flow through the same parameter system as native parameters. |
| `userData missing type, ifcTypeName, storeyName, psets` | `userData` is computed from the store row at render time — same as native walls. |

---

## §8 Step 6 — Visibility-Intent applies automatically

Because imported elements are now native:

| Wave | What it does for IFC | Source |
|---|---|---|
| Wave 1 — level scope | Imported wall on Storey 2 hides when you switch to Level 1. Today: stays visible (separate fragment layer). | S31 baseline |
| Wave 2 — category visibility | Toggle "Walls" off in the visibility panel → imported IFC walls also hide. Today: only native walls hide. | S31 baseline |
| Wave 3 — view-template inheritance | Apply a "Floor Plan" template → IFC walls obey it. Today: IFC ignores templates. | S46 |
| Wave 4 — wall-end joins | IFC wall meets a native wall at a corner → clean join. Today: no join logic crosses the IFC/native boundary. | S31 baseline |
| Wave 5 — opening culling | Imported door cuts an IFC wall opening; the wall renders correctly around it. | S46 |
| Wave 10 — `IFCProjectionStore` parent-chain inheritance | Per-IFC-source visibility overrides composable with view-template overrides. | S49 (Phase 3A) |

Plus the renderer-side improvements:

- **Single frame owner** (`packages/render-runtime/`) — no more ifcjs-viewer rAF loop fighting THREE's loop fighting Cesium's. ADR-022 + ADR-023.
- **WebGPU path** — IFC geometry hits the same WebGPU pipeline as native geometry. Big IFC models (>10K elements) frame faster.
- **Multi-view sync** — pan/zoom in plan view stays in sync with 3D view for IFC elements (per ADR-0025).

---

## §9 Step 7 — Multi-user + soft locks come for free

Because imported elements are native:

- Yjs sync (S43 plumbing) treats them as standard CRDT-tracked entities. Edits propagate < 250 ms p95 across tabs.
- Awareness (S44 plumbing) shows peer cursors, active tools, and selections on imported IFC elements.
- Soft locks (S45 plumbing) work on imported IFC elements identically — "User A is editing this wall" badge shows on an IFC wall the same as a native one.
- AI approval queue (S47 plumbing) can propose edits to imported IFC elements via the same `CommandPayload` envelope.

Today: zero of these work on imported IFC. PRYZM 2 gets all four "for free" the moment Step 5 makes IFC elements native.

---

## §10 Step 8 — Persistence: IFC is part of the `.pryzm` file

1. Worker also uploads the **original** `source.ifc` to R2 at the project's chunk store as `imports/<importId>/source.ifc.zst` (zstd-compressed, per SPEC-26).
2. The intermediate model is referenced by the project manifest — so on next open, **no re-import is needed**. The native walls/slabs/doors that came from IFC are already in the event log.
3. The original `source.ifc` is retained for two purposes:
   - **Round-trip export**: the export plugin (S58) replays the intermediate model + applies user edits to produce a new IFC4 file with byte-equivalent Pset round-trip.
   - **Audit**: the import event references the source bytes by checksum.

| Pain eliminated | How |
|---|---|
| Re-import on every project open | One-time import; native elements persist in `.pryzm`. |
| No audit trail of what was imported | `ifc_imports` row + R2 source file + validation report = full lineage. |
| Re-export loses Psets | Round-trip target is byte-equivalent (ADR-008 §Property-set round-trip; ≥ 95% by GA, 100% by S84 cert). |

---

## §11 Step 9 — Headless / CLI / CI

`apps/headless` exposes the same path with no browser:

```
pryzm ifc import \
  --project=<id> \
  --file=customer-model.ifc \
  --post-import="snap-to-level,dedupe-vertices" \
  --validate \
  --out=intermediate-model.json
```

Because the importer is a Node service consumed by a thin browser plugin, the CLI calls the **same `apps/ifc-worker`** queue. Useful for:

- Batch onboarding a customer's 20 historical projects overnight.
- Regression testing: run the buildingSMART RV+DTV fixture corpus in CI on every PR (SPEC-40 §2.4).
- Server-side IFC → cleanup → IFC re-export pipelines.

Today: browser-only. PRYZM 2: any pipeline that can hit Redis can drive it.

---

## §12 The pain-to-fix map

| Today's pain (file:line) | Fixed by | Sprint |
|---|---|---|
| OBC + `web-ifc` in initial bundle (`GAP-REVIEW-2026-04-27.md:397`) | SPEC-12 §2 vite externals + lazy chunk | S55 |
| `5500 ms /ifc-uploads → 403` (project-open audit:33) | Gateway-verified JWT + R2 stream | S55 |
| `getaddrinfo ENOTFOUND … supabase.co` (audit:80) | Hard-required env vars + fail-fast (SPEC-15 §6) | S43–S45 |
| `BindingError: non-string to std::string` (`06_KNOWN_ISSUES/IFC_Import.md`) | Server-side pinned WASM + schema-validated builders | S55 + S58 |
| `PropertyPanel shows Element Type: —` (`IFC-IMPORT-NATIVE-PARITY-IMPLEMENTATION.md`) | IFC elements committed via native `addWall` etc. into native stores | S55 |
| Psets never on physical elements (same doc) | `psetExtractor.ts` runs `IFCRELDEFINESBYPROPERTIES` scan as a first-class step | S55 |
| Three competing rAF loops (THREE / OBC / Cesium) | Single frame owner (ADR-022) + library quarantine (ADR-023) | S31 → S32 |
| IFC ignores Visibility-Intent | Native elements automatically participate in waves 1–5; Wave 10 IFCProjectionStore at S49 | S31 baseline + S49 |
| No multi-user / locks / AI on IFC | Native elements automatically inherit Yjs + awareness + soft-lock + AI plumbing | S55 (automatic) |
| Re-import every project open | Imported elements live in `.pryzm` event log; source kept for round-trip | S55 + SPEC-26 |
| No buildingSMART certification | RV + DTV submission programme | S73 → S84 (M37–M42) |

---

## §13 The honest one-liner

**Every PRYZM 1 IFC pain point you have today maps to a specific PRYZM 2 step that eliminates it structurally — load gets fast because the WASM moves to a Node worker and lazy-loads only on demand, navigation gets equivalent-to-native because imported elements become real walls/slabs/doors in the native stores running through the same renderer with the same Visibility-Intent and the same multi-user plumbing, persistence gets durable because import is one-time and the source IFC is kept for byte-equivalent round-trip, and quality gets certified because the buildingSMART RV+DTV programme runs in Phase 4 — but the first PRYZM 2 IFC import only lands at S55 (~M28), so the M24 beta cohort uses PRYZM 1 for IFC interop in the four-sprint gap between launch and S55.**

---

*Last updated: 2026-04-28. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. This document is explanatory; the contracts live in SPEC-* and ADR-*.*
