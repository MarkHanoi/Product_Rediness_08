# Córdoba — scoping Priority 3 (the digitization tool), 2026-08-05

> Scope-only note, per the founder's request. **No code, no UI, no schema change, no flag touched.**
> Responds to [`DIGITIZATION-ROADMAP-2026-08-05.md`](./DIGITIZATION-ROADMAP-2026-08-05.md)'s
> Priority 3 ("Build the digitization tooling"), grounded in the actual, measured cost of the one
> record added by hand this week — the "fourth pass" section of
> [`TRACED-ZONE-SERVICE-2026-08-05.md`](./TRACED-ZONE-SERVICE-2026-08-05.md) (`OA-1`, traced from
> `CUS27W.jpg`) — and in what `RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md` already proved,
> separately, about which parts of this problem are automatable. This document does not recommend
> building anything yet; it lays out what building it would mean, honestly, including the parts that
> are still speculative.

## 1. What the `OA-1` record actually cost, broken into its component steps

The fourth-pass note is the only artifact in this repo that records the true cost of adding **one**
traced-zone record end to end: **~218k tokens, 96 tool calls, ~34 minutes of agent work, for one
city block.** Reading that section closely, the work breaks into seven distinct steps. Sorted here
by how much of that cost each step plausibly carries, and whether it is inherently a per-block cost
or a per-sheet (i.e., reusable) cost:

| # | Step | Per-block or per-sheet? | Genuinely slow, or already provably automatable? |
|---|---|---|---|
| 1 | **Sheet selection** — confirm the target sheet isn't a duplicate/near-duplicate of one already covered by a live WFS, isn't a downscaled fake (the `CUS20W_v2.png` rejection), and actually covers land the pilot doesn't already serve (`isInCordoba` false, `isInCordobaMunicipality` true) | Per-sheet | Automatable in large part — dimension/hash comparison against the known 49-sheet corpus, and the `isInCordoba`/`isInCordobaMunicipality` check, are both mechanical once a sheet is chosen. Choosing *which* sheet to work on next (e.g. by scanning for undeveloped land) is closer to human judgment today. |
| 2 | **Georeferencing** — locate the sheet's own printed corner/grid-tick labels, fit a scale + rotation, cross-check two independent edges against each other, confirm the correct datum (ED50 vs ETRS89) | Per-sheet (the fitted transform, once computed, is reusable for every block later traced on that same sheet) | The **expensive-sounding part that is actually already proven automatable this project**, separately, in `RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md` §2.3–2.4: frame detection is a mechanical dark-pixel row/column profile maximum, the 49-sheet series is a regular grid so one calibrated anchor sheet + the published sheet-index + the datum shift georeferences the rest, and a from-scratch automated run on `CUS34W` landed within 1–4 px of the COACo answer with zero manual input. **This step should not need to be repeated by hand per block** if that pipeline is wired into a tool — it only needs to run once per sheet. |
| 3 | **Zone family** — sample the sheet's own legend swatch RGB and match it against the block's fill colour | Per-block (a sheet can carry several families) | Mechanical once a block region is selected: pick any interior pixel, read its RGB, nearest-match against the legend swatches read off the same sheet. This is scripting, not judgment — the risk this step guards against (the recorded Manzana-Cerrada-vs-Plurifamiliar-Aislada near-miss in `END-TO-END-PROOF-2026-08-04.md` §Stage 3) is a fully mechanical failure mode (misreading by eye), not a hard classification problem. |
| 4 | **Subzone digit** — read the printed numeral inside the block at high zoom | Per-block | **The one step every pass this week has independently converged on as staying human.** The digitization roadmap says this explicitly: "zone-identity classification from colour or OCR is not [automatable] — the subzone digit ... is not recoverable from the published raster by any method tested." Legend text confirms the digit maps directly to the ordinance subzone (second pass, `TRACED-ZONE-SERVICE-2026-08-05.md`), so once family + digit are both read, the zone code is fully determined — but getting the digit still requires a human eye at adequate zoom, because scan resolution (≈1 m/px on the sheets inspected) is frequently too coarse for OCR to resolve it reliably at all, let alone correctly. |
| 5 | **Boundary tracing** — line-fit each of the block's edges to the raster, take vertex intersections, visually confirm each on a crosshair overlay | Per-block | Partially automatable in principle (edge/line detection against a known-georeferenced raster is a standard CV operation) but **not proven this session** — every boundary in the store so far was fitted and confirmed by a human/agent looking at pixels, not by a tested detector. This is the step most worth prototyping before committing to a bigger tool (see §2 below). |
| 6 | **Independent verification** — cross-check the traced ring against the Spanish Catastro OVC (`Consulta_RCCOOR`), confirming points inside the ring return real parcels on the expected streets and points just outside return no reference | Per-block (queries a live public service, per point) | Mechanical and scriptable — it's a sequence of point queries against a public API and a pass/fail comparison, not a judgment call. This is exactly the kind of check a tool should run automatically and show the human as a green/red confirmation, rather than something the human types or draws. |
| 7 | **Writing the JSON record** — assembling `zoneCode`, `sourceSheet`, `tracedDate`, the full provenance sentence, and the `ring` array in the exact schema `resolveCordobaTracedZone.ts` expects | Per-block | Fully mechanical once steps 2–6 have produced their outputs — this is exactly what a "commit" button in a tool would do, with the provenance sentence templated from the other fields rather than hand-composed prose each time. |

**Reading this table honestly**: of the seven steps, only step 4 (the subzone digit) is something
every pass this week has independently found to resist automation. Step 2 (georeferencing) has
already been *proven* automatable, separately, on a different sheet, with a measured 1–4 px
residual — it is arguably the single most expensive-looking step in the fourth-pass narrative, and
the one with the most concrete existing evidence that a tool could remove it entirely from the
per-block cost. Steps 1, 3, 6, and 7 are mechanical and scriptable in principle even though nobody
has built the scripts. Step 5 (boundary tracing) is the one genuine "we don't actually know yet"
gap between what's proven and what a tool would need.

## 2. What could plausibly be pre-computed or automated ahead of time

Being explicit about the evidence tier for each claim:

**Already proven this project (not just plausible):**
- The sheet-to-UTM georeferencing transform is a **per-sheet, not per-block** cost, and is
  automatable via frame detection + the published sheet-index grid + a known datum shift
  (§2.3–2.4 of `RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md`). A tool built on top of this
  pipeline could georeference a new sheet once, automatically, the first time anyone opens it —
  every subsequent block traced on that sheet reuses the same transform for free.
- The legend-swatch-to-family match is mechanical (RGB nearest-match against swatches read off the
  same sheet's own legend panel) — proven correct in practice (it caught the real near-miss
  recorded in `END-TO-END-PROOF-2026-08-04.md`), just not yet wrapped in a reusable script.
- Independent verification against Catastro's `Consulta_RCCOOR` point-query service is a scriptable
  sequence of HTTP calls with a clear pass/fail rule (parcel found inside, no-reference outside) —
  proven as a manual process this week, not yet automated, but with nothing speculative left in it.

**Plausible, but genuinely untested this session — do not treat as proven:**
- **Boundary CANDIDATES from raster edge detection.** Standard computer-vision edge/line detection
  against a georeferenced raster crop is a reasonable thing to try, but no pass this week actually
  ran one against these sheets and measured how well it does. The sheets are ~1 m/px scans of a
  decades-old paper plan with variable ink density and skew (`CUS27W` alone was skewed ≈0.36°) —
  it is plausible that edge detection proposes a usable boundary a human only has to nudge, and
  equally plausible that the paper-scan noise defeats it the same way it already defeated OCR on
  the subzone digit. This should be prototyped cheaply (a script against 2–3 already-traced blocks,
  compared to the hand-fitted ring) before any UI is built around the assumption that it works.
- **Boundary CANDIDATES from Catastro's own parcel/block vector data, instead of the raster at
  all.** `RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md` §2.5 already used a bulk set of 3,461
  Catastro parcel boundaries (rasterised for a boundary-coincidence measurement) and separately, the
  `OA-1` record's own verification step used Catastro's point-query service and found the traced
  ring coincided with real cadastral block edges on all five sides. Both facts point at the same
  idea: cadastral parcel/block geometry is a second, independent, already-vectorised source of
  candidate boundaries that has **nothing to do with the PGOU raster's resolution problem** — it is
  a different dataset entirely, published by a different, national authority (Catastro, not
  Córdoba's GMU), and it does not carry zone identity (zone identity is still the human's job).
  Whether *bulk* cadastral parcel geometry is downloadable for Córdoba (rather than queried point by
  point, which is what's actually been done here) is **not established this session** — it's worth
  someone checking the Catastro INSPIRE/ATOM bulk-download services directly before assuming it. If
  it is downloadable, a tool's boundary step could become "here is the Catastro parcel that already
  exists at this point, confirm it's the right one" rather than "trace an edge from a raster,"
  which would be a materially smaller and safer human task than step 5 in the table above — but this
  is the single most valuable thing to verify before scoping the tool's tracing UI in detail.
- **Per-manzana batch georeferencing across the whole 49-sheet corpus.** Proven on one additional
  sheet (`CUS34W`) beyond the original anchor (`CUS41W`); not run against all 49. The `RASTER-
  PARCEL-ZONING-FEASIBILITY` doc frames this as strongly implied by the regular-grid structure, but
  "implied by one successful extra sheet" is a different evidence tier than "run and confirmed on
  49."

**Explicitly not automatable, per this week's evidence, and should not be re-litigated by the tool
design:** the subzone digit (step 4). Any tool design that assumes OCR will read this reliably is
building against evidence that already exists in this repo.

## 3. A concrete minimal workflow for a human operator

This is a sketch of the interaction, not an implementation plan. The goal is the founder's own
framing: turn "one full from-scratch agent investigation per block" into "a human confirms a
proposed boundary and types one digit, in a couple of minutes."

1. **Operator picks a sheet.** The tool shows a list of the 49 CUS sheets (or whichever subset is
   in scope), flagging which ones already have a cached georeferencing transform and which have
   never been opened. (Sheet de-duplication / fake-upscale detection — the `CUS20W_v2.png` check —
   runs automatically here, once, and warns the operator rather than silently trusting a new file.)
2. **Tool georeferences the sheet automatically**, the first time it's opened, using the proven
   frame-detection + sheet-index-grid + datum-shift pipeline. If the sheet is a genuinely new shape
   (not matching the regular grid), the tool flags that instead of guessing, and asks a human to
   supply or confirm two reference points before it proceeds. This step never repeats for a sheet
   already opened by someone else.
3. **Operator clicks a block/parcel on the georeferenced sheet crop.** If a candidate boundary
   source exists (raster edge detection and/or Catastro parcel geometry, per §2 above — whichever
   turns out to work), the tool proposes a polygon; the operator drags a vertex only if the proposal
   is visibly wrong, rather than drawing from scratch. If no candidate source is wired in yet, the
   operator draws the polygon directly on the crop (still faster than the current process, which
   line-fits and eyeballs five separate raster edges by hand).
4. **Tool auto-samples the legend swatch** under the clicked region and shows the operator its best
   family guess ("Ordenación Abierta — 92% RGB match") plus the actual swatch colour side by side,
   so the operator visually confirms rather than re-deriving the match themselves.
5. **Operator types the subzone digit** they read off the block label, at whatever zoom level the
   tool lets them dial in on that spot. This is the one input step this whole design keeps as
   irreducibly human, per §2's closing note.
6. **Tool cross-checks against Catastro automatically** — fires the same `Consulta_RCCOOR`-style
   point queries this week's manual process ran by hand (a few points inside the proposed ring, a
   few just outside) and shows the operator a pass/fail summary (e.g. "5/5 inside points found real
   parcels on 4 named streets; 5/5 outside points returned no reference") before the operator commits.
7. **Operator reviews a single confirm screen**: proposed `zoneCode`, source sheet, family-match
   confidence, Catastro cross-check result, and an auto-composed provenance sentence (templated from
   the fields above, in the house style already established in `cordobaTracedZones.json`, not
   free-typed). One click appends the record to the Derived Planning Layer store.
8. **Nothing in this flow flips `CORDOBA_TRACED_ZONES_VERIFIED`.** That remains a separate,
   deliberate founder/authorized-signer act, exactly as `TRACED-ZONE-SERVICE-2026-08-05.md` already
   specifies — the tool speeds up *authoring* records to the QA bar, it does not and should not
   auto-certify them.

Steps 2, 4, and 6 are the ones this document has evidence are genuinely automatable today. Step 3
is speculative and should be validated cheaply before committing to it as a UI affordance. Step 5
is the one human-judgment step this design deliberately keeps.

## 4. Rough effort/cost tiers — options, not numbers

No real time or dollar estimate is given here, honestly, because none exists yet — only a
description of plausible shapes the tool could take, from smallest to largest, and their tradeoffs.

- **Tier A — a script + a static viewer.** A command-line/notebook script that runs the proven
  georeferencing pipeline against a chosen sheet and renders the crop as a static image (or a
  Leaflet/OpenLayers page) with the fitted grid overlaid, plus a second small script that runs the
  Catastro point-check and prints pass/fail. The human still edits the JSON record by hand, and
  still traces boundaries by eye (unless a candidate-boundary experiment from §2 pans out, in which
  case the script overlays that too). *Tradeoff*: cheapest to build, closest to what's already been
  done manually this week, but still leaves boundary-tracing and record-writing as manual,
  copy-paste-prone steps — it mainly removes step-2's (georeferencing) and step-6's (Catastro
  check) cost, which per §1 may already be the largest chunk.
- **Tier B — a small purpose-built web tool (single page, no editor integration).** A dedicated
  page: pick a sheet, click a region, see the auto-family-match and a candidate boundary (if one
  exists), type the digit, see the Catastro cross-check run live, click confirm, record is appended
  to the JSON file (or a small backing store) with the provenance sentence auto-composed. This is
  the shape described in §3. *Tradeoff*: meaningfully more work than Tier A (needs a real UI, a
  render pipeline for the sheet crops, a write path to the data store, and some review-friendly
  history of who traced what) but is the first tier that actually delivers "a human confirms and
  types one digit" rather than "a human still runs several scripts by hand."
  This tier does not require deep integration with the main PRYZM editor (`apps/editor`) — it could
  be a standalone internal utility that only needs write access to
  `packages/site-parcel-data/src/providers/data/cordobaTracedZones.json` (or its eventual
  Priority-2 replacement store).
  Note also: nothing about this task requires that the tool be part of the editor's L0–L8 layer
  architecture at all — it's an internal, off-runtime authoring utility that *produces* data the
  runtime later reads, not a plugin/feature the layered dependency rule governs. Scoping it as a
  full editor plugin (Tier C below) would be over-engineering unless there's a separate reason to
  want it inside the product surface.
- **Tier C — a full editor plugin / integrated feature.** Builds the Priority-3 tool as a first-class
  part of `apps/editor` — with commandBus-mediated writes, its own OpenTelemetry spans per P8, a
  proper review/approval workflow UI for the QA methodology named (but not built) in
  `TRACED-ZONE-SERVICE-2026-08-05.md`'s "What still needs a human" section, and a home in the
  8-layer architecture. *Tradeoff*: the most durable and most reviewable long-term option, and the
  natural place to eventually host the QA sign-off workflow for `CORDOBA_TRACED_ZONES_VERIFIED` —
  but the most expensive to build, and premature if Priority 1 (the GMU data request) might make the
  whole tracing exercise moot, or if the store never grows past the "dozens" scale the existing
  linear-scan resolver already anticipates.

None of these tiers requires committing to city-scale volume up front — Tier A or B could be built,
used to add a handful more records, and only escalated to Tier C if the store's growth and the QA
workflow's real operational weight justify it.

## 5. How this interacts with the two other pending threads

**(a) The GMU vector-data request (Priority 1).** The letter (`GMU-TRANSPARENCY-REQUEST-DRAFT-
2026-08-04.md`) is drafted, strengthened with this week's evidence, but **not yet submitted** — it
requires the requester's own Cl@ve/Certificado Digital, a human action. If it succeeds and GMU
supplies real vector planning data (`.dgn`/`.dwg`/Shapefile/File Geodatabase/PostGIS/"any internal
GIS"), **most of the manual tracing problem this tool exists to speed up disappears** — zone
identity would come from an authoritative source instead of a human reading a printed digit off a
scan. Per the roadmap's own framing, Priority 3 is explicitly worth scoping "once Priority 1's
response is known," precisely because a successful response could make it "entirely unnecessary."
Building past Tier A/B before that response lands risks sunk investment in a tool whose entire
reason to exist (recovering zone identity a human has to read off a raster) could be mooted by one
successful records request.

**(b) The `ch/dwf_ch` vector-source investigation (currently running, separate from this task).**
This document does not have that investigation's findings — it was running concurrently, not
reviewed here. But the shape of the interaction is clear regardless of its outcome: if that
investigation finds genuinely extractable vector data (parcel or zoning geometry, in whatever format
`dwf`/`ch` turns out to denote), the tool's job changes from "trace a boundary from scratch and read
a digit off a raster" to "load the extracted vector, verify it against the same Catastro cross-check
already proven this week, and confirm/correct the zone attribute if one is present." That is a
smaller, safer, and more mechanical task than anything described in §3 above — closer to a
verification tool than a digitization tool. If that investigation instead finds nothing usable (the
data isn't really there, or isn't in a readable format), this document's Tier A/B/C analysis stands
unchanged. Either way: **do not commit engineering effort toward Tier B or C until that
investigation's result is known**, for the same reason as (a) — it changes what the tool needs to
do, not just how fast it does it.

## 6. What this document deliberately does not estimate

This document does not give a total block/parcel count for Córdoba, nor a total city-wide time or
cost figure, because no source measured in this repo establishes one — inventing either number here
would violate the same discipline `DIGITIZATION-ROADMAP-2026-08-05.md` itself asks for (no invented
floats, no synthetic confidence scores). The honest state is: **the total scope is unknown**, and
that unknown is itself worth naming as a distinct next step — a call to Córdoba's own cadastral/GIS
services (or the vectorised `coaco:hojas_cus`/`coaco:ordenanzas` layers already queried live this
week for the pilot's two districts) for a **manzana (city-block) count**, if such a layer exists and
is queryable the way `coaco:hojas_cus` already is, would turn "unknown scope" into a real number
without requiring anyone to guess. That is a small, separate, low-cost task in its own right, and
should probably happen before — or alongside — any decision to build past Tier A.
