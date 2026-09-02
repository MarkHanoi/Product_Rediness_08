# LANE NL-HOLES — L-12896 closed: bouwvlak courtyard holes + extra parts forwarded to the engine seat

**Date:** 2026-09-02 · **Subject:** ISSUE-LOG L-12896 (matrix-west finding D3) · **Disposition:** FIXED red-first, both caveat siblings shipped, permanent gate arm added · **Commit:** none (per lane brief — orchestrator owns the commit).

## The defect

`extractOuterRing` (`packages/site-parcel-data/src/providers/resolveNlBestemmingsplan.ts`, old
:363–380) reduced the bouwvlak GeoJSON to `coords[0]` (Polygon) / `coords[0][0]` (MultiPolygon):
the outer ring of the FIRST part only. Interior rings (courtyards — a published "do not build
here", `explicitArea.ts` §MULTI-PART-EXPLICIT-AREA) and further parts were dropped, while the
engine already carried both via `explicitAreaFootprintParts` (`ZoningRulesEngine.ts:96/:821`).
A Dutch bouwvlak with an inner courtyard therefore drew buildable area OVER the courtyard on a
LIVE, SIGNED route (`NL_BESTEMMINGSPLAN_CERTIFIED` ON) — the L-616 overstate direction. The
extra-part drop merely understated. The proxy was NOT at fault:
`server/jurisdiction/nlBestemmingsplanProxy.js:249` forwards the PDOK feature `geometry`
verbatim (rings and MultiPolygon parts included) — the drop was purely client-side.

## The fix (wiring to an existing seat — no engine code, schemas untouched)

1. **Provider** (`resolveNlBestemmingsplan.ts`): new `NlRingPart { outer, holes }` +
   `partsFromGeoJson()` (all parts, all interior rings; degenerate members skipped — a <3-vertex
   ring encloses no area). The ok-resolution's single-ring `ringLatLon` is **replaced** by
   `ringPartsLatLon: ReadonlyArray<NlRingPart>` — deliberately breaking, mirroring the
   `footprintRing`/`footprintParts` doctrine: a consumer that has not heard of parts fails loudly
   instead of silently clipping to one ring of N. `ringFromGeoJson` retained as a display-only
   wrapper (first part's outer) with a warning never to feed it to the clip. The zone
   (bestemmingsvlak) fallback gets the same parts treatment. OTel span now records
   `footprintParts` / `footprintHoles` counts.
2. **Dispatcher** (`apps/editor/src/ui/site/siteDispatch.ts`, NL route): projects every part and
   every hole through `toAuthoringFrame` and passes `explicitAreaFootprintParts` (mirrors the DK
   byggefelt route at :2733) instead of `explicitAreaFootprint`.
3. **Engine behaviour (unchanged, and it is the contract):** a hole that misses the parcel costs
   nothing (exact clip); a hole that BITES the parcel refuses (`hole-intersects-parcel`) because a
   single-ring `insetPolygon` cannot carve it and dropping it would overstate (C58 §1.4). The 2-D
   kernel deliberately has no boolean difference and `BuildableEnvelope` has no multi-ring
   footprint, so an area-exact carve of a biting hole is NOT achievable without new engine +
   frozen-schema work — the honest outcome today is "draw nothing over the courtyard", which the
   engine's own §MULTI-PART refusal text mandates. If the engine ever learns to carve, every test
   and the gate arm below already accept an 'ok' whose area excludes the hole.

## Red-first proof (verbatim)

Test: `packages/site-parcel-data/__tests__/nlBouwvlakHoles.test.ts` — synthetic fixture (honestly
labelled; no live PDOK courtyard body exists in the repo's probes — the §NL-NATIONWIDE proofs
recorded plan ids + vertex counts, not ring bodies) in the proxy's exact consolidated shape:
100 × 100 m outer (10,000 m²), 30 × 30 m courtyard (900 m²), honest ceiling 9,100 m².

RED (before the fix, 4 failed | 2 passed):

```
AssertionError: expected 9999.999999980033 to be less than or equal to 9100.000001   ← ARM B
AssertionError: Target cannot be null or undefined.                                  ← ARMs A/D/F (ringPartsLatLon absent)
```

**The overstated area: 900 m² — the full courtyard drawn buildable (10,000 m² granted where the
honest ceiling is 9,100 m²).** ARM C pins this magnitude permanently (the outer-only feed still
solves at 10,000 m², overstating by exactly the hole's area — the record of WHY forwarding matters).

GREEN (after): 6/6 in `nlBouwvlakHoles.test.ts` (provider parts ARM A; courtyard-bites honest
refusal ARM B; magnitude record ARM C; MultiPolygon part-2 preserved and clipped exactly to
1,600 m² ARM D — pre-fix this refused `no-overlap`; hole-away exact 2,000 m², no over-refusal
ARM E; zone-fallback holes ARM F).

Live-seat proof: `apps/editor/__tests__/nlSiteDispatch.test.ts` (fetch-stubbed real provider +
real dispatcher) grew two cases — courtyard-bites dispatches a refusal (status `none`, nothing
drawn), courtyard-away solves with both sibling caveats present. **9/9 passing.**

## Acceptance evidence

- Full package suite: `npx vitest run` in `packages/site-parcel-data` → **172 files passed,
  3,749 passed | 3 skipped**.
- `npx tsx tools/ga-gate/check-envelope-never-overstates.ts`:
  - **BEFORE** (pre-change tree): `[never-overstate] OK: 0 overstatement(s) across 181
    zone-solve(s) in 6 jurisdiction(s) + estimated-default + the planted self-test pack.` RC=0.
  - **AFTER** (with the new arm): `[never-overstate] OK: 0 overstatement(s) across 182
    zone-solve(s) in 6 jurisdiction(s) + estimated-default + the planted self-test pack.` RC=0
    (true process exit code, captured un-piped).
- **Permanent gate arm added** (cheap — section 2b of the gate): the courtyard fixture through
  the real engine via `explicitAreaFootprintParts`, finding minted if a solve grants more than
  outer-minus-hole; WITH its own teeth — the outer-only (pre-fix) feed must register as an
  overstatement under the same measure or the gate exits 2 UNPROVEN. The teeth caught a real
  subtlety during authoring: a bare pack record (empty `structuredFields`) refuses before the
  clip, so the arm mirrors the live dispatcher's record (structured height) — without the teeth
  the arm would have been silently vacuous.
- Scoped tsc: `packages/site-parcel-data` `tsc -p tsconfig.json --noEmit` → **RC=0**; root
  `tsc -p tsconfig.json --noEmit` (covers `apps/editor/src/ui` — the dispatcher) → **RC=0**.
- Falsification: provider sha256 recorded (`04b81702…bffccf`), scratch-revert applied (holes
  dropped + first-part-only, the pre-fix behaviour) → courtyard arm RED again:
  `expected 9999.999999980033 to be less than or equal to 9100.000001` (4 failed) → restored,
  sha256 **byte-identical** (`04b81702…bffccf` both sides). One deliberate docstring fix
  (`ringLatLon` → `ringPartsLatLon` in the `ringSource` comment) was applied AFTER the verified
  restore; final shipped sha256 `4d15a48e414692bc10676dee2537d02eda2b062543b952b89232fdeaf8fe13c5`.

## The two caveat siblings (both shipped — bounded seat edits)

- **D5 `goothoogte` read-and-dropped → §NL-GOOTHOOGTE-CARRY** (dispatcher NL route): when the
  plan publishes `maximum goothoogte`, the envelope now carries — mirroring the Paris
  couronnement phrasing ("the true envelope is at most this") — that the prism rises straight to
  the height cap without the eave-to-ridge roof shape, so above the goothoogte the true envelope
  is at most what is shown. Asserted at the live seat (nlSiteDispatch test).
- **D4 dubbelbestemming/paraplu pick-around → §NL-OVERLAY-CARRY** (dispatcher NL route): the RASE
  mandatory-carry caveat (`ruleformat.ts`: "An exception PRYZM cannot check must still be
  CARRIED") now rides every NL success: dubbelbestemmingen are not queried and paraplu plans are
  deliberately picked around, those instruments still bind, verify against the plan regels. STATIC
  by design — the exclusion is structural to the route (the proxy never queries the layer), so a
  per-parcel detection would require a proxy + wire-format change; that larger shape is NOT needed
  for honesty and was not taken.

## Residuals (named, not silently absorbed)

1. **Refusal-card wording on a biting courtyard:** the dispatcher's non-ok fall-through dispatches
   `nlNoPlanRefusal` ("no plan at point") even though a plan resolved and the true cause is the
   un-carvable courtyard. Direction-safe (draws nothing) but mis-descriptive; a dedicated
   `nlCourtyardRefusal` naming the hole would be a small follow-up. The engine's caveat does name
   it in the log line.
2. **Proxy first-feature pick:** `nlBestemmingsplanProxy.js:246–249` forwards only the FIRST
   bouwvlak feature with geometry; separate bouwvlak FEATURES beyond the first are still dropped
   server-side. That is an UNDERSTATE (a MultiPolygon within one feature is now fully preserved),
   distinct from D3 — logged here for a future proxy lane.
3. **Area-exact carve of a biting hole** needs multi-ring envelope output (frozen schema + engine
   + kernel difference op) — deliberately not attempted; the refusal is the doctrinally mandated
   outcome (`ZoningRulesEngine.ts` hole-intersects-parcel text).
4. **ISSUE-LOG row flip:** L-12896 is ready to move OPEN → CLOSED with this file as evidence;
   left to the orchestrator (shared-doc collision doctrine).

## Files touched

- `packages/site-parcel-data/src/providers/resolveNlBestemmingsplan.ts` — parts parser, breaking
  `ringPartsLatLon` resolution field, span attributes.
- `packages/site-parcel-data/src/index.ts` — export `partsFromGeoJson` + `NlRingPart`; header note.
- `apps/editor/src/ui/site/siteDispatch.ts` — NL route forwards `explicitAreaFootprintParts`;
  §NL-GOOTHOOGTE-CARRY + §NL-OVERLAY-CARRY caveats; header bullet.
- `packages/site-parcel-data/__tests__/nlBouwvlakHoles.test.ts` — NEW, the red-first courtyard suite.
- `packages/site-parcel-data/__tests__/resolveNlBestemmingsplan.test.ts` — 3 assertions to parts shape.
- `apps/editor/__tests__/nlSiteDispatch.test.ts` — 2 live-seat courtyard cases (9/9).
- `tools/ga-gate/check-envelope-never-overstates.ts` — section 2b courtyard arm + teeth
  (181 → 182 zone-solves).
