# Parcel 3D-Site offset — investigation (2026-08-05)

**Symptom (founder screenshot):** in the 3D "Site" view, the built massing/parcel volume
(purple extruded shape) sits visibly offset from the selected parcel — overlapping a
**neighbouring** building's footprint rather than the drawn/selected plot. Barcelona, "Select
parcel" (cadastral click) flow. The founder later clarified: **this happens on some parcels,
not every parcel** — intermittent / parcel-specific-looking, not a universal misalignment.

**Verdict: root cause found. It is a NEW, DISTINCT bug — a race condition, not a recurrence of
the 9acd599d origin-ordering regression.** A narrow, tested guard has been implemented in the
working tree (not committed) for the orchestrator to review.

---

## 1. Is this the same bug as 9acd599d (site-origin-on-parcel-regression)?

**No — that fix is intact and unregressed.** Read in full:

- `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts` `commit()` (~line 2124–2218) still runs
  the exact contract sequence the 2026-07-28 fix requires: `origin = parcelFrameOrigin(vertices)`
  → `dispatchSiteLocation(ctx, {...origin...})` → `buildBoundaryFromLatLonRing(vertices, origin)`.
  The code even carries the original `§L-635` comment block explaining why, verbatim.
- It has since gained a **second, related, already-shipped fix** in the same function
  (`§L-536-THETA-RESET`, lines ~2159–2200): a parcel that squares to true north (θ = 0) now
  publishes θ = 0 explicitly, so a *previous* parcel's rotation cannot survive onto a fresh
  θ = 0 commit. This is a different defect (rotation, not translation) and it is also fixed.
- `useSelectedParcel()` (the actual handler behind "Use this parcel →", lines ~1223–1236) does
  **not** have its own commit path — it loads the picked ring into `vertices` and calls the
  exact same `commit()` the DRAW tool uses. One commit function, one origin-ordering rule, for
  both flows. Confirmed by reading the call chain, not assumed.
- `apps/editor/src/ui/residential-building/residentialFromBoundary.ts` (the "Generate residential
  building with AI" path the founder's screenshot shows) does **not** compute its own origin
  either — it reads `store.getParcelBoundary()` (already scene-XZ, already in the one committed
  frame) and, via `resolveBuildableFootprint`, the buildable-envelope inset ring. No second
  geocode, no second projection. Ruled out as a source of a NEW origin.

So the origin-ordering discipline the original fix established is sound and unregressed
everywhere it was checked. The symptom has a different mechanism.

## 2. The actual root cause: a stale async zoning response overwrites the live envelope

**File:** `apps/editor/src/ui/site/siteDispatch.ts`

The "purple volume" the founder is pointing at is not the parcel boundary (the dashed green
outline the 2D map and `§SITE-FRAME-PROBE` correctly distinguish) — it is the **buildable
envelope** (the setback-inset study volume), cached in a module-level global:

```ts
let _lastEnvelope: BuildableEnvelope | null = null;   // line ~596
```

`dispatchParcelBoundary()` (the function BOTH `commit()` paths call) does the following, in
order, on every parcel commit:

1. Writes the boundary to the store (line ~1295).
2. Synchronously computes + caches an **estimated** envelope for the just-committed ring
   (`computeAndCacheEstimatedEnvelope`, line ~1312) — correct, fast, always right for the
   CURRENT parcel.
3. Fires `applyZoning()` (line ~1321), which — for a Barcelona-metro point — calls
   `void applyBcnZoningThenFallback(ctx, boundary, lat, lon, estimated, municipality)`
   (line ~7104, **not awaited** — fire-and-forget by design, so the commit path itself stays
   synchronous).

`applyBcnZoningThenFallback` is a **chain of real network round-trips**, not one fetch:

```
await Promise.all([fetchQualificationAtPoint, catastroParcelProvider.fetchParcelAtPoint])   (line ~7124)
  → await fetchBlockForParcel(...)                                                          (line ~7455, manzana block)
  → await Promise.race([fetchContextRoads(...), 600ms timeout])                              (line ~7539, street frontage)
  → (synchronous alçada/street-width construction)
  → dispatchEnvelope(ctx, site.id, dispatched, 'muc-catastro')                                (line ~7891, THE WRITE)
```

Per the function's own comments this realistically takes on the order of **seconds** (the file
documents individual timing probes: block-fetch timing logs, a 600 ms roads deadline that is
itself described as a tax added to "the founder's logs... every run").

`dispatchEnvelope()` (the single write chokepoint, line ~8045 pre-fix) writes
**unconditionally**, keyed only by `siteId` — which does **not** change across a Redraw
(`dispatchClearParcelBoundary`, §L-384) or a freshly re-selected parcel; only
`site.parcel.boundary` does:

```ts
function dispatchEnvelope(ctx, siteId, envelope, jurisdictionRef) {
    _lastEnvelope = envelope;                 // clobbers whatever is there — no identity check
    ...
    siteUpdateZoning({ siteId, buildableRing: insetRing, ... }, ctx.store);  // persists it too
}
```

**There was no generation/commit-identity check anywhere in this chain** (verified: grepped the
whole file for `generation|epoch|AbortController|requestId|boundaryVersion` — zero matches before
this session's fix).

### The race, concretely

1. User selects + commits parcel **A** ("Use this parcel →"). The synchronous estimated envelope
   for A renders correctly. The BCN real-envelope chain for A starts in the background.
2. Before A's chain resolves (which can take seconds), the user **Redraws or re-selects a
   different parcel B** and commits it. B's own synchronous estimated envelope, and B's own BCN
   chain, both start correctly.
3. A's chain **finally resolves** and calls `dispatchEnvelope(ctx, site.id, envelopeForA, ...)` —
   with **no check that `site.id`'s currently-committed boundary is still A**. It overwrites
   `_lastEnvelope` (and the persisted `Parcel.buildableRing`/setbacks/height) with **A's**
   geometry, while B's boundary is the one now on screen.
4. The renderer reads the (now-stale) envelope via `resolveRenderableBuildableEnvelope()` /
   `getLastBuildableEnvelope()` and draws A's inset ring inside **B's** ENU frame (B's origin,
   since `dispatchSiteLocation` was updated to B's parcel at B's commit).

### Why this explains "sitting on the NEIGHBOURING footprint" specifically (not "hundreds of
metres away")

`parcelFrameOrigin` anchors every ring near its **own** first vertex (by design — see
`boundaryProjection.ts` and the 9acd599d fix). So parcel A's inset ring sits at small,
parcel-scale coordinates (tens of metres) relative to A's own origin. Rendered inside B's ENU
frame instead, it lands at roughly those same small coordinates **relative to B's origin** — a
displacement on the order of **one parcel width**, not the hundreds-of-metres/km slide the
original geocode-anchor bug produced. That is exactly "the purple volume sits on the plot next
door", and it is a qualitatively different (much smaller) offset than the original regression —
consistent with these being two different bugs, not one recurring.

### Why it looks parcel-specific / intermittent rather than universal

This is the founder's key clarifying signal, and it fits the race hypothesis precisely and
**rules out a deterministic per-parcel geometry explanation**:

- It does **not** depend on winding order, multi-polygon responses, UTM-zone edges, or a
  degenerate first vertex — none of those mechanisms were found in the code (checked
  `parcelFrameOrigin`, `buildBoundaryFromLatLonRing`; both are pure functions of the ring with no
  per-parcel branching that could silently misfire only "sometimes").
- It **does** depend purely on **timing**: whether the user commits a second parcel before the
  first parcel's multi-fetch BCN chain resolves. That is inherently non-deterministic — network
  latency varies, and so does how fast a person clicks "Use this parcel" a second time. Some
  parcels will "show" the bug (whichever one happens to be committed while a prior chain is
  still in flight) and most won't (the common case: one parcel committed, its chain resolves
  before the user does anything else) — which is exactly "only some parcels, not every parcel".
- This is the SAME *shape* of lesson the original 9acd599d regression already taught in this
  codebase (a stale value surviving a new selection) — but here the "stale value" is an **async
  response in flight**, not a **synchronously-read anchor**. Confirmed by tracing the exact
  await points in `applyBcnZoningThenFallback` (four real network operations, each a re-entry
  point where a second, faster-resolving commit could have already landed).

## 3. What was checked and ruled out

- **`SiteBoundaryMap2D.ts` `commit()` regressing the origin order** — read in full; unregressed.
- **`useSelectedParcel()` having a separate/one-off commit path** — it calls the same `commit()`.
- **The AI residential-generation step computing its own origin** — it doesn't; it reads the
  already-committed scene-XZ boundary/envelope.
- **Winding order / multi-polygon cadastral responses** — `parcelFrameOrigin` and
  `buildBoundaryFromLatLonRing` are pure, ring-shape-agnostic transforms; no branch exists that
  could behave differently for a reversed-winding or multi-part ring in a way that would produce
  an intermittent (not deterministic) symptom.
- **UTM-zone-boundary / projection edge cases** — the projection used
  (`latLonToSceneXZ` / equirectangular-about-origin, not UTM) has no zone boundary; Barcelona is
  nowhere near a discontinuity in it regardless.
- **A degenerate/duplicate/collinear first vertex** — would be a deterministic per-parcel defect
  (same parcel, same result every time); the founder's own correction ("only some parcels, not
  every parcel") argues against this, and no such guard/bug was found in `parcelFrameOrigin`.

## 4. Fix implemented (in the working tree, NOT committed)

Given the scale of `siteDispatch.ts` (~8,000 lines, ~90 call sites of the shared
`dispatchEnvelope` write chokepoint across every jurisdiction handler, each governed by its own
contract/citation discipline), a blanket fix touching all of them was judged **too large and too
risky to implement and hand over unreviewed in one pass** — it would not meet the "narrow,
well-understood" bar this investigation was scoped to. Instead, the fix targets the exact
function and city the founder hit:

**`apps/editor/src/ui/site/siteDispatch.ts`:**

1. New pure, exported, unit-tested comparison:
   `isZoningResponseStale(expectedPolygon, currentPolygon)` — value-based (not reference-based)
   equality check between the polygon an in-flight fetch was launched for and the polygon
   actually committed on the Site right now.
2. A ctx-aware wrapper, `bcnZoningStillCurrent(ctx, boundary, tag)`, used only inside
   `applyBcnZoningThenFallback`.
3. The guard is called at all three points in that function where a resumed `await` could be
   writing on behalf of a parcel that is no longer the committed one:
   - immediately after the initial `Promise.all` (MUC + Catastro) — the common case;
   - inside the shared `refuseConstructionIncomplete` closure — covers every refusal branch
     reached after the block/roads fetches;
   - immediately before the final `dispatchEnvelope(...)` call, after the block + roads +
     alçada-height chain (the longest window).
4. On a stale hit: logs a `§STALE-ASYNC-ZONING` warning naming the mechanism, and returns without
   writing — leaving whatever the CURRENTLY committed parcel's own envelope already is untouched.

**Test added:** `apps/editor/__tests__/staleAsyncZoningGuard.test.ts` — 6 cases against the pure
`isZoningResponseStale`, including the exact "different neighbouring parcel now committed ⇒
stale" scenario, a value-equality (not reference-equality) check, a vertex-count change, and a
sub-millimetre-vs-real-drift boundary case so the guard can't be too loose to catch the real
race. All 6 pass; the pre-existing `siteFrameOriginConsistency.test.ts` and
`buildableFootprint.test.ts` suites still pass unchanged (26 tests, confirming the original fix
and the envelope-selection logic are untouched by this change).

### What this fix does NOT cover (documented, not silently left)

The identical unconditional-write defect exists in principle in every OTHER async jurisdiction
handler that shares this shape — `applyDkZoningThenFallback` (Denmark), `applyMadridZoningThenFallback`,
and the BCN-metro siblings (`applyLHospitaletZoningThenFallback`, `applyBadalonaZoningThenFallback`,
`applySantBoiZoningThenFallback`, `applyCornellaZoningThenFallback`), all invoked the same
fire-and-forget way from `applyZoning()`. They were **not** patched in this pass — doing so
safely means touching ~7 more multi-hundred-line functions with their own citation/contract
discipline, which is exactly the scope this investigation was told to keep narrow. **Recommended
follow-up:** either replicate the same three-guard pattern in each of those functions, or —
better — do the structural fix once: thread a monotonically-incrementing "boundary commit epoch"
from `dispatchParcelBoundary`/`dispatchClearParcelBoundary` through `applyZoning` into every
per-jurisdiction handler, and check it at the single `dispatchEnvelope` chokepoint. That is the
correct long-term fix; it was not attempted here because it touches every jurisdiction handler
in the file and deserves its own reviewed, tested change.

## 5. What was NOT verified (honesty about the gap)

- **Not reproduced live.** This environment has no way to run the dev server with real
  `DATABASE_URL`/`CF_WORKER_URL`/etc. and click through an actual Barcelona parcel-select race
  against the live Catastro/MUC endpoints. The root cause rests on static tracing of the exact
  await points and the exact write chokepoint, not a captured `§SITE-FRAME-PROBE` console line
  from a live repro — the task's fallback ("if running the live app isn't feasible, at minimum
  trace the exact function call sequence with file:line citations") is what was done.
- **The `§SITE-FRAME-PROBE` line itself was read (CesiumViewport.ts ~4264–4361) and its own
  documented verdict table was used to corroborate the mechanism** ("TRANSLATION: offset ≫ plot
  size ⇒ ORIGIN mismatch" vs "offset ≈ the plot's own scale ⇒ fine" — a stale-envelope overwrite
  from a same-scale neighbouring parcel would print in the "fine" range for boundary-vs-origin
  even though the *envelope* itself is wrong, since the probe only checks the BOUNDARY, not the
  buildable envelope ring). This is itself a secondary finding: **the probe cannot currently
  detect this exact defect**, because it diagnoses the boundary's own frame, not envelope/
  boundary consistency. Flagged here for whoever picks up the follow-up work.
- **Real Barcelona fetch timing was not measured** (no network access in this environment) — the
  "seconds, not milliseconds" claim rests on the function's own inline comments/timing-log
  statements, not a fresh measurement.

## 6. Summary

| Question | Answer |
|---|---|
| Root cause found? | Yes |
| Same bug recurring, or new variant? | **New variant** — a stale async-response race in the zoning/envelope pipeline, distinct from the 9acd599d origin-ordering bug (which remains fixed) |
| Fix implemented? | Yes, narrow — guards added to the one function/city the founder hit (`applyBcnZoningThenFallback`), plus a pure unit-tested comparison |
| Verified? | Verified by static trace (exact await points, exact unconditional-write chokepoint) + 6 new unit tests + 26 pre-existing tests still green. NOT verified via a live browser repro (infeasible in this environment) |
| Committed? | No — left in the working tree for review |
| Follow-up needed? | Yes — the same defect shape exists in ~6 other async jurisdiction handlers in `siteDispatch.ts`; recommend a structural "commit epoch" fix at the shared `dispatchEnvelope` chokepoint |
