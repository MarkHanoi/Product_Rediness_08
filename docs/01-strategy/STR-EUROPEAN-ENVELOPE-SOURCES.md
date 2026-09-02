# STR — European Envelope Sources: consume before you compute (the founder's strategy, captured)

> **Provenance:** the founder's research directive, pasted 2026-09-02, captured same-turn.
> **Execution note:** the **European Existing Envelope Geometry Census** (§10/§end) was dispatched
> the same hour as a workflow across all 44/45 European countries. This document is the strategy
> authority; the census output lands in `audit/envelope-geometry-census/`.

**The reframe:** stop asking "find European zoning data." A much larger machine-readable stack
exists; assemble **parcel → planning context → constraints → envelope** from it, and reserve
PRYZM engineering for the last-mile synthesis.

## 1. The European baseline: INSPIRE

INSPIRE defines machine-readable themes for exactly what PRYZM needs: Cadastral Parcels ·
Buildings · Addresses · Land Use (incl. **Planned Land Use** as a formal model) · Area
Management/Restriction/Regulation Zones · Natural Risk Zones · Protected Sites · Elevation ·
Land Cover · Transport · Hydrography · Administrative Units. Do NOT mint a rival base ontology:
**INSPIRE → national source → PRYZM canonical SiteIntel**, national where richer.

## 2. Portugal (see PT-PDM-DATA-MODEL-BRIEF.md)

SNIT exposes per-instrument: written documents, graphical pieces, metadata, plan
dynamics/history, related instruments, **WMS, WFS**. The open question is coverage of the
308-municipality universe through usable structured services — a concrete measurement, not a
research question.

## 3–4. Denmark is a monster source — REPRIORITIZE

Plandata.dk exposes **structured planning models**, not just polygons:
- **Lokalplaner**: plan id/municipality/type/number/name, application, proposal/adoption/
  cancellation dates, version, geometry, status, **maximum floors, maximum building height**,
  environmental class, conservation provisions.
- **Byggefelter (building fields)**: building-field GEOMETRY linked to plan + version + status
  + dates — **explicit authoritative envelope geometry**.
- **Kommuneplaner / Kommuneplanområder / Kommuneplantillæg**: the temporal/legal graph —
  paragraph codes, legislative descriptions, validity-from/to, amendment links.
- Live WFS over HTTPS; hundreds of GeoServer layers.

`parcel → local plan → byggefelt → max floors → max height → document` is close to **direct
buildable-envelope input**. **New priority trio: Denmark → Portugal → Estonia.**

## 5. Spain beyond Catastro

Catastro serves parcels/buildings/addresses as INSPIRE WFS + municipal ATOM downloads (+ the
3D/floor channel). SIU adds national urban-land/development-sector context — **but SIU is NOT
the authoritative planning register** (its own catalogue says so): indexing/fallback layer,
never the final legal envelope authority. (The SIU rural guard shipped 2026-09-02 uses it in
exactly that role — a refusal trigger, not a value source.)

## 6. The European Spatial Constraints layer

INSPIRE's AM/Restriction/Regulation Zones + Natural Risk Zones + Protected Sites answer
"does this parcel intersect protected/flood/heritage/environmental/transport/water/risk/
land-use restrictions?" **before** any envelope math — the things that turn a simple envelope
into conditional/restricted/refused.

## 7. The acquisition layer model (data architecture, NOT the frozen schema)

```
L0 GLOBAL REFERENCE  — INSPIRE, EU vocabularies, CRS, admin boundaries
L1 CADASTRAL/PARCEL  — national cadastres, INSPIRE CP, BUPi, DAWA, Catastro…
L2 AS-IS PHYSICAL    — buildings, LoD1/2, terrain, addresses, roads
L3 PLANNING SPATIAL  — zoning, plans, building fields/lines, overlays, risk, heritage
L4 NORMATIVE         — regulations, articles, parameters, exceptions, validity
L5 PRYZM DETERMINATION — constraints, envelope, potential, evidence
```

## 8. The three envelope-information types

**A — explicit GEOMETRY** (Danish byggefelt; Madrid NZ1 ring; Paris ECM) · **B — explicit
PARAMETERS** (max height/floors/coverage as data — DK, NSW) · **C — geometry must be DERIVED**
(setbacks + street-width + planes). The engine exists primarily for C, and for composing
A ∩ B ∩ C. **Never calculate what the government already publishes as geometry** —
`BuildableEnvelope = byggefelt ∩ height ∩ coverage ∩ restrictions` eliminates enormous
computation where A exists.

## 9. The envelope source hierarchy (formalized NOW; maps onto the six-tier confidence ladder)

P1 explicit authoritative envelope geometry — USE IT · P2 authoritative machine-readable
parameters — COMPILE · P3 authoritative structured rule data — INTERPRET+COMPILE ·
P4 authoritative documents — EXTRACT with provenance · P5 deterministic inference — only
where justified · P6 AI interpretation — never legal geometry without deterministic validation.

## 10. THE CENSUS (the highest-value research before more envelope code)

**A dedicated European Existing Envelope Geometry Census — all 44/45 countries, not the six
pilots.** Output: country → authority → dataset → API/download → parcel linkage → zoning
geometry → building-field geometry → building-line geometry → height → FAR → coverage →
setbacks → validity → licence → coverage → machine-readable quality. Search-term seed:
byggefelt, Baulinie, Baugrenze, byggnadslinje, byggbar yta, emprise au sol, zone/volume
constructible, area edificabile, perimetro di edificabilità, área/polígono de implantação,
building field/line/envelope/zone, construction boundary/polygon, buildable/development area.
**The goal: discover where PRYZM can CONSUME an existing legal geometric determination rather
than reinvent it.**

## 11. Opportunity assessment

Addresses/parcels/buildings/terrain/land-use 🟢 low effort · restrictions 🟢/🟡 medium ·
planning geometry 🟢/🟡 variable · building fields / heights / coverage / FAR / setbacks 🟡
country-dependent · complex 3D planes + exceptions 🟠 high · **full legal determination 🔴 =
PRYZM's core**. The pipeline: government data (parcel + building + zoning + building field +
lines + restrictions + machine parameters + documents) ↓ PRYZM (applicability + temporal +
precedence + interpretation + geometric synthesis + conflict resolution + evidence + refusal)
↓ legal envelope. **A much smaller problem than recreating European planning from scratch —
and Denmark's byggefelt is the proof the strategy works.**
