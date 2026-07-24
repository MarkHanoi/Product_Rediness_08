# SOURCES — Finland national zoning (Alueidenkäyttölaki / Ryhti / kaavatietomalli / Maanmittauslaitos)

> Per-field citation catalogue for the FI structured-zoning path.
> THE TRUST GATE (playbook §3.3, C58 §1.6, L-449). A field with NO citable source stays `null` in
> the pack and is listed under §B Unverified. Never interpolate, average, or infer a legal number.

**Status:** PARTIAL — Phase 0 probe complete for Ryhti plan API (endpoint + collections VERIFIED-LIVE) and
ryhti_building (nationwide VERIFIED-LIVE). Item-level plan attribute schema blocked on tooling (binary
payload). Maanmittauslaitos, KMTK, Museovirasto not yet live-probed. No pack may ship `structured`
confidence without live endpoint verification and human sign-off (L-449).

---

## The sources

| | |
|---|---|
| **Primary planning statute** | Alueidenkäyttölaki (Land Use Act, effective 1.1.2025) + Rakentamislaki (Building Act, effective 1.1.2025) — together replace Maankäyttö- ja rakennuslaki (MRL) |
| **National data model** | Kaavatietomalli — ISO 19109/19103/19107-based national zoning data model; Ministry of the Environment |
| **Zoning platform** | Ryhti — national built-environment information system; Ministry of the Environment; VOOKA project for national rollout |
| **Cadastre** | Maanmittauslaitos (NLS) — sole national cadastral authority; OGC API Features; CC BY 4.0 open-data licence |
| **3D buildings / topographic database** | Maastotietokanta (KMTK) — national topographic database including LiDAR-derived 3D Buildings feature class; open data |
| **LiDAR terrain** | National LiDAR programme (Maanmittauslaitos) — from 2020, 5 pts/m² original, 0.5 pts/m² public |
| **Heritage** | Museovirasto (Finnish Heritage Agency) — WFS/WMS open services; RKY, Building Heritage Register, ancient monuments |
| **Helsinki metro floor area** | SeutuRAMAVA — block-level (kortteli) FAR aggregated from valid asemakaava for Espoo, Helsinki, Kauniainen, Vantaa |
| **Restricted building register** | RHR (rakennus- ja huoneistorekisteri) — DVV (Digital and Population Data Services Agency); GDPR-restricted third-party access |
| **Native CRS** | ETRS89 / TM35FIN (EPSG:3067) — Finland's national metric projection (Maanmittauslaitos standard) |

---

## A — VERIFIED (per-field citations from published primary sources)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Planning law | Alueidenkäyttölaki + Rakentamislaki (both effective 1.1.2025) | statute | — | Suomen säädöskokoelma (Finnish Acts) | `https://www.finlex.fi` | `published` |
| Former law | Maankäyttö- ja rakennuslaki (MRL) — replaced from 1.1.2025 | statute | — | MRL (132/1999) | `https://www.finlex.fi` | `published` |
| Municipal count | ~309 kunta (municipalities) | count | Alueidenkäyttölaki | Government of Finland administrative register | `https://www.stat.fi` | `published` |
| Plan hierarchy | Maakuntakaava → Yleiskaava → Asemakaava — three-tier, nationally uniform | statute | Alueidenkäyttölaki | MoE planning documentation | `https://www.ymparisto.fi` | `published` |
| National plan-symbol standard | Kaavamerkinnät ja -määräykset — Ministry of the Environment; applies universally to every asemakaava and yleiskaava | regulation | Ministry of the Environment decree | National plan markings and regulations standard | `https://www.ymparisto.fi` | `published` |
| Kaavatietomalli data model basis | ISO 19109 (General Feature Model) + ISO 19103 + ISO 19107 | standard | Ryhti programme documentation | Ministry of the Environment — Ryhti / kaavatietomalli | `https://www.ymparisto.fi/ryhti` | `published` |
| Ryhti plan OGC API base URL | `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1` — live, public, no auth required; courtesy registration via gistuki@syke.fi for production use | URL | — | Live probe 2026-07-24 | direct HTTP GET | `verified-live` |
| Ryhti plan collections | `pub_valid_ld_plan_ix_gs` (valid asemakaava index), `pub_valid_lm_plan_ix_gs` (valid yleiskaava index), `pub_prep_ld_plan_ix_gs` (prep asemakaava index), `pub_prep_lm_plan_ix_gs` (prep yleiskaava index) — all `_ix_`-suffixed | collection IDs | — | Live probe 2026-07-24 | `GET .../collections` | `verified-live` |
| Ryhti plan collection bbox caveat | Declared bbox (15.05–33.99°E, 58.6–70.26°N) is GeoServer CRS-extent metadata default, NOT data coverage; actual content is South/North Savo only | — | — | Live probe 2026-07-24 + Ryhti documentation | direct observation | `verified-live` |
| ryhti_building `open_address` nationwide | `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_address/items` — live nationally; Helsinki 091 record confirmed; June 2026 timestamp | URL + coverage | — | Live probe 2026-07-24 | direct HTTP GET + feature inspection | `verified-live` |
| Ryhti live regions | South Savo (Etelä-Savo) and North Savo (Pohjois-Savo) — valid asemakaava and yleiskaava in Ryhti OGC API | — | — | Ministry of the Environment — Ryhti programme documentation | `https://www.ymparisto.fi/ryhti` | `published` |
| VOOKA mandate | All current Finnish zoning and master plans to be exported to kaavatietomalli format | — | Rakentamislaki | VOOKA project documentation, Ministry of the Environment | `https://www.ymparisto.fi` | `published` |
| Submission deadline | Municipalities must submit building data to Ryhti by 1.1.2029 at latest | date | Rakentamislaki | Rakentamislaki + MoE implementation guidance | `https://www.ymparisto.fi` | `published` |
| Building-permit mandate | Kaavatietomalli-format building permits required from start of 2026 | date | Rakentamislaki | Same | `https://www.ymparisto.fi` | `published` |
| No retroactive obligation | Municipalities not required to submit historical data; applies only to processes started from law's effective date | — | Rakentamislaki | MoE implementation guidance | `https://www.ymparisto.fi` | `published` |
| Kaavayksikkö caveat | Kaavatietomalli does not require plan-unit objects (kaavayksikkö) — smaller municipalities flagged this in KAATIO project | — | Kaavatietomalli documentation | KAATIO cooperative working group findings | `https://www.ymparisto.fi` | `published` |
| Cadastre source | Maanmittauslaitos (NLS) — sole national cadastral authority; no regional carve-outs for mainland Finland | — | — | NLS open data documentation | `https://www.maanmittauslaitos.fi` | `published` |
| Cadastre OGC endpoint | `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/` | URL | — | NLS OGC API documentation | `https://www.maanmittauslaitos.fi/avoin-paikkatieto` | `published` |
| Cadastre licence | CC Attribution 4.0 (NLS open-data licence) | licence | — | NLS open data terms | `https://www.maanmittauslaitos.fi` | `published` |
| Cadastre refresh cycle | Nightly by 2am; available 24/7 | — | — | NLS open data product description | `https://www.maanmittauslaitos.fi` | `published` |
| KMTK 3D building vectors | Maastotietokanta Buildings class — 3D instances derived from 5-pt/m² LiDAR; includes intended use + storey count | — | — | NLS Maastotietokanta product specification | `https://www.maanmittauslaitos.fi` | `published` |
| KMTK open data | Maastotietokanta is open data | — | — | NLS open data terms | `https://www.maanmittauslaitos.fi` | `published` |
| National LiDAR (current programme) | From 2020; 5 pts/m² original density; thinned to 0.5 pts/m² for public delivery | pts/m² | — | NLS LiDAR programme documentation | `https://www.maanmittauslaitos.fi` | `published` |
| Historical LiDAR | 2008–2019 data at 0.5 pts/m² | pts/m² | — | NLS product specification | `https://www.maanmittauslaitos.fi` | `published` |
| Museovirasto heritage scope | Ancient monuments + other cultural-heritage sites (point); scheduled-monument area boundaries; Building Heritage Register (point + area); RKY (point, line, area); World Heritage Sites (point + area) | — | — | Museovirasto open spatial data documentation | `https://www.museovirasto.fi` | `published` |
| Museovirasto non-exhaustion caveat | WFS does NOT include buildings protected under the Act on the Protection of the Built Heritage → request from LVV; or protected via zoning plan → request from municipality/regional council | — | Museovirasto self-disclosure | Museovirasto open data documentation | `https://www.museovirasto.fi` | `published` |
| Building Heritage Register scope | Buildings protected under: 1985 Decree (480/85), Church Act, Act on the Orthodox Church, 1998 "Railway Agreement" | — | Museovirasto | Building Heritage Register documentation | `https://www.museovirasto.fi` | `published` |
| RHR access restriction | GDPR-restricted; third-party access requires DVV permission; data not publicly authoritative (may only be used in decisions concerning a person if that person is explicitly informed) | — | GDPR + Finnish Data Protection Act | DVV (Digital and Population Data Services Agency) documentation | `https://dvv.fi` | `published` |
| SeutuRAMAVA dataset | Block-level (kortteli) floor-area data from valid asemakaava; Espoo, Helsinki, Kauniainen, Vantaa; expressed in floor-area m² | — | — | SeutuRAMAVA dataset documentation (Helsinki Region) | Helsinki Region open data | `published` |
| Åland separation | Åland maintains own separate land registry and building permitting administration by statute | — | Finnish Constitution + Åland Self-Government Act | — | — | `published` |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| Ryhti `_ix_` item property schema (tehokkuusluku, kerrosluku, kayttotarkoitus field names) | Item-level GeoJSON returned as binary payload by probe tool — tooling gap, not access gate | `curl -s ".../pub_valid_ld_plan_ix_gs/items?limit=1" -H "Accept: application/geo+json" \| python3 -m json.tool \| grep -A 50 '"properties"'` |
| Maanmittauslaitos API key process | Process confirmed as self-service email registration; no key actually obtained | Register at NLS "My Account" / `https://www.maanmittauslaitos.fi/asioi/avoin-data`; request kiinteisto-avoin key |
| Maanmittauslaitos cadastre field names | Not fetched | `GET .../collections` after API key obtained; DescribeFeatureType |
| KMTK WFS/OGC endpoint URL | Not confirmed from live probe | Fetch Maastotietokanta product page; find OGC endpoint; run GetCapabilities on Buildings layer |
| KMTK storey-count attribute name + fill rate | Not confirmed | DescribeFeatureType + sample ~5 features in Helsinki; inspect height/storey attribute |
| Museovirasto WFS/WMS endpoint URL + layer names | Not fetched | `GET https://kartta.nba.fi/arcgis/services/...?service=WFS&version=2.0.0&request=GetCapabilities` (confirm URL from Museovirasto spatial data documentation page) |
| Ryhti API coverage outside South/North Savo | Confirmed live for two regions only; other regions in VOOKA queue | Check VOOKA project regional progress tracker |
| Helsinki / Uusimaa VOOKA migration date | Not confirmed | Check VOOKA schedule at Ministry of Environment |
| SeutuRAMAVA download URL + field schema | Dataset existence confirmed; download path and attribute schema not fetched | Fetch Helsinki Region open data portal |
| Åland cadastre/planning API | Confirmed separate system; specific endpoints not investigated | Check `https://www.regeringen.ax/` geodata or Åland statistics |
| LVV (Lupa- ja valvontavirasto) heritage API | Existence confirmed from Museovirasto caveat; API not investigated | Check LVV open data portal for built-heritage-protected-building WFS |

⚠ A number that appears only in a secondary source, programme website, or secondary republication is
`stated` — record it as a research note, never promote it to §A without a primary statutory or official
government technical document citation.
