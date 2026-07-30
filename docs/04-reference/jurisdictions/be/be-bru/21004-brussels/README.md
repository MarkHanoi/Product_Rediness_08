# Brussels (`21004`) — Jurisdiction Pack

**Country:** `be` · **Region:** Brussels-Capital (`be-bru`, ISO 3166-2 BE-BRU) · **NIS:** `21004`
(City of Brussels — representative core commune; the bake bbox spans all 19 communes of the region) ·
**Governing code:** CoBAT · **Governing plans:** PRAS (land-use) + RRU (regional building regulation) ·
**Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

---

## Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Context data (OSM bake)** | ✅ LIVE — `bake.mjs` REGIONS `brussels` | baked `buildings/roads/water/parks/landuse` at the bbox |
| **Parcel (federal cadastre)** | RESEARCH COMPLETE — CADMAP WFS verified-live, NOT wired | `isInBelgium` predicate + CADMAP provider in `parcelProviders/registry.ts` |
| **Zoning identification (PRAS)** | RESEARCH COMPLETE — endpoint bot-blocked, cache-confirmed | Belgian-IP live probe → PRAS affectation for a Brussels parcel |
| **Building height** | BLOCKED — no wired source | UrbIS height attribute probed OR federal CADMAP height attribute confirmed |
| **Terrain (DTM)** | BLOCKED — no Brussels-Capital route located | Bruxelles-Environnement / CIRB DTM service + licence pinned |
| **Rule pack — RRU Titre I** | NOT STARTED | reference-formula gabarit KIND ratified |
| **Overlay: PPAS / RRUZ / PAD precedence** | NOT STARTED | instrument-priority resolver built |
| **Overlay: heritage (urban.brussels)** | NOT STARTED — live GIS layer unconfirmed | queryable heritage layer confirmed |
| **Adjacent gates: CBS+, TOTEM** | NOT STARTED | ecological coefficient + demolition life-cycle gates modelled |

**Overall status: NOT STARTED (research phase complete; context bake live).**

---

## What governs here

Brussels-Capital is one of Belgium's **three constitutionally-independent** planning systems (special
laws 8 Aug 1980 + 12 Jan 1989 — spatial planning is an exclusive regional competence). Brussels uses:

- **CoBAT** (Code Bruxellois de l'Aménagement du Territoire) — the regional planning code (arrêté
  9 Apr 2004; reformed by ordonnance 30 Nov 2017).
- **PRAS** (Plan Régional d'Affectation du Sol) — the region-wide land-use/affectation plan.
- **RRU** (Règlement Régional d'Urbanisme, 7 Titres) — the region-wide building regulation; **Titre I**
  ("Caractéristiques des constructions et de leurs abords") is the one **numeric-leaning gabarit baseline**
  in all of Belgium. Its rules are context-relative prose formulas (`H = P + 3.00 + D`).
- **Instrument precedence:** a locally-adopted **PPAS**, **RRUZ**, or **PAD** overrides RRU Titre I for
  specific districts — a precedence check is mandatory before any RRU rule is applied.
- **The discretionary test:** *bon aménagement des lieux* (CoBAT/RRU practice) is layered on top of every
  permit — a sourced numeric value is subordinate to it. This is the single largest structural caveat.

Full mechanism analysis: `../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §A + §B.1`.

## Zone / plan taxonomy

Brussels uses PRAS affectation categories (habitation, mixte, industrie, équipement, espace vert, etc.)
for land use, with the RRU Titre I gabarit rules layered on top and district plans (PPAS/RRUZ/PAD) as
overrides. Unlike Barcelona's single-text machinery, the operative rule for a given parcel is the result
of a **precedence chain**, not a single zone lookup.

## Source hierarchy

| Data needed | Source | Confidence |
|---|---|---|
| Parcel geometry | federal CADMAP/CadGIS WFS (AGDP/SPF Finances) | `verified-live` (2026-07-24) — not yet an app provider |
| Land-use affectation | PRAS `gis.urban.brussels/geoserver/PERSPECTIVE_FR:Affectations` | `cache-confirmed` (bot-blocked direct) |
| Gabarit / height / setback | RRU Titre I règlement PDF | NOT YET read verbatim |
| Building geometry / height | UrbIS (`geoservices-urbis.irisnet.be`) — height attribute unprobed; or federal CADMAP building sublayer | `unconfirmed` |
| Terrain (DTM) | none located for Brussels-Capital | `blocked` |
| Context buildings/roads/water/parks | `bake.mjs` REGIONS `brussels` (OSM, `belgium-latest.osm.pbf`) | `live` |

## Access blocker

`gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` is **bot-blocked from non-Belgian IPs**. A Belgian-IP
(or EU-based) deployment is the prerequisite for all Brussels live-probe pack work.

## Open questions

1. Does the **federal CADMAP building sublayer** ("buildings managed by AGDP") carry a height/storey
   attribute? One `GetFeature` on the already-verified federal WFS resolves it — the highest-value BE probe.
2. Does the **UrbIS** building layer expose a height field, and is there a standing Brussels LiDAR programme?
3. Which **RRU Titre I** articles hold the gabarit/implantation formulas verbatim, and how does the
   PPAS/RRUZ/PAD precedence resolve for a target parcel?

---

**Related files:** `../../README.md` (country umbrella) · `../../RATE.md` (national legislation ~10–14 %) ·
`../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §B.1` (full Brussels analysis) · `RATE.md` (composite
scorecard) · `NEXT.md` · `sources/SOURCES.md`.
