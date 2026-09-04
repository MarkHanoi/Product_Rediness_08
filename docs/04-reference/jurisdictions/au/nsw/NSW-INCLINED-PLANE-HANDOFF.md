# THE SHARED INCLINED-PLANE PRIMITIVE — WHO BUILT IT, AND THE ONE API GAP PT EXPOSES

> Lane **ENVELOPE-NSW** · 2026-09-04 · a **cross-lane handoff**, filed under `au/nsw` because that
> is this lane's owned path. It concerns `packages/site-parcel-data/src/geometry/inclinedTop.ts`,
> which **this lane did not write and has not modified.**

---

## 1 — Who built it: NOBODY IN THIS FLEET. It already existed.

`packages/site-parcel-data/src/geometry/inclinedTop.ts` was committed in **`ae6d9bed`**
*("feat(envelope/§IMPLEMENT-NOW): … two kernel primitives …")*, **before** ENVELOPE-NSW,
ENVELOPE-NLDK and the PT lane began. Verified: `git log -- <path>` returns that single commit, and
the working tree is clean at that path.

> ⛔ **DO NOT WRITE A SECOND ONE.** Both ENVELOPE-NSW and ENVELOPE-NLDK carry the instruction to
> build the shared plane operator. The correct execution of that instruction is to **consume this
> module**, because the thing the instruction asked for is already on disk, jurisdiction-agnostic,
> and tested (`__tests__/inclinedTop.test.ts`).
> ⭐ §GREP-FOR-THE-EXISTING-SOLVER-FIRST. This is the second time that lesson has paid in this
> subsystem.

Current consumers: `site-parcel-data/src/index.ts`, and this lane's `nswClauseRegistry.ts` /
`nswPortalLayers.ts` (which supply *parameters* to it and add no geometry).

The signature it publishes:

```ts
interface InclinedPlaneSpec {
  id: string;
  anchorA: Pt; anchorB: Pt;      // the origin LINE, caller-resolved
  baseHeight_m: number;           // height AT the line
  slopePerMeter: number;          // tan(angle); positive side = LEFT of A→B
}
// h(p) = max(0, min(flatCap, min_i plane_i(p)))
```

---

## 2 — Assessed against the three PT (RGEU art. 59) requirements

### ✅ Req 2 — neighbour-dependent origin: **ALREADY SATISFIED. No change needed.**

`anchorA` / `anchorB` are caller-supplied points and the module's own header states it *"knows
NOTHING about rule kinds, ordinances or countries"*. PT resolving the origin line from the
**opposing building's alignment**, NSW reading it off a mapped layer, and NL deriving it from a
mill are all the same call. The concern that *"if your signature assumes the origin line is
supplied by the source data, PT cannot use it"* does not arise — the signature already takes the
line as a resolved input.

### ⛔ Reqs 1 and 3 — they are **ONE** missing capability, not two

This is the finding worth carrying across lanes.

- **Req 1 — the 1.50 m downhill tolerance.** A one-sided constant added to the plane height.
- **Req 3 — the 15 m bounded run** on the narrower/lower street.

Both look like different features. **They are the same gap**, and the reason is one line of the
evaluator:

```ts
export function inclinedTopHeightAt(p: Pt, spec: InclinedTopSpec): number {
    let h = spec.flatCap_m ?? Number.POSITIVE_INFINITY;
    for (const plane of spec.planes) h = Math.min(h, affineAt(planeToAffine(plane), p.x, p.z));
    ...
}
```

**Every plane governs the entire footprint, and the minimum is taken over all of them
unconditionally.** So there is no way to say *"this plane governs only here"* — and consequently:

- The tolerance cannot be expressed as a second, higher plane over the downhill stretch. `min()`
  would pick the *lower* (untolerated) plane everywhere, so **the +1.50 m would never apply**. The
  call would compile, run, return a number, and silently ignore the tolerance — a **silent
  under-statement**, which is the safe-looking direction and therefore the kind nobody notices.
- The bounded run cannot be expressed at all: a 15 m relaxation along part of a facade needs a
  plane that stops governing after 15 m.

### The minimal additive fix — backwards-compatible, no existing consumer changes

```ts
interface InclinedPlaneSpec {
  // …unchanged…
  /**
   * Optional: this plane governs only where p projects onto [from_m, to_m] of A→B, measured in
   * metres along the line from A. Absent ⇒ governs everywhere (today's behaviour, unchanged).
   */
  readonly governsExtent?: { readonly from_m: number; readonly to_m: number } | null;
}
```

`inclinedTopHeightAt` then takes the min only over planes whose extent contains the projection of
`p`. **Absent extent ⇒ byte-identical behaviour**, so DK / DE / FR / ES / NL / NSW consumers are
untouched.

With that one field:
- **PT tolerance** = two planes on the same line, the downhill extent carrying `baseHeight_m + 1.50`.
- **PT bounded run** = a plane over `[0, 15]` at the other street's permitted height, and the
  base plane over `[15, L]`.

⚠ **The exact solve must move with it.** `solveInclinedTop`'s exactness rests on the lower
envelope of affine planes decomposing the footprint into cells bounded by half-planes. An extent
introduces two more half-planes per bounded plane (the projection bounds), which is still an
affine cell decomposition — **so exactness survives**, but the cell construction has to be
extended, not just the point evaluator. A caller that extends `inclinedTopHeightAt` alone and not
`solveInclinedTop` gets a correct drawn solid and a **wrong legal volume**.

---

## 3 — Does NSW need this? **No.**

NSW's planes are one-per-polygon: Building Height Plane classes A–E each carry a single
`CLASS_DESCRIPTION` (line height, angle, orientation) for the whole polygon, and Sun Plane
Protection is one plane per protected area. **The existing signature is sufficient for NSW today**,
which is precisely why this lane is *specifying* the extension rather than making it: the change
is needed by PT (and possibly NL), and the file is shared.

---

## 4 — The handoff

**Whoever owns `packages/site-parcel-data/src/geometry/` next — most likely ENVELOPE-NLDK or the
PT lane — should apply §2's additive field, extend `solveInclinedTop`'s cell decomposition with
it, and add a PT art. 59 fixture.** ENVELOPE-NSW has deliberately not touched the file: NSW does
not need the change, and two lanes editing one shared kernel concurrently is the collision this
handoff exists to avoid.

⚠ **Not plane parameters, recorded so they are not folded in by mistake:** PT art. 60 (minimum
10 m between facades carrying habitable-room openings) and art. 65 (minimum *pé-direito*, 2.40 m
residential / 3.00 m commercial — what makes a metre limit and a storey count **jointly** binding)
are separate constraints on separate axes. They compose with the plane; they are not arguments to
it. And RGEU's revocation is **decreed but deferred** (DL 108/2026 art. 8, amending art. 25 of
DL 10/2024) pending an unpublished diploma — so art. 59 is in force, and its status is to be
**verified by the PT lane, not transcribed from here.**
