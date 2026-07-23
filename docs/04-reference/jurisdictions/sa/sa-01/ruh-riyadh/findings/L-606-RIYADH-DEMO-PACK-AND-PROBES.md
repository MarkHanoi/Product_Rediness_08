# L-606 — Riyadh demo: pack authoring, the solver decision, the streetWidth verdict, the floor/height probe

**2026-07-23.** Turning the Riyadh demo from SPEC to an implementation-ready pack + ISO docs. Source
of record for the footprint: [`../../../SAUDI-PRIMARY-DECISION-EXTRACT.md`](../../../SAUDI-PRIMARY-DECISION-EXTRACT.md).
Pack: `packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts`.

---

## 1 — The pack (authored)
`sa-ruh-riyadh`, `source: 'manual'`, `defaultConfidence: 'estimated-ruleset'`, two zones:
- **`sa-villa`** — ground coverage **0.75**; **`sa-apartment`** — **0.65**. `permittedUse: residential`.
- **setbacks `null`** (the width-dependent template) — resolved per-parcel by `resolveSaudiSetbacks`.
- **`maxHeight_m: null`, `maxFloors: null`** — a **field-level BOUNDED cited-null refusal** (C58 §1.13),
  `SA_HEIGHT_PLAN_DEFERRED_REF`. NOT a whole-envelope refusal — the footprint ring stays intact — and NOT
  bare: a national CEILING (villa ≤ 14 m / apt ≤ 23 m) is cited alongside via `SA_MAX_HEIGHT_M` /
  `SA_MAX_FLOORS_VILLA` (§4a). The exact value refuses; the cap is national.
- **`plotRatioFAR: null`** — the residential regime has no FAR (genuine absence).
- `fieldProvenance`: `ordinance-pdf` throughout (drives the "verify against the ordinance" affordance);
  pack tier `estimated-ruleset` (the clause-transcription + `VERIFICATION.md` sign-off gate is open).

Verified end-to-end against `computeBuildableEnvelope` (scratch vitest, since deleted so the suite
stays at 500): a 40×40 m villa plot at a 20 m street insets by 4/4/4, caps by 0.75 coverage, returns
`maxHeight_m = null`, `confidence = 'estimated-ruleset'`, `status = 'ok'`.

---

## 2 — 🔴 THE SOLVER DECISION — map onto the existing `setback` kind; do NOT add a new schema kind (for the demo)

**The question.** Saudi's setback is `max(streetWidth/5, floor)` — a distance that is a FUNCTION of a
runtime input (the street width), which the plain `setback` kind (a fixed classified distance) cannot
carry. Add a `street-proportional-setback` `GeometricRule` kind, or map it onto `setback`?

**Decision: map onto `setback` via a pure resolver. No new kind for the demo.** Because:
1. **The geometric OPERATION is unchanged** — a plain per-edge inset (`insetPolygonPerEdge`). Once the
   street width is known, `max(w/5, floor)` is a concrete `{front, side, rear}` triple, and the
   inset is identical to today's `kind: 'setback'`. The width-dependence is a VALUE concern, not a
   SHAPE concern.
2. **The precedent is exact.** `esBarcelona20aAillada` faced the same thing for its width-indexed
   FAR/height and explicitly rejected a new kind: *"the GEOMETRIC OPERATION is a plain inset."* The
   pattern is **null-in-pack + a resolver module + the dispatcher attaches the constructed value with
   its own derivation row.** That is `resolveSaudiSetbacks` + `saRiyadhResolvedPack` here.
3. **Saudi's model is single-width → triple, not per-edge.** The decision applies ONE street width to
   all three distances (with three floors). That is a scalar→triple mapping — a new per-edge kind
   would be over-engineering for it.
4. **Zero schema/engine/registry edits, ships today, worktree-isolated, keeps the suite green.** A new
   kind edits the shipped `GeometricRule.ts` (concurrent edit; needs an ADR + an engine switch arm).

**Honest injection.** The engine reads setbacks from `zone.setbacks` with the pack's per-field
provenance, and `geometricRule: 'setback'` is declarative-only (the inset uses the resolved
front/side/rear directly — confirmed in `ZoningRulesEngine.ts`). So `saRiyadhResolvedPack(width, class)`
fills the zone's `setbacks` with the resolved triple stamped `ordinance-pdf` (the resolved value IS an
ordinance construction — `published-structured` would mislabel it). The pack ships `geometricRule: null`
(= the legacy inset, i.e. `kind: 'setback'`).

**Why the resolver REFUSES a missing width** (not ship the floor): `setbacks: null` read as 0 would
publish the whole parcel (gross over-statement); the floor triple `{3,2,2}` as the operative value
would under-set the setback on any street ≥ 15 m (`w/5 > floor`) and over-state the footprint. Both
violate C58 §1.4. So width is REQUIRED; `resolveSaudiSetbacks` returns `needs-street-width`, mirroring
`resolve20aEdificabilitat`.

**When a NEW kind WOULD be right (production, per-edge width):** the SCHEMA SPEC diff sketch is in the
pack file (`StreetProportionalSetbackRuleSchema`). It belongs inside the engine when the width is read
per-edge from cadastral geometry (a corner plot fronts two streets), so the proportionality is solved
at compliance time, not pre-resolved by a UI caller. Additive, `requiresBlockRing → false`, no shipped
pack touched. Deferred — the demo does not need it and it edits a concurrent schema file.

---

## 3 — The `streetWidth.ts` port VERDICT (read before claiming)
- **Algorithm PORTS.** Saudi عرض الشارع = *"the horizontal distance between the property boundaries on
  the two sides of the street"* = frontage-to-frontage — exactly what `measureStreetWidths` computes
  (ray from our block edge across the carriageway to the opposing parcel ring). And the `÷5` setback
  uses the width DIRECTLY, so the `§AMPLADA-ART-238` min-vs-median subtlety (a metre = a storey in
  Barcelona) barely binds: a metre of width error moves the Saudi setback by 0.2 m, not a storey.
- **Inputs do NOT port on the gated path.** `measureStreetWidths` needs our block ring + opposing
  parcel rings — both from a parcel dataset. Barcelona has free Catastro; Saudi's equivalent
  (Balady `MapServer/28`) is geo-fenced. So on production it has no inputs.
- **Demo takes the width from the USER.** The user draws the plot and types/draws the street width;
  `resolveSaudiSetbacks` turns it into setbacks directly. The module is not needed for the demo.
- `blockDerivedDepth.ts` does **NOT** port — Saudi has no Art-242 free-space construction; it uses a
  flat coverage %. Feeding a Saudi parcel to it is a category error.

---

## 4 — 🔴 THE FLOOR/HEIGHT LIVE PROBE (the one municipal gap) — result: no NON-geofenced source

Probed for any non-geofenced Saudi source of per-zone floor/height. ⚠ Asserted on SHAPE, not on HTTP
status (WAF-200/geo-fence ≠ absent).

| Candidate | Result | Read |
|---|---|---|
| `trc.alriyadh.gov.sa` (Riyadh building-permit guide) | **ECONNREFUSED** (443) | Network/geo block from outside SA — DNS resolves, port refused. NOT absence. |
| `rcrc.gov.sa` design-guideline volumes (RCRC dev authority) | **WAF "The requested URL was rejected"** | HTTP-level rejection page. NOT absence. These are the DEVELOPMENT-AUTHORITY instruments that OVERRIDE the national decision (the R1 trap surface) — PDF guidelines, human-gated, not a per-parcel feed. |
| `istitlaa.ncc.gov.sa` (national consultation platform) | **ECONNREFUSED** (443) | Network/geo block. NOT absence. |
| Web-search secondary (Arab News, omrania, RCRC, MEED) | Riyadh height/density is governed **per arterial road (> 40 m) and per corridor** by ADA/RCRC; some contexts cite FAR 6.5:1 and plot-size→floor bands (≤ 5000 m² → up to 10 floors) — but these are **high-rise/commercial**, OUT of scope of the residential decision (> 23 m = high-rise, excluded). | Confirms the layering (municipal + authority override) the primary law states; NOT a clean per-residential-zone national default. |

**Conclusion.** The per-zone **EXACT** floor/height source EXISTS (municipal المخطط + RCRC/ADA corridor
guidelines that publish FAR/height and override the national decision), but every reachable candidate
is either geo-fenced (measured on shape) or a human-readable PDF guideline, not a machine-readable
per-parcel feed. So the EXACT height/floors correctly stay a **field-level cited-null refusal**. This is
`COULD NOT VERIFY` (a measured geo-fence), **not** `DEAD` (proof of absence). The §3.1 blocker in
`../NEXT.md` carries the exact in-SA resume step.

---

## 4a — 🔴 THE NATIONAL VERTICAL CEILING (the maximisation the probe missed on the first pass)

Re-reading the primary PDF for a NATIONAL height source (per the ceiling brief) found one — a numeric
national CEILING per class, distinct from the (municipal) EXACT value:

| Class | National vertical cap | Clause | Verbatim |
|---|---|---|---|
| **Villa** | height **≤ 14 m** | **§5-1-5 cl. 3** | «الحد الأقصى لارتفاع الفلل السكنية 14 متر … إلى منسوب سطح الملحق العلوي» |
| **Villa** | floors **≤ ground + 1 + upper annex** | **§3-1** | «بحد أقصى دورين وملحق علوي … وقبو» |
| **Apartment / comm / admin** | height **≤ 23 m** | **§3-2 / §3-3 / §3-4** | «لا يزيد ارتفاعها الكلي عن 23م أعلى سطح الأرض» |
| (boundary) | > 23 m ⇒ high-rise, OUT of scope | **§2 def + §1-1** | «الأبراج عالية الارتفاع: المباني التي يزيد ارتفاعها الكلي عن 23م» |

**⇒ The vertical extent is nationally BOUNDED, not absent.** The first pass recorded floors/height as
flatly "not national" and 23 m as "only a class boundary, not a cap"; both understated. The EXACT value
within the cap is municipal (§4 cl. 1), but the CAP is national and cited.

**Why it is NOT rendered as `maxHeight_m`.** It is a MAXIMUM, not a grant: the municipal plan may set
LOWER, so rendering 14 m/23 m would over-state below the cap (C58 §1.4). It is encoded as `SA_MAX_HEIGHT_M`
+ `SA_MAX_FLOORS_VILLA` and surfaced in `SA_HEIGHT_PLAN_DEFERRED_REF` as a **bounded** refusal — a cited
national upper bound beside the (refused) exact value.

**Effect on the stipulated ceiling.** Of the 6 governing envelope fields, **4 are fully national (66.7%,
the footprint) and the other 2 (height, floors) are nationally CEILINGED** — so no field is a total
unknown. The **villa** is nationally *maximised* (footprint + 14 m + G+1+annex, municipal can only cut),
so its national-maximum envelope is effectively complete; the **apartment** is national-footprint + a 23 m
cap, exact floors municipal. All of this is COUNTRY-WIDE (Section 4 binds all Amanas; §3/§5-1-5 are national).

## 4b — 🔴 CLAUSE-NUMBER TRANSCRIPTION (the SOURCES.md gate, machine half closed)

The primary PDF was re-fetched (momah.gov.sa, HTTP 200, 4.8 MB, 42 pp) and extracted with pypdf (Arabic
legible after digit transliteration). The per-field governing CLAUSE NUMBERS are now transcribed:

| Value | Clause |
|---|---|
| Villa ground coverage 0.75 | §4-1 cl. 1 |
| Villa upper-floor 0.75 / annex 0.70 | §4-1 cl. 2 / cl. 3 |
| Villa setbacks max(w/5,{3,2}) | §4-1 cl. 4 (front ≥ 6 m at w ≥ 30 m: §4-1 cl. 5) |
| Villa ground-floor build-in-setback ≤ 70% perimeter, ≤ 4.5 m | §4-1 cl. 8 |
| Villa parking 1 / 2 spaces (≤/> 400 m²) | §4-1 cl. 14 |
| Apartment ground coverage 0.65; upper 0.75 / annex 0.70 | §4-2 cl. 1 / cl. 2 / cl. 3 |
| Apartment setbacks (neighbour ≥ 3 m > 5 floors, ≥ 2 m ≤ 5 floors) | §4-2 cl. 4 |
| Apartment parking 1.5 / unit | §4-2 cl. 6 |
| Admin apartment coverage/setbacks | §4-3 cl. 1–4 |
| Classes (villa/apt/comm/admin) | §3-1 / §3-2 / §3-3 / §3-4 |
| Deferral of exact floors/height + setbacks to the approved plan | §4 cl. 1 |
| Development-authority override; commercial-street/special-area carve-outs | §1 cl. 2 / cl. 3 |
| Definitions (street width, setback, coverage, total height) | §2 |

These are now in every `ordinanceRef`, both `SOURCES.md` files, and both `VERIFICATION.md` files. **The
pack's remaining `structured`-tier gate is now ONLY the human `VERIFICATION.md` sign-off** (L-449) — the
machine transcription half is closed. Until a person signs, the honest ship tier stays `estimated-ruleset`.

---

## 5 — WIRING TODO (orchestrator) — summary
Full block (with exact code) is in `saRiyadhDemo.ts`. Three additive edits + one optional:
- **(A)** `index.ts` — export the pack surface (mirrors the 20a export block).
- **(B)** `registry.ts` — add a `JurisdictionRegistration` for `sa-ruh-riyadh` (needs a new
  `providers/riyadhBbox.ts`: `RIYADH_BBOX` + `isInRiyadh`, ~24.4–25.1 N / 46.4–47.1 E).
- **(C)** L5 demo dispatcher — class dropdown → `saRiyadhResolvedPack(width, class)` → build a
  `ZoningRecord` → `computeBuildableEnvelope`.
- **Optional schema** — add `'momrah'` to `ZoningPackSourceSchema` so `source` need not be `'manual'`
  (one-line enum; deferred — it edits a concurrent shipped schema file).

⚠ Constraints honoured: `registry.ts` / `index.ts` / shipped schema files NOT edited; the pack carries
the exact registry line + the schema diff sketch. No fabricated values. `estimated-ruleset` until the
SOURCES/VERIFICATION human gate closes.
