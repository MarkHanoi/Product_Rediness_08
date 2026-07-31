# GENOME TEST 01 — PRE-REGISTRATION (Madrid → València)

> **STATUS: FROZEN. Committed BEFORE any request was issued to a València endpoint.**
>
> This document exists so the blind run cannot be rationalised after the fact. Every prediction below
> was written with zero València GIS observations in hand. The scorer's source files are hashed so a
> later tune is detectable in `git log`.
>
> Companion documents (written after the run):
> [`GENOME-TEST-01-MADRID-TO-VALENCIA.md`](./GENOME-TEST-01-MADRID-TO-VALENCIA.md) ·
> [`../es-vc/46250-valencia/findings/VALENCIA-DATA-RECON.md`](../es-vc/46250-valencia/findings/VALENCIA-DATA-RECON.md)

---

## 0 — What is being tested

The founder's **Spanish Planning Genome** thesis
([`SOURCE-founder-spanish-planning-genome-2026-07-31.md`](./SOURCE-founder-spanish-planning-genome-2026-07-31.md)):
one discovery engine, calibrated on Madrid, locates another Spanish city's planning layers **without
bespoke research**, making city #2 ~70 % cheaper than city #1.

The concrete gate is València's **P4.5** in
[`../es-vc/46250-valencia/RATE-IMPLEMENTATION-PLAN.md`](../es-vc/46250-valencia/RATE-IMPLEMENTATION-PLAN.md),
and the metric is the one stated in advance in that capture's §G-2 / §V-3:

> *"if the Madrid-derived heuristics locate València's zoning layer **without bespoke research**, the
> Genome thesis holds and the 100→30 effort estimate is credible."*

Criteria are the **city-scope CH set** (`CH1`, `CH2`, `CH2b`, `CH5`) per the S-1 renaming
recommendation in the Sevilla capture. A one-city result is **never** evidence for the national
`NH1–NH4` set, which requires 20 municipalities.

---

## 1 — The frozen artefact

Tool: [`tools/spanish-genome-probe/`](../../../../../tools/spanish-genome-probe/).

| File | SHA-256 (frozen at pre-registration) |
| ---- | ------------------------------------ |
| `heuristics.ts` | `2f60aa73e99a9b7bf5edc26c241294bb15c3f701f3a5ddfa5287bd6594603e17` |
| `scoring.ts` | `a6abd6be04f211988517edb1f3c992e68291a400a1b2d7f89d482649096b0e6e` |
| `arcgisCrawler.ts` | `a975a643dbeb040f492784952816a973b22a36f86e62976fa3a583bb2a248db1` |

Every heuristic token carries a provenance tag — `MAD` (observed in Madrid's catalogue), `B11`
(founder batch 11 generic signals), `SEV` (Sevilla batch 18a +20 table), `P41` (phase 41 layer
features), `P42` (phase 42 field semantics). **Nothing in the file was derived from València.**

### 1.1 — Calibration record (Madrid only)

Live crawl of `https://sigma.madrid.es/hosted/rest/services`, 2026-07-31 — **10 folders, 116
services, 701 layers, 0 failures**. Two calibration changes were made, both *before* València:

| # | Change | Why (Madrid evidence) |
| - | ------ | --------------------- |
| **§ONTOLOGY-BONUS** | Feed the field→ontology classification into the layer score (`zoneCode` +25, `officialDesignation` +15, params +5 capped 15) | First run put the true zoning layer at **#6/701**. The scorer computed a field classification and discarded it; Madrid's zoning layer is *defined* by carrying `AMB_TX_ETIQ`+`AMB_TX_DENOM`, which the crude name tokens do not match. This is what founder module 3 / phase 42 actually specifies. |
| **§AMBITO-DEMOTION** | `ambito` demoted +20 → +8 as a layer-name token | B11 lists `AMBITO` as a zoning signal. Madrid shows that is wrong: `ámbito` names the **planning-area** instrument layer (APR/APE/API), a *different* ground truth. At +20 the ámbito layers outranked true zoning 3-to-1. |

**Post-calibration Madrid ranks (locked by `__tests__/scoring.test.ts`):**

| Madrid ground truth | Rank | Score |
| ------------------- | ---: | ----: |
| `DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0` — zoning | **#2 / 701** | 113 |
| `PGOUM97/PG_ORDENACION/MapServer/3` — derived plans APR/APE/API | **#1 / 701** | 117 |
| `PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6` — NZ1 envelope | **#24 / 701** | 69 |

**Declared limitation, stated in advance:** the scorer is a **zoning / planning-area** discoverer. It
does *not* find the building-conditions/envelope layer in the top 3 even on its own calibration city,
because that layer carries no zone code or designation (`CODMANZANA`, `NUMORD`, `COEF_Z`). A València
failure to surface an envelope layer therefore proves nothing — only a zoning miss counts against CH1.

---

## 2 — Root discovery: the pre-registered ladder

The scorer needs an ArcGIS REST root. Finding that root is **not** covered by the scorer, and the
honest accounting of "bespoke research" depends on which rung of this ladder succeeds. Declared in
advance, in order; **every rung attempted will be recorded with its exact URL and outcome**:

| Rung | Method | Counts as bespoke research? |
| ---- | ------ | --------------------------- |
| **R0** | Generic ArcGIS path patterns on generic municipal hosts: `https://{geoportal,sig,mapas,www,ide}.valencia.es/{arcgis,server,portal/…}/rest/services` (and `.es`/`.cat`/`valencia.es` variants) | **No** — pure pattern, zero city knowledge |
| **R1** | Same patterns against the autonomous-community provider (Generalitat Valenciana / ICV) | **No** — the ES national pattern is *municipality → CCAA fallback* |
| **R2** | Read the municipal open-data / geoportal HTML index and extract a REST root from it | **Partially** — one human-readable page, no domain expertise |
| **R3** | Targeted web search for "València PGOU ArcGIS/WFS" and reading a València-specific document | **YES — a CH1 qualifier.** If the root is only found at R3, CH1 is reported as *conditional*, not a clean pass. |

---

## 3 — THE PREDICTIONS

### P1 — CH2: does València expose ArcGIS REST / WFS / OGC at all?

**Predicted: YES, ArcGIS REST reachable, no auth.** Confidence **70 %**.
Fallbacks in order of expectation: WMS/WFS via GeoServer (20 %); INSPIRE-only OGC service (5 %);
nothing machine-readable, PDF/viewer only (5 %).

### P2 — the root host

**Predicted first hit:** an `arcgis/rest/services` path under a `valencia.es` sub-domain, most likely
`geoportal.valencia.es` or `www.valencia.es`. Predicted rung: **R0 or R2**.

### P3 — what València's zoning layer will be called

Ranked prediction of the *name* of the true zoning layer:

1. contains **`Calificación` / `Qualificació`** (most likely — this is the standard Spanish term for
   the parcel-level zoning attribute, and it is the first B11 signal)
2. contains **`Zonificación` / `Zonificació`** or `Zonas de ordenación`
3. contains **`Ordenación pormenorizada` / `Ordenació`**
4. contains **`Planeamiento vigente` / `Planejament`**

**P3b — the pre-registered language risk.** València is officially bilingual. If the layer names come
back in **Valencian/Catalan**, two Madrid-derived tokens will *fail by spelling*:

| Token | Castilian | Valencian | Will `fold()` match? |
| ----- | --------- | --------- | -------------------- |
| `calificacio` | Calificación | **Qualificació** | ❌ **MISS** (`c`→`qu`) |
| `planeamiento` | Planeamiento | **Planejament** | ❌ **MISS** (different stem) |
| `ordenacio` | Ordenación | Ordenació | ✅ hit |
| `zonificacio` | Zonificación | Zonificació | ✅ hit |
| `edificacio` | Edificación | Edificació | ✅ hit |
| `urbanistic` | Urbanístic**a** | Urbanístic | ✅ hit |
| `zona`, `norma`, `ambito`/`àmbit` | — | — | ✅ / `ambito` ❌ vs `àmbit` |

**This is the single most likely mechanism by which the Genome thesis fails on its first test**, and
it is registered here *before* looking. A monolingual-Castilian heuristic set is a Castile-specific
artefact masquerading as a Spanish one.

### P4 — which field will carry the zone code

Ranked: **`CODIGO`** > `COD_ZONA` / `CODZONA` > `CLAVE` / `CLAU` > `CALIFICACION` / `QUALIFICACIO` >
`ORDENANZA` > `ZONA` > `SIGLA`.

**Predicted: Madrid's exact `AMB_TX_ETIQ` will NOT appear in València.** Confidence **90 %**. The
Genome thesis does not require it to — it requires the *generic morphology* rules to fire instead.

**P4b — expected zone-code VALUES.** The corpus asserts (§27) València uses codes like `ENS-2`, and
batch 11 guesses `ENS`, `EDA`, `EIX`. Those are explicitly flagged in the source as illustrative
placeholders. **Predicted: short alphanumeric codes of 2–5 characters** — that shape is the claim;
the specific letters are not.

### P5 — CH1: rank the scorer will give the TRUE zoning layer

**Predicted: top 3 → CH1 PASSES.** Confidence **55 %** — deliberately not higher.

Reasoning stated in advance: it took two calibration fixes to reach #2 on Madrid, and Madrid is the
*easy* case (the heuristics were derived from it). València's catalogue is probably smaller, which
means fewer decoys and helps; the bilingual naming risk in P3b hurts. 55 % is close to a coin flip and
that is the honest number.

### P6 — CH2b: will the field heuristics find the zone-code field without hand-mapping?

**Predicted: YES.** Confidence **65 %**. Most likely failure: an opaque field name with the semantics
only in the Spanish/Valencian **alias** — the alias-fallback path exists but is untested outside Madrid.

### P7 — CH5: lines of València-specific config

**Predicted: < 30 lines, well under the 200 budget** — a root URL, an optional folder filter, a CRS
note. Confidence **85 %**.

**Counted against the budget:** anything that is not a root URL, folder filter, CRS, or document URL.
A new heuristic token, a new regex, a new algorithm, or a per-layer override each count as a **CH5
failure**, not as config, no matter how few lines they take.

---

## 4 — Decision rules (so the verdict cannot be argued afterwards)

1. **Ground truth is established independently of the scorer.** The "true zoning layer" is the layer a
   València planner would use to answer *"what zoning applies to this parcel"*. It is identified by
   **sampling actual feature attribute values** and checking them against València's PGOU zone
   vocabulary — never by "the one the scorer picked".
2. **One blind run.** The scorer runs once, unmodified, against whatever root the ladder finds. That
   output is the blind result and is recorded verbatim, including a failure.
3. **Any post-run change is post-hoc** and must be reported as a second, separately-labelled number
   alongside the blind one. It never replaces it.
4. **Failure ≠ absence.** HTTP error, timeout, ArcGIS error envelope, and a genuinely empty catalogue
   are four distinct outcomes and are reported as four distinct outcomes (L-422/457/467/469).
5. **CH1 is conditional, not passed, if the root was only findable at ladder rung R3** (bespoke
   research), even if the rank is #1.
6. **A negative result is a valid completion of this task.** "The heuristics did not transfer" is the
   finding, and it saves months.

---

*Pre-registered 2026-07-31, before any València endpoint was contacted.*
