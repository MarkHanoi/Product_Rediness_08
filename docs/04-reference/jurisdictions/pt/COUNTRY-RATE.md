<!-- COUNTRY-RATE.md — Portugal composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in LEGISLATION-RATE.md (renamed from RATE.md, L-649) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Portugal (pt) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · CONTEXT) cited-derived
     per C63 §8.1; TERRAIN blocked (no open PT DTM); all other axes `not-assessed` with a typed C62 reason.
     No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~0 %` — see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (renamed from `RATE.md` — L-649 migration complete; see the reconciliation banner atop that file). Portugal's numeric planning values (índice, altura da
edificação / cércea, afastamentos) live in PDM/PDMP **PDFs**; no structured machine-readable equivalent
exists, and the Lisboa/Porto cadastral regime for the urban cores is unconfirmed. See [`README.md`](./README.md)
+ [`PORTUGAL-CONTEXT-DEEP-DIVE.md`](./PORTUGAL-CONTEXT-DEEP-DIVE.md) for the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = measured-**capable** (source verified available + licence-clear) but **unbaked/unwired**
→ still not-assessed. `(empty)` = provider EXISTS and was queried, and **returns ~nothing for this city** —
a measured emptiness, not an unknown. **Overall** is renormalised over the ASSESSED subset only (`partial`).

> **⚠ `(blk)` on TERRAIN has been WITHDRAWN — see §D.** The prior `license-restriction` marking was based on
> a claim now refuted by live probe.

## §A — Per-city completion matrix (2 bake-covered this pass — Lisbon, Porto)

Cheap axes cited-derived (see each city's `RATE.md` for the full derivation); PARCEL/LEGISLATION/ENVELOPE/
TERRAIN/HEIGHTS remain the human-gated axes, honestly `not-assessed` until wired.

| City (`DICOFRE`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Lisboa (pt-11)_ | | | | | | | | | |
| Lisboa (`1106`) | `—`(empty) | `—` | **30%** | `—` | `—`(cap) | `—`(cap) | **56%** | **36%** `partial` | [dossier](./pt-11/1106-lisboa/RATE.md) |
| _Porto (pt-13)_ | | | | | | | | | |
| Porto (`1312`) | `—`(empty) | `—` | **30%** | `—` | `—`(cap) | `—`(cap) | **56%** | **36%** `partial` | [dossier](./pt-13/1315-porto/RATE.md) |

> **⚠ DICOFRE CORRECTION — Porto is `1312`, not `1315`.** VERIFIED three independent ways (2026-07-31):
> DGT CAOP `cont_municipios` returns `dtmn=1312, municipio=Porto`; the SNIT PDM service is
> `SDISNITWMSPDM1_**1312**_3027_3` titled *Plano Diretor Municipal do Porto*; its `IDDEPOSITO` is
> `01.**13.12**/PDM/03/2021/93`. **The dossier folder is still named `1315-porto/` and the link above still
> points there** — the folder was NOT renamed (it is referenced from here and possibly from code registries
> outside this lane's ownership). **Rename is an owner action.** `1315` is a different municipality in the
> Porto district; which one was NOT verified and is not guessed here.

**Why the numbers did not move despite a large recon pass.** The 2026-07-31 live probe changed **what we
know**, not **what is wired**. C63 cells are wiring-derived; **no PT source was wired this session**, so
DATA-SOURCES stays at the computed 30 % and both cities stay at **36 %**. What changed is the *reason codes*
and the *evidence* — recorded in §D. Inflating a cell because a source turned out to exist would be exactly
the fabrication C63 §1.1 forbids.

## §B — Pre-existing / tackled but NOT bake-covered this pass (logged, never silently truncated)

- **Braga (`0303`, pt-03)** — has a legacy research dossier (`pt/pt-03/0303-braga/`, DICOFRE 0303) but is
  **NOT in a context bake bbox** (`bake.mjs` REGIONS has only `lisbon` + `porto` for Portugal; Braga
  ~41.55 N, −8.42 W lies outside the `porto` clip `-8.70,41.12,-8.55,41.20`). It is "tackled" per C63 §1.7
  (scaffolded folder) but out of THIS pass's bake-covered scope; its legacy `RATE.md` is the pre-L-649
  legislation number, not yet migrated to a composite. Scaffold on demand once a Braga bake row exists.
- **National composite-RATE migration:** the national `pt/RATE.md` → `pt/LEGISLATION-RATE.md` (legacy
  structured-fill ~0 %) is DONE (L-649: banner + inbound links repointed).
  The two CITY legacy `RATE.md` files (Lisboa, Porto) WERE migrated to `LEGISLATION-RATE.md` this pass.

## §C — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

Both scaffolded cities have `honestyOk: true` — they fabricate nothing. One shared shape:

- **Lisboa + Porto** — DOES: baked OSM context (5/9 layers) + a documented (unbaked) national LiDAR height
  source (`dgt_pt`). REFUSES: an envelope (no rule pack), a parcel (no PT provider wired + Carta Cadastral
  misses the cores), and terrain (national DTM `blocked`) — never a borrowed/invented number. UNKNOWN
  (typed): PARCEL `not-queried`, LEGISLATION + ENVELOPE `pending-implementation`, TERRAIN `license-restriction`,
  HEIGHTS `not-queried`. `honestyOk: true`.
  - Porto additionally: its *moda da cércea* height rule needs a C58 `fabricDerivedHeight` kind; Lisboa
    additionally: *créditos de construção* need a C58 `transferableRights` overlay — both block a complete
    pack even after OCR (per each city's `ENVELOPE.md`).

## §D — Per-axis evidence update (live probe 2026-07-31) — reason codes, not scores

Full evidence: [`findings/PORTUGAL-DATA-RECON.md`](./findings/PORTUGAL-DATA-RECON.md) ·
[`findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md`](./findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md).

| Axis (weight) | Prior reason | **Corrected reason** | Evidence (VERIFIED 2026-07-31) |
|---|---|---|---|
| **TERRAIN (10)** | `license-restriction` — *"no open national bare-earth DTM published by DGT"* | **`pending-implementation`** — source **available + licence-clear**, merely unwired | **REFUTED.** `MDT10m2024_PTcontinente.zip` (3,545,398,706 B) downloads with **zero auth**. 2024–25 national LiDAR: 10 pts/m², **10 cm stated altimetric accuracy**, bare-earth MDT at 0.5/2/10 m, **CC-BY 4.0**, open STAC catalogue + search. Only high-res *tile byte-fetch* is behind a **free** self-service Keycloak registration (no key, no secret). Continental only — **no Azores/Madeira**. |
| **HEIGHTS/LOD (10)** | `not-queried` / capable | **`pending-implementation`** (capable, better evidenced) | LAZ class **6 = Construções** ⇒ heights derivable as **MDS − MDT at 50 cm**. Same shared nDSM module as ES (L-511c) / FR (L-512b). **No RMSE published** — DGT states *"exatidão"*; do **not** convert or quote PNOA parity. |
| **PARCEL (15)** | `not-queried` | **`source-empty-for-this-city`** — provider exists, **queried, returns ~nothing here** | A national **INSPIRE WFS is live and unauthenticated**: `snicws.dgterritorio.gov.pt/geoserver/inspire/ows`, `inspire:cadastralparcel`, **`numberMatched=1789404`**, `DescribeFeatureType` works, EPSG:3763. **Measured coverage: Porto `0` · Braga `0` · Lisboa `1747` (and `0` in the Baixa core)** vs Loulé `63834` · Penafiel `23906` · Tavira `11015` · Algarve-wide `321579`. Zeros are real — the same query returns 66,973 for the Porto *district*. |
| **LEGISLATION (25)** | `pending-implementation` | `pending-implementation` — **but the expensive human-gated SOURCING is now DONE for Porto** | Porto regulamento retrieved and fully extracted (**text PDF**, 100 pp, 319,459 chars). Primary-sourced: `índice de edificação` **1 / 1,8 / 1,4** (Arts. 32/36/38); **cércea ≤ street width, cap 21 m, moda overrides**; **profundidade ≤ 25/30 m**; **afastamento ≥ H/2 min 3 m**; verbatim Art. 3.º definitions. Lisboa RPDML **not retrieved** — still UNKNOWN. |
| **ENVELOPE (20)** | `pending-implementation` | `pending-implementation` — **plus two C58 schema gaps** | Porto needs a C58 **`fabricDerivedHeight`** kind (*moda da cércea*). Lisboa needs **`transferableRights`** (*créditos de construção* — instrument VERIFIED, but it is a **separate municipal regulation**, not PDM Arts. 84/88/89 as previously recorded; **two alíneas suspended since 11 Aug 2022**). |
| **DATA-SOURCES (15)** | 30 % (wiring-derived) | **30 % — unchanged; availability far higher than the number implies** | Newly VERIFIED-available but **unwired**: **CRUS zoning WFS** (`SDISNITWFSCRUS_<DICOFRE>_1`, vector, GeoJSON, `Classe`/`Categoria`, EPSG:3763); cadastral WFS (above); DGT terrain/LiDAR (CC-BY 4.0); **Porto municipal ArcGIS Server 11.5 anonymous** + 361-layer WMS (`Fees: none`) + **21 CC-Zero CKAN datasets**. Lisboa municipal zoning is **ArcGIS 499 Token Required**; Lisboa CKAN has **0** PDM datasets (control: 407 total). |
| **CONTEXT (5)** | 56 % | 56 % — unchanged | OSM bake, 5/9 layers. |

**The one structural caveat that survives every correction.** No Portuguese structured source carries a
numeric envelope parameter. CRUS's 11 fields, Porto's 36 ArcGIS fields and Lisboa's 9 viewer fields are
**wholly categorical**; Lisboa's schema even names the field **`ART_RPDM`** — a *pointer to a Regulamento
article*. **Zoning geometry + category are national and structured; the numbers are PDF-only.** The join key
for any PT pack is **`(DICOFRE, Classe, Categoria)` → regulamento**.

**Operational warning.** `servicos.dgterritorio.pt` is **severely slow** — 148 s for a CRUS GetCapabilities,
132–172 s for `DescribeFeatureType`/`GetFeature`, one hard **502** at 204 s. **A 30 s client timeout will
report this endpoint as dead when it is merely slow.**

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`findings/PORTUGAL-DATA-RECON.md`](./findings/PORTUGAL-DATA-RECON.md) | **live endpoint probe** — every URL + HTTP status + schema (2026-07-31) | DATA-SOURCES · PARCEL · TERRAIN |
| [`findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md`](./findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md) | national rule-mechanism study + genome transfer + targets | LEGISLATION · ENVELOPE |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill (~0 %) — renamed from `RATE.md` (L-649) | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer | all |
| [`PORTUGAL-CONTEXT-DEEP-DIVE.md`](./PORTUGAL-CONTEXT-DEEP-DIVE.md) | national context/data recon | DATA-SOURCES |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. DICOFRE codes
from the existing dossier folders; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs` +
`packages/site-parcel-data/src/{parcelProviders,rulepacks}/registry.ts`.*
