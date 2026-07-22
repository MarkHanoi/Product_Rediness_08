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

⚠⚠ **THE END-TO-END FIGURE IS CURRENTLY UNQUOTABLE.** 5.8% was computed when layer 6 stood at 36.9%.
It is **not** the product of the layer percentages (0.83 × 0.783 × 0.369 ≈ 24%, not 5.8%), so the
chain involves conditioning this document does not record. **Do not multiply the layers and publish
the result.** Re-derive it and cite the derivation. A stale cell that says "stale" is safe; one that
still says "5.8%" is not.

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
3. **Spain-wide scaling is currently blocked by the block dissolve, not by rules.** Barcelona 2/2,
   Madrid 2/4, Córdoba 0/3. The L-581 clamp above is what unblocks the other two.

*Canonical: `docs/04-reference/spain/barcelona-catalonia/BARCELONA-DATA-PIPELINE.md`*

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
`spain/barcelona-catalonia/BARCELONA-DATA-PIPELINE.md` before assuming otherwise.

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
| **Read before assuming a dataset exists** | `docs/04-reference/spain/barcelona-catalonia/BARCELONA-DATA-PIPELINE.md` |
| Every legal parameter + confidence tier | `.../barcelona-catalonia/L-583-LEGAL-PARAMETERS-SOURCED.md` |
| Source coverage, heights, terrain, the plan | `docs/04-reference/spain/SPAIN-GEODATA-SOURCE-COVERAGE.md` |
| Context tile performance architecture | `docs/04-reference/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` |
| Live issue log (rows L-576 → L-585) | `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` |

---

## Maintenance rule

**Do not quote a coverage figure in this document that you have not personally re-measured.** Two
figures in this subsystem's history were published, believed, and retracted — 15.7% end-to-end
(tautological probe) and "we have no terrain" (contradicted by the first grep). Both were stated
with confidence in multiple documents before anyone checked. **When a number here changes, change it
HERE — do not write a derivative `*-AUDIT.md`.**
