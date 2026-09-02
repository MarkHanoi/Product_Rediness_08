# Envelope Parameter Reference (the founder's doc, captured verbatim)

> **Provenance:** pasted by the founder 2026-09-02 (v0.2, companion to the Universal Envelope
> Model), captured same-turn. Its Annex A (Sufficiency Legends, v0.1) is captured beside it:
> `STR-ENVELOPE-SUFFICIENCY-LEGENDS.md`. **Execution note (orchestrator):** lane ENV-RECONCILE
> dispatched the same hour to map every row onto the as-built system + the 2026-09-02
> architecture audit + the in-flight S1/K1 seats, and to name the genuinely-new deltas.

**Every attribute required to derive a maximum buildable volume on any European plot — with rationale and worked example**
PRYZM · v0.2 · companion to the Universal Envelope Model

---

## A. Site geometry

| # | Parameter | Type / unit | Why it is needed | Example |
|---|---|---|---|---|
| A1 | **Parcel polygon** | Polygon, projected CRS, m² | Defines the domain of the solve. Every setback, coverage ratio and floor-area ratio is computed against this area, so an error here scales into every downstream number. | A Barcelona Eixample plot returns 412 m² from the Catastro geometry. The registered title says 419 m². At an edificabilitat of 2.0 that is 14 m² of floor area — one small bedroom — in dispute. Declare which boundary you used. |
| A2 | **Height reference datum** | Point or surface, m above geodetic datum | Every vertical limit is measured *from* somewhere. Without an explicit datum the height rule is meaningless, yet the resulting envelope still looks correct. | Barcelona measures the alçada reguladora from a reference at the kerb; a plot whose ground rises 2.8 m front to back will produce a plausible, wrong envelope if you take the parcel centroid instead. Resolve the datum to a coordinate, never to a description. |
| A3 | **Frontage classification** | Enum per boundary edge: public way / party / rear / open | Setbacks, alignment and depth rules are per-edge. A parcel treated as an undifferentiated polygon cannot express "3 m front, 0 m party, 5 m rear". | An L-shaped corner plot in Gràcia has two public frontages, one party boundary and one rear boundary. Four edges, four different rules, one polygon. |
| A4 | **Right-of-way width per frontage** | m, per edge — **nominal** | In table-driven systems the entire height outcome is a lookup on this value. It is a planning quantity, not a measurement. | PGM Art. 327, subzona I: a frontage under 8 m gives 8.55 m and PB+1; 12 to under 15 m gives 14.65 m and PB+3. A 0.4 m error at a band boundary costs two storeys. |
| A5 | **Terrain surface** | DTM raster or TIN | Determines whether stepped-volume or sloping-site rules engage, and is required to resolve A2 on anything but flat ground. | A Vallcarca plot at 14% slope: the rules permit a stepped volume, and flat-ground logic under-reads the buildable volume by roughly a storey at the downhill end. |
| A6 | **Adjacent building heights and party-wall positions** | m + geometry, LoD1 minimum | Matching-height, consolidated-front and distance-to-neighbour rules cannot be evaluated from the subject parcel alone. | Italy's DM 1444/1968 requires 10 m between facing walls with windows. That distance is a function of the *neighbour's* façade, so without A6 the constraint simply cannot be computed. |

---

## B. Regulatory identity

| # | Parameter | Type / unit | Why it is needed | Example |
|---|---|---|---|---|
| B1 | **Governing instrument** | Name + version + date in force | Rules change. Without a version and an in-force date, a citation is not verifiable and the envelope cannot be reproduced later. | "PGM 1976, as modified by MPGM [ref], in force from [date]" — not "Barcelona zoning". |
| B2 | **Zone code** | String, jurisdiction-native | Selects the rule set. Never normalise this away; the native code is what the citation refers to. | Barcelona clau 13; Berlin *WA* (allgemeines Wohngebiet); Amsterdam *Wonen*. |
| B3 | **Subzone** | String | Subzones typically carry entirely different numeric tables from the parent zone. Collapsing them is a silent accuracy loss. | Clau 13a and 13b differ; and within clau 13, subzona I and subzona V have different height tables — subzona V gives 7.55 m at under 8 m width where subzona I gives 8.55 m. |
| B4 | **Overlay stack, ordered** | Ordered list | Overlays subtract from or modify the base envelope, and they conflict. Order must be explicit or the result is non-deterministic. | An Eixample plot can carry simultaneously: heritage catalogue listing, the Ordenança de Rehabilitació (+2.25 m alçada reguladora incrementada), and PEUAT tourist-accommodation restrictions. |
| B5 | **Site-specific override flag** | Boolean + expedient reference | **This flag alone determines whether the plot is derivable.** If a derived plan governs, the general rules are irrelevant and only that document can produce the envelope. | AMB's asterisked qualifications: assimilated to a PGM clau, but the parameters are the derived plan's own and are published nowhere but the expedient in RPUC. |

---

## C. Volume-defining parameters

These, and only these, produce the volume.

| # | Parameter | Type / unit | Why it is needed | Example |
|---|---|---|---|---|
| C1 | **Ordering type** | Enum: aligned-to-street / free-standing / terraced / specific-volumetric | The master switch. It decides which of C2–C6 apply at all. Aligned systems use buildable depth and ignore side setbacks; free-standing systems use coverage and setbacks and ignore depth. Applying the wrong family produces a well-formed nonsense. | Clau 13 is aligned-to-street → depth governs, no side setback. Clau 20a is free-standing → setbacks and coverage govern, depth is meaningless. |
| C2 | **Maximum height** | m above datum (A2) | The primary vertical constraint. | 14.65 m for a 12–15 m frontage under PGM Art. 327 subzona I. |
| C3 | **Maximum storeys** | Integer count | Binds **jointly** with C2, not redundantly. After applying minimum floor-to-floor, whichever is tighter governs — and in practice it is frequently the storey count. | PB+3 at 14.65 m with a 3.05 m minimum floor-to-floor: four levels need at least 12.20 m plus ground-floor height. The metre limit and the count must both be satisfied. |
| C4 | **Footprint limit** | Ratio (%) **or** depth (m) | Constrains the plan extent. Which form applies is determined by C1. | Barcelona clau 13: buildable depth in metres, annotated per illa. Germany: *GRZ* as a ratio — GRZ 0.4 means 40% of the plot may be covered. |
| C5 | **Setbacks** | m, per frontage type from A3 | Positions the volume within the parcel. Includes distance-between-buildings on the same plot. | A French PLU typically sets *retrait* from the alignment and from lateral boundaries; a Dutch *bouwvlak* achieves the same by drawing the permitted footprint polygon directly. |
| C6 | **Shaping constraints** | Geometric operators — planes, offset surfaces | Not expressible as scalars. These are the constraints that force a solver architecture rather than a fields-based schema. | Germany's *Abstandsflächen*: a distance surface computed as a fraction of façade height (0.4 H in many Länder, with a 3 m floor), so the permitted volume tapers as it rises. New York's sky exposure plane and Nordic solar-access planes behave the same way. |

---

## D. Yield-defining parameter

| # | Parameter | Type / unit | Why it is needed | Example |
|---|---|---|---|---|
| D1 | **Floor area limit** | Ratio or absolute m² | Does **not** define the volume — it trims how much of the volume may be occupied. Converts a massing into a yield, which is what the money is calculated from. | Germany's *GFZ*; Barcelona's edificabilitat; Italy's indice di edificabilità. **Note:** France abolished the COS in 2014, so floor area there is derived from the geometry alone — a system with no D1 at all. Your schema must permit its absence. |
| D2 | **Floor-area exclusion rules** | Rule set | Determines what counts toward D1: basements, balconies, cores, plant, wall thickness. Varies more across Europe than any other parameter, and it dominates sellable area. | Two cities with identical ratios of 2.0 can differ by 10–15% in sellable area purely on whether cores and balconies count. This error reaches a financial model, which makes it commercially worse than a wrong envelope. |
| D3 | **Bonuses and increments** | Rule set | Uplifts that modify D1 or C2 conditionally. | The Eixample Ordenança de Rehabilitació grants +2.25 m of alçada reguladora incrementada under stated conditions — an increment, not a base value, and it must be modelled as conditional. |

---

## E. Resolution rules

Without these, C and D are ambiguous rather than wrong — which is harder to detect.

| # | Rule | Type | Why it is needed | Example |
|---|---|---|---|---|
| E1 | **Multi-frontage resolution** | Rule | Corner and through plots face streets of different widths, each implying a different height. Something must decide. | Typical alineació rules let the taller height carry around the corner for a limited run before stepping down. Without the rule you cannot produce *a* height, let alone the right one. |
| E2 | **Height / storey precedence** | Rule | C2 and C3 both bind; the interaction with minimum floor-to-floor is not obvious. | Minimum 3.05 m per level and a required 4 m ground-floor clearance on frontages of 20 m or more can make the storey count binding well below the stated metre limit. |
| E3 | **Overlay conflict order** | Ordered rule | Two overlays can give contradictory limits. Deterministic output requires an explicit order. | Heritage protection capping height below what a rehabilitation increment would permit — one must be declared to win. |
| E4 | **Prescriptive vs discretionary** | Enum + range | A negotiable maximum is not an entitlement. Presenting one as the other is precisely the failure the honesty doctrine exists to prevent. | England has no zoning envelope at all — height and massing are determined through discretionary consent against policy and daylight tests such as BRE vertical sky component. The correct output is a range with a stated basis, never a single number. |
| E5 | **Quantum trimming policy** | Declared strategy | When D1 is reached before the volume is filled, many valid massings exist. Determinism requires a declared choice. | FAR exhausted at 5 of 7 permitted storeys: do you build 5 full floors, 7 partial floors, or maximise frontage? Declare it, apply it identically every time. |

---

## F. Provenance — attached to every parameter above

| # | Attribute | Why it is needed | Example |
|---|---|---|---|
| F1 | **value + unit** | Units are not inferable and mixing them is silent. | `14.65 m`, never `14.65` |
| F2 | **instrument + version + date in force** | Makes the derivation reproducible and challengeable. | PGM 1976, consolidated text in force at date of derivation |
| F3 | **article** | The difference between a derivation and an estimate. A parameter with no article is a guess with a number attached. | Art. 327, subzona I, height table |
| F4 | **derivation method** | Enum: direct / table-lookup / computed / interpolated / inferred. Tells the reader how much to trust the value. | `table-lookup` on a frontage width of 12.4 m |
| F5 | **inputs** | Table lookups depend on other derived values; the chain must be inspectable. | Height derived from frontage width A4, itself derived from the instrument's nominal width |
| F6 | **retrieved_at** | Instruments change; a citation without a date decays silently. | 2026-09-02 |
| F7 | **confidence** | Enum: resolved / assumed / unresolved. Drives whether the envelope can be issued at all. | `unresolved` on any parameter forces a cited refusal rather than a number |
| F8 | **refusal_reason** | Populated whenever F7 is unresolved. The refusal is the product when the number cannot be. | "No governing article located: parcel falls under derived plan [ref], parameters not published" |

---

## Summary counts

- **6** site-geometry inputs (A)
- **5** regulatory identity fields (B)
- **6** volume-defining parameters (C)
- **3** yield parameters (D)
- **5** resolution rules (E)
- **8** provenance attributes (F), attached to every value

**The irreducible core is eight fields:** A1 parcel, A2 datum, A4 frontage width, C1 ordering type, C2 height, C3 storeys, C4 footprint limit, C5 setbacks. Those produce a volume. C6 corrects its shape, D converts it to yield, E makes it deterministic, F makes it defensible.
