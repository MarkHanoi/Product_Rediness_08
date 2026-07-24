# Trondheim (`5001`) — Jurisdiction Pack

**Country:** `no` · **Fylke:** Trøndelag · **ISO 3166-2:** `NO-50` · **Kommunenummer:** `5001` ·
**Pack id:** `no-5001-trondheim` ·
**Governing instrument:** Reguleringsplan (detaljregulering/områderegulering) per pbl. kap. 12; kommuneplan arealdel per pbl. kap. 11; pbl. § 29-4 numeric default where no plan governs ·
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — planregister access confirmed open; no live GetFeature probe run; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → reguleringsplan/kommuneplan → SOSI Plan arealformål + hensynssone → reguleringsbestemmelser text → numeric value (%-BYA / BRA / mønehøyde)`. Where no plan governs: `parcel → pbl. § 29-4 → national numeric default (gesimshøyde 8 m / mønehøyde 9 m; setback max(½H, 4 m))`.
- **Rule KIND (ADR-0270 / C58 §2.2):** for plan-governed parcels: `coverage-and-far` (%-BYA or %-BRA shaping the buildable area) plus height from reguleringsbestemmelser text. For § 29-4 parcels: `tiered-occupation` (plan-required above the numeric thresholds; hard-coded below). For parcels with no plan: `setback` (height-proportional, max(½H, 4 m)).
- **Setback-governed vs alignment-governed:** Trondheim reguleringsplaner may express setbacks as either fixed byggegrense distances or height-proportional avstand per § 29-4. The governing instrument is the reguleringsplan bestemmelse; § 29-4 is the fallback. Confirm per plan which applies.
- **Legal-structure trap watch (P1):** No Baunutzungsplan-style legacy layer or Marseille-style "graphic-primacy" rule has been identified for Trondheim. Trondheim appears to be a straightforward application of the national SOSI Plan model — the single most important structural finding, and the reason Trondheim is the recommended first Norwegian city.
- **Historic grad av utnytting method switching:** confirmed as an issue nationally (Oslo PBE names the pre-/post-1 July 1987 break point); not yet checked whether older Trondheim reguleringsplaner trigger it in practice.

### Why Trondheim first among Norwegian cities

Trondheim is the **cheapest, most defensible first Norwegian city**:
- **Planregister confirmed open:** "Planregister Trondheim kommune" listed in Geonorge kartkatalog with "No conditions apply to access and use," continuously updated, ugradert, no login.
- **Shared national SOSI Plan schema:** the ingestion code built for Trondheim is directly reusable for Bergen, Oslo, and every other Norwegian kommune that publishes a compliant WFS — no re-learning per city.
- **No city-specific legal mechanism deviation identified:** unlike Berlin (Baunutzungsplan legacy layer, §34 fraction) or Marseille (graphic-primacy rule), Trondheim appears to apply the national model without special cases.
- **Reguleringsbestemmelser text access:** at least one Trondheim plan (Brannkvartalet, 2004) is confirmed to publish bestemmelser as HTML/parseable text, not only scanned PDF — marginally better NLP pipeline input than Hamburg's PDF-only pattern.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Regime classifier (plan-governed / § 29-4)** | NOT STARTED | Trondheim planregister WFS GetCapabilities + GetFeature probe passes |
| **Plan boundary ingestion** | NOT STARTED — access terms confirmed | Live WFS GetFeature confirms plan boundary geometry is returned |
| **Arealformål code ingestion** | NOT STARTED | Live GetFeature confirms arealformål attribute is non-null |
| **Bestemmelser text/NLP pipeline** | NOT STARTED | Bestemmelser URL/text format confirmed from live WFS response |
| **§ 29-4 fallback pack** | NOT STARTED | § 29-4 text confirmed as the applicable default; pack authoring straightforward |
| **Context data (NDH terrain)** | RESEARCH COMPLETE — endpoint confirmed | NDH tile fetch probe passes |
| **Context data (FKB-Bygning footprints)** | NOT STARTED — licence gate unresolved | Norge digitalt agreement or reseller purchase confirmed |
| **Overlay: hensynssone H570 (heritage)** | NOT STARTED | Trondheim planregister WFS confirmed to return hensynssone geometry |
| **Overlay: Gul liste / verneverdig** | NOT APPLICABLE — no Trondheim-specific heritage overlay identified in this pass | Confirm via Trondheim byantikvar guidance page |

Refusal vocabulary in use: `regime-undetermined` (parcel not yet classified) · `legal` (§ 29-4 applies; pack returns the numeric default, not a refusal — distinct from Germany's §34) · `coverage-gap` (plan exists but bestemmelser numeric value not in structured form).

---

## 3 — Granularity (C58 §1.11)

%-BYA and %-BRA are set **per reguleringsplan zone designation** (a polygon within the plan boundary, typically a *felt* or *sone* smaller than the whole plan area). Height (mønehøyde/gesimshøyde) is also per zone designation, expressed in metres relative to terrain or as an absolute elevation (kotehøyde relative to NN2000).

A zone designation can cover one or many parcels. **Granularity: reguleringsplan zone designation, not parcel.** Never present a zone's %-BYA as if it were measured from the specific parcel's own boundaries.

§ 29-4 setback is a parcel-level calculation (function of the building's proposed height against the parcel's own boundary distances).

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: any Trondheim parcel covered by a reguleringsplan with its %-BYA/BRA and height readable from a structured source. **This denominator is itself unknown until the live WFS probe runs** — the planregister WFS may return arealformål codes only (no numeric values), in which case the denominator for structured-path is zero regardless of plan coverage.

§ 29-4 fallback denominator: any Trondheim parcel *not* covered by a reguleringsplan bestemmelse. Fraction unknown until regime classifier runs.

---

## 5 — Height mechanism

Trondheim reguleringsplaner express maximum height in one of three ways:

| Attribute | Meaning | Notes |
|---|---|---|
| `mønehøyde` | Maximum ridge height in metres | Relative to terrain or NN2000; most common |
| `gesimshøyde` | Maximum eave height in metres | Relative to terrain or NN2000 |
| `kotehøyde` | Absolute elevation above NN2000 | Used where site slopes significantly; requires knowing terrain elevation to compute storey count |

**Which attribute is used in Trondheim reguleringsplaner: not yet probed.** Run the planregister WFS GetFeature probe (see `NEXT.md §8`) to identify which height expression is used in practice, and whether it appears as a structured WFS attribute or only in the bestemmelser text.

### § 29-4 fallback height

Where no reguleringsplan governs:
- gesimshøyde ≤ 8 m and mønehøyde ≤ 9 m: permissible without a plan
- setback = max(½ building height, 4 m) from neighbour boundary
- Source: pbl. § 29-4, Rundskriv H-8/15 — shippable at `published` confidence

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Trondheim planregister WFS GetCapabilities URL:** the Geonorge kartkatalog page UUID is confirmed; the live WFS endpoint URL embedded in the distribution/access section has not been fetched. This is the first concrete step before any code can be written.
- **Arealformål/hensynssone attribute presence in WFS response:** plan boundary is confirmed accessible; whether the WFS returns arealformål code, hensynssone code, planstatus, and/or a bestemmelser URL as attributes is not confirmed. This single probe resolves whether Trondheim is an API-ingestion path or a text-parsing path.
- **Bestemmelser text format for recent plans:** one Trondheim plan (Brannkvartalet, 2004) publishes bestemmelser as HTML/text. Newer plans may be more structured or less — check a 2015+ and a 2022+ plan to assess whether the format has improved.
- **Historic grad av utnytting method in older Trondheim plans:** whether pre-1987 Trondheim plans trigger the historical calculation-method rules (named by Oslo PBE) has not been checked. Run the same check as Oslo's faktaark methodology for any Trondheim parcel with a plan adopted before 1987.
- **Trondheim byantikvar heritage overlay:** no Trondheim-specific heritage overlay (equivalent to Oslo's Gul liste) was identified in this pass. Confirm via Trondheim kommune's own byantikvar/kulturminner guidance page.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (national blockers + resume) ·
`../../findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md §B.3` (full Trondheim analysis) ·
`sources/SOURCES.md` · `NEXT.md` · `RATE.md`
