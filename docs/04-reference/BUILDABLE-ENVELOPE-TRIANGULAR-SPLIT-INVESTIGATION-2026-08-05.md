# Buildable-envelope triangular-split — investigation (2026-08-05)

**Symptom (founder screenshots):** a real Catastro-fetched parcel (many-vertex, irregular — 8–9
boundary edges, dimensions 14.1/17.1/11.5/11.5/8.9/4.1/11.9/1.6 m) for the founder's parents'
house — a genuinely square/rectangular real building — computes a Córdoba `UAD-1` (Unifamiliar
Adosada, Art. 13.9) buildable envelope that renders as a **triangular prism sitting next to a
separate rectangular slab**, not one clean quadrilateral. Founder: "the side is correct… front
correct… left correct" — most edges look right, but an extra split piece appears.

**Verdict: root cause found and fixed (in the working tree, not committed).** It is a real,
reproducible defect in `clipToDepthBand` (`packages/site-parcel-data/src/geometry/depthBandClip.ts`),
the half-plane clip UAD-1's `kind: 'alignment'` geometricRule uses for Art. 13.9.3.3's *profundidad
máxima edificable*. It is **not** the raw parcel-fetch/merge step, which was checked and is sound.

---

## 1. Is the raw parcel polygon itself wrong?

Checked, not assumed:

- `apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts` → same-origin `/api/catastro/parcel`
  → `server/parcelZoningProxy.js`. The flow is: OVC `Consulta_RCCOOR_Distancia` reverse-geocode
  (ranked candidates by distance) → containment-tested against each candidate's real WFS ring
  (`ovc.catastro.meh.es/INSPIRE/wfsCP.aspx`, `GetParcel` by REFCAT) → the FIRST candidate whose
  polygon actually **contains** the click wins (§L-641), not simply the nearest reference point.
  This is a deliberate, already-hardened design against "wrong neighbouring parcel" — verified by
  reading the full candidate-ranking + containment-test code path.
- **Live-verified independently** (not merely read): queried the real OVC/WFS endpoints directly
  for a representative Córdoba residential point (37.87907, -4.79146, "Calle Prevision" — the
  Canary-Islands-street-name area named in the task was not independently reachable by name, but a
  live Córdoba UAD/OA-typology point was used instead to validate the SAME provider code path).
  The reverse-geocode returned 9 ranked candidates all belonging to ONE real, coherent block (refcat
  prefix `2541` blocks + one `2540` block, all "CL PREVISION"/"CL JOSE MARIA VALDENEBRO"), and the
  nearest candidate's WFS geometry is a real 7-vertex ring whose **shoelace area (377.1 m²) matches
  the WFS's own published area (376 m²) to within 0.3%** — i.e. the fetched ring is geometrically
  self-consistent with the authoritative source, not a merged or mis-closed shape.
- **Conclusion on this axis: not reproduced as a bug.** A real Spanish cadastral parcel legitimately
  carrying 7–9 vertices (garden/driveway/pool boundaries folded into one legal parcel) is common and
  the fetch/containment code is sound. This does not rule out the founder's SPECIFIC parcel having a
  genuine fetch defect (a different geometry was not independently obtainable in this session — see
  §5), but the mechanism that would cause it (wrong-candidate selection, mis-closed ring, multi-
  polygon merge) was read in full and is not present.

## 2. The buildable-envelope computation: a real, reproduced bug

Confirmed the exact pipeline UAD-1 uses (`packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`,
current values, read directly — not paraphrased from the task):

```ts
setbacks: { front_m: 4, side_m: 0, rear_m: 5 },   // Art. 13.9.3.2 / adosada party-wall / 13.9.3.4
geometricRule: {
    kind: 'alignment', alignTo: 'street',
    alignmentOffset_m: 4, sideTreatment: 'party-wall',
    buildableDepth_m: 16,                          // Art. 13.9.3.3
},
```

`ZoningRulesEngine.ts`'s `alignment` branch composes exactly as documented:
`insetPolygonPerEdge(front=4, side=0/party-wall, rear=5)` → `clipToDepthBand(inset, alignedEdge, 16)`.

### The bug: `clipToDepthBand`'s single-pass Sutherland–Hodgman can bridge disjoint pieces into a self-intersecting ring

`depthBandClip.ts`'s docstring claimed (before this fix) "exact for any simple polygon, convex or
not" — **this is false whenever the subject ring crosses the clip line more than twice.** An
irregular, many-vertex cadastral inset (a notch/driveway reentrant near the front alignment — the
founder's parcel has several very short edges: 4.1 m, 1.6 m, suggestive of exactly this) can leave a
retained region (`ring ∩ {depth ≤ 16 m}`) that is genuinely **two disjoint pieces**. The old
single-pass S-H walk emitted both pieces' vertices as one list and joined the exit point of one
piece straight to the entry point of the next — a spurious "bridge" chord, because an *unbounded*
half-plane clip (unlike a bounded convex window) has no boundary segment to trace between an exit
and the next entry. That bridge makes the output ring **self-intersecting**.

**Reproduced with a probe** (a horseshoe/notched ring — a straight analogue of the founder's
notched parcel — clipped to a shallow depth band):

```
polygon: [(0,5),(0,0),(12,0),(12,5),(18,5),(18,0),(30,0),(30,5)]
SELF-INTERSECTS: true       (before fix)
area reported: 120          (should be 60 — two real, disjoint 60 m² rectangles)
```

A self-intersecting ring, triangulated/extruded downstream into a 3D volume, is exactly what
produces "a triangular sliver sitting next to/overlapping a separate rectangular slab" instead of
one clean quadrilateral — the reported symptom.

### The fix

Rewrote the half-plane clip as `clipHalfPlaneLoops` in `depthBandClip.ts`: walk the ring rotated to
start at an entry transition, opening a fresh loop on every entry and closing it on every exit —
this can only ever emit simple, disjoint loops, because there is no bridging step to get wrong. (An
first attempt patched the old single-pass output with a post-hoc self-intersection repair,
mirroring `insetPolygon.ts`'s `§INSET-LOOP-DECOMPOSE`; this was **discarded** because it is not
reliable here — a proper-crossing test does not catch the case where the bridge chord lands
*collinear* with a real edge (winding-dependent), caught by this session's own
winding-independence test before being fixed.) `DepthClipResult` still carries ONE ring (matching
`insetPolygon.ts`'s established convention for a genuine offset split), so a real split
under-reports total area — the conservative direction (C58 §1.4: never overstate).

**Verified after fix:**
```
polygon: [(18,5),(18,0),(30,0),(30,5)]
SELF-INTERSECTS: false
area reported: 60           (the larger of the two genuine 60 m² pieces)
```

## 3. Tests

Added to `packages/site-parcel-data/__tests__/depthBandClip.test.ts` (all in the working tree, not
committed):
- Returns a simple (non-self-intersecting) ring on the horseshoe/notched reproduction.
- Returns exactly ONE of the two disjoint pieces (60 m², the larger), not a phantom bridge (120 m²).
- No `NaN` coordinates on the split path.
- Deterministic (byte-identical) on the split path.
- **Regression:** the existing rectangle and L-shaped (single-component, concave) acceptance tests
  are byte-unaffected.
- **Winding-independence** on the split path — this is the test that caught the first (discarded)
  fix attempt's gap.

**Full package suite run after the fix: 152 files, 3148 tests, all passing** (was 3141 before the 7
new tests; zero regressions).

## 4. OA-1 / OA-2 "always degenerate" — a SEPARATE question, resolved: genuine infeasibility, not a bug

The coordinator raised a second, unrelated report: Córdoba `OA-1`/`OA-2` (Ordenación Abierta, Art.
13.6) return a degenerate/refusal envelope, and this blocks "Generate residential building with AI"
end-to-end for these codes. Checked independently:

- **OA-1/OA-2 do NOT use `clipToDepthBand`/`kind:'alignment'` at all** — they declare only
  `setbacks: { front_m: null|0, side_m: 10.5, rear_m: 10.5 }` (current pack values, read directly).
  `front_m: null` resolves to `frontV = 0` in `ZoningRulesEngine.ts` (`front.value ?? 0`), which is
  the semantically correct behaviour for "align to street", not a bug.
- **Live-fetched the real parcel** at the coordinates given (37.87907, -4.79146): OVC reverse-geocode
  → nearest candidate refcat `2541602UG4924S` ("CL PREVISION 22", 0 m), WFS geometry → a real
  7-vertex ring, shoelace area 377 m² (matches the WFS's own published 376 m² area). Converted to a
  local metric plane; edge lengths: **18.10, 11.76, 8.99, 18.19, 5.64, 9.33, 5.74 m.**
- **Ran `insetPolygonPerEdge` directly against this real ring** with OA's setbacks (side=rear=10.5 m)
  for **every possible choice of which edge is "front"** (7 permutations): **all 7 returned
  `degenerate: true`.** Then swept the setback distance on the same ring/classification: 3 m → 179
  m² buildable, 5 m → 84.5 m², 7–9 m → ~0 m², **10 m and 10.5 m → degenerate**. The transition is
  smooth and monotonic — exactly what a correctly-functioning erosion does on a genuinely
  too-small polygon, with no discontinuity, no classification-dependence, and no sign of a
  hardcoded/off-by-one/sign error in the ½·height computation.
- **Conclusion: this is genuine ordinance-driven infeasibility, not a bug in the geometric-rule/
  inset engine.** OA's own rule (separación a linderos ≥ ½·altura, min 3 m → 10.5 m at the 21 m
  max height) is written for the *Ordenación Abierta* (open-block apartment) typology, which
  presupposes a large site with the building set well back from all non-street boundaries. A
  compact ~376 m², ~24×26 m urban infill parcel — however "square and regular" it looks in Cesium —
  is legally too small to host a full 21 m/PB+6 open-block building under that same rule, and the
  engine reports that honestly (`degenerate: true`) rather than fabricating a footprint. This
  reproduces on the FIRST parcel the coordinator asked about; whether the *zoning lookup* correctly
  assigned OA (vs. some other zone code) to this exact parcel is a separate question this
  investigation did not chase — it is outside the geometry-engine scope this task was given, and
  the geometry computation itself is confirmed sound.
- **A third parcel** (described by the founder as narrow/elongated, all of PAS-1/PAS-2/PAS-3/
  OA-1/OA-2/CTP-1 refusing) could not be investigated: **no coordinates or refcat were available**
  for it in this session. Given the pattern just confirmed on the OA-1/OA-2 case above — a smooth,
  monotonic, classification-independent degenerate transition driven by real parcel dimensions, not
  a discontinuity or bug — "a sufficiently narrow parcel fails every code that carries a
  substantial setback" is the expected, honest behaviour of a working engine, not evidence of one.
  But this is not independently confirmed for that specific parcel; flagged as an open item rather
  than resolved.

## 5. The reported "curved boomerang/hourglass" shape on a UAD-2 alignment envelope — NOT independently verified, and NOT touched

A further report described a UAD-2 (`buildableDepth_m: 18`, `alignmentOffset_m: 5` — matching the
pack's real UAD-2 values) envelope rendering as a smoothly curved boomerang/hourglass, not the
founder's expected rectilinear front-setback → house-depth → rear-patio bands. **This was not
reproduced or fixed in this session.** Two honest notes:

- Neither `depthBandClip.ts` (piecewise-linear only, confirmed by reading every code path — no
  trig, no arcs) nor the fix in this session can produce a curved edge. The one place in this
  codebase that **does** deliberately construct circular arcs is `insetPolygon.ts`'s
  `§INSET-ROUND-JOIN` — the hand-over between two adjacent setback edges with very different
  values (e.g. a front retranqueo next to a `side_m: 0` party wall, which is exactly UAD-2's
  shape) is rounded by design, per that file's own extensive documentation. A rounded corner at a
  party-wall/front-setback junction is the most plausible SOURCE of visible curvature in this
  pipeline, but this was not measured or confirmed against the actual screenshot in this session.
- This session did **not** open, read, or edit `packages/site-parcel-data/src/envelopeToMassing.ts`
  or `packages/site-parcel-data/src/providers/resolveCordobaManualAdminZone.ts` — both were observed
  modified in the working tree during this session (`git status`) but were not touched by this
  investigation. They are most likely being edited concurrently by another agent working the
  OA-1/OA-2 thread in the same shared working tree; this investigation did not inspect their
  content or intent, to avoid colliding with that work. **Do not attribute those two files' changes
  to this investigation's fix.**

## 6. Summary

| Question | Answer |
|---|---|
| Raw parcel fetch/merge bug? | Not found. Code path read in full + independently live-verified against real OVC/WFS responses; sound. |
| Setback-inset/depth-band bug? | **Yes — found, reproduced, and fixed** in `depthBandClip.ts` (`clipToDepthBand`/`clipBeyondDepthBand`'s shared `sutherlandHodgman`, now `clipHalfPlaneLoops`). |
| Fix committed? | **No** — left in the working tree for review (`packages/site-parcel-data/src/geometry/depthBandClip.ts`, `packages/site-parcel-data/__tests__/depthBandClip.test.ts`). |
| Verified? | Probe reproduction of the exact failure mode (self-intersecting bridge, confirmed before/after); 7 new unit tests; full package suite 152 files / 3148 tests passing, zero regressions. Not verified via a live browser repro of the founder's exact parcel (infeasible in this environment — no dev server / DB). |
| OA-1/OA-2 degenerate = bug? | **No — genuine ordinance infeasibility**, confirmed with the real live-fetched parcel's dimensions and a monotonic, classification-independent setback sweep. |
| Third ("all zones refuse") parcel | Not independently verified — no coordinates available this session. |
| "Curved boomerang" UAD-2 report | Not reproduced or fixed this session; most plausible source flagged (`insetPolygon.ts` round-join arcs) but unconfirmed. `envelopeToMassing.ts`/`resolveCordobaManualAdminZone.ts` changes observed in the tree were NOT made by this investigation. |
