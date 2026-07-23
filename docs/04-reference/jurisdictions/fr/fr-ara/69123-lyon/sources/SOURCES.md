# Lyon Métropole (69123) — data sources

> **Status:** NOT STARTED — no live probe run, no field values confirmed.

---

## A — VERIFIED (corroborated research leads)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel source | IGN PCI Express / API Carto | National — see `../../sources/SOURCES.md` | `apicarto.ign.fr/api/cadastre` | `corroborated` |
| Zone code identification | GPU API — returns PLU-H zone code | PLU-H Métropole de Lyon, in force June 2019 | `apicarto.ign.fr/api/gpu` | `corroborated` |
| PLU-H scope | 58 communes of Métropole de Lyon (SIREN 200046977) | PLU-H délibération June 2019 | GPU document link | `corroborated` |
| Height mechanism (outer 56 communes) | Structured GIS attribute `HBCPRINC`/`HBCSEC`/`PLAFOND` on zoning polygon | PLU-H règlement + GIS product (source unconfirmed — national GPU WFS vs. data.grandlyon.com) | **UNRESOLVED** | `stated` — single research source; needs live probe |
| Height mechanism (Lyon + Villeurbanne) | "Périmètres de hauteurs de façades" overlay zones — separate GIS layer | PLU-H règlement (stated in research) | **UNRESOLVED** | `stated` — single research source |
| COS/FAR | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366 | `legifrance.gouv.fr` | `published` |
| Context buildings + height | BD TOPO `BATIMENT` + `HAUTEUR` | National — see `../../sources/SOURCES.md` | `data.geopf.fr/wfs` | `corroborated` |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| **`HBCPRINC`/`HBCSEC`/`PLAFOND` on national GPU WFS** | Live WFS GetFeature for a Lyon parcel bbox | Run probe in `../NEXT.md §1` — **highest priority** |
| **`HBCPRINC`/`PLAFOND` on data.grandlyon.com** (fallback if national WFS lacks fields) | WFS GetCapabilities search | `grep -i hauteur` on WFS capabilities (see `../NEXT.md §1`) |
| **Périmètres de hauteurs de façades layer name** | `data.grandlyon.com` WFS capabilities | See `../NEXT.md §B2` probe command |
| **Numeric values — `HBCPRINC` for sample zones** | Live WFS response for 3 known zone codes | After critical probe confirms field presence |
| **Numeric values — emprise au sol coefficient** | GIS attribute or PLU-H règlement écrit PDF | Via GPU-returned document link |
| PLU-H version (date of consolidated text) | GPU-returned document date for a Lyon parcel | `apicarto.ign.fr/api/gpu/zone?lon=4.8300&lat=45.7430` — check `datapprobation` or `datpubli` field |
| ABF perimeter sub-type in GPU response | GPU SUP layer for a Lyon parcel near classified monument | Probe GPU SUP layer |

---

⚠ No numeric height or coverage value has been verified from a primary source for any Lyon zone.
