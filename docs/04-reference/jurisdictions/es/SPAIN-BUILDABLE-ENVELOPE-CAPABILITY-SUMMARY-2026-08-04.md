# Spain — National Buildable-Envelope Capability Summary

> **This document measures PRYZM's production capability for legally-grounded buildable-envelope
> generation across Spain. It is not a survey of planning-data availability.** A municipality
> counts here only by what a user can actually obtain from the product today, or by the single,
> specific thing standing between today and that — never by how much has been researched.

**Date:** 2026-08-04. **Author:** national synthesis pass over 19 forensic capability audits plus
one architecture document, all produced 2026-08-04 by independent research agents against a
fixed, evidence-only template. **This document adds no new research.** It consolidates, ranks and
cross-references findings already recorded in the source documents. Where two source documents
disagree on a number, both numbers are reported and the disagreement is flagged — never silently
resolved.

**Spain is no longer a greenfield problem for PRYZM.** Every municipality audited this pass landed
in a specific, named blocker class (§5) rather than an open question of "is this possible at all" —
the shift from the earlier phase of this project (survey: does data exist anywhere?) to this one
(triage: which of a small number of known blocker types applies here, and what removes it?) is
itself the headline finding, independent of any single municipality's score.

**Status vocabulary used throughout this document** — four states, applied consistently instead of
the looser "Research/Engineering/Legally Blocked" language some source audits used individually:

| Status | Meaning |
|---|---|
| **Production** | A user can obtain a real envelope (full or partial-coverage) today. |
| **Activation-ready** | Every engineering piece exists and is wired — dispatch, resolver, pack, geometry. The only remaining step is a founder sign-off (L-449) or a single configuration/wiring action, not further building. |
| **Engineering-blocked** | A known, bounded engineering task remains (transcription, a resolver rewrite, a geometry fix) before it could even reach Activation-ready. |
| **External / legal blocker** | Neither engineering nor PRYZM-internal legal work can close this — it depends on a third party (a locked database, an undocumented field, a discretionary committee, a legislative schema gap). |

Applying this vocabulary retroactively changes several classifications from how the individual
2026-08-04 audits labelled themselves: most importantly, **Telde, El Sauzal, Sevilla `SB` and
Zaragoza are Activation-ready, not "Engineering Blocked"** — their dispatch, resolvers and packs
are confirmed complete in code; what remains is a human signature, not more engineering. This is
called out explicitly wherever it changes a rating below.

This supersedes nothing; it sits alongside the shorter first-pass synthesis at
`docs/04-reference/jurisdictions/_TEMPLATE/SPAIN-NATIONAL-ENVELOPE-CAPABILITY-SUMMARY-2026-08-04.md`
(read and cross-checked, not copied from) and goes materially deeper: a municipality-level status
table, an explicit blocker taxonomy with named unlocks, an inventory of reusable infrastructure,
and a founder-facing roadmap ordered by ROI.

**Primary sources** (all read in full):
- `es-an/ANDALUCIA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`, `es-an/ANDALUCIA-ENGINE-ARCHITECTURE.md`
- `es-an/14021-cordoba/findings/{CAPABILITY-AUDIT-2026-08-04,FORENSIC-BLOCKER-AUDIT-2026-08-03}.md`
- `es-an/29067-malaga/findings/{CAPABILITY-AUDIT-2026-08-04,FORENSIC-BLOCKER-AUDIT-2026-08-03}.md`
- `es-an/18087-granada/findings/{CAPABILITY-AUDIT-2026-08-04,FORENSIC-BLOCKER-AUDIT-2026-08-03}.md`
- `es-an/41091-sevilla/findings/{CAPABILITY-AUDIT-2026-08-04,FORENSIC-BLOCKER-AUDIT-2026-08-03}.md`
- `es-an/ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md` (Jaén, Almería, Cádiz, Huelva)
- `es-mc/MURCIA-REGION-AND-CAPITAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-vc/COMUNITAT-VALENCIANA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`, `es-vc/46250-valencia/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-ct/CATALUNYA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`, `es-ct/08019-barcelona/findings/CAPABILITY-AUDIT-2026-08-04.md`, plus `08015-badalona/RATE.md`, `08200-sant-boi/RATE.md`, `08101-hospitalet/RATE.md`
- `es-ib/BALEARS-CAPABILITY-AUDIT-2026-08-04.md`
- `es-md/28079-madrid/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `es-cl/VALLADOLID-AND-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`
- `es-ga/GALICIA-SANTIAGO-VIGO-CAPABILITY-AUDIT-2026-08-04.md`
- `es-cn/CANARIAS-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`, `es-cn/35026-telde/sources/VERIFICATION.md`
- `es-ar/ARAGON-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`, `es-ar/22125-huesca/findings/CAPABILITY-AUDIT-2026-08-04.md`, `es-ar/50297-zaragoza/findings/CAPABILITY-AUDIT-2026-08-04.md`
- `docs/04-reference/jurisdictions/ENVELOPE-CAPABILITY-MATRIX.md`, `ENVELOPE-REALISM-MATRIX.md`, `FOUNDER-BLOCKERS-INDEX.md`
- `docs/03-execution/plans/master-execution-tracker.md` (Spain-relevant sections)
- `packages/site-parcel-data/src/rulepacks/registry.ts`, `packages/site-parcel-data/src/l449CertificationGates.ts` (code ground truth)

---

## 1. Executive summary

PRYZM currently produces a **real, computed, at-least-partially-numeric buildable envelope in
two municipalities**: **Barcelona** (a signed overlay/height certification, `BCN_REFOS_OV_CERTIFIED
= true`, covering ~43% of buildable land at `block-constructed` confidence) and **Murcia
capital** (`MURCIA_ENVELOPE_VERIFIED = true`, covering 28.09% of private buildable land). A third,
**Madrid capital**, produces a signed **footprint-only** determination (`MADRID_NZ1_CERTIFIED =
true`) with no height or volume — it is legally blocked from going further because height for its
NZ-1 zone grades is discretionary (CPPHAN committee approval, not a formula). A fourth,
**Illes Balears**, produces a live **indicative, open-top** determination island-wide
(`BALEARS_OPEN_TOP_INDICATIVE`, unsigned by design) reaching ~74.1% of private developable land at
partial-to-complete citation depth. A fifth, **Zaragoza**, produces a narrow open-top-indicative
slice (`ZARAGOZA_OPEN_TOP_INDICATIVE`) covering only 2 of 52 zone-code families (~4.1% of the
city's 7,967 zoned polygons). **A sixth, Córdoba, produces a real, signed envelope on 4 of 13
packed subzones inside a 2-district pilot** (`CORDOBA_ENVELOPE_VERIFIED = true`, `esCordobaZoneClassification.ts:48`,
signature anchor SIG-1) — this corrects a misread in an earlier draft of this synthesis, which
mistakenly read the gate as unsigned; both the pack file and `l449CertificationGates.ts` agree it
is `true`. **Telde and El Sauzal (Canarias)** also have real, wired dispatch branches — both
correctly refuse today because their own `CANARIAS_ENVELOPE_VERIFIED`/`EL_SAUZAL_ENVELOPE_VERIFIED`
gates are unsigned, but the dispatch machinery itself is complete (confirmed directly in
`apps/editor/src/ui/site/siteDispatch.ts`, not merely in prose documentation).

No jurisdiction in Spain scores above 60/100 on this template's own readiness rubric, and **nothing
is Production Ready** in the sense of a full, unconditional, city-wide determination.

Beyond these five-to-six live cases, roughly **10 municipalities are individually investigated and
confirmed Research Blocked** with a specific, well-evidenced legal or data reason (Málaga, Granada,
València city, Huesca, Santiago de Compostela, Vigo, Valladolid, plus the region-wide
zoning/ordinance questions for Andalucía, Aragón, Comunitat Valenciana and Castilla y León, each
independently reaching the same "not a region-level problem" conclusion). **Roughly 6 jurisdictions
are Engineering Blocked** — legal parameters are known or partly transcribed but geometry/dispatch
machinery is incomplete (Córdoba beyond its pilot, Sevilla beyond its one transcribed zone,
Zaragoza beyond its indicative slice, and the Comunidad de Madrid region, whose registration is
blocked by interleaving municipal-boundary geometry rather than by any legal or data question).
Telde and El Sauzal have COMPLETE dispatch machinery (both correctly refuse today, gated only on
an unsigned L-449 human sign-off) — Telde's remaining gap is narrower still: its zone-identity
resolver targets a live WFS that is administratively disabled, with a proven offline-shapefile
fix (El Sauzal's own pattern) not yet applied. **4 jurisdictions carry an External/Legal blocker outside PRYZM's control**: Madrid
NZ-1's height discretion (CPPHAN), Málaga's locked Oracle GIS account (`ORA-28000`), Granada's
height being legally delegated to a raster map (Art. 7.9.6, no vector substitute exists), and 46 of
Canarias's 88 municipalities, where multi-instrument currency ("vigencia") has been confirmed not
automatable and requires founder policy, not engineering. **The overwhelming majority of Spain's
~8,131 municipalities are Cold Start / Not Investigated**: 4 further Andalusian capitals (Jaén,
Almería, Cádiz, Huelva — scaffold only), ~86 of Canarias's 88 municipalities beyond Telde/El
Sauzal, ~911 of Catalunya's 947 municipalities beyond Barcelona and its 4 registered-but-empty AMB
neighbours, ~540 of Comunitat Valenciana's municipalities beyond the capital, ~44 of Región de
Murcia's ~45 municipalities beyond the capital, the bulk of Castilla y León's 2,248 municipalities,
Aragón beyond Zaragoza/Huesca, Galicia beyond Santiago/Vigo, and 11 further provincial capitals
(Oviedo, Santander, Ceuta, Albacete, Ciudad Real, Cuenca, Guadalajara, Toledo, Badajoz, Cáceres,
Melilla, Pamplona, Vitoria-Gasteiz, San Sebastián, Bilbao, Logroño) that carry only a generic,
templated Phase-1 scorecard with no legislation or envelope work done — 7 autonomous communities
(Asturias, Cantabria, Castilla-La Mancha, Extremadura, Navarra, País Vasco, La Rioja) plus the two
autonomous cities have **no forensic capability audit at all** as of this pass.

---

## 2. National capability map (by autonomous community)

| Autonomous community | Capability rating | Municipalities completed (real, signed, computed output) | Partially completed (engineering-complete or partly transcribed, unsigned/gated) | Individually researched (Research/Legally Blocked, documented) | Untouched / cold start |
|---|---|---|---|---|---|
| **Andalucía** | Research Blocked (region-wide zoning shortcut) / overlays Indicative Ready | Córdoba (pilot, signed) | Sevilla (1 of 15 zones transcribed, unsigned) | Málaga, Granada | Jaén, Almería, Cádiz (scaffold), Huelva (negative-evidence only); ~770 of ~778 municipalities entirely untouched |
| **Región de Murcia** | Indicative Ready (capital) / Research Blocked (region) | Murcia capital | — | — | ~44 of ~45 municipalities |
| **Comunitat Valenciana** | Research Blocked | 0 | — | València (city) | ~540 municipalities |
| **Catalunya** | Indicative Ready (zoning identity) / Research Blocked (envelope params) | 0 | Barcelona (signed, partial coverage) | Girona, Lleida, Tarragona (registered, "NO PACK — not-assessed"); Badalona, Sant Boi, L'Hospitalet, Cornellà (registered, refusal-only) | ~911 of 947 municipalities |
| **Illes Balears** | Indicative Ready (confirmed) | Balears (regional instrument, open-top indicative, live) | — | — | — (single regional instrument covers all 67 municipalities at indicative depth) |
| **Comunidad de Madrid** | Legally Blocked (capital height) / Engineering Blocked (capital full PGOUM, and region-wide registration) | 0 full envelopes | Madrid capital (NZ-1 footprint-only, signed; full PGOUM-97, 23 zones extracted, unsigned) | — | Region: registration itself blocked (178 other municipalities) |
| **Castilla y León** | Research Blocked | 0 | — | Valladolid (assessed-subset 61%, no rule pack) | 9 provincial capitals scaffolded only; ~2,239 of 2,248 municipalities untouched |
| **Galicia** | Research Blocked | 0 | — | Santiago de Compostela, Vigo | Rest of region untouched |
| **Canarias** | Engineering Blocked / Legally-Structurally Blocked (bimodal) | 0 | Telde, El Sauzal (packs built, dispatch wired and correctly refusing, gate unsigned) | 46 of 88 (multi-instrument, confirmed non-automatable) | ~40 "routable" municipalities not yet built |
| **Aragón** | Research Blocked | 0 | Zaragoza (open-top-indicative slice, 4.1% of polygons) | Huesca (georeferencing rejected) | Rest of region untouched |
| Asturias, Cantabria, Castilla-La Mancha, Extremadura, Navarra, País Vasco, La Rioja, Ceuta, Melilla | Not Investigated | 0 | — | — | 16 provincial-capital dossiers exist only as generic Phase-1 templated scaffolds (no legislation/envelope work); no forensic audit conducted for any of these communities in this pass |

---

## 2a. National capability matrix

The single-glance version of §2, using the four-state vocabulary above. "Regional infrastructure
maturity" is about SHARED, REUSABLE INFRASTRUCTURE (overlay data services, routing signals, code
generators) — never a claim that a region runs its own computation engine; see §7 for why that
distinction is load-bearing.

| Community | Municipalities researched | Produces envelopes (Production) | Activation-ready (built, gated on sign-off only) | Regional infrastructure maturity |
|---|---:|---:|---:|---|
| Catalunya | 8 (1 substantive + 7 registered-only) | 1 — Barcelona | 0 confirmed (AMB's 22-municipality bundle is conditional — equivalence to Barcelona not yet confirmed) | **Medium** — MUC WFS is a genuine region-wide routing signal for all 947 municipalities, but supplies no numeric parameter |
| Andalucía | 8 (4 substantive + 4 scaffold) | 1 — Córdoba (pilot) | 1 — Sevilla `SB` | **Medium** — 3 live regional overlay services (heritage, flood, environmental); zero regional zoning/ordinance shortcut |
| Canarias | 2 substantive (+ 46 confirmed multi-instrument, ~40 untouched) | 0 | 2 — Telde, El Sauzal | **High** — offline-SIPU pattern + bbox-table generator proven reusable across dozens of municipalities |
| Región de Murcia | 1 | 1 — Murcia capital | 0 | **Low** — regional IDERM layer explicitly self-described as non-authoritative |
| Comunitat Valenciana | 1 | 0 | 0 | **Low** — zero envelope parameters found at any regional scale |
| Illes Balears | 1 (regional instrument, covers all 67 municipalities) | 1 — Balears (indicative) | 0 | **High** — but uniquely because the underlying LAW is regional (MUIB), not because of an architecture choice; see §7 |
| Comunidad de Madrid | 2 (capital cases) + region | 1 — Madrid NZ-1 (footprint only) | 0 | **Low** — no regional sharing exists; regional registration itself blocked upstream of any data question |
| Aragón | 2 | 1 — Zaragoza (narrow indicative slice) | 0 | **Low** — Zaragoza's WFS confirmed NOT to extend to other Aragonese municipalities |
| Castilla y León | 1 | 0 | 0 | **Low** — regional data explicitly self-disclaims legal validity |
| Galicia | 2 | 0 | 0 | Not established — key regional/municipal hosts unreachable this pass |
| 7 other communities + 2 autonomous cities | 0 | 0 | 0 | Not established — no forensic audit conducted |

---

## 3. Municipality status table

One row per individually investigated municipality. **Current status** and **capability label** use
the founder's requested vocabulary; **current output** states what a user actually gets today.

| Municipality | Community | Current status | Current output | Primary blocker | Next unlock |
|---|---|---|---|---|---|
| **Barcelona** | Catalunya | Partial Production | Real envelope, ~43% of buildable land at `block-constructed` confidence (13a/13b/12 fabric); remaining 57% (clau 18, 22a, 22@, 12b) = honest refusal | Heritage + flood resolvers built, tested, **zero dispatch call sites**; `PD*` derived-plan semantics unread (70.7% of buildable land carries an unresolved marker); terrain rasant DTM too coarse (57.3m posts vs ≤10m needed) | Wire the two existing overlays into dispatch (Small–Medium, pure integration); resolve `PD*` semantics (Tiny–Small, documentary) |
| **Murcia (capital)** | Región de Murcia | Partial Production | Real envelope, 28.09% of private buildable land (23.51% base + 4.58pp street-width) | 67.0% of buildable land legally delegated to Planes Parciales/PERI/ED (structural ceiling); PGOU source PDF returns HTTP 403 to automation | Small (2–4 days, mostly human-gated retrieval); regional replication beyond capital is Very Large |
| **Madrid (capital, NZ-1)** | Comunidad de Madrid | Legally Blocked (height) | Real, signed **footprint only** — no height/FAR (`COEF_Z` is a non-numeric coded token) | Height for grados 1º–5º is deferred to CPPHAN discretionary committee (Art. 8.1.15.1); this finding is itself flagged **unaudited to required rigor** (status C, not settled) | Commission the CPPHAN-discretion audit at ADR-0296 rigor before treating as closed; grado 6º has a partial storeys-only rule already |
| **Madrid (capital, full PGOUM-97)** | Comunidad de Madrid | Engineering Blocked | 23 zone codes machine-extracted, no envelope shipped | `MADRID_ENVELOPE_VERIFIED = false`; human must read/sign 121 sampled records (SIG-M1); 6 of 23 packed zones flagged not sign-off-ready even once signed; live NZ-1 footprint endpoint returned "servicio no disponible" on re-probe | Large — founder sign-off is the pacing item, not engineering |
| **Comunidad de Madrid (region)** | Comunidad de Madrid | Engineering Blocked | No dispatch — not even registrable | Capital and Boadilla del Monte municipal boundaries interleave by 4.35 km; no bbox can separate them; needs a real polygon `contains` predicate | Large — architecture change (real boundary geometry, not bbox routing) |
| **Illes Balears** | Illes Balears | Indicative Ready | Open-top indicative rule on ~74.1% of private developable land (61.4% complete + 12.7% partial); `R` resolves on 97.1% of 2,210 GESTIO features | Only 2.0% of fitxes cite a governing article; PTI plans publish category codes with no numeric height/FAR/setback consequence | Very Large overall; three bounded research spikes (PTI normativa digitization, AESA access, MITECO DPMT WFS) could narrow it |
| **Córdoba** | Andalucía | Signed pilot, real envelope | Real envelope for 4 of 13 packed subzones inside a 2-district pilot (≈16% of pilot buildable land full-envelope, ≈0.9% city-wide) | 95.1% of city-wide `SUELO URBANO` has no machine-readable calificación (41 of 49 raster CUS sheets dead, no vector alternative after 6-probe search); Manzana Cerrada (16.9% of pilot land) has no alignment layer anywhere in the city's GIS | **Correction (2026-08-04)**: an earlier pass of this synthesis claimed `l449CertificationGates.ts` shows `CORDOBA_ENVELOPE_VERIFIED = false`, disputing the audits' claim of `true`. Directly re-read both `packages/site-parcel-data/src/rulepacks/esCordobaZoneClassification.ts:48` (`export const CORDOBA_ENVELOPE_VERIFIED: boolean = true;`) and `l449CertificationGates.ts`'s own Córdoba row (`value: CORDOBA_ENVELOPE_VERIFIED`, signature anchor `SIG-1`) — the gate genuinely is `true`/signed. That prior claim was a misread, not a real repo inconsistency. The ONLY stale source is `ENVELOPE-CAPABILITY-MATRIX.md` (independently flagged as stale on Córdoba earlier this session) — it should be corrected, not treated as a live disagreement. |
| **Sevilla** | Andalucía | **Activation-ready** (`SB` only) / Engineering Blocked (city-wide, other 14 zones) | 1 of 15 zone families (`SB`) has a working dispatch + staged preview pipeline, still carrying 3 `null` parameters; other 14 families resolve zone identity, then refuse by name (no fabrication) | 14 of 15 zone-family ordinances never transcribed; `SEVILLA_ENVELOPE_VERIFIED = false`; `CH` (Centro Histórico) likely needs a different, PEPRI-dependent model | `SB` alone: Small (founder sign-off + 3 null parameters via existing closed-form logic already proven). City-wide: Very Large |
| **Málaga** | Andalucía | Legal/External Blocker | No dispatch at all — falls to a **fabricated generic estimate** (`applyEstimatedZoning`), not even a refusal | Municipal GeoServer locked with Oracle error `ORA-28000`, re-confirmed live 2026-08-04; exhaustive search found no alternate backend (PEPRI viewer independently offline, GeoPortal redirects, CKAN empty) | Large — third-party account unlock, no PRYZM-controlled timeline; once unlocked, ~2–4 engineering days (ordinance already ~90% read) |
| **Granada** | Andalucía | Legally Blocked | No dispatch; falls to fabricated estimate | Height/floor-count is **legally, explicitly delegated** to reading a raster plan sheet by eye (Art. 7.9.6); byte-level inspection confirms zero vector content in the plan PDFs | Very Large; smallest credible unlock is a records request asking whether an internal vector master exists |
| **Jaén, Almería, Cádiz** | Andalucía | Cold Start | Fabricated generic estimate | No research conducted | First discovery pass, weeks |
| **Huelva** | Andalucía | Cold Start (negative-evidence only) | No dispatch | Absence-of-sources established but not to ADR-0296's evidentiary bar | Re-sweep from a different network |
| **València (city)** | Comunitat Valenciana | Research Blocked | 100% cited, per-parcel refusal; zero envelopes | `altura` field's offset convention undocumented across 3 checked publisher sources; empirically two-sided error (median ratio 0.78 vs OSM levels, n=105); "no conservative reading exists" | Small effort once answered, but on an external/statutory timeline (~1 month, Ley 19/2013 channel) |
| **Zaragoza** | Aragón | **Activation-ready** (4 packed subgrados) / Engineering Blocked (remaining 48 zone codes) | Narrow open-top-indicative slice, 2 of 52 zone-code families (~329 of 7,967 polygons ≈ 4.1%) | `ZARAGOZA_ENVELOPE_VERIFIED = false`; 48 of 52 zone codes unread; street-width resolver unconditionally returns `not-wired` | The 4 packed subgrados: Small (founder sign-off). Remaining 48: Large — multi-week legal transcription + a real street-width feed (machinery exists, needs a data source) |
| **Huesca** | Aragón | Research Blocked | No dispatch | Buildable depth remitted to a 1:1,000 CAD-plan sheet; georeferencing rejected (2.31m residual vs 3× bar); NZ1/NZ2/NZ3 zoning found this pass to live on a wholly separate, unexamined sheet | Large — untried stroke-class-filtered re-matching, plus reading the separate zoning sheet |
| **Santiago de Compostela** | Galicia | Research Blocked | No dispatch | Planning host unreachable (`ECONNREFUSED`, all attempts); regional GIS (SIOTUGA) scoped to coastal strip only, returns 0 features here; historic centre delegated to an unfetchable 1997 plan | Large; re-attempt host from different network |
| **Vigo** | Galicia | Research Blocked | No dispatch | Real 2025 PGOM + ArcGIS viewer exist, but geometry↔attribute machine-readable join unresolved (JS-rendered backend not located) | Large overall, but Vigo alone could move to Medium with one focused follow-up session |
| **Valladolid** | Castilla y León | Research Blocked | No dispatch, no rule pack anywhere in the region | Region-wide legal-force disclaimer on all IDECyL vector layers ("Sin validez jurídica, carácter informativo"); zoning WMS returned HTTP 404 | Large; resolve the standing legal-counsel question (Q4) before any CyL engineering |
| **Telde** | Canarias | Engineering Blocked (small, bounded) | **Correction (2026-08-04)**: an earlier draft of this synthesis claimed `isInTelde` has zero references — this is wrong. `siteDispatch.ts` confirms a real, wired dispatch branch (`isInTelde` imported + routed) that correctly refuses because the gate is unsigned, never a fabricated number | `CANARIAS_ENVELOPE_VERIFIED = false`; the zone resolver itself (`resolveTeldeZone.ts`) queries a live IDECanarias WFS that is administratively disabled | Small — the SIPU zip already confirmed to contain `EDIF.shp` (geometry) alongside `EDIF.mdb` (attributes, already used); rewrite the resolver against the offline shapefile, El Sauzal's proven pattern |
| **El Sauzal** | Canarias | **Activation-ready** (qualified — pending fichero-anexo) | **Correction (2026-08-04)**: dispatch IS wired (`isInElSauzal` imported + routed in `siteDispatch.ts`, built this session) — correctly refuses because the gate is unsigned, not because dispatch is missing | `EL_SAUZAL_ENVELOPE_VERIFIED = false`; missing fichero-anexo document (the RE-ViUf↔Ciudad Jardín typology binding is an inference, not confirmed) | Small — dispatch is done; remaining work is the fichero-anexo document + founder sign-off |
| **Badalona, Sant Boi, L'Hospitalet, Cornellà** | Catalunya (AMB) | Cold Start (registered, refusal-only) | Cited refusal every parcel; Barcelona's numbers explicitly do **not** transfer | No individually verified rule pack; `AMB_PGM_NNUU_ENVELOPE_VERIFIED = false` awaits one signature covering 22 AMB municipalities | Signing the AMB gate (once numbers are confirmed equal to Barcelona's, which has **not yet been done**) |
| **Girona, Lleida, Tarragona** | Catalunya | Cold Start | No dispatch | Registered, "NO PACK — not-assessed" | Not started |

---

## 4. Envelope capability by maturity

**Production (real envelopes rendering today, even if partial-coverage):**
Barcelona (~43% of buildable land), Murcia capital (28.09%), Madrid NZ-1 (footprint-only, 100% of
NZ-1 land but no height), Illes Balears (open-top indicative, ~74.1% of developable land),
Zaragoza (open-top indicative, ~4.1% of zoned polygons), Córdoba pilot (real, signed envelope on
4 of 13 subzones, ≈16% of pilot buildable land).

**Near Production (engineering essentially complete, blocked only on sign-off or one wiring step):**
Sevilla `SB` zone (3 null parameters, otherwise closed-form-solvable, dispatch + staged preview
already wired), Telde and El Sauzal (packs built, dispatch fully wired and correctly refusing —
blocked only on the unsigned L-449 gate; Telde additionally needs its resolver rewritten against
the confirmed-available offline SIPU shapefile), Barcelona's heritage/flood overlays (built and
tested, zero call sites).

**Research complete (the reason for zero envelope is known and documented, not merely unattempted):**
Málaga (Oracle account lock, external), Granada (height legally raster by Art. 7.9.6), València
city (`altura` semantics undocumented by publisher), Huesca (georeferencing rejected below the
3× bar), Andalucía region-wide (Normas Directoras schema parameter-incomplete by design), Aragón
region-wide (SIUa buildability fields near-empty), Comunitat Valenciana region-wide (zero envelope
parameters found at any regional scale), Castilla y León region-wide (self-disclaimed legal
validity on all vector layers), Canarias's 46 multi-instrument municipalities (vigencia confirmed
not automatable).

**Cold start (minimal or no investigation):**
4 further Andalusian capitals (Jaén, Almería, Cádiz, Huelva), ~86 of Canarias's 88 municipalities,
~911 of Catalunya's 947, ~540 of Comunitat Valenciana's municipalities, ~44 of Región de Murcia's,
~2,239 of Castilla y León's 2,248, Aragón beyond Zaragoza/Huesca, Galicia beyond
Santiago/Vigo, and 16 provincial-capital dossiers (Oviedo, Santander, Ceuta, Albacete, Ciudad Real,
Cuenca, Guadalajara, Toledo, Badajoz, Cáceres, Melilla, Pamplona, Vitoria-Gasteiz, San Sebastián,
Bilbao, Logroño) that carry only a generic Phase-1 scorecard template (`LEGISLATION` and `ENVELOPE`
axes both `not-assessed`, `pending-implementation`, no rule pack). Bilbao's own scaffold additionally
flags that Basque Country and Navarra keep their own *foral* cadastres, meaning the national
Catastro parcel route does not even apply there without separate work.

---

## 5. National blocker taxonomy

### By category

**Engineering** (bounded, known method, no legal or third-party dependency):
- Missing/dead live data service with an offline alternative (Telde)
- Constraint layers built but unwired to dispatch (Barcelona heritage/flood)
- Missing geometric parameter, otherwise resolvable by pattern extension (Sevilla, remaining zones)
- Registration blocked by geometry itself, needs real boundaries not bboxes (Comunidad de Madrid region)
- Poor source quality / georeferencing (Huesca — untried levers remain)

**Legal** (PRYZM-internal legal/product work, not blocked by a third party):
- Built but unsigned (L-449 human gate) — Zaragoza, Sevilla `SB`, Telde, El Sauzal, Madrid full
  PGOUM-97, AMB's 22-municipality bundle
- Multi-instrument / derived-plan delegation, partially narrowable (Canarias, Murcia, Sevilla,
  Barcelona `PD*`)
- Legal discretion with no formula — pending its own re-audit (Madrid NZ-1 / CPPHAN)

**External** (a third party — a government, a legislative schema, an unreachable host — must act;
PRYZM cannot close these unilaterally):
- Data locked by third-party authority (Málaga `ORA-28000`)
- No machine-readable zoning geometry, and none appears to exist to find (Granada, Castilla y León, Galicia)
- Missing semantic interpretation of a published field, needs the publisher to document it (València `altura`, Balears PTI)
- Regional legal instrument that is parameter-incomplete BY DESIGN — a legislative schema gap
  upstream of PRYZM (Andalucía Normas Directoras, Aragón SIUa)

### Full taxonomy

| # | Blocker type | Affected jurisdictions | Can engineering alone fix it? | Unlock |
|---|---|---|---|---|
| 1 | No machine-readable zoning geometry | Granada (legally raster, Art. 7.9.6), Castilla y León (self-disclaimed legal validity), Galicia (unresolved), Córdoba (95.1% city-wide) | No — legal/document-acquisition project, or the vector genuinely does not exist | Records requests, or accept refusal as the correct answer |
| 2 | Missing semantic interpretation of a published field | València city (`altura` offset convention undocumented across 3 sources), Illes Balears (PTI category codes carry no numeric consequence) | Only with new authoritative documentation | Municipal/Generalitat written clarification |
| 3 | Missing geometric parameter, otherwise resolvable | Sevilla SB (closed this session — real `A_INTERIOR-MAXIMA` alignment geometry now wired) | Yes — proven | Extend the pattern to remaining zones |
| 4 | Constraint layers built but unwired to dispatch | Barcelona (heritage + flood resolvers tested, zero call sites) | Yes — pure integration work | Wire the resolvers |
| 5 | Missing/dead live data service, offline alternative exists | Telde (SIPU zip already contains `EDIF.shp`), El Sauzal (fichero-anexo gap) | Sometimes — case by case | Rewrite resolver against offline shapefile pattern |
| 6 | Data locked by third-party authority | Málaga (`ORA-28000` Oracle account lock, re-confirmed live) | No | External account unlock, no PRYZM-controlled timeline |
| 7 | Poor source quality (georeferencing) | Huesca (2.31m residual vs 3× bar) | Maybe — untried levers remain (stroke-class filtering) | Retry with a different matching method |
| 8 | Legal discretion (no formula exists) | Madrid NZ-1 height (CPPHAN) — **flagged as unaudited to required rigor, not a settled fact** | No, if the finding holds | Commission the ADR-0296-rigor audit before treating as closed |
| 9 | Multi-instrument / derived-plan delegation | Canarias (46 of 88 municipalities), Murcia (67.0% of capital's buildable land), Sevilla (delegation share unmeasured), Barcelona (`PD*` markers on 70.7% of buildable land) | Partial — a currency/instrument register could narrow it | Currency register; PD* semantics documentary question |
| 10 | Registration blocked by geometry itself | Comunidad de Madrid region (municipal boundaries interleave, no bbox separates capital from Boadilla) | Needs real polygon boundaries, not bboxes | Build a real `contains` predicate |
| 11 | Built but unsigned (L-449 human gate) | Zaragoza, Sevilla SB, Telde, El Sauzal, Madrid full PGOUM-97, AMB's 22-municipality bundle. (**Not Córdoba** — its gate is `true`/signed, `SIG-1`; see §3.) | No — signature is human, by design | Founder review and sign-off |
| 12 | Regional legal instrument exists but is parameter-incomplete by design | Andalucía (Normas Directoras: FAR/density fields only, no height/setback/depth), Aragón (SIUa: `edificab` populated on 1.3% of sampled rows) | No — legislative schema gap, upstream of PRYZM | Amend the schema (not PRYZM's to do) or fall back to municipal ordinance text regardless |

---

## 6. Reusable infrastructure

These are strategic, once-built assets, independent of any single municipality's ordinance content:

- **Municipal dispatch + `registry.ts` flat registration pattern.** Every jurisdiction — Spanish or
  international (Denmark, Netherlands, Paris, Switzerland) — registers at the same flat rung, with
  no intermediate country/region engine anywhere in the codebase. This is the single strongest
  reusable pattern in the whole system.
- **`packages/site-parcel-data` rulepack framework** (L2) — the container-agnostic zone-resolver
  abstraction (ADR-0294) and the five-independent-providers capability engine (ADR-0295), proven
  across 5 distinct container types (GeoServer WFS, ArcGIS REST, offline SIPU shapefile, raster/PDF
  refusal, live-resolved national services).
- **`containers/arcgisRest.ts`** — a generic Esri-stack adapter, built for Sevilla, explicitly
  designed (per its own header) to be reused by any future ArcGIS-published Spanish municipality —
  already the pattern València's own alignment resolver traces back to.
- **`sipuShapefile.ts` / offline SIPU pattern** — proven for El Sauzal, directly reapplicable to
  Telde and, per the Canarias audit, to a further ~40 "routable" municipalities without needing any
  live government service.
- **Canarias's bbox-table code-generation pattern** (`buildCanariasMunicipalRegistrations()`) — 87+
  municipalities generated from one shared bbox table rather than hand-authored, avoiding drift;
  the template this document recommends for any long-tail region once a routing signal exists.
- **L-449 certification-gate discipline** (`l449CertificationGates.ts`) — enforces the invariant
  that no envelope gate is ever `true` without a recorded human signature; `UNSIGNED_OPEN_GATES` is
  empty by design, i.e. the codebase itself cannot silently drift into an unsigned-but-open state.
- **Verification ≠ dispatch ≠ rendering doctrine** (`ENVELOPE-CAPABILITY-MATRIX.md`, born from the
  Córdoba 2026-08-03 finding) — a signed gate does not imply a dispatch branch exists, which does
  not imply rendering occurs; this three-axis discipline is now applied consistently across every
  2026-08-04 audit read for this synthesis.
- **Derived-plan/delegation refusal framework** — every audited jurisdiction (Córdoba, Murcia,
  Barcelona, Sevilla, Canarias) now cites its own legally-delegated-land percentage rather than
  fabricating a number for it; this is a shared discipline, not shared code, but it is applied
  uniformly.
- **Overlay/constraint-provider architecture** (ADR-0295's fifth capability) — heritage, flood,
  environmental overlays are built as leaf providers any municipal resolver may optionally consult,
  never as a routing gate; proven live for Andalucía (`bica_public`, REDIAM) and Catalunya
  (drafted flood resolver).
- **Open-top-indicative registration class** (`OPEN_TOP_INDICATIVE_JURISDICTIONS`) — a distinct,
  honestly-labelled output tier between "refusal" and "certified determination," now used for
  Illes Balears and Zaragoza; reusable wherever a jurisdiction has real geometry but an unbounded
  or citation-incomplete top.

---

## 7. Community engines

**A framing note, addressed directly because it is easy to conflate two different claims.**
"Every autonomous community becomes a reusable platform" is true and worth saying as a STRATEGIC
description of what has been built: each region's shared overlay data, routing signals, and code
generators genuinely do make onboarding the next municipality cheaper. It is a different claim to
say each community should be IMPLEMENTED as its own code/routing layer ("an Andalucía engine," "a
Canarias engine" as software components) — that specific claim was investigated directly this pass
(`ANDALUCIA-ENGINE-ARCHITECTURE.md`) and rejected on evidence, independently matching the
founder-authored ADR-0294/ADR-0295. This section uses "engine" only in the first, strategic sense
below — what is genuinely shared per community — never the second.

Per `ANDALUCIA-ENGINE-ARCHITECTURE.md` (an explicit, founder-scoped architecture verdict, ratified
independently by ADR-0294/ADR-0295): **no autonomous community should be built as a code layer or
routing gate.** This finding is not contradicted here — it is restated accurately per community,
distinguishing what is genuinely *shared today* from what would be a new abstraction:

- **Andalucía**: no zoning/ordinance engine exists or should exist. What genuinely is shared today:
  three live region-wide overlay services — heritage (`bica_public` WMS/WFS), environmental
  (REDIAM Natura 2000/RENPA), and flood (REDIAM T10/T50/T100/T500) — consumed as optional leaf
  providers by municipal resolvers (Córdoba, Málaga, Sevilla), never as a routing gate. The
  Normas Directoras/SITUA-VITUA schema is a real legal instrument but is verified parameter-
  incomplete (FAR/density only, no height/setback/depth) and its post-mandate corpus is unmeasured.
- **Catalunya**: the MUC (Mapa Urbanístic de Catalunya) WFS is a genuinely shared, live,
  region-wide *classification/routing* service (answers "which instrument governs here" for
  947/947 municipalities) — it never supplies a numeric parameter. This is a **structural design
  fact, not a gap PRYZM hasn't found the other side of**: `esCatalunya.ts`'s own header states
  outright that this registration "MAY NOT publish any number — the MUC gives a qualification
  CODE, not parameters," and no other regional service (Open Data, INSPIRE-aligned catalogues, the
  RPUC instrument register) was found to carry one either. Height/FAR/setback/coverage/buildable
  depth were never in scope for what MUC exchanges between municipality and region — so there is no
  hidden Generalitat dataset left to search for; the search itself is what has been exhausted, not
  merely one path through it. The practical consequence: **the reusable unit for onboarding new
  Catalan municipalities is the planning-ordinance FAMILY (PGM-1976 for Barcelona + the AMB corpus,
  each municipality's own PGOU/POUM elsewhere), not the municipality itself** — MUC's real
  contribution is telling PRYZM which family applies to a given parcel, never replacing the family.
  Barcelona's own zone packs (13a/13E/13b/20a) are reused by content, not by a shared code path,
  once a second AMB municipality's numbers are independently confirmed equal to Barcelona's PGM-1976
  figures — a step **not yet done** for Badalona/Sant Boi/L'Hospitalet/Cornellà despite their shared
  vocabulary.
- **Murcia**: the regional IDERM PLU layer is explicitly self-described as reference-only, not
  authoritative for numeric parameters — nothing shared beyond a routing signal; the capital's own
  GeoServer is municipal, distinct from the regional CARM layer.
- **Canarias**: the SIPU offline-extract pattern and the bbox-table registration generator are the
  one genuinely reusable regional *mechanism* (not a computation engine) — they let ~40 further
  municipalities be onboarded without hand-authoring each registration, but every municipality
  still resolves its own zoning content independently.
- **Madrid**: no regional sharing exists at all; the region's own registration is currently blocked
  upstream by municipal-boundary geometry, before any zoning question is even reachable.
- **Illes Balears**: the one region in the whole national registry that most resembles a "regional
  engine" — and it earns that shape because the underlying *law* is genuinely regional (the MUIB
  instrument), not because PRYZM chose an architecture. This is the load-bearing distinction the
  Andalucía architecture document makes explicit: architecture must follow the legal fact, and the
  legal facts differ between Balears and every other Spanish region audited.

**Conclusion, consistent with the Andalucía architecture verdict**: the pattern that generalizes
to a national engine is `registry.ts` itself — already national, already the single computation
path every region's municipalities resolve through — not a hierarchy of regional engines beneath
it. This document finds no evidence in any of the 19 source audits that contradicts that verdict.

### What unlocks next, per community

The single highest-leverage action per community, drawn directly from §5 and §8:

| Community | Highest-leverage next action |
|---|---|
| Catalunya | Confirm AMB municipality equivalence (Badalona/Sant Boi/L'Hospitalet/Cornellà vs. Barcelona's PGM-1976 numbers) — one signature unlocks 22 municipalities at once |
| Andalucía | Sign off Sevilla `SB` (Activation-ready today); replicate its alignment-line pattern to the other 14 zone families |
| Canarias | Rewrite Telde's resolver against the confirmed-available offline SIPU shapefile; sign Telde + El Sauzal |
| Región de Murcia | Onboard a second municipality (Cartagena has its own confirmed live municipal GIS) using the capital's proven pattern |
| Comunidad Valenciana | Resolve the `altura` semantic question via the statutory Ley 19/2013 channel — nothing else in the capital is blocked |
| Illes Balears | Close the PTI category→numeric-parameter mapping (the one remaining gap to a full determination) |
| Comunidad de Madrid | Commission the CPPHAN-discretion re-audit (capital); build a real boundary `contains` predicate (region) |
| Aragón | Sign Zaragoza's existing 4-subgrado pack; the WFS itself does not extend regionally, so Huesca needs its own georeferencing fix independently |
| Castilla y León | Resolve the standing legal-counsel question on IDECyL's "sin validez jurídica" disclaimer before any further engineering |
| Galicia | Re-attempt Santiago/Vigo's live hosts from a different network before concluding they are structurally unreachable |

---

## 8. National roadmap (ordered by ROI)

**Cheap / high-impact (days, pure integration or registration work):**
1. Wire Barcelona's existing heritage + flood resolvers into dispatch (built, tested, zero call
   sites today).
2. Rewrite Telde's zone resolver against the offline SIPU shapefile pattern already proven for El
   Sauzal (package already confirmed in hand).
3. Resolve Barcelona's `PD*` derived-plan-marker semantics (documentary question, affects 70.7% of
   the city's buildable land).
4. ~~Re-verify the Córdoba certification-gate state~~ — **done in this pass**: `CORDOBA_ENVELOPE_VERIFIED`
   is `true`/signed (`SIG-1`); the only correction needed is to `ENVELOPE-CAPABILITY-MATRIX.md`,
   which is stale on this row.
5. Confirm whether the AMB municipalities' numbers (Badalona, Sant Boi, L'Hospitalet, Cornellà)
   equal Barcelona's PGM-1976 figures — if confirmed, one signature (`AMB_PGM_NNUU_ENVELOPE_VERIFIED`)
   unlocks 22 municipalities at once, the single highest-leverage unsigned gate in the codebase.

**Engineering (weeks, known method, no legal blocker):**
6. Extend Sevilla's `A_INTERIOR-MAXIMA` alignment pattern from `SB` to `CH` and beyond (13 more
   zone-family transcriptions remain).
7. Build a real municipal-boundary `contains` predicate to unblock Comunidad de Madrid's regional
   registration (currently blocked by geometry, not law).
8. Wire a real Zaragoza street-width feed (machinery already exists; needs a data source) to unlock
   its next two subgrados.
9. Transcribe Zaragoza's remaining 48 of 52 zone codes.
10. Build the Canarias offline-SIPU resolver for the ~40 "routable" municipalities beyond Telde/El
    Sauzal, using the proven bbox-table generation pattern.

**Legal / research (external timeline, PRYZM cannot unilaterally close):**
11. Commission the CPPHAN-discretion audit for Madrid NZ-1 at ADR-0296 rigor — the standing
    "permanently blocked" framing is itself unaudited.
12. Pursue València's `altura` semantics clarification through the statutory Ley 19/2013 channel
    (~1 month external timeline).
13. Request Granada municipal records on whether an internal vector master of its calificación
    exists (would drop the blocker from Very Large to Medium if it does).
14. Resolve Castilla y León's standing legal-counsel question (Q4: does the "sin validez jurídica"
    disclaimer actually bar use of IDECyL data) before any further CyL engineering.
15. Establish Andalucía's actual Normas Directoras filed-instrument count via a direct records
    request (currently unmeasurable from any public page).
16. Found policy for Canarias's 46 multi-instrument municipalities — confirmed not automatable,
    requires a founder decision on acceptable manual-lookup cost, not more engineering.

**External / third-party dependent (no PRYZM-controlled timeline):**
17. Wait on, or separately pursue, Málaga's Oracle account unlock (`ORA-28000`) — the ordinance
    text itself is already ~90% read and ready to pack the moment the geometry is reachable.
18. Re-attempt Santiago de Compostela and Vigo's live GIS backends from a different network/session
    before concluding they are structurally unreachable.

---

## 9. Overall assessment

**Current capability**: PRYZM's Spanish buildable-envelope capability is real but narrow and
unevenly distributed. Two municipalities (Barcelona, Murcia) render genuine, partial, signed
envelopes today; a third (Madrid) renders a signed but height-less footprint; a fourth and fifth
(Balears, Zaragoza) render an honestly-labelled open-top indicative result over meaningfully large
or meaningfully bounded scopes. Everything else — the vast majority of the country — is either a
well-documented refusal, an engineering-complete-but-unsigned pilot, or genuinely untouched.

**Main strengths**: the container-agnostic resolver architecture (ADR-0294) and the five-provider
capability model (ADR-0295) have now been independently stress-tested by this pass across at least
5 distinct GIS publishing formats (GeoServer WFS, ArcGIS REST, offline shapefile, raster-legal
refusal, live-resolved national service) without needing a new abstraction; the L-449 signature
discipline and the verification≠dispatch≠rendering doctrine mean the codebase cannot silently
overstate its own coverage; and the overlay-provider pattern (heritage/flood/environment) is
proven reusable at true zero marginal cost per municipality once wired.

**Largest weaknesses**: (1) ordinance transcription and legal sign-off — never the container, never
the parcel geometry — is consistently the dominant, irreducibly per-municipality cost across every
audited capital; (2) alignment/frontage geometry, needed for any block-ring or street-width-keyed
height rule, is absent almost everywhere it is needed (Córdoba, Zaragoza's remaining subgrados,
Huesca) and where it exists (Sevilla, Murcia) is only partially exploited; (3) built machinery sits
idle behind unsigned human gates in at least six places (Zaragoza, Sevilla `SB`, Telde, El Sauzal,
Madrid's full PGOUM-97, the AMB 22-municipality corpus) — the pacing item there is founder review,
not engineering; (4) 7 autonomous communities have no forensic audit at all.

**Most scalable architecture**: the flat `registry.ts` national registration list, combined with
bbox-table code generation (proven in Canarias) for long-tail regions once a routing signal exists —
not a regional engine at any level, a conclusion this pass finds no evidence to contradict.

**Estimated path to nationwide coverage**: bounded by ordinance transcription and human sign-off,
not by any remaining architecture question. The cheap/high-impact items in Section 8 (wiring
already-built resolvers, confirming AMB municipality equivalence, offline-SIPU reuse for Telde) can
meaningfully expand *coverage within already-touched cities* in days to weeks. Expanding to new
municipalities is inherently linear in transcription effort, with the Sevilla/Córdoba/Zaragoza cost
breakdowns (Section 5's item 9 discussion) showing container/parcel work is now cheap and
ordinance-reading is the dominant, non-shrinking cost.

**Regions that can now leverage existing engines instead of starting from scratch**: any future
ArcGIS-published Spanish municipality (via `containers/arcgisRest.ts`), any future Canarias
municipality with a SIPU package (via the offline-shapefile pattern and bbox-table generator), and
any future Andalucían municipality needing heritage/flood/environment context (via the three
existing regional overlay endpoints, once wired). No region should attempt to build its own zoning
or ordinance engine — every one of the 19 audits examined here, independently, reached that same
conclusion from its own evidence.
