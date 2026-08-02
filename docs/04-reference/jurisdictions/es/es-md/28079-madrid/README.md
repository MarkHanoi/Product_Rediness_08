# Madrid (INE 28079, ISO es-md) — jurisdiction record

> ⚠⚠ **SUPERSEDED 2026-08-01 (§MADRID-NZ1-DECERTIFIED, L-677) — THE ENVELOPE AXIS IS A MEASURED 0 %, NOT ≤4.7 %.**
> The ≤4.7 % was `0.11695 × 0.4`, the NZ-1 slice, and it was authorised by `MADRID_NZ1_CERTIFIED = true` —
> a gate whose docstring credited *"the L-608 sign-off, 2026-07-25"* while `sources/VERIFICATION.md §3
> "Signed off (legal)"` was **empty**. `git log -S` locates the flip in ONE commit — `3e571724`,
> *"fix(madrid): ship the parcel ring on compound COEF_Z + flip NZ1 gate ON"*, **`Co-Authored-By: Claude
> Opus 4.8`** — whose message is entirely about the COEF_Z parse. **The gate cited as its authority the
> very commit that opened it, and the signatory was a machine.** The gate is now `false`; every NZ-1
> parcel receives the cited refusal the path was designed to give, and **no Madrid parcel receives a
> numeric envelope from any path today**.
> ⚠ **This is a correction, not a regression, and it is not a finding against NZ 1's geometry** — the
> footprint is real published municipal data and `sources/VERIFICATION.md` SIG-M2 may well be answered
> *"reading published geometry is not a transcription, so no L-449 signature is owed"*, which would
> restore the 4.7 % legitimately. It has to be answered **by a person, in writing, with a date**.
> ⇒ **Every `≤4.7 %` below reads as `0 %` until SIG-M2 is answered.** [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) row 5.


> **What governs here · pack status · granularity · the number · open questions · file index.**
> Follows the JURISDICTION-PLAYBOOK file contract (§3.1) and the C63 §5 dossier standard.
> **Last updated 2026-07-31.** Maintainer: UNASSIGNED. Status: **IN PROGRESS** — spec + recon
> complete, extraction not started, nothing signed.

## 1 — What governs here

Madrid city is governed by the **PGOUM-97** (Plan General de Ordenación Urbana de Madrid, approved
17-04-1997, BOE 19-04-1997 — *asserted, not re-verified*).

🔴 **The living text is the `Compendio 2025 de las Normas Urbanísticas … (actualizado a 24.09.2025)`
— VERIFIED 2026-07-31. This supersedes every "Compendio 2023" citation that previously ran through
this dossier.** Two further facts, both verified and both load-bearing:

- **The Compendio is *not* the legal source.** The publisher states verbatim: *"El Compendio tiene
  carácter informativo"*, and *"la versión oficial de las normas … han sido publicadas en el Boletín
  Oficial correspondiente."* So the **BOE publication** is the legal text; the Compendio is the
  consolidated consultation copy. This puts a Level 0 above the founder corpus's Level-1 hierarchy
  and is what fixes an `effectiveDate` (`sources/SOURCES.md` §0.2).
- 🔴 **Two Madrid portals serve different consolidations simultaneously.**
  `geoportal.madrid.es` still serves the **superseded** July-2025 edition;
  `transparencia.madrid.es` serves the current September-2025 one. Both HTTP 200, distinct documents,
  no on-page signal. **Cite transparencia** (`RISK-REGISTER.md` R10).

Residential land splits two ways:

- **~65 % directly governed by a Norma Zonal** — the packable land.
- **~35 % in a derived ámbito** (APR / APE / API / Plan Parcial) — the Madrid analogue of
  Barcelona's derived-planning trap: the general plan points at a per-site document PRYZM does not
  hold, so the honest output is a `derived-plan` **refusal**, not an envelope.

⚠ Both percentages are **UNSOURCED** and must never be presented as measured coverage.

### Rule KIND per Norma Zonal (ADR-0270 — the wrong SHAPE is worse than a wrong number)

Madrid uses all three geometric operations, and getting the kind right per zone is the point of this
record:

| Norma Zonal | Claus | Typology | `geometricRule` kind |
|---|---:|---|---|
| **NZ 1** Protección del Patrimonio Histórico | 6 | historic core | **`explicit-area`** — footprint published as data |
| **NZ 3** Volumetría específica | 5 | per-parcel volume | **refusal `derived-plan`** (per-parcel ficha) |
| **NZ 4** Edificación en manzana cerrada | 1 | ensanche | **`alignment`** — alineación + *fondo edificable* |
| **NZ 5** Bloques abiertos | 3 | open blocks | ⚠ **UNDETERMINED** — setback vs building-separation |
| **NZ 7** Baja densidad | 3 | low density | **`setback`** (likely; verify) |
| **NZ 8** Vivienda unifamiliar | 10 | detached | **`setback`** — real retranqueos |
| **NZ 9** *(name/chapter unknown)* | 6 | likely non-residential | ⚠ **unknown** |

**Σ 34 claus** — the verified `AMB_TX_ETIQ` inventory (`sources/SOURCES.md` §0.3), and the denominator
for the C63 LEGISLATION axis.

⚠ Every zone is **grado-structured** except NZ 4 (a bare `"4"`). NZ 8 alone has 10 codes. Key any
pack on the exact `AMB_TX_ETIQ` string — a bare `NZ<n>` scalar is a category error, and inventing
`4.1`/`4.2` for NZ 4 is fabrication.

## 2 — Pack status

> ⛔ **CORRECTED 2026-08-01 — the line below and the NZ-1/NZ-4 rows under it are STALE.**
> **Madrid IS registered** (`40c80164`): `packsByZone` carries **23 codes**, the router, both proxies
> and the L5 dispatch are live, and **NZ 1 renders a constructed envelope**
> (`MADRID_NZ1_CERTIFIED = true`). The `explicitAreaFootprint` tsc defect is **closed**
> (`ZoningRulesEngine.ts:84`), the codes `1.1…1.6` **are** registered, and NZ 4/5/7/8/9 hold **282
> machine-extracted cited records** — not "zero numeric parameters". What withholds every number is
> the **human gate** `MADRID_ENVELOPE_VERIFIED = false`. ⇒ [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md).

~~**No pack registered. `packsByZone` is EMPTY.**~~ **Every Madrid parcel receives a terminal answer:
a constructed envelope (NZ 1), a legally-grounded delegation (NZ 3), or a cited refusal.**

| Track | State |
|---|---|
| **Routing** | ✅ **SOLVED and independently corroborated.** `NORMAS_ZONALES/0` `AMB_TX_ETIQ` gives parcel→zone+grado for all 34 claus, spatially. Derived-plan (APR/APE/API) detection works. The join to the clicked parcel is **spatial** — `CODMANZANA` is *not* a refcat substring (disproved against three real refcats). |
| **NZ 1** | ⚠ **Engineered, wiring-gated.** `COEF_Z` + the layer-6 footprint are live published geometry; the `explicit-area` solver and `esMadridNZ1Provider.ts` are **built and fixture-tested**. Blocked on: a same-origin proxy, a 🔴 one-line `explicitAreaFootprint` interface defect that breaks `tsc` while tests stay green, registering the real codes `1.1…1.6`, and L-449. **No research required.** |
| **NZ 4 / 5 / 7 / 8 / 9** | 🔴 **Document-gated.** Zero numeric parameters extracted. The Zod schema (`buildableDepth_m .positive()`, the mandatory setback triple) **structurally forbids** a placeholder pack. Values stay `null`. |
| **NZ 3 + derived ámbitos** | ✅ A cited `derived-plan` refusal is authorable now (copy in `sources/SOURCES.md` §D). |
| **Overrides** (protected / ficha / ámbito precedence) | 🔴 **NOT MODELLED — and this is a precondition, not a follow-up.** A parcel can carry several instruments at once; an override-bearing parcel would silently get the general zone answer. Masked today only by the blanket refusal (`RISK-REGISTER.md` R17). |

## 3 — Granularity (C58 §1.11)

- NZ 1 `COEF_Z` — keyed on `CODMANZANA` (**block**), though layer-6 polygons are finer (one per
  catalogued `NUMORD`). ⚠ Its denominator is **unknown**, so *manzana* is a live candidate — applying
  a per-manzana coefficient per-parcel would be wrong even with the right unit.
- NZ 4 / 8 fondo & retranqueos — **parcel** (once sourced).
- `Visor_Edificabilidad` — **ámbito** only ⇒ context, never a parcel envelope.

## 4 — The number (honest, denominator named)

**Denominator = a Madrid residential parcel click.**

⚠ **UPDATED 2026-08-01.** The land shares are now **MEASURED** (L-676) on a stated denominator —
**149,577,170 m² of Norma-Zonal-governed land** (*not* the municipal 604 km², *not* the L-656
private-buildable set, which Madrid still lacks).

| Figure | Value | Kind |
|---|---|---|
| Parcels reaching a **TERMINAL** answer today | **72.153 %** | **measured** — NZ 3 delegation 60.458 % + NZ 1 envelope 11.695 % |
| …of which carries a **human-signed** citation | **0 %** | **measured** — `VERIFICATION.md §3` is empty |
| Pending **one** signature (NZ 4·5·7·8·9) | **27.847 %** | **measured** — 17.248 % under SIG-M1 as currently scoped |
| C63 ENVELOPE axis **today** | **0 %** | **measured** — the ≤4.7 % was withdrawn 2026-08-01 when NZ 1's unsigned gate was de-certified (CLOSURE-REGISTER row 5). Restored by one human answer to SIG-M2 |
| C63 ENVELOPE **arithmetic maximum** | **≈36.8 %** | **~96 % of the gap is LAW** (NZ 3), not effort |
| C63 LEGISLATION axis | **0 %** | **measured** (0 cited+signed of 34 claus); max **100 %**, effort-bound |
| C63 overall | **43.0 %** | computed, `partial: true` — max **≈87 %** |
| Data-readiness (`LEGISLATION-RATE.md`) | ~68 % | a **different ruler** — can a query answer without a PDF |
| ~~Engine ceiling once sourced + wired ≈ 60–62 %~~ | ⛔ **DISPROVEN** | the two land-share fractions behind it are now measured and do not support it |
| Founder forecasts | ~90–95 % | **forecasts, not measurements**, on a different denominator |

⚠ **Six figures, six denominators.** They are all honest and none is interchangeable. Do not quote
one as another (`RATE.md` records all of them side by side; `RISK-REGISTER.md` R1/R19).

## 5 — Open questions / unverified

*Research notes that cannot yet be cited live HERE, never in `sources/SOURCES.md` as facts.*

- 🔴 **Sequencing is UNDECIDED and is the founder's call.** The "highest-value next step" moved
  **five times** across the seven captures, and NZ 1's slot moved from 2nd to last. The material
  resolution is that **NZ 1 splits in two** — the engine branch (engineering-only, can go early) and
  its legal semantics (extraction-blocked, naturally late). No ordering in this dossier is
  authoritative (`NEXT.md` §3).
- **`COEF_Z`'s legal meaning and denominator** — quarantined; never bound to `farRatio`.
- **Zones 2 / 6 / 10 / 11** absent from `AMB_TX_ETIQ`. NZ 2 and NZ 6 *do* have ordinance chapters, so
  "they don't exist" is eliminated for those two; NZ 10/11 are unexplained. If parcels exist there
  they route nowhere and get a refusal citing the wrong reason.
- **NZ 9's identity** — name, chapter, kind all unknown; absent from the founder corpus entirely.
- **NZ 5's rule kind** — setback vs building-separation; may require an ADR.
- **Whether Madrid needs a Catastro connector at all** — two captures directly contradict each other;
  determines whether a Catastro licence is needed. Not resolved.
- **Four named GIS layers, none probed** — `PG_ANALISIS_EDIFICACION` (existing buildings — would
  change the product question to new-build vs extension vs rehab), `PG_EDIFICIOS_PROTEGIDOS`,
  `PG_USOS_Y_ACTIVIDADES`, `PG_GESTION/Alineaciones`. **Every field name is a hypothesis.**
- **Licence text** for the `sigma.madrid.es` services — "no auth observed" is not a grant.
- **Schema gaps Madrid surfaces** (grade inheritance, per-parameter resolution, exception trees,
  two grade dimensions, per-field confidence) — real, but they belong in the shared contract /
  ADR-0279 discussion, not in a Madrid pack (`sources/SOURCES.md` §G4).
- **Cross-jurisdiction material mis-filed here** — two captures are platform architecture (Spanish
  compiler, planning ontology, rule-resolution engine, Spain-wide compounding). They substantially
  **overlap PRYZM's already-ratified** planning-regime resolver and building-graph work, so they are
  a **reconcile-first** item, not a build item, and they need re-filing above city level.

## 6 — File index

| File | What it is |
|---|---|
| `README.md` | this file — what governs, pack status, the number, open questions |
| [`RATE.md`](./RATE.md) | the C63 7-axis composite scorecard (the master rate) |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | the cross-jurisdiction data-readiness ruler (~68 %) → Axis 2 |
| [`ENVELOPE.md`](./ENVELOPE.md) | envelope status, the refusal ledger, the two shape warnings |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance → Axis 6 |
| [`NEXT.md`](./NEXT.md) | where we stopped · the open sequencing decision · blockers · trip-wires |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | the honesty guardrails (R1–R19) + trip-wires |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | the phased climb |
| [`MADRID-LEGISLATION-EXTRACTION-TEMPLATE.md`](./MADRID-LEGISLATION-EXTRACTION-TEMPLATE.md) | the founder-fill worksheet for Cap. 8.x |
| [`SOURCE.md`](./SOURCE.md) | the data-source catalogue (the human face of attribution) |
| `sources/SOURCES.md` | **per-field citations + the §0 evidence chain** — the trust gate |
| `sources/VERIFICATION.md` | source-identity verification (§1) + the L-449 legal gate (§2, unsigned) |
| `findings/L-608-*` | the pack spec, the shipped solver, the shipped NZ-1 provider |
| `findings/MADRID-DATA-RECON-SPIKE.md` | the live endpoint recon + the 34-code inventory |
| `findings/SOURCE-founder-*-2026-07-31.md` | **7 raw founder captures — READ-ONLY evidence, do not edit** |

---
*Authority: [C63](../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) §5 ·
C58 · C57 · ADR-0270 · ADR-0279 · L-449 · `jurisdictions/README.md` · `JURISDICTION-PLAYBOOK.md`.*
