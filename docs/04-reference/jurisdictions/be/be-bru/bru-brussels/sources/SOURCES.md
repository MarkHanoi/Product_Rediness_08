# Brussels-Capital Region (`bru-brussels`) — per-field sources

**Status:** OPEN — no pack values shipped. PRAS endpoint confirmed via cache. RRU Titre I now read from the official text (`urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` + etaamb, founder dig 2026-07-31): **Art. 4 buildable-depth rule CONFIRMED + encodable**, **Art. 3 implantation = alignment (categorical)**, **HEIGHT contextual — the `H = P + 3 + D` formula is NOT in the official text (UNCONFIRMED, do NOT encode); height is geometry-derived from UrbIS-3D CityGML**. FAR genuinely absent (`n-a`, never 0).

> **Trust gate:** a field with NO citable source stays `null` in the pack.

## A — VERIFIED (research-cited; none live-probed from primary source)

| Field (pack key) | Value | Unit | Governing article | Document | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| PRAS zoning layer | `PERSPECTIVE_FR:Affectations` | — | CoBAT; PRAS (Plan Régional d'Affectation du Sol) | PRAS layer confirmed via wfs.michelstuyts.be aggregator cache | `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` | `corroborated` — NOT live-probed; bot-blocked origin |
| RRU Titre I buildable DEPTH (Art. 4) | depthLimit = min(0.75*parcelDepth, neighbourRule()) -- <=3/4 parcel depth + neighbour rule (deeper profile; shallower +3 m unless >=3 m lateral setback) | ratio + metres | RRU Titre I Art. 4 §1(1) | "Règlement Régional d'Urbanisme Titre I" — arrêté 3 June 1999, re-adopted 21 November 2006 | `urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` | `read-verbatim` — Art. 4 depth CONFIRMED + encodable; cite the consolidated article before shipping |
| RRU Titre I implantation (Art. 3) | Front facade at the alignment / building line (categorical, NOT metres); construction on/against shared boundary | alignment | RRU Titre I Art. 3 | RRU Titre I | `urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` | `read-verbatim` — encode "alignment", not a metre value |
| RRU Titre I height | CONTEXTUAL — no per-zone table; `H = P + 3 + D` NOT located in the official text → UNCONFIRMED, do NOT encode; height geometry-derived from UrbIS-3D CityGML (maxRoofZ - minGroundZ) | metres (derived) | RRU Titre I (contextual) | UrbIS-3D CityGML | `urbanisme.irisnet.be` / UrbIS-3D | `UNCONFIRMED` (formula) + `derivable` (geometry) |
| RRU scope (default, not override) | RRU applies where PPAS/RRUZ/PAD do not provide otherwise | — | CoBAT; RRU Art. 1 | RRU Titre I, Art. 1 | `urban.brussels` | `published` |
| Instrument precedence | PAD > RRUZ > PPAS > RRU Titre I | — | CoBAT + case law | CoBAT; Conseil d'État case law | `urban.brussels` / `raadvst-consetat.be` | `published` (CoBAT) + `corroborated` (case law) |
| CoBAT | Arrêté 9 April 2004; reformed by ordonnance 30 November 2017 | — | CoBAT | CoBAT consolidated text | `urban.brussels` | `published` |

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| PRAS zone type for any specific Brussels parcel | Endpoint bot-blocked; GetFeature not run | Live GetFeature from Belgian-IP against `PERSPECTIVE_FR:Affectations` layer |
| RRU Titre I Art. 4/3 consolidated citation | Read verbatim (founder dig); consolidated article numbers to be pinned by a verifier before shipping | Confirm the current consolidated Art. 4 (depth) + Art. 3 (implantation) reference in the in-force RRU Titre I |
| RRU Titre I height (`H = P + 3 + D`) | NOT located in the official text — UNCONFIRMED | Do NOT encode. If a governing consolidated height article is ever located, record it here; otherwise height stays geometry-derived from UrbIS-3D |
| UrbIS-3D CityGML height schema | Schema/CRS/LoD unprobed (HONEST BLOCKER) | Probe the UrbIS-3D product: RoofSurface/GroundSurface Z fields, CRS, LoD (base UrbIS Buildings has NO height attribute) |
| Rue width (P) for a Brussels parcel | Geometrically computable (not attribute-blocked); NB not needed for a confirmed height rule (formula unconfirmed) | Compute from road-polygon median cross-section / façade-to-façade; optionally probe UrbIS road layer for a width attribute |
| PPAS/RRUZ/PAD coverage (what fraction of Brussels parcels?) | Not measured | Grid-sample probe across Brussels communes: query PPAS layer (if accessible) for hits vs. RRU-default |
| Brussels LiDAR/building height source | Not identified | Check `bruxelles-environnement.be` and `irisnet.be` for standing LiDAR product |
| CBS+ regulatory status (enacted or draft?) | RRU reform in progress | Read current Brussels RRU reform ordonnance/arrêté texts for CBS+ enactment status |
| Any height value for any Brussels parcel | No primary source read | Run full instrument-priority check for a test parcel; read applicable RRU/PPAS/RRUZ text |
