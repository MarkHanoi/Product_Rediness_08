# València — CLOSURE REGISTER (the complete blocker list)

> **Stamp 2026-08-01.** The single place that answers *"what is left before València is CLOSED?"*
> Companion to [`RATE.md`](./RATE.md) (which scores axes) — **this file tracks BLOCKERS.**
> Shape follows [`../../es-ct/08019-barcelona/CLOSURE-REGISTER.md`](../../es-ct/08019-barcelona/CLOSURE-REGISTER.md).
> Every row ends in a **yes/no**, never an open question.

---

## The definition of CLOSED — ratified 2026-08-01 (founder)

> **A city is CLOSED when every parcel reaches a TERMINAL, EVIDENCE-BACKED state — either a
> constructed envelope, a cited delegation, or an explicit refusal with a documented reason.**

**It does NOT mean every parcel returns a numeric envelope.**

⚠ **València is the city where that distinction stops being a caveat and becomes the entire
result.** Barcelona and Murcia can each compute a number on part of their land and refuse, cited, on
the rest. València can compute a number on **none of it** — and can nevertheless be brought to
**100 % terminal**, because the reason it publishes nothing is *stated in the ordinance itself* and
is quotable per parcel. A city at 0 % computed and 100 % terminal is a **CLOSED** city. A city at
40 % computed and 60 % silent is not.

## The standard every blocker must meet before it closes

**Evidence → Findings → Decision → Alternatives rejected.**

⚠ **No blocker may rest at *"needs founder decision"* until it is PROVEN that no authoritative
evidence exists.** **Negative evidence closes a blocker** — *"no such dataset exists, here are the
endpoints probed with their HTTP status and response SHAPE"* is a valid, permanent closure, and for
València it is the most valuable artefact in this file.

⚠ **THE RECURRING TRAP, AND HOW EVERY MEASUREMENT BELOW GUARDS AGAINST IT.** A 301→HTML notice
returns HTTP 200 with a body, and a rejected `where` clause returns zero rows — both look exactly
like "no data". Every probe recorded here asserts on **response SHAPE**, and every filtered count is
preceded by an **UNFILTERED count**. Worked example, run 2026-08-01:

| probe | result |
|---|---|
| `MapServer/231/query?where=1=1&returnCountOnly=true` | `{"count":21210}` ← **asserted FIRST** |
| `MapServer/231/query?where=califi='ZZZNOPE'&returnCountOnly=true` | `{"count":0}` |

The two responses are **byte-identical in shape**. Without the first, the second is indistinguishable
from an outage.

## ⭐ BLOCKER CLASSIFICATION — the BINDING standard (founder, 2026-08-02)

⚠ **The local A/B/C/D taxonomy below is SUPERSEDED.** Every blocker is now classified under
[`docs/04-reference/standards/BLOCKER-CLASSIFICATION-STANDARD.md`](../../../../standards/BLOCKER-CLASSIFICATION-STANDARD.md)
as exactly one of **Legal · Engineering · Data acquisition · External authority**, with **one owner**,
**one exit criterion**, and a terminal state of **Authorised · Rejected · Unavailable · Superseded**.
No migration between categories without explicit, dated evidence.

### València's board, in full

| # | Blocker | Category | Owner | Exit criterion | Terminal state |
|---|---|---|---|---|---|
| **2** | layer 212 `altura` semantics | **External authority** | the founder (the R5 email) | a written municipal definition that **also reconciles the −2 gap** | ⏳ pending |
| **8** | heritage folders, error 499 | **External authority** | the founder | credentials obtained, **or** the refuse-where-heritage-may-apply path ships | ⏳ **path SHIPPED 2026-08-02** — see below |
| **1** | *profundidad edificable* / Plano C | ~~Data acquisition~~ | — | — | ✅ **SUPERSEDED** — the premise changed |
| **4** | live `origen` read at the parcel | **Engineering** | the València agent | `resolveValenciaZoning` ships; the delegated share upgrades to a cited `derived-plan` refusal | ⏳ open |
| **7** | CHP / TER / IND chapters unread | **Legal** | a planning-literate reader | the three chapters read and classified | ⏳ open, P3 |
| **5** | the text is a *(Transcripción)* | **Data acquisition** | the València agent | GVA deposit `46250-1001 1991-0010` OCR'd + a quote-by-quote concordance | ⏳ open |
| **6** | modification census | **Data acquisition** | the València agent | the **26** `MP` instruments carrying 80 % of MP buildable land checked against Título VI Caps. 3–5 | ⏳ open |
| **3 · 9 · 10** | — | — | — | — | ✅ closed |

⚠ **#1 terminates as SUPERSEDED, not merely closed, and the distinction is the standard's own worked
example.** It was recorded as **Data acquisition** — *"Plano C is unpublished; an institution, a fee,
an unknown timeline"*. Measurement showed the depth is **drawn in the published layer-212 movement
geometry**, so *the category was wrong, not just the estimate*. **It must not migrate back.**

⭐ **Only ONE category on this board can be accelerated by us at all.** Two blockers are **External
authority** — no amount of engineering moves them — and they are precisely the two the founder has
put on wait-only. Everything else is ours.

<details><summary>The superseded local taxonomy (kept for reading older rows)</summary>

| | Bucket | Unblocked by |
|---|---|---|
| **A** | **Evidence** | primary sources — the PGOU text, the GVA registry, the municipal GIS |
| **B** | **Engineering** | implementation |
| **C** | **Contract** | architecture change |
| **D** | **Product policy** | a founder decision, *after* A is exhausted |

</details>

---

## 1 — Does a València zoning service exist? **YES.** Endpoint + evidence

| # | Endpoint | Status | Response SHAPE |
|---|---|---|---|
| E1 | `https://geoportal.valencia.es/server/rest/services` | **200** | ArcGIS catalogue JSON, `currentVersion` 10.81, 33 folders |
| E2 | `…/OPENDATA/UrbanismoEInfraestructuras/MapServer?f=json` | **200** | service JSON, **70 layers**, `maxRecordCount` 2000, `supportsStatistics` true, `supportsPagination` true |
| E3 | `…/MapServer/231?f=json` | **200** | layer JSON, *"PGOU - Calificacions / Calificaciones"*, `esriGeometryPolygon`, EPSG:25830, **17 fields** |
| E4 | `…/MapServer/231/query?where=1=1&returnCountOnly=true` | **200** | `{"count":21210}` — **the unfiltered denominator** |
| E5 | `…/MapServer/231/query?groupByFieldsForStatistics=califi&outStatistics=[count]` | **200** | 116 grouped rows (**110 distinct after trimming whitespace variants**) |
| E6 | `…/MapServer/231/query?groupByFieldsForStatistics=origen&outStatistics=[count]` | **200** | 504 grouped rows (**496 distinct after trimming**) |
| E7 | `…/MapServer/231/query?…returnGeometry=true&outSR=25830` ×11 pages | **200** | 21 210 features with rings — the AREA measurement |
| E8 | `…/MapServer/212?f=json` + `/query?where=1=1&returnCountOnly=true` | **200** | *"PGOU - Alineaciones"*, `{"count":21975}`, field **`altura`** present |
| E9 | `…/MapServer/231/query?outStatistics=[sum on "Shape.STArea()"]` | **400** | `{"error":{"code":400,…}}` — ⚠ **server-side area is NOT available**; areas had to be computed client-side from downloaded geometry |
| E10 | `…/MapServer/231/query?where=califi='ZZZNOPE'&returnCountOnly=true` | **200** | `{"count":0}` — the **trap control** |
| E11 | 17 folders incl. `Patrimonio_Historico`, `Vivienda`, `GTECatastral` | **200** | `{"error":{"code":499,"message":"Token Required"}}` — ⚠ **auth-gated, UNKNOWN not absent** |

**No WFS/GeoServer endpoint exists** on the probed hosts (`www.valencia.es/{geoserver,ogc,wfs}/…` →
404; 130 further generated candidates → DNS failure). **WMS is available per-service.** Auth: none on
the planning folders above.

⇒ **Task 1 answer: València publishes calificación as a queryable ArcGIS REST service. It is NOT
blocked.** The Córdoba trick (mining a *visor* bundle for a hidden host) was not needed — the root
fell out of a generic sub-domain sweep of the bare domain.

## 2 — The LEGISLATION denominator: the zone inventory

**110 distinct `califi` base codes · 551 code+grade combinations · 496 distinct `origen`
instruments.** ⚠ **That is ~15× Madrid's ~7 zones, and it is the single biggest cost fact about this
city.** Extraction here cannot be "read eight chapters".

**But the vocabulary is long-tailed, and the tail is not where the land is.** Measured by AREA over
the L-656 denominator (§3), **six zone codes account for 100 %** of València's private buildable
land — the six the PGOU's own Art. 6.3.1 enumerates:

| zone (Art. 6.3.1) | share of private buildable land | of which PGOU-ordered |
|---|---:|---:|
| **ENS** Ensanche | **41,33 %** | 32,97 pp |
| **EDA** Edificación Abierta | **29,94 %** | 21,40 pp |
| **CHP** Conjunto Histórico Protegido | **10,06 %** | **0,81 pp** ⚠ |
| **UFA** Vivienda Unifamiliar | **8,15 %** | 5,87 pp |
| **IND** Industrias y Almacenes | **5,53 %** | 1,61 pp |
| **TER** Terciario | **4,99 %** | 0,93 pp |

⚠ **CHP is the trap in this table.** It is 10,06 % of the buildable city but only **0,81 %** of it is
ordered by the general plan — **92 % of València's protected historic fabric is governed by a derived
instrument**. An agent who "closed" València by reading Título VI Capítulo 2 would have covered
0,81 % of the city and believed it had covered 10 %.

⇒ **The 110-code vocabulary is a LEGISLATION denominator for routing, not for numbers.** The
numeric denominator is six.

## 3 — The delegation shape: **MEASURED, and the prior was WRONG**

The brief predicted *"expect the same shape in València"* as Murcia (67 % delegated) and Barcelona
(62,8 %). **Measured, València delegates 36,40 % — roughly half.**

**Method** (recorded so it can be re-run and disputed): all 21 210 polygons of `MapServer/231`
downloaded with geometry in the native **EPSG:25830** (metres), 2 000/page × 11 pages,
`geometryPrecision=2`; per-feature area by signed shoelace over the ArcGIS rings (holes counter-wound,
signs cancel). Server-side `Shape.STArea()` was **rejected 400** (E9), so client-side was the only
route. The unfiltered count was asserted first (E4).

**The denominator matters more than the number — L-656:**

| denominator | delegated share |
|---|---:|
| all 21 210 polygons (144,20 km²) | 20,58 % |
| `clase = SU` — suelo urbano (4 010,7 ha) | 40,20 % |
| **`clase = SU` ∧ Art. 6.3.1's six zones (1 874,9 ha)** ⟵ **the L-656 figure** | **36,40 %** |

Breakdown of the delegated 36,40 % by instrument family: `PE` Plan Especial 14,94 % · `RI` Reforma
Interior 7,10 % · `MP` Modificación Puntual 6,38 % · `ED` Estudio de Detalle 3,28 % · `PRI` 2,17 % ·
`PP` Plan Parcial 1,89 % · `CU` 0,29 % · `CRI` 0,16 % · `PEPRI` 0,11 % · `CE` 0,05 % · `UE` 0,01 %.

⚠ **`MP` is counted as delegated, which is the CONSERVATIVE reading, not the obvious one.** An `MP`
*amends* the PGOU rather than replacing it, so some `MP` land is arguably still PGOU-ordered — but
PRYZM does not hold the amending documents and cannot tell which. ⇒ **30,02 % is the floor of the
delegated range and 36,40 % the ceiling; the code uses the ceiling, i.e. it under-claims its own
reach.**

⚠⚠ **AN INSTRUMENT COUNT IS NOT A LAND SHARE, AND HERE THEY DISAGREE 5×.** "482 of 496 instruments
are not the PGOU" reads as *97 % delegated*. **Fourteen `PGOU*` rows cover more ground than 482
derived plans combined.** The earlier dossier stated the count and left the share `unmeasured`; that
was correct discipline, and this is the measurement that discharges it.

⚠ **Shares are LAYER-relative.** The 21 210 polygons sum to **144,20 km²** against an official
municipal term of ≈134,65 km² — ~7 % more — so some polygons overlap. **No claim is made about the
term's area.**

## 4 — València's ARITHMETIC MAXIMUM RATE

### ENVELOPE axis — **0 % today. Not `not-assessed`: MEASURED at zero, with the article that makes it zero.**

Every envelope-determining parameter in every residential zone reduces to a value **graphed on
Plano C**, a 1991 drawing set the city does not publish as data:

| zone | rule | article |
|---|---|---|
| ENS | `Hc = 4,80 + 2,90·Np`, Np from Plano C | 6.19.1 |
| ENS | *«La profundidad edificable será la señalada en el Plano C»* | 6.18.2 |
| EDA | `Hc = 5,30 + 2,90·Np` — ⚠ same shape, **different intercept** | 6.25.1 |
| UFA | closed table 2→7 m, 3→10 m, selected by Plano C | 6.30.1 |

⇒ **0 % of València's buildable land can carry a computed envelope from the ordinance text, and no
further reading changes that.** This is not a coverage gap that effort closes; it is a property of
the instrument.

### The conditional ceiling — what each unlock is arithmetically worth

| if PRYZM obtains… | ENVELOPE ceiling (share of private buildable land) |
|---|---:|
| nothing further | **0 %** |
| **Plano C as data** (#1) | **63,60 %** — the PGOU-ordered share; the delegated 36,40 % stays a cited delegation forever |
| a validated layer-212 `altura` parse only (#2) | ⭐ **≤ 52,6 %** of private buildable land [95 % CI 44,8–60,2] — ⚠ **MEASURED 2026-08-01; the join is now DONE** and the figure is ~2× the 27,13 % this row used to quote |

## ⭐ 2026-08-02, LATE — THE POSITION, IN FIVE LINES

1. **ENVELOPE is 0 % and no envelope ships.** That is the correct value, not a gap to be closed.
2. **Engineering is essentially COMPLETE.** Parser, refusal logic, geometry validation and the
   heritage seam all shipped this pass — built *ahead of* the missing authority, never *around* it.
3. **Exactly two things are waited on**, both **External authority**, owner the founder: the `altura`
   definition and heritage access.
4. **The doctrine is settled corpus-wide and is cited, not re-argued here:**
   [ADR-0283](../../../../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md)
   (UNKNOWN is a valid product state) and
   [ADR-0287](../../../../../02-decisions/adrs/ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md)
   (refuse when uncertainty changes the legal outcome — **València is its worked example**).
5. **Release order: Murcia → Madrid RC-1 → Córdoba → Madrid NZ3 → València.** Last, and that is
   scheduling, not a verdict on the work. *Definition of done: official `altura` interpretation ·
   heritage decision · release.*

⛔ **THE LINE.** No heuristic for `altura`. No inferred semantics. No calibration model. No
"conservative" branch — the error is **two-sided** and ADR-0287 removes that escape explicitly.
*"Do not substitute engineering for legal interpretation."*

⭐⭐ **2026-08-02 — THE ROUTE WAS ATTACKED PROPERLY, AND THE SHAPE OF VALÈNCIA'S PROBLEM CHANGED.**
Four independent blockers stood between `altura` and an envelope. **Three fell.** Full evidence:
[`sources/R5-ALTURA-SEMANTICS-ATTEMPT-2026-08-02.md`](./sources/R5-ALTURA-SEMANTICS-ATTEMPT-2026-08-02.md).

| # | blocker | status | what settled it |
|---|---|---|---|
| 1 | field might be **metres**, undocumented | ✅ **RETIRED** | `altura`/OSM `building:levels` median **0,78** (n=105, 0 failures). Metres predicts ≈3,0 — **refuted 4×**. Plus the publisher's own dictionary: *«Altura: Altura del PGOU»* |
| 3 | **`profundidad edificable` published nowhere** | ✅ **RETIRED** | It is **drawn, not tabulated.** Art. 6.18.1 sets the ocupación by the alineaciones; the polygon is a **15,6 m median band**, **never larger than its zone polygon (0/54)**, with patio holes |
| 4 | Art. 6.19.3 — Hc is not a ceiling | 🟢 **MITIGATED** | The exceptions push *upward*, so omitting them UNDER-states — safe under never-overstates (C58 §1.14.4) |
| **2** | **the offset: Np or the graphed count?** | ⛔ **BLOCKING** | ⚠ **The measurement made it WORSE.** `altura` is BELOW the built storey count on **81 %** of buildings, **modally by two**; only 33 % agree within ±1; spread −13…+7 |

⚠⚠ **AND NEVER-OVERSTATES CANNOT RESCUE #2.** On a typical Ensanche block (`altura` 5, built 7
storeys) the graphed-count reading yields `Hc = 4,80 + 2,90·4 = 16,4 m` for a building already
standing at ~21 m — **PRYZM would publish an envelope LOWER THAN THE BUILDING ON THE PLOT.** In the
10 of 105 where `altura` exceeds the built count the same parser **over-states**. **Wrong in both
directions ⇒ no safe branch**, and C58 §1.4 forbids shipping one reading as the fact.

⇒ ⛔ **VALÈNCIA STAYS AT 0 %, and `zones: []` stays.** Pinned in code as
`valenciaAlturaRouteIsPublishable() === false`, derived from `valenciaAlturaRouteBlockers()` so it can
never be hand-set. ⭐ **But the ASK is transformed: it is no longer "obtain Plano C" — a 1991 drawing
set, an institution, a fee, unknown timeline. It is ONE WRITTEN ANSWER about a field the city already
publishes** (`VALENCIA_R5_ASK`, contact `datosabiertos@valencia.es` — taken from layer 212's own ISO
metadata, HTTP 200). **València is one phone call away, not years away** — with the caveat that the
call must also explain the −2 gap, or it is not sufficient.

⚠ **THAT THIRD ROW WAS THE STALEST NUMBER IN THIS FILE AND IT UNDER-STATED THE CITY BY HALF.** It
quoted 27,13 % — a share of *layer 212's own area*, which includes streets, parks and huerta — while
saying, correctly, that the join to the buildable denominator was unmeasured. The join has now been
run (1 400 seeded random points, 156 on the denominator, 0 transport failures) and the answer on the
denominator that matters is **52,6 %**. See
[`findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md`](./findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md).
**It changes no published number — València is still 0 % — but it changes which blocker is worth
buying.**

### RATE — `not-assessed`, with a typed reason, and **that is the correct answer**

⚠ **Barcelona can state ≈77 % because its axes have been measured against a working envelope. València
cannot, and inventing a ceiling here would be the exact error this register exists to prevent.** The
~~typed reason is **`missing-framework`**~~ ⚠ **CORRECTED 2026-08-01 (orchestrator) — the typed reason
was WRONG, and so was the claim it rested on.** This paragraph asserted that the C63 tier vocabulary
*"still does not exist in code (Barcelona register #14)"* and therefore that **no city can prove an
ENVELOPE score**. Both are false: `packages/schemas/src/site/completion/EnvelopeAxisWeight.ts` exists
with the total tier→weight map (L-664 migrated C63's `certified`/`constructed-amber` prose names onto
the six schema tiers), `computeScorecard.mjs` mirrors it under test, and **Murcia's ENVELOPE axis has
already been computed at 9.4 % through it.** See row 9.

**The correct typed reason is `missing-measurement`, and it is a small, purely mechanical gap:** the
evidence half IS in hand (LEGISLATION and ENVELOPE denominators are both measured above), so what
remains is to write those figures into a
`tools/city-completion/measurements/valencia.measurements.json` record — the shape Murcia's now
demonstrates. **València's ENVELOPE is `0 %` MEASURED, with the article that makes it zero** — which
is a scoreable value, not an unscoreable one. ⚠ The lesson worth carrying: this register inherited a
P0 from another city's register and did not re-check it, and the stale claim then justified declining
to score a city that was in fact scoreable.

**⭐ CLOSED 2026-08-01 — the RATE is no longer `not-assessed`.**
`tools/city-completion/measurements/valencia.measurements.json` was written, and València became the
**first city in the repo with all SEVEN C63 axes assessed (100 % of the ratified weight)**:

| axis | before | after | why |
|---|---:|---:|---|
| PARCEL | — | **99 %** | live Catastro sample, N=120 on the buildable frame (119 high · 1 measured absence · 0 failures) |
| LEGISLATION | — | **50 %** | 3 of Art. 6.3.1's 6 zones read verbatim (ENS · EDA · UFA); CHP/TER/IND unread |
| ENVELOPE | — | **0 %** | ⭐ **MEASURED at zero over 100 % of the denominator**, with the article that makes it zero |
| HEIGHTS | — | **0,16 %** | 9 tagged of 5 466; **0 measured-lidar**; 63,2 % fabricated 9 m. Pre-bake baseline |
| DATA-SOURCES | 60 % | **90 %** | two measured-absence claims were FALSE — see the ⚠ below |
| TERRAIN | 50 % | 50 % | unchanged — baked, no round-trip verify probe |
| CONTEXT | 0 % | **89 %** | ⚠ the 0 % was a **parser miss** published as a fact, not a measurement |
| **overall** | 46,7 % (only **30 %** of the weight assessed) | **50,3 % (100 % assessed)** | |

⚠ **The ENVELOPE 0 % is the point, not the problem.** It enters the headline at weight 0,20 with score
0 instead of being renormalised away — so writing an honest record *lowered* what València would
otherwise have reported. C63 §1.5 / L-656: a cited refusal is a correct answer, and a correct answer
is not an envelope.

⚠ **Two of the old numbers were fabricated absences, and neither was València's fault.**
`computeScorecard.mjs` read `bake.mjs`'s region list by the marker `const REGIONS = [`; §BAKE-BY-REGION
renamed that array to `ALL_REGIONS`, so the reader returned an **empty set silently** and the tool
published *"not a baked context region → 0 layers present (measured)"* — for **every city on the
board**, while València's shipped R2 tiles served 5 466 building footprints to a height probe the same
day. And València was **absent from `ZONE_GIS_SOURCES`**, which scores the slot `none` ("no source
exists") for a city whose zoning service is live, keyless and fully characterised; the correct value
is `documented` ("source exists, no PRYZM proxy"). Both fixed, both now fail loud
(§EMPTY-PARSE-IS-NOT-AN-ABSENCE, L-676).

**And the sentence that still matters most:**

> **València is at 0 % computed and — once #4 lands — 100 % TERMINAL AND CITED.**
> Under the ratified definition, that is a city on the verge of CLOSED.

---

## The register

| # | Blocker | Bucket | Sev | Sign if omitted | Status | Closes when |
|---|---|:--:|:--:|:--:|---|---|
| **1** | ~~**Plano C is not published as data**~~ — the *profundidad edificable* half | ~~Data acquisition~~ | ~~P0~~ → — | — | ✅ **SUPERSEDED 2026-08-02 — FOUNDER DECISION R1. The premise was wrong, not merely the estimate.** ⭐ *"Layer 212 appears to publish the movement polygon itself. If the polygon already encodes the buildable movement area bounded by the exterior alignment and the buildable depth, then **the geometry is the legal datum**. There is no need to recover a separate depth attribute."* — the founder. **Evidence it rests on** (n=54, ENS/EDA suelo urbano, EPSG:25830): median mean-width **15,6 m**, **NEVER larger than its own calificación polygon (0 of 54)**, median area ratio 0,75, *patio de manzana* holes on 10. Legal link: Art. 6.18.1 «La ocupación de la parcela edificable se ajustará a las **alineaciones definidas en el Plano C**». **Doctrinal fit:** ADR-0283 / Doctrine B — layer 212 IS authoritative published geometry, so reading it is *implementation*, not inference (the founder's own SIG-MU2 reasoning for Murcia's street width). ⛔ **THE SEARCH FOR A PLANO C / *profundidad* DATASET IS CLOSED BY DECISION, NOT ABANDONED — do not spend another probe on it.** Pinned in code as `VALENCIA_MOVEMENT_GEOMETRY_DECISION` and enforced on every read by `validateValenciaMovementPolygon()`. ⚠ **Re-opens ONLY on contrary evidence** (the municipality stating the polygon is a block outline, or a measurement showing it exceeding its calificación at scale) — not on argument. ⚠ **It raised the ENVELOPE axis by ZERO**: it shortened the PATH, it did not add coverage. **Superseded row, retained below for the audit trail:** 🔴 ~~OPEN — the only blocker that can move the ENVELOPE ceiling off 0 %~~ | A human obtains the Plano C sheets as data (vector or georeferenced raster) from `geoportal.valencia.es` / Servicio de Planeamiento. ⚠ **Measured negative on the automated route, and 2026-08-01 it got MUCH stronger.** The previous sweep read the field schema of **70 layers in ONE service**. It has been widened to **the WHOLE public catalogue: 33 folders → 16 public → 72 services → 67 MapServer/FeatureServer → 696 layers, 0 layer-level errors.** Still only **three** layers carry any envelope-parameter-shaped field: `212.altura`, `321.nivel_prot` (heritage protection level, not an envelope) and `223.nivelaltura` (a street-axis **polyline**, `null` on every sampled row). **No layer publishes `profundidad`, `edificabilidad`, `ocupación`, `retranqueo` or a *número de plantas* under any name.** ⭐ **One new service was found and it is a DEAD END worth recording so nobody re-finds it hopefully:** `Tools/FichaUrbanismo/MapServer` — which backs the municipality's own *ficha urbanística* — carries layers **2 «PGOU Alineaciones (TEXTOS)»** and **7 «PGOU Alineaciones»**. *(TEXTOS)* is exactly what a digitised drawing's annotation layer is called, and on a 1991 CAD plan the storey count IS drawn as text — but **measured, both return `{"count":21975}` with the identical field list including `gis.gis.PGOU_AL.area`: they are the SAME source table `PGOU_AL` as layer 212, republished for a different app.** No independent annotation exists. ⇒ **Plano C is absent from the whole public catalogue, not merely from one service.** Needs a human; see R1. |
| **2** | **Layer 212 `altura` — is it Plano C's Np?** | **A** ⟵ no longer A→B | P1 | ⚠ **BOTH DIRECTIONS, measured** — it under-states on 81 % of buildings and over-states on ~10 %; that is *why* it cannot ship | ⛔ **NARROWED TO ONE QUESTION 2026-08-02 — 3 of 4 blockers RETIRED, the 4th (the offset) HOLDS and is now the ONLY thing between València and ~52,6 % of its buildable land.** See [`sources/R5-ALTURA-SEMANTICS-ATTEMPT-2026-08-02.md`](./sources/R5-ALTURA-SEMANTICS-ATTEMPT-2026-08-02.md) and the §4 table. ⭐ **RETIRED: "might be metres"** (`altura`/OSM levels median **0,78** over n=105 vs ≈3,0 predicted — refuted 4×; plus the publisher's own dictionary *«Altura: Altura del PGOU»*, contrasted against a sibling dataset that documents ITS `altura` as *«Altura de representació en plans»*, a cartographic height). ⭐ **RETIRED: "profundidad is published nowhere"** — it is **DRAWN, not tabulated**: Art. 6.18.1 sets the ocupación by the alineaciones, and on ENS/EDA (n=54, EPSG:25830) the alineación polygon is a **15,6 m median band**, **NEVER larger than its calificación polygon (0/54)**, median area ratio 0,75, patio-de-manzana holes on 10. 🟢 **MITIGATED: Art. 6.19.3** — its exceptions push upward, so omitting them UNDER-states (safe under C58 §1.14.4). ⛔ **HOLDS: the offset.** `altura` sits BELOW the built storey count on **85 of 105 buildings (81 %), modally by TWO**; only 33 % within ±1; spread −13…+7. The graphed-count reading would publish `Hc = 16,4 m` where a 21 m building already stands, and the ~10 % where `altura` exceeds the built count would OVER-state — **wrong in both directions, so no safe branch and no never-overstates shelter** (C58 §1.4). ⇒ **Closes on ONE municipal answer, `VALENCIA_R5_ASK`** — which must also reconcile the −2 gap, or it is necessary but not sufficient. Pinned as `valenciaAlturaRouteIsPublishable() === false`. **Prior 2026-08-01 join, retained:** 🟡 **the half that closed is (b), the JOIN — the lead is ~2× BIGGER than this row said, not smaller** | ⭐ **THE SPATIAL JOIN THIS ROW NAMED AS ITS UNMET CONDITION (b) HAS BEEN RUN.** 1 400 seeded random points over the canonical bbox; each resolved by ONE ArcGIS `identify` against layers 7 + 14 of `Tools/FichaUrbanismo` **at the same coordinate** (so the zone and the `altura` cannot drift apart); **156 landed on the L-656 denominator, 1 244 outside it, 0 transport failures.** Uniform-over-area ⇒ area-weighted by construction. **Result: bare storey 1…30 = 52,6 % of PRIVATE BUILDABLE LAND [95 % CI 44,8–60,2]** — versus the 27,13 % of *layer area* this row used to call *"the honest size of the lead"*. ⚠⚠ **THE DENOMINATOR WAS THE WHOLE STORY, TWICE: 65,5 % (row count) over-stated it and 27,13 % (layer area) under-stated it by almost exactly as much. Both errors had ONE cause — a ratio quoted without its denominator.** ⚠ **The `0` bucket COLLAPSES from 34,13 % of layer area to 10,3 % of buildable land [CI 6,4–16,0], and sampled geometry says why:** one probed `altura='0'` feature is a single **29,4 ha polygon with 98 INTERIOR HOLES** — the street space with the manzanas punched out — and another coincides **to the square metre** with a `GEL Espacios Libres` polygon. ⇒ **On the land that matters `0` is largely a TRUE ZERO on unbuildable ground, not the unknown-sentinel this row called it.** A reframing, not an all-clear (10,3 % remains, and L-616 still forbids reading any `0` as a determination). ⚠ Per zone: **ENS 77,0 % bare storey (n=61)**, but **EDA's LARGEST bucket is the `<=n`/`Max n` BOUND (20 of 55) — a storey statement that is not a determination**, so EDA is materially weaker than the headline. The bare integers observed are **1…9 plus one 15 — exactly Art. 6.19.1's own table domain**, a strong signal and **not proof**. ⛔ **CONDITION (a) IS UNTOUCHED AND STILL BLOCKS, on four independent grounds each sufficient alone:** nothing in 696 swept layers documents the field (it is named *altura*, a HEIGHT; the article graphs a *número de plantas*, a COUNT); the **−1 convention is established for the ARTICLE, not the FIELD** (±2,90 m per building); **`profundidad edificable` is published NOWHERE**, and ENS needs it as well as the height; and Art. 6.19.3 means a computed Hc **is not even a ceiling**. ⇒ **The row is now pure (A): one municipal confirmation (R5), not engineering.** Full evidence: [`findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md`](./findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md); pinned in code as `VALENCIA_ALTURA_ON_BUILDABLE_LAND`. **Prior layer-relative measurement, retained for the audit trail:** ✔ **Measured 2026-08-01 by AREA** (all 21 975 polygons, shoelace, EPSG:25830), correcting a polygon-count figure: **bare integer 1…30 = 27,13 %** of layer area, **not 65,5 %**. ⚠⚠ **The largest single bucket is the literal value `0` at 34,13 % of area (4 195 polygons)** — a parcel cannot be lawfully built to zero storeys, so `0` is a SENTINEL for unknown, and C58 §1.7a / L-616 are explicit that **`0` never means unknown**. Remaining: junk `-+-`/`_`/`+-` **18,38 %** · protection-derived 6,07 % · `<=n`/`Max n` bounds 6,63 % · floorspace/FAR/metres 2,40 % · delegated-or-deferred 1,49 % · unrecognised 2,14 %. ⚠ **The field carries at least four units in one `esriFieldTypeString`** — reading `13m` as 13 storeys yields `4,80+2,90·12 = 39,6 m` for a **13 m** building, a **3× overstatement**; and bare `65936.20`, `49846.90` sit alongside `S=39600.65m2s`, i.e. **site areas wearing the same clothes as storey counts.** **What is still open, and it is A not B:** nothing in the service documents the field, so *"`altura` = Art. 6.19.1's número de plantas"* remains an **INFERENCE**; and the layer has **not been spatially joined** to the buildable denominator, so even 27,13 % is a share of the wrong denominator. ⇒ Closes on (a) municipal confirmation of the field's semantics **and** (b) a spatial join. Pinned as `VALENCIA_ALTURA_FIELD_MEASURE`. |
| **3** | **Every parcel reaches a TERMINAL state** | **B** | **P0** | — | 🟢 **CLOSED for the coverage claim, OPEN for the legal claim** | ✔ **Shipped this pass.** `valenciaNoRulePackRefusal` is wired end to end — S2 `isInValencia` → S4 `ES_VALENCIA_PGOU_PACK` → S5 `registry.ts` — so **100 % of València parcels now receive an explicit, documented, land-identifying refusal** naming Plano C and the articles, instead of silence. 51 tests, including a §DEC-1 **prose-leak test** (no figure may appear in the refusal copy) and an L-616 null-fields test. ⛔ **What remains is a STRONGER answer, not a missing one:** 36,40 % of buildable land is entitled to the legally-grounded `derived-plan` refusal citing its own `origen` instrument, and today gets the weaker `no-rule-pack` coverage refusal. **Closes when the live `origen` value is read per parcel** — see #4. |
| **4** | **Live `origen` read at the parcel (S3 zoning resolver)** | **B** | **P1** | **UNDER-states** — the current refusal is weaker than the truth, never stronger | 🔴 **OPEN — the largest closure step available, and it needs no new evidence** | Build `resolveValenciaZoning` + a same-origin proxy against `MapServer/231` (point-intersect, `outSR=4326`), mirroring `resolveMurciaZoning`. ⚠ **Every input is already proven live and keyless**: the service answers unauthenticated (E1–E7), `califi`/`tipoca`/`origen` are on one row so **no second spatial join is needed** — architecturally better than Madrid — and the parcel arrives from the national Catastro path with no licence. ⇒ **~36 % of buildable land upgrades from a coverage refusal to a cited legal delegation**, and the other ~64 % gains its zone name. **Pure engineering, ~1 day.** |
| **5** | **The municipal text is a *(Transcripción)*, not the registered instrument** | **A** | P2 | **UNKNOWN sign** — a re-keying error could go either way | 🟡 **OPEN, and correctly fenced** | The quotes come from `valencia.es`'s own **`10. Normas Urbanísticas. (Transcripción).pdf`** (HTTP 200, 435 440 B, born-digital, 157 pp) — published by the competent authority, carrying **no** *«sin valor normativo»* disclaimer (checked: the string appears **zero** times). The stronger artefact — the **Generalitat's Registro Autonómico** deposit **`46250-1001 1991-0010`**, whose *filing path contains `46250 VALENCIA`* — was also retrieved (HTTP 200, 11,8 MB) but is an **IMAGE-ONLY SCAN**: `pdftotext` yields **0 characters**. ⇒ **Closes on OCR of the registry deposit and a quote-by-quote concordance.** ⚠ Until then no signature may claim the quotes are the registered text. Named as R2. |
| **6** | **Modification census since 1994** | **A** | P2 | **UNKNOWN sign** | 🟡 **OPEN — but bounded, and one modification is already closed** | `VALENCIA_PGOU_LATER_MODIFICATIONS` is **`unverified`, never `none`** — and there is positive evidence against `none`: a *modificación-adaptación* approved 14-XII-1993 (**DOGV 07-II-1994**) is bound into the same PDF. ✔ **Checked, not assumed:** it touches Art. 6.18 only as a *parcelación-licence clarification* about segregation tolerance, and **does not alter the profundidad edificable or the alignment rule.** ⛔ That closes ONE. ⭐ **THE CENSUS IS NOW SCOPED — measured server-side 2026-08-01, and the inherited instrument count was WRONG.** `origen LIKE 'MP%'` returns **1 508 polygons** (the register's ~1 509 was right) across **169 distinct instruments — NOT ~140; the register under-counted by 21 %, and repeating it would have under-scoped the research.** ⭐ **But the task is far smaller than either number suggests, because most `MP` land is not buildable land.** On the L-656 denominator only **106 instruments / 642 polygons / 115,7 ha = 6,19 % of private buildable land** survive — and that land is extraordinarily concentrated: **5 instruments carry 50 % of it, 26 carry 80 %, 44 carry 90 %, while 82 of the 106 cover under 0,05 % of the city each.** The five that matter most are `MP1775` (1,41 % of buildable land), `MP2098A` (0,91 %), `MP1711` (0,40 %), `MP2109` (0,24 %), `MP1984` (0,21 %). ⇒ **R3 collapses from "~140 documents, 3–5 days" to "26 documents for 80 % of the affected land", and the whole class caps at 6,19 % of the city.** ⚠ Which of them touch Título VI Caps. 3–5 still needs the DOCUMENTS, which PRYZM does not hold — the census scopes the ask, it does not discharge it. Named as R3. |
| **7** | **CHP / TER / IND chapters unread** | **A** | **P3** ⟵ demoted | **UNDER-states** (they are labelled `unknown`, the weakest claim) | 🟡 **OPEN, and MUCH cheaper than it looked** | ⚠ **This row was going to be P1 on the "three of six zones unread" framing. Measuring the land inverted it.** CHP+TER+IND are 20,58 % of buildable land but only **3,35 pp of it is PGOU-ordered** — the rest is delegated and closes via #4 regardless of what the chapters say. **And even reading them yields nothing computable**, because Art. 6.3.1's zones all route to Plano C. ⇒ Reading them buys *classification completeness*, not coverage. ~1 day, do it after #4. |
| **8** | **`Patrimonio_Historico` / `Vivienda` folders are token-gated** | **External authority** · owner: the founder | P2 | **OVER-states if ignored** — heritage constrains envelopes downward | ⭐ **RE-CLASSIFIED 2026-08-02 (founder R3): a DEPLOYMENT blocker, NOT an envelope-model blocker — and its engineering half is now SHIPPED.** *"Heritage is a legal overlay… heritage available → constrain; heritage unavailable → refuse where heritage may apply. **Never ignore heritage.**"* ⇒ It no longer blocks resolving `altura` or building/validating the envelope engine. ✔ **The refuse-where-heritage-may-apply path EXISTS IN CODE** — `valenciaHeritageDisposition()` (⚠ **two members, no `absent`**: an access-gated source is UNKNOWN, never a clearance — L-422/457/467/469), `valenciaHeritageRefusal()` (code `overlay-uncertain`, the contract's OWN vocabulary for *"a heritage catalogue MAY bind and our data path cannot see it"* — deliberately **not** the transient `source-data-unavailable`, which would offer a retry that can never succeed), and `applyValenciaHeritageConstraint()`, the seam where an overlay reduces an envelope — **`min(base, heritage)`, with no branch that can raise a height** (L-616). ⇒ **"Heritage access obtained" is now a DATA change, not an engineering project.** ⚠ Public partial mitigation can prove heritage APPLIES (BIC/BRL, *Catálogo*, `protec`, protection-derived `altura` = 5,8 % of buildable land); **nothing public can prove it does not.** ⇒ Exit: credentials obtained, **or** — already met — the refusal path ships. **Prior status:** 🟡 ~~OPEN — UNKNOWN, not absent~~ | ✔ **RE-PROBED 2026-08-01 — all 17 still answer `{"error":{"code":499,"message":"Token Required"}}` at the FOLDER level**, enumerated so the claim is checkable rather than a round number: `Bomberos · CIA · ConsellAgrari · FDM · Geoprocesos · GobiernoAbierto · GTECatastral · InspeccionTributos · Jardineria · MantInfraestructura · Mapa_Base · Patrimonio_Historico · PoliciaLocal · ResiduosSolidos · Sanidad · Turismo · Vivienda`. (16 of the 33 folders ARE public and were fully swept — 696 layers, 0 errors.) Recording the 17 as "no data" would be the failure-vs-empty conflation this repo has been bitten by four times (L-422/457/467/469). ⚠ Partial mitigation exists: BIC/BRL and *Catálogo* layers ARE public inside `UrbanismoEInfraestructuras`. ⚠ **Being UNKNOWN cannot inflate a 0 %**, so this row does not block today — but it bounds what row #1's negative proves, and it blocks the instant any envelope ships. ⇒ Closes on a re-probe **with credentials**, which PRYZM does not have; needs R4. |
| **9** | ~~**C63 tier vocabulary does not exist in code**~~ | **C** | ~~P0~~ → — | EXACT | ✅ **CLOSED — the ruler EXISTS; this row and its Barcelona parent were both STALE (orchestrator, 2026-08-01)** | ✔ **Verified in code, not inferred.** `packages/schemas/src/site/completion/EnvelopeAxisWeight.ts` exists and carries the TOTAL tier→weight map, including the explicit L-664 migration from C63's prose names: *«`authoritative` 1.0; `constructed-amber` 0.7 → `block-constructed` 0.7; `cited-refusal`/`no-pack` 0.0 → `not-determined`/`no-pack` 0.0»*. `tools/city-completion/computeScorecard.mjs` mirrors it as `ENVELOPE_AXIS_TIER_WEIGHT` + `ENVELOPE_AXIS_TIER_WEIGHT_VERSION`, and a unit test asserts the two are byte-identical (drift = test failure). ⭐ **Proven EMPIRICALLY, which settles it beyond a file read:** Murcia's ENVELOPE axis was computed at **9.4 %** through this exact ladder (`tools/city-completion/measurements/murcia.measurements.json`). **So "no city can prove an ENVELOPE score" is false — one already has.** ⚠ **The claim was inherited from Barcelona register #14 and never re-checked**, which is precisely how a stale P0 propagates across cities and freezes work that is not actually blocked. **València's RATE being `not-assessed` is therefore NOT a framework problem** — see the corrected §RATE note. |
| **10** | **A previous agent stopped mid-tests** | **B** | P2 | — | ✅ **CLOSED 2026-08-01** | ✔ Found: three uncommitted files in a sibling worktree (`esValenciaPgou.ts`, `esValenciaEnvelope.ts`, `valenciaBbox.ts`) and **zero tests** — a half-wired path with no registry entry and no exports. **Adopted rather than rewritten** (the transcription is good and article-cited), then finished: 51 tests, registry registration, index exports, and registration in `ENVELOPE_PUBLICATION_GATES` (which was **failing open** for València — an unregistered gate makes the classifier promise a full envelope for a city that refuses every parcel). Two repo-wide totality guards caught the omission, as designed. **Nothing left behind.** |

---

## ⚠ Establish the SIGN before ranking severity — Barcelona's lesson, applied

Barcelona's register records this three times, and it re-fired here:

- **#7 (CHP/TER/IND unread)** *sounds* like the biggest hole in the city — half the zone vocabulary
  is unclassified. Measured, it is **P3**: 20,58 % of buildable land, of which only 3,35 pp is
  PGOU-ordered, and reading it yields **nothing computable** anyway. Filed as a coverage blocker; it
  is a classification-completeness item.
- **#2 (`altura`)** *sounds* like the unlock. Its sign is **OVER-statement**, and it is the only row
  here that can make a *published* number wrong: four units in one string field, plus a `0` sentinel
  on a third of the layer's area. It is the most dangerous row, not the most promising one.
  ⚠ **AMENDED 2026-08-01, AND THE AMENDMENT IS ITSELF THE LESSON.** The `0`-sentinel scare was
  measured on **layer 212's own area**. On the L-656 buildable denominator `0` is **10,3 %, not
  34,13 %** — because most `altura='0'` features are the *street complement and designated open
  space*, land outside the denominator entirely. Meanwhile the lead is **52,6 %, not 27,13 %**.
  ⇒ **The row is less dangerous AND twice as promising than this file said, and BOTH mis-statements
  came from the same act: quoting a ratio without its denominator.** That is L-656's whole point,
  applied to a row that already knew it — this file's own #2 flagged that 27,13 % was *"a share of the
  WRONG denominator"* and then went on ranking the row by it. **Writing the caveat is not the same as
  acting on it.**
- **#4 (live `origen`)** *sounds* like plumbing. Its sign is **UNDER-statement** — today's refusal is
  weaker than the truth — so it is pure upside with no correctness risk, needs **no new evidence**,
  and moves 36 % of the city from a coverage excuse to a cited legal answer. **It is the right
  second.**

**Ranking by how alarming a gap sounds inverts the queue. It inverted this one.**

## Effort, honestly

| Category | Remaining | Difficulty |
|---|---|---|
| **Engineering — #4 live `origen` resolver + proxy** (all inputs proven live and keyless) | **~1 day** | Low |
| Legal research — #7 read CHP/TER/IND chapters | ~1 day | Low |
| Legal research — #6 `MP` census ⭐ **RE-SCOPED: 26 documents cover 80 % of the affected land, and the whole class is 6,19 % of the city** (was "~140 instruments") | **~1 day** | Low |
| Evidence — #5 OCR the GVA registry deposit + concordance | ~2–3 days | Medium |
| ⭐⭐ **Evidence — #2 (a): ONE municipal answer, `VALENCIA_R5_ASK`. THIS IS THE WHOLE OF VALÈNCIA'S REMAINING ENVELOPE COST** | **one email + a reply** | Low, but not ours to schedule |
| Engineering — #2 (b) the spatial join | ✅ **DONE 2026-08-01** | — |
| Evidence — #2 units (metres vs storeys) | ✅ **DONE 2026-08-02 — refuted 4×** | — |
| Evidence — #2 depth (is it drawn in the geometry?) | ✅ **DONE 2026-08-02 — yes, 15,6 m median band** | — |
| Engineering — #2 (c) `altura` parser + ENS/EDA envelope from the polygon ⚠ **worthless until (a) lands** | ~2–3 days | Medium |
| **Data acquisition — #1 Plano C** ⚠ **the whole city; not automatable** | **unknown; a human, an institution and possibly a fee** | **High** |
| Platform — #9 C63 tier vocabulary (not a València cost) | — | — |

**The only structurally impossible category** is the 36,40 % the plan itself delegates. There the
correct output is a machine-readable reference to the governing instrument — **a complete and legally
correct result**, not a gap.

## Recommended order

**4 → 7 → 5 → 6 → 2 → 1**

*(⚠ **3** and **10** are dropped: CLOSED. **9** is platform-wide and does not queue behind València.)*

**4 first**, and it is not close. It is the only item that is pure upside — it needs **no new
evidence**, it cannot make a published number wrong (its sign is under-statement), every input is
already proven live and keyless, and it converts **36,40 % of the buildable city** from *"PRYZM does
not cover this"* to *"the law delegates this to instrument `PE2020`"*. **That single day is what takes
València from 100 % terminal-but-weak to 100 % terminal-and-cited, which is the definition of CLOSED.**

**7, 5 and 6 next** because they are cheap evidence work that retires asterisks on citations already
shipped.

**2 late, and only after its (A) half.** Building the parser before the municipality confirms what
`altura` means is building a 3×-overstatement engine with a test suite.

⚠ **AMENDED 2026-08-01 — R5 SHOULD BE ASKED NOW, EVEN THOUGH #2 STAYS LATE IN THE BUILD QUEUE.** The
join measured the prize at **52,6 % of buildable land**, twice what this file assumed, and #2's
engineering half is now DONE — so what remains of the row is one question to the Servicio de
Planeamiento (R5), whose latency is weeks and whose cost is an email. **Asking costs nothing and
gates the largest remaining number in the city; building still waits for the answer.** ⚠ And even a
*yes* is not sufficient on its own: `profundidad edificable` is published nowhere, so R5 unlocks at
most half of what ENS needs.

**1 last in this list because it is not ours to schedule.** It is the only item that moves the
ENVELOPE ceiling off 0 %, and it is a human, institutional task — see R1.

## What a human is wanted for

| # | Ask | Why it matters | Where |
|---|---|---|---|
| **R1** | **Plano C as data** — *número de plantas* + *profundidad edificable* + alignments | ⚠ **The whole city.** The only route from 0 % to 63,60 %. Proven absent from the **whole public REST catalogue** by a field-level sweep of **696 layers across 67 services** (#1) — not merely from one service | `geoportal.valencia.es` viewer / Servicio de Planeamiento |
| **R2** | OCR or a text-layer copy of GVA deposit `46250-1001 1991-0010` | Retires the *(Transcripción)* caveat on every quote (#5) | `mediambient.gva.es/auto/urbanismo/reg-planeamiento/…` — 11,8 MB image-only |
| **R3** | ⭐ **RE-SCOPED: the 26 `MP` instruments carrying 80 % of `MP` buildable land** (start `MP1775`, `MP2098A`, `MP1711`, `MP2109`, `MP1984` — 50 % between them) — do they touch Título VI Caps. 3–5? | Retires `laterModifications: unverified` (#6). Was framed as ~140 documents; measured, it is 26 for 80 % coverage and the whole class caps at **6,19 %** of buildable land | Servicio de Planeamiento / the `origen` taxonomy |
| **R4** | Credentials for the **17** token-gated folders (`Patrimonio_Historico`, `Vivienda`, …) — re-probed 2026-08-01, all still 499 | Heritage constrains envelopes downward; ignoring it OVER-states (#8) | `geoportal.valencia.es` — ArcGIS 499 |
| **R5** | ⭐⭐ **THE ONE ASK — now the ONLY thing between València and ~52,6 % of its buildable land.** Full text pinned in code as `VALENCIA_R5_ASK`: (1) does `PGOU_AL.altura` record Art. 6.19.1's *número de plantas grafiado en el Plano C*, and does it store the graphed count or **Np** (= count − 1)? (2) units of `13m` / `0.8m2t/m2s` / `10235m2t` / `<=5`? (3) does the polygon delimit the *área de movimiento*? (4) ⚠ **reconcile: `altura` is below the built storey count on 81 % of sampled Ensanche buildings, modally by two** | ⚠ **THE ASK IS NO LONGER A DATASET.** R1 framed València as needing Plano C — an institution, a fee, unknown timeline. Measured 2026-08-02: the alignments are published, **the depth is drawn in their geometry**, and the field is **storey-scale, not metres**. Only the offset is unknown. ⛔ **Q4 is not a formality** — an answer leaving the −2 gap unexplained does NOT unblock publication | `datosabiertos@valencia.es` (the contact in layer 212's OWN ISO metadata, HTTP 200) · Servicio de Planeamiento |

⚠ **None of R1–R5 is a signature.** València has **nothing to sign**: `VALENCIA_ENVELOPE_VERIFIED`
is `false` and flipping it would authorise nothing, because `ES_VALENCIA_PGOU_PACK.zones` is empty by
construction. **This is the first city in the register whose gate a signature cannot lift** (L-449).

---
*Authority: C58 §1.2/§1.4/§1.5/§1.7a/§1.9/§1.10 · C60 · C63 · ADR-0270 · ADR-0279 · L-449 · L-553 ·
L-616 · L-656 · L-661 · §CONTEXT-DATA-HONESTY. Evidence:
[`sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`](./sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md) ·
[`findings/VALENCIA-DATA-RECON.md`](./findings/VALENCIA-DATA-RECON.md) ·
[`findings/VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md`](./findings/VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md) ·
[`findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md`](./findings/VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md).
Code: `packages/site-parcel-data/src/rulepacks/esValencia{Pgou,Envelope}.ts` ·
`providers/valenciaBbox.ts` · `__tests__/valenciaRouting.test.ts` (57 tests) ·
`tools/city-completion/measurements/valencia.measurements.json` ·
`tools/city-completion/samples/valencia.parcel-sample.json`. Maintainer: UNASSIGNED.*
