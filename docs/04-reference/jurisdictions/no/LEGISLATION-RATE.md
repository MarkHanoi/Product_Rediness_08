# Data Readiness Rate — Norway (`no`) national

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured national legislation / data-fill rate** (the C58/L-449 cross-jurisdiction ruler), which
> [`NAMING-CONVENTION`](../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It feeds the
> country composite master [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) as **Axis 2 (LEGISLATION)**. Content
> below is unchanged — only the filename moved (§CONTEXT-DATA-HONESTY: no rate value was altered).

**Headline rate: ~32%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (arealformål/zone code + BYA or BRA or %-utnytting + height)
> without reading a reguleringsbestemmelser text/PDF document. Methodology mirrors the cross-
> jurisdiction benchmark (same definition as the Germany/France/Barcelona/Madrid/Denmark scores).
> Direct endpoint/schema checks — not assumed from Norway's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| **Norway (national)** | **~32%** |
| Germany (national) | ~28% |
| France (national) | ~22% |

Norway's national score benefits from a genuinely national plan **data model** (SOSI Plan, legally mandated since forskrift 2009 nr. 861) — stronger schema standardisation than Germany's XPlanung, which only became mandatory in 2023. It is held below 35% for the same structural reason Germany is held below 30%: **the schema defines a place to put the numeric utilisation value (`BestemmelseUtnyttingsgrad`), but the national object-catalog entry for that object type is itself an unfilled placeholder** — confirmed live on Geonorge's own object register 2026-07-24 — and the actual reguleringsbestemmelser text (where %-BYA, height, etc. actually live) is delivered as prose paragraphs, not structured fields, in every plan document sampled.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Matrikkelen — Eiendomskart Teig) | ✅ Structured | Single national WFS, no per-kommune variation: `wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig` — confirmed live, GML, daily update, no login. | **~95%** (the one field where Norway is unambiguously ahead of Germany's per-Land ALKIS fragmentation) |
| Plan existence + boundary (reguleringsplan/kommuneplan polygon) | ⚠️ Partial | National SOSI Plan schema; delivery is per-kommune. Trondheim confirmed open (Geonorge kartkatalog, continuously updated). Oslo Planinnsyn confirmed as click-viewer (WMS/interactive); standalone WFS not confirmed. Bergen endpoint not located. | **~45%** (schema uniform; live per-kommune WFS confirmed for 1 of 3 cities checked) |
| Arealformål (land-use purpose) code on plan polygon | ✅ Published taxonomy | National kodeliste (SOSI Plan, e.g. `1110` = boligbebyggelse); required field per the national produktspesifikasjon. | **~60%** (taxonomy fully national; actual population per parcel confirmed only where live WFS is reachable) |
| Hensynssone code (overlay: heritage, infrastructure, etc.) | ✅ Published taxonomy | National kodeliste under pbl. § 11-8 tredje ledd (e.g. `H570` = bevaring av kulturmiljø). Confirmed national enumeration in the SOSI Plan object catalogue. | **~40%** (code list national and citable; live parcel-level population not independently confirmed) |
| `BestemmelseUtnyttingsgrad` (the object type meant to carry the numeric utilisation figure) | ❌ Effectively unstructured | Geonorge object register confirmed live 2026-07-24: the type exists in the schema, but its documentation reads **"Her burde det vært en forklaring av hvordan utnyttingsgrad skal håndteres, og hva slags beregningsregler som gjelder"** — the national object catalog's own entry is an unfinished placeholder. `https://objektkatalog.geonorge.no/Objekttype/Index/EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F` | **~5%** (schema slot exists; not usably specified, let alone consistently populated) |
| Grad av utnytting calculation **method** (BYA/%-BYA/BRA/%-BRA/MUA) | ✅ Published | TEK17 §§5-1–5-7, veileder H-2300 B, NS 3940 — freely published, nationally uniform. National **method** definitions, exactly like BauNVO §20's floor-area calculation method for Germany. | **100% (method only — never the parcel-level numeric answer)** |
| Actual %-BYA / BRA / m²-BRA value (parcel-level) | ❌ Text/PDF | Confirmed via Trondheim example (Brannkvartalet reguleringsbestemmelser, 2004): utnyttelse and formål stated as numbered prose paragraphs (§1 Avgrensning, §2 Formålet, etc.), not as separate structured fields. No WFS/GML attribute carrying a numeric BYA/BRA value was found for any parcel in this pass. | **~5%** |
| Actual height value (parcel-level) | ❌ Text/PDF, except the national default | Same reguleringsbestemmelser-as-prose pattern for plan-set heights (mønehøyde/gesimshøyde/kotehøyde). **Exception:** where **no plan governs**, pbl. § 29-4 supplies an actual numeric, citable default (gesimshøyde >8 m / mønehøyde >9 m needs a plan; else setback = max(½ height, 4 m)) — confirmed text at regjeringen.no, Rundskriv H-8/15. | **~15% blended** (≈0% where a plan governs; 100% as a fallback where no plan governs — unlike Germany's §34, which yields 0% in the no-plan case too) |
| Setback / avstand (byggegrense) | ⚠️ Partial | § 29-4 national default applies absent a plan; where a plan sets its own byggegrense/avstand, that figure is again prose in the reguleringsbestemmelser. | **~20%** |
| Building footprint + height (FKB-Bygning, 2.5D) | ⚠️ Partial, licence-gated | Confirmed schema: footprint + top-height value, matrikkel-linked. **Free only for Norge digitalt parties** (public bodies/agreement holders); private/commercial use requires a paid reseller licence or direct Kartverket agreement — structurally the same restriction as Germany's ZSHH cross-Land LoD2-DE gate. | **~35%** |
| Building point only (no footprint) | ✅ Open | Matrikkelen — Bygningspunkt, confirmed free, no login. Useful for presence/location only, not massing. | **90%** (for what it actually provides — location only) |
| Terrain/surface model (LiDAR) | ✅ Structured, complete | Nasjonal detaljert høydemodell (NDH), confirmed complete nationwide (2016–2022, ≥2 pts/m²), free via `høydedata.no`, WMS/WFS/WCS indexed on Geonorge, no login. | **100%** for terrain — the one field where Norway is unambiguously ahead of *both* Germany and France |
| Plan status / supersession (planstatus, overstyrer/overstyres av) | ✅ Structured taxonomy | National kodeliste, confirmed in the SOSI Plan object catalogue (`Planstatus enumeration`) — machine-resolvable plan-relationship logic. | **70%** (taxonomy national and real; live population per parcel not independently confirmed) |
| Heritage — full legal register (Askeladden) | ⚠️ Access-gated | Professional login required. Not usable as a direct engine data source. | **10%** (exists; not accessible without agreement) |
| Heritage — public subset (Kulturminnesøk.no) | ✅ Structured, open | Confirmed live, free, no login, ~220,000 objects with map geometry and attributes. Riksantikvaren caveat: older geolocations may be imprecise. | **60%** |
| Reguleringsbestemmelser full text access | ✅ Full, marginally better than Germany | At least some kommuner (Trondheim confirmed) publish bestemmelser as parseable HTML/text, not only scanned PDF — a marginally better transcription-pipeline starting point than Hamburg/Berlin's PDF-only pattern. | **~75%** (access to the text; NLP/parsing still required to reach a structured number) |

---

## The SOSI Plan structural gap

SOSI Plan defines object types capable of carrying a numeric utilisation value — `BestemmelseUtnyttingsgrad` exists in the schema — but, unlike BauNVO's §17 ceiling table (which is at least *fully specified*, even though it's a ceiling rather than a parcel answer), **Norway's own national object-catalog entry for the utilisation-degree object type is an incomplete stub in the authoritative register itself**, dated as still unresolved in the live Geonorge documentation checked 2026-07-24.

Combined with the Trondheim reguleringsbestemmelser example — where the actual numbers live in numbered prose paragraphs exactly like a German B-Plan Satzung or a French règlement écrit — this is Norway's version of Hamburg's finding: **the exchange format and the legal mandate to use it both exist, and are older and more binding than Germany's, but the actual numeric values were never required to be digitised into structured fields, so they weren't.**

---

## Two-regime classifier (simpler than Germany's four-way split)

| Regime | Fraction (estimate) | Structured data path | Rate |
|---|---|---|---|
| Governed by an adopted reguleringsplan or kommuneplan arealdel bestemmelse | Majority of urban parcels | Plan WFS/WMS (where it exists) → bestemmelser text → NLP/transcription for numeric value | **~10–15% structured** (boundary + status only; numeric value still text) |
| No governing plan — pbl. § 29-4 default applies | Remaining parcels (concentrated in less-developed/rural areas) | Direct statutory lookup, no plan-reading required | **~90% structured** (a real numeric ceiling-and-setback answer) |

---

## Where Norway pulls ahead of Germany

- **Zone/overlay code lists** (arealformål, hensynssone, planstatus) are more completely and more anciently standardised than BauNVO's zone letters alone — they also cover overlays; Germany has no national equivalent for heritage/infrastructure hensynssone-style codes.
- **The no-plan default (§ 29-4) has real numbers**, unlike Germany's §34 which returns a discretionary, non-numeric answer. Norway's "no adopted plan" case is not a dead end.
- **Parcel geometry access is cleaner** — one national WFS versus Germany's per-Land ALKIS variability.

## Where Norway is likely worse than Germany

- **Delivery fragmentation is deeper** — ~357 kommuner versus Germany's 16 Länder. Even with a uniform schema, more endpoints to individually confirm.
- **No confirmed national aggregator WFS** that lets a single call resolve "which reguleringsplan covers parcel X" the way Hamburg's or Berlin's B-Plan WFS at least resolves plan boundary + PDF link at the city level.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Pull a live GetFeature from Trondheim's planregister WFS and inspect actual attribute schema | Confirms whether arealformål/hensynssone codes are attributes (raises confidence on ~45–60% estimates) or geometry+ID only | Low — one WFS GetFeature probe |
| Locate and probe Oslo's planregister WFS endpoint | Resolves single largest open unknown; could raise "plan existence + boundary" field materially | Low–Medium |
| Locate and probe Bergen's planregister WFS endpoint | Same as Oslo | Low–Medium |
| Fetch one full reguleringsbestemmelser document and check for structured heading pattern | Determines whether NLP-extraction pipeline is realistic | Low |
| Survey wider kommune sample (Stavanger, Kristiansand, Tromsø, Drammen) | Converts ~45% "plan existence" estimate from 1-of-3-cities sample into actual coverage measurement | Medium |

---

*Last updated: 2026-07-24. Matrikkelen parcel WFS and NDH terrain confirmed live and fully open. Trondheim planregister confirmed open (catalogue/access level); live GetFeature attribute schema not yet pulled. `BestemmelseUtnyttingsgrad` object-catalog entry confirmed as an unfilled placeholder. Bergen and Oslo planregister WFS endpoints not yet located.*
