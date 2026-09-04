# NL — envelope completion status

> **Stamp** 2026-09-04 · **Source** lane ENVELOPE-NLDK primary measurement (Phase 0 M1–M6;
> commits `d0498f8b`, `8bbbf67c`, and code swept into `3b0afbb5` / `5d88c841`) · **Pattern**
> identical across all 16 jurisdiction dossiers.
>
> ⛔ **Every number here is MEASURED and names its method.** Where a figure was never measured the
> cell says `not-measured`. Read §1.1 before quoting any single percentage — **NL has no one
> completion number, and the two candidates differ by 3×.**
>
> **Command (all M-figures):** `nl-phase0-parcels.mjs --n=500 --seed=20260903`
> (+`--minTileParcels=15` for the urban arm) → `nl-phase0-reduce.mjs > nl-phase0-report.json`.
> **Findings:** `docs/04-reference/jurisdictions/nl/findings/nl-phase0/`.

---

## §1 — Completion

### §1.1 — ⛔ There is no single NL completion figure

| M1 `bouwvlak` coverage | Value | Denominator |
|---|---|---|
| tile-uniform | **11.2 %** | sampled uniformly over tiles |
| parcel-uniform | **36.7 %** | sampled uniformly over parcels |

**These differ by 3×. Neither is "the" figure.** Quoting one without its denominator is the exact
defect this dossier exists to prevent.

**By `hoofdgroep`** — and the spread is the finding:
- `centrum` **100 %**
- `wonen` **53.6 %**
- `water`, `natuur`, `verkeer`, `bos`, `tuin` — **0.0 %**, and these are **F2 (correct null), not a
  gap.** Building was never the question on water or a road.

### §1.2 — M2 · parameter fill, given a bouwvlak

- `maximum bouwhoogte` — **48.7 %** of parcels inside a bouwvlak
- `goothoogte` — **5.1 %**
- **`inhoud`, `dakhelling`, `nokhoogte` — 0 of 556.** Zero. Not low: absent.

### §1.3 — M3 · status distribution (A–F2)

- **F1 = 26 land + 49 urban** — and ⭐ **concentrated exactly where people build**: `wonen` 42, led
  by plain `"Wonen"` at 32.
- **A-eligible: 2/500 land and 6/250 urban** — and *eligible* only; **Status A additionally requires
  a human signature.**

### §1.4 — M4 · `peil` resolvability

**20 / 66 = 30.3 %**, across **17 distinct definitions**.

⚠ **This figure was wrong by 10× and a unit test caught it.** `adjoining-finished-ground` first read
**1/20**; the truth is **11/20**. The audit regex demanded uninflected Dutch (`aansluitend
afgewerkt`); legal prose writes `aansluitende afgewerkte`. It was found because the fixture was
**quoted from the sample**, not written by the regex's own author — and it mattered because that
class is the *finished ground after construction*, the one most likely to be silently replaced by a
raw AHN elevation. Corrected offline from stored texts; **no re-measurement was needed.**

### §1.5 — ⭐ M5 · roof determinacy — the product-shape finding

- `goothoogte` + `bouwhoogte` **co-occur 1 / 500 land, 0 / 250 urban**
- **zero structured `dakhelling` / `nokhoogte` in 556 parcels**
- but plan **TEXT** carries `dakhelling` in **28.8 %**

> **UNDERDETERMINED IS THE MAIN PATH, not the exception.** The founder's brief anticipated this
> exact branch and said it would change the product's shape. It does.

⭐ **And the honest state is `mechanism: 'present'` + `failure: 'pdf'` — never F1, and never
"any roof".** The rule exists and is written down; it is unparsed. Calling that a *gap* would
slander the Dutch planning system; calling it *determined* would invent a triangle.

### §1.6 — M6 · legacy split — an OPEN QUESTION, not a coverage claim

**Zero Omgevingsplan / IMOW instruments observed.** The 26–31 % "dated ≥ 2024" figure is a **DATE,
not an instrument type**. This sample **cannot distinguish** a genuinely small IMOW corpus from one
served behind the key-gated DSO. **Recorded as an open question.**

---

## §2 — What is ACCESSIBLE today

- **Parcel geometry** — 🟢 `source-complete`. Kadaster BRK via PDOK
  `kadastralekaart:Perceel`, keyless, live-probed (`numberMatched:1`, real polygon, Amsterdam).
  Wired via `/api/parcel/nl`.
- **Terrain** — 🟢 AHN (DTM + DSM), NAP reference. ⛔ **Evidence for elevation, never the legal
  definition of `peil`.**
- **Topography / roads / water / terrain** — 🟢 BGT.
- **Existing buildings** — 🟢 BAG (pand geometry, identifiers, status). ⛔ Context, **never
  entitlement**.
- **Zoning geometry (`bouwvlak`)** — 🟡 present but **partial**: 11.2 % / 36.7 % depending on
  denominator; 100 % in `centrum`, 53.6 % in `wonen`.
- **`maximum bouwhoogte`** — 🟡 **48.7 %** where a bouwvlak exists.
- **`goothoogte`** — 🟠 **5.1 %**.
- **Plan text (`begripsbepalingen`, roof rules)** — 🟡 reachable as **text**: `dakhelling` appears in
  **28.8 %** of plan text while structured at 0 %.
- **CRS regime** — 🟢 RD New / EPSG:28992 planimetric, NAP heights.

---

## §3 — What is BLOCKING

- **1. Roof geometry is structurally absent — `not-built` / `pdf`.** 0 of 556 structured
  `dakhelling`/`nokhoogte`; co-occurrence of the two height limits **1/500**. ⭐ The consequence is a
  **product decision, not a bug**: `UNDERDETERMINED` must be a first-class, shippable output.
- **2. `peil` is unresolved on ~70 % of plans — `semantic`.** 30.3 % resolvable across **17 distinct
  definitions**. ⛔ **`peil = AHN elevation` is not expressible in the shipped model, by design** —
  evidence must name its reference class.
- **3. `inhoud` (volumetric cap) — `missing-source`.** 0 of 556. Where a plan does impose
  `inhoud hoofdgebouw maximaal 650 m³`, PRYZM has never seen one in this corpus.
- **4. F1 concentrates in residential — `not-built`.** 26 land + 49 urban, `wonen` 42. **A plan
  governs and serves no envelope mechanism — precisely where users develop.**
- **5. `bebouwingspercentage` denominator — `semantic`, NOT BUILT.** Some plans measure against the
  `bouwvlak`, others the `(bouw)perceel`. The record of which was **not built this lane**.
- **6. `voorrangsregeling` — `precedence`, NOT BUILT.** Distinct from intersecting constraints;
  implementing only the intersection produces **silent wrong answers**.
- **7. Vergunningvrij carve-outs — `not-built`.** Permit-free rights **subtract** on monuments and in
  *beschermd stadsgezicht*. Carve-outs were to be built **before** the general case; neither is built.
- **8. Omgevingsplan / DSO reachability — `credential-gated`, UNRESOLVED.** Zero IMOW observed; the
  DSO is key-gated. ⛔ **This is an open question, not a measured absence.**

---

## §4 — Per-parameter state

| Envelope slot | State | Evidence |
|---|---|---|
| Parcel geometry | **source-complete** | PDOK BRK, keyless |
| Terrain | **source-complete** | AHN DTM/DSM |
| **`peil` (legal datum)** | **interpretive** | 30.3 % resolvable · **17 distinct definitions** |
| Zone / bestemming | **source-complete** | |
| `bouwvlak` (buildable footprint bound) | **source-complete where present** | 11.2 % / 36.7 % · 0 % on water/natuur/verkeer = **F2** |
| **`maximum bouwhoogte`** | **source-complete where present** | **48.7 %** of in-bouwvlak parcels |
| **`goothoogte`** | **source-complete where present** | **5.1 %** |
| `bebouwingspercentage` | **extractable** | denominator record **not built** |
| **`inhoud` (volume cap)** | **not-measured / absent** | **0 of 556** |
| **`dakhelling` / `nokhoogte`** | **extractable** | **0 of 556 structured**; **28.8 % in plan TEXT** |
| **Roof geometry** | **undeterminable** | ⭐ 1/500 co-occurrence — **UNDERDETERMINED is the main path** |
| `aantal bouwlagen` | **not-measured** | |
| Setbacks | **not-measured** | |
| Building depth (`bouwdiepte`) | **not-measured** | |
| Dubbelbestemming / gebiedsaanduiding overlays | **not-measured** | classification not built |
| `voorrangsregeling` (precedence) | **not-built** | distinct operation, unimplemented |
| Permit-free layer | **not-built** | carve-outs first, per the brief |
| `molenbiotoop` (inclined plane) | **derivable** | **18.2 % of Dutch plans**; the primitive already exists — see §7 |

---

## §5 — Next measurable step

**Two, in this order.**

1. **Ship `UNDERDETERMINED` as a first-class output** and render permissible *bounds* rather than a
   shape. M5 says this is the main path; the code already refuses to draw a triangle (§15 fixture).
2. **Build the plan-text leg for roof rules** — `dakhelling` sits in **28.8 %** of plan text and
   **0 %** of structured fields. That gap is the measurable prize, and it is the same shape as the
   French `pdf` finding.

---

## §6 — Gaps in evidence

- `aantal bouwlagen`, setbacks, `bouwdiepte`, overlay classification — **not measured**.
- The **F1/F2 split of the no-plan parcels was not completed** for NL's counterpart set.
- `bebouwingspercentage` denominator, `inhoud` volumetric test, `voorrangsregeling`, vergunningvrij
  carve-outs and `nlMolenbiotoop.ts` were **explicitly refused this lane**, with causes recorded in
  the findings doc — not silently skipped.
- **M6 cannot separate a small IMOW corpus from a key-gated one.** Open question.

---

## §7 — Cross-jurisdiction note: the inclined plane

⭐ **Neither the NL nor the NSW lane built the inclined-plane primitive — `geometry/inclinedTop.ts`
already existed**, and both lanes reached that conclusion independently. NSW's
`NSW-INCLINED-PLANE-HANDOFF.md` is the authority and covers all three Portuguese requirements.

**NL's addendum** (commit `23eb0410`) adds the one thing the handoff missed: **the `molenbiotoop` is
RADIAL, not line-anchored** — 18.2 % of Dutch plans. Resolution: **a tangent-plane fan provably
UNDERSTATES a convex cone**, so it errs in the safe direction, stays adapter-side, and **needs no new
primitive**.
