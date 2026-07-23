# Munich / München (`09162`) — Jurisdiction Pack

**Country:** `de` · **Land:** Bayern (Bavaria) · **ISO 3166-2:** `DE-BY` · **AGS:** `09162000` ·
**Pack id:** `de-09162-munich` ·
**Governing instrument:** Bebauungsplan (B-Plan) per BauGB §30 for most parcels; §34 fraction unmeasured ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → B-Plan (Satzung) → BauNVO zone type → BauGB §30 / §34`.
- **Rule KIND (ADR-0270 / C58 §2.2):** for §30 B-Plan parcels: `coverage-and-far` (GRZ/GFZ + B-Plan height limit). For §34 parcels: `refusal` (no numeric kind applicable).
- **Setback-governed vs alignment-governed:** Munich B-Plans use BayBO (Bayerische Bauordnung) Abstandsflächen; typically height-proportional (1H in most Bavarian zones; 0.4H minimum applies in dense urban areas under BayBO Art. 6 Abs. 5). Confirm per B-Plan before assuming.
- **Legal-structure trap watch (P1):** Munich's key trap is **DiPlanung timing** — Bavaria's mandatory XPlanung delivery platform goes live 31 October 2026. Building against the interim platform now creates a migration risk. No Baunutzungsplan-equivalent legacy layer has been identified, but this is **not confirmed absent** — it is unconfirmed for Munich.

### ⚠ Critical scheduling risk: DiPlanung (Bavaria, 31 October 2026)

Munich B-Plan data is currently delivered via Bavaria's existing XPlanung services and Munich's own geoportal. From **31 October 2026**, DiPlanung becomes the mandatory statewide XPlanung delivery platform for Bavaria. A Munich integration built before that date targets an interim system. Options:
1. **Start after October 2026** — target DiPlanung directly; no migration risk.
2. **Start now, plan for migration** — build an abstraction layer over the XPlanung WFS endpoint; migrating to DiPlanung becomes a URL/auth config change, not a code rewrite.
3. **Start with §34 measurement first** — if §34 fraction is large, the cost case for Munich weakens regardless of platform.

Confirm the §34 fraction and the DiPlanung endpoint availability before committing a dev-day budget.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **§34 coverage fraction** | UNMEASURED — assumed small, not confirmed | Grid-sample probe over Munich bbox |
| **Regime classifier (§30/§34)** | NOT STARTED | §34 fraction measured; XPlanGML probe passes |
| **Context data (LOD2)** | RESEARCH COMPLETE — ZSHH hosts LoD2-DE; Bavarian licence terms not confirmed | Live LoD2 probe → CityGML with height non-null |
| **Rule pack — B-Plan zones (§30 path)** | NOT STARTED | XPlanGML structured field confirmed non-null; ADR ratified; §34 fraction measured |
| **Rule pack — §34 refusal** | NOT STARTED | §34 refusal vocabulary in place |
| **DiPlanung transition** | MONITORING — mandatory 31 Oct 2026 | — |

---

## 3 — Granularity (C58 §1.11)

Same as Hamburg: GRZ/GFZ/height are per **B-Plan zone designation** (Baufläche), not per individual parcel. Abstandsflächen are parcel-level calculations.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator depends on the §34 fraction measurement — currently unknown.

---

## 5 — Height mechanism

Munich B-Plans follow the same XPlanGML schema as Hamburg:

| Attribute | Meaning |
|---|---|
| `hoeheMN` | Maximum building height above NHN |
| `hoeheBezugspunkt` | Reference datum + height above it |
| `GeschosseMax` | Maximum number of Vollgeschosse |

**Bavaria-specific:** BayBO Art. 6 governs Abstandsflächen. Bavaria historically had a 1H multiplier (setback = 1 × height); this was reduced to 0.4H in certain configurations. Read BayBO Art. 6 primary text before authoring any Munich pack. The exact current rule is a pre-pack sourcing task.

### Munich-specific urban form (implementation context)

Munich has a ring-and-radial structure with the Altstadt/Innenstadt at the centre. Zone distribution is expected to include:
- `WA` (Allgemeines Wohngebiet) — dominant residential fabric, outer rings
- `MK` (Kerngebiet) / `MI` (Mischgebiet) — city centre and mixed-use corridors
- `GE` (Gewerbegebiet) — industrial/commercial zones, fringe
- §34 — likely concentrated in some inner-city historical blocks and scattered outer areas

**This distribution is not measured.** The grid-sample probe (NEXT.md §3.B1) will determine the actual zone distribution.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **§34 coverage fraction:** the single most important pre-implementation question for Munich. Assumed smaller than Berlin (continuously West German fabric) but NOT measured. A measured §34 fraction of >20% would materially change the return on Munich investment.
- **Baunutzungsplan-equivalent in Munich:** no West-Berlin-style legacy plan using pre-BauNVO codes has been identified for Munich. This is stated as "unconfirmed absent" — it has not been checked systematically. Confirm by probing whether the Munich geoportal or the Bavarian XPlanung service lists any plan type that predates BauNVO (before 1962 enactment).
- **Bavarian LoD2 licence terms:** ZSHH is hosted at the Bavarian state survey office (Bayerische Vermessungsverwaltung), which may give Bavaria preferential or open access to LoD2 tiles. However, ZSHH hosting ≠ confirmed free terms. Read the BayernAtlas or `geodaten.bayern.de` LoD2 product page before building any LOD2 pipeline.
- **DiPlanung platform endpoint:** the DiPlanung platform (mandatory from Oct 2026) will have its own WFS/API. Check `diplanung.de` for current API documentation and whether pre-launch access is available for development.
- **BayBO Art. 6 Abstandsflächen:** exact multiplier and minimum for Munich's zones not yet read from primary text.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md §B.2` (full Munich analysis) ·
`sources/SOURCES.md` · `NEXT.md`
