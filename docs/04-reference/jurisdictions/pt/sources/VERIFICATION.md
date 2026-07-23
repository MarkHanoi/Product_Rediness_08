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
| DGT LiDAR — endpoint, coverage, licence confirmed live | **PENDING** | — | — | Requires live probe of `cdd.dgterritorio.gov.pt` |
| SNIT WFS — field schema confirmed live | **PENDING** | — | — | Requires live GetCapabilities + GetFeature probe |
| Carta Cadastral — CGPR coverage for Braga confirmed from SNIC | **PENDING** | — | — | Critical gate for all subsequent work |
| Carta Cadastral — coverage for Lisboa and Porto (NOT assumed) confirmed | **PENDING** | — | — | Must NOT assume coverage without confirmation |
| Lisbon CML 3D model — redistribution licence confirmed | **PENDING** | — | — | Hard blocker for Lisbon municipal integration |
| DGPC Atlas — heritage layers confirmed queryable (GetCapabilities live probe) | **PENDING** | — | — | Lower priority than cadastral gate |

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
