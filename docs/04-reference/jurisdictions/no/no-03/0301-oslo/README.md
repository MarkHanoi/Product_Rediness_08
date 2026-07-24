# Oslo (`0301`) — Jurisdiction Pack

**Country:** `no` · **Fylke:** Oslo (city-state) · **ISO 3166-2:** `NO-03` · **Kommunenummer:** `0301` ·
**Pack id:** `no-0301-oslo` ·
**Governing instrument:** Reguleringsplan (detaljregulering/områderegulering) per pbl. kap. 12; kommuneplan arealdel (kommunedelplan) per pbl. kap. 11; pbl. § 29-4 numeric default where no plan governs ·
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — Planinnsyn viewer + grad av utnytting faktaark confirmed; standalone machine-readable WFS not yet confirmed; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → gnr/bnr → Planinnsyn (reguleringsplan/kommunedelplan/kommuneplan lookup) → SOSI Plan arealformål + hensynssone → reguleringsbestemmelser text → numeric value (%-BYA / BRA / mønehøyde / gesimshøyde)`. Separate path: `parcel → Grad av utnytting faktaark → historical-method era identification → numeric value from bestemmelser`.
- **Rule KIND (ADR-0270 / C58 §2.2):** for plan-governed parcels: `coverage-and-far` (%-BYA or %-BRA) plus height from reguleringsbestemmelser text. For § 29-4 parcels: `setback` (max(½H, 4 m)) with the numeric height threshold (gesimshøyde 8 m / mønehøyde 9 m).
- **Setback-governed vs alignment-governed:** Oslo reguleringsplaner may express setbacks as fixed byggegrense distances (alignment-governed along street edges) or height-proportional avstand. The governing instrument is the reguleringsplan bestemmelse; § 29-4 is the fallback.
- **Legal-structure trap watch (P1):** Oslo's most important structural trap is **historic grad av utnytting method switching** — Oslo PBE explicitly states that the calculation method in force when a plan was adopted governs (not today's H-2300 B rules). The pre-/post-1 July 1987 boundary is the primary named break point. Oslo's own per-parcel faktaark resolves this for the user — but any automated engine must replicate that logic.
- **No Baunutzungsplan-style legacy layer identified:** Oslo does not appear to have a Berlin-equivalent pre-BauGB legacy plan layer. Confirm via PBE's own plan-type list, but this is not expected.

### Oslo's distinctive advantage

Oslo is the **richest Norwegian city for automated plan resolution**:
- **Per-parcel "Grad av utnytting" faktaark** — Oslo PBE already publishes a fact sheet per parcel that identifies which historical calculation-method era applies, resolving the H-2300 B historical-methods problem for you. No other studied city has this.
- **Nightly plan-layer updates** — reguleringsplan and områderegulering layers update nightly; kommuneplan updates on change.
- **Planinnsyn** resolves gnr/bnr → all overlapping plan layers + bestemmelser text in one click-viewer interaction.

**The key open question:** whether all of this is also exposed as a machine-readable WFS or only as a click-viewer. If a WFS exists, Oslo is the cheapest Norwegian city to integrate for structured data. If only the click-viewer exists, budget an automation/scraping layer instead.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Machine-readable planregister WFS** | **UNCONFIRMED** — this is the primary blocker | Check `data.oslo.kommune.no` and Geonorge kartkatalog for an Oslo planregister WFS entry |
| **Regime classifier (plan-governed / § 29-4)** | NOT STARTED | Oslo planregister WFS probe passes |
| **Historic grad av utnytting era identification** | RESEARCH COMPLETE (method known via faktaark) | Engine logic must replicate pre-/post-1987 method selection; faktaark confirms the logic |
| **Gul liste (local heritage overlay)** | NOT STARTED | Format/access not confirmed for the Gul liste dataset |
| **§ 29-4 fallback pack** | NOT STARTED | § 29-4 confirmed applicable; authoring straightforward once regime classifier is built |
| **Context data (NDH terrain)** | RESEARCH COMPLETE — national endpoint confirmed | NDH tile fetch probe passes |
| **Context data (FKB-Bygning footprints)** | NOT STARTED — licence gate unresolved | Norge digitalt agreement or reseller purchase confirmed |
| **PBE priced product boundary** | PARTIALLY CONFIRMED | Existence of priced ordering confirmed (Jan 2026 price list); free vs. priced boundary not fully read |

Refusal vocabulary in use: `regime-undetermined` (parcel not yet classified) · `coverage-gap` (plan exists but numeric value not in structured form) · `viewer-only` (plan data confirmed to exist but only exposed via click-viewer, not WFS).

---

## 3 — Granularity (C58 §1.11)

%-BYA and %-BRA are set per reguleringsplan zone designation (felt/sone polygon). Height is per zone designation, expressed as mønehøyde, gesimshøyde, or kotehøyde (absolute NN2000 elevation).

For the Oslo faktaark path: the faktaark is **per parcel** (resolved by gnr/bnr) — it is the only per-parcel resolution mechanism confirmed in this pass. All other data (plan boundaries, arealformål, bestemmelser) is per plan zone, not per parcel.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: any Oslo parcel covered by a reguleringsplan with %-BYA/BRA and height readable from a structured source. **This denominator is itself unknown** until (a) the WFS status is confirmed, and (b) a regime classifier runs.

The Oslo faktaark path could raise structured access significantly if automated — the faktaark already delivers the historical-method identification that would otherwise require a full plan read. This is Oslo's key structural advantage over the other two cities.

---

## 5 — Height mechanism

Oslo reguleringsplaner express maximum height as mønehøyde, gesimshøyde, or kotehøyde (same three expressions as Trondheim). Historical calculation-method switching is the Oslo-specific complication:

| Era | Calculation method | Source |
|---|---|---|
| Plans adopted before 1 July 1987 | Historical methods per the appendix of H-2300 B veileder | H-2300 B historical-methods appendix; Oslo faktaark |
| Plans adopted from 1 July 1987 onward | Current H-2300 B methods (BYA/%-BYA/BRA/%-BRA/MUA) | TEK17 §§5-1–5-7; H-2300 B |

The **Oslo "Grad av utnytting" faktaark** resolves which era applies per parcel — this is the only confirmed automated per-parcel historical-method resolution tool found across the three studied cities.

### § 29-4 fallback height (same as national)

Where no reguleringsplan governs:
- gesimshøyde ≤ 8 m and mønehøyde ≤ 9 m: permissible without a plan
- setback = max(½ building height, 4 m) from neighbour boundary
- Source: pbl. § 29-4, Rundskriv H-8/15 — shippable at `published` confidence

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Oslo planregister WFS endpoint:** the single highest-priority confirmation for Oslo. If a WFS exists behind Planinnsyn (or as a separate open dataset on `data.oslo.kommune.no`), Oslo is likely the richest and cheapest city to integrate. If no WFS exists, budget an automation/scraping layer against the Planinnsyn click-viewer instead.
- **Oslo Gul liste data format and access:** existence of Oslo's municipal verneverdig-building list ("Gul liste") is confirmed via Byantikvaren i Oslo references. Whether it is published as a GIS layer, a downloadable list, or a PDF is not confirmed. Check `byantikvaren.oslo.kommune.no` for a machine-readable dataset.
- **PBE gebyrforskrift — free vs. priced boundary:** the interactive Planinnsyn viewer and the grad-av-utnytting faktaark are confirmed as free/open. PBE also runs a priced ordering service (Regulerings- og eiendomsbekreftelse, byggesakskart etc., new price list from 1 January 2026). The full scope of the priced product line has not been read — confirm before automating any PBE data pull.
- **Oslo faktaark automation feasibility:** the faktaark is confirmed as a published web page (`od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html`). Whether it is rendered dynamically per gnr/bnr (i.e. a per-parcel API) or is a static explanatory page needs to be confirmed.
- **Oslo kommunedelplaner:** Oslo has multiple kommunedelplaner covering specific areas (e.g. Oslo sentrum, Alna, Marka boundary). Whether these are all exposed through Planinnsyn and/or a WFS with the same access terms needs confirmation before assuming full coverage.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (national blockers + resume) ·
`../../findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md §B.1` (full Oslo analysis) ·
`sources/SOURCES.md` · `NEXT.md` · `RATE.md`
