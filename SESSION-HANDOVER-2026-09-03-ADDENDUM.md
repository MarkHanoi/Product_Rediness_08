# SESSION HANDOVER ADDENDUM — 2026-09-03, afternoon/evening

**Companion to `SESSION-HANDOVER-2026-09-03.md`. Read that first, then this.
§A2 below SUPERSEDES §4 of the main handover (the publish is per-layer now).**
Every number was measured 2026-09-03; re-measure anything load-bearing.

---

## A1 · Deploy #2 IS LIVE — `f75659e7`, bundle proof 6/6

Shipped: the 6 promoted countries routing live (LV/SK/SI/HR/GR/BG), 13 server proxy legs
(AU×6, TR, QA, LV, HR, GR, SI, SK — **IL deliberately absent**, §A4), the component 3D preview,
both perf fixes, the LU envelope pack, the P3 gate fix. Rollback tag captured:
`deployment-01M1K126X21HG521AGWS8W1TEP`.

## A2 · THE CONTEXT PUBLISH — bakes DONE, publish is PER-LAYER ⚠ SUPERSEDES §4

- **All 49/49 regions are staged in R2. Zero failures.** The last three (riyadh/jeddah/abudhabi)
  had failed on a gate treating an 8 KB `trees.pmtiles` as "effectively empty" — in desert fabric
  that is the HONEST bake. Fixed in `f75659e7` (**§DESERT-LAYER-HONESTY**): sparse layers
  (trees/parks/water/rail) below the 50 KB floor now WARN and keep the PMTiles-magic check;
  buildings/roads keep the hard floor (a region without those IS a broken bake).
- **Publish attempt #1 (run #2, 14:03) FAILED — the operational lesson:** it verified all 49 sets
  x 7 layers by sha256, then died in tile-join with
  `sqlite3 images insert failed: database or disk is full` -> `tile-join failed for buildings
  (exit 116)` -> exit 3. **A whole-world 7-layer merge does not fit on a GitHub runner.**
- **THE FIX IS THE MECHANISM THE WORKFLOW ALREADY HAD:** `context-merge-publish.yml` takes a
  `layer` input; a layer-scoped merge downloads only that layer's staged bytes; and decisively the
  publish is `aws s3 sync ... --include '*.pmtiles'` **with NO `--delete`**, whose own comment
  reads *"a layer-scoped publish must not remove the other layers."* So **publish ONE LAYER PER
  RUN**. Run #3 (buildings, `expect=all`) dispatched 19:19 is the live attempt.
- **Remaining sequence:** buildings publishes -> publish the other layers (roads, water, parks,
  landuse, rail, trees — far smaller, groupable) -> **only then** bump `CONTEXT_TILESET_VERSION`
  `L660a` -> `L661a` in `apps/editor/src/ui/geospatial/contextTiles.ts` (never on dispatch — the
  L659a scar) -> deploy -> verify `https://app.pryzm.so/api/context-tiles/tileset-manifest.json`
  returns 200 (that manifest arms the no-loss gate for every future incremental publish) and that
  a French village shows footprints > 0 in the `§CTX-PMTILES-READER` line.
- Watcher: `<scratchpad>/watch-publish.sh` (grep-based). An earlier node-parsing poller crashed on
  an empty API response — do not reintroduce a naive `JSON.parse` in a poller.

## A3 · Four jurisdiction dossiers (founder-forwarded research, captured verbatim + audited)

- **FR France** — `docs/04-reference/jurisdictions/fr/FR-DATA-REACHABILITY-RESEARCH.md` +
  `FR-DATA-GAP-AUDIT.md`. Verdict: **no missing data — one missing pipeline plus four bounded
  derivations.** Already aligned: the rule-STATE architecture is our `FrSlice`/`EnvelopeRefusal`;
  datum-as-rule is ADR-0377; the RNU/PAU refusals ship by name. Missing: **frontage computation**
  (most load-bearing — setbacks and H/2 depend on it), SRU XML consumption (zero today), RGE ALTI
  *profiles* (we sample points only), 38.02 emprise + 40.02 volumetry polygons, and the .97/.98
  qualitative subtypes are untyped in code. **Correction to adopt:** "France has no D1" is wrong in
  4 shipped docs — COS is dead, but surface-de-plancher floor-area rules can be live.
- **NL Netherlands** — `.../nl/NL-ENVELOPE-MASTER-PROMPT.md` + `NL-DATA-GAP-AUDIT.md`. The live leg
  is the **legacy PDOK Ruimtelijke-plannen WMS**, not DSO v8. **#1 unlock: file the free DSO API
  key form** (a form, not procurement — unblocks M4, M6 and the modern leg). Also missing: overlay
  subtraction (dubbelbestemming), `as_of_date` temporal selection, dakhelling/nokhoogte/inhoud,
  the F1-vs-F2 split. **Honest gap found:** the drawn NL prism's Z_bottom is the local ground plane
  — no peil, no NAP — and it does not say so; that silence is the leg's one doctrine violation.
- **DK Denmark** — `.../dk/DK-ENVELOPE-MASTER-PROMPT.md` + `DK-DATA-GAP-AUDIT.md` (the master
  prompt arrived TRUNCATED mid-Part-10 at "claimant/benefic"; recorded as such, tail not invented).
  Matrikel is on the current entity WFS (legacy already migrated off) but not the GraphQL target;
  **`tillagtosh` is read nowhere and `iomfangreg` appears only in a diagnostic string** — a
  byggefelt flag that declares "the structured fields do not fully represent the regulation" is
  consumed as if they do. That is ranked #2, a live never-overstate hole. Strongest convergence:
  `bebygpctaf` denominator resolution is exactly C63. BBR/EBR unwired; roughly 25 of the master's
  31 source categories have zero coverage. Also found: `sourceRegistry/dk.ts` still calls the
  Matriklen gate "MitID unobtainable" while the proxy documents the free API-key path — reconcile.
- **AU NSW** — lane died on the Fable credit exhaustion mid-Step-2. **RELAUNCH OWED.** It had
  confirmed the au-nsw proxy leg exists and that **zero ePlanning consumption exists in
  `packages/`**. Its Phase 0 (M1 layer census across ~190 Local Provisions layers, M2 CADID fill,
  M3 precedence census) is unrun and is the decisive NSW measurement.

## A4 · PT Portugal parcel accuracy — founder-reported, diagnosed, half-fixed

**Class (a): fallback-presented-as-parcel, on top of a genuine DATA WALL.** Live-reproduced:
central Lisbon, central Porto AND a rural Evora point all return `numberMatched: 0` from the DGT
SNIC WFS — **the entire Porto city bbox holds 0 parcels**; greater-Lisbon's 2,078 hits are all
Amadora (the SiNErGIC pilot). **Not a CRS bug** (a control probe at a known-good point returns 7
real parcels through the identical query shape). So an urban PT click gets the **OSM building
outline** in the parcel slot. Better-channel probes: DGT OGC API `cadastro` collection (same
incomplete dataset, Lisbon 0); **BUPi RGG is LIVE** (3,546,427 polygons, CC BY 4.0, daily — the
"WFS removed" reporting is stale) but rustico/misto voluntary only and 0 at every tested point;
Lisboa open data has no parcel dataset; Informacao Predial Simplificada is textual by construction.
**Verdict: no keyless urban parcel-geometry service exists for Portugal.** Fixed server-side: the
`pt` leg now carries a cited `coverageNote` on every `empty` outcome (and only `empty`) plus an
`X-Cadastre-Coverage` header — 52/52 proxy tests green. **OWED (shared UI, described precisely in
the lane doc):** `WfsParcelProvider` discards `outcome`/`coverageNote`; the parcel card should
render it under the footprint banner; the map chip's "select its real cadastral parcel" text
over-promises in un-covered PT. **ISSUE-LOG L-12897 (OPEN, P2).**

## A5 · Component editor — the founder's actual ask is NOT yet built

Screenshot 2026-09-03: "New Component" shows *"This definition cannot be evaluated (no-solids)"*.
That refusal is **correct behaviour** (a fresh definition has one parameter and zero geometry) but
it is a dead end. The founder wants a **visual family editor**: create shapes/volumes, plus plan /
section / elevation views. Today we have parameters, types, chat-authored formulas, a live 3D
*preview*, placement/swap, marketplace — a *parametric* editor, not a *geometry* editor.
**LANE U8-VISUAL-FAMILY-EDITOR** (relaunched on Opus after the Fable credit death): add-shape via
the sanctioned family-migrations op path; a 4-viewport layout (3D + plan + 2 elevations) on the
shared U5 preview rig (no second GL context, no rAF — P3); New Component seeds one parametric box
while the no-solids refusal survives for genuinely empty definitions.

## A6 · New strategic lane: the Residential Design Orchestrator

The founder's 23-section product spec (guide-the-human, parcel -> law -> massing -> requirements ->
relationship graph -> room envelopes -> BIM, one living model, never present a study as a permit)
is captured to `docs/01-strategy/STR-RESIDENTIAL-DESIGN-ORCHESTRATOR.md`. **LANE RESI-ORCHESTRATOR**
is running; its core job is a capability inventory for each of the 23 sections
(EXISTS-AND-WIRED / EXISTS-BUT-UNWIRED / PARTIAL / ABSENT) — much of it is already built
(solar-analysis, RoomGraphService, TypologyPipeline, the residential generators, the rate book,
ai-host, the Edit Profile interaction that section 12 wants reused) and the risk is rebuilding it.
Output: `docs/03-execution/plans/RESI-ORCHESTRATOR-PLAN.md` plus the smallest end-to-end vertical
slice that lets the founder feel the whole idea on a real parcel.

## A7 · MODEL TRANSITION NOTE (Fable -> Opus, ~20:00)

Fable 5 exhausted its credits mid-session; **two agents died with `HTTP 429 rate_limit`**
(U8-visual-editor, NSW-envelope). Both were relaunched from scratch on Opus — **nothing was written
by the dead runs**, so if a lane's findings file is absent, assume it never ran. Nothing in the
repo depends on which model produced it; every audit file carries its own provenance header.

## A8 · LANES LIVE AT THIS WRITING

| Lane | Purpose |
|---|---|
| **Buildings publish** (run #3) | the per-layer world publish — the one that ends "no context in France" |
| **U8-VISUAL-FAMILY-EDITOR** | geometry authoring + plan/section/elevation viewports |
| **RESI-ORCHESTRATOR** | capture + capability inventory + staged plan |
| *(owed)* **NSW relaunch** | capture + audit + run Phase 0 M1/M2/M3 live |

## A9 · COMMITS THIS SESSION (all pushed to `main`)

`ef682750` bake retry + per-region concurrency · `fab79894` run-name · `9826adec` perf x2 + 13
proxy legs · `1b3a143b` LU envelope pack · `53e47c48` handover · `71a9a90c` P3 gate fix ·
`414ebb3c` U5 component preview · `7dbb4054` boundary wave (6 countries + the LV containment fix) ·
`f75659e7` desert-layer honesty.

**Uncommitted on disk at handover:** the PT `coverageNote` server fix, the four jurisdiction
dossiers (FR/NL/DK docs), and whatever the live lanes produce. Commit them scoped, root tsc green.
