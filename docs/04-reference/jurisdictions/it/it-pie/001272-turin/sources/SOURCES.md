# Turin (001272) — per-field sources

**Status:** OPEN — research-level corroborations only; no value verified by live probe or primary-text read. The Tier 1 zone-letter assumption is UNCONFIRMED.

---

## A — VERIFIED (research-level; requires live probe or primary-text read before pack use)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `parcel.geometry` | Catasto WFS — `cp:CadastralParcel` | polygon | — | Agenzia delle Entrate Catasto | `wfs.cartografia.agenziaentrate.gov.it` | `corroborated` — research-level; not live-probed |
| `prg.instrument` | PRG (Piano Regolatore Generale) — classic 1942-law instrument, Piedmont region | — | L.R. Piemonte 56/1977 (as amended) | Regione Piemonte | `normelombardia` (see Piedmont equivalent) | `corroborated` — Piedmont retaining PRG confirmed in research |
| `prg.zone.mechanism` | DM 1444 zone letters (A/B/C/D/E/F) with per-zone numeric tables — **ASSUMED; not confirmed by primary-text read** | — | Turin PRG NTA — Art. TBD | Comune di Torino PRG NTA (consolidated, date TBD) | `comune.torino.it/urbanistica` | `corroborated (ASSUMPTION — must confirm by reading NTA)` |
| `national.distance.floor` | 10 m | minimum between facing buildings (with windows) | DM 1444/1968 Art. 9 | DM 2 aprile 1968 n. 1444 | `normattiva.it` | `published` — national floor; Piedmont derogation status under DPR 380/2001 Art. 2-bis unresearched |
| `national.setback.floor` | 3 m | minimum from boundary | Codice Civile Art. 873 | R.D. 16 marzo 1942 n. 262 | `normattiva.it` | `published` — national floor only |
| `national.dm1444.zone.b.ceiling` | 5 | mc/mq (fondiario) ceiling | DM 1444/1968 Art. 7 | DM 2 aprile 1968 n. 1444 | `normattiva.it` | `published` — ceiling only; operative value in PRG NTA |
| `building.height.context` | ARPA Piemonte Edifici 3D — per-building mean elevation, region-wide | m (mean elevation above terrain) | — | ARPA Piemonte (dataset, date TBD) | `opendata.arpa.piemonte.it` → "Edifici 3D" | `corroborated` — existence and method confirmed; endpoint and field schema TBD; urban-core reliability TBD |
| `heritage.landscape` | SITAP — landscape constraints | polygon overlay | D.Lgs. 42/2004 Artt. 136/157/142(1)(m) | Codice Beni Culturali 2004 | `sitap.beniculturali.it` | `corroborated` — informational only; acknowledged incomplete. Turin: Savoy royal residences (UNESCO) in area. |
| `heritage.cultural` | Vincoli in Rete — listed buildings + archaeology | polygon overlay | D.Lgs. 42/2004 Parts II-III | Codice Beni Culturali 2004 | `vincoliinrete.beniculturali.it` | `corroborated` — informational only |
| `zone.layer` | Piedmont PRG mosaic WFS — destinazioni d'uso per zone polygon | polygon | — | Geoportale Regione Piemonte — PRG mosaicatura | `www.geoportale.piemonte.it/geoserver/wfs` | `corroborated` — existence confirmed; field schema and Turin currency not live-probed |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| **⚠ PRG NTA zone-letter mechanism** | CRITICAL — unconfirmed assumption; NTA not read | Read Torino PRG NTA from `comune.torino.it/urbanistica` → PRG → NTA — see `NEXT.md §3 B1` |
| **Any per-zone numeric parameter** (height, coverage, indice di fabbricabilità) | NTA not read; zone-letter mechanism unconfirmed | Turin PRG NTA per-zone articles |
| `zone.layer.field.name` | Piedmont mosaic WFS field schema not live-probed | Run WFS GetCapabilities + GetFeature — `NEXT.md §3 B2` |
| `zone.layer.turin.currency` | Mosaic update date for Turin-area layer not confirmed | WFS GetFeature response → inspect `data_aggiornamento` or `last_update` metadata field |
| `building.height.arpa.endpoint` | ARPA Piemonte Edifici 3D WFS/download endpoint not live-probed | `opendata.arpa.piemonte.it` → search "Edifici 3D" — `NEXT.md §3 B3` |
| `building.height.arpa.reliability` | Urban-core reliability of mean_elevation field not probed | GetFeature for Turin bbox; check per-building quality/derivation code |
| `setback.re.multiplier` | Turin RE (Regolamento Edilizio) setback articles not read | `comune.torino.it` → Regolamento Edilizio → setback/distanze article |
| `piedmont.art9.derogation` | DPR 380/2001 Art. 2-bis derogation status for Piedmont unresearched | L.R. Piemonte 56/1977 as amended — check for Art. 9 derogation provisions |

---

⚠ **The PRG NTA zone-letter mechanism is an UNCONFIRMED ASSUMPTION.** Every row in this table
marked as depending on the zone-letter mechanism must be re-evaluated after the NTA primary-text
read. If the NTA reveals a bespoke mechanism (non-DM 1444), all zone-letter-keyed values must be
deleted and replaced with the confirmed mechanism's values.

⚠ **DM 1444 Art. 7–8 ceiling values are NOT operative values for Turin.** They are national upper
bounds. The operative density/height for any Turin parcel comes from the PRG NTA per-zone article
(which has not been read). Never ship DM 1444 ceilings as parcel-level answers.

⚠ **SITAP/Vincoli in Rete must carry:** "informational only — acknowledged incomplete; null result
does not certify absence of constraint." Confidence ceiling: `corroborated`.
