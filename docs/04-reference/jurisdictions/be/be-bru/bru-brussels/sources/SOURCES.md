# Brussels-Capital Region (`bru-brussels`) — per-field sources

**Status:** OPEN — no pack values verified. PRAS endpoint confirmed via cache; RRU Titre I formula confirmed from secondary sources; no numeric rule value verified from primary source for any Brussels parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack.

## A — VERIFIED (research-cited; none live-probed from primary source)

| Field (pack key) | Value | Unit | Governing article | Document | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| PRAS zoning layer | `PERSPECTIVE_FR:Affectations` | — | CoBAT; PRAS (Plan Régional d'Affectation du Sol) | PRAS layer confirmed via wfs.michelstuyts.be aggregator cache | `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` | `corroborated` — NOT live-probed; bot-blocked origin |
| RRU Titre I height formula | H = P + 3.00 + D (H: max height; P: rue width; D: parcel depth) | metres | RRU Titre I Art. 4 | "Règlement Régional d'Urbanisme Titre I" — arrêté 3 June 1999, re-adopted 21 November 2006 | `urban.brussels` | `corroborated` — formula confirmed from secondary sources; full canonical Art. 4 text not independently read in this pass |
| RRU scope (default, not override) | RRU applies where PPAS/RRUZ/PAD do not provide otherwise | — | CoBAT; RRU Art. 1 | RRU Titre I, Art. 1 | `urban.brussels` | `published` |
| Instrument precedence | PAD > RRUZ > PPAS > RRU Titre I | — | CoBAT + case law | CoBAT; Conseil d'État case law | `urban.brussels` / `raadvst-consetat.be` | `published` (CoBAT) + `corroborated` (case law) |
| CoBAT | Arrêté 9 April 2004; reformed by ordonnance 30 November 2017 | — | CoBAT | CoBAT consolidated text | `urban.brussels` | `published` |

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| PRAS zone type for any specific Brussels parcel | Endpoint bot-blocked; GetFeature not run | Live GetFeature from Belgian-IP against `PERSPECTIVE_FR:Affectations` layer |
| RRU Titre I Art. 4 canonical text (full article) | Secondary-source confirmation only | Read `urban.brussels` RRU Titre I PDF; transcribe Art. 4 Hauteur verbatim |
| Rue width (P) for any Brussels parcel | UrbIS road-width attribute not confirmed | GetCapabilities + GetFeature on UrbIS road layer; check for `width`/`largeur_rue` attribute |
| PPAS/RRUZ/PAD coverage (what fraction of Brussels parcels?) | Not measured | Grid-sample probe across Brussels communes: query PPAS layer (if accessible) for hits vs. RRU-default |
| Brussels LiDAR/building height source | Not identified | Check `bruxelles-environnement.be` and `irisnet.be` for standing LiDAR product |
| CBS+ regulatory status (enacted or draft?) | RRU reform in progress | Read current Brussels RRU reform ordonnance/arrêté texts for CBS+ enactment status |
| Any height value for any Brussels parcel | No primary source read | Run full instrument-priority check for a test parcel; read applicable RRU/PPAS/RRUZ text |
