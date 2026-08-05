# Córdoba — session status, 2026-08-05

> `CORDOBA_ENVELOPE_VERIFIED = true` — LIVE. Real numbers render today for a handful of zone
> families inside the 2-district COACo pilot (≈4.96 km²). Outside it: a cited refusal, never a
> fabricated estimate. Full arc of how the pilot got there:
> [`SESSION-SUMMARY-2026-08-04.md`](./SESSION-SUMMARY-2026-08-04.md),
> [`CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md).

## What this session actually did — a feasibility question, answered honestly, twice

The question: **can zoning outside the pilot be classified onto real cadastral parcels from the
raster CUS sheets, instead of hand-traced one parcel at a time?**

### 1. Feasibility study — [`RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md`](./RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md)

**Recommendation: APPROVE WITH LIMITATIONS.** Measured against real COACo vector ground truth +
real Catastro parcels across 5 sheets (no synthetic stand-ins anywhere): 89.8% pooled parcel
accuracy, IoU 0.808–0.98, boundary coincidence 4.2–7.2× chance rate over ~100 km of zone edge.
**But** some zone *types* are wrong at full confidence (`Uso Comercial` ~23% precision, `Uso
Industrial` <1%), and which types are trustworthy isn't fixed — one class that scored 100% on the
first sheet dropped to 86.3% on another, purely because a different, confusable zone type happened
to be present there. Confidence-based gating is *non-monotonic* — a stricter threshold sometimes
performs *worse*. Two incidental finds: the CUS sheets were being read in the wrong CRS in every
prior note (ED50/EPSG:23030, not ETRS89 — ~234 m error), and georeferencing is fully automatable
via COACo's own sheet-footprint layer.

### 2. Safe-subset classifier build — [`RASTER-CLASSIFIER-SAFE-SUBSET-IMPLEMENTATION-2026-08-05.md`](./RASTER-CLASSIFIER-SAFE-SUBSET-IMPLEMENTATION-2026-08-05.md)

Scoped to the 3 zone types the feasibility study found stable everywhere (`MC`, `OA`, `UAD`),
redirected mid-build toward an OCR-first design after visually confirming the CUS sheets print
bold text labels on each polygon.

**Both the OCR redirect and the original color-only plan were tested honestly, and both needed
real correction, not confirmation:**

- **OCR does not work here.** Tested with a real OCR engine across 6 sheets including hard cases:
  the printed labels are planning-instrument codes (PERI, PA, PP, SG…) and equipment-zone letters
  (E/S/D) — **not** ordenanza zone codes. The actual subzone marker inside an ordenanza polygon is
  a bare rotated numeral, undetected in every configuration tried, indistinguishable from map
  linework.
- **The color-only fallback had to shrink further than briefed.** `UAD` was dropped — its nearest
  confusable neighbour appears exactly once in the entire vectorised corpus and was never actually
  tested alongside it, the same untested-composition gap that already broke `CTP` in the
  feasibility study. Only `MC` and `OA` survive, each verified specifically *with* its hardest
  confusable neighbour present.
- **The decisive finding: even `MC`/`OA` cannot produce a number.** The CUS sheets only ever show
  the zone *family* — never the subzone digit that actually selects the real parameters (e.g. `OA-1`
  vs `OA-2` differ 1.4 vs 1.6 FAR; conflating `UAD-1`/`UAD-2` would overstate by 43%). The existing
  pack correctly has no family-level fallback. So the entire deliverable, even at its best, is a
  **better-worded refusal** (names the real zone family instead of speaking generically) — not a
  new computed envelope, contrary to this session's earlier expectation for `OA`/`UAD`.
- **Two independent reasons nothing shipped live regardless:** (1) the 453 real ground-truth
  parcels used to validate all sit *inside* the pilot bbox, which the dispatcher already routes
  through the live COACo path *before* this new resolver is ever reached — so it only ever runs
  where no ground truth exists to check it against; a signed gate couldn't honestly mean "verified".
  (2) georeferencing mis-detected the frame on 2 of 6 test sheets — caught inside the pilot by
  COACo's own data, uncaught outside it, where this resolver would actually run.

**Result: ships a real, tested code seam with the record store empty (`[]`) and the gate
untouched.** Verified independently (not just the agent's own claim): `site-parcel-data` 151 files
/ 3128 tests, `apps/editor`'s 5 Córdoba dispatch suites / 38 tests, root `tsc` clean, record store
confirmed `[]` by direct read. **Zero production behavior change, by design** — this is a
reviewable proof of what's real and what isn't, not a shipped capability.

## Where the missing subzone information actually lives (founder question, answered)

Even inside the *working* pilot, COACo's own live vector layer only names the zone **family**
(`OA`, `MC`…), never the subzone suffix — confirmed directly in `esCordobaPGOU2001.ts`'s own
documentation. The subzone digit comes from exactly two places today, neither reachable by a
raster classifier:
1. **Inside the pilot:** COACo's record links (`enlace`) to a separate document that states it.
2. **Outside the pilot (today's traced-zone path):** a human reads the tiny printed digit on the
   CUS sheet by eye — the exact number the OCR engine just tried and failed to detect
   automatically.

So the information exists on paper, but the only proven extraction method today is a human eye,
not an automatable field or a linked dataset. Automating that specific digit (small, rotated,
against busy linework) would be a separate, harder problem from what was attempted this session.

## Bigger architecture — explicitly deferred, not skipped

The founder's proposed full evidence-fusion design (OCR + color + neighbour-voting + block-
morphology + rule-plausibility + spatial graph optimisation + active learning + human-review-on-
high-entropy) is the right long-term direction — several of its own predictions (empirical
per-class-per-sheet confusion, OCR-first framing) were independently validated or tested this
session. It was deliberately not built in full this session — real, multi-week infrastructure, not
something to bolt onto an already-live gate in one pass. Revisit once there's a smaller, provable
win in production to build on.
