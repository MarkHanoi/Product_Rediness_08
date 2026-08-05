# CAPABILITY AUDIT — Madrid (capital, INE 28079) AND Comunidad de Madrid (region, 178/179 non-capital municipalities)

**Date:** 2026-08-04. **Method:** primary-source read of the repo's own extraction/verification
corpus (`sources/VERIFICATION.md`, `RISK-REGISTER.md`, `ENVELOPE.md`, `esMadridPgoum97.ts`,
`resolveMadridNZ1Ring.ts`, `esMadridSpacm.ts`, `l449CertificationGates.ts`, the founder-capture
`SOURCE-founder-*` files), plus fresh live spot-checks (WebFetch, this session, 2026-08-04) against
`sigma.madrid.es` and `comunidad.madrid`. **Scope discipline:** capital and region are two
architecturally distinct gates in this codebase (`MADRID_ENVELOPE_VERIFIED` / `MADRID_NZ1_CERTIFIED`
vs. `CM_SPACM_ENVELOPE_VERIFIED`) and are kept separate throughout, per the repo's own
`§CM-REGISTRATION-BLOCKED` warning that folding them together is a named error.

⚠ This audit does not re-run the 17/19-stage CPPHAN negative-proof programme the founder specified
on 2026-08-03 (`SOURCE-founder-nz1-cpphan-negative-proof-dossier-2026-08-03.md`) — that programme is
open and unstarted, and this audit inherits its conclusion (Section 4) rather than closing it.

---

## Executive Summary

PRYZM can today produce **zero legally-defensible numeric buildable envelopes** anywhere in Madrid
capital or the Comunidad de Madrid region, but the *reason* differs sharply by half. The **capital**
has the richest data pipeline of any Spanish jurisdiction in this repo — a 626-page born-digital
ordinance machine-read into 282 cited records across 23 zones, a live ArcGIS zoning router (34
verified codes), and a signed doctrine (SIG-M2, founder, 2026-08-02) authorising a *footprint-only*
path for Norma Zonal 1 (11.7% of zoned land) — yet every gate that would let a number reach a user
is still shut: `MADRID_ENVELOPE_VERIFIED = false` (unsigned transcription, three named preconditions
partially met) and `MADRID_NZ1_CERTIFIED = true` but structurally height-less (Art. 8.1.15.1 defers
height to a discretionary planning committee, CPPHAN, for grados 1º–5º — a finding not yet put
through the rigor the founder itself demanded). The **region** is architecturally further back: a
genuinely rich regional dataset was found this week (a 304 MB GeoPackage, `VPLA_ORDENANZAS` table,
thousands of height/setback/FAR keyword hits) but the adapter that reads it cannot be reached by any
click today, because Madrid capital's and its western neighbour's real municipal boundaries
geometrically interleave by 4.35 km and no bounding-box can route between them — a routing bug
upstream of every legal question about the ordinance itself.

## Capability Ratings

**Capital (28079): Legally Blocked (height) / Engineering Blocked (full PGOUM-97).**
The footprint-only NZ-1 path is architecturally sound and doctrine-signed, but ships no dimension a
user could build to (no height, no FAR — `COEF_Z` is a non-numeric coded token). The 23-zone
PGOUM-97 pack (NZ 4/5/7/8/9, 27.8% of zoned land) is machine-extracted but legally unsigned
(`MADRID_ENVELOPE_VERIFIED = false`); six of its 23 zones are additionally flagged as **not
sign-off-ready in principle** even once signed, because they over-state buildable area by
construction. NZ 3 (60.5% of zoned land) is a *correct* legal refusal, not a gap.

**Region (Comunidad de Madrid, 178 non-capital municipalities): Engineering Blocked.**
Not legally blocked in the way the capital's height question is — no discretionary-committee finding
exists for the region. It is blocked because the jurisdiction cannot be *registered* at all: the
capital's and Boadilla del Monte's real municipal terms overlap by a measured 4.35 km, so no
rectangle can separate 28079 from the other 178, and a second independent test
(`jurisdictionSpecificity.test.ts`) fails for the same geometric reason. `CM_SPACM_ENVELOPE_VERIFIED`
is unsigned and, unlike the capital's PGOUM-97 gate, no signature has even been requested yet.

---

## Evidence Matrix

| # | Question | Capital (28079) | Region (Comunidad de Madrid) |
|---|---|---|---|
| 1 | Planning doc form | Born-digital PDF, no OCR (Compendio 2025, 24-09-2025, 626 pp; `carácter informativo`, official text is BOCM) — VERIFIED live (V1–V3, V19) | Vectorized planning cartography, "160+ parameters" per publisher's own page, verified live 2026-08-03; delivered as ATOM bulk GeoPackage, not a live per-parcel WFS |
| 2 | Zoning geometry live? | Yes — `NORMAS_ZONALES/0` (34 codes, VERIFIED-LIVE V5/V12/V13); `PG_CONDICIONES_EDIFICACION/6` (NZ-1 footprint, VERIFIED-LIVE V6). **Re-probed this session (2026-08-04): layer 6 returned "servicio... no disponible" — a live outage, of unknown duration, on the exact endpoint the shipped resolver calls.** | Yes at the ATOM/bulk level — 304 MB GeoPackage pulled and inspected this week (`VPLA_ORDENANZAS`, `VPLA_CLASIFICACION`, `VPLA_AMBITOS` tables); **no live per-parcel WFS theme for planning** was found among the 17 published WFS themes (re-confirmed this session: IDEM page lists Planeamiento only under ATOM bulk download, not WFS) |
| 3 | Parcel geometry | National Catastro INSPIRE WFS, EPSG:25830 (municipal zoning), block-ring dissolve rated 2/4 (weaker than Barcelona's 2/2) | Same national Catastro path, proven end-to-end on a real Boadilla parcel (`4228504VK2742N`) |
| 4 | Envelope parameters — capital NZ-1 | **CPPHAN discretion confirmed for grados 1º–5º** (Art. 8.1.15.1); grado 6º is the **named exception** — its storey count (not height in metres) is tabulated (`MADRID_NZ1_G6_ANCHO_TABLE`, Art. 8.1.10 ap. 3.f)ii)). So "most, not all" is correct: 1 of 6 grados has a partial machine-readable rule, and even that is storeys-only, no metric height | Region: keyword census only (`ALTURA` 3,536, `RETRANQUEO` 1,345, `EDIFICABILIDAD` 944 occurrences in the GPKG) — column-to-value schema mapping **not yet done**; genuinely unknown how many of the 178 municipalities resolve to a clean numeric parameter set |
| 5 | Heritage (UNESCO Prado-Retiro axis) | Not found wired in any Madrid file read this session; no `PG_EDIFICIOS_PROTEGIDOS` field inventory has been run (probe P4, open) | Not assessed |
| 6 | Flood (Manzanares/Jarama) | Not found wired in any Madrid file read this session | Not found wired |
| 7 | Airport (Barajas) | Not found wired in any Madrid file read this session; region-file explicitly names AESA obstacle surfaces as a known, unheld downward constraint (`CM_SPACM_ROADMAP_LINE`) — same gap likely applies to the capital, unconfirmed | Explicitly named unheld (`esMadridSpacm.ts`) |
| 8 | Environmental (Natura 2000 / Guadarrama) | Not assessed this session | Not assessed this session; Sierra de Guadarrama partly regional — no coverage claim found |
| 9 | Legal delegation | NZ 3 = 60.5% of zoned land, ordinance-declared *aprovechamiento agotado* (Art. 8.3.1) — a **correct refusal**, not a gap. Plus derived ámbitos (APR/APE/API/Plan Parcial), share ~35% of residential land, **unsourced estimate** | Development ámbito (Plan Parcial/Especial/Unidad de Ejecución) delegation confirmed on the proving parcel's neighbourhood; region-wide %, unmeasured beyond the single Boadilla corpus (39.4% solvable / 57.4% public-system / rest ámbito-governed, per-ordinance-polygon, NOT per-buildable-land) |
| 10 | Dispatch feasibility | Footprint-only NZ-1 path is coded, tested, and doctrine-signed (SIG-M2) — but structurally cannot carry height/FAR, so "works end-to-end" is true only for a clipped 2D outline, not a solid envelope | No path exists — `CM_SPACM_REGISTRATION_BLOCKED = true`; the adapter is reachable only by direct import in tests, unreachable by any user click |

## Machine-readable assets (verified this session or inherited from live-verified repo evidence)

**Capital**
- `sigma.madrid.es/.../DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0` — zoning router, `AMB_TX_ETIQ`, 34 distinct codes, VERIFIED-LIVE 2026-07-24/2026-08-01 (V5, V12, V13).
- `sigma.madrid.es/.../PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6` — NZ-1 footprint + `COEF_Z` + `CODMANZANA`. VERIFIED-LIVE 2026-07-23 (V6). **Returned a service-unavailable page when re-probed live this session (2026-08-04)** — treat as a transient outage per the repo's own R2/R8 discipline (unknown, not absence), but it means the shipped `/api/madrid/condiciones` proxy would be non-functional right now if called.
- `sigma.madrid.es/.../PGOUM97/PG_ORDENACION/MapServer/8` — `Alineaciones`, 22,584 official-alignment polylines, VERIFIED-LIVE 2026-08-01 (V15).
- National Catastro INSPIRE WFS (parcel geometry).
- Compendio 2025 PDF, transparencia.madrid.es, `Last-Modified 2025-10-20`, HTTP 200 on HEAD (V2) — but **GET is blocked by Akamai** for automated fetches (V20); the in-repo copy was recovered from a prior scratchpad, not re-downloaded.

**Region**
- `idem.comunidad.madrid` ATOM feed → `vpla_pg_gpkg.gpkg` (132.8 MB zip / 304 MB extracted), EPSG:4258, CC BY 4.0, dated 2026-07-21 — downloaded and schema-inspected this week; confirmed live again this session (IDEM page confirms ATOM "Planeamiento Urbanístico" service, fetched 2026-08-04).
- `Callejero:SIGI_V_MUNICIPIOS` on `idem.comunidad.madrid` — all 179 municipal boundary **polygons**, keyless, read 2026-08-02. This is the asset that could unblock registration (a `contains` predicate instead of a bbox) but has not been built.
- National Catastro INSPIRE WFS (same path as capital), proven on one real parcel.
- 17 published WFS themes on IDEM — **planning is NOT among them**; the region's ordinance layer is bulk-download-only, not per-parcel-queryable today.

## Missing assets

- Capital: heritage overlay (Palacio Real/Retiro/Prado UNESCO axis), flood zones, Barajas obstacle surfaces, environmental overlays — none found wired to any Madrid capital code path.
- Capital: `PG_ANALISIS_EDIFICACION`, `PG_USOS_Y_ACTIVIDADES`, `PG_EDIFICIOS_PROTEGIDOS` — named as hypotheses in the repo's own sources, **never queried** (open probes P3–P5).
- Capital: a georeferenced or otherwise machine-consumable record of CPPHAN determinations (the entire premise of the height blocker rests on this being absent, and that absence has not been proven to the standard the founder itself specified).
- Region: a column-to-value schema map of `VPLA_ORDENANZAS` (keyword hits ≠ parsed parameters).
- Region: the municipal-boundary `contains` routing predicate (engineering deliverable, not yet built).
- Region: heritage, flood, environmental, airport overlays — none found.

## Blockers

1. **[LEGAL, capital-height]** Art. 8.1.15.1 PGOUM-97 defers NZ-1 height for grados 1º–5º to CPPHAN, a discretionary planning committee — a genuine legal-discretion blocker *if* the founder's 2026-08-03 negative-proof standard is met. **It is not yet met**: no `NZ1-negative-knowledge.md`-shaped artefact exists, and per the repo's own ADR-0296, an unaudited absence claim defaults to status C (re-audit required), not settled fact.
2. **[LEGAL/GOVERNANCE, capital-full-PGOUM]** `MADRID_ENVELOPE_VERIFIED` is unsigned. SIG-M1's three preconditions are two-thirds discharged (methodology review artefact exists but unread by a human; confidence-tier wiring is done); the third (a human reading the 121-record sample) has not happened.
3. **[ENGINEERING, capital]** Six of the 23 packed zones (4, 9.1, 9.2, 5.1, 5.2, 5.3) are flagged **not sign-off-ready even once signed** — height-proportional setbacks resolve to the ordinance floor rather than the true value because the governing height itself is unresolved (a street-width table), producing a structural over-statement above a named break-even height.
4. **[GIS-solvability, capital]** Zones 2/6/10/11 have ordinance chapters but no live GIS code — parcels there would fall through to a blanket refusal citing the wrong reason if they exist (unresolved cause, three candidates named, none confirmed).
5. **[ENGINEERING, capital]** The live NZ-1 footprint endpoint returned a service-unavailable error on today's re-probe — an operational fragility on the one path that is otherwise doctrine-cleared to render.
6. **[ENGINEERING, region]** `CM_SPACM_REGISTRATION_BLOCKED = true` — Madrid capital's and Boadilla del Monte's real municipal terms interleave by 4.35 km; no bounding box can route between 28079 and the other 178 municipalities. This is the single blocker upstream of everything else for the region.
7. **[GOVERNANCE, region]** `CM_SPACM_ENVELOPE_VERIFIED` is unsigned and **no signature has been requested** (unlike the capital, where SIG-M1 exists as a live, partially-cleared request).
8. **[ENGINEERING/OCR, region]** `VPLA_ORDENANZAS` schema (which column is numeric height vs. a coded band; parcel vs. municipality granularity; join key to `VPLA_CLASIFICACION`) has not been extracted — this environment lacked GIS tooling (`ogrinfo`/`sqlite3`) to do so; keyword counts are a proxy, not a parsed dataset.
9. **[LEGAL, both]** Barajas obstacle surfaces, heritage catalogues, and flood zones are known-and-named but unheld constraints on both halves — any envelope PRYZM eventually draws is an **open top** (per the repo's own ADR-0293 discipline) until closed.
10. **[GOVERNANCE, both]** Development-instrument delegation (Plan Especial/Parcial/Unidad de Ejecución) removes an unquantified share of land from any general-plan answer in both capital and region; the capital's ~35% derived-ámbito share is explicitly unsourced, and the region's 178-municipality share is unmeasured beyond one proving parcel.

## Estimated Unlock Effort

- **Capital-height:** Very Large, and possibly Impossible — contingent on an unrun 17/19-stage legal-research programme the founder itself specified; if that programme confirms genuine discretion, this is not an engineering task at all, it closes as a legal fact, not a feature.
- **Capital-full-PGOUM (23 zones minus the six flagged over-statement zones):** Large — one qualified human must read and sign 121 sampled records (SIG-M1 precondition 1), plus close the six structurally-unsound zones separately, plus resolve zones 2/6/10/11's routing gap.
- **Region:** Large — a real municipal-boundary `contains` predicate is a "bigger than a data addition" architecture change per the repo's own admission, layered on top of an unstarted signature request and an unfinished GeoPackage schema extraction.

## Recommendation

**Research first**, for both halves, before any further build. The capital's blocking questions are
now legal-research questions (has the CPPHAN-discretion finding been rigorously re-audited per the
founder's own standard? has SIG-M1's human review happened?) more than engineering ones — building
around them without answering them would replicate the exact `MADRID_NZ1_CERTIFIED` machine-signature
failure this repo has already lived through once. The region's blocking question is a genuine,
scoped engineering task (municipal-boundary routing) but should not be started until a signature is
even requested for `CM_SPACM_ENVELOPE_VERIFIED` — building the route with no destination to publish
to would be `authored-but-unwired` again.

## PRYZM Readiness Score

- **Capital (28079): 34/100.** Highest-fidelity data pipeline of any jurisdiction audited in this
  repo (live zoning router, live footprint layer, machine-extracted 282-record corpus, one signed
  doctrine), but zero numbers reach a user, one endpoint is currently down, and the height question
  may be permanently unautomatable.
- **Region (Comunidad de Madrid): 12/100.** Genuinely strong underlying regional dataset (304 MB,
  real ordinance table, all 179 boundary polygons available) but cannot be registered at all today —
  the routing blocker sits upstream of every other question, and no legal signature process has even
  begun.

## Compare against other jurisdictions in this repo

| City | Gate state | Rough shape |
|---|---|---|
| **Barcelona** | Signed (SIG-2/SIG-3), live rendering | Most mature — full signed pipeline |
| **Murcia** | Signed (SIG-MU1) | Live, ~67% delegated but signed |
| **Córdoba** | Signed (SIG-1) | Live, gated pack |
| **Madrid capital** | 1 of 2 gates signed (NZ-1 doctrine only); height CPPHAN-blocked | Richest unsigned data of the set |
| **Zaragoza** | Unsigned, genuinely signable | Live parcel-precise zoning, awaiting transcription of 4 articles |
| **Comunidad de Madrid (region)** | Unsigned, unrequested, unregistrable | Strong bulk data, zero routing |
| **Huesca** | Unsigned, blocked on georeferencing (not law) | Read and cited, coordinate problem |
| **Balears** | Unsigned by design (open-top only) | Live fitxa reads, six constraint families missing |
| **Canarias** | Unsigned, structured data, no OCR needed | Awaiting a signature only |
| **Valencia / Sevilla** | Unsigned, empty `zones` | No transcription exists yet |
| **Granada** | Unsigned | Zero research done |
| **Málaga** | Unsigned | Blocked by an authority-side Oracle error (`ORA-28000`) |

Madrid capital sits **above** Zaragoza/Huesca/Balears/Canarias/Valencia/Sevilla/Granada/Málaga in data
richness but **below** Barcelona/Murcia/Córdoba in legal readiness, because the richness has not yet
converted into a signature. The **region** is comparable in data richness to Zaragoza but is unique
in this set for being blocked by a *routing/registration* defect rather than a transcription or
signature gap — no other audited jurisdiction has this failure mode.

## Final Verdict

**Capital:** PRYZM holds the best-documented, most rigorously self-audited Madrid pipeline of any
Spanish city in this repo, and still cannot legally show a single Madrid resident a buildable
envelope today. **Single biggest blocker: the CPPHAN height-discretion finding is unaudited to the
standard the repo's own governance (ADR-0296) requires** — it may well be a genuine, permanent legal
wall, but that has not yet been proven with the rigor the founder specified on 2026-08-03, so it
cannot yet be reported as closed, only as the leading hypothesis.

**Region:** **Single biggest blocker: Madrid capital and its western neighbours' real municipal
boundaries geometrically interleave, and no rectangle can separate them** — a routing defect that
sits upstream of a legal signature that has not even been requested yet, on top of an ordinance
dataset that is real, large, and structurally promising but still unparsed at the column level.
