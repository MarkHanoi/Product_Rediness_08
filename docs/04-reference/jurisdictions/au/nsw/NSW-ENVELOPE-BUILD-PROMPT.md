# NSW ENVELOPE — AGENT BUILD PROMPT (founder-forwarded, captured verbatim-faithful)

> **Provenance:** founder-forwarded agent build prompt **v1.0 · 3 September 2026**. The founder's
> header note: *"Service inventory verified live."* Captured into the repo per the standing
> capture-founder-research-to-repo rule (same-turn, pointer-only in memory). Reconstructed
> faithfully from the forwarded text; section numbering and all values are the founder's.
> Companion docs: `NSW-DATA-GAP-AUDIT.md` (audit against the shipped stack) and
> `phase0-transcripts/` (the Phase 0 measurements M1–M3, RUN live 2026-09-03).

---

## §0 — Objective

Any NSW parcel in → a **cited 3D buildable envelope** out, **or a typed refusal naming exactly
what could not resolve**. NSW is the most machine-readable envelope jurisdiction this program has
encountered anywhere: the state serves numeric height and floor-space controls as polygon
attributes with the legislative clause reference attached. The hard problem in NSW is **not
acquisition — it is PRECEDENCE**: a single parcel can be intersected by up to ten competing
spatial controls drawn from different legal instruments. Build the precedence engine, not another
downloader.

## §1 — Non-negotiables

1. **Determinism.** No LLM anywhere in the geometry or precedence path. Same parcel, same data
   vintage → byte-identical output.
2. **Every value carries its clause.** The layers serve `LEGIS_REF_CLAUSE` and `LEGIS_REF_VALUE`.
   A value in our output without them is a bug, not a style choice.
3. **NEVER take the minimum to resolve a conflict.** Which control governs is a **legal**
   question answered by the LEP clause, not an arithmetic one. Tightest-number-wins is a guess
   wearing a plausible face.
4. **Human signature before publication.** Status A is unreachable without a named signer.
5. **Partial over blank.** A parcel with a resolved height and an unresolved FSR ships the height
   and refuses the FSR by name — never a blank page.

## §2 — PHASE 0: measure before building. Build NOTHING until this is reported.

- **M1 — Layer inventory + classification.** Enumerate every sub-layer of
  `Planning_Portal_Local_Provisions` (~190 layers under group 590),
  `Planning_Portal_Principal_Planning`, and `Planning_Portal_SEPP`. Per layer: id, name, geometry
  type, feature count, full field list, CADID present + populated?, `LEGIS_REF_CLAUSE` /
  `LEGIS_REF_VALUE` present + populated?, renderer class values. Classify each layer **DIRECT**
  (numeric control served as data) / **APPLICABILITY** (the polygon says a clause applies here) /
  **GEOMETRIC** (the geometry itself is the control; parameters live in the clause) / **TEXTUAL**
  (a label pointing into a document) / **IRRELEVANT** (not an envelope input). Report the counts.
  This replaces the ">80% machine-readable" *estimate* with a *fact*.
- **M2 — CADID viability.** % non-null CADID across the DIRECT + GEOMETRIC layers, per layer.
  High fill → a **key join** on the cadastre instead of spatial intersection; low fill → the join
  strategy changes. **Never design around CADID before measuring it.**
- **M3 — Precedence census.** Over a sample of **2,000 NSW parcels**: how many are intersected by
  more than one vertical control, and by more than one floor-space control? Report the
  distribution (1 / 2 / 3 / 4+). This sizes the precedence engine — the actual product.

**Stop. Report M1–M3. Then build.**

## §3 — Verified service inventory (checked live before this prompt was sent)

- Root: `https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/`
- CRS: **GDA94, EPSG:4283**. `MaxRecordCount: 2000`. Formats: JSON / geoJSON / PBF.
- `ePlanning/Planning_Portal_Principal_Planning` — Zoning, Height of Buildings (HOB), Floor Space
  Ratio (FSR), Lot Size, Heritage, Foreshore Building Line, Land Reservation Acquisition,
  Minimum Dwelling Density.
- `ePlanning/Planning_Portal_Local_Provisions` — **~190 layers**; the long tail where the real
  findings are.
- `ePlanning/Planning_Portal_SEPP` — the state overrides. **An LEP-only engine is wrong wherever
  a SEPP applies.**
- `ePlanning/Planning_Proposal_Public` — *proposed* instruments. Never mix with in-force.
- `ePlanningHistoric/Planning_Historic_Combined` — superseded versions → the `as_of_date`
  capability.
- Operations: `Identify`, `Find`, `QueryDomains`; `?f=pjson&returnUpdates=true` for change
  detection.
- **BEFORE scraping:** email **data.broker@environment.nsw.gov.au** for the advertised shapefile
  packages — complete attributes and domains, no 2000-record cap.

## §4 — The layers, with IDs

**Vertical controls (≥10):**
- Principal/**14** Height of Buildings (`MAX_B_H`, `UNITS`, `MAX_B_H_M`, `MAX_B_H_RL`)
- **422** Alternative Building Heights · **771** Alternative Height of Buildings ·
  **485** Incentive Height of Buildings · **509** Macquarie Park Corridor Precinct Incentive HOB
- **429** Building Height Allowance · **430** Building Height Plane (classes A–E)
- **469** Floor Height Restriction (values like 41.8 / 42.1 / 64.1 are **ABSOLUTE levels**)
- **572** Sun Access Protection · **573** Sun Plane Protection · **763** Overshadowing
- **420** Airport Buffer · **512** Meteorological Station Height Limit

**Floor-space controls (≥9):**
- **423** Alternative FSR · **772** Alt FSR — Affordable Housing · **773** Alt FSR — Employment
- **484** Incentive FSR · **470** FSR Incentive · **508** Macquarie Park Incentive FSR
- **532** Non-Residential FSR · **1027** Non-Residential Floor Space · **758** Underground FSR
- **757** Community Facility Floor Space

**Footprint controls (the finding that changes NSW):**
- **431 Building Setback Map** — the renderer classes ARE literal distances (5 / 6 / 10 m):
  **setbacks without a DCP.**
- **553** River Front Building Line · Principal/**26** Foreshore Building Line ·
  **471** Foreshore Scenic Protection
- **496** Landscape Area (classes 35 / 40 = percentage, reduces footprint) · **497** Landscape Map
- **460** Earthworks Exclusion · **416** Active Street Frontages

**Applicability / override:**
- **438** Clause Application · **439** Clauses · **502** Local Clauses · **567** Site Specific ·
  **569**/**570** Special Provisions · **463** Exceptions to Development Standards ·
  **447** Design Excellence · **451** Development Incentives Application

**Density / subdivision:**
- **518** Minimum Site Area · **455** Dwelling Density · **456**/**457** Dwelling Entitlement(s) ·
  **504** Lot Amalgamation · **505** Lot Averaging · **515**/**517**/**775** Min Lot Size Dual
  Occupancy · **516** Min Lot Size Manor Houses / Multi Dwelling / Residential Flat Buildings ·
  **452**/**453** Dual Occupancy Prohibition / Restriction

## §5 — THE HARD PROBLEM: vertical precedence

One Sydney parcel can simultaneously carry: principal HOB + Alternative Building Height +
Incentive HOB + Building Height Allowance + Building Height Plane + Floor Height Restriction +
Sun Plane Protection + Airport Buffer. These are **different legal instruments with different
triggers — NOT alternatives to minimize over.**

Required behaviour:
1. **Collect all** intersecting vertical controls.
2. **Resolve each control's `LEGIS_REF_CLAUSE`** to its instrument and clause.
3. **Classify** each as **BASE / CONDITIONAL / OVERRIDE / CAP**.
4. **Emit:** `base_height` (single, cited) + `conditional_uplift[]` (listed, cited, **NOT
   applied**) + `hard_caps[]` (intersected into the envelope).
5. **Never silently apply a conditional uplift.** *A conditional uplift presented as an
   entitlement is the worst output this engine can produce.*
6. Two conflicting BASE controls that the clauses do not resolve → **status D**, named.

Same structure for FSR.

## §6 — UNITS: three meanings of one number

- `m` = metres **above existing ground level**.
- `m(RL)` = an **absolute AHD elevation** (Reduced Level). Floor Height Restriction (469) values
  are absolute levels.
- `NA` = **refuse, never default.**

Model them as distinct types: `{type: height_above_ground, value_m, datum: existing_ground_level}`
vs `{type: absolute_level, value_m_AHD}`. Collapsing them makes the answer wrong by the site's
elevation — **fifty metres in parts of Sydney.**

## §7 — Terrain

- "Existing ground level" per the Standard Instrument dictionary — which is **≠ natural ground
  level after earthworks.**
- Source: ELVIS / DCS Spatial Services LiDAR — **VERIFY THE LICENCE FIRST.**
- `m(RL)` / Floor Height Restriction values are already absolute — **never add terrain to them.**
- Terrain unavailable → the envelope is **vertically unplaced**, stated as such — never guessed.

## §8 — Height Plane + Sun Plane = inclined-plane operators

The polygon says **WHERE** the plane applies; only the clause says the **angle and origin**.
Shared primitive: `plane(origin_line, angle, height_at_origin)` → half-space; envelope ∩=
half-space. Class → parameters is a **one-time clause extraction, signed and stored** (Building
Height Plane classes A–E). An unresolvable class = **status C**, never a default prism. This is
the SAME operator as South Australia's 45° planes, German Abstandsflächen, and Portuguese RGEU
art. 59 — **build it in the shared solver, not in the NSW adapter.**

## §9 — What NSW does not serve (three things only)

- **A — Non-spatialised DCP standards.** ~128 council DCPs: side/rear setbacks (unmapped),
  building separation, private open space, garage rules, parking, articulation.
- **B — Conditional logic.** The government serves "the DCP applies here", not "IF dwelling AND
  lot < 12 m AND corner THEN setback = X". This is the real missing layer; **no spatial dataset
  closes it.**
- **C — A resolved parcel endpoint.** The ingredients are served; the composition is not.
  **THE COMPOSITION IS PRYZM'S PRODUCT.**

Council **digital** DCPs to harvest before parsing any PDF: City of Sydney interactive DCP map
(FeatureServer layers: setbacks, height in storeys, street frontage height, through-site links),
`dcp.newcastle.nsw.gov.au`, `dcp.portstephens.nsw.gov.au`. Find EVERY council with a GIS/web DCP
first, inspect the network calls, treat them as APIs.

**Rule-lineage warning:** Randwick DCP 2025 = a new Stage 2 **plus surviving DCP 2013
provisions** — effective dates attach **per PROVISION, not per document.**

## §10 — Validation with the government's own answers

- **Section 10.7(2) planning certificates** as ground truth wherever councils adopted the online
  service. Disagreement = a defect to investigate, ours or theirs.
- **DA + CDC application feeds** (daily, since Jan 2019, CC-licensed): approvals systematically
  ABOVE our resolved cap = a missing SEPP override, an unapplied incentive, or a wrong measurement
  convention. *This is how you find where the rule graph is incomplete — at scale, for free.*
- Both become CI checks, not one-off studies.

## §11 — Status taxonomy

`A / B / C / D / E / F1 / F2` — with **F1** (zoned, but no height control found = a data gap)
**never merged** with **F2** (a correct null: reservation, waterway, RE1 — the law genuinely
states no height control). "We don't know" and "the law doesn't say" are different answers.

## §12 — Build order

1. **Phase 0 first** (§2). Email the data broker on day one.
2. Parcel + CADID join — or spatial intersection, **per M2's answer.**
3. Consume Principal (zoning, HOB, FSR, lot size) **with units typing (§6)**.
4. **The PRECEDENCE ENGINE (§5) — before more layers.**
5. DIRECT Local Provisions layers (431 setbacks, 496 landscape) — then GEOMETRIC ones.
6. SEPP overlay resolution.
7. Terrain + the inclined-plane operator (§7–§8).
8. `as_of_date` via the Historic service.
9. The validation harness (§10).
10. Council digital DCPs (§9).
11. PDF parsing **LAST**, and only per customer need.

## §13 — Acceptance criteria

- Same parcel, same vintage → **byte-identical** output.
- CI: **no value without a clause citation.**
- A parcel with a conditional Incentive HOB emits **base + unapplied uplift** (hand-built
  fixture).
- An `m(RL)` value is never treated as height-above-ground (hand-built fixture).
- `NA` refuses.
- An unresolvable Building Height Plane class → **status C**, not a prism.
- A SEPP-covered parcel is never resolved LEP-alone.
- F1 and F2 remain separate statuses.
- The 10.7 certificate CI check runs wherever coverage exists.

## §14 — Competitive note

NSW is Archistar's home market, and they are inside government procurement. The data is open to
everyone — acquisition is not a moat for anyone. The differentiator is **§5 + §11**: refusing to
present a conditional uplift as an entitlement, and separating "we don't know" from "the law
doesn't say". Nothing in Archistar's public material claims per-parameter clause citation with
typed refusal. **Build that or do not enter.**
