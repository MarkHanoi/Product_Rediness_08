# Norway (`no`) — national data sources

**Status:** PARTIALLY PROBED 2026-07-24 — Matrikkelen Eiendomskart Teig WFS confirmed live (open, free); NDH terrain confirmed live (open, free); Kulturminnesøk.no confirmed live (open, free); `BestemmelseUtnyttingsgrad` national object-catalog entry confirmed as an unfinished stub. No numeric rule values are verified — those live in per-plan reguleringsbestemmelser prose text, neither of which has been read for any specific Norwegian parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack and is listed under §B.
> A pack may not ship confidence `structured` unless EVERY field it sets has a row in §A here.

---

## A — VERIFIED (research-cited; confirmed or confirmed-live as noted)

| Field (pack key / layer) | Value / endpoint | Unit | Governing instrument | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Parcel geometry — Matrikkelen Eiendomskart Teig | WFS: `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities` — GML, daily update, **no login required, fully open** | parcel polygon | Matrikkellova (LOV-2005-06-17-101); operated by Kartverket | Matrikkelen product documentation, Kartverket | `kartverket.no/eiendom` | `published` — **CONFIRMED LIVE 2026-07-24** |
| Building points — Matrikkelen Bygningspunkt | Free WFS/download via Geonorge, no login; one point per building linked to matrikkel building number | point geometry | Matrikkellova; Kartverket | Geonorge data catalogue | `geonorge.no` | `published` — confirmed |
| Building footprints + height — FKB-Bygning | 2.5D building model (footprint + top-height value per building/roof element); **free only for Norge digitalt parties (public bodies / Geovekst agreement holders)**; private/commercial must purchase via reseller (Geodata, Norkart) or direct Kartverket agreement | polygon + height (m) | Geovekst / Norge digitalt cooperation; Kartverket | FKB-Bygning produktspesifikasjon; Geovekst cooperation framework | `kartverket.no/geodataarbeid/geovekst` | `published` (schema); licence-gated for commercial use |
| Terrain / surface model — NDH | Nasjonal detaljert høydemodell — ≥2 pts/m², ~230,000 km², complete nationwide 2016–2022; DTM and DSM; **fully free, no login** | pts/m²; m elevation | Kartverket (7-ministry funded project) | NDH product documentation | `hoydedata.no` | `published` — **CONFIRMED LIVE 2026-07-24** |
| Planning statute | Plan- og bygningsloven (pbl.), LOV-2008-06-27-71 | statute | National law | Plan- og bygningsloven (2008) — current consolidated | `lovdata.no/dokument/NL/lov/2008-06-27-71` | `published` |
| Plan type taxonomy | Kommuneplan arealdel (kap. 11), kommunedelplan (§11-28), reguleringsplan kap. 12: områderegulering (§12-2), detaljregulering (§12-3) | — | pbl. kap. 11–12 | Plan- og bygningsloven (2008) | `lovdata.no` | `published` |
| § 29-4 height default | gesimshøyde > 8 m or mønehøyde > 9 m requires an adopted plan; absent plan: setback = max(½ building height, 4 m) from neighbour boundary; height measured as average eave height vs. average adjusted terrain along façade | m | pbl. § 29-4 + Rundskriv H-8/15 | Plan- og bygningsloven §29-4 (2008); Rundskriv H-8/15, Kommunal- og moderniseringsdepartementet | `lovdata.no` / `regjeringen.no` Rundskriv H-8/15 | `published` |
| SOSI Plan mandate | Forskrift 26.06.2009 nr. 861 — all kommuner legally required to produce kommuneplan and reguleringsplan on the national SOSI Plan object catalogue since 2009; arealformål codes, hensynssone codes, plan-type codes, planstatus codes are all defined nationally | — | Forskrift 26.06.2009 nr. 861 under pbl. | Nasjonal produktspesifikasjon for arealplan og digitalt planregister — SOSI Plan | `kartverket.no` / Geonorge | `published` |
| Arealformål code list | National kodeliste — e.g. `1110` boligbebyggelse, `1120` frittliggende småhus, `1140` blokkbebyggelse, `1310` næring, `1320` industri, `2010` sentrumsformål, `5100` LNF, `6400` parkering | code | SOSI Plan, Nasjonal produktspesifikasjon | SOSI Plan object catalogue | Geonorge | `published` |
| Hensynssone code list | National kodeliste under pbl. § 11-8 tredje ledd — e.g. `H570` bevaring av kulturmiljø, `H550` naturmiljø, `H410` landbruk, `H210` høyspentanlegg | code | pbl. § 11-8 tredje ledd; SOSI Plan | SOSI Plan object catalogue | Geonorge | `published` |
| Planstatus code list | National enumeration — `1` planforslag, `2` vedtatt plan, `3` opphevet, `4` utgått; `overstyrer`/`overstyres av` and `erstatter`/`blir erstattet av` relationships are structured | code | SOSI Plan, Nasjonal produktspesifikasjon | SOSI Plan object catalogue | Geonorge | `published` |
| Grad av utnytting method — BYA (bebygd areal) | Absolute building footprint area in m²; definition: total ground-floor area of all structures on the parcel | m² | TEK17 §5-2 | Byggteknisk forskrift TEK17 §5-2 (FOR-2017-06-19-840) | `lovdata.no/dokument/SF/forskrift/2017-06-19-840` | `published` |
| Grad av utnytting method — %-BYA | Footprint as % of net tomt (parcel) area — most common for småhus/rekkehus | % | TEK17 §5-3 | TEK17 §5-3 | `lovdata.no` | `published` |
| Grad av utnytting method — BRA (bruksareal) | Total usable floor area, all storeys summed per NS 3940 | m² | TEK17 §5-4; NS 3940 | TEK17 §5-4; NS 3940 | `lovdata.no` | `published` |
| Grad av utnytting method — %-BRA | BRA as % of tomt area; **mandatory for kjøpesentre/forretninger** | % | TEK17 §5-5 | TEK17 §5-5 | `lovdata.no` | `published` |
| Grad av utnytting method — MUA (minste uteoppholdsareal) | Minimum outdoor amenity area | m² | TEK17 §5-6 | TEK17 §5-6 | `lovdata.no` | `published` |
| Parking area method | Whether/how parking counts toward BYA/BRA | — | TEK17 §5-7 | TEK17 §5-7 | `lovdata.no` | `published` |
| H-2300 B veileder | Grad av utnytting: Beregnings- og måleregler — nationally uniform calculation manual; ships historical-methods appendix (pre-/post-1 July 1987 break point named) | — | Kommunal- og distriktsdepartementet / Direktoratet for byggkvalitet (DiBK) | H-2300 B (current edition); predecessor T-1459 (2007), T-1530 | `dibk.no` | `published` |
| BestemmelseUtnyttingsgrad — national schema slot | Object type exists in SOSI Plan schema; **object-catalog entry confirmed as unfinished stub 2026-07-24**: "Her burde det vært en forklaring av hvordan utnyttingsgrad skal håndteres, og hva slags beregningsregler som gjelder." The national spec for how to populate this field is absent. | — | SOSI Plan object catalogue | Geonorge object register, EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F | `https://objektkatalog.geonorge.no/Objekttype/Index/EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F` | `verified (negative)` — **CONFIRMED STUB 2026-07-24** |
| Trondheim planregister — access terms | "No conditions apply to access and use" — open data, ugradert, continuously updated. Contact: `kart.postmottak@trondheim.kommune.no`. Scale: 1:10000. | — | Trondheim kommune Kartavdelingen | Geonorge kartkatalog entry, Trondheim planregister | `https://kartkatalog.geonorge.no/metadata/planregister-trondheim-kommune/21c83653-b9c2-4931-bad0-a67e4c0f6be6` | `published` — **CONFIRMED** |
| Oslo Planinnsyn | Click-in-map viewer resolving gnr/bnr, all overlapping plan layers, and reguleringsbestemmelser text; nightly update cadence for reguleringsplan/områderegulering layers | — | Oslo PBE (Plan- og bygningsetaten) | Oslo kommune | `https://od2.pbe.oslo.kommune.no/kart/` | `published` — **CONFIRMED LIVE** |
| Oslo Grad av utnytting faktaark | Per-parcel fact sheet identifying which historical grad-av-utnytting calculation era applies (pre-/post-1 July 1987 named) | — | Oslo PBE | Oslo kommune | `https://od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html` | `published` — **CONFIRMED LIVE** |
| Bergen heritage guidance | Askeladden / Kulturminnesøk + hensynssone H570 / bevaringsområde in reguleringsplan as operative trigger for facade-change search duty; confirmed applicable in Bergen | — | Bergen kommune guidance | Bergen kommune | `https://www.bergen.kommune.no/hvaskjer/tema/kulturminner-i-bergen/istandsetting-og-vedlikehold/hvilke-bygninger-er-fredete-eller-verneverdige` | `published` — **CONFIRMED LIVE** |
| Heritage — Kulturminnesøk.no | ~220,000 heritage objects with map geometry and attributes; Riksantikvaren caveat: geolocation accuracy on older entries not suitable as sole basis for detailed planning | — | Riksantikvaren | Kulturminnesøk.no | `https://kulturminnesok.no` | `published` — **CONFIRMED LIVE** |
| Heritage — Askeladden | One official register, 300,000+ localities; professional login required (kommune/fylke/museum/consultant by arrangement) | — | Riksantikvaren; kulturminnelova | Askeladden product documentation | `askeladden.ra.no` | `published`; access-gated |
| Heritage — SEFRAK | ~515,000 pre-1900/pre-1945 buildings (nationwide survey 1975–1995); **separate from Askeladden** | — | Riksantikvaren | SEFRAK documentation | Via Riksantikvaren WMS/WFS | `published` |
| Oslo Gul liste | Oslo's own "Yellow List" of conservation-worthy buildings — separate from national Askeladden | — | Byantikvaren i Oslo | Oslo kommune | — | `published` (existence confirmed); format/access not yet checked |
| Geonorge Plan2 catalogue | National index of per-kommune planregister datasets — indexes where to look, not a merged national feature layer | — | Kartverket / Geonorge | Geonorge Plan2 | `geonorge.no` | `published` |
| Reguleringsbestemmelser text access — Trondheim | At least Trondheim publishes bestemmelser as parseable HTML/text on the kommune's own site (not only scanned PDF) — confirmed for Brannkvartalet reguleringsplan, 2004 | — | Trondheim kommune | Trondheim.kommune.no plan archive | Trondheim.kommune.no | `corroborated` (confirmed for one plan; not surveyed broadly) |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| Trondheim planregister WFS — live endpoint URL and layer names | Geonorge kartkatalog page confirmed but the live WFS GetCapabilities URL has not been fetched | Open the kartkatalog UUID page, pull the WFS distribution URL, run `GetCapabilities` |
| Trondheim planregister WFS — arealformål/hensynssone attribute presence | No GetFeature probe run against a real parcel | Run GetFeature with a Trondheim parcel BBOX; record which attributes are non-null |
| Oslo planregister WFS endpoint | Planinnsyn confirmed as click-viewer; standalone WFS not located | Check `data.oslo.kommune.no` CKAN and Geonorge kartkatalog for "Planregister Oslo kommune" |
| Bergen planregister WFS endpoint | Not located in this pass | Search Bergen open-data portal and Geonorge kartkatalog |
| Any specific %-BYA / BRA / height value for any Norwegian parcel | No reguleringsbestemmelser document has been read for any parcel | Run regime classifier → fetch plan → read bestemmelser text for target parcel |
| Oslo Gul liste data format / access | Existence confirmed; format (list, GIS layer, PDF) not confirmed | Check `byantikvaren.oslo.kommune.no` for a machine-readable Gul liste dataset |
| Bergen verneverdig building list format / access | Referenced in heritage guidance; format not confirmed | Bergen Byantikvar office, or linked sources on the Bergen heritage guidance page |
| HBauO equivalent for Norway: pbl. § 29-4 setback formula edge cases | § 29-4 text confirmed; exact interpretation of "average terrain" for steeply sloping sites not probed | Read Rundskriv H-8/15 in full; cross-reference with H-2300 B terrain-height appendix |
| FKB-Bygning reseller licence cost and time-to-approval | Licence gate existence confirmed; cost/timeline not checked | Contact Geodata or Norkart for commercial FKB-Bygning quote; or check `kartverket.no` for Norge digitalt agreement form |
| NDH WFS/WCS attribute schema (field names for DTM/DSM tiles) | Endpoint confirmed live; specific GetCapabilities layer names not recorded | `curl "https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm1?SERVICE=WCS&REQUEST=GetCapabilities"` |

---

⚠ No numeric %-BYA, BRA, or height value has been verified from a primary source for any Norwegian parcel. The § 29-4 national defaults (gesimshøyde 8 m / mønehøyde 9 m; setback max(½ height, 4 m)) are confirmed as the applicable fallback where no plan governs — do not use them as defaults for plan-governed parcels.
