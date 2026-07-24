# Bergen (`4601`) — Jurisdiction Pack

**Country:** `no` · **Fylke:** Vestland · **ISO 3166-2:** `NO-46` · **Kommunenummer:** `4601` ·
**Pack id:** `no-4601-bergen` ·
**Governing instrument:** Reguleringsplan (detaljregulering/områderegulering) per pbl. kap. 12; kommuneplan arealdel per pbl. kap. 11; pbl. § 29-4 numeric default where no plan governs ·
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — national mechanism confirmed applicable; Bergen-specific planregister WFS endpoint not yet located; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → Bergen planregister (not yet located) → reguleringsplan/kommuneplan → SOSI Plan arealformål + hensynssone → reguleringsbestemmelser text → numeric value (%-BYA / BRA / mønehøyde / gesimshøyde)`. Where no plan governs: `parcel → pbl. § 29-4 → national numeric default`.
- **Rule KIND (ADR-0270 / C58 §2.2):** same as Trondheim and Oslo — `coverage-and-far` (%-BYA or %-BRA) for plan-governed parcels; `setback` for § 29-4 parcels.
- **Setback-governed vs alignment-governed:** expected to follow the same SOSI Plan national model as Trondheim and Oslo. Confirm from Bergen's reguleringsplan bestemmelser once the WFS endpoint is located.
- **Legal-structure trap watch (P1):** no Bergen-specific legal mechanism deviation has been identified in this pass. Bergen is assumed to be a straightforward application of the national SOSI Plan model — the same assumption made for Trondheim and confirmed there. **Bergen-specific overlay:** Bergen's own verneverdig-building list (equivalent to Oslo's Gul liste) is referenced in heritage guidance but its format and access method are not confirmed.

### Bergen's structural profile

**Bergen operates under the same national mechanism as Trondheim and Oslo.** The engineering cost of Bergen integration is expected to be near-identical to Trondheim's once the WFS endpoint is confirmed, because:
- The SOSI Plan schema is identical — the Trondheim WFS reader reuses directly
- The arealformål, hensynssone, and planstatus code lists are national
- The reguleringsbestemmelser structure (prose text, same format) is expected to be the same
- The § 29-4 fallback is the same national statute

**The only open question for Bergen is the endpoint URL.** This is a 10-minute search, not a mechanism-design problem.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Bergen planregister WFS endpoint** | **NOT LOCATED** — primary blocker | Search Geonorge kartkatalog and Bergen open-data portal |
| **Regime classifier (plan-governed / § 29-4)** | NOT STARTED | Bergen planregister WFS endpoint confirmed |
| **Plan boundary + arealformål ingestion** | NOT STARTED | WFS GetFeature confirms attributes match SOSI Plan schema (same reader as Trondheim) |
| **§ 29-4 fallback pack** | NOT STARTED | § 29-4 confirmed applicable (national); authoring straightforward once regime classifier runs |
| **Heritage overlay — hensynssone H570** | NATIONAL MECHANISM CONFIRMED | Bergen uses H570 hensynssone; geometry comes from Bergen's planregister (endpoint TBD) |
| **Heritage overlay — Bergen verneverdig list** | NOT STARTED — existence referenced, format/access not confirmed | Bergen Byantikvar office or guidance-page-linked sources |
| **Context data (NDH terrain)** | RESEARCH COMPLETE — national endpoint confirmed | NDH tile fetch probe passes |
| **Context data (FKB-Bygning footprints)** | NOT STARTED — licence gate unresolved | Norge digitalt agreement or reseller purchase confirmed |

Refusal vocabulary in use: `regime-undetermined` (parcel not yet classified) · `coverage-gap` (plan exists but numeric value not in structured form) · `endpoint-not-located` (Bergen planregister WFS not yet found).

---

## 3 — Granularity (C58 §1.11)

%-BYA and %-BRA are set per reguleringsplan zone designation (felt/sone polygon) — same granularity as Trondheim and Oslo. Never present a zone-level figure as a parcel-level figure.

§ 29-4 setback is a parcel-level calculation (same formula: max(½H, 4 m) from neighbour boundary).

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** The primary denominator question — how many Bergen parcels are covered by a reguleringsplan with a machine-accessible bestemmelser — cannot be computed until the planregister WFS endpoint is located and probed.

---

## 5 — Height mechanism

Expected to follow the same three-expression format as Trondheim and Oslo (mønehøyde / gesimshøyde / kotehøyde), within the same national SOSI Plan framework.

§ 29-4 fallback (national, same for Bergen as for all Norwegian cities):
- gesimshøyde ≤ 8 m and mønehøyde ≤ 9 m: permissible without a plan
- setback = max(½ building height, 4 m) from neighbour boundary
- Source: pbl. § 29-4, Rundskriv H-8/15 — shippable at `published` confidence

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Bergen planregister WFS endpoint:** the single most important confirmation for Bergen. Search `https://kartkatalog.geonorge.no/?text=planregister+bergen+kommune` and Bergen's own open-data portal (`open.bergen.kommune.no` or `bergen.kommune.no/geodata`). Once found, the Trondheim WFS reader adapts with only a URL change.
- **Bergen verneverdig-building list:** Bergen's own municipal heritage list (equivalent to Oslo's Gul liste) is referenced in Bergen kommune's heritage guidance page but its data format (list, GIS layer, PDF) and access method have not been confirmed. Check Bergen Byantikvar's own pages.
- **Bergen-specific kommunedelplaner:** Bergen may have kommunedelplaner for specific areas (Sentrum, Fana, Ytrebygda, etc.) with their own bestemmelser layered on top of the main kommuneplan arealdel. Confirm whether the planregister WFS (once located) includes all plan layers or only the primary reguleringsplan layer.
- **Bergen Planinnsyn equivalent:** Bergen may operate a similar click-viewer to Oslo's Planinnsyn. If so, confirm whether a standalone WFS also exists, or whether the viewer is the only access point.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (national blockers + resume) ·
`../../findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md §B.2` (full Bergen analysis) ·
`sources/SOURCES.md` · `NEXT.md` · `RATE.md`
