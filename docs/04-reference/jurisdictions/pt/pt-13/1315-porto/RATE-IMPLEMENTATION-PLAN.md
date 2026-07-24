# Rate Implementation Plan — Porto (`pt-13 / 1315-porto`) city

**Current rate:** ~0% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~30–45% ·
**Gap to ceiling:** ~30–45 pts · **Gap to Denmark (~96%):** ~96 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> **Ceiling note:** Porto's ceiling (~30–45%) is lower than Lisboa's estimate because the moda da
> cércea engine blocker permanently caps moda-da-cércea zones at 0% until the C58
> `fabricDerivedHeight` amendment is approved and implemented. The ceiling for non-moda-da-cércea
> zones is ~35–45% (PDF-sourced with OCR pipeline, cadastral confirmed). The blended city ceiling
> depends on what fraction of Porto's land is governed by moda da cércea — not yet measured.

---

## 1 — The ceiling: what "maximum" means here

Porto has two structurally distinct rate ceilings operating simultaneously:

**Non-moda-da-cércea zones (ceiling ~35–45%):** These zones follow the same national pattern —
SNIT zone polygon + PDMP PDF → OCR extraction → L-449 gate → serve. If cadastral geometry is
confirmed and the OCR pipeline is built, these zones can approach a Barcelona-like ceiling once all
PDM categories are sourced. The ceiling is capped by PDF-only numeric values and parcel geometry
uncertainty (Porto is north of the Tagus, likely outside CGPR coverage).

**Moda-da-cércea zones (ceiling = 0% until C58 amendment):** The `fabricDerivedHeight` rule kind
does not exist in C58 §2.2. No pack for these zones can be authored until the ADR is approved. Once
the kind is added, the ceiling for moda-da-cércea zones rises to the same PDF-pipeline ceiling as
other zones — but this engine blocker is the absolute prerequisite.

**Ceiling model — Denmark (~96%):** Denmark achieves ~96% through structured national Plandata.
Porto cannot approach that ceiling without: (a) confirmed parcel geometry, (b) OCR pipeline + L-449
gate, (c) C58 `fabricDerivedHeight` schema amendment, and (d) full PDMP category sourcing. None of
(a)–(d) is complete today.

**Pilot model — Barcelona (~48%):** Barcelona's phased climb mirrors the right shape for Porto —
starting with the most tractable categories (analogous to Barcelona's Eixample clau 13a before the
complex historic types). For Porto, the equivalent of 13a is the standard urban space categories
before tackling moda da cércea.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Confirm Porto cadastral regime (DICOFRE 1315 via DGT SNIC); run SNIT WFS probe for Porto zone layer; check DGPC Atlas live for Porto Historic Centre ZEP extent | Parcel geometry status known; zone-polygon queryability confirmed; heritage overlay sourced | ~0% → TBD | ~1 dev-day | NOT STARTED | UNASSIGNED |
| **1** | Read PDMP Art. 11 from Aviso n.º 12773/2021: source índice de edificação definition + numeric values per non-moda-da-cércea categoria; source afastamentos | First Porto-specific verified values for packable categories | TBD → TBD | ~1–2 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Draft C58 `fabricDerivedHeight` GeometricRule kind ADR; get amendment approved | Unblocks ALL Porto moda-da-cércea zones | TBD → TBD (blocker removed) | ~1 dev-day (ADR) | NOT STARTED | UNASSIGNED |
| **3** | Build/reuse OCR pipeline + L-449 gate; ingest SNIT zone polygon + PDMP OCR values for all Porto categorias (including moda da cércea after ADR) | First non-zero fill rate for Porto | TBD → TBD | High (pipeline shared with PT national) + Medium (Porto categories ~8–12 dev-days) | NOT STARTED | UNASSIGNED |
| **4** | Integrate DGPC ZEP (Porto Historic Centre / Ribeira/Barredo) overlay; re-derive RATE.md from live checks | Heritage overlay; first VERIFIED rate measurement | TBD → ~30–45% (ceiling) | Medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) Parcel geometry — same north-of-Tagus risk as Lisboa.** CGPR was southern-focused and
rural-oriented. Porto's urban core is north of the Tagus and likely outside CGPR coverage. Until
the cadastral regime is confirmed, no parcel pipeline can be designed. The Carta Cadastral OGC API
(planned 2025, not yet confirmed live) is the most important external event — if it delivers
complete national coverage, this gap collapses for all Portuguese cities simultaneously.

**(b) Numeric values PDF-only — same as national.** PDMP's índice de edificação, cércea, and
afastamentos are in the PDF regulamento. No structured source exists. The OCR pipeline + L-449 gate
are prerequisites for any non-zero rate. Note: Porto uses "índice de edificação" not "índice de
utilização" — the definitional formula at Art. 11 has not been read, so even the metric formula
(what counts) must be sourced, not assumed equal to other Portuguese cities.

**(c) Moda da cércea — the Porto-unique engine blocker.** Denmark's Plandata delivers height as a
typed field. Porto's height for a significant fraction of the city is governed by moda da cércea —
a fabric-derived rule that requires a new engine rule kind. This gap cannot be closed by data
sourcing alone; it requires an ADR and a schema/engine change. Until that change is shipped, the
Denmark gap on those zones is absolute (not just data-sourcing work).

**(d) UNESCO ZEP overlay — spatial extent unknown.** The Porto Historic Centre ZEP could restrict
buildability in Ribeira/Barredo beyond what the base PDMP categoria allows. Ignoring it would
overstate buildability for those plots — a C58 §1.4 error (presenting a guess as a measurement).

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Blockers (in priority order):**
1. **Cadastral regime confirmation** (P0) — gates all parcel work; Porto is high-risk (north of Tagus)
2. **C58 `fabricDerivedHeight` GeometricRule kind** — must be added before any moda-da-cércea
   zone can be packed; this is an engine/schema change, not a data task
3. **PDMP Art. 11 formula read** — even the density metric formula (what counts as área de
   edificação) is unconfirmed; do not source numeric values before confirming the formula
4. **OCR pipeline + L-449 gate** — shared with PT national; must exist before any value is served

**Cross-jurisdiction reuse:**
- Once approved, the C58 `fabricDerivedHeight` GeometricRule kind is the first implementation of a
  fabric-derived height rule in the engine. If any other jurisdiction (e.g. Barcelona, as Art. 242
  `blockDerivedAlignment` was added) uses a similar contextual-height mechanism, this kind is the
  template. Design the interface generically.
- SNIT zone-polygon ingestion built for Braga reuses for Porto — same national portal.
- DGPC Atlas heritage probe is national — the ZEP reader built for Porto covers all other PT cities.
- nDSM height module (DGT LiDAR) is shared with Spain and France — do not one-off for Porto.

---

*Model references: **Denmark** `../../dk/` (ceiling, ~96%) · **Barcelona**
`../../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*
