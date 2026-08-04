# CAPABILITY AUDIT — Córdoba (INE 14021), city-wide — 2026-08-04

> **Scope.** Can PRYZM produce legally-defensible buildable envelopes ACROSS Córdoba — not just the
> existing 2-district COACo pilot (Sur + Noroeste)? This audit builds on, cites, and does not
> re-derive the extensive prior forensic work in this same directory:
> [`FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./FORENSIC-BLOCKER-AUDIT-2026-08-03.md),
> [`../sources/VERIFICATION.md`](../sources/VERIFICATION.md) (the SIG-1 signature ledger),
> [`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md) (26-row blocker list),
> [`CALIFICACION-ENDPOINT-PROBE.md`](./CALIFICACION-ENDPOINT-PROBE.md),
> [`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`](./MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md),
> [`../RISK-REGISTER.md`](../RISK-REGISTER.md). New work in this pass: (a) direct re-read of
> `apps/editor/src/ui/site/siteDispatch.ts` to confirm the compute path's *current* code state, and
> (b) live verification of four research areas the existing dossier had **not** covered — heritage
> geometry, flood, airport servitudes, environmental overlays — which turned up one materially new,
> previously-undocumented, live, machine-readable source (§5 below).

---

## Executive Summary

PRYZM can, as of this pass, compute and render a real signed buildable envelope for a narrow slice of
Córdoba, inside the 2-district COACo pilot (Sur + Noroeste, 4.96 km²), confirmed live in code
(`siteDispatch.ts:3411-3513`, gate `CORDOBA_ENVELOPE_VERIFIED = true`,
`esCordobaZoneClassification.ts:48`). ⚠ **CORRECTED 2026-08-04, later same day** — a follow-up pass
traced the lookup mechanism directly (`applyCordobaZoningThenFallback` → `findZone`, `ZoningRulesEngine.ts`
line 111: `pack.zones.find((z) => z.code === zoneCode)`) and confirmed it is a **fully generic lookup
by code across the whole 13-zone array — no allowlist, switch, or hardcoded subset anywhere in the
dispatch path**; `subzoneCodeFromLink` (`resolveCordobaSubzone.ts`) is likewise a pure regex over the
COACo `O_*` link basename with no special-cased subset. So the earlier "4 of 13" figure (OA-1, CTP-1,
UAD-1, PAS-2) was a claim about what had been *driven end-to-end in a test or a live probe so far*,
not a ceiling on what the code can reach — a real wiring gap of that shape was checked for and does
not exist. `apps/editor/__tests__/cordobaSiteDispatch.test.ts`'s new `§COR-COMPUTE-COVERAGE` suite
(added this pass) now drives 5 more codes (PAS-1, PAS-3, OA-2, UAD-2, UAD-3) to a real `status:'ok'`
envelope and 2 more (MC-2, MC-4) to the correct structural refusal, joining the pre-existing OA-1
(`status:'ok'`) and MC-1/MC-3 (structural refusal) coverage — **11 of 13 packed subzones now have a
direct dispatch-level test**; CTP-1 and PAS-2's confirmation remains the live-production probe recorded
in §9 below plus the unit-level `esCordobaEnvelopeCompute.test.ts` suite, and UAD-1 remains confirmed
via `esCordobaEnvelopeCompute.test.ts` rather than this dispatch-level file. All 13 are reachable by
construction; none is structurally stranded. That slice is worth **≈16% full / ≈31% any**
envelope of the pilot's buildable land, which is itself only **4.88%** of Córdoba's 33.342 km² of
`SUELO URBANO`. Scaled to the whole municipality the ceiling is **≈0.9% full / ≈1.7% any envelope of
SUELO URBANO** — and that ceiling is not PRYZM's to raise: an exhaustive, reproducible six-probe
search (2026-08-02) established that no machine-readable calificación exists for the remaining
95.1% of urban land, and that the municipal authority's own raster index (77 georeferenceable JPGs)
is itself ~~**41 of 49 dead**~~ ⛔ **RETRACTED 2026-08-04 — this was measured against the wrong URL
path.** The correct, live path (`https://www.gmucordoba.es/documentos/Gerencia_de_Urbanismo/
imagenes_planos/planos/cusw_jpg/CUS{NN}W.JPG`) was live-verified this session and **all 49 of 49
urban sheets were bulk-fetched successfully** — see `corpus/MANIFEST.md`. This does not change the
"no VECTOR calificación exists" conclusion — the 49 sheets are still rasters, not vector data, so
the city-wide envelope-coverage ceiling is unchanged — but it does retire the "41 dead links" data-
acquisition framing: the raster SOURCE is fully obtained; what remains is raster→vector engineering
(georeferencing + vectorisation), the same work already scoped for the 2 previously-live sheets, now
scaled to 49. Everywhere outside the packed slice PRYZM now returns a
cited, evidence-backed refusal rather than the fabricated generic-default envelope it shipped before
2026-08-01 — which is the single most important correctness fix in this file's history, and it means
Córdoba is close to **100% "terminal"** (every parcel reaches an explicit, cited outcome) while being
nowhere near 100% **numeric**. This pass additionally found, live, a materially significant asset the
prior dossier had marked "unsourced": the Ayuntamiento's Gerencia Municipal de Urbanismo (GMU)
publishes the historic-centre PEPCH'01 protection catalogue — covering the UNESCO Judería — as
static, structured GeoJSON (boundary + ~1,000+ protected-asset points/polygons with protection-level
IDs), fully machine-readable, at `gmucordoba.es/visorcasco/data/**/*.geojson`. It is not wired into
PRYZM and does not by itself supply envelope parameters (it supplies protection *level*, not
height/setback numbers), but it closes a real "does this even exist" gap. Flood (REDIAM regional WMS)
and Natura 2000 (REDIAM regional WMS) machine-readable layers were also confirmed live and unwired;
airport servitudes were confirmed to exist only as an informal Google-My-Maps overlay plus the
authoritative-but-non-geospatial Real Decreto 729/2015 text.

---

## Capability: **Research Blocked** (city-wide) — with a narrow **Engineering Blocked** pocket inside the pilot

Two different, non-contradictory ratings are true at two different scopes, and conflating them is the
exact error this dossier's own `CLOSURE-REGISTER.md` was written to prevent (see its "ceiling vs
blocker" lesson):

- **Inside the 4 bound subzones of the 2-district pilot (≈1.7% of `SUELO URBANO`'s worth of land,
  concentrated in OA-1 + CTP-1):** the remaining work — the UAD depth rule (D1), the resolver call
  site — is **Engineering Blocked**, i.e. genuinely staffable by PRYZM, days not weeks. The signature
  itself is done (`VERIFICATION.md §SIG-1`, signed 2026-08-03) and the compute path is confirmed live
  in code as of this pass.
- **City-wide (the 95.1% of `SUELO URBANO` outside the pilot):** the dominant blocker is that **no
  machine-readable calificación geometry exists to acquire**. This is not an engineering backlog and
  not a legal prohibition — it is an absence of a usable primary source, confirmed by exhaustive
  search, that only the publisher (GMU) can resolve by serving its raster sheets, publishing vector
  data, or answering a written data request. That is the definition of **Research Blocked**: the next
  action is not "build" or "wait for a court", it is "locate or request a source that does not
  currently exist in usable form" — and the search has already been run to exhaustion once
  (`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`, do-not-re-run flagged in the register).

City-wide, PRYZM **cannot today** and, on current evidence, **cannot in the near term without an
external data grant**, produce legally-defensible buildable envelopes across Córdoba. It **can**
produce a small number of legally-defensible envelopes in two ordenanza families of a 4.96 km² pilot
area, and — separately and just as importantly — it can produce a **complete, terminal, honest map of
absence** (cited refusals) everywhere else, which is real, shipped value distinct from coverage.

---

## Evidence Matrix

| Requirement | Status | Evidence |
|---|---|---|
| Planning document (PGOU-2001 text) | Scanned/vector-path PDFs, no text layer on 4 of 5 core docs; OCR'd and independently re-verified 13/13 subzones, zero digit errors | `VERIFICATION.md §SIG-1`; `OCR-EXTRACTION-RESULTS.md` |
| Zoning geometry, pilot (2 districts) | WFS 2.0.0 + WMS 1.3.0 live, `coaco:ordenanzas`, 453 polygons | `CALIFICACION-ENDPOINT-PROBE.md §2`, re-verified live this session (see §5 below for adjacent finds) |
| Zoning geometry, city-wide | **Does not exist as vector.** GMU raster index: ~~8/49 urban CUS sheets live, 41/49 dead on re-fetch~~ ⛔ **RETRACTED 2026-08-04 — wrong URL path tested; all 49/49 urban CUS raster sheets are live and now fetched.** Still no VECTOR calificación exists — the 49 sheets remain rasters requiring georeferencing/vectorisation. | `CLOSURE-REGISTER.md` blocker 22, corrected 2026-08-04, see `corpus/MANIFEST.md` |
| Parcel geometry | Catastro INSPIRE (national) + COACo `vcatastro_urbanismo` join, 5,721/5,725 pilot parcels populated | `CLOSURE-REGISTER.md` blocker 20 — PARCEL axis measured 95% |
| Block ring (for depth construction) | `idecordoba:manzana`, 20,730 blocks municipality-wide, 88.0% of pilot ordenanza land covered | `LAYER2-GEOMETRY-RECOVERY-2026-08-02.md`; `NATIONAL-CAPABILITY-REGISTER.md` row K15 |
| Height | Machine-readable for PAS/OA/UAD/CTP-1; MC is a per-street-width table with **no published alignment layer anywhere** (ADR-0285 4-part test failed at Part 3, tested not assumed) | `CLOSURE-REGISTER.md` row 25 |
| FAR / edificabilidad | Numeric for most; **algorithmic (`null` by design)** for CTP-1/MC-1/2/4 per the ordinance text itself | `VERIFICATION.md §SIG-1`; row 15 |
| Setbacks / alignment | **No VECTOR alignment layer published by any Córdoba source**, city-wide WFS/WMS GIS sweep (105 WFS + 119 WMS + 15 COACo) returned zero. ⚠ **PARTIAL CORRECTION 2026-08-04**: that sweep tested vector services only; the GMU separately publishes 49 static PDF "Alineaciones y Rasantes" sheets (`ar01.pdf`…`ar49.pdf`), live-verified and bulk-fetched this session — see `corpus/MANIFEST.md`. No vector service still exists; a raster/document source now does. | `FORENSIC-BLOCKER-AUDIT-2026-08-03.md` item 8; row 25; `corpus/MANIFEST.md` |
| Heritage — historic centre boundary (UNESCO Judería) | ⭐ **Live, machine-readable GeoJSON**, previously undocumented in this dossier | §5 below, verified live this session |
| Heritage — protected-asset catalogue (PEPCH'01) | ⭐ **Live, machine-readable GeoJSON**, per-asset protection level, **no height/setback numbers** | §5 below |
| Flood (Río Guadalquivir) | Live regional WMS (REDIAM), single 500-yr consolidated layer confirmed; a separate multi-return-period (T10/T50/T100/T500) REDIAM WMS-WFS product is catalogued but not independently re-verified live this session | §6 below |
| Airport servitude surfaces | **No authoritative machine-readable geometry found.** AESA's own "Mapa de SSAA" is a Google My Maps embed; the binding instrument is Real Decreto 729/2015 (text, not geodata) | §7 below |
| Environmental (Natura 2000) | Live regional WMS (REDIAM, LIC/ZEC/ZEPA) confirmed | §8 below |
| Legal delegation to derived plans | Measured, ≈43–45% of pilot ordinance land, `coaco:actuaciones` layer | `CLOSURE-REGISTER.md` row 14 |
| Dispatch feasibility, pilot | ✔ resolver called, gate open, compute confirmed in code this session | `siteDispatch.ts:3411-3513` |
| Dispatch feasibility, city-wide | ✘ — no registration/source exists to dispatch against outside the pilot; refusal-only municipal registration ships instead | `CLOSURE-REGISTER.md` blocker 1 (closed as a refusal, not as coverage) |

---

## Machine-readable assets — every endpoint verified this session or in the cited prior work

**Zoning / parcel (prior work, re-cited, not independently re-hit live this session — see caveat below):**
- `https://geoserver.pgou.coacordoba.org/geoserver/wfs` (WFS 2.0.0) — `coaco:ordenanzas`, `coaco:actuaciones`, `coaco:usos_globales`, `coaco:distritos`, `coaco:vcatastro_urbanismo`
- `https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15` — national SIU *clasificación* (not calificación), covers whole municipality
- `https://ide.cordoba.es/geoserver/wfs` GeoServer — `idecordoba:manzana` (20,730 blocks; ⚠ CORRECTED 2026-08-04 — the host is `ide.cordoba.es`, NOT `idecordoba.cordoba.es`, which does not resolve. Live-reverified this session: `totalFeatures`/`numberMatched` = 20,730, matching the count below, EPSG:25830, plausible Córdoba UTM coordinates)

**Heritage — ⭐ NEW, verified live this session:**
- `https://www.gmucordoba.es/visorcasco/data/limites/limite_ch.geojson` — **HTTP 200**, 52,002 bytes, `FeatureCollection`, CRS84 — the historic-centre (PEPCH/Judería-UNESCO) boundary polygon.
- `https://www.gmucordoba.es/visorcasco/data/catalogo/ed_edificios.geojson` — **HTTP 200**, 632,188 bytes — catalogued buildings, properties include `id0/id1/id2`, `nombre`, `tipo`, `idlink`, a link to a per-asset PDF ficha.
- `https://www.gmucordoba.es/visorcasco/data/catalogo/ed_monumentos.geojson` — **HTTP 200**, 283,585 bytes — catalogued monuments (e.g. `MC-15` "Muralla de la Ajerquía").
- `https://www.gmucordoba.es/visorcasco/data/catalogo/ed_conjuntos.geojson`, `ed_hitos.geojson`, `al_espacios.geojson`, `espacios_catalogados.geojson` — sibling layers, same pattern (linked, not independently opened this session — same host, same static-file convention, same viewer, treat as live with the same confidence).
- Publisher-announced (not independently confirmed this session): bulk download in CSV / KML / ESRI Shapefile / GeoJSON via the catalogue's own UI (`gmucordoba.es/novedades/item/183-...`), WGS84.
- **What it is NOT**: a source of envelope parameters. The catalogue records a protection *level* (`tipo`, an identification code) per asset and links a PDF record, not a machine-readable height/setback/volume rule. The PEPCH's actual buildability rules (Normas Urbanísticas) were not confirmed this session to have a text layer — treat as unverified pending the same OCR-fidelity discipline already applied to the PGOU-2001 pack.
- `https://www.iaph.es/ide/localizador/wms` — **HTTP 200**, WMS, single layer `localizador` ("Localizador Cartográfico del Patrimonio Cultural Andaluz") — regional BIC/heritage locator, coarser than the GMU catalogue, not Córdoba-specific.

**Flood — verified live this session:**
- `https://www.juntadeandalucia.es/medioambiente/mapwms/REDIAM_zonas_inundables_Andalucia` — **HTTP 200**, WMS, layer `zonas_inundables_andalucia` (500-yr return period compilation, whole-Andalucía bbox, includes Río Guadalquivir at Córdoba).
- Catalogued but not independently re-hit this session: `REDIAM_zonas_inundables_periodos_retorno` (T10/T50/T100/T500 WMS-WFS product) and Confederación Hidrográfica del Guadalquivir's own APSFR service. Note: `idechg.chguadalquivir.es/geoserver/wms` was probed live this session (HTTP 200, 254 KB capabilities XML) and its layer list contains **no flood-zone layer** — only water-quality/abstraction-zone layers (`zonas_sensibles_*`, `zonas_captacion_rio`, etc.). The authoritative CHG flood service, if one exists, was not located this session; REDIAM's regional compilation is the only flood source confirmed live.

**Environmental — verified live this session:**
- `https://www.juntadeandalucia.es/medioambiente/mapwms/REDIAM_Red_Natura_2000` — **HTTP 200**, WMS, layer `red_natura_2000` (LIC/ZEC/ZEPA, whole Andalucía).

**Airport — verified live this session:**
- No dedicated WMS/WFS/REST endpoint located. AESA's "Mapa de SSAA" (`seguridadaerea.gob.es/es/ambitos/servidumbres-aeronauticas/mapa-de-ssaa`) links out to a **Google My Maps** viewer (`google.com/maps/d/viewer?...mid=1W0aSGJIpS2QHRd24hk87CISY2ekmnx8`) — not an authoritative GIS service, though Google My Maps does support a KML export a determined pipeline could scrape (untested, and its legal status as a primary source is weak — it is AESA's *convenience* map, not the instrument itself).
- The binding legal instrument is **Real Decreto 729/2015** (modifying Córdoba airport's servidumbres), confirmed to exist via `seguridadaerea.gob.es/sites/default/files/ficha_cordoba.pdf`, but that PDF itself is a reference sheet with outbound links, not geodata.

---

## Missing assets

> ⛔ **CORRECTION 2026-08-04 applies to both bullets below** — see `corpus/MANIFEST.md`. Both were
> written testing the wrong URL path / the wrong service type; both underlying document sources
> are now confirmed live and fetched. Neither correction produces a VECTOR calificación or a VECTOR
> alignment layer — that remains genuinely missing — but "no source exists to acquire" is false for
> both; the raster/document sources exist and are now in-repo.

- ~~Vector calificación for 95.1% of `SUELO URBANO` (41 of 49 urban CUS raster sheets are dead; no
  alternative machine-readable source found after an exhaustive 2026-08-02 search).~~ **CORRECTED:
  all 49 urban CUS raster sheets are live and fetched** (wrong URL path was tested). What is
  genuinely still missing is the VECTOR calificación — the 49 sheets are rasters, not vector data,
  and georeferencing/vectorising them into calificación polygons is unstarted engineering work.
- ~~Any alignment/frontage layer anywhere in Córdoba's published GIS (needed for setback measurement
  and for the MC street-width height table) — proven absent, not merely unfound.~~ **PARTIALLY
  CORRECTED:** no VECTOR alignment layer (WFS/WMS) exists — that finding stands. But a published,
  citable static-document alignment source (49 "Alineaciones y Rasantes" PDFs) does exist and is
  now fetched; it was outside the scope of the WFS/WMS sweep that produced "proven absent."
- A structured (non-scanned) source for PGOU-2001 ordinance numbers — none exists; COACo serves only
  scanned/vector-path PDFs.
- PEPCH'01 Normas Urbanísticas as structured/text-extractable data (only the catalogue *index*
  geometry was confirmed machine-readable this session; the actual protection-level rulebook was not
  fidelity-checked).
- An authoritative, geospatial airport-servitude layer (only an informal Google My Maps overlay
  exists publicly).
- A confirmed authoritative CHG-specific (rather than REDIAM-regional) flood-risk layer for the
  Guadalquivir at Córdoba.
- Tomo VI (Conjunto Histórico envelope volume cited in Art. 13.4.1) — confirmed not served anywhere
  (prior work).
- A COACo subzone attribute for the 14 bare-`O_MC.pdf` polygons (1.14% of ordenanzas land) —
  publisher-gated, not obtainable by PRYZM.

---

## Blockers

1. ⛔ **CORRECTED 2026-08-04** — ~~95.1% of `SUELO URBANO` has no machine-readable calificación,
   requires GMU to publish vector data, fix its raster sheets, or respond to a direct data
   request.~~ The GMU's raster sheets were never broken — the wrong URL path was tested. All 49
   urban CUS raster sheets are live and now fetched (`corpus/MANIFEST.md`). **95.1% of `SUELO
   URBANO` still has no VECTOR calificación**, but the blocker has changed category: it is no
   longer *Data acquisition* waiting on GMU to fix or serve anything — the raster source is fully
   in hand. It is now **Engineering**: georeferencing + vectorising 49 raster sheets into
   calificación polygons, then binding through the resolver (the same treatment already given to
   the 8 previously-known-live sheets, scaled up). *Solvability:* Large but genuinely
   engineering-solvable, not externally gated. Exhaustively searched once for a shortcut vector
   source (`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`) — that conclusion (no vector alternative
   exists) still stands; only the raster-availability premise was wrong.

2. **Manzana Cerrada (16.86% of pilot buildable land) height is an unresolvable per-street-width
   table.** *Category:* External authority / Awaiting authoritative interpretation. *Solvability:*
   Requires GMU/COACo to publish an alignment layer or state the measurement basis of Art. 13.5.3.1;
   PRYZM's own street-polygon proxy was tested and rejected under ADR-0287 (band-edge sensitivity too
   high — 45.4% of streets sit within ±1 m of a 2 m-wide height band edge). ⚠ **PARTIAL CORRECTION
   2026-08-04:** a static alignment document source (49 "Alineaciones y Rasantes" PDFs) has now been
   found and fetched (`corpus/MANIFEST.md`) — this is a candidate path to reading Art. 13.5.3.1's
   measurement basis directly, which was previously believed to require a GMU response with no
   existing source to consult. No vector alignment layer exists (that conclusion stands); the
   street-polygon proxy remains rejected under ADR-0287 regardless.

3. **~43–45% of pilot ordinance land is legally delegated** to Plan Parcial / PERI / Estudio de
   Detalle / Plan Especial. *Category:* Legal, terminal. *Solvability:* Correctly answered today with
   a cited refusal once the delegation branch is exercised (blocker 3 in `CLOSURE-REGISTER.md`); not
   a gap to close, a fact to report.

4. ~~**UAD `profundidad máxima edificable` (Art. 13.9.3.3) is stated in the source and absent from the
   shipped pack.**~~ **STALE — already closed.** This blocker was fixed in commit `fcd239ab`
   (2026-08-02, "OCR verified 13/13 CLEAN — and the ENVELOPE ceiling is ~3x LOWER than advertised")
   and reconfirmed live in `packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts` (D1, all
   three UAD subzones carry a `geometricRule` with the stated 16/18/16 m depth) and
   `CLOSURE-REGISTER.md` row 4 ("**CLOSED**"). Re-verified against the current tree this session
   (2026-08-04): the fix is present and the Córdoba test suite passes with it in place. Flagged here,
   not silently corrected in the numbered claim above, per this dossier's own documentation-drift
   discipline (see blocker 8).

5. **PEPCH/historic-centre buildability numbers are unverified and unwired.** *Category:* Engineering
   + OCR-verification (the same L-449 discipline already applied to the PGOU-2001 pack has not been
   applied here). *Solvability:* Medium — the geometry (§5) is already live; what's missing is (a)
   confirming the Normas Urbanísticas text is extractable, (b) transcribing/OCR-verifying it, (c) a
   human sign-off, exactly the PGOU-2001 playbook, applied to a second, disjoint instrument.

6. **No airport servitude source meets PRYZM's own evidentiary bar.** *Category:* Data
   acquisition/External authority. *Solvability:* Low without a direct AESA data request; the
   informal Google My Maps overlay is not something PRYZM's documented standards (`ADR-0284`
   forbidding derived-law substitution) would allow treating as authoritative.

7. **No confirmed Córdoba-specific (CHG) flood layer**, only a regional REDIAM compilation.
   *Category:* Data acquisition, low severity — REDIAM's product is plausibly sufficient (whole-
   Andalucía, includes the Guadalquivir corridor) but was not cross-checked against a Córdoba-specific
   authoritative source this session. *Solvability:* Small — a follow-up probe of CHG's actual
   flood/APSFR service (distinct from the geoserver instance probed this session, which carries no
   flood layer) would close this.

8. **`CORDOBA_ENVELOPE_VERIFIED` signature and compute path are landed, but the prior dossier's own
   `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` (line 449) still reads "⛔ refusing — refusal-only since
   2026-08-01."** *Category:* Documentation drift, not a capability blocker — flagged so the next
   reader does not trust a stale cross-reference over the code and the signed `VERIFICATION.md`
   directly re-read this session.

---

## Estimated Unlock Effort

- **Pilot-scope engineering closure** (blockers 4 + the resolver wiring, both largely done per this
  session's direct code read): **Tiny–Small** (hours to ~1 eng-day remaining).
- **MC street-width resolver**: **Medium**, and gated on an external publisher action that may never
  come — effort estimate assumes the data becomes available, which is not assured.
- **PEPCH transcription + sign-off** (a second, smaller L-449 pass): **Small–Medium**, days, mostly
  human OCR-verification and legal sign-off time, not engineering.
- **City-wide vector calificación (the 95.1% gap)**: **Very Large**, and possibly **Impossible without
  external cooperation** — this is not a PRYZM staffing question.
- **Overall, to move the *city-wide* capability rating**: **Very Large**, dominated by an external
  dependency PRYZM does not control.

## Recommendation: **Wait for external source** (city-wide) / **Build now, narrowly** (pilot subzones only)

Do not invest further engineering in trying to manufacture city-wide coverage — the search for a
machine-readable source has already been run to exhaustion and the answer is negative, confirmed
again by this session's independent checks (flood/heritage/environmental/airport probes each
surfaced real regional infrastructure but nothing that changes the calificación picture). The correct
next action for the 95.1% gap is a **written data request to GMU** (specific asks already itemised in
`CLOSURE-REGISTER.md` blocker 22: the 41 missing sheets, world files for the 8 live ones, the `et`
field definition, the instrument date), not more searching and not more building. Inside the pilot,
finishing blockers 3–4 and applying the same certification discipline to the newly-found PEPCH
catalogue are both legitimate, boundable, worthwhile engineering tasks — "build now, narrowly" — but
they will never make Córdoba a city-wide answer on their own.

## PRYZM Readiness Score: **17 / 100**

Rationale: ENVELOPE axis is a *measured* 0.0% as of the register's last full C63 pass
(`cordoba.measurements.json`, 2026-08-01), and this session's direct code read confirms a real but
extremely narrow compute path now renders on ~1.7% of `SUELO URBANO`'s worth of land at best — not
enough to move the measured axis meaningfully. PARCEL is genuinely strong (95%, independently
measured). LEGISLATION coverage of the *known* subzone families is 40–50% but resolves to numbers on
a small fraction of land once delegation is subtracted. HEIGHTS is 0.271% (measured, pre-national-
bake). Heritage/flood/environmental data now confirmed reachable but entirely unintegrated (0 credit
under current C63 axes, which don't yet score those overlays at all). The score reflects genuine,
verifiable, non-fabricated progress in a corner of the city, not a city capability.

---

## Compare against: Barcelona, Murcia, Balears, Zaragoza, Sevilla, Valencia, Granada, Málaga

⚠ This comparison draws on this repo's existing cross-city trackers
(`docs/04-reference/GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md`,
`docs/04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md`) rather than fresh live audits of each
city — those are out of scope for this pass. Treat non-Córdoba figures as **secondary, previously
measured by other sessions**, not independently re-verified here.

| City | Status (per existing trackers) | vs. Córdoba |
|---|---|---|
| **Barcelona** | Only city "live in production"; **20.9%** end-to-end envelope resolution measured 2026-07-22; corpus boundary formally signed (D-006); ~62.8% of land is legally derived-plan (worse delegation ratio than Córdoba's ~43–45%) | Materially ahead — real production traffic, a signed corpus, and an order of magnitude more measured coverage |
| **Murcia** | Signed, `estimated-ruleset` published; street width **constructed** from a published alignment layer (`Murcia:pgou_alineaciones`) — the exact layer type Córdoba has proven **does not exist** at any Córdoba publisher; ~28% ECC measured | Ahead specifically on the alignment/street-width problem that structurally blocks Córdoba's MC family (16.86% of pilot land) |
| **Madrid** | Packed zones exist but router gap (`isInBarcelona`-style bbox checks) means Madrid's dissolve/depth/inset paths are "currently unobservable" in production per the tracker; NZ-3 (90.43 M m²) is legally terminal | Roughly comparable maturity — both have real packs gated behind unresolved wiring/legal issues |
| **València** | 0% ECC measured per the same tracker; storeys variable blocks 85.5% of buildable land | Behind Córdoba on measured ECC, though not independently confirmed this session |
| **Sevilla** | "Not started" per tracker (zone identity resolves via ArcGIS `zona_orden`, but the PGOU-2006 rule pack is empty by construction — zero transcribed parameters) | Behind Córdoba — Córdoba at least has a signed, partially computing pack; Sevilla has none |
| **Balears, Zaragoza, Granada, Málaga** | No entries found in either cross-city tracker; Málaga has some real-corpus reading work recorded in agent memory but no evidenced envelope-computation status in repo docs. **Not assessed this session** — do not infer a rating | Unknown; cannot be honestly ranked against Córdoba from what this repo currently holds |

**Net position:** Córdoba is neither the best nor the worst documented Spanish city in this repo. It
is distinguished by having done unusually rigorous **negative-evidence** work (proving what does NOT
exist, at scale, rather than assuming) — which is valuable but does not itself produce coverage.
Murcia's alignment layer is the single clearest "what would unblock Córdoba" reference point.

---

## Final Verdict

**Can PRYZM create legally-defensible buildable envelopes in Córdoba? Yes, but only for a small,
provable slice — 4 ordenanza subzones inside a 4.96 km² pilot area, worth on the order of 1–2% of the
city's urban land — and No, not city-wide, not in the foreseeable term, without an external data
grant.** Everywhere outside that slice PRYZM correctly refuses rather than fabricates, which is a real
and defensible product state (a complete map of honest "I don't know, and here is exactly why"), but
it is not buildable-envelope coverage and should never be reported as such.

**Single biggest blocker:** the Gerencia Municipal de Urbanismo's own calificación geometry is not
usably published **as vector** — ~~41 of 49 urban raster sheets are dead links~~ ⛔ **CORRECTED
2026-08-04: all 49 urban raster sheets are live and now fetched, see `corpus/MANIFEST.md`; the
"dead links" premise was a wrong URL path, not a publisher gap.** No vector alternative exists
anywhere (confirmed by an exhaustive six-probe search, and this narrower conclusion still stands) —
but the blocker is now **Engineering** (georeference + vectorise 49 raster sheets), not an
external-publisher wait. It sits alongside a second, related blocker inside the pilot itself — no
VECTOR alignment/frontage layer exists anywhere in Córdoba's GIS (this still stands), though a
static document alignment source (49 PDFs) has now been found and fetched, which the Manzana
Cerrada height-table problem may be able to use directly once someone reads it against Art.
13.5.3.1's open measurement-basis question.

---

## §9. Transient `source-data-unavailable` on packed zones — live-tested, NOT a coverage gap (2026-08-04)

A founder testing the production UI at `pryzm.fly.dev` hit "TEMPORARILY UNAVAILABLE" /
`source-data-unavailable` on two separate clicks inside the Sur district — one resolving to `CTP1-
Campo de la Verdad`, one to `OA-1` — both of which are among the 4 packed subzones this audit
confirms have a real signed compute path (§Executive Summary above). This is the SAME kind of
failure `resolveCordobaSubzone.ts`'s honesty properties are built to surface (an upstream fetch
failing at that instant), not a resolver defect or a coverage boundary.

**Diagnosed live, same session:** the true upstream (`geoserver.pgou.coacordoba.org`) answered
`HTTP 200` in ~1.2s on a direct probe. The production same-origin proxy
(`https://pryzm.fly.dev/api/cordoba/ordenanzas?lat=37.87646&lon=-4.77497` — the EXACT coordinates
from the first failed screenshot) was re-tested immediately after and returned `HTTP 200` in
0.18s with the correct feature (`"ordenanza":"CTP1- Campo de la Verdad"`). So this was a genuine,
one-off transient failure — not a systemic outage, not a misconfigured proxy, and not a coverage
gap — exactly matching the UI's own "temporary source outage, not an error, not a limit on your
land" framing. No code change indicated by this single data point; flagged here so a FUTURE report
of "temporarily unavailable inside the pilot" is checked against this precedent (does it clear on
retry within seconds, like this one did, or does it persist — which would be a different, real
problem worth investigating) rather than being mistaken for a coverage-boundary result.

---

## §10. NARROW CHECK — are the 8 live CUS sheets raster or vector? (2026-08-04, second session)

> **Scope of this addendum only.** Does not re-derive `MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`
> or the CLOSURE-REGISTER's row 22 — both already establish 8/49 urban CUS sheets are live and 41/49
> are dead. This check asks one narrower question that dossier had already answered in passing but
> not stated as its own conclusion: **for the 8 sheets that ARE live, is the content a scanned raster
> (needs OCR + georeferencing) or does it carry embedded vector/text data (extractable directly)?**

**Method:** live `curl -I` (HEAD request) against all 8 sheet URLs this session, re-verifying
`Content-Type` and `Content-Length` against the 2026-08-02 record.

**Result — DECISIVE, no PDF-parsing tooling needed:**

| Sheet | URL | Content-Type | Bytes | Last-Modified |
|---|---|---|---:|---|
| CUS18W | `.../doc/planos/cus/CUS18W.jpg` | `image/jpeg` | 447 384 | 2023-11-09 |
| CUS19W | `.../CUS19W.jpg` | `image/jpeg` | 499 576 | 2023-11-09 |
| CUS25W | `.../CUS25W.jpg` | `image/jpeg` | 481 662 | 2023-11-09 |
| CUS26W | `.../CUS26W.jpg` | `image/jpeg` | 478 290 | 2023-11-09 |
| CUS34W | `.../CUS34W.jpg` | `image/jpeg` | 423 880 | 2023-11-09 |
| CUS41W | `.../CUS41W.jpg` | `image/jpeg` | 461 957 | 2023-11-09 |
| CUS45W | `.../CUS45W.jpg` | `image/jpeg` | 365 349 | 2023-11-09 |
| CUS46W | `.../CUS46W.jpg` | `image/jpeg` | 376 024 | 2023-11-09 |

All 8 byte counts are **identical** to the 2026-08-02 record (unchanged since) and all 8 carry the
**same `Last-Modified` date** (one batch upload). **All 8 are served with `Content-Type: image/jpeg`
— they are not PDFs at all.** They are flat JPEG raster images. This makes the raster-vs-vector
question moot in the strongest possible way: a JPEG is a lossy raster compression format by
definition and **cannot** contain embedded vector paths, text objects, or any structure a PDF tool
(`pdfplumber`, `pdftotext`, `pdfjs-dist`, `pdf-lib`) could extract — there is no PDF internal object
structure to inspect because there is no PDF. This corroborates and sharpens
`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md` §6, which already noted no world file/EXIF/XMP
producer metadata is served alongside any of the 8 — consistent with these being plain scanned/plotted
raster exports with zero embedded structured data of any kind.

**Verdict: all 8 live CUS sheets are confirmed scanned/plotted raster images (JPEG), none carries
extractable vector or text data. This reconfirms the prior conclusion (manual OCR + georeferencing,
not direct extraction, would be the only path for these 8 — and per the founder's doctrine on
non-georeferenced rasters, ADR-0283, that path could not authorise a dispatched envelope even if
attempted). No further action indicated; this closes the raster-vs-vector question cleanly as a
negative result.** Separately, note the PGOU-2001 **ordinance TEXT** documents (`O_MC.pdf`,
`O_UAD3.pdf`, etc., cited in `VERIFICATION.md §SIG-1` and row 19 above) are genuinely `application/pdf`
and were already confirmed to have a real (if sometimes zero-character) text layer by the existing OCR
verification pass — those are a completely different, already-resolved question from the CUS
*geometry* sheets checked here.

---

*Authority: this pass supersedes nothing in the cited findings; it adds §5–§8 (heritage/flood/
airport/environmental, previously absent from this dossier) and reconfirms the compute-path code
state directly against `siteDispatch.ts` as of 2026-08-04. Maintainer: UNASSIGNED. All URLs above
were fetched live in this session on 2026-08-04 except where explicitly marked "not independently
re-hit this session" / "catalogued but not confirmed."*
