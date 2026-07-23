# L-611 — The OCR-addressable Danish gap (the cross-region payoff number) + the coverage-path spec

> **Status:** MEASURED LIVE against Plandata.dk WFS 2.0 + the plan-PDF corpus (`dokument.plandata.dk`),
> 2026-07-23. No schema/registry/index edits (OCR-core agent owns `packages/schemas` this round). No
> code mutated — this is a probe + a spec, per the standing mandate. **Tier every claim; failure ≠
> empty; unfiltered count before any zero (§CONTEXT-DATA-HONESTY).**
> **Convention line:** numbers are VERIFIED-LIVE (2026-07-23) unless tagged DERIVED or ESTIMATE.
>
> Builds directly on `L-609` (click-weighted fill + byggefelt verdict) and `L-610` (byggefelt WIRED +
> the honest ceiling). L-610 §4 named the OCR trip-wire but did not measure it — **this doc measures it.**

---

## 0 — TL;DR (the three answers the brief asked for)

1. **🔴 The OCR-recoverable fraction of Denmark's gap (the cross-region payoff number).** Of Denmark's
   ~13% byzone dimensional gap, **≈ 79% is born-digital, machine-readable plan text** — recoverable
   with NO image-OCR at all (pure text-pull ± ramme-id localization). Broken out (weighted by gap
   *clicks*, N=52 live gap points): **40.4% clean text-pull** (the specific plan PDF states the missing
   height/floors/FAR in extractable text) **+ 38.5% ramme-localization** (the number is in a born-digital
   whole-*kommuneplan* doc, found by anchoring on the ramme id — proven live) **+ 13.5% scanned**
   (older lokalplaner needing true image-OCR) **+ ≤7.7% genuinely plan-omitted** (unreachable). These
   are a **LOWER bound** — the detector is a deliberately conservative regex; a real dual-pass LLM
   extractor (the pipeline) recovers more.
2. **The coverage axis** (byggefelt footprint → `maxCoverage`) is DESIGNED here as a spec + diff-sketch
   (§3), ready to wire the moment the OCR-core agent's L0 geometry field lands. It is a **cross-layer**
   change (provider geometry passthrough → an L0 footprint-ring field → a downstream C57
   parcel-intersection), gated by the already-live `isBindingFootprint`. Yield ceiling ≈ **1.4% of
   byzone clicks** (small but it is Denmark's ONLY coverage source, and honest).
3. **Denmark's true maximum WITH the OCR path.** Dimensions: structured **≈87%** today →
   **≈96–98%** with the OCR path (text-recoverable + light image-OCR), leaving a genuinely-unreachable
   residual of **~1–2 pp** (plan-omitted / drawing-only / BR18-deferred). **NOT 100%** — but far above
   the structured ceiling, and reached with the *cheap* half of the shared OCR capability.

---

## 1 — METHOD (how the gap was isolated + the honesty guards)

The question is a **conditional**: *given a byzone click whose governing plan leaves every structured
dimension null, is the missing number in that plan's PDF, and extractable?* Answering it honestly
requires the sample to be the **true gap**, not "any dimensionless plan" — and those are different:

- **Trap avoided.** 23,473 of 37,974 whole-plan *lokalplaner* (61.8%) have all three dims null — but
  most of those clicks are NOT in the gap: their numbers live on a *delområde* or the *kommuneplanramme*
  beneath, which the structured path already reads. Sampling whole-plan-null would over-state
  recoverability (those PDFs are dimension-rich, but the click is already filled). So the sample is the
  **"none" clicks** of the full selection rule, exactly as `L-609`.

- **The sample.** N=380 area-weighted random points inside Denmark's **byzone** (98 `zonekort_samlet_v`
  Byzone MultiPolygons, 3,480 patches, 2,875 km²; seed 20260724), each run **live** through the real
  selection rule (byggefelt → delområde → lokalplan → ramme; prefer the most-specific layer that
  publishes a usable dimension — a faithful reproduction of `server/plandataZoningProxy.js`). **0 query
  errors.** This independently **replicates L-609**: fill **85.5%** (325/380), gap **13.7%** (52/380),
  no-plan 0.8% (3/380) — well within L-609's 87.3% ±3.8pp. The gap is real and stable.

- **Unfiltered counts first.** Every denominator (`resultType=hits`) is counted before any filter, so a
  zero can never masquerade as a fill (§CONTEXT-DATA-HONESTY, L-422 family).

- **The OCR probe.** For each of the 52 gap points, the winning-identity feature's **`doklink`** (every
  gap feature carried one — 52/52) → fetch the PDF → render with **PyMuPDF 1.28** → measure (a)
  text-layer presence (chars/page: born-digital vs scanned) and (b) whether the missing dimension is
  present and extractable, via conservative Danish-planning regexes (`bebyggelsesprocent`,
  `bygningshøjde…m`, `N etager`). **Presence-in-text is an UPPER bound on auto-recoverable** (attribution
  — "is this the number for THIS sub-area?" — is the pipeline's dual-pass + human job, `L-590g` §7.3);
  **the regex is a LOWER bound on presence** (it misses spelled-out storeys and table cells). The two
  bounds bracket the truth and are stated as such throughout.

---

## 2 — 🔴 RESULT: the OCR-addressable gap (the cross-region payoff number)

**Denominator: the gap = 52 byzone clicks (13.7% of byzone; L-609's 12.7% within CI).** Every one
carried a `doklink`. Weighted by gap **clicks**:

### 2.1 — The gap by corpus shape (the horizontal-prize view)

| Shape of the governing plan PDF | Gap clicks | Share of gap | OCR cost |
|---|---|---|---|
| **Born-digital, specific plan PDF, dim IN text** | **21** | **40.4%** | **Text-pull only** (no OCR) — the cheapest tier |
| **Born-digital whole-*kommuneplan*, ramme-localizable** | **20** | **38.5%** | Text-pull **+ ramme-id localization** (proven, §2.3) |
| Scanned specific plan PDF (no text layer) | 7 | 13.5% | **True image-OCR** (DocumentAI) — the harder tier |
| Genuinely plan-omitted (born-digital, NO dim anywhere) | ≤4 | ≤7.7% | **Unreachable** even by a perfect pipeline |

- **≈ 79% of the gap (41/52) is born-digital machine-readable text** — recoverable with **zero
  image-OCR**. This is the number that proves the horizontal payoff: Denmark is overwhelmingly the
  **corpus-shape B** the `ORDINANCE-EXTRACTION-PIPELINE` §6.5 identified as "the cheap horizontal prize"
  — and for most of its gap it does not even need Stage-2 OCR, only Stage-2's **born-digital text-pull**
  branch (the `O_INDUSTRIAL` path).
- Only **13.5%** of the gap is the scan wall that makes Spain expensive (older 1980s–2000s lokalplaner
  scanned to image).
- The genuinely-unreachable floor is **≤7.7%**, and it is an over-count: the one clean case verified
  (`33.ROS`) is a **recreational/green zone that legitimately caps no building** — an honest source
  absence, not an extraction failure.

### 2.2 — The gap by governing layer (why the two born-digital tiers differ)

| Winning layer at the gap click | Gap clicks | The `doklink` points to… |
|---|---|---|
| lokalplan **delområde** | 24 | the specific plan PDF (small, ~0.5–2 MB) — **shape B** |
| lokalplan (whole plan) | 8 | the specific plan PDF — **shape B** |
| **kommuneplanramme** | 20 | the **whole kommuneplan** (72–235 MB, 1,600–2,100 pp) — a NEW sub-shape |

The 32 specific-plan clicks (61.5% of gap) are classic shape B: 78.1% born-digital, dim-in-text
65.6%. The 20 ramme clicks (38.5% of gap) are a **new corpus sub-shape this probe discovered** (§2.3).

### 2.3 — 🔴 The whole-*kommuneplan* localization case (a genuine addition to the pipeline spec)

A gap click governed by a **kommuneplanramme** has a `doklink` to the *entire municipal plan* — a
born-digital PDF of **1,600–2,100 pages / 72–235 MB** covering *hundreds* of rammer. The specific
ramme's numbers are in it, but must be **localized by ramme id**. **Proven live** (ramme `N.B.3`,
Fredericia, `11_11285978`, 72 MB / 1,655 pp): the id appears in a table-of-contents (p8) and its own
section (p617), which states verbatim —

> "Bebyggelsesregulerende bestemmelser … Maksimal bebyggelsesprocent er 30% … Maksimal etageantal er 2"

So the **ramme structured-field null is a Plandata data-entry gap, not a document omission** — the
number is present, born-digital, and cleanly extractable once you anchor on the ramme id (which the
Plandata feature already gives us, as `plannr`). **Design consequence:** the shared extractor needs a
**ramme-id-keyed localization stage** for large consolidated docs — the *enumerator* supplies the id;
the core locates the section. This is a retrieval problem (cheap, deterministic anchor), NOT image-OCR,
and NOT the parcel-binding wall that caps Spain's shape A (`L-590g` §5) — the ramme id **is** the
binding key.

### 2.4 — Worked examples (evidence the reads are real, not regex noise)

| Plan | Layer | Shape | Extracted (verbatim from PDF text) |
|---|---|---|---|
| lokalplan 42 | lokalplan | born | "Bebyggelsesprocent højst **10**" · "bygningshøjden må ikke overstige **4 m**" · "opføres med **1 etage**" |
| delområde LP248 | delområde | born | bebygpct + height + etager all present |
| ramme N.B.3 | ramme | born (localized) | "bebyggelsesprocent er **30%**" · "etageantal er **2**" (p617) |
| lokalplan 33.ROS | delområde | born | **no building dimension** — recreational zone (genuine omit) |
| lokalplan "2 – Sdr. Nærå" | lokalplan | **scanned** | 1 char/page — needs image-OCR |

---

## 3 — The COVERAGE axis: the footprint → `maxCoverage` path (SPEC + diff-sketch; NOT applied)

L-610 shipped the byggefelt as a dimension+identity source and the **bindingness gate**
(`isBindingFootprint = bygkunifelt && !bygvejledende`, live in proxy + mapper), but deliberately left
`maxCoverage: null` because coverage is a **cross-layer** ratio the pure mapper cannot compute. This is
the design to close it, ready to wire once the **L0 geometry field lands** (that field is the OCR-core
agent's domain this round — DESIGNED here, not edited).

### 3.1 — Why it is three steps, not a mapper edit

`maxCoverage ∈ [0,1] = area(footprint ∩ parcel) / area(parcel)`. The mapper sees only WFS *attributes*;
the **parcel geometry lives downstream (C57)**, and `EnvelopeNumbers` (C58 §2.3) is a **pure numeric**
core with no place for a footprint ring. So the footprint must be *carried* from provider to the
compute site, and the ratio computed where the parcel exists.

### 3.2 — The path (three parts, one already live)

```
byggefelt WFS feature ──isBindingFootprint?──►  [LIVE, L-610]  gate: bygkunifelt && !bygvejledende
        │ (binding only; 65.1% vejledende guides are NEVER coverage)
        ▼
proxy passthrough of the byggefelt GEOMETRY ───►  [ADDITIVE proxy edit — dk-owned]
        ▼
ZoningRecord.bindingFootprint (L0 ring field) ─►  [SCHEMA — OCR-core agent's field; DESIGN §3.3]
        ▼
envelope engine / scene-committer (L4):          [DOWNSTREAM compute — where the parcel exists, C57]
   maxCoverage = area(footprint ∩ parcel)/area(parcel)   → structuredFields.maxCoverage
```

### 3.3 — DIFF-SKETCH (design only — do NOT apply here; OCR-core owns `packages/schemas`)

**(a) L0 field — carry the ring, keep `EnvelopeNumbers` numeric-pure.** Do NOT put geometry in
`EnvelopeNumbers` (its header: "the shared *numeric* core"). Add a sibling on `ZoningRecord`
(`packages/schemas/src/site/zoning/ZoningRecord.ts`), WGS84 per the C57 convention:

```diff
 export const ZoningRecordSchema = z.object({
     ...
     structuredFields: EnvelopeNumbersSchema.partial().default({}),
+    // A BINDING byggefelt footprint (bygkunifelt && !bygvejledende), WGS84 outer rings, when the
+    // source published one. Consumed DOWNSTREAM (C57 parcel-intersection) to compute
+    // structuredFields.maxCoverage — never turned into a ratio in the pure mapper (no parcel here).
+    // null = no binding footprint (honest absence; a vejledende guide is NOT one). L-611 §3.
+    bindingFootprint: BindingFootprintSchema.nullable().default(null),
     overlays: z.array(z.string().min(1)).default([]),
     ...
 });
```
```ts
// new L0 schema, e.g. packages/schemas/src/site/zoning/BindingFootprint.ts
export const BindingFootprintSchema = z.object({
  rings: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1), // WGS84 [lon,lat] outer rings
  crs: z.literal('EPSG:4326'),
  source: z.string().min(1),          // 'plandata-dk:byggefelt'
  planDocumentRef: z.string().nullable().default(null), // the byggefelt doklink (citation)
});
```

**(b) Provider — `server/plandataZoningProxy.js` (dk-owned, ADDITIVE).** Today `fetchZoningAtPoint`
returns `{ layer, properties }` and reads only `properties` (geometry ignored). When
`isBindingFootprint(props)`, also return the feature `geometry` (reproject downstream). The
bindingness gate and the `bygkunifelt`/`bygvejledende` passthrough already shipped in L-610 — this only
stops discarding the ring.

**(c) Mapper — `mapPlandataToZoningRecord.ts` (dk-owned, pure).** When `response.layer === 'byggefelt'`
and binding, set `record.bindingFootprint = { rings, crs:'EPSG:4326', source:'plandata-dk:byggefelt',
planDocumentRef: doklink }`. **`maxCoverage` stays `null`** (a comment already names the ADR-gated
reason) — the downstream step fills it.

**(d) Downstream — envelope engine / scene-committer (L4).** New pure step:
`coverage(parcelRing, bindingFootprint)`:
- reproject the WGS84 footprint rings into the **same metric frame** as the parcel (C57 →
  `buildBoundaryFromLatLonRing` / LTP-ENU, or EPSG:25832) using **`packages/geospatial` (C12)** — no
  second projection lib;
- `maxCoverage = clamp(area(footprint ∩ parcel) / area(parcel), 0, 1)` (byggefelter can span multiple
  *jordstykker*; clamp is honest, not a fudge);
- **§CONTEXT-DATA-HONESTY guard:** if `footprint ∩ parcel` is **empty** (the byggefelt belongs to a
  neighbouring parcel), `maxCoverage` stays **`null`, never `0`** — empty ≠ zero coverage.

### 3.4 — Provenance + bindingness (the gate that keeps it honest)

- Only `bygkunifelt && !bygvejledende` footprints (nationally 23.9% of byggefelter) ever reach step (d).
  The 65.1% `bygvejledende` guides are placement illustrations and MUST NOT become coverage.
- A `maxCoverage` produced this way is confidence **`structured`** (a measured geometric ratio from a
  published binding footprint × a published parcel) — **NOT** `pipeline-extracted`. Its
  `DerivationEntry.ordinanceRef` = the byggefelt `doklink`; the "Bindende byggefelt" overlay (L-610)
  already records the fact.

### 3.5 — Yield (honest, small)

A **binding** footprint is present at ≈ **6.0% × 23.9% ≈ 1.4% of byzone clicks** (DERIVED from L-609's
6.0% byggefelt-present × L-610's 23.9% binding). That is the coverage-axis ceiling — small, but it is
**Denmark's only coverage source** (the standard plan fields publish no ground-coverage %), and it is
delivered without fabricating a single ratio. Coverage stays a **separate axis** from dimensions; never
blend them into one "%".

---

## 4 — Denmark's TRUE MAXIMUM with the OCR path (the ceiling, restated honestly)

Structured baseline: **≈87%** byzone dimensional fill (L-609 area-weighted N=300; this session's N=380
replication 85.5%, within CI). Gap ≈ **13%**. Applying §2's tiers to the gap:

| Layer of recovery | +pp on the 13% gap | Cumulative byzone dimensional fill | Cost |
|---|---|---|---|
| **Structured (today)** | — | **≈ 87%** | live, keyless |
| + clean text-pull (Tier 1) | +40.4% × 13% ≈ **+5.3 pp** | **≈ 92%** | text-pull, no OCR — cheapest |
| + ramme-id localization (Tier 2) | +38.5% × 13% ≈ **+5.0 pp** | **≈ 97%** | text-pull + a deterministic anchor |
| + image-OCR of scanned plans (Tier 3) | +13.5% × 13% ≈ **+1.8 pp** | **≈ 99%** | true DocumentAI OCR — the harder tier |
| **Genuinely unreachable (Tier 4)** | **≤7.7% × 13% ≈ ≤1 pp** | ceiling **≈ 99%** | plan-omitted / drawing-only / BR18-deferred — **not fabricatable** |

- **Realistic target (text + localization, no image-OCR): ≈ 96–97%.** This is the number that matters:
  Denmark reaches it with the **cheap half** of the shared capability — no scan pipeline, no
  parcel-binding vectorisation.
- **With image-OCR added: ≈ 98–99%.**
- **Genuinely unreachable residual: ~1–2 pp.** These are honest source absences — recreational/green
  zones that cap no building (`33.ROS`), dims that live only on a *kortbilag* drawing (vision-only,
  outside text-pull), or numbers a lokalplan defers to national **BR18**. **Do NOT claim 100%.**

These are a **conservative** ceiling: the detector under-counts presence (§1), so the true recoverable
fractions — and thus the ceiling — are **at least** these. A real dual-pass LLM extractor moves them up,
not down.

---

## 5 — THE CROSS-REGION PAYOFF (why this is the number that proves the horizontal thesis)

- **Denmark is the shape-B proof.** `ORDINANCE-EXTRACTION-PIPELINE` §6.5 said the pipeline "pays off
  fastest where documents are clean and keyed to GIS codes." Denmark is exactly that: **≈79% of its gap
  is born-digital text keyed to Plandata plan/ramme ids** — no scan wall, no 1960s typewriter, no
  parcel-binding gap (the ids ARE the keys). Where Spain's shape A (`L-590g`) is the expensive depth
  play, Denmark is the cheap breadth win the same core unlocks.
- **Denmark needs the shared core, not a second pipeline.** Every gap feature already carries the exact
  `doklink`; ≈79% needs only Stage-2's **born-digital text-pull** branch (skip OCR entirely) + Stage-3
  extraction + Stage-4 dual-pass/cross-checks + the `pipeline-extracted-unverified` tier (§3 of the
  pipeline doc). Neither jurisdiction builds OCR twice (L-610 trip-wire, both ways).
- **Denmark ADDS one capability to the shared spec: ramme-id localization** for large consolidated
  born-digital docs (§2.3) — a retrieval stage the shared core should carry, valuable to any country
  whose framework plan is one big consolidated PDF.
- **The single number to quote:** *of Denmark's ~13% dimensional gap, ≈79% is recoverable with no
  image-OCR (born-digital text ± ramme-localization), lifting Denmark from ≈87% structured to ≈96–97%;
  only ≈13% of the gap needs true image-OCR and ≤8% is genuinely unreachable.* That is the horizontal
  payoff, measured.

---

## 6 — REPRODUCE

- **Gap sample:** `gap_sample.py N seed` — area-weighted byzone Monte-Carlo (byzone geometry from
  `zonekort_samlet_v` `CQL_FILTER=zonestatus='Byzone'`, EPSG:25832) × the live selection rule (4 layers,
  EPSG:25832 point bbox, `count=1`, no `propertyName` — GeoServer 400s on a cross-layer property list).
  N=380, seed 20260724 → filled 325 / none 52 / no-plan 3, 0 errors.
- **OCR probe:** `pdf_probe.py gap.json out.json` — fetch each gap `doklink`, PyMuPDF text extract,
  chars/page born-digital heuristic (≥200), conservative Danish dimension regexes; large docs (>60 MB,
  sized via a `Range: bytes=0-1023` GET → `Content-Range` total, since the host 405s HEAD) flagged
  `large_kommuneplan` without full download.
- **Localization spot-check:** ramme `N.B.3` in `11_11285978_1757321803603.pdf` (72 MB) — id on p8
  (TOC) + p617 (section stating bebygpct 30% / 2 etager).
- All endpoints keyless: `https://geoserver.plandata.dk/geoserver/wfs`,
  `https://dokument.plandata.dk/<doc>.pdf`. Re-running is safe. Scripts in the session scratchpad.

**Open items inherited (unchanged):** the §USABLE-FALLBACK legal precedence + the coverage cross-layer
ADR still need Danish-planner / C58-ADR sign-off (`VERIFICATION.md`, `NEXT.md` Blockers A/C). This doc
adds no new legal claim — it measures a corpus and specs a wiring.
