# LANE 3 — SPAIN + FRANCE + PORTUGAL deep audit

> europe-site-intel campaign · lane `es-fr-pt` · researched 2026-08-31.
> Authority: `../BRIEF.md` (§5 structure, §6 country focus, §32 honesty rules).
> Classification letters per §1: A EXISTING DATA · B EXISTING OSS CODE · C EXISTING API/SERVICE ·
> D EXISTING STANDARD · E DERIVABLE · F EXTRACTABLE (doc/AI) · G GENUINELY MISSING · H PRYZM IP.
> Licence colour GREEN/YELLOW/RED per §9; access-vs-ownership option 1–6 per §10
> (1 query dynamically · 2 cache · 3 mirror · 4 cloud-optimise · 5 store derived only · 6 metadata+on-demand).
> Every claim carries its URL + date checked. PROBED = a live request was made this lane and the
> response read; READ = documentation read, service not reached; REPO = Pryzm's own prior
> live-probed record (dated). Per the brief, PROBED > READ; a READ row is not a wired source.

## Status

- [x] Repo baseline read (GEOGRAPHIC-ROLLOUT tracker, ES/FR/PT jurisdiction dossiers, code grep of consumed endpoints)
- [x] ES sections (ES-1…ES-5)
- [x] FR sections (FR-1…FR-6)
- [x] PT sections (PT-1…PT-6)
- [x] §30 parcel chains —  6 chains, 2 per country (see the final checklist for the 3 open follow-ups)

## 0 · What PRYZM already consumes (measured from code, 2026-08-31)

Grep of `packages/`, `server/`, `apps/` (this lane, scoped, read-only):

| Endpoint | Where wired | Status |
|---|---|---|
| Catastro OVC `Consulta_RCCOOR_Distancia` (point→refcat, keyless .asmx XML) | `server/jurisdiction/parcelZoningProxy.js:53` | LIVE in prod |
| Catastro INSPIRE CadastralParcel WFS `ovc.catastro.meh.es/INSPIRE/wfsCP.aspx` | `server/jurisdiction/parcelZoningProxy.js:55` | LIVE in prod |
| Catastro INSPIRE Buildings WFS + ATOM (per-muni, e.g. 22901-HUESCA) | `packages/site-parcel-data/src/providers/aragonBbox.ts`, `rulepacks/esAragon.ts` | used as evidence, not a generic provider |
| Catalonia MUC zoning WMS `sig.gencat.cat/ows/MUC/wms` | jurisdiction router (Barcelona bbox only) | LIVE, Catalonia-only |
| Madrid `NORMAS_ZONALES` routing; València MapServer layer 212; Murcia municipal GeoServer; Córdoba `idecordoba:manzana` | per-city adapters | per tracker §4 |
| PT DGT OGC API (`ogcapi.dgterritorio.gov.pt`) + SNIC INSPIRE WFS (`snicws.dgterritorio.gov.pt`) | `packages/site-parcel-data/src/parcelProviders/dgtParcelProvider.ts` | wired-pending-proxy (NOT prod-serving) |
| FR IGN cadastre (`ign-fr`) + BD TOPO `hauteur` (`bdtopo`) | bake/terrain scripts + height pipeline | wired-live per `fr/FOUNDER-BLOCKERS.md` |

Everything below is audited AGAINST this baseline: rows marked **NOT-YET-CONSUMED** are the lane's
net-new findings.

---

# ES — SPAIN

## ES-1 · Catastro: what PRYZM does NOT yet use (all PROBED live 2026-08-31)

Baseline (§0): PRYZM uses `Consulta_RCCOOR_Distancia` + INSPIRE CadastralParcel WFS nationally, and
Buildings WFS/ATOM only as per-city evidence. The following Catastro products are LIVE, keyless,
national, and **NOT-YET-CONSUMED** as generic providers:

### ES-1.1 · OVC `Consulta_DNPRC` — per-unit descriptive data ⭐ (existing-GFA datum)
- **Class C (existing API) · GREEN (see ES-1.5) · option 1 (query dynamically)**
- PROBED 2026-08-31: `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?RefCat=2940601DF3824B`
  (Barcelona, C/ Sancho de Ávila — refcat obtained live via `Consulta_RCCOOR` at 2.1970,41.4030 the same minute).
- Returned `cudnp: 161` real-estate units, each with **use (`luso`: Comercial/Residencial…), built
  area m² (`sfc`), year built (`ant`), unit address** — JSON, no key, no auth.
- ⭐ **This closes a gap the tracker records as open**: GEOGRAPHIC-ROLLOUT §4 Madrid row says *"the
  existing-building GFA datum is measured not obtainable municipally"*. Σ`sfc` per parcel IS an
  existing-GFA datum, national, per-unit, with use mix and construction year — the input for
  *remaining* edificabilidad (consumed vs permitted), i.e. the §2–3 PRODUCT B development-potential
  delta, and for use-mix context in PRODUCT A. **SURVEYED consumed GFA, not NORMATIVE permitted GFA
  — the two sides of the same subtraction, never conflate.**
- Caveats: the .svc/json family is rate-limited informally (no published quota; Catastro asks for
  non-massive use — see ES-1.5); per-unit rows are the same data the Sede shows per refcat.

### ES-1.2 · INSPIRE Buildings WFS (`wfsBU.aspx`) — official GFA + floors per BuildingPart ⭐
- **Class A/C · GREEN (CC BY 4.0, ES-1.5) · option 2 (cache per parcel) or 3 (ATOM mirror per muni)**
- PROBED 2026-08-31, same refcat:
  - `StoredQuery_id=GetBuildingByParcel` → `bu-ext2d:Building` with `currentUse=1_residential`,
    `numberOfBuildingUnits=161`, `numberOfDwellings=133`, `conditionOfConstruction=functional`,
    `dateOfConstruction=2000-01-01`, **official gross floor area `19567 m²`** (OfficialArea).
    `numberOfFloorsAboveGround` is nil AT BUILDING LEVEL (`nilReason=unpopulated`) — it lives on parts:
  - `StoredQuery_id=GetBuildingPartByParcel` → **10 `bu-ext2d:BuildingPart`s, each with
    `numberOfFloorsAboveGround` (here 0/6/0/0/6/1/0/0/6/0) + `heightBelowGround` (3 m)** + footprint geometry.
- ⭐ Per-part floor counts × footprints = a **national LoD1-by-floors massing source** (floors ×
  ~3 m as DERIVED height) and the volumetric existing-building model for neighbour context —
  **SURVEYED floors, never normative max floors.** PRYZM's nDSM plans (tracker §3 option B) get a
  cheap national cross-check here.
- ATOM bulk: the same GML ships per-municipality via INSPIRE ATOM (already touched once for Huesca
  in `esAragon.ts`) — the mirror-grade path (option 3) when a whole city is baked.

### ES-1.3 · INSPIRE Addresses WFS (`wfsAD.aspx`) — entrance-level address points
- **Class A/C · GREEN · option 1**
- PROBED 2026-08-31 `StoredQuery_id=GetAdByRefcat&refcat=2940601DF3824B` → ~8 `ES.SDGC.AD` address
  features with coordinates (EPSG:25831), thoroughfare names (LLACUNA / SANCHO DE AVILA), locator
  designators, `siteLevel` specification. Works, keyless. NOT-YET-CONSUMED; PRODUCT A addresses layer for ES
  without OSM dependency.

### ES-1.4 · Consulta_RCCOOR family — CONSUMED (baseline), nothing new; JSON variant exists
- The `.svc/json` mirror of the coordinate services exists (same host); PRYZM parses the .asmx XML
  today — migration optional, zero urgency.

### ES-1.5 · Catastro licence — GREEN with attribution (checked 2026-08-31)
- Catastro INSPIRE services + downloads: **CC BY 4.0** per the DG Catastro licensing resolution
  (effective 2023). VERIFICATION THIS LANE: `catastro.hacienda.gob.es/webinspire/index.html` fetched
  2026-08-31 — lists the CP/AD/BU WFS + ATOM (updated twice yearly, per-municipality download) and
  links the governing `Licencia.pdf`; the PDF itself was NOT fetched this lane, so the exact CC BY
  4.0 wording is READ-level, not PROBED. Consistent with the attribution strings PRYZM already
  ships in production ("© Dirección General del Catastro"). Commercial use OK; no share-alike.
  The OVC .asmx/.svc query services carry the sede's fair-use wording (no massive scraping) —
  **GREEN for option 1/2; for option 3 mirroring use the ATOM downloads, which are the product built
  for that.** Basque Country (Álava/Bizkaia/Gipuzkoa) + Navarra are OUTSIDE DG Catastro (foral
  cadastres, own services + licences) — a per-CA seam PRYZM's national-Catastro assumption must fence.

## ES-2 · Heights & terrain — PNOA LiDAR + national building-height rasters

- **PNOA LiDAR** (IGN/CNIG): 1st coverage 2008–2015 (0.5 pt/m²), 2nd 2015–2021 (~1–2 pt/m²),
  **3rd coverage 2022–2025/26 at 5 pt/m², RGBI-coloured, publishing since Sep-2024** — Centro de
  Descargas lists 290,431 3rd-coverage files; recent 2026 publications cover Valencia, C-LM, CyL.
  Checked 2026-08-31: `pnoa.ign.es/pnoa-lidar/tercera-cobertura`, `centrodedescargas.cnig.es/CentroDescargas/lidar-tercera-cobertura` (search-verified; per-province availability must be
  checked per bake, same as FR LiDAR HD). **Class A · GREEN (CC BY 4.0, attribution "año CC-BY 4.0 scne.es") · option 4/5** (cloud-optimise tiles or store derived nDSM only).
- ⭐ **MDSnE — Modelo Digital de Superficies normalizado de Edificación** (IGN, national,
  datos.gob.es id `e00125901-spaignmds-normalizado`; plus per-CA variants e.g. GVA 1 m MDSE/MDSnE):
  a pre-computed **building-height nDSM raster**. The tracker's §3 option B ("nDSM from PNOA LiDAR —
  weeks: acquire → difference → zonal stats") is partly **ALREADY DONE by IGN** — PRYZM's remaining
  work is zonal-stats per footprint, not raster differencing. **Class A (not E) · GREEN · option 5.**
  SURVEYED height; never a normative altura.
- Cross-check triangle now available nationally: MDSnE raster × Catastro BuildingPart floors
  (ES-1.2) × footprint — three independent SURVEYED height signals before any normative reading.

## ES-3 · IDEE — catalogue, not a source

- `idee.es` is the national SDI directory (catalogue of CA/municipal services). Useful as a
  source-registry seed (§11 canonical model `Source`), not as a data plane. **Class C (discovery) ·
  GREEN · option 6.** The lane's per-CA rows below come from PRYZM's own measured audit, which is
  deeper than IDEE metadata. (Checked 2026-08-31, catalogue role only; no new probe.)

## ES-4 · Autonomous-community planning GIS — what generalises vs what stays CA-adapter

**Do not re-measure what the repo already measured.** `docs/04-reference/jurisdictions/es/ES-ALL-REGIONS-STATUS.md`
(built 2026-08-02, every cell graded MEASURED/READ/UNKNOWN) is a per-CA machine-readability audit
BETTER than anything public found this lane. Lane verdicts on top of it:

| CA | Machine-readable edificabilidad/altura? (repo grade) | Generalises? |
|---|---|---|
| Madrid | ⭐ L3 MEASURED — `VPLA_V_ORDENANZA` 93,839 feats; altura 70.2 % / plantas 72.9 % populated (n=4,000) | the SCHEMA generalises as the target shape; the service is a CA adapter |
| Catalunya | L4 framework / AMB Refós (PRYZM live) | CA adapter (MUC WMS already wired) |
| C. Valenciana | L3, ordinance codes present, semantics unbound (D-004) | CA adapter; refusal path stays |
| Andalucía | L4 framework forward-only (Normas Directoras in force 24-04-2026) — schema has `EDIF_*`+`DENS`, NO altura/plantas; corpus 0 rows | MONITOR — the 2026 Orden makes new plans machine-readable **forward-only** |
| Galicia | mandate (Anexo 3: altura+edif+ordenanza) ≠ served (classification only) | new category: SCHEMA-MANDATED-NOT-SERVED; watch SIOTUGA |
| Aragón / Extremadura | L1 — fields exist, 0-substituted or geometry-only | document-rule country inside Spain |
| País Vasco / Navarra | foral cadastres — outside DG Catastro entirely | separate adapters, both cadastre AND planning |

- ⭐ **The architecture-defining ES fact** (repo, SIU finding §0): the only NATIONAL planning model
  (SIU) carries edificabilidad at SECTOR level — one level above parcel. So Spain is structurally a
  **per-CA adapter country for PRODUCT B** with a national PRODUCT A spine (Catastro + PNOA +
  MDSnE). Nothing found this lane contradicts that; Andalusia's 2026 Normas Directoras and
  Galicia's Anexo 3 are the two live bets that individual CAs move to Danish-style structured
  delivery — both **forward-only**, so the stock of in-force plans stays document-bound (class F)
  for years.
- **Per-CA classification (brief §1):** parcel/building/GFA data = **A/C**; per-CA zoning geometry =
  **A (CA-adapter)**; edificabilidad-as-data = **A in Madrid (70 %), F (doc/AI-extract) in most of
  the rest**; alineaciones = **A where published as geometry (Murcia measured), F/G elsewhere**.

## ES-5 · §30 chains — two real parcels (all probes 2026-08-31)

### Parcel ES-A — Barcelona, C/ Sancho de Ávila 174–180, refcat `2940601DF3824B`
| Step | Result | Grade |
|---|---|---|
| parcel | Consulta_RCCOOR at (2.1970, 41.4030) → refcat + address; polygon via INSPIRE CP WFS (PRYZM prod path) | **DIRECT** (probed) |
| buildings | wfsBU Building: residential, 161 units, 133 dwellings, built 2000; 10 BuildingParts with floors 6/6/6/1 + heightBelowGround 3 m | **DIRECT** (probed) |
| zone | AMB Refós qualification (clau) via MUC/Refós — PRYZM production path, Barcelona live | **DIRECT** (repo, prod) |
| plan | PGM/AMB Refós reference | **DIRECT** (repo) |
| restrictions | heritage/derived plans: ~2,600 derived plans signed OUT of verified corpus (D-006) | **PARTIAL / HUMAN-VALIDATED boundary** |
| rules | rule pack `es-08019-barcelona` — Art. 242 constructions, cited refusals | **DOC-DERIVED + HUMAN-VALIDATED** (repo) |
| envelope | PRYZM pipeline; end-to-end resolution 20.9 % citywide (tracker §2.0.1, 2026-07-22) | **DERIVED** (where it resolves) |
| GFA | permitted: DERIVED from envelope; **existing: DIRECT — OfficialArea 19,567 m² (wfsBU) + Σ per-unit sfc (DNPRC)** | **DERIVED / DIRECT** |

### Parcel ES-B — Madrid, C/ Castelló 47, refcat `2255404VK4725E`
| Step | Result | Grade |
|---|---|---|
| parcel | Consulta_RCCOOR at (−3.6820, 40.4270) → refcat + address | **DIRECT** (probed) |
| buildings | same national wfsBU service (probed on ES-A; not re-run for this refcat) | **DIRECT** (service-level) |
| zone | ⭐ PROBED: `idem.comunidad.madrid/geoserver3/wfs` `sitcm:VPLA_V_ORDENANZA`, bbox EPSG:25830 → **NZ 1, grado 3º (N1.3), Suelo Urbano, uso Residencial, tipología manzana cerrada, IT_ATICO "Si. Retranqueado 3m", DS_DOCU=PLAN GENERAL**. ⚠ EPSG:4326 bbox returns 0 silently — axis/CRS trap; query in 25830 | **DIRECT** (probed) |
| plan | PGOUM 1997 (DS_LEY: CM Ley 9/1995) | **DIRECT** (from same feature) |
| restrictions | not probed this lane (catálogo/protecciones separate layers on same GeoServer) | **UNKNOWN** |
| rules | NZ-1 numeric params: altura populated only 3.6 % in the capital (repo MEASURED) → ordinance text carries them; PRYZM SIG-M2 ring publishes, SIG-M1 certification open | **DOC-DERIVED, HUMAN-VALIDATED pending** |
| envelope | PRYZM RC-1 (NZ-1 ring only); production router still Barcelona-gated | **DERIVED (partial) / MISSING in prod** |
| GFA | permitted: blocked on rules; existing: DNPRC per-unit sfc (service probed on ES-A) | **MISSING / DIRECT** |

⭐ The Madrid WFS feature itself carries rule FRAGMENTS as data (ático retranqueo 3 m, tipología,
compatible uses) — richer than the repo's altura/plantas-population figures alone imply; the
0-features-on-4326 silent failure is the exact "empty ≠ failure" trap in MEMORY.

---

# FR — FRANCE

Repo baseline: `fr/FRANCE-GEOSPATIAL-DATA-INVENTORY.md` (2026-07-30, VERIFIED-STRONG physical
layers, re-probe-before-prod flags) — this lane RE-PROBED the planning plane and audits the rule
plane; physical rows are only cross-checked where cheap.

## FR-1 · Géoportail de l'Urbanisme (GPU) — PROBED 2026-08-31, all green

- **Class C · GREEN (Licence Ouverte/Etalab 2.0) · option 1/2**
- `apicarto.ign.fr/api/gpu/zone-urba?geom=<Point>` PROBED at three points:
  - Paris Marais (2.3522, 48.8566) → `US "Zone urbaine Sauvegardée"`, `partition PSMV_75056_A`,
    règlement PDF `75056_reglement_20131218_A.pdf` — GPU serves PSMV/secteurs sauvegardés too.
  - Paris 11e (2.3790, 48.8580) → `UG "Zone urbaine générale"`, **`idurba 75056_PLU_20260616`** —
    the PLU bioclimatique revision of 2026-06-16 is ALREADY SERVED; freshness is weeks, not years.
  - Lyon Presqu'île (4.8357, 45.7640) → `UCe1b` with a full prose zone description in `libelong`,
    **`idurba 200046977_PLUI_20260326`** (Métropole de Lyon PLUi-H, 2026-03-26 consolidation).
- ⭐ `apicarto.ign.fr/api/gpu/prescription-surf` PROBED (Paris 11e) → 4 overlapping prescriptions
  including **`"Hauteur plafond"` (typepsc 39-02)** — height-ceiling POLYGONS as data — plus
  tourist-lodging control and ecological-continuity sectors. ⚠ the numeric value was NOT in `txt`
  at this point (empty) — the height NUMBER may sit in the polygon label elsewhere or only in the
  règlement; treat prescription geometry as DIRECT and its parameter as ZONE-DEPENDENT (probe per
  document). Also exist: `prescription-lin`, `prescription-pct`, `info-*`, `secteur-cc` endpoints.
- Bulk plane (repo, REPO-grade): WFS `data.geopf.fr/wfs` `wfs_du:zone_urba` etc., apikey `gpu`,
  5,000-feature cap — for bakes; API Carto for per-parcel queries (option 1) — no key observed in
  this lane's probes.
- **Coverage honesty (READ 2026-08-31):** upload to GPU is MANDATORY since 2020-01-01 for
  new/revised documents (geoportail-urbanisme.gouv.fr FAQ; préfecture pages). >13,000 DU + ~90,000
  SUP hosted (2023 figure). **A 2026 percent-of-communes-covered figure was NOT found** — rural
  communes under RNU or with un-digitised POS/cartes communales remain outside; RNU communes are
  themselves an answer (national rules), not a gap. Record coverage per-département at bake time;
  do NOT assume national completeness.

## FR-2 · CNIG PLU standard — assessed as a structured-rule schema (Class D)

- The **CNIG "Prescriptions nationales pour la dématérialisation des documents d'urbanisme"**
  (current PLU standard v2024-01, `cnig.gouv.fr/IMG/pdf/231220_standard_cnig_plu_v2024-01.pdf`;
  also on schema.data.gouv.fr as `cnigfr/schema-plan-local-urbanisme`) IS a structured data model:
  `zone_urba` (typezone U/AU/A/N + libelle), `prescription_surf/lin/pct` with a **national
  enumerated typology (`typepsc`/`stypepsc` codes — hauteur plafond, emplacements réservés,
  alignements, espaces boisés…)**, `info_*`, SUP model, and file-naming/idurba conventions the GPU
  enforces at upload. Checked 2026-08-31 (standard PDF located; typology observed live in FR-1).
- **What it is NOT:** the numeric articles (hauteur max, emprise, retraits, CES/densité) of the
  règlement are NOT modelled as data — the standard structures the MAP + document METADATA + a
  prescription typology, and links each zone to its règlement PDF (`nomfic`/`urlfic`). France is
  therefore **structured-GEOMETRY + document-RULES**: better than raw PDFs (the zone join and the
  prescription typology are free), one level below DK Plandata / XPlanung.
- **Rule-extraction leverage:** `idurba` versioning (`75056_PLU_20260616`) gives document identity +
  date for the evidence graph (§11) for free; règlement PDFs are addressable per zone. An OCR/AI
  règlement pipeline (repo's stated FR bet) plugs into a NATIONAL join key — build ONE French
  adapter, not per-commune ones. **Class D standard + F rules · GREEN.**
- CNIG work on structuring the règlement itself ("SmartPLU" research lineage; renewal discussions)
  was FOUND ONLY as secondary mentions this lane — NOT CONFIRMED as a published standard; do not
  cite a "machine-readable règlement standard" as existing. (Checked 2026-08-31.)

## FR-3 · Cadastre — PCI/Etalab (CONSUMED baseline, verified)

- **Class A/C · GREEN · option 1/2.** apicarto cadastre PROBED (FR-6 parcels): stable 14-char `idu`
  (dep+com+com_abs+section+numero), `contenance` m². Licence Ouverte 2.0 (IGN/DGFiP products);
  `cadastre.data.gouv.fr` Etalab build. NOT survey-precise (graphic plan) — repo caveat stands;
  never measure setbacks against it after reprojection (§32 lesson 5).

## FR-4 · Buildings + heights — one repo-inventory UPGRADE found

- BD TOPO `batiment` + `hauteur`: REPO-grade (live-probed 2026-07-23 by PRYZM, non-null in Paris).
  Unchanged.
- ⭐ **UPGRADE: IGN now publishes MNH LiDAR HD (Modèle Numérique de Hauteur = normalized DSM) as an
  open national product** (`cartes.gouv.fr` MNH LiDAR HD; data.gouv.fr "MNT/MNH LiDAR HD"; first 3D
  models 2025-03-27, updated 2026-08-07). The repo inventory (2026-07-30) records height as
  "DERIVED: nDSM = DSM − DTM per-footprint, our module" — for France the differencing is now
  PRE-COMPUTED by IGN, same as Spain's MDSnE (ES-2). PRYZM's job shrinks to zonal stats. **Class A ·
  GREEN (Etalab 2.0) · option 5.** LiDAR HD target: full metropolitan + DROM-minus-Guyane by
  end-2026; per-département availability map is the gate
  (`macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD`). Checked 2026-08-31.

## FR-5 · French OSS + civic tech + competitors (checked 2026-08-31)

| Item | What | Class | Verdict |
|---|---|---|---|
| **SimPLU3D** (`github.com/IGNF/simplu3D`) | IGN COGIT research lib: generates built configurations satisfying PLU rules (simulated annealing over constrained boxes). Java, CeCILL, 25 stars, 597 commits, research-era (2016–2018), deps GeOxygene/librjmcmc4j | B | **MINE FOR CONCEPTS, do not depend** — the rule→constraint→envelope decomposition (simplu3d-rules) is prior art for §18; stack (Java/GeOxygene) incompatible, activity stale |
| **PLU++ / SmartPLU** (`ignf.github.io/PLU2PLUS`) | IGN+EIVP research: 3D visualisation of PLU-compliant simulations (2015–2017) | B | MONITOR only — historical |
| **Docurba** (`docurba.beta.gouv.fr`) | beta.gouv/DGALN service: assists communes producing CNIG-compliant DU + tracks document lifecycle | C | context only — it feeds GPU quality upward; not an API for us |
| **PLU Analyzer** (data.gouv reuse) | downloads+parses GPU documents | B | inspect if règlement-OCR is built |
| Commercial: **Parcello** (30-s constructibilité, 36k communes), **plufr.fr** (AI PLU analysis), **CityCode.ai**, **UrbaPlus/Urbassist** | FR parcel→PLU-analysis startups, all GPU-fed | — | competitor evidence: the FR document-rule OCR play is CROWDED; differentiation = deterministic envelope + evidence graph, not PLU summarisation |
| **"Polis"** | ⚠ NOT IDENTIFIED. The brief names "the Polis project"; this lane could not confirm any French urbanisme project of that name (candidates found and rejected: Pol.is deliberation platform; POLIS EU mobility network; no beta.gouv/IGN/CNIG hit). **Flag to orchestrator: clarify referent** | — | UNRESOLVED — recorded per §32 (no claim without confirmation) |

## FR-6 · §30 chains — two real parcels (probed 2026-08-31)

### Parcel FR-A — Paris 11e, idu `75111000BK0051` (section BK n°0051, 388 m²)
| Step | Result | Grade |
|---|---|---|
| parcel | apicarto cadastre at (2.3790, 48.8580) → idu + contenance | **DIRECT** (probed) |
| buildings | BD TOPO `batiment` + `hauteur` (repo live-probe 2026-07-23, Paris non-null) | **DIRECT** (REPO) |
| zone | GPU zone-urba → `UG`, PLU bioclimatique `75056_PLU_20260616` | **DIRECT** (probed) |
| plan | idurba + règlement PDF `75056_reglement_20260616.pdf` addressable | **DIRECT** (document link) |
| restrictions | GPU prescriptions → 4 incl. "Hauteur plafond" polygon (39-02); SUP via GPU `assiette-sup-s` (not probed) | **DIRECT geometry / value pending** |
| rules | hauteur/emprise/retraits numbers live in the règlement PDF | **AI-EXTRACTED (to build)** — F |
| envelope | no production FR envelope in PRYZM | **MISSING (H to build on F)** |
| GFA | permitted: MISSING; existing: BD TOPO volume proxy (DERIVED) — no open per-parcel GFA register equivalent to ES DNPRC found this lane | **MISSING / DERIVED** |

### Parcel FR-B — Lyon Presqu'île, idu `69382000AB0062` (AB 0062, 2,861 m²)
| Step | Result | Grade |
|---|---|---|
| parcel | apicarto cadastre → idu | **DIRECT** (probed) |
| zone | GPU → `UCe1b`, PLUi `200046977_PLUI_20260326`; libelong carries zone doctrine prose | **DIRECT** (probed) |
| plan/restrictions/rules/envelope/GFA | same shape as FR-A: geometry DIRECT, numbers F (règlement PDF per zone), envelope MISSING | as FR-A |

**France verdict:** PRODUCT A = A/C GREEN, essentially done (IGN spine + repo wiring). PRODUCT B =
structured geometry with national join keys + document rules → the correct FR adapter is ONE
national règlement-extraction pipeline keyed on `idurba`, ranked behind DK/NL/DE in payoff-per-effort
but ahead of most Spanish CAs on plumbing (national portal, enforced standard, PDF addressability).

---

# PT — PORTUGAL

Repo baseline: `pt/PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md` (probes of 2026-07-31: DGT OGC API live,
SNIC WFS live 1,789,404 parcels CC BY 4.0, Lisbon/Porto-core coverage UNKNOWN = standing #1 blocker).
This lane RE-PROBED the OGC API and MEASURED three things the repo marks open.

## PT-1 · DGT platform — one repo CORRECTION + the Lisbon answer (PROBED 2026-08-31)

- ⭐ **CORRECTION to the repo's 2026-07-31 probe: the DGT OGC API now serves the parcels itself.**
  `ogcapi.dgterritorio.gov.pt/collections` (fetched 2026-08-31) lists **`cadastro` — "Cadastro
  Predial (Continente)"** (itemType feature, storageCrs CRS84, also 4326/4258/3857/3763) alongside
  CAOP**2025** (municipios/freguesias/distritos/NUTS/trocos), COS `cos2018v4` + **`cos2025v1`**,
  COSc 2018–2022, 30 cm ortos. The repo statement "Cadastro Predial is NOT on the OGC API" was true
  on 2026-07-31 and is FALSE now — the platform moves fast; `dgtParcelProvider` can drop the WFS
  seam or keep it as fallback. ⚠ the `cadastro` collection's temporal extent reads 2000–2007 —
  CGPR-vintage geometry; licence field not present on the collection JSON (the SNIC WFS
  GetCapabilities declaration of CC BY 4.0 remains the licence anchor). **Class C · GREEN · option 1/2.**
- Live items PROBED: Tavira bbox (−7.66,37.12 → −7.64,37.14) → **numberMatched 2,615**; feature
  `AAA000582219` (`PT.DGT.CP.AAA000582219`, NIC `AAA 000 582 219`, 32 m², administrativeunit
  `081412`, beginLifespanVersion 2023-11-21).
- ⭐ **The standing #1 PT blocker is now MEASURED, negatively:** central-Lisbon bbox
  (−9.15,38.72 → −9.13,38.74) → **numberMatched 0**. The Lisbon urban core has NO parcels in the
  national cadastro — not gated, ABSENT (the BUPi/SICS regime below is how it eventually fills).
  Record `no-parcel-here` honestly; a PT adapter needs a Lisbon/Porto fallback (municipal sources
  or user-drawn), exactly as the repo's refusal path anticipates.
- SNIT (`snit.dgterritorio.gov.pt`) serves in-force IGT documents (plantas as raster WMS + PDFs);
  gov.pt confirms all in-force PDMs consultable there. Class C, viewer/document plane.

## PT-2 · PDM digitisation — standard exists, transition HALF-DONE and now MEASURED

- **Class D standard:** DGT **"Norma Técnica sobre o Modelo de Dados para o PDM"** + the 2021
  two-volume **"Modelo de Dados e Sistematização da Informação Gráfica dos Planos"**
  (`dgterritorio.gov.pt/sites/default/files/publicacoes/Modelodados_PDM_18022021_Vol1_e_Vol2.pdf`,
  checked 2026-08-31): mandatory structured VECTOR model for plantas de ordenamento +
  condicionantes of new/revised PDMs — Portugal's CNIG-analogue (geometry structured; regulamento
  numbers — índice de utilização, cércea, altura — stay in the regulation TEXT → Class F).
- ⭐ **CRUS — Carta do Regime de Uso do Solo**: DGT-produced NATIONAL aggregate of the plantas de
  ordenamento of ALL in-force mainland PDMs, **CC BY 4.0** (gov.pt/dados.gov.pt, checked
  2026-08-31; repo had it pending-probe). National PDM-zoning geometry in one layer = the PT
  analogue of France's GPU zone-urba. NOT on the OGC API `/collections` (probed — absent); served
  via SNIG/download. **Class A · GREEN · option 2/3.** Classification-level (rústico/urbano +
  categories), NOT parameter-level.
- **Transition state MEASURED (news + government figures, checked 2026-08-31):** adaptation of PDMs
  to the new soil-classification regime (end of "solos urbanizáveis", RJIGT/DL 90/2024 lineage;
  deadline extended repeatedly, last to 2024-12-31): **2023-11: 24 % · 2025-05: 111/278 (40 %) ·
  2026-08: 143/278 (~51 %) done, 135 in course** (DGT-monitored; idealista/observador reporting
  government data). ⇒ half of mainland PDMs are mid-rewrite — plan VERSIONING (§15) is not
  optional in PT; the answer "what applied on date X" changes under live municipalities.

## PT-3 · PDMFacil — private aggregator, competitor evidence, not infrastructure

- `pdmfacil.pt` (checked 2026-08-31): **260+ municipalities in one consultation**, querying
  municipal servers + SNIT in real time; exposes classification, RAN/REN, building parameters,
  regulation articles per point. It is a PRIVATE service (licence/API terms unpublished) — **not a
  data source to depend on (RED for dependency), strong evidence the per-municipal-endpoint
  federation is FEASIBLE** — someone already federated 260+ municipal services without owning data.
  Same verdict-shape as FR-5 competitors: PT point-lookup is being commoditised; the defensible
  layer is deterministic envelope + provenance. **Class C (theirs) / competitor.**

## PT-4 · BUPi cadastre completion — the PT gap MEASURED (checked 2026-08-31)

- Mainland split: ~134 municipalities carry the old CGPR "cadastro geométrico" (the SNIC/OGC
  `cadastro` data); **174 municipalities have NO cadastral registry — the BUPi RGG regime applies
  there** (rederural.gov.pt; cadastropredial.bupi.gov.pt lists the covered set).
- **Completion, government figures 2025-12-29:** >3 million properties georeferenced via BUPi by
  158 active municipalities = **34 % of the 8.94 M rustic matrices** in the 173 adherable
  municipalities. All mainland municipalities have signed adhesion. RGG submission is FREE until
  **2026-09-30** (≤50 ha rústicos/mistos), €15/€10 per RGG after 2026-10-01 — expect a submission
  spike then a slowdown; non-georeferenced rural property faces transaction friction (sales/funds).
- **Access reality:** RGG polygons are owner-declared, flow into SICS; the DGT "true cadastre"
  (CGPR+experimental) went CC BY 4.0 open on 2024-08-01; the eBUPi **GeoPortal** + Open Data BUPi
  (dados.gov.pt) publish INDICATORS and viewers — whether individual RGG geometries are openly
  redistributable was NOT confirmed this lane (candidate identity-gate; record the gate, not
  "missing", per SE/DK lesson). **Class A (CGPR open) + gated-pending-confirmation (RGG) · option 1/6.**
- ⇒ For PRODUCT A in rural PT the parcel layer is genuinely PARTIAL for years yet: 34 % of matrices
  in the uncadastered half, owner-driven, accelerating. The honest adapter behaviour is the repo's
  existing typed refusal.

## PT-5 · Municipal ArcGIS plane (Lisbon probed 2026-08-31)

- Lisbon: `websig.cm-lisboa.pt/MuniSIG/REST/sites/LxInterativa/map?f=json` PROBED → live Geocortex
  config exposing `WS_Planeamento_PDM2011_TESTE_FGC` MapServer
  (`gisbase.cm-lisboa.pt/arcgisbase/rest/services/MuniSIG_Secure/...`, copyright MARÇO 2026,
  EPSG:3763) with Planta de Condicionantes groups (33 sublayers: servidões, domínio hídrico,
  military, airport…). ⚠ the bare services directory `geodados.cm-lisboa.pt/server/rest/services`
  returns **403** — service-level access exists but the directory is fenced; `geodados-cml.hub.arcgis.com`
  (ArcGIS Hub) is the open-data face. Typical of PT municipal ArcGIS: per-municipality
  endpoints, mixed exposure — the PDMFacil existence proof (PT-3) says federation over these works.
  **Class C · YELLOW (per-municipality terms) · option 1/6.**

## PT-6 · §30 chains — two real parcels (probed 2026-08-31)

### Parcel PT-A — Tavira (Algarve, CGPR-covered), NIC `AAA 000 582 219`
| Step | Result | Grade |
|---|---|---|
| parcel | OGC API `cadastro` items, Tavira bbox → feature `AAA000582219`, 32 m², admin unit 081412 | **DIRECT** (probed) |
| buildings | no national footprint+height product; DGT LiDAR nDSM derivable (repo); COS/ortho context DIRECT | **DERIVED** |
| zone | CRUS classification polygon (national, CC BY 4.0) + PDM planta de ordenamento (SNIT raster/municipal vector) | **DIRECT (classification)** |
| plan | PDM de Tavira via SNIT (in-force document, addressable) | **DIRECT (document)** |
| restrictions | RAN/REN/servidões — published but scattered (APA/CCDR; repo row) | **PARTIAL** |
| rules | índice de utilização/cércea/afastamentos in the PDM regulamento TEXT | **AI-EXTRACTED (to build)** — F |
| envelope | none in PRYZM for PT | **MISSING (H on F)** |
| GFA | permitted MISSING; existing: no per-unit open GFA register found (matriz predial is fiscal, not open) | **MISSING** |

### Parcel PT-B — central Lisbon (Baixa/Avenidas bbox)
| Step | Result | Grade |
|---|---|---|
| parcel | OGC API `cadastro` → **numberMatched 0** — no national parcel exists here | **MISSING (measured)** — fallback: municipal sources / user-drawn |
| zone/plan | Lisbon PDM 2011 (em vigor) via municipal ArcGIS (PT-5) + SNIT | **DIRECT (municipal adapter)** |
| rules→GFA | same F/MISSING shape as PT-A; Lisbon regulamento is a well-OCRable single document | as PT-A |

**Portugal verdict:** PRODUCT A spine is strong and CHEAP (DGT OGC API, CC BY 4.0, one platform) but
parcels are the inverted weakness vs FR/ES: national-but-partial, with the urban cores EMPTY
(measured) and the rural half 34 % filled by an owner-driven process with a 2026-10 pricing cliff.
PRODUCT B: classification is national data (CRUS); parameters are per-municipal regulamento text —
document-rule country, one honest notch below France (no national prescription typology, no
per-zone PDF join key equivalent to idurba; SNIT partitions by IGT document instead).

---

# CROSS-COUNTRY SYNTHESIS (lane verdicts for the report)

1. **All three countries are PRODUCT-A GREEN with national open spines** (Catastro+PNOA+MDSnE ·
   IGN+LiDAR-HD-MNH · DGT OGC API). Pre-computed national HEIGHT rasters now exist in ES (MDSnE)
   AND FR (MNH LiDAR HD) — the repo's "our shared nDSM differencing module" is needed only for PT.
   Recommend option 5 (store derived per-footprint stats only) everywhere.
2. **PRODUCT B splits cleanly:** ES = per-CA adapters over a sector-level national model (only
   Madrid serves parcel-level parameters as data, 70 %-populated); FR = ONE national adapter over
   GPU + CNIG standard with règlement-PDF extraction (F); PT = ONE national classification layer
   (CRUS) + per-municipal regulamento extraction (F). None of the three reaches DK/NL
   structured-rule delivery; FR is closest on plumbing, ES-Madrid on payload.
3. **The ES Catastro DNPRC/BU services close the existing-GFA gap for Spain** (probed: per-unit
   sfc + OfficialArea 19,567 m² + per-part floors) — development-potential = permitted − existing
   becomes computable TODAY in ES; FR/PT have no open per-parcel GFA register found this lane.
4. **Surveyed ≠ normative discipline holds everywhere probed:** Catastro floors/GFA, BD TOPO
   hauteur, MDSnE/MNH heights, CRUS classification are all SURVEYED/DECLARATIVE planes; no probe
   this lane returned a normative parcel-level parameter outside Madrid's WFS and GPU's
   prescription geometry.
5. **Competitor pressure is in the point-lookup layer** (Parcello/plufr/CityCode/UrbaPlus in FR;
   PDMFacil in PT; Catastro viewers in ES) — nobody probed serves deterministic envelopes with
   provenance; that stays the defensible PRYZM layer (H).
6. **Traps recorded for adapters:** Madrid WFS silently returns 0 features on EPSG:4326 bbox (use
   25830); GPU prescription values may be absent from `txt` (document remains authority); DGT OGC
   API platform CHANGED capability inside one month (re-probe before prod is the right standing
   rule); Basque/Navarra foral cadastres sit outside every national-ES assumption; BUPi RGG
   openness unconfirmed — treat as gate.

## Lane checklist (final)
- [x] ES sections (ES-1…ES-5) — 7 live probes
- [x] FR sections (FR-1…FR-6) — 6 live probes
- [x] PT sections (PT-1…PT-6) — 5 live probes
- [x] §30 chains: ES-A/ES-B/FR-A/FR-B/PT-A/PT-B (2 per country)
- [ ] OPEN → orchestrator: identify the brief's "Polis project" (FR-5); confirm RGG geometry openness (PT-4); fetch Catastro Licencia.pdf verbatim (ES-1.5)
