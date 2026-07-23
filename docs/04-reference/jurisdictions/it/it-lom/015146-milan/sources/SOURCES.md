# Milan (015146) — per-field sources

**Status:** OPEN — research-level corroborations only; no value verified by live probe or primary-text read.

---

## A — VERIFIED (research-level; requires live probe or primary-text read before pack use)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `parcel.geometry` | Catasto WFS — `cp:CadastralParcel` | polygon | — | Agenzia delle Entrate Catasto cartografico | `wfs.cartografia.agenziaentrate.gov.it` | `corroborated` — research-level; not live-probed |
| `tuc.index.base` | 0.35 | mq/mq (Indice di edificabilità Territoriale) | PGT Piano delle Regole, NTA — TUC article (exact Art. TBD) | PGT Milano — Piano delle Regole NTA (post-2019 reform, consolidated text) | `pgt.comune.milano.it` | `corroborated` — value confirmed in research; primary-text article number not yet read |
| `tuc.index.ceiling` | 0.70 | mq/mq (achievable via perequated rights + bonuses + social-housing quota) | PGT Piano delle Regole, NTA — perequation mechanism article (exact Art. TBD) | PGT Milano — Piano delle Regole NTA | `pgt.comune.milano.it` | `corroborated` — value confirmed in research; operative for any given parcel requires ledger check |
| `tuc.index.mechanism` | Single citywide territorial index + rights-trading overlay — NOT a per-zone table; ERS and agricultural excluded | — | L.R. Lombardia 12/2005; PGT Piano delle Regole NTA | L.R. 11 marzo 2005 n. 12 + PGT NTA | `normelombardia.consiglio.regione.lombardia.it` + `pgt.comune.milano.it` | `corroborated` — mechanism confirmed in research |
| `national.distance.floor` | 10 m | minimum between facing buildings (with windows) | DM 1444/1968 Art. 9 | DM 2 aprile 1968 n. 1444 | `normattiva.it` | `published` — national floor; regional derogation possible (DPR 380/2001 Art. 2-bis) |
| `national.setback.floor` | 3 m | minimum from boundary | Codice Civile Art. 873 | R.D. 16 marzo 1942 n. 262 | `normattiva.it` | `published` — national floor only |
| `heritage.landscape` | SITAP — landscape constraints | polygon overlay | D.Lgs. 42/2004 Artt. 136/157/142(1)(m) | Codice Beni Culturali 2004 | `sitap.beniculturali.it` | `corroborated` — informational only; acknowledged incomplete |
| `heritage.cultural` | Vincoli in Rete — listed buildings and archaeology | polygon overlay | D.Lgs. 42/2004 Parts II-III | Codice Beni Culturali 2004 | `vincoliinrete.beniculturali.it` | `corroborated` — informational only |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| `tuc.index.base` (primary-source article) | Value confirmed at research level; exact article number and consolidated text not read | PGT Piano delle Regole NTA primary text from `pgt.comune.milano.it` |
| `tuc.index.ceiling` (primary-source article) | Same | Same |
| `perequation.ledger` | Not confirmed as publicly queryable GIS data | Check `sit.comune.milano.it` and `pgt.comune.milano.it` for perequazione/diritti edificatori dataset |
| `ers.zone.rules` | ERS exclusion from TUC confirmed; specific ERS zone numeric rules not read | PGT Piano delle Regole NTA — ERS articles |
| `agricultural.zone.rules` | Agricultural exclusion from TUC confirmed; specific rules not read | PGT Piano delle Regole NTA — agricultural zone articles |
| `setback.ret.multiplier` | RET (Regolamento Edilizio-Tipo) governs setbacks in Lombardy; multiplier not read | `normelombardia.consiglio.regione.lombardia.it` → RET → distance/setback article |
| `zone.polygon` (Piano delle Regole) | Lombardy Geoportale WFS queryability not confirmed | Live probe: `geoportale.regione.lombardia.it/geoserver/wfs` GetCapabilities |
| `building.height` | Lombardy building-height GIS layer not confirmed | Live probe: Lombardy Geoportale WFS for "edifici 3d" or "altimetria" layer |

---

⚠ **TUC ceiling values (0.70 mq/mq) must never be shipped as `published` without a perequation
ledger lookup.** The ceiling is only achievable through accumulated perequated rights — stating
0.70 mq/mq as the operative capacity of any specific Milan TUC parcel without ledger confirmation
is factually incorrect for most parcels. The correct answer is: "base index 0.35 mq/mq confirmed;
ceiling 0.70 mq/mq achievable subject to perequation ledger — ledger not publicly queryable."

⚠ **DM 1444 zone letters do NOT apply to Milan TUC parcels.** Any value derived from the DM 1444
zone-letter table for a Milan TUC parcel is the wrong answer, not an approximation.
