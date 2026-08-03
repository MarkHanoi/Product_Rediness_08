# National Discovery Methodology Standard

**Status:** normative · **Created:** 2026-08-03 · **Owner:** orchestrator

## Why this exists

Between 2026-08-02 and 2026-08-03, **nine of fourteen** standing "the authority does not publish
this" blockers across Balears, Canarias, Barcelona and Huesca were overturned in a single day. Not
one was overturned because a publisher released new data. Every one was overturned because the
**discovery method that produced the negative was incomplete**.

That is a platform reliability defect, not a series of municipal mistakes. A false "data absent"
conclusion is uniquely dangerous because **refusing looks safe**: it produces no visible error, no
failing test and no user complaint, so it survives indefinitely while silently suppressing coverage
the authority already publishes.

This document defines when PRYZM is *allowed* to conclude that authoritative data is not published.

---

## §1 — The Discovery Exhaustion Rule

> **A conclusion of absence may not be recorded until every applicable discovery strategy for that
> platform has either (a) succeeded, (b) failed WITH EVIDENCE, or (c) been ruled inapplicable with a
> stated reason.**

Three corollaries, each derived from a measured failure:

1. **A failed guess is not an absence.** Zaragoza's blocker read *"a 28-typename sweep returned HTTP
   400 on all 28."* HTTP 400 from a WFS means *unknown typename* — it is evidence about the guesses,
   not the city. `urbanismo:Calificaciones_Urbanas` answered HTTP 200 and always had.
2. **An advertised inventory is not the inventory.** Zaragoza's WFS `GetCapabilities` advertises 178
   typenames and omits the one that mattered. Capabilities is a **publication choice**. Only
   `DescribeLayer` — asking what each *drawn* layer is made of — exposed all 47 `urbanismo:` feature
   types, **25 of them unadvertised**.
3. **Absence in one artefact class is not absence in the jurisdiction.** València was ruled blocked
   because 89.81% of its 542 planning *registers* are scans. Nobody looked for a GIS layer. The city
   publishes `PGOU - Alineaciones` as ArcGIS REST / GeoJSON / WFS / WMS / CSV.

### Mandatory evidence for any absence claim

| Field | Requirement |
|---|---|
| Search log | Every URL attempted, with HTTP status **and byte count** |
| Positive control | A query of the same shape that DID return data (proves the mechanism works) |
| Negative control | A query that SHOULD return nothing (proves the filter discriminates) |
| Discovery stages | Which stages of §2 were run, and which were ruled inapplicable and why |
| Reproducibility | A committed, re-runnable probe — not a transcript |
| Confidence | `VALIDATED` / `STRONG` / `UNVERIFIED` — never bare "not available" |

⛔ **Never fabricate a URL to test.** A 404 on an invented URL *manufactures evidence of absence*.
Only report absence for paths that were genuinely referenced somewhere real.

---

## §2 — Discovery Coverage Matrix (mandatory stages by platform)

### GeoServer / OGC
`WMS GetCapabilities` → **`DescribeLayer` on every layer** → `WFS GetCapabilities` →
`DescribeFeatureType` on every typename discovered by *either* → `GetLegendGraphic` + SLD rules →
`GetFeatureInfo` at real points → `MetadataURL` follow → layer groups → namespace/workspace traversal
(non-default workspaces) → alternate service versions.

⚠ Known traps: `bbox` + `cql_filter` together returns **HTTP 500** on some GeoServer builds and reads
as "no samples". Paging without `sortBy` returns **HTTP 400** (*"Cannot do natural order without a
primary key"*). `MinScaleDenominator` can make a tight bbox return a **silent empty**.

### ArcGIS
`/rest/services?f=json` → folder recursion → `MapServer` **and** `FeatureServer` → layer manifests →
**sublayers and group layers** → **coded-value domains** → relationships → related tables →
attachments → downloadable replicas → renderer metadata → query capabilities.

⚠ The web viewer routinely hides layers the service still answers. Audit the **service**, never the
viewer.

### PDF publications
Object-stream inspection → **vector path extraction** → font resources (absent + high path count =
outlined CAD, not a scan) → raster XObject census → **ICCBased / `SCN` colour operators** →
`page.rotation` (display vs unrotated space) → degenerate rects → subpath chaining → clipping paths →
legend panel binding by graphics state → **printed coordinate grid / graticule** → `/Measure`, `/VP`,
`/GPTS`, `/LGIDict`, `/Neatline` → optional-content groups → embedded producer/title strings → OCR
**only** after all the above fail.

⚠ Never call a PDF unreadable without running these. Huesca's sheets were recorded as *"all paint
colours are greyscale"*; a colour-aware recount found **1,595 and 3,020 non-grey stroke items** and
**41/39** distinct stroke classes, not 26.

### Static sites / catalogues
Download catalogues → metadata pages → sitemap → **linked viewer JS bundles** (embedded service
URLs) → downloadable archives → CKAN/`format_autocomplete` facets → CSW/GeoNetwork → INSPIRE ATOM
feeds → **Wayback** → transparency/consultation packages.

⚠ Catalogue search by domain term produces false negatives: `datos.madrid.es` returns **count=0** for
`alineacion`, while the alignment ships as a *layer inside* a ZIP titled "Plano de ordenación".
⚠ A feed index can be incomplete while the file exists: Madrid `28079` is missing from the 178
per-municipality ATOM entries, yet the URL pattern returns **200** and a 180 MB package.

---

## §3 — False-Negative Taxonomy

Each entry: root cause → symptom → how found → fix → regression test.

| # | Failure mode | Symptom | Fix / test |
|---|---|---|---|
| 1 | **Capabilities as inventory** | Layer absent from GetCapabilities but served | `DescribeLayer` crawl; assert discovered ⊇ advertised |
| 2 | **Typename guessing as discovery** | N× HTTP 400 read as absence | Ban guess-sweeps as evidence; require server-authored names |
| 3 | **Bulk product read, query endpoint ignored** | Field missing from ZIP, present via `GetFeatureInfo`/`/query` | Check both access shapes before refusing |
| 4 | **Wrong artefact class generalised** | "89.81% are scans" applied to a GIS layer nobody sought | Scope every negative to the artefact it measured |
| 5 | **Measured after lossy reprojection** | Legal band flips | Fetch native metric CRS, measure native, reproject only to display. **37.5% of Murcia segments collapsed to zero length in 4326** |
| 6 | **CRS conflation in one record** | Wrong-CRS bbox answers "no" for every real parcel | Record CRS + axis order per source; guard test with in-region metre coords |
| 7 | **Key-space mismatch** | HTTP 200 + zero matches | Catastro keys on **DGC, not INE** (Madrid 28900, Huesca 22901). Assert non-empty, not HTTP 200 |
| 8 | **Wrong feature type sampled** | "No floor data" | Catastro `Building` is nil; `BuildingPart` is **99.9998%** populated |
| 9 | **Colour-blind / trap-blind extractor** | False zero | ICCBased/`SCN` decode, rotation, degenerate rects, subpath chaining — all four produce zeros |
| 10 | **Status code ≠ availability** | HTTP 200 + a maintenance page | Madrid CE sheets: 200 with **2,303 bytes of HTML**. Check `%PDF` magic bytes |
| 11 | **Structured channel silently truncates** | 200, well-formed, 0.27% of content | BOCM XML `<texto>` = 1,746 chars vs PDF 642,108. Assert XML≈PDF length parity |
| 12 | **Printed caption trusted over measurement** | Shape right, scale wrong | Córdoba prints 1:2000, measures **1:1686.8** — 18.57% inflation, invisible to inspection |
| 13 | **Match rate without a decoy control** | "93% matched" | Nearest-neighbour matches ~93% at **any** offset. Score a deliberately-wrong offset; demand ≥3× |
| 14 | **Surveyed ≠ normative** | Standing building published as entitlement | Zaragoza `Alturas_Edificios` vocabulary contains `SOLAR`, `MARQ.`, `E.T.` Check the vocabulary |
| 15 | **Geometry without published semantics** | 367× separation, still not adoptable | SLD keys a bare code with no title. Proximity is necessary, not sufficient |
| 16 | **Polygon-at-click ≠ buildable footprint** | A street returned as buildable, behind a clean 200 | València layer 212 tiles the carriageway. Take the **building-class union** |
| 17 | **Partial-null → zero** | Confident classification, zero inset on one edge | `front.value ?? 0`; honesty flag must fire on **any** unknown edge, not all |
| 18 | **Unit-domain confusion** | FAR of 2325.0 | Read the declared `UNIDAD`; sanity-bound ratio fields |
| 19 | **Renderer limit read as data limit** | "Cannot publish" when data is complete | Balears: `closeTop: true` hard-coded. Ask which layer actually blocks |
| 20 | **Registered ≠ reachable** | Packed zones no click can reach | Telde: 15 zones, `grep isInTelde apps/` → 0. Audit reachability by call graph |

---

## §4 — The Checklist (required before any "data absent" is recorded)

- [ ] Every §2 stage for this platform run, or ruled inapplicable **with a reason**
- [ ] Positive control returned data through the same mechanism
- [ ] Negative control returned nothing
- [ ] Every URL logged with status **and byte count**; binaries verified by magic bytes
- [ ] No fabricated URLs used as evidence
- [ ] Key space verified (INE vs DGC vs municipal code)
- [ ] CRS and axis order recorded per source, from published metadata — never inferred from fit
- [ ] Any geometric claim carries a **paired control** and a **wrong-offset decoy**
- [ ] Probe committed and re-runnable
- [ ] Confidence recorded as `VALIDATED` / `STRONG` / `UNVERIFIED`
- [ ] `failed` is distinguishable from `empty` in the output

**Unverified assumptions are technical debt, not established facts.** Anything short of `VALIDATED`
is a scheduled re-audit, not a closed question.
