# Annex A — Sufficiency Legends (the founder's doc, captured verbatim)

> **Provenance:** pasted by the founder 2026-09-02 (v0.1, companion to
> `STR-ENVELOPE-PARAMETER-REFERENCE.md`), captured same-turn. Reconciliation against the
> as-built system: lane ENV-RECONCILE (dispatched the same hour).

**The minimum attribute combinations under which an envelope is computable**
Companion to the Envelope Parameter Reference · v0.1

---

## A.1 The three functional slots

Thirty-three attributes, but only **three functional slots**. An envelope is computable if and only if all three are filled. Everything else in the reference table either fills a slot, refines a filled slot, or carries provenance.

| Slot | What it is | Fails if absent |
|---|---|---|
| **Ω — Domain** | The parcel polygon in a projected CRS | No solve is possible at all |
| **P — Plan extent** | The permitted footprint, as a polygon | Volume has no base |
| **V — Vertical extent** | The permitted upper bound, as a surface | Volume has no top |

The insight that matters: **P and V are each satisfiable by several different attribute sets.** They are slots, not fields. A schema that hard-codes one filling method per slot will not generalise.

---

## A.2 Substitution table — the ways each slot can be filled

### Slot P — plan extent

| Path | Attributes required | Where found |
|---|---|---|
| **P1 — Explicit** | Buildable footprint polygon | NL *bouwvlak*; approved *gàlib*; any detail plan drawing the footprint |
| **P2 — Depth-driven** | Frontage typing + alignment + buildable depth | Aligned-to-street systems: Barcelona clau 12/13, most Mediterranean perimeter-block fabric |
| **P3 — Ratio-driven** | Coverage ratio + setbacks per edge | Free-standing systems: DE *GRZ*, ES clau 20a, most suburban zoning |
| **P4 — Setback-only** | Setbacks per edge, parcel fully bounded | Small plots where setbacks alone close the figure |
| **P5 — Shape-derived** | Shaping operator (Abstandsflächen, daylight plane) | P falls out of the shaping constraint; no separate footprint rule exists |

### Slot V — vertical extent

| Path | Attributes required | Notes |
|---|---|---|
| **V1 — Metric** | Max height (m) + datum | Simplest case |
| **V2 — Storey-driven** | Storey count + minimum floor-to-floor + datum | Yields a metric height |
| **V3 — Joint** | Max height **and** storeys + floor-to-floor + datum | Both bind; tighter governs. **The normal European case** |
| **V4 — Absolute** | Geodetic top level | Datum embedded; no A2 needed |
| **V5 — Contextual** | Adjacent building heights + matching rule | Requires A6; common in conservation and consolidated-front rules |
| **V6 — Shape-derived** | Shaping operator with a height cap | V and P produced by the same operator |

**A single slot may be filled by more than one path simultaneously.** When that happens the paths are constraints, not alternatives: compute each and take the intersection.

---

## A.3 The sufficiency legends

Each legend is a minimal sufficient set. If you hold the *required* column, you can emit an envelope. The *refines* column improves accuracy but is not a precondition.

| Legend | Ordering type | Required (minimum) | Refines | Typical territory |
|---|---|---|---|---|
| **L0 — Explicit volume** | Specific-volumetric | Ω + explicit volume geometry (+ datum if relative) | — | ES clau 18; any approved volumetric consent |
| **L1 — Footprint + height** | Explicit-geometry | Ω + P1 + V1 | Eaves height; roof-form rule | NL omgevingsplan (*bouwvlak* + *bouwhoogte*) |
| **L2 — Aligned to street** | Aligned-to-street | Ω + A3 frontage typing + A4 nominal width + P2 depth + V3 | Corner carry-around; chamfer; courtyard rule; consolidated front | ES clau 12/13; IT, PT, FR historic perimeter fabric |
| **L3 — Free-standing, ratios** | Free-standing | Ω + P3 (coverage + setbacks) + V3 | Distance-between-buildings; plot minimum | DE *WA/WR* with GRZ; ES clau 20a; suburban zoning generally |
| **L4 — Shaped** | Free-standing | Ω + boundary + V6/P5 shaping operator + height cap | Coverage ratio, where one also exists | DE *Abstandsflächen* Länder; Nordic solar-access; plane-based systems generally |
| **L5 — Terraced / row** | Terraced | Ω + A3 + party-line positions + P2 or P1 + V3 | Party-wall height matching | Row-house zoning across NW Europe |
| **L6 — Contextual** | Any | Ω + A6 adjacent heights + matching rule + P (any path) | Streetscape rhythm rules | Conservation areas; consolidated-front provisions |
| **L7 — Discretionary** | — | **No sufficient set exists** | — | England and Wales; any negotiated consent |

### On L7

England has no zoning envelope. Height and massing arise from discretionary consent tested against policy and daylight standards. There is no attribute combination that makes L7 computable, and pretending otherwise is the failure mode the whole honesty doctrine exists to prevent.

The correct output for L7 is a **range with a stated basis** — precedent-derived, policy-derived, or daylight-test-derived — explicitly typed as non-prescriptive. Never a single number.

---

## A.4 Fixed-point cases

Some legends are not a straight evaluation, because P depends on V and V depends on P.

| Case | Circularity | Resolution |
|---|---|---|
| **L4, Abstandsflächen** | Required boundary distance is a fraction of façade height; façade height is limited by the resulting footprint | Iterate to fixed point, or solve the closed form. Converges monotonically from the height cap downward |
| **L2, corner plots** | Height carried around the corner changes which frontage governs which run of façade | Segment the façade, solve per segment, reconcile at the step |
| **Quantum-bound cases** | Floor area exhausted before the volume is filled | Not circular, but under-determined — see A.6 |

Any implementation that evaluates parameters in a single pass will produce wrong answers in L4. Declare the iteration and its convergence tolerance.

---

## A.5 Degradation ladder

When a slot cannot be filled, the honest output is not always a total refusal. Emit the most that is defensible, with the missing dimension named.

| Missing | What can still be emitted | Label |
|---|---|---|
| **V only** | The permitted footprint as an unbounded prism | *Footprint derived; vertical extent unresolved* |
| **P only** | The height band, with no plan extent | *Vertical limit derived; footprint unresolved* |
| **A4 frontage width (in L2)** | Footprint from depth; height range across the plausible width bands | *Height indeterminate between PB+2 and PB+4 pending frontage width* |
| **A2 datum** | Relative volume, unplaced vertically | *Volume derived; absolute level unresolved* |
| **D1 floor-area limit** | Full volume, no yield | *Envelope derived; yield not computable* |
| **B5 override = true, document absent** | Nothing | *Cited refusal: derived plan [ref] governs, parameters unpublished* |
| **Ω parcel** | Nothing | Hard refusal |

This ladder is what turns a binary pass/fail into the tiered deliverable — a partial envelope with a named gap is a saleable product; a blank page is not.

---

## A.6 Under-determination

Filling all three slots gives a **maximum** envelope. It does not give a unique building.

When a quantum constraint (floor area, unit count) is reached before the volume is filled, many valid massings satisfy the same rules. Determinism therefore requires a **declared trimming policy**, applied identically every time:

- maximise frontage, or
- maximise full floors from the ground up, or
- maximise upper-floor area, or
- maximise a stated yield objective

State which. The policy is a product decision, not a legal one, and it must be labelled as such in the output — it is the one number in the pack that does not derive from an article.

---

## A.7 Decision procedure

```
1. Resolve Ω.                                  else → hard refusal
2. Resolve B5 override.
   if override and document absent             → cited refusal
3. Resolve C1 ordering type.                   else → cannot select legend
4. Select legend from C1 + available paths.
   if legend = L7                              → emit range, typed non-prescriptive
5. Fill P by first available path P1…P5.
6. Fill V by all available paths V1…V6; intersect.
7. if legend has fixed-point (L4)              → iterate to convergence
8. if P or V unfilled                          → degradation ladder (A.5)
9. Intersect volumetric constraints.
10. Subtract negative overlays (H).
11. Apply quantum constraints with declared trimming policy.
12. Attach provenance (F1–F8) to every value.
```

Step 4 is the one that generalises the system. Adding a country should mean adding a mapping from its ordering types to existing legends — not adding a branch to the engine. If a new jurisdiction requires a new legend, that is worth knowing explicitly; if it requires new engine code, the model was wrong.
