# REFUSAL AUDIT — running log

**Run 2026-08-02.** Commissioned as part of the COLD START PROBE sprint, against the claim that
**refusal correctness has been asserted and never measured**, and that
`Determination Coverage = Envelope % + Refusal %` is gameable by refusing.

**Governing discipline:** `docs/04-reference/standards/PROBE-DISCIPLINE.md` (R1 call production ·
R2 independent oracle · R4 name individuals · R5 failures separate from outcomes · R7 say what the
check cannot see) and `docs/04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md`
(checked FIRST; no `Closed` row reopened — see §0).

---

## §0 — Register check performed before any probe was opened

| Register row consulted | Effect on this audit |
|---|---|
| Córdoba GMU 69 CUS sheets — **Closed** | Not re-probed. Córdoba sampled inside the 2-district COACo pilot only. |
| València `PGOU_AL.{dwg,gml,…}` — **Closed** | Not re-probed. |
| Barcelona ~2,600 derived partial plans — **Closed / signed out of scope** | Accepted; the audit tests whether the *citation* is right, not whether the plans can be obtained. |
| Madrid `PG_ANALISIS_EDIFICACION` — **Investigate, FROZEN pending Art. 8.3.1 vs 8.3.5** | ⭐ This is the row the audit was told to settle. Resolved below against the committed PDF — see §3. |
| Murcia PGOU vol. 11 — **Verified, byte-identical across consolidations** | Used as the article oracle. Not re-litigated. |
| València Layer 212 `altura` — **Investigate, interpretation-unbound** | Untouched. |

No `Closed` row was reopened. No `Use`/`Verified` row was re-derived.

---

## §1 — Method, so it can be disputed and re-run

**Tool:** `tools/cold-start-probe/refusalAudit.mjs`. **Seed base `20260802`**, per-city offsets
1–5 (barcelona 20260803 · madrid 20260804 · murcia 20260805 · valencia 20260806 · cordoba 20260807).
PRNG = `mulberry32` imported from `tools/city-completion/parcelSampleProbe.mjs`; transport =
that file's `politeGet` (single in-flight request, 320 ms global gap, never throws, every failure
mode a distinct value).

**Draw.** Seeded **uniform-over-area** points inside each city's canonical
`tools/context-bake/terrain.mjs` REGIONS bbox — never a hand-invented extent. Uniform over a
rectangle is area-weighted by construction, so no polygon-size bias. Each point is then resolved by
the **live municipal zoning service**, using the query shape the **production proxy** issues
(`server/bcnRefosOvProxy.js`, `server/madridNormasZonalesProxy.js`, `server/murciaPgouProxy.js`,
`server/cordobaZoningProxy.js`, and València's `MapServer/231` per `CLOSURE-REGISTER` E1–E7).
Points that land outside the municipality, off buildable land, or on a slice that is **not**
`not-determined` are recorded and discarded (rejection sampling). Rejections are counted, not hidden.

⚠ **Córdoba is sampled differently, and the reason is stated.** Its `not-determined` slices are
**2.962 pp of suelo urbano** and live entirely inside the 2-district COACo pilot; a uniform draw over
the municipal bbox returns roughly one cited refusal per 35 draws. So the draw is uniform over the two
published `coaco:distritos` rectangles, measured live this date
(Sur `[-4.7898,37.8557,-4.7684,37.8786]`, Noroeste `[-4.8091,37.8838,-4.7812,37.8983]`),
area-weighted between them. Still uniform-over-area, over a tighter frame. **Its result therefore
generalises to the pilot, not to Córdoba.**

**Grading, three outcomes kept strictly apart (R5):**
- **correct** — the cited article is read in the primary source, its stated scope reaches this
  parcel, and it does refuse.
- **incorrect** — the cited article does not govern this parcel, or does not refuse, or a different
  instrument governs. *Reported as a defect of the same class as an over-granted envelope.*
- **unverifiable** — text unobtainable, zone unresolvable, or the service failed.
  **⚠ 403 / 499 / timeout / network error is UNVERIFIABLE — never "incorrect", never "correct".**

**Article oracle (R2 — a source that cannot share the bug).** Article text was re-read from the
**committed corpus PDFs**, not from PRYZM's extracted JSON (the extraction is the thing under test):
- Madrid `corpus/pdf/COMPENDIO_MPG_NNUU_24-09-2025_PGOUM-97.pdf` (626 pp, sha256 `1A3AA172…`)
- Barcelona `PGM-NNUU-metropolitana.pdf` (in repo)
- Murcia `corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf` (205 pp, sha256 `ab71c651…`)
- ⚠ **Córdoba and València have no in-repo corpus.** Their article checks rest on the measurement
  records' own quotations plus the live service attributes, and are **weaker evidence**. Said, not buried.

**Second, independent check (R1).** Every slice was also read against what the **shipped code**
actually emits — `packages/site-parcel-data/src/rulepacks/es*ZoneClassification.ts`,
specifically each refusal's `code`, `ordinanceRef` and **`legallyGrounded`** flag. That flag is the
product's own answer to the question this audit asks, and on two Barcelona slices it **disagrees
with the measurement record** (§2).

**What this check cannot see (R7):**
1. It cannot detect an article correctly cited but mis-transcribed *upstream* of the pack.
2. It samples LAND, not user sessions. A slice measured `not-determined` that the shipped runtime
   never reaches is flagged separately, not folded into the rate.
3. It cannot size the sub-slices it identifies as wrongly refused, where the publisher exposes no
   attribute to size them by (Madrid's dotacional share; Barcelona's no-Pla-Parcial 22a share).
4. València/Córdoba article text is not corpus-local, so a transcription error there would survive.

---

## §2 — SMOKE TEST FIRST (a probe that returns 0 everywhere because of its own URL bug is the
`failure ≠ empty` trap in reverse)

All five live services answered **HTTP 200 with real features** at a known-good in-city point before
the audit ran (`tools/cold-start-probe/smoke.mjs`):

| service | point | result |
|---|---|---|
| AMB Refós `MapServer/16` (`QU_Trames`) | 2.163, 41.390 | 200, `CLAU_URB:"13a"`, `CODI_INE:"08019"` |
| AMB Refós `MapServer/17` (`OV_Trames`) | same | 200, `features: []` — a **measured empty**, not a failure |
| `sigma.madrid.es` `NORMAS_ZONALES/0` | −3.683, 40.428 | 200, `AMB_TX_ETIQ:"1.3"` |
| `geoserver.murcia.es` `Murcia:pgou_alineaciones` | −1.1300, 37.9860 | 200, MultiPolygon feature |
| `geoportal.valencia.es` `MapServer/231` | −0.3763, 39.4699 | 200, `califi:"PVP"` |
| COACo `coaco:ordenanzas` | −4.7794, 37.8882 | 200, `features: []` (Mezquita is outside the pilot) |

Madrid's `AMB_TX_ETIQ` domain was enumerated exhaustively before grading (`groupByFieldsForStatistics`):
**34 codes, each n=1** (one multipart feature per code). NZ 3 is `3.1`, `3.1.a`, `3.1.b`, `3.1.c`, `3.2`.
The `3.2` code is **Grado 2º** and is separately identifiable in the GIS — which matters, because
Grado 2º is governed by a different article from Grado 1º (§3).

**Total upstream failures across the whole audit: 0.** No sample was graded on a 403/499/timeout.

---

## §3 — RESULT

| city | n | correct | incorrect | unverifiable | draws | upstream failures |
|---|---|---|---|---|---|---|
| Barcelona | 30 | **3** | **26** | 1 | 313 | 0 |
| Madrid | 30 | 26 | **4** | 0 | 168 | 0 |
| Murcia | 30 | 25 | **5** | 0 | 177 | 0 |
| València | **23** *(cap hit)* | 19 | **4** | 0 | 700 | 0 |
| Córdoba *(pilot only)* | 30 | 27 | 0 | **3** *(this probe's own defect)* | 100 | 0 |

⚠ **The `incorrect` column is overwhelmingly WRONG-CITATION, not wrong-outcome.** On 33 of the 39
incorrect rows the land IS terminal — a different article terminates it. The exceptions are
Barcelona's 22a (14 rows) where the shipped code itself says `legallyGrounded: false`, and
València's `MP` rows (4) where the land is not delegated at all.

### Slice-share corroboration (a by-product of the rejection sampling, R2-flavoured)
- **Barcelona.** Of the 66 draws that landed on a *measured* slice, 30 were `not-determined` = 45.5 %
  against the record's 39.37 %. Same order, n small.
- **Madrid.** Of the 47 draws that hit a Norma Zonal at all, 30 were NZ 3 = 63.8 % against the
  record's 60.458 %. Corroborated.

### This probe's own defect, recorded (the probe is part of the system)
Three Córdoba draws were captured into the refusal population by a classifier that matched
`/CTP1/i` on the publisher's document **link**. COACo serves the **same** `O_CTP1.pdf` for
`ordenanza = "Colonia Tradicional Popular"` (17.201 %, PGOU-direct) **and** for
`"CTP1-Campo de la Verdad"` (1.307 %, a cited refusal). Those three are graded **unverifiable**,
never correct. ⭐ **The conflation is itself a finding**: the routing key the Campo-de-la-Verdad
refusal binds on does not distinguish the two families.

### What could not be measured, flagged explicitly
1. **How much NZ-3 land is dotacional** — Art. 8.3.5.3.b).ii).b) states a computable envelope
   (NZ 5 grado 3º, FAR **1,4 m²/m²**) for equipamiento/servicios-públicos parcels inside NZ 3.
   `PG_ORDENACION/4` is polyline-with-`OBJECTID`-only (V18), so the share is unobtainable.
2. **How much clau-22a land lacks a definitively approved Pla Parcial** — the AMB Refós publishes no
   Pla-Parcial-presence attribute. The record's "98.9 % is PD*" was not re-derivable here.
3. **Barcelona's `tail` slice** (4.83 pp) names no article at all, so there is nothing to grade.
4. **Córdoba and València article TEXT** — no in-repo corpus; every row from those two cities is
   marked `evidence: "weak"` in the result JSON.
5. **València's true refusal rate at n=30** — the draw hit the 700-draw cap at n=23 because the
   L-656 buildable denominator is only ~13 % of the canonical bbox. A smaller honest sample was
   preferred to widening the frame mid-run.

Per-sample verdicts with the verbatim reasoning: `refusal-audit.result.json`.
Every draw including all 1,315 rejections: `refusal-audit.raw.json`.
Re-run: `node tools/cold-start-probe/refusalAudit.mjs && node tools/cold-start-probe/grade.mjs`.
