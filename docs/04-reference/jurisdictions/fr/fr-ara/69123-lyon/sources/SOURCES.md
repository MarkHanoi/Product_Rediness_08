# Lyon Métropole (69123) — data sources

> **Status:** PARTIALLY PROBED 2026-07-23 — critical probe complete: HBCPRINC/PLAFOND absent from national GPU WFS; `pluhauteur` layer confirmed on `data.grandlyon.com` with absolute metre values. No PLU-H règlement PDF read, no numeric value certified from primary source.

---

## A — VERIFIED (corroborated research leads)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel source | IGN PCI Express / API Carto | National — see `../../sources/SOURCES.md` | `apicarto.ign.fr/api/cadastre` | `corroborated` |
| Zone code identification | GPU API — returns PLU-H zone code | PLU-H Métropole de Lyon, in force June 2019 | `apicarto.ign.fr/api/gpu` | `corroborated` |
| PLU-H scope | 58 communes of Métropole de Lyon (SIREN 200046977) | PLU-H délibération June 2019 | GPU document link | `corroborated` |
| Height mechanism (outer 56 communes) — source confirmed | **`HBCPRINC`/`HBCSEC`/`PLAFOND` are NOT on the national GPU WFS** (live probe 2026-07-23: `wfs_du:zone_urba` for Lyon Confluence bbox returned GML with no height attributes). Height is on `data.grandlyon.com` `plu_h_opposable` WFS only → Tier 2 source required (+3–5 dev-days) | Live WFS probe 2026-07-23 | `data.geopf.fr/annexes/ressources/wfs/gpu.xml?apikey=gpu` — `wfs_du:zone_urba` | `verified (negative)` — HBCPRINC/PLAFOND absent from national GPU |
| **`data.grandlyon.com` pluhauteur layer CONFIRMED** | `https://data.grandlyon.com/geoserver/metropole-de-lyon/ows` — WFS feature type `metropole-de-lyon:plu_h_opposable.pluhauteur` — live (last_update_fme: 2026-04-23). Schema: **`hauteur`** (string, absolute metres; sample: "16"), `last_update`, `last_update_fme`, `gid`. Geometry: polygon | Live probe 2026-07-23 | `data.grandlyon.com` — `plu_h_opposable.pluhauteur` | `verified` — field name `hauteur`, absolute metre value confirmed. **This is the Tier 2 height source for Lyon** |
| **`data.grandlyon.com` plu_h_opposable WFS — full layer list** | pludocumentcommune, plureserv, pluloceqs, pluloceqp, plucommersurf, pluafival, plupaspar, pluintacc, plupieton, plurichso, plunonaed, plulimimp, plucontin, plupolimp, pluchangedest, plusmf, pluboispt, pluboise, plupatrim, plupaysag, pluruisseau, pluaxerui, pluoaqs, plupoltertia, plupolcom, plupolhotel, **pluhauteur**, pluzonrui, plurisqnt, plurisqtc, plureprol, plusms, plustatio, plustml, pluzoncol, plupatpro, plusmfreg, plusmsreg, plustmlreg, **pluzone**, pludetail | Live probe 2026-07-23 | `data.grandlyon.com/geoserver/metropole-de-lyon/ows?service=WFS&version=2.0.0&request=GetCapabilities` | `verified` — NOTE: `pluzone` likely contains zone_urba equivalent |
| **`pludocumentcommune` sample** | Lyon 5e: `url_documents_plu_commune` = `http://pluh.grandlyon.com/plu.php?select_commune=LYON5E`; `uid` = "69385"; `last_update_fme` = 2026-04-23 | Live probe 2026-07-23 | `plu_h_opposable.pludocumentcommune` GetFeature near Lyon Confluence | `verified` — PLU-H document URL access pattern confirmed |
| Height mechanism (Lyon + Villeurbanne) | "Périmètres de hauteurs de façades" overlay zones — separate GIS layer. Likely the `pluhauteur` layer on grandlyon.com (same WFS). Exact coverage of Lyon city + Villeurbanne vs outer communes not yet probed. | PLU-H règlement; live WFS probe found `pluhauteur` layer | `data.grandlyon.com` `plu_h_opposable.pluhauteur` | `corroborated` — field confirmed; whether Lyon city parcel uses different overlay still needs GetFeature for a Lyon 1e/2e parcel |
| COS/FAR | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366 | `legifrance.gouv.fr` | `published` |
| Context buildings + height | BD TOPO `BATIMENT` + `HAUTEUR` | National — see `../../sources/SOURCES.md` | `data.geopf.fr/wfs` | `corroborated` |
| **`data.grandlyon.com` pluzone layer — CRITICAL NEGATIVE 2026-07-23** | `plu_h_opposable.pluzone` GetFeature confirmed live (last_update_fme 2026-04-23). Schema: `gid`, **`zonage`** (zone code, e.g. "UEi2", "URm1", "UL", "UPr", "UCe2a", "UEi1", "USP", "N2"), `zone` ("PLU"), `stecal`, `last_update`, `last_update_fme`, **`hauteur_bande_principale`**, **`hauteur_bande_secondaire`**, **`plafond`**, **`ces`**, `ces_bande_principale`, `ces_bande_secondaire`, `cpt`, `cpt_bande_principale`, `cpt_bande_secondaire`. **CRITICAL FINDING: all height and coverage fields (`hauteur_bande_principale`, `hauteur_bande_secondaire`, `plafond`, `ces`, all `*_bande_*`) are NULL across ALL 10 features sampled** from a Lyon centre bbox (zone types: UEi2, URm1, UL, UPr, UCe2a, UEi1, USP, N2). `pluzone` provides zone codes via `zonage` field but does NOT populate numeric height/coverage values in any observed zone. **`pluhauteur` layer remains the correct source for height values.** | Live probe 2026-07-23 — 10 features sampled, Lyon centre bbox (4.82–4.86°E, 45.74–45.77°N) | `data.grandlyon.com/geoserver/metropole-de-lyon/ows` | `verified (negative)` — height fields confirmed null across multiple zone types |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| ~~**`HBCPRINC`/`HBCSEC`/`PLAFOND` on national GPU WFS**~~ | **RESOLVED 2026-07-23 — ABSENT from national GPU** | Promoted to §A as verified negative |
| ~~**`HBCPRINC`/`PLAFOND` on data.grandlyon.com**~~ | **RESOLVED 2026-07-23 — CONFIRMED on grandlyon** (`pluhauteur` layer, field `hauteur` in metres) | Promoted to §A |
| ~~**`pluzone` layer on grandlyon.com** — zone_urba equivalent?~~ | **RESOLVED 2026-07-23** — `pluzone` GetFeature confirmed. See §A below. | DONE — promoted to §A |
| **`pluhauteur` coverage** — does it cover all Lyon parcels or only specified height zones? | GetFeature count for Lyon municipality bbox | Run count query against `pluhauteur`; compare with total parcel count |
| **Lyon + Villeurbanne specific overlay** — is `pluhauteur` a single layer for all communes, or are Lyon/Villeurbanne a separate layer? | GetFeature for a Lyon 1er arrondissement parcel | Filter `pluhauteur` for a Lyon city centre parcel; check if a different feature comes back vs an outer commune |
| **Périmètres de hauteurs de façades layer name** | Confirmed candidate: `metropole-de-lyon:plu_h_opposable.pluhauteur` — but verify this covers Lyon/Villeurbanne specific overlay | `data.grandlyon.com` WFS GetFeature — probe `pluhauteur` for Lyon 1er, 2e; compare with outer commune sample |
| **Numeric values — `HBCPRINC` for sample zones** | Live WFS response for 3 known zone codes | After critical probe confirms field presence |
| **Numeric values — emprise au sol coefficient** | GIS attribute or PLU-H règlement écrit PDF | Via GPU-returned document link |
| PLU-H version (date of consolidated text) | GPU-returned document date for a Lyon parcel | `apicarto.ign.fr/api/gpu/zone?lon=4.8300&lat=45.7430` — check `datapprobation` or `datpubli` field |
| ABF perimeter sub-type in GPU response | GPU SUP layer for a Lyon parcel near classified monument | Probe GPU SUP layer |

---

⚠ No numeric height or coverage value has been verified from a primary source for any Lyon zone.
