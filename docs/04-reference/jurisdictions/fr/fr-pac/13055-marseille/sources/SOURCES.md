# Marseille / AMP Territoire 1 (13055) — data sources

**Status:** NOT STARTED — no live probe run, no field values confirmed.

---

## A — VERIFIED (corroborated research leads; not yet live-probed)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel geometry | IGN PCI Express / API Carto — see `../../sources/SOURCES.md` | National | `apicarto.ign.fr/api/cadastre` | `corroborated` |
| Zone code + governing document | GPU API — returns PLUi AMP Territoire 1 (19/12/2019) for Marseille (INSEE 13055) | Ordonnance 2021-1310 | `apicarto.ign.fr/api/gpu` | `corroborated` |
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
| **PLUi Territoire 1 règlement graphique machine-readability** | AMP urbanisme portal / GPU WFS response | Run B1 probe in `../NEXT.md §3` — **highest priority** |
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
