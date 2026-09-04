# NL MOLENBIOTOOP — A FOURTH REQUIREMENT ON THE SHARED PLANE PRIMITIVE

> **Lane** ENVELOPE-NLDK · 2026-09-04
> **This is an ADDENDUM, not a rival.** The authority on the shared inclined-plane primitive is
> [`au/nsw/NSW-INCLINED-PLANE-HANDOFF.md`](../au/nsw/NSW-INCLINED-PLANE-HANDOFF.md) (lane
> ENVELOPE-NSW, same day). **Read that first.** Everything it says is agreed and not restated here.

---

## 1 · Who built the primitive: **neither lane. It predates both.**

`packages/site-parcel-data/src/geometry/inclinedTop.ts` was already on disk, already pure, already
exact (closed-form ∫∫ over lower-envelope cells), and already consumed by the NSW rulepacks. Its
own header names DK *skrå højdegrænseplan*, DE *Abstandsflächen*, FR *couronnement*, ES *coronación*
and **NL `dakhelling`** as the family it serves. `nswClauseRegistry.ts` says it "predates both this
lane" independently.

**Both lanes were instructed to build it; the correct execution was to consume it. Neither wrote a
second one.** ENVELOPE-NLDK did not build a plane primitive and did not need to.

---

## 2 · The one thing the NSW note does not cover: **the molenbiotoop is RADIAL**

NSW's note analyses three PT/NSW requirements — the 1.50 m downhill tolerance, caller-resolved
origin geometry, and the 15 m bounded run — and proposes an optional `extent: [from_m, to_m]` on
`InclinedPlaneSpec` so a plane can govern only part of its origin line. That proposal is sound and
covers all three.

**It does not cover NL's, because NL's is not a line.**

| jurisdiction | the plane's origin | shape |
|---|---|---|
| DK skrå højdegrænseplan | a parcel boundary edge | line-anchored |
| DE Abstandsflächen | a boundary edge | line-anchored |
| PT RGEU art. 59 | the **opposing building's** alignment | line-anchored |
| NSW Building Height Plane | a mapped layer geometry | line-anchored |
| **NL molenbiotoop** | **the windmill — a POINT** | **radial (a cone)** |

A molenbiotoop limits height as a function of **radial distance from the mill**: beyond the inner
protected radius, `h(p) ≤ |p − mill| / n + c·z` (with *n* the landscape factor and *z* the mill's
stage height). `|p − mill|` is **not affine in p**, so it is not an `InclinedPlaneSpec`, and
`min` over any finite set of planes cannot equal it.

**Phase 0 measured `molenbiotoop` in 18.2 % of Dutch plan texts — roughly one plan in five.** This
is not an exotic case.

---

## 3 · The resolution: **no primitive change is needed for NL. It is an ADAPTER concern.**

The cone limit `f(p) = |p − mill| / n + k` is a **convex** function of `p`. The primitive computes
`h(p) = min_i plane_i(p)`, which is **concave** (a min of affine functions). A concave function
cannot equal a convex one — but that asymmetry runs in the *safe* direction:

> For a convex `f`, every tangent plane lies **below** `f`. So a fan of planes tangent to the cone,
> min'd together, is **≤ the true molenbiotoop limit everywhere**, with equality only along the
> tangency rays.

**A tangent-plane fan therefore UNDERSTATES the permitted height. It can never overstate it.**

That is exactly the L-581 / C58 §1.4 doctrine — every departure from the exact object biased
inward — applied to a curved surface. The approximation error is bounded and shrinks with the
number of tangent rays, and it is one-sided by construction, so it is reportable ("this envelope
understates by at most X cm near the sector chords") rather than merely tolerated.

**Consequence: NL needs an `nlMolenbiotoop.ts` adapter that resolves the cone into tangent
`InclinedPlaneSpec`s. It needs no new geometry primitive, and it must not get one.**

### 3.1 · Why NSW's `extent` proposal helps here too

A tangent fan is most accurate when each tangent plane governs only its own angular sector rather
than the whole footprint. NSW's proposed `extent: [from_m, to_m]` along `A→B` is a *linear*
restriction, not an angular one — so it does not directly express a sector. But the two compose:
each tangent plane's origin line can be laid along the sector's chord and extent-bounded to that
chord, which is the same partition expressed in the primitive's own vocabulary.

**⚠ If the `extent` field is added, the exactness argument must be re-checked, not assumed.** The
volume integral is exact because the lower envelope of *globally applicable* affine planes
decomposes the footprint into half-plane-bounded cells. NSW's note already states that extents add
two half-planes per bounded plane and remain polygonal — that reasoning is the load-bearing part
and should carry a test, because "still exact" is precisely the kind of claim that rots silently.

---

## 4 · What ENVELOPE-NLDK did NOT build, stated plainly

`nlMolenbiotoop.ts` was **not built this lane.** Phase 0, the peil resolver (§7.1) and the roof
determinacy solver (§7.4 / M5 — the product-shape finding) consumed the budget, and M5 ranked
higher because it changes what the product *is*, not only what one overlay does.

The design above is the handoff: **tangent fan, inward-biased, adapter-side, no new primitive.**
