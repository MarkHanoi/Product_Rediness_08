# PDF-to-BIM Import — Placement Reliability Audit (2026-08-10)

Founder report: PDF-to-BIM import does not reliably create **doors** in the correct place;
**windows** and even **walls** are also unreliable (wrong positions / missing).

This document maps the live pipeline end-to-end, names the root causes with file:line
evidence, and records what was fixed (same day) vs. what is deferred. Governing contracts:
**C11** (element creation pipeline), **C15** (hosted elements — doors/windows live INSIDE
walls via `wallStore` openings), **P6** (commands are the only mutation path).

---

## 1. Pipeline map (the LIVE path)

```
PDF/image upload
  └─ Step1UploadView → pdf.js raster + text extraction (PDFConversionResult)
Step 2 — scale calibration (apps/editor/src/ui/ai/floorplan-import/Step2CalibrationView.ts)
  └─ pxPerMeter from: two-point ruler | "1:100" text annotation | manual override
Step 3 — underlay placement (packages/input-host/src/FloorPlanUnderlayTool.ts)
  └─ THREE plane mesh; user can move / rotate / RESCALE it afterwards
Step 4 — recognition (packages/ai-host/src/FloorPlanAIFactory.ts, client → /api/anthropic proxy)
  └─ Stage A  (Haiku)  door-gap pre-detection → DoorGapInpainter dashes gaps
  └─ Stage B1 (Sonnet) walls + slab (guided by ImagePreprocessor segments when ≥ 8)
  └─ Phase H  detectGeometricDoorGaps() on B1 walls (WallTerminatorDoorDetector)
  └─ Stage B2 (Sonnet) openings, with B1 wall IDs + Phase H centres as grounded context
Step 4b — materialization (packages/ai-host/src/FloorPlanCommandBatcher.ts)
  └─ pixelToWorld() via underlay mesh transform; junction resolve / split / dedup / scorer
  └─ walls   → CreateWallCommand proposals
  └─ slab    → CreateSlabCommand (topology outer face, AI fallback)
  └─ openings→ host-wall resolution (graph → gap-probe → AI hostWallId) →
               CreateWallOpeningCommand proposals   ← C15-hosted, never free elements
  └─ recovery→ unmatched Phase H gaps → synthetic door proposals
Step 5/6 — execution (packages/ai-host/src/FloorPlanBatchExecutor.ts)
  └─ dependency order walls → slab → doors → windows → other, via window.commandManager
  └─ CreateWallOpeningCommand: wallStore.addOpening + doorStore/windowStore mirror +
     elementRegistry + semanticGraph hosts/hostedBy (C15 §2 compliant)
```

**Not the live path (important to know):**
- `apps/ai-worker/src/pdf-to-bim/` (stage2-walls / stage2-openings) is a complete **vector-first
  CV library** (S51/S52) with door-arc template matching and window-glazing detection in mm
  space — exported but **wired into nothing** in the wizard. Classic authored-but-unwired.
- `packages/core-app-model/src/ai/` contains **stale duplicates** of six pipeline files
  (PlanarTopologyEngine, WallIntersectionResolver, WallCandidateScorer, ImagePreprocessor,
  FloorPlanDiagnostics, PdfToBimConstraints). No production imports found — dead copies.
- `packages/pdf-to-bim/` is only the confidence model + review queue.

---

## 2. Root causes, per failure class

### 2.1 DOORS (and WINDOWS) in the wrong place — P0, FIXED

**§PDF-OFFSET-LEFTEDGE.** The repo-wide hosted-opening convention is `offset` = **LEFT EDGE**
along the wall baseline; centre = `offset + width/2` (§OPENING-OFFSET-LEFTEDGE-UNIFY
2026-06-24). Authority:

- `packages/geometry-wall/src/WallOccupancyStore.ts:82` — `offset: LEFT-EDGE offset along the wall baseline (metres)`
- `packages/geometry-kernel/src/producers/_internal/computeOpeningWorldPos.ts:46` — `centreAlong = opening.offset + opening.width / 2`
- `packages/geometry-wall/src/WallOpeningPositionResolver.ts:23` — `worldCenter = baseLine[0] + dir × (offset + width/2)`

`FloorPlanCommandBatcher` projected the opening **CENTRE** onto the wall and passed that
projection directly as `openingData.offset` (formerly lines ~999–1011, and again in the
geometric-recovery block ~1118–1131). **Every imported door and window was therefore shifted
by +width/2 along its host wall** — ~0.45 m for a door, ~0.6+ m for a window. This alone
explains "doors are never quite where the plan shows them". The PDF pipeline predates the
06-24 unification and was missed by it.

*Fix:* clamp the centre to `[w/2, len−w/2]`, then convert `offset = centre − width/2` in both
the main opening loop and the recovery block.

### 2.2 WALLS wrong size / thickness (and opening widths wrong) after underlay rescale — P1, FIXED

**§PDF-SCALE-EFFECTIVE.** Positions go through `underlayTool.pixelToWorld()` →
`mesh.localToWorld()`, which honours the mesh transform **including `mesh.scale`** set by the
in-scene reference-scale tool (`FloorPlanUnderlayTool.applyScale`, input-host:248). But every
**scalar** conversion used the *intrinsic* scale instead:

- wall thickness: `thicknessPx / imgWidthPx × planWidthMeters` (batcher, formerly ~490)
- opening width: `widthPx / imgWidthPx × planWidthMeters` (formerly ~985)
- recovery gap width: same intrinsic formula (formerly ~1087)
- furniture dims: `f.widthPx / pxPerMeter` (formerly ~1207)
- WallCandidateScorer got the intrinsic `pxPerMeter`

So after the user rescales the underlay, wall centrelines land correctly but thicknesses,
door/window widths and furniture sizes are off by the scale factor — walls "in the wrong
place" in the sense of wrong faces, doors too narrow/wide, scorer thresholds miscalibrated.

*Fix:* one `measureEffectiveMetersPerPixel()` probes `pixelToWorld` over a 100 px span and is
the single scale for every scalar conversion (falls back to intrinsic if the tool has no
state). Sizes and positions can no longer disagree.

### 2.3 DOORS teleporting to a distant wall — P1, FIXED

**§PDF-HOST-DIST-GUARD.** Host resolution is: planar-graph nearest wall (≤ 0.2 m) → gap-probe
tiebreaker → AI `hostWallId` fallback. The tiebreaker (`FloorPlanCommandBatcher`, DOOR FIX v2)
scanned the **6 nearest accepted walls at ANY distance** for a confirmed pixel gap
(`.sort(...).slice(0, 6)` with no distance cutoff). A wall metres away with a plausible gap
(e.g. a corridor spine with jamb endpoints) could steal the door from the wall it actually
sits on.

*Fix:* tiebreaker candidates capped at `HOST_TIEBREAK_MAX_DIST_M = 0.75 m` perpendicular; the
graph assignment stands otherwise. Regression-tested with a gap-bearing wall 10 m away.

### 2.4 DOORS/WINDOWS silently vanishing — P1, FIXED

**§PDF-OCCUPANCY-PREFLIGHT.** `CreateWallOpeningCommand.canExecute` correctly enforces
`wallOccupancyStore.canPlace()` (C03 §4.8). But the batcher never checked proposed openings
against **each other**: two B2 openings (or a B2 opening plus a Phase-H recovery door — the
recovery dedup was a 60 px centre-radius check, not a span check) on the same wall with
overlapping spans both became proposals; at execute time the second was rejected and only a
console line recorded it. Founder-visible symptom: "the door just isn't there."

*Fix:* openings are processed **high confidence first (doors before windows on ties)** and
span-checked (`[offset, offset+width]`, 1 mm epsilon mirroring `WallOccupancyStore.EPSILON_M`)
against already-proposed openings per wall. Losers are skipped with diagnostic status
`'skipped_occupancy_conflict'` (new union member in `FloorPlanDiagnostics.OpeningDiagnosticRecord`)
and counted in `skippedCount`. Recovery doors run the same span check. Additionally,
`Step6CommitView` now lists each executor failure with its reason in the summary panel
instead of a bare "⚠ N failed".

### 2.5 WALLS missing / mispositioned — recognition-side (partially structural, see §4)

The wall failures that remain are dominated by **recognition quality**, not materialization:
B1 vision detection (even guided by F1 segments) misses spine sub-segments and mis-traces
centrelines; every downstream door depends on those walls. Deterministic post-processing
(junction resolve at 0.10 m, near-miss extension at 0.50 m, crossing splits, parallel-face
dedup at 0.70 m separation) is sound and was left untouched. The structural answer — the
unwired vector-first extractor — is deferred (§4).

---

## 3. What shipped (this audit's fixes)

| Tag | Class | Files | Test |
|---|---|---|---|
| §PDF-OFFSET-LEFTEDGE (P0) | doors+windows offset | `packages/ai-host/src/FloorPlanCommandBatcher.ts` (main loop + recovery) | `floorPlanBatcherOpenings.test.ts` — offset ≈ centre − w/2; centre invariant |
| §PDF-SCALE-EFFECTIVE (P1) | sizes vs positions | same file (thickness, widths, furniture, scorer scale) | effective-scale test (mesh rescaled 2×) |
| §PDF-HOST-DIST-GUARD (P1) | wrong host wall | same file (tiebreaker filter) | distant gap-bearing wall cannot steal a door |
| §PDF-OCCUPANCY-PREFLIGHT (P1) | silent drops | same file + `FloorPlanDiagnostics.ts` + `apps/editor/.../Step6CommitView.ts` | overlap: high-conf wins, loser reported; non-overlap: both survive |

New suite: `packages/ai-host/__tests__/floorPlanBatcherOpenings.test.ts` (6 tests, green).
Root `npx tsc --skipLibCheck --noEmit` green.

**Founder-testable acceptance (per fix):**
1. *Offset:* import a plan with a door mid-wall → in plan view the door leaf centre sits on
   the drawn gap centre (previously shifted half a door-width toward the wall end). Repeat
   for a window: glazing centred on the drawn gap, sill 0.9 m.
2. *Scale:* place the underlay, then use the reference-scale tool to rescale it, then run
   Analyse → walls have plausible thickness (0.2–0.4 m ext.) and doors ~0.9 m wide — not
   scaled by the rescale factor.
3. *Host guard:* a door drawn near a partition no longer materializes on a corridor wall
   across the plan.
4. *Honest skips:* import a plan where B2 double-reports a door — Step 6 summary now names
   any skipped/failed opening with its reason; nothing disappears without a line.

---

## 4. Deferred (P2 / redesign-scale), in leverage order

1. **Wire the vector-first extractor for vector PDFs.** `apps/ai-worker/src/pdf-to-bim/`
   already implements wall-pair centreline detection, door-arc template matching and
   window-glazing detection in mm space, with tests and benches. For vector PDFs it would
   replace probabilistic vision with deterministic geometry (walls exact, door gaps exact).
   This is the single biggest reliability lever and is a wiring project, not research.
2. **Migrate execution off `window.commandManager`.** `FloorPlanBatchExecutor` is a legacy
   ratchet site (scripts/check/ci-check-no-commandmanager.mjs). Proven route: reserve
   openings via `wall.createOpening`, then ONE `door.batch.create` / `window.batch.create`
   (plugins/door, plugins/window) — single undo entry, mirrors the generative executors.
3. **Delete the stale `packages/core-app-model/src/ai/` duplicates** once confirmed dead
   (no imports found today) — they will silently drift from the live ai-host copies.
4. **Underlay-rotation-aware opening frames.** Fine once §PDF-SCALE-EFFECTIVE landed
   (pixelToWorld handles rotation for positions and the probe measures true scale), but the
   pixel-space gap probe (`DoorGeometricValidator`) still assumes the AI image axes match the
   wall axes; heavily rotated underlays are untested.
5. **Confidence review queue integration** — `packages/pdf-to-bim` ReviewQueue exists but the
   wizard pushes proposals directly; low-confidence openings should route through review.

---

## 5. Honesty ledger — what may STILL be unreliable after these fixes

- **Recognition itself.** If Stage B1 does not report a wall, no door can be hosted on it
  (B2 is instructed to drop such doors; Phase-H recovery only fires when BOTH flanking walls
  were accepted). Missing walls ⇒ missing doors, by design. Fix = deferred item 1.
- **Door swing side/hand** is not detected — all doors default `single`, hinges/swing
  defaults (C15 permits; cosmetically wrong in ~50% of cases).
- **Curved walls** are out of scope for the whole pipeline (straight segments only).
- Executor still runs through the legacy CommandManager bridge (deferred item 2); it works,
  but is a P6 ratchet debt, not a placement bug.

---

## 6. Vector path wired (§VEC-WIRE, same day — closes deferred item 1)

Deferred item 1 shipped: vector PDFs now get **deterministic** walls + door arcs, with AI
recognition as the raster fallback and the furniture/plumbing enricher.

**Integration design (which path runs when):**

```
Step 1  PDFToImageConverter — NEW pass-through seam: page.getOperatorList() stored on
        PDFConversionResult.vector (+ sourceKind 'pdf'|'image'). null = "operator list
        UNREADABLE", distinct from "page has no vectors" (§CONTEXT-DATA-HONESTY:
        failure ≠ empty). Raster images always carry vector:null.
Step 2  Calibration view states UP FRONT which path this file will get (counts drawn
        constructPath ops; ≥ 8 → "vector extraction will run first").
Step 4  handleAnalyse → tryVectorRecognition() FIRST (when walls/slab/openings requested):
          stage1-vectorise (NEW)  decode fnArray/argsArray → VectorElement[] in page pt
                                  (save/restore/transform CTM simulated; cubic Béziers
                                  circle-fitted → door-swing arcs; clip paths skipped)
          stage2-walls            wall-pair centrelines + thickness in mm
          stage2-openings         door-arc template match + window glazing detection
          adapter-floorplan (NEW) → the SAME FloorPlanAnalysis shape the AI path emits
        Fallback to AI (Stage A/B1/B2) when: vector:null · < 24 line primitives ·
        < VECTOR_MIN_WALLS (4) wall pairs. Every fallback states its reason in the UI.
        On the vector path, AI still runs Stage C ONLY (includeStructure:false) for
        furniture/plumbing when requested — and its failure degrades gracefully.
Step 4b UNCHANGED — FloorPlanCommandBatcher (all §PDF-* fixes above apply identically:
        the adapter emits gap CENTRES; the batcher converts centre → LEFT-EDGE offset).
```

**Conventions the adapter honours (the regression traps of §2):**

- **§PDF-OFFSET-LEFTEDGE** — the extractor's door `position` is the swing-arc centre = the
  **HINGE** (a jamb, off by width/2). `OpeningCandidate.arcEndpointsMm` (new field) carries the
  arc's endpoints; the adapter projects hinge + the on-wall endpoint (far jamb) onto the wall
  centreline and emits the **midpoint** as `centrePx`, so batcher `offset = centre − w/2` lands
  the left edge exactly on the hinge. Unit-tested end-to-end in
  `apps/ai-worker/__tests__/pdf-to-bim/adapter-floorplan.test.ts`.
- **§PDF-SCALE-EFFECTIVE** — the pt→mm classification scale is derived from the SAME
  `measureEffectiveMetersPerPixel()` probe the batcher uses (now exported from ai-host), so an
  in-scene underlay rescale re-calibrates the mm thresholds (wall 50–600 mm etc.) too.
- Vector walls are classified `wallType:'unknown'` — honest: the pair detector has no
  exterior/interior evidence. Slab stays `null` (topology outer face owns it downstream).
- **§VEC-ARC-SPAN-GATE** — `matchDoorTemplate` now halves the score when the arc span misses the
  template's 90° by ≥ the relaxed tolerance, so panel + width-hint evidence alone can no longer
  clear `DOOR_MATCH_THRESHOLD` for a non-door arc.

**Honesty surfaces (§CONTEXT-DATA-HONESTY):** Step 2 pre-announces the path; the detection
preview stats table's first row names the path ("Vector extraction (deterministic)" vs "AI
recognition (Claude vision)"); the Step 5 summary is prefixed `[Vector extraction (N walls, M
doors, K windows raw)]` or `[AI recognition]`; the Step 6 commit summary repeats it.

**Wiring:** `@pryzm/ai-worker` gains the `./pdf-to-bim` export subpath and is a root workspace
dep (link-only, zero new external packages); the editor (L7) composes it — L7→L7, layer-legal.
file-format stays logic-free (pure pass-through), so L3 never imports an app.

**Limits (still true):** door swing side/hand not detected; curved walls out of scope; window
sill height defaulted; furniture only via AI Stage C; multi-page PDFs use page 1 only; the
vector path has not yet been exercised against a corpus of real CAD-exported PDFs — the
preview-gate accuracy thresholds (`preview-gate.ts`) remain the acceptance bar.

### 6.1 §FIX-PDF-BIM-WIZARD — the wizard was unreachable in production (founder P0, same day)

Founder report: the AI & TOOLS "PDF Import" button ended at "✓ Imported (default 10 m wide)"
with Scale/Settings/Remove — an underlay, no BIM elements: *"this was wired once upon a time —
now I can only import the pdf into the space."*

**Root cause — a deliberate downgrade, not a broken wire.** Three cooperating pieces in
`apps/editor/src/ui/ai/floorplan-import/`:

1. `Step1UploadView.handlePDFUpload` — an "Auto-place" block picked a default scale
   (`pickDefaultPxPerMeter`), dropped the underlay, called `handleConfirmPosition`, and
   STOPPED. Steps 2 and 4 were never entered.
2. `FPHelpers.gotoStep` — `display = (s === step && s <= 3)` with the comment *"keep 4-6
   always hidden per 3-step flow"*. The Analyse/review/execute steps were **structurally
   unreachable** — no code path could show them.
3. `Step3UnderlayView.handleConfirmPosition` — hid Step 1 and revealed the persistent
   underlay controls bar (the founder's exact screenshot).

The Import Manager "PDF/Image" row is **not a second import path** — it is the §32
registration event (`pryzm-floor-plan-underlay-placed`) for a placed underlay. The founder
used the only path that existed.

**Fix (all in floorplan-import):** upload → Step 2 calibration (pre-filled with the
detected `1:N` / default scale so one click suffices; the §VEC-WIRE path banner shows here)
→ "Place in Scene →" → Step 3 position → the EXPLICIT fork: primary "🔍 Continue to BIM
Analysis →" (→ Step 4 → vector-first/AI → preview → Step 5 → EXECUTE) vs secondary
"✓ Finish — underlay only (no BIM elements)". The underlay-only endpoint now SAYS "NO BIM
elements were created" (§CONTEXT-DATA-HONESTY) — it is a choice, never the silent default.
The `s <= 3` clamp in `gotoStep` is deleted. Import-Manager ids are reused on re-confirm
(Back → confirm) so the row list cannot accumulate duplicates.
