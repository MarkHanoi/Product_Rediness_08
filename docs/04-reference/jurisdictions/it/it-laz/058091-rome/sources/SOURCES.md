# Rome (058091) — per-field sources

**Status:** OPEN — research-level corroborations only; no value verified by live probe or primary-text read.

---

## A — VERIFIED (research-level; requires live probe or primary-text read before pack use)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| `parcel.geometry` | Catasto WFS — `cp:CadastralParcel` | polygon | — | Agenzia delle Entrate Catasto | `wfs.cartografia.agenziaentrate.gov.it` | `corroborated` — research-level; not live-probed |
| `prg.mechanism` | Tessuto fabric-typology classification inside four sistemi (Città Storica, Consolidata, da Ristrutturare, della Trasformazione) — NOT DM 1444 zone letters | — | PRG 2008 NTA — sistema classification article (exact Art. TBD) | PRG Roma Capitale, adopted 2008, consolidated text (amendments TBD) | `comune.roma.it/urbanistica` | `corroborated` — mechanism confirmed in research; NTA primary text not read |
| `citta.consolidata.typology` | T1 (early-20th-c. expansion, defined typology, medium density) · T2 (defined typology, high density) · T3 (free building typology) | — | PRG NTA — Città Consolidata articles (exact Art. TBD) | PRG Roma Capitale 2008 NTA | `comune.roma.it/urbanistica` | `corroborated` — typology names confirmed in research; numeric parameters not read |
| `intervention.mode` | Direct (Città Storica outside valorizzazione ambiti; Città Consolidata general) vs Indirect (valorizzazione ambiti; recovery-programme areas; Città da Ristrutturare; Città della Trasformazione) | — | PRG NTA — intervention-mode classification articles (exact Art. TBD) | PRG Roma Capitale 2008 NTA | `comune.roma.it/urbanistica` | `corroborated` — structure confirmed in research; NTA articles not read |
| `carta.qualita.precedence` | Recent amendments criticized for establishing tessuto rules prevail over Carta per la Qualità in case of conflict — direction contested; **must be confirmed against current consolidated NTA** | — | PRG NTA — Carta per la Qualità precedence article (TBD) | PRG Roma Capitale 2008 NTA (consolidated with amendments) | `comune.roma.it/urbanistica` | `corroborated (contested)` — precedence direction confirmed only at research level; may be reversed by amendment; NTA primary text required |
| `national.distance.floor` | 10 m | minimum between facing buildings (with windows) | DM 1444/1968 Art. 9 | DM 2 aprile 1968 n. 1444 | `normattiva.it` | `published` — national floor; Lazio/Rome derogation status under DPR 380/2001 Art. 2-bis unresearched |
| `national.setback.floor` | 3 m | minimum from boundary | Codice Civile Art. 873 | R.D. 16 marzo 1942 n. 262 | `normattiva.it` | `published` — national floor only |
| `heritage.landscape` | SITAP — landscape constraints | polygon overlay | D.Lgs. 42/2004 Artt. 136/157/142(1)(m) | Codice Beni Culturali 2004 | `sitap.beniculturali.it` | `corroborated` — informational only; acknowledged incomplete. Rome has very high heritage density (centro storico, Forum, archaeological areas). |
| `heritage.cultural` | Vincoli in Rete — listed buildings + archaeology | polygon overlay | D.Lgs. 42/2004 Parts II-III | Codice Beni Culturali 2004 | `vincoliinrete.beniculturali.it` | `corroborated` — informational only. Rome: high density of listed assets. |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| `prg.nta.primary.text` — any article number | PRG NTA not read as primary source | Download consolidated NTA from `comune.roma.it/urbanistica` → PRG → NTA |
| `citta.storica.numeric.rules` — height, coverage, setback per tessuto | NTA primary text not read | PRG NTA Città Storica articles per tessuto type |
| `citta.consolidata.t1.t2.t3.numeric.rules` | NTA primary text not read | PRG NTA Città Consolidata T1/T2/T3 articles |
| `carta.qualita.precedence.direction` | Contested; current consolidated NTA not read | PRG NTA Carta per la Qualità precedence article — confirmed against current consolidated text |
| `intervention.mode.classifier` | NTA articles governing direct vs indirect classification not read | PRG NTA — sistema × sub-type matrix for direct/indirect |
| `prg.tessuto.wfs.endpoint` | Roma Capitale SIT WFS queryability not confirmed | Probe `sit.comune.roma.it` and `geoportale.regione.lazio.it` |
| `carta.qualita.gis.layer` | Machine-readability as GIS layer unconfirmed | Probe Roma Capitale SIT for "Carta per la Qualità" WFS layer |
| `building.height.lazio` | No Lazio-wide building-height layer found | `geoportale.regione.lazio.it` WFS capabilities or `dati.lazio.it` CKAN search |

---

⚠ **Carta per la Qualità precedence must be confirmed before any Città Consolidata rule is shipped.**
The direction of precedence (tessuto rules prevail vs Carta prevails) determines the operative rule
for any parcel with a Carta element — the wrong direction produces a confident but legally wrong
answer. Verify against the current consolidated PRG NTA before citing any value for a parcel in
scope of the Carta.

⚠ **Indirect-intervention parcels (Città da Ristrutturare, Città della Trasformazione, valorizzazione
ambiti) must be returned as explicit reasoned refusals**, not as gaps. The correct product output
is: "This parcel falls under the indirect-intervention regime of Rome's PRG 2008. No numeric
building envelope is defined — development requires a further approved executive planning instrument
(piano attuativo or programma urbanistico). Consult Roma Capitale Dipartimento di Urbanistica."

⚠ **DM 1444 zone letters must NOT be presented as operative for Rome.** The PRG 2008 tessuto
typology has superseded the DM 1444 zone-letter classification for operative purposes.
