# Height-suggestion no-fire + OA-2 sliver — investigation (2026-08-06)

Founder-reported, live-tested against `pryzm.fly.dev`. Real parcel used throughout:
Catastro `2947201UG4924N`, AV MEDINA AZAHARA 7, Córdoba — 782–784 m², 14-vertex ring
(fetched live from the Sede Catastro INSPIRE WFS for this investigation; the exact ring is
recorded below for reproducibility).

---

## Issue 1 — nearby-height suggestion didn't fire (then "sometimes" did / "felt like a separate panel")

**Root cause found: YES, for the "sometimes fires" / "feels inconsistent" report. Real bug, fixed.**
**Root cause for the ORIGINAL "never fires on this exact parcel" report: NOT fully pinned — partial, with the most likely explanation identified and one genuine (non-bug) contributing factor confirmed.**

### 1a. Is 80 m too small a radius for this address?

No — checked directly. Live Overpass query `way["building"](around:80, 37.8848, -4.7873)`
(the geocoded AV Medina Azahara address) returns 25 building footprints within 80 m, of which
3 carry real (non-fabricated) height-bearing tags: an 8-storey (`building:levels=8`) building, a
2-storey, and a 1-storey. So the radius is **not** categorically too small here — real samples do
exist inside it. (A wider 150 m query returns 61 footprints, 17 with level tags — more data exists
further out, but 80 m is not empty.)

### 1b. Is honest provenance-exclusion the blocker (correct behaviour, not a bug)?

**Partially, and worth flagging even though it isn't literally what stopped the suggestion.**
88% of buildings within 80 m (22 of 25) carry no `height`/`building:levels` tag at all, so under
`suggestZoneFromNearbyHeights`'s honesty rule (`REAL_HEIGHT_PROVENANCE` excludes `'assumed'`) they
are correctly dropped. That leaves only 3 real samples, and — because OSM mappers disproportionately
tag *small* structures (kiosks, garages) while leaving large apartment blocks as bare `building=yes` —
the median of those 3 samples is dragged toward the low end (levels 1, 2, 8 → median 2, i.e. a
low-rise suggestion), not toward the visually-dominant ~20 m buildings the founder observed. This is
not a bug in the module (it never fabricates a number), but it is a real limitation worth recording:
**sparse, size-biased OSM tagging can make an honest median look like "no real data," or point to the
wrong end of the neighbourhood's actual height range, even when the mechanism works exactly as
designed.** Not fixed — this is a data-quality/aggregation limitation of the OSM-derived source, not
a code defect in scope for this investigation.

### 1c. Wiring / integration bug — CONFIRMED AND FIXED

The coordinator relayed a further founder observation: the suggestion "does fire sometimes," not
never, and it can look like a *separate/inconsistent panel instance* rather than the same "Manual
zone entry (admin)" panel behaving consistently.

**Panel singleton — confirmed genuinely one instance.** `ManualAdminZonePanel.ts` holds `_panel` as
module-level state; `openManualAdminZonePanelIfAdmin` only calls `_build()` when `!_panel`, otherwise
re-shows the same element. All entry points — the auto-open in `GISAreaLayout.ts`'s
`pryzmEnterSiteView`/`pryzmShowFormaView`, the inline "🛠️ Set zone manually" button in the coverage-gap
Buildable Envelope card, and `GISRailPanel.ts`'s button — call the SAME exported
`openManualAdminZonePanelIfAdmin` on the SAME ES module, so there is exactly one DOM panel. This part
of the founder's hypothesis does not hold: there is no second panel instance anywhere in the
codebase.

**The real defect: a stale-write race in `_refreshSiteScopedState`.** Every open/re-open computes a
`key = "${lat.toFixed(5)},${lon.toFixed(5)}"`, and if it differs from the last-seen
`_suggestionQueryKey`, kicks off a fresh `await suggestZoneFromNearbyHeights(...)` (an Overpass round
trip, which this codebase's own extensive comments document as frequently slow/rate-limited/flaky).
The bug: once that `await` resolved, the code applied the result (`_suggestion = suggestion;
_zoneSelect.value = suggestion.suggestedCode; ...`) unconditionally — with **no check that the panel
was still looking at the same parcel it started the fetch for**. If the admin switched to a different
parcel (new site location → new `key`, which itself starts a second, faster fetch) while the FIRST
parcel's slow fetch was still in flight, the first fetch's late result would land afterward and
silently overwrite the dropdown/label with a suggestion for a parcel that is no longer the active
one. That is exactly the reported symptom: the same singleton panel visibly flips state on its own,
for no action the admin took, which reads as "a separate/inconsistent panel."

**Fix applied** (`apps/editor/src/ui/site/ManualAdminZonePanel.ts`, `_refreshSiteScopedState`):
capture the request's own key (`requestKey`) before the `await`, and after it resolves, discard the
result if `_suggestionQueryKey !== requestKey` (a newer request has since taken over). Tagged
`§NEARBY-HEIGHT-STALE-SUGGESTION-FIX (2026-08-06)`.

**Verified:**
- New regression test added:
  `apps/editor/__tests__/manualAdminZonePanelScopeAndSuggestion.test.ts` →
  *"does not let a slow suggestion fetch for an abandoned parcel overwrite a newer parcel already
  checked (stale-write race)"*. Simulates a slow Overpass response for an old parcel (deliberately
  held open) and a fast empty response for a newer parcel reached before the old one resolves;
  asserts the panel keeps reflecting the newer parcel's state after the old fetch finally resolves.
- Confirmed the test is a genuine regression guard: temporarily disabled the staleness check → test
  failed (`expected 'PAS-1' to be ''`) → restored the fix → test passes.
- Full existing suite for this panel (5 tests) plus the touched geometry/dispatch suites (see Issue 2)
  all still pass: 11 files / 82 tests green.

**What remains uncertain for the ORIGINAL "never fired on this exact parcel" report specifically:**
no live browser session was available to reproduce the exact sequence of opens/navigations the
founder performed on `pryzm.fly.dev` that day, so it cannot be said with certainty which of (a) a
genuinely empty/degraded Overpass response at that moment, (b) the median-drag-to-low-rise effect in
§1b making the result look like "nothing happened" if the admin expected a ~20 m suggestion, or (c)
this stale-write race (which could also manifest as the CORRECT suggestion for an abandoned parcel
being silently discarded by a later, faster empty-result parcel switch, i.e. the reverse direction of
the bug) was the dominant cause on that specific occasion. All three are real, and (c) is now fixed;
(a)/(b) are not code defects.

---

## Issue 2 — OA-2 produces a 6.9 m² sliver on a 782–784 m² parcel

**Root cause found: YES. Genuine engine bug, confirmed, fixed — AND a compounding genuine ordinance
constraint that the fix does not (and should not) eliminate.**

### Setup verified

- OA-2's real setbacks (`packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`, current
  values, re-read directly from the file): `{ front_m: 0, side_m: 10.5, rear_m: 10.5 }`
  (front 0 = "aligned to vial", Art. 13.6.3.2; side/rear 10.5 = ½·21 m height, Art. 13.6.3.3).
  **OA-1 and OA-2 carry NO `geometricRule`** (no `alignment`/`explicit-area` entry) — unlike
  UAD/CTP-1/MC/PTC, so the buildable footprint for OA-2 is produced by the plain per-edge setback
  inset alone (`insetPolygonPerEdge`, `packages/site-parcel-data/src/geometry/insetPolygon.ts`).
  `depthBandClip.ts`'s `§DEPTHBAND-SPLIT` fix from earlier the same day is therefore **not on this
  code path at all** for OA-1/OA-2 — that fix and today's OA-2 sliver are two different mechanisms
  entirely.
- The real Catastro ring for `2947201UG4924N` (14 vertices, EPSG:4326, fetched live from the Sede
  Catastro INSPIRE WFS `GetParcel` stored query, area returned as 782 m²) was projected to local
  scene-XZ metres (equirectangular, matching `latLonToSceneXZ`'s own method) and fed directly through
  the REAL `insetPolygonPerEdge` (imported and run via `tsx`, not reimplemented/approximated).
  Projected ring area: 784.1 m² — matches the published 782 m² closely, confirming the projection is
  faithful.

### Root cause: `classifyEdges` only tags ONE edge as front/rear, not the real multi-edge boundary

`apps/editor/src/ui/site/boundaryProjection.ts`'s `classifyEdges` — the function that produces the
`edgeClassifications` array `insetPolygonPerEdge` consumes — picks exactly the single edge whose
outward normal points most toward −Z as `'front'` and the single most +Z edge as `'rear'`; every
other edge (however similar) falls back to `'side'`.

This parcel's real digitization splits its actual street-facing boundary across **two** consecutive,
near-collinear edges (outward normals ~0.3° apart), and its actual rear boundary likewise across
**two** consecutive edges — while every genuine corner on the same ring turns ~90°. Running the
REAL, unmodified `classifyEdges` against this ring:

```
normalZ per edge: [-0.042 -0.069 -0.054 -0.072 -0.078 -0.054 -0.086 -0.067 -0.997 -0.997 0.068 0.072 0.998 0.998]
frontIdx = 8   (the single most −Z-facing edge)
rearIdx  = 12  (the single most +Z-facing edge)
classification: side,side,side,side,side,side,side,side, FRONT, side,side,side, REAR, side
```

Edge 9 (immediately adjacent to edge 8, normal 0.3° apart) and edge 13 (immediately adjacent to
edge 12, normal 0.1° apart) are — geometrically — the SAME physical boundary as their extremal
neighbour, but were left `'side'` and therefore charged the FULL 10.5 m setback instead of the
ordinance's actual 0 m/10.5 m front/rear treatment. Feeding that real classification into the REAL
`insetPolygonPerEdge` with OA-2's real setbacks produces an inset of **9.74 m²** — the same order of
magnitude as the founder's reported 6.9 m² (the small remaining gap is consistent with the production
pipeline's exact projection origin/edge ordering differing slightly from this reconstruction, and/or
additional downstream steps such as a coverage/FAR cap applied after the raw setback inset, which
this investigation did not trace end-to-end).

### Fix applied

`classifyEdges` now grows each extremal edge into its full contiguous run of near-collinear
neighbours (30° adjacent-turn tolerance — an order of magnitude above float/digitization noise and
an order of magnitude below every genuine corner turn measured, front/rear runs bounded by a
same-edge overlap guard) before assigning `'front'`/`'rear'`. This is a **strict generalisation**:
on a clean rectangle every neighbour turns ~90°, so each run still degenerates to exactly one edge —
verified by a dedicated test. Tagged `§CLASSIFY-EDGES-RUN-GROUP (2026-08-06)`.

Re-running the REAL `classifyEdges` + `insetPolygonPerEdge` after the fix on the same ring:
```
classification: side×8, FRONT,FRONT, side,side, REAR,REAR
inset area: 18.31 m²  (vs. 9.74 m² before — roughly 2×)
```

**Verified:**
- New test file `apps/editor/__tests__/classifyEdgesRunGrouping.test.ts`: pins the real ring's area,
  asserts both boundaries now group ≥2 CONSECUTIVE edges each (never scattered indices), and asserts
  a clean rectangle is completely unaffected (1 front + 1 rear + 2 side, exactly as before).
- Confirmed the new test is a genuine regression guard: temporarily forced single-edge assignment
  (disabling the fix) → the grouping test failed (`expected 1 to be >= 2`) → restored the fix → all
  tests pass.
- No existing test pins a specific front/rear/side assignment beyond "one of the four valid strings,
  one entry per edge" — confirmed by reading `rectBoundary.test.ts`, `parcelBoundaryCommit.test.ts`,
  `ellipseBoundary.test.ts`, `circleBoundary.test.ts` — so widening the classification cannot break
  any documented existing expectation.
- Ran the full set of touched/adjacent suites together: `classifyEdgesRunGrouping`, `rectBoundary`,
  `parcelBoundaryCommit`, `ellipseBoundary`, `circleBoundary`, `siteFrameOriginConsistency`,
  `staleAsyncZoningGuard`, `cordobaSiteDispatch`, `cordobaTracedZoneSiteDispatch`,
  `cordobaTracedZoneVerifiedSiteDispatch`, `manualAdminZonePanelScopeAndSuggestion` — **11 files,
  82 tests, all pass.**
- `classifyEdges` is used by every jurisdiction's boundary commit (not Córdoba-specific), so this was
  treated as a wide-blast-radius change and checked accordingly — no rule-pack numeric value, no
  `*_VERIFIED` flag, and no other file was touched.

### Is 18.31 m² (or the founder's reported 6.9 m²) "the answer," or is more still wrong?

**Both a real bug AND a real, separate, non-bug constraint are present — the fix does not make this
parcel produce a large, sensible footprint, and it should not.**

The parcel's own true dimensions (measured from the real ring, independent of any classifier): the
street frontage run is ≈ 22 m wide; the side edges connecting front to rear run ≈ 33–35 m deep. OA-2's
side setback (10.5 m) applies to BOTH of the ~33 m side edges, eating up to 21 m of the parcel's
**22 m width** — independent of how front/rear get classified. That is the dominant reason the result
stays small (18.31 m², not the "substantially larger, front-aligned-plus-rear-patio" footprint the
founder expected) even after the classification bug is fixed: **this specific parcel is genuinely
too narrow, perpendicular to its own street frontage, for OA-2's real combined 10.5 m + 10.5 m side
setback** — the same class of finding as the earlier "OA doesn't fit a 376 m² infill lot" result
(memory: `bulk-vs-query-endpoint-false-refusals` / OA precedent). This is NOT a bug and is not
touched: OA-2's 10.5 m setback is a real, cited ordinance number (Art. 13.6.3.3, ½·21 m height, min
3 m) and this parcel's ~22 m frontage width is a real, cadastral-sourced dimension — the two are
genuinely close to incompatible on THIS lot, regardless of edge classification.

**Summary for issue 2:** the reported 6.9 m² was NOT the mathematically-correct application of OA-2's
real numbers to this parcel's real shape — roughly half of it (9.74 → 18.31 m², ~2×) was an engine
classification defect, now fixed. The REMAINING smallness, even after the fix, IS the mathematically
expected (if severe) result of applying OA-2's real 10.5 m side setbacks to a parcel whose frontage
width (~22 m) barely exceeds the 21 m the ordinance demands be given up on that axis alone — genuine
infeasibility, not a bug, and left unchanged per this investigation's constraints.

---

## Files touched

- `apps/editor/src/ui/site/ManualAdminZonePanel.ts` — stale-write race fix (`_refreshSiteScopedState`).
- `apps/editor/__tests__/manualAdminZonePanelScopeAndSuggestion.test.ts` — added regression test for
  the stale-write race.
- `apps/editor/src/ui/site/boundaryProjection.ts` — `classifyEdges` run-grouping fix.
- `apps/editor/__tests__/classifyEdgesRunGrouping.test.ts` — new test file, regression + rectangle
  no-op coverage.

No rule-pack numeric value, no `*_VERIFIED` flag, and nothing outside the above four files was
changed. Nothing has been committed — left in the working tree for review.
