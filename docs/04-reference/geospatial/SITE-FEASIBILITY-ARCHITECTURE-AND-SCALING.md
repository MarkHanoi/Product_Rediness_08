# PRYZM Site Feasibility — architecture, orchestration, and the scaling model

*Written 2026-07-22. **Part 1 is business-readable; Part 2 is for engineers.** Both halves describe
the SAME system and quote the SAME measured numbers — that is the point of putting them in one file.*

> **This document is a MAP, not a claim.** Every number in it was measured against real Barcelona
> parcels and is cited to the evidence file that produced it. Where something is unverified,
> unbuilt, or wrong, it says so in the same voice it uses for the wins. A feasibility product whose
> own status document oversells is disqualified from selling compliance numbers.

---
---

# PART 1 — THE BUSINESS READ

## 1.1 · What the product does

A user drops a pin on a Spanish address, draws or selects a plot, and PRYZM answers:
**what may legally be built there** — buildable depth, height, footprint, volume, and the number of
floors — and then generates a building inside that envelope.

The competitive frame is Archistar / Cityweft / Forma. The differentiator is **not** that we have a
zoning database. It is that **we do not have one, and neither does anyone else**, and we are honest
about what we do instead.

## 1.2 · The one idea that everything else follows from

> **⚠ THE BUILDABLE ENVELOPE IS A CONSTRUCTION, NOT A LOOKUP.**

Barcelona's PGM Art. 242.2 does not *state* a buildable depth. It states how to **derive** one:

> *"a figure similar to the block, equidistant from the street frontages, leaving at least 30% of the
> block area as interior free space"* — capped at 30 m, floored at 11 m.

So the depth is **a function of the block** and differs block to block. Every "20 m" or "24 m" figure
repeated online is one person's answer for one particular block, which is exactly why those figures
contradict each other. **Hard-coding either would produce a confidently wrong envelope on the densest
land in Spain.**

This is why there is no dataset to buy. We assemble the inputs (parcel, block, street frontages,
zone) and **run the ordinance as an algorithm, per parcel, on every selection** — then show the user
which rule produced which number. That derivation trace is the product; the number alone is not.

*Canonical: ADR-0271 · `packages/site-parcel-data/src/geometry/blockDerivedDepth.ts`*

## 1.3 · What is real today — the honest scoreboard

The envelope is a **six-layer** product. The layers **multiply**: four layers at 90% is 65%.

| # | Layer | Live | Sample |
|---|---|---|---|
| 1–3 | parcel · zone · block dissolve | **83.0%** | n=100 |
| 4 | depth (Art. 242.2) | *(inside the 83.0%)* | — |
| 5 | height (Art. 327) | **78.3%** | n=83 |
| 6 | render / inset volume | **41.5%** live *(was 36.9%; L-581 clamp shipped 2026-07-22)* | n=65 |
| | **END-TO-END** | ❔ **STALE — must be re-derived** | |

**The end-to-end chain, recovered and now recorded** *(it was never written down, which is how it
briefly became unquotable — the missing factor was COVERAGE):*

```
end-to-end  =  clau coverage  ×  layers 1–3  ×  layer 5 (height)  ×  layer 6 (geometry)
```

| | coverage | L1–3 | L5 | L6 | = |
|---|---|---|---|---|---|
| before the L-581 clamp | 24.2% | 83.0% | 78.3% | 36.9% | **5.80%** ✓ *reproduces the published 5.8%* |
| **TODAY** | 24.2% | 83.0% | 78.3% | **41.5%** | **6.5%** |
| once the 13b pack lands | 33.0% | 83.0% | 78.3% | 41.5% | **8.9%** |

⚠ **33.0% coverage is a FORECAST, not today's number** — it is what coverage becomes when 13b is
encoded. Today it is 24.2%. Do not interchange them.

⚠⚠ **And the biggest remaining lever is still layer 6, by 2.5×**: taking it to 80% is worth **+6.1
points** against +2.4 for the 13b pack, +1.4 for height coverage and +0.9 for the dissolve. All four
together reach ≈ **23.8%**, the realistic ceiling of the current architecture. **L-581 shipped a fix;
it did not finish the job.**

### ⚠⚠ Two things that must never be dropped when this table is quoted

1. **These are *RESOLUTION* rates, not *ACCURACY* rates.** Layer 5 scores 78.3% because a height was
   **produced** — it never asks whether that height was measured from the **right datum** (see §1.6).
   **Never present these as accuracy.**
2. **5.8% supersedes an earlier 15.7%** which was published and retracted the same day: the layer-6
   probe had been **tautological** (it computed the volume, then compared it to itself). If you find
   15.7% anywhere, it is stale.

**Separately, COVERAGE** — the share of private buildable land whose zone code (*clau*) has a rule
pack at all: **33.0%**. Ceiling ≈ **75.8% constructed / ~88% definitive**.

⚠ **100% is neither achievable nor desirable.** **24.2%** of private buildable land sits in zones
where the ordinance **grants no private envelope** (parks, motorways, clau 18). *"No envelope
applies, here is the citation"* is a **correct answer**, not a gap.

*Evidence: `scratchpad/l576-live-dissolve.json`, `l576-layer5.json`, `l576-layer6.json`,
`bcn-clau-distribution.json`*

## 1.4 · The single biggest lever, already measured

**Layer 6 (36.9%) is the bottleneck**, and it is a **geometry bug, not a data gap**. Our polygon
offset routine, when asked for the party-wall configuration the Barcelona *ensanche* actually uses,
drops ~50% of its own constraints and produces a shape that flies outside the block — measured
escapes up to **177 m** at the gentlest depth the ordinance ever asks for.

A fix ("clamp instead of drop") was built and measured offline against 65 real blocks this session:

| variant | sound at the 11 m ordinance floor | answers landing honestly at the 30% rule |
|---|---|---|
| before | 36.9% | 3 |
| **clamp (shipped)** | **55.4%** | **9** |

**Measured live, same 65 parcels, before vs after:** geometry sound 36.9% → **41.5%**; blocks told
*"Art. 242.2 cannot be satisfied"* **40 → 28**; answers produced by the real Art. 242 construction
**16 → 28**. The middle row is the headline — **a 30% cut in false refusals.** **SHIPPED 2026-07-22.**

⚠ The table above (55.4%) is the **offline fixture** metric — one inset call at the 11 m floor. The
41.5% is the **live** metric — full solve plus containment. **They are different measurements and
must not be compared**; quoting whichever is larger is the aggregate-shopping that produced the
retracted 92.3%.

⚠ *"Unblocks Madrid and Córdoba on the same code path"* is an **UNTESTED CLAIM** — the dissolve probe
for those cities has not been re-run since the clamp. Do not repeat it as fact until it has.

### ⚠⚠ A first draft of this section claimed 92.3% and 34 honest answers. Both were RETRACTED.

They came from an un-gated version of the clamp that **over-eroded**. Over-erosion eats real
courtyard, and a smaller free area makes the depth search settle exactly where the 30% ratio binds —
so **"lands honestly at 30%", the very metric introduced to detect dishonest answers, scored HIGHEST
when the geometry was most wrong.** Every aggregate looked healthy.

It was caught only by an **independent grid-rasterisation oracle** — a different algorithm, not
another variant of the same one. On real block 02309 a uniform 12 m inset is **~3,227 m²**; the
shipped code returns **2,921 m²** (correctly conservative); the un-gated clamp returned **256 m² —
wrong by 12×**. *(Audit row L-581.)*

⇒ **The transferable lesson, and it applies to every layer in §1.3: never accept an aggregate as
proof of a geometry change. Validate against a source that cannot share the bug.**

## 1.5 · What it costs to add a city, and a country

This is the scaling question, and the answer is unusually clean.

| # | Layer | Transfers to a new city? |
|---|---|---|
| 1 | Cadastral parcels | ✅ **free** — national (Catastro covers all of Spain) |
| 3 | Block dissolve | ✅ **free** — pure geometry |
| 4 | Street-width measurement | ✅ **free** — pure geometry |
| 6 | 3D context tiles | ✅ **~free** — change a bbox, re-run the bake |
| 7 | Basemap | ✅ free |
| 2 | Zone source | ⚠ Catalonia = MUC; another region = a different GIS + taxonomy |
| **5** | **Rule pack** | ❌ **HAND-ENCODED PER MUNICIPALITY** |

> **Six of seven layers are free. The seventh is the whole cost.**

### ⚠ Three things that make the seventh layer harder than it looks

1. **It does not amortise even within one metropolitan plan.** The AMB serves per-municipality
   *refós* pages keyed by INE code, and **`08015` (Badalona) and `08245` state DIFFERENT NUMBERS for
   the same PGM article**, because each municipality layers its own *modificacions* onto shared
   article numbers. **"Encode the PGM once, get 36 municipalities free" is false.**
2. **The cost is SOURCING, not typing — and sourcing is human-gated.** AMB 403s scripted fetch,
   Barcelona's own ordinance page is robots-disallowed, the authoritative viewers are interactive.
   Two capable research agents hit that wall from different angles, twice each, in one day.
   **It does not parallelise with engineers**, which means it is the one line item that cannot be
   accelerated by hiring developers.
3. **⚠⚠ RETRACTED — "Spain-wide scaling is blocked by the block dissolve, not by rules." IT IS NOT.**
   Measured on a frozen 956-manzana sample with the production dissolve: **91.4% nationally**,
   including **Madrid 92.6% / 99.0%** and **Córdoba 90.8%**. The old "Madrid 2/4 · Córdoba 0/3"
   figure is a superseded L-535 measurement, is not reproducible (street names recorded, no
   coordinates), and must not be re-quoted. The win belongs to **L-539** (ADR-0274), not L-581 —
   verified structurally, not statistically: `insetPolygonPerEdge` is **not reachable** from
   `blockRing.ts` in the import closure, so L-581's dissolve effect is 0 blocks.

   **The three gates that actually block a second Spanish city**, each independently sufficient:
   **G1** the jurisdiction router (`isInBarcelona()`, a lat/lon bbox — Madrid and Córdoba test
   false, so the dissolve and depth solver are *never called there*, making their production rate
   unobservable); **G2** the zoning source is Catalonia-only (MUC — 0/4 Madrid and 0/3 Córdoba
   points returned a qualification, 0 network errors); **G3** exactly one rule pack is registered,
   `es-08019-barcelona`. ⇒ **The geometry was never what stood between us and Madrid.** A second
   city = a router change (small) + a non-Catalan qualification source (medium) + a hand-sourced
   rule pack (the human-gated cost above).

*Canonical: `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/BARCELONA-DATA-PIPELINE.md`*

## 1.6 · What is NOT true yet — state this before a customer finds it

- **Building heights in the surrounding context are 0.9% surveyed.** 79.3% are derived from
  `building:levels` × an assumed 3.2 m; **19.8% are an outright fabricated 9 m**. Footprints, by
  contrast, are essentially solved (**104–121% of independent OSM ground truth**). This is why dense
  historic districts render flat — not a rendering bug, missing data.
- **We measure heights from a flat plane at the block centroid**, while the ordinance measures from
  the ***rasant* at the façade** — wrong datum, no frontage segmentation, and a **silent fallback to
  zero** if the terrain sample fails. Metres of error on a sloping street. It lives inside the layer
  that already scores 78.3%, so **it lowers no metric** — which is precisely why it is named here
  rather than left to drift. *(L-584.)*
- **Nothing in the legal parameter set is `certified`.** Every parameter carries a confidence tier,
  and the top tier is not claimed. *(`L-583-LEGAL-PARAMETERS-SOURCED.md`.)*
- **Two zone classes are deliberately withheld.** 12b (*nucli antic*) sets height from the **average
  of existing neighbours** — averaging 79% estimates and 20% fabrications into a *legal* height is
  fabrication wearing the costume of a construction, so it stays blocked until heights are real.

## 1.7 · Where the defensibility actually is

Not in the data — six of seven layers are public and free. It is in two places:

1. **The constructed envelope.** Running the ordinance as an algorithm with a per-number derivation
   trace is materially harder than shipping a lookup table, and it is the only approach that
   survives contact with an ordinance like Art. 242.2. A competitor with a table is confidently
   wrong on the densest land in the market.
2. **The honesty machinery, which is fully jurisdiction-independent.** Every layer can fail, and each
   failure has a **distinct, cited outcome** instead of a silent fallback:

   | Situation | What the user sees |
   |---|---|
   | no zone code | refuse, cite the MUC taxonomy |
   | zone with no rule pack | *"Zone rules coming"* — **never** a generic setback triple, because that is the wrong geometric **operation**, not merely an imprecise number |
   | ordinance grants no private envelope | *"No envelope applies"*, cited — **a correct answer** |
   | rules exist, an input is missing | *"Couldn't complete"*, naming which input |
   | height undecidable | no fabricated prism — a 0.5 m footprint slab and the reason |
   | context tiles unreadable | `ok` / `aborted` / `unavailable` / `disabled` — **never a bare empty array** |

   That last row is the house rule the whole system is built around: **a failure and an empty result
   are the same VALUE and must never be the same ANSWER.** It was learned expensively (L-422 / 457 /
   467 / 469 / 579) and it is what makes the numbers quotable at all.

---
---

# PART 2 — THE ENGINEERING READ

## 2.1 · The seven data layers, and who owns each

| # | Layer | Source | Where it lives |
|---|---|---|---|
| 1 | Cadastral parcel | Catastro OVC + INSPIRE WFS (keyless) | `CatastroParcelProvider` + `server/parcelZoningProxy.js` |
| 2 | Zone code (*clau*) | Catalonia MUC | `MucZoningProvider` |
| 3 | Block ring (*manzana*) | dissolve of same-prefix parcels | `geometry/blockRing.ts` |
| 4 | Street widths / frontage classification | ray-cast to opposing frontage | `geometry/streetWidth.ts` |
| 5 | **Rule pack** | **hand-encoded ordinance** | per-jurisdiction rule pack |
| 6 | 3D context | pre-baked PMTiles on Cloudflare R2 | `geospatial/contextTiles.ts` |
| 7 | Basemap | tiles | Cesium / 2D map |

⚠ **Only layer 5 is a dataset we author.** The envelope is CONSTRUCTED per parcel on every
selection — there is no "Barcelona dataset" to load. Read
`jurisdictions/es/es-ct/08019-barcelona/BARCELONA-DATA-PIPELINE.md` before assuming otherwise.

## 2.2 · Orchestration — what happens on one parcel selection

```
 user drops pin / selects parcel
   │
   ├─ dispatchSiteLocation ─────────────► C12 LTP-ENU origin set (C19 §1.3)
   │                                      └─ §CTX-PREFETCH-ON-LOCATION warms the context cache
   │
   ├─ ParcelProvider.fetchZoning ───────► ParcelFeature   (C57 §4, via same-origin proxy)
   ├─ site.parcel-boundary-set ─────────► immutable ring  (C19 §4.1, one-shot)
   │
   ├─ ZoningProvider.fetchZoning ───────► ZoningRecord    (C58 §4 step 2)
   ├─ computeBuildableEnvelope ─────────► BuildableEnvelope + DerivationTrace
   │     PURE · deterministic · no LLM · no RNG          (C58 §1.1, §3.2)
   │     └─ Art. 242.2 depth: solveBlockDerivedDepth (bisection, fixed 40 steps)
   │     └─ per-edge setback inset:      insetPolygonPerEdge
   │     └─ maxVolumeM3 = area(inset) × maxHeight
   │
   ├─ site.updateZoning ────────────────► the ONLY mutation path (P6, C19 §4.1, one runBatch = one undo)
   │
   └─ (authoring) inset + maxHeight thread into the generators as HARD bounds (C58 §1.8)
```

Steps 2–3 each open a `pryzm.zoning.*` OpenTelemetry span (P8). Determinism is contractual: the same
`(parcel ring + edge classifications + resolved rule set)` **must** produce a byte-identical
`BuildableEnvelope`. *"The AI said 18 m"* is not a compliance claim; *"zone 22a → maxHeight 18 m,
from rule-pack field `maxHeight_m`, ordinance ref X"* is. **Reproducibility is the product.**

## 2.3 · Outputs — the numbers the business half promises

`BuildableEnvelope` carries `maxHeight_m`, `maxFloors`, `plotRatioFAR` (*edificabilitat*),
`maxCoverage`, per-edge `setbacks{front,side,rear}`, the `insetPolygon`, and
`maxVolumeM3`. Each is accompanied by a `DerivationTrace` entry and a `confidence` tier. These map
**1:1** onto the C19 `Parcel` mutable fields and reach the model **only** through `site.updateZoning`
— C58 introduces no new persisted schema.

## 2.4 · Package / layer map (the 8-layer rule)

| Component | Package | Layer |
|---|---|---|
| `ParcelFeature`, `ZoningRecord`, `BuildableEnvelope`, `DerivationTrace` (pure Zod) | `packages/schemas/.../site/` | **L0** |
| `ParcelProvider` / `ZoningProvider` + adapters + `ZoningRulesEngine` (pure) | `packages/site-parcel-data/` | **L2** |
| single `proj4` projector | `packages/geospatial/` | **L2** |
| envelope → `site.updateZoning`; envelope → generator bounds | `site-runtime` + `stores` + editor executor | **L2–L5** |
| map mode, info card, 3D Site | `apps/editor/src/ui/geospatial/`, `.../site/parcel/` | **L5** |
| fetch proxies, GML→GeoJSON, LRU cache, server-side keys | `server/parcelZoningProxy.js` | server (BFF) |

Dependency direction: `apps/editor` ← `site-parcel-data` ← `schemas`. No reverse imports; CI-enforced.

## 2.5 · The extension point — adding a jurisdiction

**Adding a jurisdiction is a new adapter + (if needed) a proxy route + an attribution string —
never a core edit.** Adapters already defined: `CatastroParcelProvider` (Spain, **built**),
`DkParcelProvider` / `DkZoningProvider` (Denmark, keyed — the template for every keyed source, key
lives **server-side only**), `MucZoningProvider` (Catalonia), `MadridPgouProvider`,
`OerebZoningProvider` (Switzerland), `TerraraZoningProvider` (premium, gated).

⇒ **The code was designed to scale. The bottleneck is §1.5's layer 5, which is a research
function, not an engineering one.**

## 2.6 · Performance architecture — why the 3D context is fast

Live public Overpass was root-caused as an **unfixable** hot-path dependency (406s, 45-second hangs,
429s — and, worst, errors reported **in band** as `HTTP 200 + a "remark" field`, byte-identical to
"nothing here"). It was replaced by **pre-baked PMTiles on Cloudflare R2, read directly over HTTP
range requests**: **42 tiles · 13.4 MB · 9,762 footprints · ~1 s.** Static bytes, CDN-cached, no
query planner, no rate limit, no third party in the loop. *(L-513 / L-513b.)*

⚠ **We are at the performance ceiling. Do not add anything to the runtime load path.** Any new data
(e.g. measured heights) must be resolved at **bake** time and shipped in **one fused tileset** — a
baked attribute rides in requests we already make, at ≈ zero cost. A second runtime fetch path is
the exact shape of the defect L-513 removed.

## 2.7 · Open defects, in value order

| ID | Defect | Impact | Status |
|---|---|---|---|
| **L-581** | offset drops ~50% of constraints on the party-wall call | **layer 6: 36.9% → 55.4%** | **SHIPPED 2026-07-22** (§1.4) |
| L-552 | 13b rule pack | coverage 24.2% → **33.0%** | unblocked. ⚠ cite Art. 242 via **Art. 326**, never Art. 328 |
| — | estimated-card render race | generic pack paints before the Barcelona resolver refuses | open |
| L-527 | context heights 0.9% surveyed | flat massing; blocks 12b | needs nDSM — see §2.8 |
| L-584 | rasant / wrong datum + silent 0 fallback | metres of error on slopes; **lowers no metric** | named, deferred by decision |
| L-585 | context read 2–3× per site, cancelled mid-flight | blank 3D Site for many seconds | **fixed 2026-07-22** |
| — | 12b (*nucli antic*) | height from neighbour average | **deliberately blocked** until heights are real |

## 2.8 · Heights — the decision, and the trap in it

Our context feature **welds shape and height into one record from one provider**. `heightProvenance`
records *how good* a height is, but **no field can say "this shape came from OSM and this height came
from LiDAR"** — so a second height source has nowhere to go. **That is a self-inflicted schema
limitation, not a data gap**, and splitting the pair is the cheap enabling change.

Two acquisition paths, and they are not interchangeable:

| Path | Effort | Quality | Blocker |
|---|---|---|---|
| **A** · Overture / MS ML height attributes | **days** — attribute join onto the existing bake | ⚠ **ML-estimated** | licence |
| **B** · nDSM (DSM − DTM) from PNOA LiDAR / ICGC | **weeks** — acquire → difference → zonal stats → bake | **measured** | licence gate can veto |

⚠ **Gate path A before ingesting anything:** validate it against the **0.9% of buildings carrying a
SURVEYED height** — our one independent ground truth. **If it does not beat `levels × 3.2 m`, path A
is worth nothing**: swapping our estimate for their estimate is the same epistemic value wearing a
better provenance label.

⚠ **The asymmetry that keeps catching us: a DTM upgrade serves the RASANT and does nothing for
heights; an nDSM serves HEIGHTS and does nothing for the rasant.** Separate programmes, separate
licences. **Do not fund them as one line item.**

⚠ **None of this moves the 5.8%.** That number is L-581. Schedule the heights work against a
business reason, never the scoreboard.

## 2.9 · ⚠ Contract / code divergence to reconcile

**C58 §3.2 and §3.3 specify Turf.js negative buffer as the setback-inset engine.** The shipped code
does **not** use Turf, deliberately: `insetPolygon.ts` documents that Turf's buffer is **geodesic**
(it assumes WGS84 degrees), while the C19 parcel spine is already in **scene-XZ metres**, so feeding
it to Turf would be metrically wrong — and Turf cannot do per-edge front/side/rear offsets with a
single uniform buffer. A hand-rolled metric edge-offset was written instead. **Verified: no Turf, and
no boolean-geometry library of any kind, is in the dependency tree.**

The **code's reasoning is better than the contract's**, so the governance rule ("when code disagrees
with a contract, the code is wrong") resolves the other way here: **edit C58 §3.2/§3.3 in place** to
record the metric edge-offset decision and delete the Turf dependency note. Until that happens, C58
describes an engine that does not exist.

## 2.10 · Where to read next

| Topic | File |
|---|---|
| Parcel data layer contract | `docs/02-decisions/contracts/C57-PARCEL-DATA-LAYER.md` |
| Zoning + envelope contract | `docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md` |
| Site model / parcel commands | `docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md` |
| Art. 242.2 is an algorithm | `docs/02-decisions/adrs/ADR-0271` |
| **Read before assuming a dataset exists** | `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/BARCELONA-DATA-PIPELINE.md` |
| Every legal parameter + confidence tier | `.../barcelona-catalonia/L-583-LEGAL-PARAMETERS-SOURCED.md` |
| Source coverage, heights, terrain, the plan | `docs/04-reference/jurisdictions/es/SPAIN-GEODATA-SOURCE-COVERAGE.md` |
| Context tile performance architecture | `docs/04-reference/geospatial/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` |
| Live issue log (rows L-576 → L-585) | `docs/04-reference/ISSUE-LOG.md` |

---
---

# PART 3 — THE STRUCTURAL SEAMS (why the fixes keep recurring city-by-city)

*Added 2026-07-26. This part answers a different question from Parts 1–2: not "how far along is
Barcelona" but **"why has every site/envelope/terrain/georef fix been a per-city patch, and what
single change per seam dissolves the whole family."** Every claim below is line-cited to production
code, read this session. Governance-first: each seam names the contract that governs it and states
whether the code violates it. Per the rule at the foot of this file, this is recorded HERE, in the
canonical engineering map — not in a new `*-AUDIT.md`.*

> **The thesis, stated up front and then proved against the city matrix (§3.5):** there are not N
> city bugs. There are **three structural seams** — the render ignoring the envelope contract (§3.1),
> the absent single SiteFrame (§3.2), and failure-rendered-as-absent (§3.4) — each surfacing once per
> jurisdiction, plus **one candidate seam that turns out to be mostly already built** (§3.3, Seam 3 —
> stated honestly rather than inflated to round the count). A patch at a city is a patch at a
> *symptom* of a seam; the seam is the defect.

## 3.1 · SEAM 1 — the massing render is a pure function of a hand-maintained 4-field projection, NOT of the envelope contract

**Status: CONFIRMED, structural. This is the L-616 family and it is the single highest-leverage fix
in the subsystem (Part 1 §1.3 already names layer 6 as the bottleneck by 2.5×).**

### Root cause, line-cited
The engine produces a rich, honest `BuildableEnvelope`
(`packages/schemas/src/site/zoning/BuildableEnvelope.ts`): `insetPolygon`, `maxHeight_m`,
`farLimitedHeight_m` (:389), `maxVolumeM3` (:394), `maxCoverage`, `maxFloors`,
`footprintIsUpperBound` (:416), `tiers[]` (:465) with a `principalTier()` helper (:364) and a Zod
refinement (:490–505) that **guarantees the legacy scalars never contradict the tiers** — i.e. a
consumer that reads the whole object *cannot* be handed an over-stating solid.

The 3D massing then **throws almost all of it away**, in two hand-maintained narrowing points:

1. `apps/editor/src/ui/layout/GISAreaLayout.ts` `resolveFormaEnvelope()` (:1896–1934) reduces the
   full object to **exactly four fields** — `{ ring, maxHeightM, farLimitedHeightM, confidence }`
   (:1928–1932).
2. `apps/editor/src/ui/geospatial/CesiumViewport.ts` `renderFormaMassing`'s `envelope?` param TYPE
   (:3817–3836) *only accepts those four fields*. The extrude (§ENVELOPE-VIA-MASSING, :4718–4830)
   then draws **one prism** = `envelope.ring × maxHeightM` (:4752, :4755, :4786–4802), plus a second
   opaque solid when `farLimitedHeightM` binds (:4773–4821). `confidence` is consumed for **colour
   only** (:4760).

**Discarded, never reaching the render as data:** `maxVolumeM3`, `tiers[]`, `principalTier`,
`maxCoverage`, `footprintIsUpperBound`, `maxFloors`, `insetAreaM2`, and the entire `derivation[]`.
The render **re-derives** the solid (footprint × scalar height) instead of **consuming** the solid
the engine already computed and proved non-overstating.

The engine's own two overstating mechanisms compound it (measured in
`jurisdictions/ENVELOPE-REALISM-MATRIX.md`, L-616): **A —** an unknown setback collapses to a 0
inset (`ZoningRulesEngine.ts:249` `front.value ?? 0`) → the ring becomes the whole parcel; **B —**
`maxFAR` is returned (`:826`) but never read into the volume (`:734–739` caps by coverage only, and
only for tiered zones). But mechanisms A and B are *inputs the render would honour if it consumed
them*; **fact #3 of the matrix is the actual root — the solid ignores `maxVolumeM3` entirely, so
fixing the engine cannot bind the solid until the render reads it.**

### Why this produced a per-city treadmill
Every new honesty field was bolted onto the 4-field projection one defect at a time:
`farLimitedHeightM` (L-616), `confidence`→hue (L-608). `footprintIsUpperBound` (L-619) and `tiers[]`
(L-590b/ADR-0273) are **already in the schema and still NOT in the projection** — so the next
jurisdiction that needs them (any Denmark karré; any Barcelona `22a`) forces yet another manual
widening of two files. That is the treadmill, in code.

### Contract that governs, and the violation
**C58 §1.4** (an envelope MUST never render as more than it grants — over-statement is the one
forbidden direction), **§1.7b.4** (a multi-tier envelope MUST NOT be drawn as one prism without
saying so), **§1.13.3** (a refused envelope MUST zero every numeric field the massing reads). The
shipped render **violates §1.7b.4 by construction** (it has no tier concept) and **cannot honour
§1.4** (it has no volume/coverage input). Per governance, the code is wrong.

### The canonical fix (the single structural change)
**Invert the direction: the ENGINE emits the solid; the render only rasterises it.** Introduce ONE
pure L2 total function

```
envelopeToMassing(env: BuildableEnvelope): MassingSolid[]
   // packages/site-parcel-data/  — pure, deterministic, no THREE/DOM (C58 §1.9)
```

that returns the COMPLETE set of solids to draw, honouring **every** field in one place: `tiers[]` →
one solid per tier at its own height; `footprintIsUpperBound` → a hatched *study* slab, never a
confident prism; `farLimitedHeight_m` → the FAR solid inside the translucent legal shell;
`maxVolumeM3`/`maxCoverage` → the volume cap. `renderFormaMassing` is rewritten to take
`MassingSolid[]` and extrude each — it **never re-derives height from a scalar and has no per-field
knowledge**. `resolveFormaEnvelope()`'s 4-field narrowing is deleted; the full `env` flows to the
pure function.

**What the schema must guarantee (already true):** the §490–505 refinement already forbids
tiers-vs-scalars disagreement; `envelopeToMassing` is the render-side dual of that guarantee.

**What makes over-statement structurally impossible — a CI property test over EVERY registered rule
pack** (`check-envelope-solid-never-overstates`): for each pack's canonical parcel,
`Σ volume(envelopeToMassing(env)) ≤ (env.maxVolumeM3 ?? Σ tier.area × tier.height)` and
`footprintIsUpperBound ⇒ every solid carries the study style` and `tiers.length > 1 ⇒ solids.length
> 1`. No jurisdiction can overstate at the render because the *shared* function is the only path and
the test binds it for all packs at once. This **folds in** the DK-render honesty patch, the BCN-FAR
patch, and the tiers patch — they stop being per-city work and become one function + one test.

## 3.2 · SEAM 2 — there is no single SiteFrame authority; origin, project-north θ, and ground are each reconstructed per consumer

**Status: CONFIRMED, structural — the deepest seam. Origin has TWO competing authorities; θ is
applied at ~13 sites across THREE code idioms; ground is resolved in FOUR places; the ECEF bridge is
DUPLICATED. This is already logged as an OPEN contract violation (C12 §1.5, L-604).**

### Root cause, line-cited
Two modules were *designed* to be the frame authority and neither is:
- `packages/geospatial/src/LTPENURebase.ts` (the proper proj4/UTM LTP-ENU class) is **never imported
  by anything that renders** — `boundaryProjection.ts:8–30` explicitly declines it ("not readily
  available at this draw surface yet") and ships its own equirectangular approximation
  (`latLonToSceneXZ`, :53–62).
- `apps/editor/src/ui/geospatial/sceneEnuFrame.ts` is a *partial* extraction whose own header
  (:6–10, :31–88) admits it: the mapping is "open-coded in ~15 sites inside an untestable file", the
  inventory "was built by inspection, not by a machine check", and several sites are "NOT YET
  MIGRATED".

So each consumer reconstructs the frame:

| Axis | Independent implementations found |
|---|---|
| **Origin** | **TWO documented competing authorities** — the LTP-ENU origin (`getCurrentSiteOrigin()`, frozen at boundary commit) vs the geocoded address (`siteModelStore.getLocation()`), per `globeGroundAnchor.ts:37–48`; `originSeparationMeters`/`georefOriginsDiverge` (:335–370) exist only to *measure the divergence*. `overlayOrigin()` (`CesiumViewport.ts:9041`) picks between them at runtime. Plus each `CesiumThreeBridge` builds its own `eastNorthUpToFixedFrame` from scratch. |
| **θ (project→true north)** | ~13 sites, 3 idioms: inline `trueVectorToProjectNorth` (`siteDispatch.ts:912–923` + six zoning-clip sites :1030,1544,1714,1982,2431,2884); shared `sceneXZToEnu` (massing :3899, photoreal clamp :5273, façade :7735/7869); `Matrix3.fromRotationZ(-θ)` baked into the glTF matrix (:9151); a GLSL `u_pryzmProjNorth` uniform (:8373). |
| **Ground elevation** | FOUR: `sampleTerrainMostDetailed` clamp (:5884→:5910), the separate photoreal-tiles clamp (:5177–5413→:5761), the pure `globeGroundAnchor` reducer (:172–292), and the shared `formaTerrainBaseHeight` field (:701) each consumer reads and offsets on its own (:3884, 6673, 7033, 8903). `ParcelBoundarySceneRenderer.ts:169` ignores terrain entirely (fixed `y≈0.02`). |
| **ECEF bridge** | DUPLICATED: `plugins/geospatial/src/CesiumThreeBridge.ts` (imports the P2 facade) and `packages/renderer-three/src/geospatial/CesiumThreeBridge.ts` (imports bare `three`) — identical `setAnchor` building the ENU→ECEF matrix, neither θ-aware (C12 §1.5). |

### The CONFIRMED root cause — θ is a single value written in one frame and read in another (the structural half of L-536)
The Barcelona parcel/envelope **displacement** the founder sees is not an envelope bug and not a
projection error: the whole chain (Catastro ring → `buildBoundaryFromLatLonRing` → θ de-rotation in
`dispatchParcelBoundary` → θ re-application in `CesiumViewport.toCartesian`/`sceneXZToEnu`)
**round-trips to 1e-14 m for ANY θ, provided θ_write == θ_read** (C19 §1.12.1, measured). When they
diverge, the net error is `R(θ_read − θ_write)` about the SCENE ORIGIN; because a SELECT flow anchors
the scene at a site point offset from the parcel centroid by `d` (the L-521 anchor-vs-parcel split),
the parcel swings along an arc `≈ 2·d·sin(Δθ/2)` — it **rotates AND translates off the real plot**,
and the boundary and envelope move together (one `toCartesian` closure, one render θ). It is
Barcelona-only because `R(0) = identity`, and the Cerdà grid is the fabric that produces non-zero θ.

θ_write ≠ θ_read is produced by **three write gaps + one read latch**, all confirmed this session:

| Gap | Site | Defect |
|---|---|---|
| **g1** | `siteDispatch.ts:913` | `if (projectNorthRad !== 0)` guards **both** the θ write and the ring de-rotation. A parcel that folds to θ = 0 (an Eixample *xamfrà* corner, ~1.1 % of parcels, C19 §1.12.2) **never publishes 0**, so a prior ±45° from the last select **survives** in `SiteLocation.trueNorth` and the render re-applies it to an un-de-rotated ring. |
| **g2** | `siteDispatch.ts:917` → `:870–874` | `dispatchSiteTrueNorth(...)`'s **boolean return is ignored**. On a soft-reject the θ write does NOT happen (`:870–874` returns `false`), yet the caller **de-rotates the ring anyway** (`:918–926`). The de-rotation is not transactional with the write. |
| **g3** | `siteDispatch.ts:813–842` | `dispatchClearParcelBoundary` clears the boundary and `_lastEnvelope` (`:840`) but **not `trueNorth`**. Redraw leaks the prior θ into the next select. |
| **read latch** | `CesiumViewport.readProjectNorthRad:2485–2526` | reads θ from `this.runtime` with **no `window.runtime` fallback** (unlike `getFormaBoundary`, §L-412 Bug-2), and returns `0` **both** when θ is genuinely 0 **and** when the read fails — the §L-446 diagnostic itself states the two are "INDISTINGUISHABLE". So θ_read latches 0 on the null/legacy-runtime boot path while θ_write persisted ±45°. |

**This proves the seam is a SINGLE-PRODUCER problem.** θ has no single owner that writes it once,
unconditionally, transactionally, and reads it back through one accessor — so the write and the read
drift apart at exactly the four sites above.

### Why this produced a per-city treadmill
Each jurisdiction lights up a *different* consumer of the frame, so the seam surfaces as a
differently-shaped bug each time: Barcelona's Cerdà grid folds θ to ~45° on **100 % of parcels**
(C19 §1.12.3), so the parcel/envelope *displacement* is a θ-pivot mismatch between the ~13 sites;
Copenhagen sits on a slope, so the *terrain reseat* bug (L-584/L-585) is a ground-path
disagreement; a heatmap city exposes the sun-hours rectangle that applies **no θ at all**
(:8896–8909). Same seam, three "different" bugs, three patches.

**A live inconsistency this review surfaced (must be verified, localhost being unusable):**
`sceneEnuFrame.ts:33` asserts "θ is still 0 everywhere in production", but **C19 §1.12 measured
θ ≈ ±45° on live Barcelona parcels** and the producer is marked DONE (ADR-0115 item 8, 2026-07-20).
If the producer is live, then every "NOT YET MIGRATED" site (the sun-hours heatmap, the still-open
`RealSunService.setProjectNorth` with no caller, the C34 §1.4 north-arrow) is **already mixing
frames** — a latent, plausible-looking, silently-wrong render. The "wire consumers while θ=0, then
flip" luxury ADR-0115 relied on is **already spent**; the migration below must therefore assume θ is
non-zero and gate it, not sequence around a zero that no longer holds.

### Contract that governs, and the violation
**C12** owns coordinate transforms. **C12 §1.5 already declares this an OPEN P1 violation** (ECEF in
the BIM scene graph, L-604) and states *"The real fix belongs here, in C12 … either the bridge must
not place ECEF coordinates in the shared scene graph at all (an LTP-ENU-relative group per §1.1), or
C12 must declare an explicit, contracted exception with a named frame flag."* **C19 §1.12** governs
the θ round-trip and names any surface disagreement a θ-lifecycle fault. **ADR-0115 items 2/6**
document the θ spray and the duplicated solar math as known follow-ups. The code violates C12 §1.1
(scene frame MUST be local LTP-ENU) at the bridge and has no single owner for §1.5's "named frame
flag".

### The canonical fix (the single structural change)
**One `SiteFrame` authority, constructed once at `composeRuntime` (P1), that every consumer reads and
no consumer re-derives.** It is the C12 §1.5 "named frame" made real:

```
interface SiteFrame {                       // packages/geospatial/ (L2) — the single owner
  origin: LtpEnuOrigin;                      // ONE origin (the frozen LTP-ENU; address is instrumentation)
  thetaRad: number;                          // project→true north, the ONLY θ source
  sceneToEnu(x, z): {east, north};           // the one θ-application (subsumes sceneXZToEnu)
  enuToScene(east, north): {x, z};
  toCartesian(x, z, up): Cartesian3;         // the one origin+θ→globe path (subsumes toCartesian/enu)
  sampleGround(x, z): GroundAnchor;          // the one ground authority (subsumes the 4 paths)
}
```

- **Collapse the two origin authorities into one:** the frozen LTP-ENU origin is authoritative; the
  geocoded address is instrumentation only. `georefOriginsDiverge` becomes an *assertion*, not a
  runtime choice.
- **Fold `LTPENURebase` in** (SiteFrame delegates the proj4/UTM math to it) so the "proper" class is
  finally on the render path.
- **De-duplicate `CesiumThreeBridge`** to one copy that re-parents into an LTP-ENU-relative group
  (closes C12 §1.5 / L-604) — no ECEF in the shared scene graph.
- **Replace "believed complete by inspection" with a machine check** — a CI gate
  `check-scene-frame-single-owner` that hard-fails on any open-coded `north = -z` / `-p.z` /
  `eastNorthUpToFixedFrame` / `fromRotationZ(theta)` outside the SiteFrame module. This is what makes
  "one site missed" impossible, which is the exact failure mode the seam produces.

- **θ is written ONCE, unconditionally, transactionally, and read through ONE accessor** — the
  single-producer discipline the g1/g2/g3 + read-latch gaps violate. Concretely the SiteFrame owns:
  a `setTheta(θ)` that **always** persists (including 0, killing g1) and is **transactional** with the
  ring de-rotation (de-rotate only if the write succeeded, killing g2); a `clear()` that **resets θ to
  0** (killing g3); and a single `theta` getter sourced `this.runtime ?? window.runtime` (killing the
  `readProjectNorthRad` latch, matching the `getFormaBoundary` §L-412 Bug-2 fallback).

**Is the 3-gap `siteDispatch` fix the correct FIRST INCREMENT, or a throwaway patch?** It is the
correct **first increment**, not a throwaway. The three write gaps + the read latch ARE the
single-producer contract the SiteFrame will own; fixing them establishes the invariant *θ_write ==
θ_read for all θ including 0* at the current producer/reader sites, and when SiteFrame lands
`dispatchParcelBoundary`'s write becomes `siteFrame.setTheta(θ)` and `readProjectNorthRad` becomes
`siteFrame.theta` — the **same discipline, relocated into one object**, not rewritten. It is
independently shippable, independently verifiable (§SITE-FRAME-PROBE: `ringResidual ≈ 0`,
`offsetFromOrigin` = the parcel-centroid distance and NOT a `2·d·sin(Δθ/2)` swing, on first-select /
redraw→reselect-to-θ=0 / a forced soft-reject), and it closes the founder-visible Barcelona
displacement **now** while the fuller SiteFrame (origin unification, `sampleGround`, bridge de-dup,
the CI gate) follows as increments 2–4. Sequence position: **increment 1 of Seam 2, which is itself
the first seam** (§3.6).

**What it dissolves at once:** the Barcelona parcel/envelope θ-pivot displacement (one θ, one pivot),
terrain-in-Site z-fighting and the L-584/L-585 reseat (one `sampleGround`), the heatmap-on-terrain
occlusion (the heatmap reads θ+ground from the frame instead of being an un-rotated geographic
rectangle), and the L-604 ECEF corruption — because they are the same seam.

## 3.3 · SEAM 3 — "confidence is scalar, not per-field": PARTLY REFUTED (mostly already built)

**Status: the honest verdict is that this is NOT a structural seam. The per-field machinery already
exists and is wired.** Reported so the count is not inflated to a tidy three.

### What the evidence shows
The card (`GISAreaLayout.ts`) already renders per-field provenance: `buildComplianceReport(env)`
(:2438, from `@pryzm/site-parcel-data`) turns `env.derivation[].fieldProvenance` into per-row
`isEstimate`, and the "Why these numbers?" block badges **each row** EST/PUB (:2441–2459) plus an
aggregate "N of M value(s) are ESTIMATED" caveat (:2468–2469). So "confidence is a single scalar the
card collapses everything into" is **false at the data layer and largely false at the card**. C58
§1.2/§1.6 and SPEC-COMPLIANCE-REPORT §3.1 already model per-field provenance; the schema carries it;
the code consumes it.

### The genuine residual (small, not structural)
1. The single **headline chip** (`env.confidence`, :2398–2403) can read `structured` /
   `block-constructed` while a *field* is estimated or an upper bound — it does not downgrade to the
   **weakest** field. Fix: the headline is a pure derivation = `min(fieldProvenance over derivation)`
   (a one-function rule), not a rewrite.
2. **`footprintIsUpperBound`** — the founder's exact complaint (a STRUCTURED-looking envelope over an
   unknown-setback footprint) — has **no chip**, and the render discards the flag entirely. This is
   downstream of **Seam 1**: surface it once the massing consumes the full envelope.
3. `SPEC-COMPLIANCE-REPORT.md:54` still lists a **3-member** confidence enum; C58 §1.2 has five
   (`block-constructed`, `not-determined` added). A stale-spec divergence to reconcile in place.

**Conclusion:** fold the headline-downgrade rule and the `footprintIsUpperBound` chip into C58 §5.1;
sync the SPEC enum. There is no once-and-for-all rewrite here — the founder's specific grievance is
real but is item (2), which Seam 1 already carries.

## 3.4 · SEAM 4 — a transient fetch failure and a genuine absence are the same ANSWER (the §CONTEXT-DATA-HONESTY family, one layer up)

**Status: CONFIRMED, structural. This is L-422/457/469 restated at the zoning-resolver layer — the
exact family Part 1 §1.7's "a failure and an empty result are the same VALUE and must never be the
same ANSWER" house-rule exists to prevent, breached on the compliance path.**

### The tell, and the root
Live on prod, the Netherlands refusal card says *"Re-select the parcel to try again — this usually
clears on a second attempt"* (`GISAreaLayout.ts:2372`). But it is shown for parcels that are
**genuinely, permanently outside any adopted plan** — for which no retry will ever change the answer.
The retry it promises is even fictional: `GISAreaLayout.ts:2365-2371` — *"This is an INSTRUCTION, not
a button: a working Retry needs a cached boundary and a re-invoke path that do not exist yet."*

The root is a **three-part structural collapse**, confirmed this session:

1. **No refusal code for a genuine data-empty.** `BuildableEnvelope.ts:203-214`'s closed
   `EnvelopeRefusalCode` set has *legal* permanent codes (`public-system`, `derived-plan`, …) and
   exactly **one transient** code, `source-data-unavailable`. A data-path *empty* ("the source
   answered 200 and there is no plan/bouwvlak here") has **nowhere to go but the transient code**.
   `isTransientRefusal` (`zoneRefusal.ts:151-153`) branches the whole UI on that one code, and the
   card treats it as retryable.
2. **The dispatcher flattens the resolver's own distinction.** The resolvers *do* classify —
   `resolveNlBestemmingsplan.ts` returns `endpoint-unreachable` (transient) as a **distinct** reason
   from `no-plan`/`no-bouwvlak` (absent, :417-435, :492-494). But `siteDispatch.ts:1839-1845` (NL) and
   `:1440-1447` (DK) funnel **every** `!ok` reason into one `source-data-unavailable` refusal —
   `nlBestemmingsplan.ts:191-192`'s `detail` even enumerates the three collapsed causes in one
   sentence. **The resolver knows which it is; the dispatcher throws that knowledge away before the
   card sees it.**
3. **No automatic retry, and half the proxies collapse fail→empty on the wire.** No client resolver
   retries at all — the "retry" is offloaded to a fictional human button. Proxies retry unevenly:
   `overpassProxy.js` does it right (backoff + a distinct `_upstreamFailed` flag, :279-487), but
   `chGrundnutzungProxy.js:249-250`, `plandataZoningProxy.js:420-421` and `mucZoningProxy.js:291-301`
   return `200 {…: null}` for **both** an upstream failure and a genuine empty; the Catastro parcel
   route (`parcelZoningProxy.js:351-353`) and `DkZoningProvider.ts:80-86` do the same — the flat
   `null`-for-everything C57 §1.5 line 65 literally mandates.

### Why this produced a per-city treadmill
Each jurisdiction's upstream fails differently (PDOK WMS timeout; geodienste axis-order; MUC WMS
miss), so the conflation surfaces as a different "flaky city" each time and gets a different card-copy
patch — while the shared root (empty and unavailable share one code and one card) is never touched.

### Contract that governs, and the violation
**C57 §1.5** (parcel layer) *mandates* the collapse — "a provider MUST resolve to `null` … on: no
parcel at the point, **an unavailable/timed-out source, a non-OK proxy response**, …" — so here the
**contract itself encodes the §CONTEXT-DATA-HONESTY violation** and must be amended, not just the
code. **C58 §1.13** (refusal vocabulary) has the transient/absent *intent* but no genuine-absence
data code, and does not forbid the dispatcher flatten. The governing house-rule is
§CONTEXT-DATA-HONESTY (L-422/457/467/469).

### The canonical fix (the single structural change)
**Generalise the proven context-building pattern into one shared outcome type carried end-to-end.**
`contextBuildings.ts:897-924` already does this right for tiles — a first-class
`'ok' | 'aborted' | 'unavailable' | 'disabled'` union, with the load-bearing rule that an *empty* is
an answer (cacheable) while *unavailable* is transient (falls back) and *aborted* is not-a-failure
(uncached). Lift it to L2 as one `FetchOutcome<T> = {status:'found',value} | {status:'absent',code} |
{status:'transient',code} | {status:'aborted'}` that **every** provider, resolver and proxy returns —
retiring the per-adapter ad-hoc reason enums and the flat `null`. Then:

1. **Add a genuine-absence refusal code** to `EnvelopeRefusalCode` (e.g. `no-plan-at-point`) distinct
   from `source-data-unavailable`, so an empty never wears the transient card.
2. **Stop the dispatcher flatten** (`siteDispatch.ts:1839/1440`): carry the resolver's
   transient-vs-absent status THROUGH to the refusal, so `isTransientRefusal` and the card branch on
   the truth.
3. **One bounded auto-retry-with-backoff at the transient boundary** (the `overpassProxy` pattern) so
   a transient is *resolved by the machine*, and only a still-failing transient surfaces — as a
   "temporarily unavailable, retrying" state, never as "no plan here / re-select to try again".
4. **A CI gate** asserting every provider/proxy returns `FetchOutcome` (no bare `null`, no
   `200 {null}` for a failure) — so a new adapter cloned from the Catastro template cannot
   re-introduce the collapse.

This is the same discipline as Seams 1 and 2: one shared type + one CI gate makes the honest
classification structural rather than per-adapter goodwill.

## 3.5 · Per-city mapping — proving "N cities, few seams"

Cells are the founder's matrix, cross-read against `jurisdictions/ENVELOPE-REALISM-MATRIX.md` (L-616)
and §4 of the rollout tracker. **Instance-of** is the whole point: every overstating cell is Seam 1;
every θ-rotated or sloped cell is Seam 2.

| City | Envelope realism (matrix) | Seam 1 (render overstates)? | Seam 2 (frame)? | Notes |
|---|---|---|---|---|
| **Barcelona** 13a/13b | REALISTIC (depth binds, FAR null) | **No** | **YES — θ-pivot**, Cerdà folds θ≈45° on 100% of parcels (C19 §1.12.3) | the parcel/envelope "displacement" IS Seam 2, not an envelope bug |
| **Barcelona** 12 / 20a | OVERSTATES-FAR, **live** | **YES** — 1.40 edificabilitat / 30% ocupació discarded by the solid | YES (θ) | pure Seam 1 |
| **Barcelona** 22a / 18 | REFUSES (unregistered / gated) | n/a | YES (θ) | refusal is correct; not a seam |
| **Copenhagen (DK)** | **OVERSTATES-BOTH, live** (mechanism A+B) | **YES** — the founder's Copenhagen defect (L-619) | **YES — terrain reseat** (L-584/585, slope) | the one cell that stacks BOTH seams |
| **Madrid** NZ1 | REFUSES (ring-only, decided) / BLOCKED by G1 router | n/a (deliberate) | latent (θ) if wired | not a seam — a decided scope + coverage gap |
| **Córdoba** | REFUSES; **latent OVERSTATES-BOTH** behind `CORDOBA_ENVELOPE_VERIFIED` | **latent Seam 1** (null setbacks + no geometricRule → mechanism A on gate-open) | latent (θ) | add a geometricRule before signing |
| **Paris** | REFUSES; **latent OVERSTATES-SETBACK** behind `FR_PARIS_PLU_CERTIFIED` | **latent Seam 1** (old UG zone `setbacks {0,0,0}`) | latent | repoint dispatcher to the ECM engine before flipping |
| **Zürich** BZO | REFUSES; **latent OVERSTATES-FAR** if wired | **latent Seam 1** (AZ/GFA cap not in the solid) | latent | wire the cap into `envelopeToMassing`, not footprint×height |
| **Netherlands** | REALISTIC (explicit-area real bouwvlak) | No | latent | neither seam |
| **Riyadh** | REALISTIC (resolved pack, street-width setbacks) | No (add a guard so base-pack null setbacks can't reach the engine) | latent | founder demo market; neither seam |

**The thesis holds.** Every live or latent *overstating* cell (DK; BCN 12/20a; Córdoba, Paris,
Zürich latent) is one instance of **Seam 1**. Every θ-rotated or sloped cell (all Barcelona, DK) is
one instance of **Seam 2**. No cell is a genuinely novel per-city defect — the two REALISTIC-but-safe
cells (NL, Riyadh) are safe precisely *because* they happen to hit the paths the seams have not
corrupted yet. Seam 3 is not a per-city phenomenon at all.

## 3.6 · Build order — TERRAIN-IN-3D-SITE EVERYWHERE is the lead deliverable (founder directive, 2026-07-26)

The founder has made **terrain-in-3D-Site on everywhere** the top-priority lead. It is not a fourth
workstream bolted on — it is the **first sound consumer of the Seam-2 SiteFrame's ground facet**, and
sequencing it correctly is exactly what stops the L-629 Madrid regression from re-shipping. So the
build order is re-drawn with terrain as the **critical path**, and the other seams slotted around it
in the order that lets terrain land as early as is sound.

### Why terrain regressed, in one line (the L-629 constraint that governs the order)
`CesiumViewport.ts:5993` `if (this.photorealTilesActive) return` is the guard the **L-626 revert
restored** because draping baked terrain in Forma regressed Madrid: every ground-seated object is
seated on **one scalar** `formaTerrainBaseHeight` (`:701`) sampled at the **boundary centroid**
(`:3650`), so the moment relief is drawn the distributed objects no longer sit on it — context
buildings **z-fight the relief → white shells**, and the sun-hours heatmap **paints at the flat
centroid height → the mesh occludes it → faint** (comment `:5988-5992`). **Terrain-on before the
reseat re-ships exactly this.** Hence the reseat is a HARD PREREQUISITE, encoded as the ordering
below.

### The base-0 / single-centroid consumers that MUST switch to `SiteFrame.sampleGround(lat,lon)`
Every site that today adds the single scalar `formaTerrainBaseHeight` and must instead sample the
ground at its OWN location:

| Consumer | Where | Today | After |
|---|---|---|---|
| **Near context buildings** | `CesiumViewport.ts:2137` (`formaTerrainBaseHeight + heightM`) | seated on the site-centroid base | `sampleGround(bldg.lat,lon)` per building |
| **Far-ring context** | `renderContextBuildingsFarRing` | flat/low-poly on the centroid base | `sampleGround` per footprint (batchable per tile) |
| **Sun-hours heatmap** | the sun-hours ground overlay | painted flat at the centroid | **drape on terrain** — per-cell `sampleGround`, or Cesium `CLAMP_TO_GROUND` against the terrain provider |
| **Parcel boundary ring** | `ParcelBoundarySceneRenderer.ts:169` (fixed `y≈0.02`) | ignores terrain entirely | `sampleGround` along the ring |
| **Envelope / massing base** | `renderFormaMassing` `baseHeight` (`:3884`, `:4752`) | one centroid sample for the whole plot | `sampleGround` at the plot (the L-584 rasant fix rides here) |

### THE CRITICAL PATH (terrain milestones — each gated on the previous)

- **T0 — SiteFrame ground-elevation authority.** Add `sampleGround(lat,lon): GroundAnchor` to the
  Seam-2 SiteFrame (§3.2), sampling the baked `CesiumTerrainProvider` per-location (flat base when a
  city has no baked tileset — self-correcting per `:5975-5980`). This RETIRES the single
  `formaTerrainBaseHeight` scalar as the universal base. Depends only on the frozen LTP-ENU origin,
  which already exists — so it lands **without** waiting for the full origin unification.
- **T1 — reseat every distributed consumer onto `sampleGround` (HARD PREREQUISITE for T2).** The five
  rows above. This is the L-584/L-585 "single-point seat" fix made real, and it is the gate the L-626
  revert is waiting on.
- **T2 — enable terrain (un-revert L-626).** Relax the `:5993` `photorealTilesActive` guard so baked
  terrain renders in Forma/3D-Site everywhere. **MUST NOT ship before T1** — that is the L-629
  regression, by construction.
- **T3 — verify on MADRID first** (the L-629 regression city): no white shells (context sits on
  relief), no faint heatmap (draped on relief), stable nav; then the other baked-terrain cities
  (Copenhagen slope, etc.). Deploy → founder browser-test (localhost unusable, Part 2 §2.6).

### The full seam order around the critical path (terrain as early as sound)

1. **Seam-2 increment 1 — the 3-gap θ fix (`siteDispatch` g1/g2/g3 + `readProjectNorthRad`)** ships
   **first / in parallel**: it is tiny, independent of terrain, and closes the founder-visible
   Barcelona displacement now (§3.2). Verified by §SITE-FRAME-PROBE.
2. **Seam-2 increment 2 — the SiteFrame ground facet = T0 → T1 → T2 → T3 (the lead).** θ and ground
   are two facets of the same SiteFrame; ground is the terrain critical path and does not block on the
   full origin unification (it reads the one frozen origin).
3. **Seam-2 increments 3–4 — full origin unification + bridge de-dup + `check-scene-frame-single-owner`
   CI gate.** Hardening; terrain does not block on these, but they close L-604 and make the single
   owner enforced rather than conventional.
4. **Seam 1 — `envelopeToMassing` + the never-overstate CI test**, drawing **through** the now-single
   frame (so the envelope base reads `sampleGround` too). Retires the L-616 bottleneck and folds in the
   DK/BCN-FAR/tiers patches.
5. **Seam 4 — the `FetchOutcome` union + genuine-absence code + one auto-retry** — independent of the
   render/frame work; can proceed in parallel any time.
6. **Seam 3 — the headline-downgrade chip** — after Seam 1 surfaces `footprintIsUpperBound`.

### Verification strategy (localhost is unusable — Part 2 §2.6 / the memory rule)
- **Unit-pin before deploy**, because all three structural seams are the class where an aggregate
  looks healthy while the geometry is wrong (Part 1 §1.4's retracted-92.3% lesson): `envelopeToMassing`
  gets the byte-deterministic never-overstate property test over **every** pack; `SiteFrame` gets the
  ADR-0115 end-to-end property (a parcel squared into the authoring frame maps back to its ORIGINAL
  true-world bearing) + the §SITE-FRAME-PROBE (`ringResidual ≈ 0`, `offsetFromOrigin` = centroid
  distance, NOT a `2·d·sin` swing) + the `check-scene-frame-single-owner` grep gate; `sampleGround`
  gets a fixture test that a building 300 m from the centroid on a synthetic slope seats at ITS ground,
  not the centroid's. All pure-L2, testable off the untestable 8,000-line viewport.
- **Then deploy → founder browser-test**, in order: **(1)** a Barcelona *xamfrà* corner (Seam-2 θ
  fold-to-0, C19 §1.12.2); **(2) Madrid with terrain on** (the L-629 white-shell / faint-heatmap
  regression — the lead acceptance); **(3)** Copenhagen (Seam-1 both-mechanisms + the sloped-terrain
  reseat). If those three read correctly, the matrix's latent cells ride the same code paths.

---

## Maintenance rule

**Do not quote a coverage figure in this document that you have not personally re-measured.** Two
figures in this subsystem's history were published, believed, and retracted — 15.7% end-to-end
(tautological probe) and "we have no terrain" (contradicted by the first grep). Both were stated
with confidence in multiple documents before anyone checked. **When a number here changes, change it
HERE — do not write a derivative `*-AUDIT.md`.**
