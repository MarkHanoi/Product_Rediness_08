# L-581 — second-opinion prompt (paste into a fresh Claude Code session in this repo)

**Purpose:** independently verify or DEMOLISH a proposed change to the most legally-sensitive
geometry in PRYZM. The prior session recommends shipping it. **Your job is to try to break that
recommendation, not to ratify it.**

⚠ **Calibration you should know before you start:** in the session that produced this, FOUR
confident hypotheses were stated and then killed by a later probe (a CORS failure invisible to every
non-browser tool; a "47% of buildings are being deleted" figure that was a centroid-matching
artefact; a layer-5 sweep that measured a different system by calling a leaf resolver instead of the
production tier chain; and a "mixed vs uniform setbacks" root cause that a matrix disproved). Assume
the reasoning below is wrong somewhere and go looking for it.

---

## Paste from here

I need an independent, adversarial review of a proposed geometry change in this repo. Do not accept
my framing — check it against the code and the data, and tell me where it fails.

### The subsystem

`packages/site-parcel-data/src/geometry/blockDerivedDepth.ts` implements PGM NNUU **Art. 242.2**, the
Barcelona *profunditat edificable*. The ordinance does not state a depth; it states how to derive
one: *"a figure similar to the block, equidistant from the street frontages, leaving at least 30% of
the block area as interior free space"*, capped at 30 m, floored at 11 m. The solver bisects for the
largest depth `d` whose remaining interior free area is ≥ 30% of the block.

`interiorFreeAt(d)` computes that free area by calling
`insetPolygonPerEdge(blockRing, classifications, {front: d, side: 0, rear: 0, unclassified: 0})` in
`geometry/insetPolygon.ts` — a hand-rolled per-edge offset that mitres offset supporting lines and,
when an inset segment reverses, DROPS that edge's line and re-mitres.

### The defect claimed (L-581)

1. `interiorFreeAt` returns `0` both when the courtyard is genuinely consumed AND when the offset
   FAILS (`res.degenerate ? 0 : area(...)`). The solver cannot tell those apart, so a geometry
   failure is published as a legal conclusion — either `binding: 'interior-ratio'` or
   `degenerate: true`, which the UI renders as *"Art. 242.2 cannot be satisfied on this block."*
2. The drop-and-remitre step cascades: dropping a line abandons that edge's constraint, neighbours
   mitre deeper, more reversals appear, and the ring drains below 3 lines. Measured on one real block
   at `front=5`: `side=5` → 48 verts, `side=4.9` → 40, `side=4` → 24, `side=2` → DEGENERATE. Art. 242
   is the worst case (`front: 29 m, side: 0`).

### The measurements to re-run (do not trust the numbers below)

- `scratchpad/probe-l576-layer6.mts` — layer-6 sweep, n=65 real Eixample manzanas.
  Claimed: sound **36.9%**, `min-floor` degenerate **61.5%**, not-contained 1.5%.
- `scratchpad/probe-l581-inset-collapse.mts` — depth ladder showing abrupt collapse, with a control
  block that falls smoothly.
- `scratchpad/probe-l581-which-gate.mts` — the setback matrix above.
- `scratchpad/probe-l581-halfplane.mts` — the candidate comparison. Claimed: half-plane solves
  **29/30**, miter **11/30**; where both succeed median Δdepth **0.00 m**, mean **+0.42 m**, range
  **−12.6 … +13.9 m**.

These hit live Catastro WFS, so they are slow and can fail on upstream errors. Re-run at least the
last one.

### The proposed fix

Replace the mitre-based `interiorFreeAt` — **for the Art. 242 depth solve only, not for general
envelope insets** — with erosion by **one inward half-plane per FRONT edge** (Sutherland–Hodgman
clipping of the block ring). Claimed properties: monotone in `d` by construction (the bisection
requires monotonicity and does not currently get it), cannot collapse spuriously (empty means
genuinely empty), and non-front edges keep the real block boundary.

### ⚠ What I most want you to attack

1. **Is half-plane intersection the right MODEL for Art. 242.2 at all?** The true set of points at
   distance ≥ d from a set of SEGMENTS has circular caps at segment endpoints; a half-plane is
   infinite and straight. Where does that differ materially on a real cadastral block, and is the
   difference in the conservative direction? Is a straight skeleton or a proper polygon-offset
   (Clipper-style) the only correct answer? Note: this repo has NO boolean-geometry dependency
   (verified: no `polygon-clipping`, `martinez`, `turf`, `polybooljs`, `@flatten-js`).
2. **The concavity limitation.** A half-plane from a CONCAVE front edge cuts away area far from
   itself. 1 block in 30 failed under half-plane where the mitre path succeeded. Is 3.3% the real
   rate, or an artefact of a sample that is almost all convex-ish Eixample illes? **Test a
   deliberately L-shaped or U-shaped block.**
3. **Is "median 0.00 m" a fair summary of a ±13 m range?** I argue the outliers are cases where the
   MITRE path was self-refuting — it reported 47–89% free area after eroding 30 m from every frontage
   of a ~14,000 m² block, which I claim is physically impossible. **Check that claim independently.**
   If it is wrong, my whole argument collapses.
4. **Sample validity.** n=30/65, Eixample-weighted, selected as the blocks that had already cleared
   depth AND height. Is that selection biased toward blocks where the mitre path works?
5. **The direction-of-error question.** The swap makes some reported depths LARGER (e.g. 14.3 m →
   27.1 m). Is there any reading under which the OLD smaller number was the defensible one and the
   new larger one over-states buildability?
6. **Is there a cheaper correct fix I missed?** e.g. clamping a reversed edge's line instead of
   dropping it; or detecting non-monotonicity in the bisection and refusing.

### Governing context (read before judging)

- `docs/02-decisions/contracts/` — C58 (zoning/envelope), especially §1.4 (no fabrication) and §1.11
  (a wrong SHAPE is a confident answer to a different question, not an imprecise answer to the right
  one). ADR-0271 (Art. 242.2), ADR-0270.
- `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` rows **L-529** (a previous inset collapse that
  floored the depth — same family), **L-462**, **L-525b**, **L-576 → L-582**.
- Standing rule: **legal fidelity outranks standardisation**; refusing with a cited reason beats
  fabricating.

### Deliver

A verdict of **SHIP / DON'T SHIP / SHIP WITH CHANGES**, with the specific evidence that decides it.
If you agree, say which of the six attacks above you actually tested and what you found — an
agreement that skipped the tests is worth nothing to me. If you disagree, show the block, the
numbers, and the reproduction.
