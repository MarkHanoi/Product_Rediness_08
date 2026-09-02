# EUROPEAN EXISTING ENVELOPE GEOMETRY CENSUS — CONSOLIDATED (44 rows)

> **Date:** 2026-09-02 · **Authority:** `docs/01-strategy/STR-EUROPEAN-ENVELOPE-SOURCES.md` §10
> (the founder's mandate). **The question, verbatim:** *"Across Europe, where does an
> authoritative source already publish the GEOMETRIC CONSEQUENCE of planning rules?"*
> **Sources:** the four lane censuses beside this file — `census-nordic-baltic.md` (8),
> `census-west.md` (10), `census-central.md` (9), `census-south-east.md` (16) — each with its own
> probe ledger and raw transcripts; plus the banked 2026-08-31 Europe sweeps they reuse.
> **Adversarial verification (this file's author):** 8 of 8 re-probed Type-A claims CONFIRMED
> (two per lane, live HTTP 2026-09-02, transcripts in `transcripts-verify/`); 4 licence pages
> opened and quoted (§ VERIFICATION at the end). **No re-probe disagreed with any lane.**
> **Honesty frame (inherited, binding):** UNKNOWN ≠ absent ≠ zero · a WMS is a picture, not a
> geometry channel · a registration/vantage gate is a GATE, not a missing dataset ·
> GetCapabilities is not an inventory.

**Verdict ladder:** **CONSUME-GEOMETRY** (Type A — explicit envelope/field/line geometry served
as data) > **COMPILE-PARAMETERS** (Type B — numeric parameters typed onto geometry) >
**STRUCTURED-RULES** (structured zone/prescription model; numbers stay in legal text) >
**DOCUMENTS-ONLY** > **OPAQUE/GATED**.

---

## HEADLINE

**Twelve of 44 jurisdictions serve explicit envelope geometry (Type A) as machine-readable data
today** — DK, EE, LT, IS, FR, NL*, BE-VLG, CH, SI, HR, DE (vectorised islands), ES (Madrid-city)
— eight of them keyless. Four more hold it gated or model-only (SE free-OAuth, NO
agreement-gated vector, FI data-permit, PL partial WMS). The founder's consume-before-compute
strategy is not a Danish curiosity: **the byggefelt shape (field/line geometry + plan linkage +
validity) recurs across a quarter of Europe.** Nowhere outside DK/EE/IS/AL do numeric envelope
values ride ON the geometry — everywhere else the numbers stay in documents or law tables, which
is exactly the A ∩ B ∩ C composition the strategy predicts. *(NL: geometry keyless via PDOK
ID-only tiles; typed values behind the free DSO key.)*

---

## THE CONSOLIDATED TABLE — 44 rows, founder's columns + verdict

Column key: **PL**=parcel linkage · **ZG**=zoning geometry · **BF**=building-FIELD geometry ·
**BL**=building-LINE geometry · **H**=height · **FAR** · **COV**=coverage ratio · **SB**=setbacks ·
**VAL**=validity/temporal · **LIC**=licence · **TC**=territorial coverage · **MRQ**=machine-readable
quality (lane's honest 0–5). ✅=served as data (live-proven) · 🔒=exists, gated · 🅼=in the national
model, not yet served openly · ✖=not found as data · ?=UNKNOWN (probe named in lane file).
Full evidence per row lives in the lane file named in the last column.

| # | CC | Authority | Dataset | API/download | PL | ZG | BF | BL | H | FAR | COV | SB | VAL | LIC | TC | MRQ | VERDICT | lane |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **DK** | Plan- og Landdistriktsstyrelsen (Plandata.dk) + DAWA | Lokalplaner + rammer + **byggefelter** | keyless WFS, 208 layers, GeoJSON | ✅ DAWA point→matr/BFE | ✅ | ✅ **57,083** fields w/ maxetager/maxbygnhjd/eareal/bygkunifelt | (field IS the footprint) | ✅ | ✅ bebygpct + **bebygpctaf denominator code** | ✅ | ✖→BR18+PDF | ✅ full dates + versioned layers | CC BY 4.0 | national | 5 | **CONSUME-GEOMETRY** ⭐ exemplar, re-proven | nordic-baltic |
| 2 | **SE** | Lantmäteriet (NGP) + Boverket | digital detaljplaner (BFS 2020:5) | STAC+OGC API — **free reg, OAuth2** | ? (gated) | 🔒 | 🔒 egenskapsområden | 🔒 **prickmark/korsmark** no-build | 🔒 | 🔒 | 🔒 | 🔒 drawn | plan lifecycle | CC BY 4.0 | 11,662 plans / 236 of 290 kommuner | 4 (gated) | COMPILE-PARAMETERS today / CONSUME-GEOMETRY behind free gate | nordic-baltic |
| 3 | **NO** | Kartverket/DiBK (NAP) + kommuner | SOSI reguleringsplan (RpJuridiskLinje, RpRegulertHøyde) | NAP WMS keyless (54 queryable layers); vector = **Norge digitalt agreement** | ✅ matrikkel WFS | ✅ WMS / 🔒 vector | 🅼 | 🅼 **byggegrense/byggelinje** (WMS-visible) | 🅼 | 🅼 %-BYA/BRA | 🅼 | 🅼 byggegrense IS the setback | plan registers | NLOD / agreement | national model; per-kommune digitisation | 3 | COMPILE-PARAMETERS (channel gated) | nordic-baltic |
| 4 | **FI** | SYKE (Ryhti) + MML | kaavatietomalli (rakennusala) | open OGC API = **index only** (re-probed); objects = data permit | ? | index | 🅼 rakennusala | 🅼 | 🅼 | 🅼 tehokkuusluku | 🅼 | partial drawn | rollout thru 2026 | CC BY 4.0 (open parts) | Ryhti regions ~55-65% | 2→4 | STRUCTURED-RULES (trajectory: consume) | nordic-baltic |
| 5 | **IS** | HMS (luk.skipulag.is) | **Stafrænt deiliskipulag: Byggingarreitir** (+3D) | keyless ArcGIS FeatureServer | Lóðir layer + spatial | ✅ | ✅ **2,039** fields w/ haedirOfan/byggmagn | via Kvaðir/edges | floors ✅; metres ? | via byggmagn (GFA) | ✖ | drawn | ✅ gildirFra/Til per feature | "opin gögn" (id unread) | digital slice only; PDF stock dominates | 4 (slice) | **CONSUME-GEOMETRY** (digital slice) | nordic-baltic |
| 6 | **EE** | Maa- ja Ruumiamet (PLANK) | **dp_hoonestus** building areas + ehitusõigus | keyless WFS, 181 layers | dp_krunt + cadastre WFS | ✅ | ✅ w/ **full numeric tuple** | via edge+tingimus | ✅ korgus/korgusabs | ✅ tihedus | ✅ protsent | tingimus prose | ✅ kehtestkp | Estonian open licence | digitised stock; empty≠no-plan | 5 | **CONSUME-GEOMETRY** | nordic-baltic |
| 7 | **LV** | VARAM/VRAA (TAPIS) | consolidated national planning layers (18 FTs) | **live WFS 2.0.0, CC0** | zoning links to DOC not parcel; cadastre separate | ✅ national | ✖ | ✖ no būvlaide | ✖→TIAN text | ✖ | ✖ | ✖ | ✅ dok dates | **CC0-1.0** (quoted below) | national | 3 | STRUCTURED-RULES | nordic-baltic |
| 8 | **LT** | VTPSI (TPDR) + RC | ASGR + **sprendiniai: Statybos zona/riba/linija** + 3D volumes | keyless ArcGIS REST + daily FGDB bulk | parcels open FS | ✅ | ✅ **36,476+686 zones** w/ MAX_AUK_M | ✅ **riba + linija polylines national** | ✅ (fill 14-18%) | ⚠ MAX_INTENS units OPEN | ✅ MAX_TANKIS | ✅ riba IS the setback | ✅ GALIOJA+AKTUALI | public+attribution | national; numeric fill urban-heavy | 5 struct | **CONSUME-GEOMETRY** | nordic-baltic |
| 9 | **FR** | IGN/DGALN (Géoportail de l'Urbanisme) | CNIG DU: zone_urba + prescriptions | GPU WFS keyless (`data.geopf.fr`) | via PCI cadastre, spatial | ✅ national | ✖ (plan-masse 5,291 nearest) | ✅ **69,739 typepsc-15 setback lines** (+51,407 surf) | polygons ✅ (61,176), value zone-dependent | ✖ règlement | ✖ règlement | ✅ drawn | ✅ idurba plan+version | **Licence Ouverte 2.0** (quoted below) | national (post-2020 upload duty); RNU outside | geometry HIGH / numerics none | **CONSUME-GEOMETRY** | west |
| 10 | **BE** | 3 regions — VLG: Mercator/DSI · WAL: SPW · BRU: urban.brussels | RUP/gewestplan · Plan de secteur · PRAS/PPAS | keyless WFS ×3 (VLG 386 layers) | GRB CAPAKEY (VLG) / CADMAP / UrbIS | ✅ all 3 | ✖ | ✅ VLG **951 typed bouwlijnen** w/ article join; WAL/BRU ✖ | ✖ text | ✖ | ✖ | lines yes, distances text | ✅ (WAL WALLEX deep-links; BRU DOC_URL) | GREEN (regional open/CC0) | region-complete ×3 | 3-4 | VLG **CONSUME-GEOMETRY** (thin) · WAL/BRU STRUCTURED-RULES | west |
| 11 | **NL** | Kadaster/DSO-LV + PDOK | omgevingsplan (IMOW) + bestemmingsplannen (IMRO) | Ozon v8 + RP v4 **free key**; PDOK tiles keyless (ID-only); old public WFS DEAD (NXDOMAIN) | BRK wired in PRYZM | ✅ | ✅ **bouwvlak** served fields | gevellijn share ? | ✅ typed maatvoering | ✅ typed | ✅ typed | via bouwvlak+rules | ✅ dual-regime temporal | gov reuse GREEN-ish | national both regimes; IMOW-annotated minority | 5 (gated) | **CONSUME-GEOMETRY + COMPILE-PARAMETERS** (free key) | west |
| 12 | **LU** | Ministère de l'Intérieur / geoportail.lu | national PAG model, one schema | data.public.lu GPKG bulk (617 MB, monthly) | ✅ **653,315 parcels IN the file** | ✅ 46,191 zones | ✖ | ✅ **2,442 ALIGN_A_RESP lines** | ✖ PAP/DOCX | ✅ CUS 93.7% (NQ) | ✅ COS/CSS 93.7% (NQ) | ✖ distances | ✅ plan+version | **CC0** (quoted below) | national; numerics NQ-only (18,743 QE zones doc-bound) | 4 | **COMPILE-PARAMETERS + lines** | west |
| 13 | **GB** | MHCLG (planning.data.gov.uk) | 108 designation datasets; local plans | entity API + bulk, OGL v3 | ✖ by design | designations ✅ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | quality+dates | OGL GREEN | England-only, self-declared incomplete | constraint HIGH | DOCUMENTS-ONLY (**discretionary — no by-right envelope exists**) | west |
| 14 | **IE** | DHLGH/Tailte | national harmonised zoning (GZT) + RZLT | keyless ArcGIS FS (296,293 RZLT parcels) | RZLT PARCEL_ID (no cadastre) | ✅ national | ✖ | ✖ | ✖ PDFs | ✖ | ✖ | ✖ | annual maps | CC-BY family | 30/31 LAs | 3 | STRUCTURED-RULES (part-discretionary) | west |
| 15 | **PT** | DGT (SNIT) + 278 municípios | CRUS + PDM vector model (2021 Norma) | DGT OGC API (cadastro); CRUS via SNIG | partial (urban cores absent, measured) | ✅ classification-level | ✖ | ? per-município | ✖ cércea text | ✖ índice text | ✖ | ✖ | ⚠ ~51% PDMs mid-rewrite | CC BY 4.0 | mainland classification | 2-3 | DOCUMENTS-ONLY (+geometry spine) | west |
| 16 | **ES** | per-CA; Catastro national spine; SIU=index only (STR §5) | per-CA normativa gráfica | per-CA WFS/ArcGIS | Catastro refcat (live in prod) | ✅ where CA serves | ✖ | ✅ **Madrid-city 29,105 alineaciones**; rest ✖/? | Madrid-CA IT_ALTURA 70.2% | partial | partial | Madrid fondo ⚠ semantics unverified | per-CA | CC BY (Catastro) + per-CA | patchwork | Madrid 4 / most 1 | Madrid **CONSUME-GEOMETRY+COMPILE**; most CAs DOCUMENTS-ONLY | west |
| 17 | **AD** | Govern (IDE) + 7 comuns | POUP per-parròquia; "Edificabilitat" WFS = HAZARD zones | WFS 2.0 live (hazard only) | ✖ | ? POUP not found as WFS | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | per-study PDFs | terms unread | hazard per-settlement | 1 | DOCUMENTS-ONLY | west |
| 18 | **MC** | Gouvernement Princier (DPUM) | per-quartier Ordonnances Souveraines | legimonaco HTML/PDF; plot plans MANUAL | ✖ | ✖ | ✖ | ✖ | text | text | text | text | OS chain | state legal-text | complete as documents | 0 | DOCUMENTS-ONLY | west |
| 19 | **DE** | 16 Länder (XPlanung) + municipal IT | XPlanGML B-Pläne; INSPIRE PLU indexes | per-Land WFS/OGC-API + municipal xPlanBox | ALKIS keyless ×15, spatial | outlines near-national; objects = islands | ✅ islands: **BP_UeberbaubareGrundstuecksFlaeche** (HH 41) + BaugebietsTeilFlaeche (MV) | ✅ islands: **BP_BauGrenze/BauLinie** (HH 45, KRZN-Kleve 161, MV) | slots, ~0-30% fill | GFZ ~5% fill (MV) | GRZ ~33% (MV) | in-object bautiefe where vectorised | ✅ in model | DL-DE-BY/Zero (BY gated) | corpus majority=PDF; structured ~1-3%/yr growth | std 5 / delivery 2 | **CONSUME-GEOMETRY (islands)** / DOCUMENTS-ONLY (majority) | central |
| 20 | **AT** | 9 Bundesländer (no national std) | Flächenwidmung per Land; Bebauungspläne=docs | Vienna OGD WFS + OÖ DORIS HVD WFS | BEV DKM CC BY | ✅ 2 of 9 Länder verified | ✖ | ✖ (Vienna Baulinien = PDF) | OÖ GESCHOSS per zone; Bauklasse=PDF | ✖ | ✖ | ✖ | ✖ observed | CC BY 3.0/4.0 AT | 2/9 probed, 7 UNKNOWN | 2 | COMPILE-PARAMETERS (at best) | central |
| 21 | **CH** | Confederation + 26 cantons (ÖREB) | ÖREB cadastre M2M + geodienste NPL | cantonal extract/json keyless (LU/BS/ZH proven) | ✅ **EGRID native, 1 call** | ✅ national | ✖ (Baubereiche=PDF) | ✅ **Baulinien as per-parcel restrictions** (BS ×11 proven; ZH themes) — geometry inline LU only | ✖ Reglement | typed slot ~0% delivered | ✖ | Baulinien ARE the setback instrument | ✅ Lawstatus+doc links best-in-class | GREEN federal | national (all cantons) | 4 evidence / 2 numerics | **CONSUME-GEOMETRY (lines)** / docs for numbers | central |
| 22 | **LI** | Amt für Bau und Infrastruktur | INSPIRE LU.ZoningElement | WMS+WFS live | AV per-Gemeinde | ✅ 3,668 polygons **attribute-less** | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | licence.txt unread | country-wide, semantics absent | 1 | DOCUMENTS-ONLY | central |
| 23 | **PL** | MRiT/GUGiK + 2,477 gminy | **POG APP GML 2.0** (mandatory) + MPZP + KIMPZP | KIMPZP WMS; RU endpoints land ≥2026-11-30; ULDK parcels keyless | ULDK GetParcelByXY | ✅ | 🅼 ObszarUzupelnieniaZabudowy (infill polygons) | ✅/🅼 **wektor-lzb "Linie zabudowy"** WMS (voluntary subset) | ✅ maksWysokoscZabudowy (m) national-mandatory | ✅ maksNadziemnaIntensywnosc | ✅ maksUdzialPowierzchni % | lines layer (geometry) | ✅ wersjaId/obowiazujeOd in schema | public geodetic open | POG filling NOW (deadline 2026-08-31) | 5 std | **COMPILE-PARAMETERS** (best Type B in Europe) + partial geometry | central |
| 24 | **CZ** | MMR (NGÚP) + ČÚZK | standardized ÚP layers (DUP) | `mapy.gov.cz/server` keyless REST | RÚIAN daily + obec_kod on features | ✅ 96,078 zoning polygons | ✅ **"Zastavitelné území" 638** (pilot fill) | 🅼 reg-plan lines defined, not yet observed | ✖ text | ✖ text | ✖ text | ✖ text | registry status | open (text unread) | new plans mandatory-standard | 3 | STRUCTURED-RULES → emerging CONSUME-GEOMETRY | central |
| 25 | **SK** | ÚGKK + Office for Spatial Planning | cadastre HVD; územné plány = municipal PDFs | ZBGIS WFS; no planning API | cadastre HVD | ✖ national | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | CC-BY cadastre | planning pre-digital; state IS ~2028 | 1 | DOCUMENTS-ONLY | central |
| 26 | **HU** | Lechner Tudásközpont (monopolist) | E-TÉR; TAKARNET cadastre PAID | view-only WMS/WMTS; no open WFS found | PAID | view-only | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | fee-gated | national systems, closed | 0-1 | OPAQUE | central |
| 27 | **SI** | MNVP + GURS | Prostorski akti (OPN) national aggregation | keyless WFS `ipi.eprostor.gov.si` | KN parcels CC BY; act id on features | ✅ NRP_OPN **403,788** | ✅ REG_POVRSINE 13,632 | ✅ **REG_CRTE 10,869 typed "Gradbena meja"**, plan-linked, dated | ✖ text | ✖ FI text | ✖ FZ text | reg-lines ARE the instrument | ✅ DATUM_VEL per feature | CC BY 4.0 | land-use complete; reg-lines partial | 4 | **CONSUME-GEOMETRY** | central |
| 28 | **IT** | AdE + 19 regions | INSPIRE cadastre; regional PGT/PRG mosaics | cadastre WFS; mosaics via regional downloads | cadastral key, no plan-join std | regional mosaics (GIS-ATTR) | ✖ | ✖ fili edilizi = PDF tavole | ✖ NTA | ✖ NTA (~9-11% structured fill) | ✖ | ✖ | plan-validity registers machine-readable (Lombardia probed) | CC BY (cadastre) / IODL | north-heavy mosaics | 2 | DOCUMENTS-ONLY (+zone mosaics) | south-east |
| 29 | **MT** | Planning Authority | Local Plans; MSDI | **Cloudflare bot-wall 403 ×2 UAs** | no complete cadastre | viewer-only | ? | ? | storeys on PDF maps | ✖ | ✖ | ✖ | ? | ? | national (tiny) | 0 (vantage) | OPAQUE (walled) | south-east |
| 30 | **GR** | YPEN / Ktimatologio | FEK decrees; e-Poleodomia | dead stub + unreachable portals | incomplete cadastre | ✖ | ✖ | ✖ οικοδομικές γραμμές = scans | FEK PDF | FEK PDF | FEK PDF | FEK PDF | FEK numbers | ? | partial | 0-1 | DOCUMENTS-ONLY | south-east |
| 31 | **CY** | DLS + DTPH | planning zones GIS + coefficient tables | ArcGIS root 200; **DTPH folder IIS-403** | DLS parcels | 🔒 | ✖ | ✖ | zone-code table | zone-code table | zone-code table | PDF | ? | ? | national | 2 (gated) | COMPILE-PARAMETERS (lead, gated) | south-east |
| 32 | **HR** | MPGI (ISPU) + county institutes | **Građevinska područja** construction-area polygons | keyless WFS 2.0.0 + GDB/SHP | jls codes; DKP ATOM | ISPU WMS raster | ✅ **89,911** settlement polygons (screening) | ✖ | ✖ PDF odredbe | ✖ | ✖ | ✖ | ⚠ vintage Sept-2020; plan ref on feature | "no conditions" (register, quoted below) + NOT-for-legal-acts caveat | national | 3 | **CONSUME-GEOMETRY (screening-grade)** | south-east |
| 33 | **BA** | FGU / RGURS / entities | cadastre viewers | viewer; RS-entity geoportal timeout | viewer only | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ? | entity-split | 0 | DOCUMENTS-ONLY | south-east |
| 34 | **RS** | RGZ / MGSI | GeoSrbija; CRPD plan register | **geoportal cluster connect-timeout (fence-shaped)**; gov sites answer | ? vantage | ? | ? | ? | ? | ? | ? | ? | ? | ? | — | n/a | OPAQUE-FROM-VANTAGE (not absent) | south-east |
| 35 | **ME** | Uprava za katastar; MEPPU | geoportal viewer; PGR CG programme | viewer 200; WMS link = internal 10.x IP leak | viewer only | ✖ | ✖ | ✖ | PDF | PDF | PDF | PDF | ✖ | ? | national viewer | 0-1 | DOCUMENTS-ONLY | south-east |
| 36 | **MK** | AKN; e-urbanizam | national e-planning (holds gradežna linija in-system) | **login wall**; cadastre timeout (vantage) | ? | 🔒 | ? | 🔒 | ? | ? | ? | ? | ? | ? | — | n/a | OPAQUE (login-walled) | south-east |
| 37 | **AL** | AKPT (planifikimi.gov.al) | **Njësitë Strukturore** 91,939 unit polygons | keyless ArcGIS FeatureServer | bashkia+njesia ids (no parcel key; ASIG redirect-loop) | ✅ PPV land-use | unit polygons = B-on-geometry | ✖ | ✅ **storeys AND metres as fields** | ✅ intesitet | ✅ ksht | strips only | Rregullore ref; no dates on layer | ⚠ **UNSTATED** (public item, empty licenseInfo) | national | 4 | **COMPILE-PARAMETERS** (licence gap) | south-east |
| 38 | **RO** | ANCPI; MDLPA | parcels REST; **GIS-PUG norms v1.1/2024** | norms page live; stock CAD/PDF | ANCPI REST (incomplete fabric) | stock PDF; 2024+ standardized | ✖ | 🅼 aliniament slots in new standard | ✖ RLU | ✖ POT/CUT text (std slots exist) | ✖ | ✖ | std has validity slots | ? | incomplete | 1→3 | DOCUMENTS-ONLY → STRUCTURED-RULES (watch) | south-east |
| 39 | **BG** | AGKK; Sofiaplan | KAIS; **Sofia OUP FeatureServer** | Sofia keyless REST; KAIS gated | KAIS gated | ✅ Sofia zone-code polygons | ✖ | ✅ **Sofia construction-boundary line** (city) | ЗУЗСО law table via code | ЗУЗСО КИНТ table | ЗУЗСО table | PDF | OUP-2009 vintage | ? | Sofia island only | 3/0 | Sofia COMPILE-PARAMETERS · national DOCUMENTS-ONLY | south-east |
| 40 | **TR** | TKGM; municipalities | parsel query API; imar plans municipal | keyless point→parcel GeoJSON | ✅ ada/parsel national | ✖ | ✖ | ✖ imar hattı = PDF | `nitelik` storeys = AS-BUILT not normative | ✖ | ✖ | ✖ | ✖ | ? | national parcels | 1 | DOCUMENTS-ONLY (envelope axes) | south-east |
| 41 | **MD** | ARFC (cadastru.md) | eCadastru | **explicit textual geo-fence** ("not available in Your region") | fenced | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ? | — | n/a | OPAQUE (fenced) | south-east |
| 42 | **UA** | StateGeoCadastre; Minregion | НГП (login); **106 УМО per-permit registers** on data.gov.ua | CKAN XLS/CSV open; maps wartime-closed | cadastral no. in УМО rows | war-blocked | ✖ | ✖ | per-PERMIT rows | per-permit | per-permit | per-permit | permit dates | open-data (registers) | municipal patchwork | 2 | GATED (war) + tabular per-permit channel | south-east |
| 43 | **SM** | Segreteria Territorio | PRG documents | gov.sm only; no GIS channel | ✖ | ✖ | ✖ | ✖ | PDF | PDF | PDF | PDF | ✖ | ? | micro-state | 0 | DOCUMENTS-ONLY | south-east |
| 44 | **XK** | (Kosovo — MMPHI / Kosovo Cadastral Agency) | **NOT PROBED BY ANY LANE** | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? | **UNPROBED — every cell UNKNOWN** (probe: geoportal.rks-gov.net caps + KCA WFS + spatial-plan register) | — |

> **Scope note on the 44/45:** the four lanes covered 43 jurisdictions; **Kosovo (row 44) was
> covered by no lane** and is recorded UNPROBED, not absent. Belarus, Russia and the Holy See
> were outside every lane brief and carry **no row and no claim** — if the founder's "45" includes
> any of them, that is un-censused territory, stated here rather than implied covered.

---

## TOP-10 CONSUME-NOW

Ranked by the founder's formula **population served × geometry richness × licence openness**
(pop in millions — effective served population, not nominal; richness and licence scored 1–5 by
this consolidation, shown so the arithmetic is checkable). "Consume now" = a machine channel you
can pull today, keyless or free-key.

| # | Target | pop | geom | lic | score | First integration step | PRYZM seam it enters through |
|---|---|---:|---:|---:|---:|---|---|
| 1 | **FRANCE — GPU prescriptions** | 67.0 | 4.0 | 5.0 | 1340 | GPU WFS consumer keyed on `typepsc` (15 setback lines/zones · 14 plan-masse · 39-02 height polygons) + the `idurba` plan-version join; REFUSE numerics until règlement extraction exists — geometry first, numbers never inferred | **ZoningRecord explicit-geometry tier** (same shape as the L-608 Madrid NZ-1 explicit-area pack); règlement-absence branches → never-overstate corpus |
| 2 | **POLAND — POG APP GML** ⚠ | 36.8 | 3.0 | 4.5 | 497 | Consume `app:StrefaPlanistyczna` (maksWysokoscZabudowy / FAR / coverage, versioned, national-MANDATORY) from published plan GML; re-check RU WFS/CSW endpoints after 2026-11-30; treat KIMPZP `wektor-lzb` as WMS render-only until a vector channel lands. ⚠ corpus is FILLING this quarter — build the reader now, expect sparse coverage today | ZoningRecord parameter tier; absent MAX_* ≠ unlimited → **never-overstate corpus** |
| 3 | **NETHERLANDS — bouwvlak + maatvoering** | 17.8 | 4.5 | 4.0 | 320 | File the FREE DSO key form (standing action, form not procurement); then a `/bouwvlakken` + `/maatvoeringen` completeness sweep per plan before trusting values | the **L-609 §NL-NATIONWIDE explicit-area pack** — upgrade its refusal path to consumption |
| 4 | **DENMARK — byggefelt** | 5.9 | 5.0 | 5.0 | 148 | None — the adapter is LIVE (`packages/site-parcel-data/src/countryAdapters/dk/` + `providers/ByggefeltProducer.ts` + `rulepacks/dkPlandataEnvelope.ts`); next increment: `bygkunifelt=True` binding-field semantics (proven live in the re-probe corpus) | **the DK adapter** — the exemplar every other row is measured against |
| 5 | **SWITZERLAND — ÖREB Baulinien** | 8.9 | 3.5 | 4.5 | 140 | Generic ÖREB extract client (coords → EGRID → `extract/json`), plus the per-canton geometry-inlining matrix (LU inlines; BS/ZH doc-ref) — 3 of 26 cantons measured | explicit-geometry tier for Baulinien + the evidence/provenance graph (extract's law-links are best-in-class); numerics stay refused → never-overstate |
| 6 | **SPAIN / Madrid — alineaciones + VPLA** | 6.8 | 3.5 | 4.5 | 107 | Add the 29,105 official alignment lines (re-proven today) to the existing Madrid pack; do NOT consume the fondo layers (layer 12 = count 1, OBJECTID-only — semantics unverified, repo warning stands) | **L-608 Madrid NZ-1 explicit-area pack** (registered; extend) |
| 7 | **GERMANY — XPlanGML islands** | ~4.5 | 4.5 | 4.0 | 81 | One generic XPlanGML WFS consumer (`BP_BauGrenze`/`BauLinie`/`UeberbaubareGrundstuecksFlaeche`/`BaugebietsTeilFlaeche`) + an endpoint registry (MV, HH XPlanWFS51, KRZN-Kleve, Aachen…) — the reader is written once, the registry grows | explicit-geometry tier; sparse GRZ/GFZ fill (5–33%) → never-overstate on every empty slot |
| 8 | **LITHUANIA — statybos zona/riba/linija** | 2.9 | 4.5 | 4.0 | 52 | Consume zone polygons (+MAX_AUK_M on-feature) and riba/linija polylines; **resolve the MAX_INTENS units question BEFORE any GFA math** (banked open blocker LT-1) | explicit-geometry tier; the units question lives in the never-overstate corpus until resolved |
| 9 | **CROATIA — construction-area mask** | 3.9 | 2.5 | 4.5 | 44 | One licence-confirmation email (register: "no conditions", but layer is interpretation-grade, vintage Sept-2020); then consume as a buildable/non-buildable FIRST GATE only — refuse-with-both-numbers wherever a newer plan could disagree | **never-overstate corpus** — screening tier, never the legal envelope |
| 10 | **SLOVENIA — Gradbena meja** | 2.1 | 4.0 | 4.5 | 38 | Consume REG_CRTE_OPN typed lines + REG_POVRSINE surfaces + NRP_OPN land-use (all keyless, plan-linked, validity-dated — re-proven today); FZ/FI numerics stay municipal text | explicit-geometry tier |

**Just below the line, stated so the cut is honest:** **EE (score 31)** misses top-10 ONLY on
population — its integration cost is ≈ 0 (PLANK feature proof banked, Estonia already live
end-to-end in PRYZM): consume it regardless of rank. **LU (13)** is the cheapest full adapter in
Europe (one CC0 file: parcels + zones + ratios + lines) and an E5 STOP-BUILD on hand-written rule
packs. **AL (16)** has the best data-to-effort ratio in the south-east and is capped purely by its
UNSTATED licence — one email to AKPT could move it ten places. **IS (8)** is real but tiny
(2,039 fields). **SE** sits one free OAuth registration away from top-10-class content.

---

## WHERE THIS CENSUS IS THIN (CHECK 4 — read before citing coverage)

1. **Row 44 (Kosovo) is UNPROBED entirely**; Belarus/Russia/Holy See have no rows at all (scope
   note above). The census is 43-of-44 measured, not 44-of-44.
2. **Verified-lead, not payload-proven:** SE prickmark past the NGP OAuth gate · NO vector copy
   behind the Norge digitalt agreement · FI rakennusala behind the data permit · CY DTPH behind
   an IIS 403 · NL maatvoering completeness behind the free DSO key. Five gates, five named
   probes — none of these rows earned a CONSUME verdict on the gated axis.
3. **Vantage-blocked (gate-shaped, NOT absent):** MT (Cloudflare JS wall), RS (geoportal cluster
   timeouts while gov sites answer), MK (login wall + cadastre timeout), MD (explicit textual
   geo-fence), UA (wartime logins), BA-RS entity (timeout). **An EU-vantage re-run pass is the
   single highest-value follow-up** (south-east lane's own finding).
4. **Sub-national sampling limits:** AT 7 of 9 Länder unprobed · CH 3 of 26 cantons
   extract-probed · DE ~10 of 16 Länder unknown at object level (+ Hamburg's per-version sibling
   endpoints unenumerated) · IT probed at depth for Lombardia+Emilia only · ES beyond
   Madrid/Murcia/Catalonia graded from banked repo dossiers.
5. **Licence texts still unread** for several consume-relevant rows: IS (exact id), AL
   (unstated), BG-Sofia, CZ, LI, AD, plus most OPAQUE rows — only FR/LU/LV/HR were
   verification-quoted (below) on top of the lanes' own reads (DK CC BY 4.0, SI CC BY 4.0, etc.).
6. **Known open questions inherited un-resolved:** LT MAX_INTENS units (blocks GFA math, not
   geometry) · Madrid fondo semantics (count=1, OBJECTID-only) · FR height VALUES zone-dependent
   (in some labels, absent in others) · HR vintage 2020 · PL POG fill mid-flight · one endpoint
   (gis4.mgipu.hr) answered 502 once mid-verification before confirming on retry — flaky, plan
   retries into any HR adapter.

---

## VERIFICATION APPENDIX (this consolidation's own work, 2026-09-02)

### CHECK 1 — adversarial re-probes: 8/8 CONFIRMED (transcripts in `transcripts-verify/`)

| Lane | Claim re-probed | Lane said | Re-probe found | Verdict |
|---|---|---|---|---|
| nordic-baltic | DK byggefelt national count + feature 1490813 | 57,080 banked; maxetager 2 / maxbygnhjd 6 / eareal 250 / LP 477 + doklink | **57,083** (organic growth) · feature attrs EXACT incl. doklink PDF | CONFIRMED |
| nordic-baltic | IS Byggingarreitir count + feature | 2,039; skipnr 19973, haedirOfan 1, byggmagn 3200, gildirFra | count **2,039** · feature EXACT | CONFIRMED |
| west | FR prescription_lin typepsc=15 | 69,739; libelle "Marge de recul imposée au constructions", idurba join | numberMatched **69,739** · sample EXACT | CONFIRMED |
| west | ES Madrid alineaciones layer 8 | 29,105; ALIN_DESC join | count **29,105** · polyline schema w/ TIPOALIN+ALIN_DESC | CONFIRMED |
| central | SI REG_CRTE_OPN | 10,869; "Gradbena meja", ID_PA 3668, DATUM_VEL 2024-03-09 | numberMatched **10,869** · fields EXACT | CONFIRMED |
| central | DE-HH XPlanWFS51 hits | BauGrenze 45 · UeberbaubareGrundstuecksFlaeche 41 | **45 / 41** EXACT | CONFIRMED |
| south-east | HR Gradj_podrucje_naselje | numberMatched 89,911 | 1st attempt **502 Proxy Error** (transient); caps 200 + retry → **89,911** EXACT | CONFIRMED (flaky endpoint noted) |
| south-east | AL Njësitë Strukturore | count 91,939; Berat lartesia_k 2 / lartesia_m 6 / intesitet K1=0.5 / ksht K1=50% | count **91,939** · Berat feature EXACT | CONFIRMED |

No re-probe disagreed with any lane → the four lane documents are safe to commit as written.

### CHECK 2 — licence pages opened, operative sentences quoted

1. **FR — cartes.gouv.fr/cgu** (pointed to by the live WFS capabilities: `Fees: none`,
   `AccessConstraints: Conditions Générales d'Utilisation disponibles ici : https://cartes.gouv.fr/cgu`):
   *"A défaut, la Licence Ouverte / Open Licence – Etalab s'applique sur ce jeu de données."* —
   linking `github.com/etalab/licence-ouverte/blob/master/LO.md` (etalab-2.0). Matches the lane's
   "Licence Ouverte 2.0".
2. **LU — data.public.lu API, dataset "INSPIRE - Annex III Theme Land Use - General land
   organisation plan (Plan aménagement général)":** `"license": "cc-zero"`. Matches the lane's CC0.
3. **LV — data.gov.lv CKAN, dataset "TAPIS":** `license_id: CC0-1.0 · license_title: CC0 1.0 ·
   license_url: https://creativecommons.org/publicdomain/zero/1.0/`. Matches the lane's CC0.
4. **HR — registri.nipp.hr/api/izvori/244 (Građevinska područja):**
   `"uvjeti_pristupa_koristenja": "Nema uvjeta za pristup i korištenje"` ("no conditions for
   access and use") — **AND the operative use-limit in the same record:** *"…ne smiju [se]
   koristiti u svrhu izdavanja akata za provedbu zahvata u prostoru i drugih javnih isprava. U sve
   službene svrhe potrebno je koristiti izvornike važećih prostornih planova."* (must not be used
   for issuing implementation acts; official use requires the source plans). Matches — and
   hardens — the lane's screening-grade caveat.

### Verification transcripts (`transcripts-verify/`)

`v-dk-byggefelt-hits.xml` · `v-dk-byggefelt-feature.json` · `v-is-count.json` ·
`v-is-feature.json` · `v-fr-lin15-hits.xml` · `v-fr-lin15-sample.json` ·
`v-es-madrid-alin-count.json` · `v-es-madrid-alin-sample.json` · `v-si-regcrte-hits.xml` ·
`v-si-regcrte-f1.xml` · `v-hh-baugrenze-hits.xml` · `v-hh-ueberbaubar-hits.xml` ·
`v-hr-gp-hits.xml` (the 502) · `v-hr-gp-caps.xml` · `v-hr-gp-hits2.xml` (89,911) ·
`v-al-count.json` · `v-al-feature.json` · `v-lu-pag-dataset2.json` · `v-lv-tapis-license.json` ·
`v-hr-nipp-244.json` · `v-fr-wfs-caps-head.xml` · `v-fr-cgu.html`
