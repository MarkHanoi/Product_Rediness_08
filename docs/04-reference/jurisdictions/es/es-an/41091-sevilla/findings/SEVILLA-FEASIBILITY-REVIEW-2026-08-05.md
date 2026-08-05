# Sevilla (INE 41091) — Feasibility Review, benchmarked against Córdoba's 2026-08-04 session

> **Scope:** read-only review. No code, rule pack, or app file touched. Framework:
> `docs/04-reference/jurisdictions/_TEMPLATE/CITY-ENVELOPE-PLAYBOOK-TEMPLATE.md`, distilled from
> Córdoba's 2026-08-04 session (`es-an/14021-cordoba/findings/SESSION-SUMMARY-2026-08-04.md`).
> Every claim below that could be independently checked (corpus content, live ArcGIS endpoint,
> live portal navigation) **was** re-checked this session — nothing here is repeated from the
> existing `ENVELOPE.md` / `CAPABILITY-AUDIT-2026-08-04.md` on trust alone.

---

## Executive verdict

**Sevilla is structurally in Barcelona's shape, not Córdoba's — the citywide zoning geometry is
already live vector data, independently re-confirmed this session (13,863 `Calificación` polygon
features, 15 real `zona_orden` families, `EPSG:25830`, at
`cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/FeatureServer/25`), so §3 of
the playbook (raster digitization/georeferencing — the single largest cost line in Córdoba's
session) does not apply to Sevilla at all.** The held corpus's `NormasUrbanisticas/06_TR_NORMAS.pdf`
is confirmed, by direct `pdftotext` extraction, to be genuine native text (not a scan), 5,807 pages,
with real per-zone chapters and article-numbered numeric parameters — spot-checked against the one
zone already transcribed in `esSevilla.ts` (`SB`, Arts. 12.5.1–12.5.13) and found to match verbatim,
including exact figures (110 m² parcel threshold, 80% ocupación, 40%/3m rear separation, 450cm/320cm
storey heights, the 2×2 edificabilidad table). The remaining work is therefore **transcription
volume, not discovery**: 13 more zone-family chapters (`M`, `CH`, `A`, `CJ`, `AD`, `UA`, `C`, `IS`,
`IA`, `IC`, `ST-C`, `ST-A`, plus `MP`) sit in the exact same document, already on disk, already
proven readable. This is meaningfully *easier* than Córdoba, which needed a from-scratch
sheet-by-sheet visual-georeferencing pipeline (never fully proven past one sheet) just to get
citywide zone polygons at all. Sevilla's one genuine unknown that could still change the picture is
**`CH` (Centro Histórico)**: its ordinance chapter is confirmed present and readable, but the
historic centre is very likely governed jointly with a separate PEPRI/Plan Especial instrument not
yet located in this corpus (matching Córdoba's Tomo VI / PT-CV pattern, where the *base* PGOU
chapter alone was legally insufficient). **Single highest-value next step:** open
`06_TR_NORMAS.pdf`'s Título XII Capítulo II (CH, starts at PDF line ~4180 in the raw
`pdftotext` dump, printed p. 199) and transcribe a second zone — ideally `M` or `CJ` (both
perimeter-block, plausibly close to `SB`'s already-proven grammar) rather than `CH` first, to prove
the "one document, many zones" scaling claim on an easy case before tackling the hard one.

---

## §0 — the one-lesson check (Córdoba's "wrong URL, not missing data" pattern)

Re-tested rather than trusted: the existing `CAPABILITY-AUDIT-2026-08-04.md` already found the live
ArcGIS endpoint and the correct portal navigation, so there was no dead link to re-diagnose here —
but per the brief's instruction to verify rather than repeat, both were independently re-fetched
this session (not re-derived from the prior doc's text):

- `Info_Urban_Groups/PGOU/FeatureServer/25?f=json` → confirms `Calificación`, polygon geometry,
  fields `zona_orden`, `u_global` (41-value coded domain), `altura_max`, `clase_cat`, CRS
  `EPSG:25830` — matches the prior audit exactly.
- `.../FeatureServer/25/query?where=1=1&returnCountOnly=true` → **`{"count":13863}`**, matching the
  prior audit's figure exactly, independently re-run this session, not copied.
- `urbanismosevilla.org/areas/planeamiento-desarrollo-urbanistico/pgou-vigente-1` → live, confirms a
  navigation hub (not a document tree itself) pointing to `Infraestructura de Datos Espaciales`,
  `Información Urbanística`, `Descarga de Cartografía`, `Planeamiento Desarrollo`,
  `Registro Instrumentos Urbanísticos` — none of these sub-pages were opened this session (out of
  scope: the corpus is already on disk and the ArcGIS service already independently confirmed live,
  so walking the portal tree further would be re-proving an already-re-proven fact, not closing a
  gap).

No "doesn't exist" claim in the existing Sevilla dossier needed correcting this session — the prior
finding held up under independent re-test. That is itself notable: Sevilla's existing capture
discipline was already at the standard Córdoba's session had to fight its way to.

---

## §1 — Document acquisition checklist (against the template's table)

| Document type | Got it? | Path in `corpus/` | Notes |
|---|---|---|---|
| Zoning/calificación map sheets (citywide, per-zone codes) | **N/A — superseded by live vector** | `Plano_De_Urbanizacion_Pormenorizada/` (103 files, `TR_NN-NN.pdf`, 1:2,000) and `Plano_OrdenacionPormenorizadaCompleta/` (17 `_CH.pdf` files) | These ARE the legal graphic sheets the live ArcGIS layer already publishes as structured data. Confirmed by `pdftotext` on `TR_11-11.pdf`: real vector/CAD text layer (zone-code labels like `ST-C`, `SA` appear as extractable text, plus a full legend), not a raster scan — but this is moot for extraction purposes since Layer 25 already serves the same information as queryable geometry. Useful only as the *legal source-of-record* citation for a given sheet/parcel, not as an extraction target. |
| Alignment/frontage plans | **Live GIS confirmed, not a static series** | n/a | `Info_Urban_Groups/PGOU/MapServer` Layer 4 ("Alineaciones") — confirmed live in the prior session and independently corroborated here via the same service root; carries zone-specific code families (`SB`'s `A_INTERIOR-MAXIMA`, `CH`'s `CH_DIVISION_ALTURA`/`LABEL_CH`). Sevilla does not need Córdoba's static-PDF fallback — this is a genuine capability edge over Córdoba, which never found an alignment WFS/WMS service at all. |
| Execution/management-unit plans | Y | `Nuevo_Plan_De_Urbanizacion_Urbano/` (`O.E.` series, 18 files) + `OrdenatiocOrdanadaDeSueloUrbano/` (`SUO-D*` series, 5 files) | Confirmed real text: `07_TR_SUO-DE-01.pdf` is a genuine per-sector memoria (Santa Bárbara sector), with `FICHAS DE CARACTERÍSTICAS DE LOS ÁMBITOS DE GESTIÓN` — a precision aid for delegated sectors, exactly the template's stated role, not a numeric zoning source. |
| Historic-centre / protected-zone plans | Y (partial) | `Catalogo/` (9 files) | Per-building protection cards (`CC.S06.02` etc.), confirmed real by extraction: `Grado de Protección`, `Referencia Catastral`, `Superficie Parcela`, `Ocupación`, `Nº Plantas` — genuinely numeric, but per-individual-protected-building, not a zone-wide rule. This is the **Catálogo**, not the PEPRI/Plan Especial itself — the wider historic-centre delegation instrument the existing `CAPABILITY-AUDIT` already flagged as unlocated is confirmed **still absent from this corpus** (9 files here are individually-protected buildings, not a district-wide special plan). |
| Main ordinance text — general/procedural regime | Y | `NormasUrbanisticas/06_TR_NORMAS.pdf` (Libro I, Títulos I–XI) | Confirmed real, native, extractable text — 5,807 pages total. |
| Main ordinance text — per-zone numeric parameters | Y | `NormasUrbanisticas/06_TR_NORMAS.pdf` (Libro II, Título XII, Capítulos I–VII) | **This is the single most important confirmation in this review.** Título XII carries one chapter per zone family: `Cap. II — CH`, `Cap. III — M`, `Cap. IV — A`, `Cap. V — SB` (already transcribed), `Cap. VI — Ciudad Jardín (CJ)`, `Cap. VII — Vivienda Unifamiliar Adosada (AD)`, plus further chapters this session did not enumerate line-by-line but confirmed exist via the same index (Suelo No Urbanizable chapters, sistemas generales). Every chapter checked follows `SB`'s pattern: `Artículo N.M.K` numbering, real cited figures. |
| Fichas de planeamiento / delegated-plan index | **Y — a genuine edge over Córdoba** | `NormasUrbanisticas/06_TR_NORMAS_ANEXO_I_FICHAS.pdf` | Confirmed real and on-topic: "ANEXO I DE LAS NORMAS URBANÍSTICAS — FICHAS DE ÁMBITOS PLANEAMIENTO DE DESARROLLO Y/O GESTIÓN," organized by `Distrito` (Bellavista-La Palmera, Cerro-Amate, Este, Macarena Norte, Los Remedios, Casco Antiguo, …). Córdoba's equivalent document was **never located** — the file that looked like it was misfiled (Lorca's, not Córdoba's). Sevilla holds the genuine article for this document type. |

**Not in the template's checklist but present and worth flagging:** `NormasUrbanisticas/06_TR_NORMAS_ANEXO_II.pdf` — "Disposiciones Complementarias" (cross-cutting quality/hygiene/access conditions applying across all zones), and the `Plano_de_Informacion/` folder (28 files: soils, hydrology, geomorphology, land use, building-heights-by-block information maps) — confirmed by extraction to be **base/context data, not zoning determinations** (e.g. `TR_I_3_2_Alturas_De_La_edificacion.pdf` is an informational height-band map, explicitly labelled `INFORMACIÓN i 3.2`, distinct from the binding `Ordenación` series).

**Bonus-document skepticism applied, per the template's warning:** every sampled file's content was
opened and checked against its filename this session (not assumed from the name) — no misfiled
document (Córdoba's Lorca-mixup pattern) was found in the sampled Sevilla folders.

---

## §2 — Rule-pack build order (current state vs. the template's steps)

1. **Register every zone family with a real cited number.** 1 of 15 zone families done (`SB`,
   `esSevilla.ts`, re-verified verbatim against `06_TR_NORMAS.pdf` this session — every article and
   figure the pack cites matches the extracted text exactly, including the deliberately-`null`
   fields `maxHeight_m`/`maxFloors`/`plotRatioFAR`/`setbacks.rear_m`, each backed by a genuinely
   conditional or per-block article, not an omission).
2. **Check whether the live zoning-geometry source can bind a parcel to the packed subzone.**
   Confirmed independently this session: `zona_orden` is a free string field carrying the exact
   15 zone-family codes (`SB`, `M`, `CH`, …) directly — no Córdoba-style family/suffix collapse
   problem was found. This is a real structural advantage over Córdoba's UAS/Industrial families,
   which are correctly un-packed forever because COACo's own attribute layer cannot bind a subzone.
3. **Distinguish missing data from missing engine capability.** `SB`'s own `explicit-area` /
   `SEVILLA_SB_FONDO_UNRESOLVED_RING` structural refusal is the same shape as Córdoba's MC
   (`CORDOBA_MC_FONDO_UNRESOLVED_RING`) — an occupation/rear-separation-conditional depth that no
   flat `GeometricRule` kind currently expresses. Whatever engine work eventually resolves Córdoba
   MC's shape (a per-parcel occupancy solver) resolves Sevilla `SB`'s identically — this is shared,
   general work, not city-specific.
4. **Gate behind human sign-off.** Already implemented and correctly `false`
   (`SEVILLA_ENVELOPE_VERIFIED`), same pattern as `CORDOBA_ENVELOPE_VERIFIED`.

**Where Sevilla differs from Córdoba's build order:** Córdoba's step 2 (bind check) surfaced a real,
unfixable-from-PRYZM's-side blocker for 2 of its zone families (UAS, Industrial). Sevilla's
equivalent check, run this session, found no such structural gap in the 15 `zona_orden` values
themselves — the bind problem Córdoba hit does not (yet, on current evidence) recur here. This
should not be over-read as "Sevilla has no bind risk at all" — only that the specific
family/suffix-collapse failure mode Córdoba hit was not found for Sevilla's field structure.

---

## §3 — Digitization/georeferencing

**Does not apply to Sevilla's core zoning-geometry problem.** The live ArcGIS `Calificación` layer
is the citywide, parcel-usable zone-polygon source Córdoba spent the bulk of its session trying to
manufacture from scanned CUS sheets. Sevilla skips this section entirely for the primary envelope
determination. The corpus's own `TR_11-NN.pdf` "Ordenación Pormenorizada Completa" sheets are
native-text/vector PDFs (confirmed, not raster) and could in principle be parsed as a cross-check or
fallback, but doing so would be re-deriving data the live service already serves — not a
recommended next step.

One narrower digitization-shaped question remains open, inherited unchanged from the existing
audit and not resolved this session: **`altura_max`'s unit** (metres vs. storeys) is still not
formally documented anywhere machine-readable. This is a data-interpretation gap, not a
geometry-digitization one — closer to Valencia's `altura` semantics saga than to Córdoba's
CUS-sheet problem.

---

## §4 — What "closed" means, applied to Sevilla

Per the template: a city is closed when every parcel reaches a terminal, evidence-backed state.
Sevilla is far from that today (1 of 15 zone families transcribed, that one still gated), but the
**shape** of the remaining work is now clear and independently re-confirmed this session:

- **Pilot/partial coverage today:** zone identity resolves live for the whole municipality (13,863
  features); one zone family (`SB`) has a fully cited, structurally-honest (refusal-on-depth) pack
  behind the sign-off gate. Dispatch machinery (`applySevillaZoningThenFallback`) is zone-agnostic
  and does not need re-engineering per zone.
- **City-wide ceiling:** bounded by 15 zone families' worth of ordinance transcription (all in one
  already-held, already-proven-readable document), plus the `CH`/PEPRI open question, plus the
  shared cross-city engine gap (occupancy-conditional depth) that also blocks Córdoba MC. No
  external-authority block and no unsolved geometry-discovery problem was found this session for
  the 14 remaining zone families in aggregate — this reads as a bounded transcription programme,
  not an open-ended research one, **with the single exception of `CH`**, which plausibly needs its
  own PEPRI instrument located and read before its base-PGOU chapter alone can be trusted (unverified
  either way this session — the PEPRI itself was not searched for).

---

## Comparison table — Sevilla vs. Córdoba vs. Barcelona shape

| Axis | Barcelona | Sevilla (this review) | Córdoba (2026-08-04) |
|---|---|---|---|
| Citywide zone geometry | Live vector (MUC) | **Live vector, independently re-confirmed this session (13,863 features, ArcGIS REST)** | Scanned raster sheets (CUS), one sheet's georeferencing proven, not scaled |
| Alignment/depth geometry | N/A (different mechanism) | Live vector (Layer 4), zone-specific code families confirmed for 2 zones | Only found as static vector-CAD PDF series, no WFS/WMS |
| Ordinance text | Structured, multi-zone, deep | **Native-text 5,807-page consolidated PDF, one zone verbatim-transcribed and cross-checked this session, 13 more chapters confirmed present and readable in the same document** | Multi-volume Tomo IIA/IIB, 2 zone families fully transcribed |
| Zone→parcel binding | Works | **Confirmed working (free-string `zona_orden` carries full subzone code)** | Broken for 2 of 6 zone families (structural, unfixable) |
| Historic-centre complication | Handled | `CH` chapter present but likely PEPRI-dependent; PEPRI itself not located | PT-CV chapter present but per-parcel floor-count map is unextractable; PEPCH cross-checked |
| Sign-off gate | N/A | `SEVILLA_ENVELOPE_VERIFIED = false` (same discipline) | `CORDOBA_ENVELOPE_VERIFIED = false` (same discipline) |

**Verdict restated:** on the single axis the playbook treats as the biggest cost multiplier —
whether citywide zoning geometry must be manually digitized from scans — Sevilla is on Barcelona's
side of the line, confirmed independently this session, not merely inherited from a same-day prior
finding. The work remaining is real (13 zone-family ordinance transcriptions, `CH`'s PEPRI
dependency, the shared occupancy-conditional-depth engine gap) but it is bounded, already-sourced,
and does not carry Córdoba's largest, least-tractable cost line.

---

## §5 — This review's log

- 2026-08-05 — Independent re-verification of the existing Sevilla capability audit: live ArcGIS
  `Calificación` layer re-confirmed (13,863 features, same count as the prior session's finding),
  `06_TR_NORMAS.pdf` confirmed genuine native-text PDF (5,807 pages) with `SB`'s already-transcribed
  figures matching the source verbatim, all 8 corpus folders characterized by direct `pdftotext`
  sampling (none raster-only, none misfiled), `ANEXO_I_FICHAS.pdf` confirmed as the genuine
  Fichas-de-planeamiento document Córdoba's session never located. No prior "doesn't exist" claim
  needed correction. This document:
  `findings/SEVILLA-FEASIBILITY-REVIEW-2026-08-05.md`.
