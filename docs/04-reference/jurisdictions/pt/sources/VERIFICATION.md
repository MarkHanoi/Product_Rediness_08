# VERIFICATION — Portugal (`pt`) national sources

**Gate status: OPEN — no human sign-off yet.**

> Per the JURISDICTION-PLAYBOOK §3.4: this file records who checked the source, when, against which
> document version, and critically — what they could NOT confirm. Draft → published is a human act.
> No pack may ship `confidence: structured` until VERIFICATION.md is signed off.

---

## Sign-off checklist

| Item | Status | Who | When | Notes |
|---|---|---|---|---|
| RJIGT / DL 80/2015 — legal hierarchy confirmed against primary `dre.pt` text | **PENDING** | — | — | Research citations treated as `CONVERGENT-SECONDARY`; a Portuguese planning lawyer or urban planner should confirm the instrument-chain reading |
| DR 15/2015 — solo urbano/rústico taxonomy + abolition of solo urbanizável | **PENDING** | — | — | Read directly from `dre.pt`; confirm Article numbers |
| RJUE / DL 555/99 + DL 10/2024 — comunicação prévia trigger confirmed | **PENDING** | — | — | Confirm the exact article that uses "parâmetros urbanísticos efetivamente definidos" |
| DL 72/2023 — unified cadastre + NIC + rebuttable presumption | **PENDING** | — | — | Read Art. [specific] for the legal-presumption framing |
| CGPR + SiNErGIC coverage lists — 127 + 7 municipality counts confirmed | **PENDING** | — | — | Verify specific DGT/SNIC source document stating these counts |
| Braga PDM — índice 1.20 + cércea 7.5 m confirmed from primary PDM text | **PENDING** | — | — | Must read governing article of Braga PDM regulamento directly |
| Porto PDMP — moda da cércea confirmed from Art. [X] | **PENDING** | — | — | Must read Porto PDMP Art. [X] directly from official Aviso n.º 12773/2021 |
| Lisbon PDM — créditos de construção mechanism confirmed from Arts. 84/88/89 | **PENDING** | — | — | Must read Lisboa incentives regulation directly |
| DGT LiDAR — endpoint, coverage, licence confirmed live | **DONE (machine)** | live probe | 2026-07-31 | CC-BY 4.0 quoted verbatim; 30 cm/10 cm exatidão; zero-auth MDT10m; tiles behind **free** Keycloak. **Still needs human sign-off on the STAC `license:"proprietary"` vs CC-BY prose discrepancy** |
| SNIT WFS — field schema confirmed live | **DONE (machine)** | live probe | 2026-07-31 | Plan services are **raster WMS**; the vector route is **CRUS** (`SDISNITWFSCRUS_<DICOFRE>_1`) — 11 **categorical** fields, **no numerics**. `snit-mais` is **401** |
| Carta Cadastral — coverage for Lisboa / Porto / Braga (NOT assumed) | **DONE (machine)** | live probe | 2026-07-31 | Porto **0** · Braga **0** · Lisboa **1,747** (0 in core). Open INSPIRE WFS, `numberMatched=1789404` |
| Lisbon CML 3D model — redistribution licence confirmed | **PENDING** | — | — | Hard blocker for Lisbon municipal integration. Municipal PDM zoning additionally returns **ArcGIS 499 Token Required** |
| DGPC Atlas — heritage layers confirmed queryable (GetCapabilities live probe) | **PENDING** | — | — | Not probed 2026-07-31 |
| **`IDESTADO` / `VALIDADE` codelists + `IDDEPOSITO` grammar** | **PENDING — highest value/effort ratio** | — | — | Fields VERIFIED present (`IDESTADO=2`, `VALIDADE=1`); **semantics UNKNOWN**. One email to `snit.web@dgterritorio.pt`. **Do NOT hard-code `2` = in force until confirmed** |
| **Porto PDM numeric values + Art. 3.º definitions** | **DONE (machine)** | text extraction | 2026-07-31 | Text PDF, 319,459 chars. Arts. 32/36/38 + cércea/profundidade/afastamento + verbatim definitions — see `SOURCES.md` §A.0.3. **Still needs a Portuguese planner's reading of scope/exceptions before `confidence: structured`** |
| **Lisboa créditos de construção — partial suspension** | **DONE (machine)** | text extraction | 2026-07-31 | Art. 2(1)(g) + Art. 5(2)(i) suspended 11 Aug 2022; **regime otherwise in force**. Prior "PDM Arts. 84/88/89" **NOT confirmed** — downgraded to ASSERTED |
| **Porto DICOFRE = 1312 (not 1315)** | **DONE (machine)** | CAOP + SNIT + IDDEPOSITO | 2026-07-31 | Three independent confirmations. **Folder rename is an owner action — NOT performed** |

---

## Specific legal items requiring a Portuguese planning practitioner

The following items in this research pass are derived from English-language secondary descriptions
of Portuguese law, not from reading the primary Portuguese-language legal texts directly. They
should be confirmed by a Portuguese-licensed architect, urban planner, or planning lawyer before
any pack ships with `confidence: structured`:

1. **The licensing-track split (comunicação prévia vs licenciamento prévio):** the research
   characterises this as Portugal's §34/RNU analogue, triggered by absence of "precise urbanistic
   parameters." The exact legal test, and whether the RJUE 2024 reform changed the trigger
   conditions materially, should be confirmed by reading DL 10/2024 Art. [X] directly.

2. **Moda da cércea as a new GeometricRule kind:** the research characterises Porto's moda da cércea
   as a fabric-derived height rule requiring a new kind in C58 §2.2. A Portuguese urban planner
   familiar with the PDMP should confirm this interpretation before the C58 amendment is written.

3. **Créditos de construção (Lisbon):** the research confirms this is a tradeable floor-area
   mechanism under Lisboa PDM Arts. 84/88/89, with no France/Germany analogue. A Lisbon specialist
   should confirm the current operative status (the PDM is under revision) and the current accrual
   rules.

---

*No sign-off has been given. All values remain `CONVERGENT-SECONDARY` or lower until this file
is completed by a qualified reviewer.*

---

## What "DONE (machine)" means here — and what it does NOT

The 2026-07-31 live probe upgraded several rows from `PENDING` to **DONE (machine)**. That means
**a machine read a primary source and the value is no longer hearsay.** It does **NOT** mean the
gate is signed off.

**Still required for `confidence: structured`, for every "DONE (machine)" row above:**

1. **A Portuguese planner must confirm scope and exceptions.** The Porto numeric values are verbatim,
   but which categoria de espaço each article governs, and how the exception clauses interact
   (colmatação, gaveto parcels, parcels > 2000 m², "salvo instrumento adequado"), is a legal reading
   I extracted mechanically and did **not** validate.
2. **`moda da cércea` as a `fabricDerivedHeight` C58 kind** — a planner familiar with the PDMP should
   confirm the interpretation before the C58 amendment is written. *(unchanged from the original list)*
3. **The `IDESTADO` / `VALIDADE` codelists** must be obtained before any in-force test ships.
4. **The DGT licence discrepancy** — STAC `license:"proprietary"` + `access:["private"]` vs the
   CC-BY 4.0 prose — must be resolved by DGT, not by our inference.

**Explicitly NOT verified and NOT to be treated as done:** the CGPR 127 / SiNErGIC 7 / no-cadastre 174
counts (spatially *corroborated* by §A.0.2, never *sourced*); the DR 15/2015 / RJIGT / RJUE / RGEU /
DL 72/2023 primary texts (carried from the archival pass); Braga's índice 1.20 / cércea 7.5 m; the
reported €50 SNIC + Chave Móvel Digital credential; Lisboa's RPDML numeric tables.
