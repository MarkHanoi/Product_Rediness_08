# Milan (`015146`) — Jurisdiction Pack

**Country:** `it` · **Region:** Lombardy (Lombardia) · **ISO 3166-2:** `IT-25` · **ISTAT:** `015146` ·
**Pack id:** `it-015146-milan` ·
**Governing instrument:** PGT (Piano di Governo del Territorio) — Lombardy only, introduced by L.R. 12/2005. Operative density rule: NOT a per-zone index — see §1. ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → PGT Piano delle Regole → TUC territorial index (0.35 mq/mq) OR zone-specific rule → applicable NTA article`.
- **Rule KIND (ADR-0270 / C58 §2.2):** **New engine kind required** — this is NOT `coverage-and-far` keyed to zone letters. Milan's PGT for the Tessuto Urbano Consolidato (TUC) uses a **single unified territorial building-rights index plus a perequation/rights-trading layer** — a mechanism with no existing analogue in a `GeometricRule` schema built around zone-keyed values. Closest structural analogue: Paris's reference-surface-plus-gabarit finding in the France study, not any zone-config case.
- **Setback-governed vs alignment-governed:** setbacks governed by the Regolamento Edilizio-Tipo (RET) of Lombardy — field names and multipliers not yet read.
- **Legal-structure trap watch (P1):** the dominant TUC territorial-index mechanism (0.35 mq/mq base, 0.70 mq/mq ceiling via perequation) governs Milan's built-up area **without zone letters**. Querying "which DM 1444 zone applies" is the **wrong question** for most Milan parcels. Additionally: ERS (*Edilizia Residenziale Sociale*) zones and agricultural land are explicitly excluded from the unified index and follow separate rules — a pack needs both mechanisms. The perequation ledger (which parcels have already transacted rights) is not evidently exposed as queryable GIS.

### The PGT three-document structure (Lombardy-specific)

| Document | Governs | Operative for numeric rules? |
|---|---|---|
| **Documento di Piano** | Strategic vision, transformation areas, overall territorial index allocation | Partial — sets the overall 0.35/0.70 mq/mq TUC framework |
| **Piano dei Servizi** | Public services, standards (18 m²/resident) | Indirect — standard endowments, not building envelope |
| **Piano delle Regole** | Every parcel's specific operative rules — TUC boundaries, zone classifications, NTA articles | **YES — this is the operative document for parcel-level queries** |

### TUC territorial-index mechanism

| Parameter | Value | Source |
|---|---|---|
| Base territorial index (`Indice di edificabilità Territoriale`, TUC) | **0.35 mq/mq** | PGT Piano delle Regole NTA |
| Ceiling (with perequated rights + bonuses + social housing quota) | **0.70 mq/mq** | PGT Piano delle Regole NTA |
| Mechanism type | Single citywide number + rights-trading overlay — NOT a per-zone table | PGT (post-2019 reform) |
| Excluded from TUC index | ERS zones, agricultural land | PGT NTA |

This is structurally closer to a cap-and-trade allocation than to a DM 1444 zone-by-zone lookup table. For most of Milan's built-up area, "which zone applies" is the wrong question — the right question is "what is this parcel's *lotto funzionale*, what existing built volume does it carry, and what perequated rights does it hold or need to acquire."

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **TUC territorial-index engine kind** | NOT STARTED — new kind required (no zone-letter analogue) | PGT Piano delle Regole NTA read + Lombard Geoportale WFS parcel-to-zone query confirmed |
| **PGT zone layer (Piano delle Regole)** | NOT STARTED — Lombardy Geoportale hosts PGT archive; WFS parcel-query not confirmed | Live probe of `geoportale.regione.lombardia.it` WFS capabilities |
| **Perequation ledger** | NOT STARTED — not evidently exposed as queryable GIS | Dedicated sourcing check against Milan SIT and PGT portal |
| **ERS zone rules** | NOT STARTED — separate rule from TUC index | Milan PGT NTA ERS articles |
| **Agricultural land rules** | NOT STARTED | Milan PGT NTA agricultural articles |
| **Overlay: SITAP / Vincoli in Rete** | NOT STARTED | `sitap.beniculturali.it` + `vincoliinrete.beniculturali.it` probe |
| **Context data (building height)** | NOT STARTED — Lombardy building-height layer unconfirmed | Check `geoportale.regione.lombardia.it` for 3D/Edifici layer |

Refusal vocabulary in use: `regime-undetermined` (TUC vs ERS vs agricultural not yet classified) · `legal` (perequation ledger required; operative rights unknown) · `coverage-gap`.

---

## 3 — Granularity (C58 §1.11)

- **TUC mechanism:** the `Indice di edificabilità Territoriale` (0.35 mq/mq base) is a **citywide** figure applied at the **parcel** level via the lotto funzionale construct. It is NOT a zone-averaged figure — but the ceiling (0.70 mq/mq) is only achievable by acquiring perequated rights from elsewhere, making the effective answer parcel-and-ledger dependent.
- **ERS/agricultural carve-outs:** zone-specific rules, probably at PGT zone-designation level.
- **Perequation ledger:** the operative capacity of any given parcel within the TUC depends on transaction history — a per-transaction record, not a zone-level lookup.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: Milan parcels inside the TUC with a confirmed lotto funzionale and no perequation rights outstanding. Both numerator and denominator are unknown — the TUC engine kind must be built and the PGT zone layer must be confirmed live before either can be measured.

---

## 5 — Why Milan is the most structurally surprising of the Italian cities

Milan has walked away from zone-based indices entirely. This means:

1. **"Which DM 1444 zone applies?" is the wrong question** for most of Milan's built-up area. The operative question is: what is this parcel's lotto funzionale, what existing volume does it carry, and what perequated rights does it hold?
2. **The perequation ledger is a new data-access problem** with no equivalent in any other city studied. Whether this ledger is publicly queryable (as a GIS layer or API) determines whether Milan can be computed at all, or whether every answer requires a case-by-case administrative lookup.
3. **ERS and agricultural carve-outs require a secondary classification step** — similar to the B-Plan/§34 split in Germany, but expressed through PGT zone type (TUC vs ERS vs agricultural) rather than plan-existence.
4. **Data access:** Milan and Lombardy are comparatively well served on geometry — Lombardy's Geoportale hosts the PGT archive for every Lombard comune, and `pgt.comune.milano.it` publishes both the NTA text and the plan's tavole. The numeric rules are in the NTA text (accessible); the perequation ledger is the unknown.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Lombardy Geoportale PGT WFS parcel-query:** whether a WFS query by parcel centroid or bbox against the Lombardy Geoportale returns the Piano delle Regole zone polygon (with zone type and applicable NTA article reference) is not confirmed. If it does, Milan zone identification becomes an API call; if not, zone lookup requires navigating the PGT tavole.
- **Perequation ledger public access:** which parcels in the TUC have already transacted perequated rights (and for how much volume) is the operationally critical unknown for Milan. Whether this ledger is exposed as queryable data — by Milan's SIT, by the PGT portal, or by a commercial aggregator — needs its own dedicated sourcing check.
- **Regolamento Edilizio-Tipo (RET) — setback multipliers:** Lombardy's RET governs setbacks in the RET regime; field names, multipliers, and minimum absolute distances have not been read.
- **SITAP/Vincoli in Rete coverage for Milan:** Milan contains numerous listed buildings (Duomo zone, historic Liberty buildings, etc.). SITAP coverage density for Milan's centro storico specifically needs checking, given SITAP's documented incompleteness.
- **Post-2019 PGT consolidation status:** the current PGT with the 0.35/0.70 mq/mq TUC regime was the reform triggered by the 2019 plan variant. Whether further variants or amendments have been adopted since 2019 (and whether NTA text on `pgt.comune.milano.it` is the current consolidated version) must be confirmed before any rule is cited.

---

**Related files:** `../../README.md` (country umbrella) · `../../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §B.1` (full Milan analysis) · `sources/SOURCES.md` · `NEXT.md` · `RATE.md`
