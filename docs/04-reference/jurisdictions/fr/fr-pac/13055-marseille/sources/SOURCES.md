# Marseille / AMP Territoire 1 (13055) — data sources

**Status:** PROBED 2026-07-23 (two sessions) — GPU WFS `zone_urba` confirmed live for Marseille via `data.geopf.fr/wfs`. Features returned with full attribute schema including direct PDF règlement links with page anchors. No height attributes in zone_urba (as expected — graphic-primacy path). PLUi Territoire 1 partition and idurba confirmed. No règlement PDF read, no numeric value certified.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel geometry | IGN PCI Express / API Carto — see `../../sources/SOURCES.md` | National | `apicarto.ign.fr/api/cadastre` | `corroborated` |
| **GPU zone_urba — LIVE PROBE 2026-07-23** | `data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=wfs_du:zone_urba&BBOX=5.362,43.290,5.380,43.305,EPSG:4326&SRSNAME=EPSG:4326&COUNT=3&OUTPUTFORMAT=application/json&apikey=gpu` — **HTTP 200, 23 total features in bbox, 3 returned**. Schema: `gid`, `gpu_doc_id`, `gpu_status`, `gpu_timestamp`, **`partition`** ("DU_200054807_A"), **`libelle`** (zone code, e.g. "UEc2", "UAe4", "UQG"), **`libelong`** (description, e.g. "Zone d'activités ouvertes à la mixité économique"), **`typezone`** ("U"), **`nomfic`** ("200054807_reglement_20260310_A.pdf"), **`urlfic`** (direct PDF URL with page anchor: `https://plui.ampmetropole.fr/assets/documents/PLUi_CT1_L_Reglement.pdf#page=N`), `insee`, `datappro`, **`datvalid`** ("20191219"), **`idurba`** ("200054807_PLUI_20260310_A"), `idzone`, `lib_idzone`, `formdomi`, `destoui`, `destcdt`, `destnon`, `symbole`. **NO height attributes** in schema (expected — height is in graphic plan, not zone_urba layer). | Ordonnance 2021-1310 + Live probe 2026-07-23 | `data.geopf.fr/wfs?...&apikey=gpu` | `verified` — live HTTP 200; field schema and urlfic link pattern confirmed |
| **apicarto zone-urba — LIVE PROBE 2026-07-23** | `POST https://apicarto.ign.fr/api/gpu/zone-urba` with `{"geom":{"type":"Point","coordinates":[5.368,43.295]}}` — returns same zone_urba schema. Sample: zone `UEsN1` "Zones économiques spéciales - Autres ports de plaisance et bases nautiques", urlfic page=274. | Live probe 2026-07-23 | `apicarto.ign.fr/api/gpu/zone-urba` | `verified` — live HTTP 200 |
| Zone code + governing document | GPU API — **partition: DU_200054807_A; idurba: 200054807_PLUI_20260310_A; datvalid: 20191219** — PLUi AMP Territoire 1 | Ordonnance 2021-1310 | `data.geopf.fr/wfs?...&apikey=gpu` | `verified` — live probe 2026-07-23 |
| **PLUi règlement URL pattern** | `urlfic` field in GPU zone_urba response = `https://plui.ampmetropole.fr/assets/documents/PLUi_CT1_L_Reglement.pdf#page=N` where N is the page number for that zone's règlement chapter. Confirmed pages: UEc2→p.248, UAe4→p.80, UQG→p.328, UEsN1→p.274. | Live probe 2026-07-23 | `plui.ampmetropole.fr/assets/documents/` | `verified` — URL pattern confirmed; PDF not yet downloaded or read |
| PLUi document scope | Territoire 1 "Marseille-Provence" PLUi — **separate** from Pays d'Aix PLUi (Territoire 4, 5/12/2024) | AMP metropolitan authority | AMP urbanisme portal | `published` |
| Graphic-primacy precedence rule | "le règlement graphique prime sur le règlement écrit des zones. Ainsi, à défaut d'indication sur le règlement graphique, c'est le règlement écrit des zones qui s'applique." | PLUi Territoire 1 règlement, dispositions générales | AMP PLUi | `corroborated` (stated in research; verbatim text must be verified from the primary PDF before implementation) |
| AMP GIS layer legal status | AMP's own published zoning GIS layer is explicitly informational only — NOT legally opposable | AMP metropolitan authority notice | AMP portal | `published` — this layer is NOT a primary source for any legal value |
| Zone families (descriptive) | UA ≈ R+4–6 storeys, UB ≈ R+3–4, UC ≈ R+1–2 (written règlement descriptions) | PLUi Territoire 1 written règlement | AMP PLUi | `corroborated` (descriptive; NOT the binding figure — graphic layer is primary per precedence rule) |
| Euroméditerranée (OIN) existence | State-led OIN inside Marseille with derogating rules (locally known as "article 29") | OIN Euroméditerranée instrument | Établissement Public d'Aménagement Euroméditerranée (EPAEM) | `published` (existence); derogating rules not sourced |
| COS (FAR) legal status | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366 | `legifrance.gouv.fr` | `published` |
| Context buildings + height | BD TOPO `BATIMENT` + `HAUTEUR` — national — see `../../sources/SOURCES.md` | IGN | `data.geopf.fr/wfs` | `corroborated` |

---

## B — UNVERIFIED (needed before any numeric rule may ship)

| Field | What to verify against | Method |
|---|---|---|
| **PLUi Territoire 1 règlement graphique machine-readability** | GPU WFS zone_urba confirmed live 2026-07-23 — NO height attributes in schema. GPU carries zone code + PDF link with page anchor only. Graphic plan machine-readability (vector/raster GIS layer for height indicators) **still unknown** — not available via GPU WFS. AMP portal `sig.ampmetropole.fr` not yet probed. | Probe `sig.ampmetropole.fr` or AMP geoserver for graphic règlement vector layer containing height indicators |
| **PLUi Territoire 1 graphic-primacy precedence rule verbatim text** | PLUi Territoire 1 règlement PDF — dispositions générales | Download PLUi PDF via GPU link; read verbatim before drafting ADR-0275 |
| **Zone UA height article verbatim** (max height in metres, emprise au sol %) | PLUi Territoire 1 written règlement, zone UA articles | PLUi PDF via GPU link |
| **Zone UB height article verbatim** | PLUi Territoire 1 written règlement, zone UB articles | Same PLUi PDF |
| **Zone UC height article verbatim** | PLUi Territoire 1 written règlement, zone UC articles | Same PLUi PDF |
| **Euroméditerranée OIN boundary as GIS layer** | EPAEM website / GPU OIN layer | `euromediterranee.fr` data/GIS section; GPU OIN query |
| **Euroméditerranée OIN derogating règlement** | EPA Euroméditerranée's own règlement / derogation instrument | EPAEM website — not sourced |
| **ABF perimeter sub-type in GPU response for Marseille** | GPU SUP layer for a Marseille parcel near a classified monument | Probe GPU SUP layer |
| **PSMV for Marseille historic sectors** (Panier, Vieux-Port area) | GPU — check if a PSMV overlays the base PLUi zone | GPU zone query for a parcel in the Panier district |

---

⚠ **No numeric height, emprise au sol, or setback value has been verified from a primary source for any Marseille zone.** The storey ranges in §A above (UA ≈ R+4–6 etc.) are descriptive secondary research — they document the fallback mechanism, not a shippable legal figure. The graphic plan is the primary source for height per the PLUi's own precedence rule; read the graphic layer before the written article for any specific parcel.
