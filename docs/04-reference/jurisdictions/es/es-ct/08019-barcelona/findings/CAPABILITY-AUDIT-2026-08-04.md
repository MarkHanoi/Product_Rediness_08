# Barcelona (08019) — Capability Audit — 2026-08-04

## Executive Summary

Barcelona is PRYZM's flagship pilot and, on the evidence, it earns that status: it is the only
Spanish city with a **live, founder-source-accepted, block-constructed buildable envelope**
(clau 13a/13b/12, PGM Art. 242.2 depth + Art. 327/328 height), a **measured** C63 completion
scorecard (all seven axes assessed, `honestyOk: true`), a signed clau-18 partial-area route
(`BCN_REFOS_OV_CERTIFIED === true`, verified live in code), and a founder-signed scope decision on
the 2,600-plan clau-22a delegation. Coverage of private buildable land with *any* dispositive answer
(constructed envelope or cited legal refusal) is high (~91.7% of clicks reach a true answer or a
correct refusal), but the **share that reaches a full numeric envelope is measured at 36.5% on the
C63 axis** (60.6% coverage, most of it at `estimated-ruleset`/`block-constructed` confidence, none
at `structured` or `authoritative`), against a **repo-measured ceiling of ~37–38%** on the PGM alone
— i.e. Barcelona's ENVELOPE axis is essentially *at its ceiling*, and the remaining gap
(clau 18 residual, clau 22a, 12b, bare 20a-remainder) is **structurally delegated by Catalan law to
~2,600 site-specific instruments**, not an engineering backlog. Two further legal-correctness gaps
are open and material: **Arts. 327/328 height tables may be under-published by 0.45–1.95 m across
44% of buildable land pending one founder signature (SIG-2 prepared, unsigned)**, and **heritage
(BCIN/BCIL/BCIU) and flood (ZFP/DPH) overlay resolvers exist, are schema-verified against live
services, and are entirely unwired into the dispatcher** — every Barcelona envelope PRYZM emits
today is a legal upper bound with a missing ceiling on that axis, a fact the codebase itself states
in a comment (`index.ts:793`). Airport servitude and coastal-strip constraints are, by contrast,
genuinely low-relevance for Barcelona's *private buildable* land (El Prat's servitude reach is
documented in code as covering Viladecans/Gavà/Sant Boi/Castelldefels, not Barcelona city; the
coastal strip is mostly public port/beach land outside the private buildable denominator) — treating
them as equally blocking as heritage/flood would be a copy-paste overstatement of a Balears-style
audit that does not transfer cleanly to Barcelona's inland-Eixample-dominated buildable-land shape.

## Capability Rating

**Indicative Ready** for the alineació-de-vial fabric (13a/13b/12, ≈43% of buildable land at
`block-constructed`, 0.7 weight) — a real, cited, founder-accepted construction, not a lookup, but
explicitly not `authoritative`/`structured` (no municipal determination has been *issued* or
*published as data*) and missing the heritage/flood overlay ceiling.

**Legally Blocked** for clau 18's un-certified 73.6% residual, clau 22a (17.5%, Art. 350.1 defers
height/band to ~2,600 undocumented Pla Parcials), clau 12b (2.44%, the *tram de vial* domain is
undefined by the ordinance itself), and clau 22@ (2.06%, the PGM states no *profunditat edificable*
by design) — these are not missing PRYZM engineering, they are constraints the Catalan planning
system delegates to instruments PRYZM does not hold, and the repo's own closure register documents
each as a **permanent, evidence-exhausted cited refusal**, not an open task.

**Engineering Blocked** for the heritage/flood overlay composition (resolvers built and schema-
verified, zero call sites in the dispatcher) and for the terrain rasant datum (legal rule
transcribed in full, but the served DTM posts at 57.3 m against a ≤10 m Nyquist requirement for a
20 m Eixample street — wiring today would silently fabricate a result).

Net: **Barcelona is the strongest jurisdiction in the repo and is still not production-ready for an
unqualified "here is your buildable envelope" claim**, because (a) the envelope PRYZM ships omits
two overlay families that are legally dispositive where they apply, and (b) 39.4% of buildable land
(the `not-determined` slice) legitimately has no PRYZM-computable envelope under current Catalan law
and data availability, and that ceiling is close to permanent.

## Evidence Matrix

| # | Research Area | Claim | Verified? | Evidence (file:line or URL) | Status |
|---|---|---|---|---|---|
| 1 | Planning documents | PGM-1976 NNUU committed as primary source; DOGC 4893 (2007 height modification) + RPUC signed *Text d'aprovació definitiva* retrieved and committed | ✅ Verified | `PGM-NNUU-metropolitana.pdf` (repo root of this folder); `corpus/pdf/DOGC-4893_2007-05-29_MPGM-alcades-alineacio-vial_BARCELONA.pdf`; `corpus/pdf/RPUC_2006-025790-B_document-unitari_text-aprovacio-definitiva.pdf` | Confirmed present, git-tracked |
| 2 | Zoning geometry | AMB MUC WMS (`CODI_QUAL_AJUNT`) live per-parcel clau; AMB Refós `qualificacio_refos_3857/MapServer` live, 20 layers | ✅ Verified live | `server/mucZoningProxy.js`; WebFetch `https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer?f=json` → HTTP 200, 20 layers incl. `QU_Trames`(16), `OV_Trames`(17), `Cotes`(3), ArcGIS 11.5 | Live 2026-08-04 |
| 3 | Parcel geometry | Catastro INSPIRE WFS national feed; block-ring dissolve measured 96.3% (Eixample) / 96.1% (Ciutat Vella) success, 0 area-oracle over-statements in 178 blocks | ✅ Verified (measured, re-runnable) | `findings/L-676-BLOCK-DISSOLVE-EIXAMPLE-MEASURED.md`; tool `tools/block-dissolve-audit/audit.mts` | Measured, not assumed |
| 4 | Envelope parameters | 13a/13b/12 depth (Art. 242.2/326) + height (Art. 327.2a/328.2a) constructed; C63 ENVELOPE axis = 36.5% (Σ share×tierWeight), coverage = 60.6% | ✅ Verified in code + measurement artefact | `packages/site-parcel-data/src/rulepacks/esBarcelonaEnsanche.ts`, `esBarcelonaSemiintensiva.ts`, `esBarcelonaNucliAntic.ts`; `tools/city-completion/measurements/barcelona.measurements.json`; `RATE.md:117-119` | Measured 2026-08-01 (L-677) |
| 4b | Envelope parameters | clau 18 `explicit-area` route gated `BCN_REFOS_OV_CERTIFIED`, claimed signed and applied | ✅ Verified in code | `packages/site-parcel-data/src/providers/bcnRefosOVProvider.ts:102` `export const BCN_REFOS_OV_CERTIFIED: boolean = true;`; wired at `apps/editor/src/ui/site/siteDispatch.ts:6126-6144`; proxy route mounted `server.js:496` `app.get(BCN_REFOS_OV_PATH, apiLimiter, bcnRefosOvHandler);` | ✅ ON, contradicts a stale comment at `server.js:64` ("Rendering is STILL gated…default OFF") — **doc/comment drift found, not a functional defect** |
| 4c | Envelope parameters | Arts. 327.2a/328.2a "MPGM 2007" heights applied (SIG-2) | ⚠️ Partially verified | `sources/VERIFICATION.md` SIG-2 states `BCN_ART327_MPGM_2007.applied === true`; `docs` say values `9.00…25.75` are shipped | Not independently re-verified in code this pass (out of scope grep budget); repo's own closure register still lists supersession-audit residual (row 9, 41 of 147 documents unread) as open, `P2` |
| 5 | Heritage | `resolveBarcelonaHeritageOverlay.ts` built, schema-typed (BCIN/BCIL/BCIU), 27 test assertions, cites Llei 9/1993 Arts. 7-8/35-36; **zero call sites in dispatch or registry** | ✅ Verified (built + unwired) | `packages/site-parcel-data/src/providers/resolveBarcelonaHeritageOverlay.ts:1-60`; grep for the export name across `apps/editor/src/ui/site/siteDispatch.ts` and `packages/site-parcel-data/src/rulepacks/registry.ts` → 0 matches outside its own file/tests/docs; WMS live-confirmed `w133.bcn.cat/WMSCATPATRI/service.svc/get` → HTTP 200, layers "Bé cultural d'interès nacional (A)" / BCIL(B) / BCIU(C) | Live source confirmed, engine integration absent |
| 6 | Flood | `resolveCatalunyaFloodOverlay.ts` built, ZFP/DPH modelled with RD 638/2016 severities, self-rated file header "LOW confidence on the proxy contract"; ZI (general flood-hazard) explicitly not queried; **zero call sites** | ✅ Verified (built + unwired); ⚠️ one prior claim re-checked and found incomplete | `packages/site-parcel-data/src/providers/resolveCatalunyaFloodOverlay.ts:1-60`; WebFetch `https://sig.gencat.cat/ows/AIGUA/wfs?...GetCapabilities` → HTTP 200 live, feature types include `AIGUA_ZFP`, `AIGUA_DPH`, **and also `AIGUA_LI10`/`AIGUA_LI100`/`AIGUA_LI500`** (10/100/500-yr return-period inundation zones) plus `AIGUA_INUNDACIONS_HISTORIQUES` — the resolver's own header says "no ZI-named layer was found on the census"; live-fetch this pass found named T10/T100/T500 layers the resolver's search apparently missed | Live source richer than the code comment claims — **a finding this audit adds**, not previously in the dossier |
| 7 | Airport | El Prat aeronautical servitude explicitly named as unheld; code states the servitude "reach[es] across Viladecans, Gavà, Sant Boi and Castelldefels" — not Barcelona city | ✅ Verified low-relevance for BCN private buildable land | `packages/site-parcel-data/src/rulepacks/esAmbMetropolitanCorpus.ts:97-101,373`; no AENA/El Prat servitude code path touches Barcelona (08019) parcels specifically | Genuinely low-priority for Barcelona vs. El Prat's own municipality (08169) and neighbours |
| 8 | Environmental | Collserola / Natura 2000: mentioned only as a rendering-honesty example (parks shown "a fabricated setback"), no queryable overlay wired; systems/park land (clau 27/28/29 ≈ 17.9% of *all* municipal ground, not private buildable) already refuses correctly | ✅ Verified as out-of-buildable-denominator for the most part | `packages/site-parcel-data/src/rulepacks/esBarcelonaZoneClassification.ts` (systems group refuses); `packages/site-parcel-data/src/index.ts:285` | Low-relevance for *private buildable* land; not zero everywhere (block edges near Collserola) but not measured |
| 9 | Legal delegation | `PD*` (derived-plan-governed) = 70.69% of buildable land census-wide, incl. 68.6% of clau 13a itself; semantics of whether `PD*` displaces Art. 242.2 is UNREAD and explicitly flagged open (highest-value open question in the city) | ✅ Verified, and flagged in the repo as unresolved | `CLOSURE-REGISTER.md` row 19; `sources/VERIFICATION.md` SIG-4 "KNOWN LIMITS" | Open — the repo itself has not downgraded 13a on this basis, correctly, but it is the single largest live uncertainty in the flagship pack |
| 10 | Dispatch feasibility end-to-end | `siteDispatch.ts` dispatch branch confirmed wired for clau 18 OV route; clau 13a/13b/12/20a packs registered and reachable; heritage/flood NOT reachable from the same dispatch path | ✅ Verified in code | `apps/editor/src/ui/site/siteDispatch.ts:6106-6144`; `packages/site-parcel-data/src/index.ts:793` (own comment: "ABSENT heritage/airport/flood/environmental constraints…absent for Barcelona too, which IS published") | Dispatch reaches a real envelope or a cited refusal for every parcel sampled (91.7% true-answer rate, L-656/RATE.md), but the envelope it reaches never subtracts a heritage/flood constraint even where one legally applies |

## Machine-readable assets

Endpoints actually confirmed live this pass (2026-08-04), each with what was verified:

- **AMB Refós `qualificacio_refos_3857/MapServer`** (`https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer?f=json`) — HTTP 200, ArcGIS 11.5, 20 layers/tables confirmed, including `QU_Trames`(16, zoning/clau), `OV_Trames`(17, volumetric ordering + `PLANTES` floor count), `Cotes`(3, dimension lines). This is the layer `bcnRefosOVProvider.ts` and the C63 ENVELOPE-axis measurement both key on.
- **Catalunya AIGUA WFS** (`https://sig.gencat.cat/ows/AIGUA/wfs?service=wfs&version=2.0.0&request=GetCapabilities`) — HTTP 200, live, confirmed feature types `AIGUA_ZFP`, `AIGUA_DPH`, `AIGUA_LI10/LI100/LI500`, `AIGUA_INUNDACIONS_HISTORIQUES`, `AIGUA_GLORIA_*`, `AIGUA_ACT_PROTEC_AVINGUDES1`. This is the source `resolveCatalunyaFloodOverlay.ts` reads, and it is confirmed richer (named T10/100/500 return-period layers) than the resolver's own "no ZI layer found" caveat states.
- **Barcelona WMSCATPATRI** (`https://w133.bcn.cat/WMSCATPATRI/service.svc/get?REQUEST=GetCapabilities&SERVICE=WMS&VERSION=1.3.0`) — HTTP 200, live, layers confirmed for BCIN (A), BCIL (B), BCIU (C), documentary interest (D), emblematic establishments (E), protected sets/environments. This is the source `resolveBarcelonaHeritageOverlay.ts` reads via the pure parser `bcnCatpatriFeatureInfo.ts`.
- Per `PHASE-3-DECIDING-PROBES.md` (repo-internal, dated 2026-07-31, not re-fetched live this pass but cross-checked for internal consistency): CNIG WCS terrain (`servicios.idee.es/wcs-inspire/mdt`), IGN licence PDF, ICGC elevation-model terms, and Overture Maps S3 bucket were all independently live-verified with byte counts and content-type assertions.

## Missing assets

- **A composition contract** joining a computed zoning envelope to heritage/flood/environmental
  constraints (`Envelope → Constraint[] → compose() → Envelope'`). This does not exist anywhere in
  the codebase; `computeBuildableEnvelope()` has no `Constraint[]` input today
  (`findings/SOURCE-founder-heritage-flood-unblocking-dossier-2026-08-03.md` §C).
- **A statutory-consequence taxonomy** translating `INTERVEN` (heritage) or `ZFP`/`DPH` severities
  into a shared engine vocabulary — genuinely absent, confirmed by grep.
- **A precedence document** for zoning-vs-heritage-vs-flood override order — no citation found
  anywhere in the repo.
- **A same-origin proxy route** for both overlays (`BCN_CATPATRI_PATH` and the flood-overlay path
  constant both exist as *names* but neither is mounted in `server.js`, unlike the clau-18 OV route
  which is mounted — confirmed by the absence of either path string in `server.js`).
- **Applicability determination** — whether heritage/flood/environmental/airport are *materially*
  relevant to Barcelona's private buildable land varies sharply: heritage and flood are clearly
  relevant (both overlays intersect real Eixample/Ciutat Vella/riverside parcels; the flood WFS
  confirms named T10/T100/T500 layers over the Besòs corridor); airport is confirmed low-relevance
  (servitude reach documented in code as not touching Barcelona city); coastal and Natura 2000/
  Collserola are largely outside the *private buildable* denominator (public port/beach/park land),
  though not verified to zero.
- **A verified live re-run of SIG-2** (Arts. 327/328 2007 height uplift) against the primary DOGC
  text in code — the docs assert `applied === true`; this pass did not independently open
  `bcnAlcadaReguladora.ts` to confirm the numeric table matches DOGC 4893 line-for-line (time-boxed
  out of scope this pass; the repo's own supersession audit — row 9 — still lists 41 of 147 later
  instruments unread).

## Blockers

1. **Heritage overlay unwired.** Resolver exists and is schema-sound; no dispatcher call site, no
   proxy route mounted, no composition algorithm. Every 13a/13b/12/18 envelope on a heritage-
   protected Eixample/Ciutat Vella parcel is silently overstated relative to law.
2. **Flood overlay unwired,** same shape, additionally self-rated LOW confidence on its own proxy
   contract and missing a confirmed ZI/return-period layer despite one now being visible live.
3. **`PD*` semantics unread** — 68.6% of clau 13a itself sits under a derived-plan marker whose
   legal effect on Art. 242.2 has never been determined (CLOSURE-REGISTER row 19, unresolved).
4. **Clau 18 residual (73.6% of that clau) and claus 22a/22@/12b/bare-20a-remainder** — permanently
   or structurally delegated to ~2,600 site-specific instruments PRYZM does not hold; correctly
   refused, but a real ceiling, not a to-do list.
5. **Terrain rasant datum data half** — legal rule transcribed in full (`facadeRasantDatum.ts`), but
   the served DTM (25 m native, 57.3 m posted) cannot resolve a 20 m Eixample street; wiring the
   sampler today would silently fabricate a result (repo's own V8 probe verdict).
6. **SIG-2 (Arts. 327/328 2007 heights) not independently re-verified in code this pass** — docs
   claim applied, worth a spot re-check before relying on it for a legal claim.

## Estimated Unlock Effort

| Gap | Effort |
|---|---|
| Wire heritage overlay (proxy route + composition against existing schema) | Small–Medium (schema/honesty properties already solid per the founder dossier; the missing piece is `compose()` + a route) |
| Wire flood overlay | Medium (weaker starting confidence than heritage per its own file header; build heritage's composition contract first, then port) |
| Precedence + statutory-consequence taxonomy (both overlays) | Medium |
| `PD*` semantics documentary question | Tiny–Small (one AMB methodology-note question, not a 2,600-plan sample per the repo's own framing) |
| Clau 18/22a/22@/12b residuals | Very Large / not fully closable — delegated by law to per-site instruments; only plànol-vectorisation (a separate, harder, partly un-OCR-able programme) moves this materially |
| Terrain rasant data half | Small (a two-value config change per the repo's own V8.6 measurement: swap DTM25→DTM05 coverage id, raise tileset maxzoom 10→13) |
| SIG-2 re-verification | Tiny |

## Recommendation

**Build now** for the wiring gaps (heritage/flood composition, terrain rasant data swap) — these are
scoped, small-to-medium, and sit on top of already-solid schema/legal work. **Research first** for
the `PD*` semantics question before touching any 13a/12/13b confidence tier. **Do not build** a
generic OCR programme to chase clau 18/22a's residual — the repo's own 24-document sufficiency
measurement (`findings/L-590h`) shows height is ~0% OCR-extractable there; only plànol vectorisation
would move it, and that is a distinct, larger, partly-un-OCR-able project that should be scoped and
justified on its own before funding.

## PRYZM Readiness Score: 46/100

Justification (component-weighted, not a flat average): coverage-to-any-answer is very strong
(~92% of clicks reach a true answer or a correct cited refusal; near-ceiling parcel geometry at
99.2%; near-ceiling data-sources feed at 100%) — Barcelona is unambiguously the strongest jurisdiction
audited in this repo. But the score is capped well below "production ready" by three compounding
facts, each independently verified this pass: (1) the C63 ENVELOPE axis — the fraction of buildable
land reaching a genuine numeric envelope, weighted by confidence tier — measures **36.5%**, and no
tier above `block-constructed` (0.7 of a possible 1.0) is reachable today because no Barcelona
determination has been *issued* or *published as data*; (2) two legally material constraint families
(heritage, flood) are fully built in code, confirmed against live authoritative services, and
verifiably **zero-call-site** in the dispatch path — every envelope PRYZM emits is an acknowledged
upper bound with a missing ceiling, in the codebase's own words; (3) the honest structural ceiling on
the PGM-only approach is ~37–38% on the C63 axis / ~48% on the separate "data-readiness" ruler, and
the repo's own closure register states most of the remaining gap is unclosable by PRYZM engineering
because Catalan law delegates it to ~2,600 undocumented site-specific instruments. 46 reflects "the
best-evidenced, most-measured, most-honest jurisdiction in the portfolio, genuinely live and useful
on nearly half its buildable land, but not a number a user should treat as complete or unqualified."

## Comparison

| City | PRYZM Readiness Score | Source |
|---|---:|---|
| **Barcelona (this audit)** | **46/100** | this document |
| Balears (regional) | 58/100 | `docs/04-reference/jurisdictions/es/es-ib/BALEARS-CAPABILITY-AUDIT-2026-08-04.md` |
| Sevilla | 38/100 | `docs/04-reference/jurisdictions/es/es-an/41091-sevilla/findings/CAPABILITY-AUDIT-2026-08-04.md` |
| Madrid (capital) | 34/100 | `docs/04-reference/jurisdictions/es/es-md/28079-madrid/findings/CAPABILITY-AUDIT-2026-08-04.md` |
| Murcia (region + capital) | 34/100 | `docs/04-reference/jurisdictions/es/es-mc/MURCIA-REGION-AND-CAPITAL-CAPABILITY-AUDIT-2026-08-04.md` |
| Málaga | 22/100 | `docs/04-reference/jurisdictions/es/es-an/29067-malaga/findings/CAPABILITY-AUDIT-2026-08-04.md` |
| Granada | 18/100 | `docs/04-reference/jurisdictions/es/es-an/18087-granada/findings/CAPABILITY-AUDIT-2026-08-04.md` |
| Valencia (city) | 18/100 | `docs/04-reference/jurisdictions/es/es-vc/46250-valencia/findings/CAPABILITY-AUDIT-2026-08-04.md` |
| Córdoba | 17/100 | `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/CAPABILITY-AUDIT-2026-08-04.md` |
| Zaragoza (Aragón regional; no city-specific audit found) | 12/100 | `docs/04-reference/jurisdictions/es/es-ar/ARAGON-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md` |

⚠ These scores were produced by different audit passes (some this same date) using materially
different rubrics and evidence depth; they are cited as the repo's own record, not re-derived or
independently re-scored here. Barcelona's 46 and Balears' 58 are the two highest in the portfolio;
Barcelona is the only one of the two with a *live, block-constructed, founder-source-accepted*
numeric envelope rather than a framework/index-only result — the two scores are not measuring
identical things and should not be read as a strict ranking without opening both underlying audits.

## Final Verdict

Barcelona is PRYZM's most credible Spanish jurisdiction: a real founder-accepted construction, not a
placeholder, covering the dominant Eixample/nucli-antic fabric, with an honest and repeatedly
re-derived completion scorecard that has been revised *downward* three times in one week rather than
inflated — a strong signal of institutional honesty. **The single biggest remaining blocker is not a
data gap but an engineering-integration gap with legal consequences: the heritage and flood overlay
resolvers are built, tested, and verified live against authoritative Catalan/Barcelona services, and
have zero call sites in the envelope dispatch path** — meaning every envelope PRYZM currently
publishes for Barcelona, including on the flagship 13a Eixample fabric, is silently uncapped by two
constraint families the codebase itself acknowledges are missing. Closing that gap (composition
contract + two proxy routes) is scoped as Small–Medium effort and does not require new legal research
— the founder-commissioned dossier (`findings/SOURCE-founder-heritage-flood-unblocking-dossier-
2026-08-03.md`) already narrows most of the remaining open questions to a handful of named,
tractable items. The larger, structurally-unclosable gap (clau 18/22a/22@/12b, ≈40% of buildable
land governed by ~2,600 site-specific Catalan planning instruments) is correctly and permanently
refused today, not a defect to fix.
