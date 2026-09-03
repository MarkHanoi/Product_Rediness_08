# Envelope-Gap Master — REGION IBERIA-FRANCE

> **What this is.** The per-jurisdiction gap list for Spain (per comunidad autónoma + the named
> cities), Portugal (national + Lisbon + Porto), France (national + Paris + Lyon + Marseille + the
> RNU/PLU/PLUi/POS regimes) and Andorra. It answers, for each fabric: *does PRYZM draw a cited
> envelope today, does it refuse honestly, or is there no coverage — and what concrete thing closes
> the gap, who owns it, and how long it takes.*
>
> **Vocabulary is the founder's own** — the 33 attributes A1–F8 and the irreducible 8-field core
> (`STR-ENVELOPE-PARAMETER-REFERENCE.md`), the Sufficiency Legends L0–L7 and the paths P1–P5 / V1–V6
> (`STR-ENVELOPE-SUFFICIENCY-LEGENDS.md`), and the consume-before-compute source hierarchy P1–P6 with
> the three envelope-information types A/B/C (`STR-EUROPEAN-ENVELOPE-SOURCES.md`).
>
> **Every claim cites its evidence** — the geometry census
> (`audit/envelope-geometry-census/2026-09-02/CENSUS.md` + `census-west.md`), the 7-country hard-case
> matrix (`audit/envelope-architecture/2026-09-02/VALIDATION-MATRIX.md` + `matrix-west.md` +
> `RECONCILIATION.md`), the Europe site-intel sweeps (`audit/europe-site-intel/2026-08-31/`), the
> per-country dossiers (`docs/04-reference/jurisdictions/<cc>/`), the shipped packs
> (`packages/site-parcel-data/src/rulepacks` + `countryAdapters`) and the certification gates
> (`packages/site-parcel-data/src/l449CertificationGates.ts`). Read-only synthesis — nothing probed
> live for this file; the probing is done and committed.

---

## Region headline — read this first

**This is the deepest region PRYZM has, and it is deep in three completely different ways.**

1. **France is the single loudest CONSUME-not-BUILD win in Europe.** The Géoportail de l'Urbanisme
   (GPU) publishes the *geometric consequence of the rules* nationally, keyless, quantified live
   2026-09-02: **69,739 drawn setback lines** (`prescription_lin typepsc=15`), **51,407 setback
   zones** (surface form), **5,291 plan-masse sectors** (`typepsc=14` — the buildable volume drawn as
   a polygon) and **61,176 height-limit polygons** (`typepsc=39/02`), each carrying the `idurba`
   plan-version join and the règlement PDF address (`census-west.md` §TYPE-A-HEADLINE-1; `CENSUS.md`
   row 9 = **CONSUME-GEOMETRY**; ranked **#1 CONSUME-NOW**, score 1340). The consumer already exists
   (`countryAdapters/fr/frPrescriptionGeometry.ts`) and feeds the shipped `explicit-area` path. The
   only thing that stays a document is the *numbers* — France abolished the COS in 2014, so the
   envelope IS the entitlement (`FR-MODULE-BUILD-BRIEF.md` §3.4).

2. **Spain is a per-comunidad patchwork with a national parcel spine.** Catastro serves parcels
   nationally and is live in production; everything above it is per-CA. Only a handful of cities
   **DRAW a cited envelope** (Barcelona — the deepest fabric in the whole product — Madrid NZ-1,
   Murcia, Córdoba, Sevilla); most CAs are an **honest cited refusal** (`census-west.md` ES split;
   `l449CertificationGates.ts`). The recurring Spanish truth: the national SIU register stops one
   level above what an envelope needs — it carries buildability as *aggregate capacity per sector*,
   never a parcel-level ordinance parameter (`ES-ALL-REGIONS-STATUS.md` §0).

3. **Portugal has the best zone-identity layer in Europe and no envelope numbers.** The 2021 PDM data
   model is a **closed national nomenclature of 18 categories** — you can answer "is this parcel
   developable, and for what" nationally from the category alone, before touching any regulamento
   (`PT-PDM-DATA-MODEL-BRIEF.md`). But **every envelope number — cércea (cornice height), índice de
   utilização, número de pisos, afastamento — lives in the regulamento text**, verified field-by-field
   absent from the graphic model. This is the region's "no-cornice-height gap."

4. **Andorra is documents-only.** The one live national WFS is geological-hazard buildability, not a
   planning envelope; the per-parròquia POUPs are PDFs (`census-west.md` AD row; `CENSUS.md` row 17).

**The binding frame for the whole region:** *no European state serves a computed buildable envelope
(21/21 countries confirmed — `E5-DATA-REUSE-REPORT.md` §A.2).* The envelope is always a **composition**
— consume the geometry where it is drawn (France, Madrid lines), compile the parameters where they are
typed as data (almost nowhere in this region), and extract the rest from documents. The 7-country
hard-case matrix confirms the frozen architecture already carries every hard construction these
jurisdictions throw at it: 20 of 30 populated West cells PASS today, and not one cell needs a new
kernel, a constraint graph or a per-country engine (`VALIDATION-MATRIX.md`).

---

# SPAIN

## Spain — national spine (applies to every ES block below)

- **STATUS TODAY:** PARCELS DRAW NATIONALLY; envelope is per-CA / per-city.
- **LEGEND:** n/a at national level — the legend is set by each city's ordering type.
- **WHAT WE ALREADY HAVE**
  - **Parcel (A1):** Catastro `refcat` INSPIRE WFS + municipal ATOM, **live in production**, national
    minus the foral territories PV/NA (`census-west.md` ES row; `CENSUS.md` row 16). This is the Ω
    slot filled for the whole country.
  - **As-is physical (A5/A6 refines):** Catastro serves BuildingParts (LoD1-by-floors) + the CNIG
    MDS nDSM height raster + per-part floors/use/GFA via DNPRC — one of only two countries in Europe
    with per-floor geometry (`e5-asis-national-sweep.md` ES row = grade **A**; the concurrent
    ES-CATASTRO-3D memo owns the FXCC per-floor channel).
  - **National register (B-layer index):** SIU carries sector-level land type / surface / use /
    edificabilidad for ten regions on an agreed schema — **usable as an L0-for-envelopes / L2-for-
    determinations index, never the legal authority** (`ES-ALL-REGIONS-STATUS.md` §0;
    `STR-EUROPEAN-ENVELOPE-SOURCES.md` §5). The shipped SIU rural guard uses it as a *refusal trigger*,
    not a value source.
- **WHAT WE NEED TO BUILD THE ENVELOPE** (per-CA, itemised below). The national gift is that Ω is
  always filled; the fight is always the P and V slots, always per-comunidad, because there is no
  national planning register.
- **EFFORT:** n/a (spine is done). The one national-scale unblock is **automated document extraction
  per CA** — every CA that refuses today refuses for the same reason (numbers in ordinance text/PDF),
  not for want of a parcel or a zone code.

---

### Barcelona / Catalonia (the deepest fabric in the whole product)

- **STATUS TODAY:** DRAWS A CITED ENVELOPE — the richest jurisdiction PRYZM has, multiple regimes live
  behind signed gates.
- **LEGEND:** mixed and complete — **L2** (aligned-to-street: clau 12/13 Eixample, depth + alçada per
  amplada de vial), **L3** (free-standing ratios: clau 20a aïllada + tiered occupation 350.2), and
  **L0** (explicit volume: clau 18 `OV_Trames`). Barcelona is the reference embodiment of L0/L2/L3 in
  the reconciliation (`RECONCILIATION.md` T2).
- **WHAT WE ALREADY HAVE**
  - **Street-width heights (A4→C2):** Art. 327 alçada reguladora tables live per subzona
    (`bcnAlcadaReguladora.ts`, `bcnAlcada20aAillada.ts` Art. 342.5 four-column ladder) over a
    *constructed* street-width fact (`ampladaDeVial.ts` + `bcnOfficialStreetWidths.ts`), with band-edge
    straddle → **cited refusal** (`matrix-west.md` §3 = PASS, BCN live).
  - **Buildable depth (C4):** Art. 242.2 block-derived depth as an independent-oracle-audited bisection
    (`blockDerivedDepth.ts`); the ≥30% free-block figure with the 11/30 clamp.
  - **Explicit volume (C6 / L0):** clau 18 `OV_Trames` footprints + `PLANTES`, **certified and signed**
    — `BCN_REFOS_OV_CERTIFIED = true`, SIG-3, covering **22.5% of BCN private buildable land**
    (`bcnRefosOVProvider.ts`; `l449CertificationGates.ts`; census top-10 #6 context).
  - **Stepbacks / tiers (C6):** Art. 350.2 two-tier tiling live for clau 22a (`esBarcelonaIndustrial.ts`,
    `tiered-occupation` kind).
  - **Terrain datum (A2):** Art. 240 façade rasant machinery — the L-584 "measure at the façade, not the
    centroid" scar closed (`facadeRasantDatum.ts`; `matrix-west.md` §10 = PASS).
  - **Overlays (B4):** clau 18 explicit geometry, heritage, Catalunya flood overlay all live
    (`matrix-west.md` §11 = PASS for ES).
- **WHAT WE NEED TO BUILD THE ENVELOPE** (Barcelona is near-complete; these are refinements, all in the
  UNDERSTATE/caveat direction — none is overstate-capable):
  - Slope-conditioned edificabilitat (Art. 255 −20%/−40%/inedificable) — **US** — carried as a
    `SLOPE_CAVEAT` on every hillside 20a output today, stated as an upper bound; needs a `slope` fact +
    a terrain model in the legal path (matrix GAP A#14; `esBarcelona20aAillada.ts`).
  - Roof-volume above the cornisa (coronació) — **US** — needs the inclined-plane / height-field kernel
    primitive (K1, in-flight); omission understates today (`matrix-west.md` §4).
  - `Cotes` dimension polylines (4,725 with `LONGITUD` metres) are digitised but LOOSE — **DATA** —
    would sharpen depth if spatially bound (`census-west.md` ES split, Catalonia row).
- **EFFORT:** already live; the two kernel/fact refinements are shared with the whole region (one K1
  investment serves five countries — `VALIDATION-MATRIX.md` §A). **The one thing that unblocks the most
  here is nothing — Barcelona is the exemplar the rest of Spain is measured against.**

> **Catalonia-wide** stays a deliberate refusal (`CATALUNYA_ENVELOPE_VERIFIED = false`) — no
> Catalonia-wide instrument exists; do not "fix" by flipping. The other AMB municipalities
> (L'Hospitalet, Badalona, Sant Boi, Cornellà) are wired end-to-end and SHUT — see AMB metro below.

---

### Madrid (city + Comunidad)

- **STATUS TODAY:** PARTIALLY DRAWS — the NZ-1 explicit-geometry ring draws; the general PGOUM-97
  envelope is an HONEST CITED REFUSAL.
- **LEGEND:** **L0/L1** for NZ-1 (explicit fondo geometry + per-manzana coefficient); **L2** (aligned,
  ancho-de-calle heights) for the general capital envelope, currently refused.
- **WHAT WE ALREADY HAVE**
  - **NZ-1 explicit envelope (C6 / L0):** Fondo de la Edificación polyline + per-manzana `COEF_Z`,
    **certified and signed** — `MADRID_NZ1_CERTIFIED = true`, SIG-M2 (signed 2026-08-02), drawing via
    the `explicit-area` engine branch (`resolveMadridNZ1Ring.ts`, `esMadridNZ1.ts`; `matrix-west.md`
    §6 = PASS).
  - **Official alignment lines (A3/C5 geometry):** `sigma.madrid.es` layer 8 = **29,105 alineaciones**
    (`ALIN_DESC "Alineación Oficial"`), re-proven live 2026-09-02 (`census-west.md` TYPE-A-HEADLINE-5;
    CONSUME-NOW #6). The machinery to consume these lines exists (same shape as NZ-1).
  - **Street-width heights (A4→C2):** Arts. 8.4.10/8.9.10.1 ancho-de-calle bands live in the pack
    (`madridAnchoDeCalle.ts`), with band-edge refusal — machinery PASS, **publication tier
    `pipeline-extracted-unverified` behind the human gate** (`matrix-west.md` §3).
  - **Height-proportional retranqueos (C5):** NZ 4/5/8/9 `max(k, H/n)` packed at the conservative
    max-H pairing (`esMadridPgoum97.ts`).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **Sign the PGOUM-97 capital transcription** — **FOUNDER** — `MADRID_ENVELOPE_VERIFIED = false`; the
    founder has stated the narrower text they would sign and asked for a targeted review of the
    transcription first (SIG-M1). A stated willingness is not a signature — the gate stays shut until
    the review + signature land (`l449CertificationGates.ts`).
  - **Consume the 29,105 alignment lines into the NZ-1 pack** — **US** — extend the existing explicit-
    area pack; do NOT consume the fondo layer 12 (count=1, OBJECTID-only, semantics unverified — repo
    warning stands) (`census-west.md` CONSUME-NOW #6).
  - **Fix the NZ 5 front-to-street-centreline separation** — **US** — the one documented overstate hole
    in the West matrix: NZ 5 front separation is to the street centreline (H/2 − W/2), a rule type no
    `GeometricRule` kind expresses; held in check today only by FAR + 50% ocupación
    (`esMadridPgoum97.ts:636–652`; `matrix-west.md` §2).
  - **Comunidad de Madrid (the 178 non-capital municipalities):** sign `CM_SPACM_ENVELOPE_VERIFIED`
    (=false) — **FOUNDER** — the `VPLA_V_ORDENANZA` adapter is proven (93,839 feats, altura 70.2% /
    plantas 72.9% populated) but the transcription is unsigned; a separate publisher and corpus from
    the capital, so one signature must not open the other (`esMadridSpacm.ts`; `census-west.md` Madrid-CA
    row).
- **EFFORT:** days. **The one thing that unblocks the most is the SIG-M1 signature** — the capital
  machinery is built and the alignment geometry is one probe away from consumption; only the human
  sign-off is missing.

---

### Murcia (city + region)

- **STATUS TODAY:** DRAWS A CITED ENVELOPE (city), with named sub-rules held in refusal.
- **LEGEND:** **L2** (aligned-to-street; ancho-de-calle heights).
- **WHAT WE ALREADY HAVE**
  - **Certified envelope (signed):** `MURCIA_ENVELOPE_VERIFIED = true`, SIG-MU1
    (`esMurciaEnvelope.ts`; `l449CertificationGates.ts`).
  - **Street-width heights (A4→C2):** Arts. 5.3.3/5.5.3/5.7.3/5.9.3 ancho-de-calle bands live
    (`esMurciaAnchoDeCalle.ts`), sharing the region-agnostic band-edge guard rather than minting a
    second one (`matrix-west.md` §3 = PASS).
  - Zoning is parcel-precise via `wms_RPG0` / the PGOU layers.
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **Sign SIG-MU2** — **FOUNDER** — until then the RC/RM/RN/RD 3rd-storey heights stay REFUSED
    (`matrix-west.md` §3).
  - **Frontage classification for MX zones** — **US** — MX height depends on WHICH frontage (eje
    principal 5pl/16m vs secundaria 3pl/10m); refused because "PRYZM does not classify Murcia
    frontages" — needs the per-edge A3 frontage attribute (`esMurciaPgou2012.ts:375`; the A3 gap named
    in `RECONCILIATION.md` TOP-5 #5).
  - **The Murcia-region towns are all SHUT** and each names a *data* blocker, not a rule blocker:
    Cartagena (retranqueo a vial unquantified in PGMO base text — **FOUNDER** must locate the
    quantifying fichas), Lorca (parcel-lookup needs a runtime session token — **DATA**), Molina de
    Segura / Alcantarilla / Las Torres de Cotillas (viewer SPA / SharePoint 403 / paid SaaS 401 —
    **DATA**) (`l449CertificationGates.ts`).
  - **Warning already logged:** `pgou_alineaciones` is a CALIFICACIÓN *polygon* layer with no numeric
    buildable attribute, and `pgou_ejes` is a ROAD AXIS, not an alignment — do not consume either as a
    building line (`census-west.md` Murcia row; MEMORY: murcia-pgou-ejes-is-road-axis).
- **EFFORT:** SIG-MU2 = one signature (hours). The region towns are each a bespoke data-access fight
  (days–weeks each) with no shared unblock.

---

### Córdoba

- **STATUS TODAY:** DRAWS A CITED ENVELOPE — the strongest FAR+coverage+height cell in the West matrix.
- **LEGEND:** **L3** (free-standing, occupation-capped) — the honest-output star.
- **WHAT WE ALREADY HAVE**
  - **Certified (signed):** `CORDOBA_ENVELOPE_VERIFIED = true`, SIG-1
    (`esCordobaZoneClassification.ts`).
  - **Occupation-cap-without-siting (C4+D1):** Art. 13.5.2.4 → the `occupation-capped-alignment` kind
    (ADR-0288), `targetAreaM2 = maxCoverage × parcelArea`, drawing a **labelled choice** rather than
    silently occupying the whole plot — the E5/A.6 trimming-policy problem solved as a first-class
    output (`matrix-west.md` §7 = PASS; the "Córdoba choice" half of the honest-output family).
- **WHAT WE NEED TO BUILD THE ENVELOPE** — nothing structural. The E5 trimming policy is applied but
  **UNDECLARED as a labelled product decision** — **US** — surface it on the output as "the one number
  that does not derive from an article" (`RECONCILIATION.md` TOP-5 #4).
- **EFFORT:** live; the declaration polish is a small shared item.

---

### Sevilla

- **STATUS TODAY:** DRAWS A CITED ENVELOPE.
- **LEGEND:** **L2/L5** (aligned + one terraced pack riding P2/P3 machinery, Art. 12.7.1).
- **WHAT WE ALREADY HAVE:** `SEVILLA_ENVELOPE_VERIFIED = true`, SIG-1 (signed 2026-08-05) — 15/15 live
  `zona_orden` codes transcribed and packed (`esSevilla.ts`; `l449CertificationGates.ts`;
  `RECONCILIATION.md` T2 L5 row).
- **WHAT WE NEED TO BUILD THE ENVELOPE:** coverage extension to more zona_orden codes as demand appears
  — **US**; no structural gap.
- **EFFORT:** live.

---

### Málaga

- **STATUS TODAY:** HONEST CITED REFUSAL — no rulepack exists.
- **LEGEND:** unresolved (cannot select a legend without a zone source).
- **WHAT WE ALREADY HAVE:** parcels (Catastro national). Nothing above it.
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **A working zone source** — **DATA** — every read of the municipal GeoServer zoning layers fails
    with an authority-side Oracle error (`ORA-28000`); nothing can be transcribed until that clears
    (`esMalaga.ts`; `l449CertificationGates.ts`). Discretionary CPPHAN allowances are correctly not
    applied.
- **EFFORT:** blocked on the authority's own server; unblock = the endpoint recovering (out of PRYZM's
  hands) or an alternative Málaga zoning channel being located.

---

### Granada

- **STATUS TODAY:** NO COVERAGE YET.
- **LEGEND:** unresolved.
- **WHAT WE ALREADY HAVE:** parcels only (Catastro national).
- **WHAT WE NEED TO BUILD THE ENVELOPE:** **everything above the parcel** — **DATA + US** — zero
  research has happened; no planning source, GIS endpoint or zone-classification method has been
  identified (`esGranada.ts`; `l449CertificationGates.ts`).
- **EFFORT:** a full city onboarding from scratch (source discovery → zone WFS → ordinance transcription
  → pack → signature). Weeks. **The unblock is the first probe** — find the Granada zoning channel.

---

### Valencia (city + Comunitat Valenciana)

- **STATUS TODAY:** HONEST CITED REFUSAL — gate not signable by construction.
- **LEGEND:** **L2** (aligned) once bound; today unresolved because the geometry is unbound.
- **WHAT WE ALREADY HAVE:** parcels (Catastro); ICV MapServer serves ordinance CODES on zones, and an
  alignment layer likely exists on the ICV MapServer (layer 212 siblings — UNKNOWN, named probe)
  (`census-west.md` València row).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **Bind the ordinance codes to their semantics** — **US + DATA** — `VALENCIA_ENVELOPE_VERIFIED =
    false` and "`zones` is empty by construction" (L-676): the codes are present but their buildable
    meaning is unbound (`esValenciaEnvelope.ts`).
  - **Locate the alignment geometry** — **DATA** — probe the ICV MapServer layer 212 siblings for
    alineación layers (`census-west.md` València row, named probe).
- **EFFORT:** days once the ordinance-code→parameter table is transcribed; the alignment-layer probe is
  the first step.

---

### Zaragoza / Huesca (Aragón)

- **STATUS TODAY:** HONEST CITED REFUSAL — signable once the reading is done.
- **LEGEND:** **L2/L3** (aligned + fondo).
- **WHAT WE ALREADY HAVE**
  - **Zaragoza:** LIVE, parcel-precise zoning — 9,031 calificación polygons, 100% populated; the four
    article selectors (A1/3.1, A1/3.2, A1/4.1, A1/4.2) all answer 200 over
    `urbanismo:Calificaciones_Urbanas` (`esAragon.ts`; `l449CertificationGates.ts` §ZGZ-SUBGRADO).
  - **Huesca:** ordinance fully read and article-cited (arts. 8.4.8 / 8.4.10).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **Zaragoza:** transcribe arts. 4.1.12/4.1.13/4.1.15/4.1.17 + the graphically-regulated fondo —
    **US** — then **FOUNDER** signature. Not waiting on data (the WFS answers); waiting on the reading.
  - **Huesca:** **georeference plano nº 5** — **US/DATA** — the ordinance remits buildable depth + storey
    count to a 1:1.000 CAD sheet whose legend is bound but which is NOT georeferenced (best candidate fix
    rejected at 2.31 m median hold-out error). "A signature cannot supply a coordinate" — what closes
    this is a georeference, not a lawyer.
- **EFFORT:** Zaragoza = days (transcription + signature). Huesca = blocked on a georeferencing solve
  that has already failed once — research-class.

---

### Canarias (Canary Islands)

- **STATUS TODAY:** HONEST CITED REFUSAL — structured data exists, unverified.
- **LEGEND:** **L2/L3** (per SIPU built-form parameters).
- **WHAT WE ALREADY HAVE:** Canarias built-form parameters are **published as structured data** (SIPU
  2.6.A `EDIF.mdb`) — unlike Córdoba there is no OCR step to distrust (`esCanariasSipu.ts`;
  `l449CertificationGates.ts`).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **Check the SIPU columns against the Normas Urbanísticas they summarise** — **US** — nobody has, and
    the schema's dominant sentinel `'I'` has an UNKNOWN meaning region-wide.
  - **FOUNDER** signature once checked (a pack may not sign for itself).
  - **El Sauzal town** is wired (cited refusal naming the ZUSO zone) but SHUT — needs the "fichero de
    ordenación anexo" that Título X defers to, plus the RE-ViUf↔Ciudad Jardín typology binding confirmed
    (currently an inference) — **DATA + US** (`esElSauzal.ts`).
- **EFFORT:** days for the SIPU column verification (data is in hand); the sentinel-`'I'` meaning is the
  first thing to resolve. **This is Spain's cheapest structured-data CA** — the parameters are already
  data, only unverified.

---

### AMB metro (the Barcelona metropolitan Refós corpus)

- **STATUS TODAY:** HONEST CITED REFUSAL — wired end-to-end, deliberately SHUT.
- **LEGEND:** assimilated to PGM claus (L2/L3), but each carries B5 site-specific override parameters.
- **WHAT WE ALREADY HAVE:** the AMB Refós transcription is wired for the 36 metro municipalities; the
  route is engineering-complete.
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **A per-municipality signature discipline** — **FOUNDER** — the gates arrive SHUT with
    `signature: null` on purpose: signing the Refós opens one VINTAGE across 36 municipalities at once,
    and the AMB asterisked qualifications are B5 derived-plan overrides whose parameters are published
    nowhere but the RPUC expedient (`STR-ENVELOPE-PARAMETER-REFERENCE.md` B5;
    `l449CertificationGates.ts` §AMB). §NO-UNSIGNED-OPEN-GATE turns RED if one is opened without its
    signature.
- **EFFORT:** the opening is a *legal act reserved to a human* (L-449), not engineering — the route is
  done. Unblock = the founder's per-municipality (or per-corpus) sign-off decision.

---

### The rest of Spain (Andalucía beyond Córdoba/Sevilla, Galicia, Extremadura, most CAs)

- **STATUS TODAY:** NO COVERAGE YET / graded from banked repo dossiers, not live.
- **LEGEND:** unresolved until a per-CA source is wired.
- **WHAT WE ALREADY HAVE:** parcels (Catastro national) + the SIU sector-level index. **Galicia** breaks
  the "no instrument = never" rule: the Plan Básico Autonómico (Decreto 83/2018) + Planes Básicos
  Municipales mean *every* Galician municipality ends up with a basic urbanistic instrument
  (`ES-ALL-REGIONS-STATUS.md` §1) — a real envelope path where the SIU census filed R0.
- **WHAT WE NEED TO BUILD THE ENVELOPE:** per-CA source discovery + ordinance transcription + pack +
  signature — **US + DATA + FOUNDER** — no alignment axis is served in `ES-ALL-REGIONS-STATUS.md` for
  these; Andalucía's forward-only 2026 schema carries `EDIF_*` but no altura; Galicia's mandate is not
  served (`census-west.md` ES split, last row).
- **EFFORT:** weeks per CA. **The one national-scale unblock is an automated ordinance-extraction
  pipeline** — the bottleneck across the whole Spanish tail is the same: parcel present, zone code
  present, numbers in a PDF.

---

# PORTUGAL

### Portugal — national + the no-cornice-height gap

- **STATUS TODAY:** ZONE IDENTITY DRAWS NATIONALLY (developability answerable); ENVELOPE is an HONEST
  CITED REFUSAL everywhere. Porto has a certified refusal card; Lisbon has no pack.
- **LEGEND:** **L2** (aligned, cércea ≤ street width) or **L6** (contextual — moda da cércea) depending on
  the categoria; L7-adjacent nowhere (Portugal is prescriptive, not discretionary).
- **WHAT WE ALREADY HAVE**
  - **Parcel (A1):** the DGT Cadastro Predial provider is wired behind `isInPortugal`
    (`parcelProviders/dgtParcelProvider.ts`), national for mainland — **but the urban cores are EMPTY**
    (Lisbon/Porto core `numberMatched 0`, measured; `census-west.md` PT row; `e5-asis-national-sweep.md`
    PT = grade D). So the Ω slot is filled *outside* the very cores where development happens.
  - **Zone identity (B2/B3) — the best in Europe:** the 2021 PDM Norma Técnica defines a **closed
    national nomenclature of 18 soil categories** (8 urban + 10 rústico), with subcategories via the
    typed `ESPECIFICA` extension mechanism, wall-to-wall topology (no gaps, no overlaps), ETRS89
    georeferencing — *and legal citation built into the mandatory schema* (`ATO_ESPECIFICO` table, the
    Diário da República reference as a required record). **You can answer "is this parcel developable,
    and for what" nationally from the category alone** (`PT-PDM-DATA-MODEL-BRIEF.md`). This is shipped
    as the CRUS zone-identity client + developability map (`countryAdapters/pt/ptCrusZone.ts`,
    `ptDevelopability.ts`, `ptPdmDataModel.ts`).
  - **Porto refusal card (certified):** `PT_PORTO_PDM_CERTIFIED = true`, §PORTO-SIGN-OFF (signed
    2026-09-02). It **draws NO envelope** — it upgrades the generic no-pack refusal to a certified
    coverage statement + the FUC tipo I/II *moda da cércea* evaluation, with the full regulamento
    extracted and article-pinned (Arts. 24.º/27.º/30.º/32.º) but never surfaced as a number
    (`ptPortoPdmDraft.ts`; `l449CertificationGates.ts`).
- **WHAT WE NEED TO BUILD THE ENVELOPE — THE "NO-CORNICE-HEIGHT GAP", stated loudly:**
  - **Extract every envelope number from the regulamento text** — **US (extraction) + DATA (the PDFs)**
    — verified field-by-field: **there is no cércea, no índice de utilização, no número de pisos, no
    afastamento, no emprise in the national graphic model** — the only numeric attribute is `MEDIDA`
    (area). Identity is fully structured; the envelope is entirely in the regulamento
    (`PT-PDM-DATA-MODEL-BRIEF.md` "The gap, now verified"). This is the P4 EXTRACT tier of the source
    hierarchy, per-PDM (~278 municípios).
  - **A `fabricDerivedHeight` / `CONTEXT_AGGREGATE` rule kind for the moda da cércea** — **US** — Porto's
    dominant height regime (Art. 3.º o: the cércea with the greatest extent along the built frontage) is
    a FABRIC-DERIVED value **no C58 GeometricRule kind can represent today**; even a complete OCR pipeline
    cannot draw it without the schema amendment. The kind is in-flight (`evaluateContextAggregate.ts`,
    ADR-0379) and the Porto flip rides it (`RECONCILIATION.md` T2 L6; `matrix-west.md` §9 for the
    class). This is the schema half of the "no-cornice-height gap": even where cércea IS a street-width
    number (FUC tipo II, the 21 m cap), the *dominant* regime is contextual.
  - **A parcel channel that reaches the urban cores** — **DATA** — the national cadastre is empty exactly
    where the cities are; a municipal cartography fallback (grade C) or the BUPi rollout is needed for
    Lisbon/Porto cores.
  - **Versioning is non-optional** — **US** — ~51% of PDMs are mid-rewrite, so a plan must carry its
    validity/version (`census-west.md` PT row, measured).
  - **Lisbon-specific: a `transferableRights` overlay kind** — **US** — Lisbon's achievable FAR depends
    on *créditos de construção* (PDM incentives Arts. 84/88/89) that no current C58 kind represents
    (`docs/04-reference/jurisdictions/pt/pt-11/1106-lisboa/ENVELOPE.md`; note that dossier is stale at
    2026-07-30 on parcel state).
- **EFFORT:** the **one thing that unblocks the most is the regulamento-extraction pipeline** (P4, per-
  PDM), because zone identity and citation scaffolding are already national and free. Porto is one signed
  schema-kind (`fabricDerivedHeight`) + the extraction away from drawing; Lisbon needs the same plus the
  transferable-rights kind and a core parcel channel. Days per city once the extraction pipeline exists;
  the pipeline itself is the multi-week investment (shared with France's règlement extraction — same
  P4-EXTRACT problem shape).

> **Trap logged:** Porto's real DICOFRE is **1312**, not the repo folder's `1315` — the pack keys on 1312
> and records the folder name as a defect (`ptPortoPdmDraft.ts` §A.0.5).

---

# FRANCE

### France — national (the consume-the-GPU-geometry win)

- **STATUS TODAY:** DRAWS A PARTIAL CITED ENVELOPE wherever the GPU publishes geometry; ZONE IDENTITY +
  CITED REFUSAL everywhere else; Paris draws end-to-end.
- **LEGEND:** **L1/L0** where the GPU draws the geometry (plan-masse = explicit volume; height polygons =
  metric V-field; setback lines = P/C5); **L2/L3** with the numbers in the règlement PDF everywhere else.
- **WHAT WE ALREADY HAVE — the region's flagship CONSUME win:**
  - **Parcel (A1):** IGN PARCELLAIRE EXPRESS national provider wired (`isInFrance`); cadastre via API
    Carto (`FR-MODULE-BUILD-BRIEF.md` §4.3; Lyon dossier confirms the national provider).
  - **Zone identity (B1/B2):** the GPU zone-identity leg produces typed, source-cited identity + a
    zone-named refusal, never a number — `libelle` (zone code), `idurba` (instrument+version),
    `nomfic`/`urlfic` (règlement doc), `is_rnu` as an ANSWER (`countryAdapters/fr/frZoneIdentity.ts`).
  - **Drawn geometry (P1 authoritative) — CONSUME, not BUILD:** the GPU publishes the geometric
    consequence of the rules nationally, keyless, quantified live — **69,739 setback lines + 51,407
    setback zones + 5,291 plan-masse sectors + 61,176 height-limit polygons**, each with the `idurba`
    join and the règlement address (`census-west.md` §TYPE-A-HEADLINE-1; `CENSUS.md` #1 CONSUME-NOW).
    **The consumer is built** (`countryAdapters/fr/frPrescriptionGeometry.ts`): it consumes plan-masse
    (R151-40), marges de recul (R151-39) and height polygons into the shipped `explicit-area` / height
    path — the same primitive `resolveMadridNZ1Ring` and the DK byggefelt feed — upgrading the
    no-extraction refusal to a **partial drawn envelope with the missing slot named** (the A.5
    degradation ladder). Licence Ouverte 2.0.
  - **Règlement retrieval is structurally sound at national scale:** `NOMFIC` fill = **99.16%**
    (100.00% wherever a zone joins its doc by `idurba`), so the `zone → règlement file → chapter by
    LIBELLE` chain works nationwide; 16.1% of values even carry a `#page=` anchor (`FR-PHASE0-REPORT.md`
    §0 — the GATE passed, PROCEED).
  - **No D1 to model:** COS abolished 2014 (Loi ALUR) — the envelope IS the entitlement; France has no
    floor-area quantum constraint. "If your schema requires a FAR to compute a yield, France is the bug"
    (`FR-MODULE-BUILD-BRIEF.md` §3.4; the nullable-D1 requirement the reconciliation confirms is met).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **The règlement-numbers extraction pipeline (P4)** — **US (build) + DATA (the PDFs, already
    addressed by NOMFIC)** — the GPU gives geometry and identity; the numeric articles (hauteur, marges
    numeric distances, emprise) live in the règlement PDF. One national extraction pipeline keyed on
    `idurba`, detecting pre-2016 (Art. 6/7/8/9/10) vs post-2016 (R151-39/40/41) structure by heading,
    ignoring any dead COS (Art. 14) (`FR-MODULE-BUILD-BRIEF.md` §3.5). Numbers are **never inferred** —
    where absent, R151-12 qualitative rules → a `discretionary` range, never interpolation.
  - **Wire the national prescription-geometry consumer end-to-end** — **US** — the module exists and
    produces the inputs the engine accepts; the remaining work is the national routing so any French
    coordinate that hits GPU geometry draws its partial envelope (the Paris pack proves the shape).
  - **Ingest the weekly national extract as the runtime source** — **US + DATA** — API Carto is a proxy
    with no availability guarantee; mirror the 28.6 GB weekly GPKG extract (per-layer, MD5-verified) and
    use the API for freshness/cache-miss only (`FR-MODULE-BUILD-BRIEF.md` §4.1; `FR-PHASE0-REPORT.md` §1).
  - **Classify the undocumented TYPEPSC subtypes** — **US** — 15/50, 15/51 and empty-subtype rows are
    not in the brief's 00/01/02/03/98 list; classify before the drawn-setback ingest
    (`FR-PHASE0-REPORT.md` §4.5).
- **EFFORT:** the geometry win is **already banked** (consumer built, licence clear, national). **The one
  thing that unblocks the most is the règlement-extraction pipeline** — the same P4-EXTRACT investment
  Portugal needs. PLUi leverage makes it tractable: **30 documents cover 25% of national population, 283
  cover 50%, 1,817 cover 75%** (`FR-PHASE0-REPORT.md` §2). Extraction pipeline = multi-week; per-city
  packs then land in days.

### France — the five regimes (how to route any French coordinate)

- **PLU / PLUi** — full parameters — **the main path** (geometry from GPU, numbers from règlement).
- **POS** — *caduc* since 27 March 2017 — treat as dead, fall through to RNU unless replaced. **Still
  live in the DB** (2,315 doc_urba rows) so the fall-through is genuinely exercised (`FR-PHASE0-REPORT.md`
  §4.9).
- **Carte Communale** — no own règlement, zoning only — RNU rules apply.
- **RNU** — *constructibilité limitée* — **PERMANENT REFUSAL, never an envelope**: construction is only
  within the *parties actuellement urbanisées*, a case-by-case call in no dataset (~19% of communes by
  the current GPU flag; 23.77% of surface by the older SuDocUH figure — re-derive before quoting)
  (`FR-MODULE-BUILD-BRIEF.md` §3.3; `FR-PHASE0-REPORT.md` §2 RNU census). The `is_rnu` flag is an ANSWER,
  not a gap.
- **PSMV** — building-by-building (secteur sauvegardé) — requires the specific document; a PSMV parcel
  legitimately has no PLU height sector (the Paris pack names this on its refusal).

### Paris (75056)

- **STATUS TODAY:** DRAWS A CITED ENVELOPE — live end-to-end since 2026-09-02.
- **LEGEND:** **L0/height-field** — explicit polygon + min-of-candidates.
- **WHAT WE ALREADY HAVE:** `FR_PARIS_PLU_CERTIFIED = true`, §PARIS-SIGN-OFF (signed 2026-09-02 by
  founder directive). The plan des hauteurs (`plub_hauteur` sectors 18/25/31/37 m), the ECM polygon with
  its graphic height, and the HMC (UG.3.2.2, NGF) resolve per-point to `min(ceiling, ECM graphic,
  HMC-relative)` with `heightBinding` recorded (`frParisPluBioclimatique.ts`; `matrix-west.md` §6 = PASS;
  D1 = "Paris is LIVE, not a refusal jurisdiction").
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **Gate fixtures for the live route — URGENT** — **US** — `computeParisEnvelope` draws real volumes
    for real users and is walked by **no** ga-gate; per-jurisdiction frozen fixtures are urgent for
    fr-75056-paris (`matrix-west.md` D1; `VALIDATION-MATRIX.md` IMPLEMENT-NOW #4).
  - **Inclined-plane couronnement (C6)** — **US** — the UG.3.2.4 crown taper is refused per-component;
    the straight prism ships WITH the "true envelope is at most this" caveat. Needs the K1 height-field
    primitive (`matrix-west.md` §4).
  - **HMC-as-cap needs the façade rasant (A2)** — **US** — HMC is NGF absolute; converting to a height
    cap needs terrain + datum conversion (shared A#7/A#14 seat with ES; `matrix-west.md` §10).
  - **Name héberges on the refusal (A6)** — **US** — the neighbour-party-wall dependency has zero repo
    hits and is only implicitly covered by the generic cumulative refusal; cheapest fix is one word in
    `PARIS_PLU_MISSING_RULES` (`matrix-west.md` §9).
  - **Sign the verifier** — **FOUNDER** — VERIFICATION.md still reads `Verifier: UNASSIGNED`; the gate is
    open on the founder's directive but the formal verifier slot is empty (`l449CertificationGates.ts`
    UNSIGNED-OPEN-GATES history).
- **EFFORT:** live; the gate fixtures are the urgent next step (days), the kernel/datum items are shared
  region-wide.

### Lyon (69123)

- **STATUS TODAY:** NO PACK — the cheapest remaining French envelope path.
- **LEGEND:** **L2/height-field** — `pluhauteur` gives direct absolute-metre max heights, no decoding.
- **WHAT WE ALREADY HAVE:** national parcel provider wired; `data.grandlyon.com`
  `plu_h_opposable.pluhauteur` gives **direct absolute-metre** max heights (verified live 2026-07-23) —
  no coded-letter decoding step like Paris (`docs/04-reference/jurisdictions/fr/fr-ara/69123-lyon/
  ENVELOPE.md`).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **Probe `pluhauteur` null-rate / parcel-coverage** — **DATA** — the single most important remaining
    probe (currently UNPROBED).
  - **Source emprise au sol (CES) + setbacks from the PDF règlement** — **US + DATA** — confirmed NULL in
    the GIS attributes.
  - **Join the Lyon + Villeurbanne `périmètres de hauteurs de façades` overlay** — **US** — a structural
    exception inside the 58-commune PLU-H that does not use the `pluhauteur` attribute path.
  - Wire the GPU + Grand Lyon endpoints into `siteDispatch` — **US** — documented/live-verified, not yet
    wired.
- **EFFORT:** the cheapest FR pack after Paris — days once the `pluhauteur` coverage probe returns.
  **Unblock = the one coverage probe.**

### Marseille (13055)

- **STATUS TODAY:** NO PACK — research complete, scaffold only.
- **LEGEND:** **L2 with graphic primacy** — a new precedence resolution kind.
- **WHAT WE ALREADY HAVE:** national parcel provider; full research on the PLUi AMP Territoire 1
  (approved 19/12/2019); the governing chain identified (`parcel → PLUi AMP Territoire 1 → règlement
  graphique PRIMARY → règlement écrit FALLBACK`) (`docs/04-reference/jurisdictions/fr/fr-pac/
  13055-marseille/README.md`).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **A "graphic-primacy precedence" rule kind** — **US** — attempt the graphic layer height first, fall
    back to the written zone article only where the graphic layer is silent; the precedence is stated in
    the règlement itself, so reversing it is a legal-accuracy bug (ADR-0270 / C58 §2.2).
  - **Do not confuse Territoire 1 with Pays d'Aix** (separate Territoire, approved 5/12/2024) — a
    Marseille pack covers Territoire 1 only — **US** (logged trap).
- **EFFORT:** days once the graphic-primacy kind lands (shared with any graphic-primary French PLUi).

---

# ANDORRA

### Andorra

- **STATUS TODAY:** NO COVERAGE YET — documents-only.
- **LEGEND:** unresolved — no machine-readable planning geometry found, so no legend can be selected
  today; the fabric is prescriptive (per-parròquia POUP), not discretionary L7.
- **WHAT WE ALREADY HAVE**
  - The one live national WFS (`ideandorra.ad/Serveis/wms_edificabilitat/wfs`, WFS 2.0, probed 2026-09-02)
    is **GEOLOGICAL-HAZARD buildability**, not a planning envelope — sampled `Risc: "Corrents
    d'Arrossegalls"`, a study PDF per zone. A **constraint channel** (the spatial-constraints layer of
    `STR-EUROPEAN-ENVELOPE-SOURCES.md` §6), useful as a negative overlay, never a value source
    (`census-west.md` AD row; `CENSUS.md` row 17 = DOCUMENTS-ONLY, MRQ 1).
  - No PRYZM parcel provider, no pack, no router predicate (there is no `countryAdapters/ad`).
- **WHAT WE NEED TO BUILD THE ENVELOPE**
  - **A parcel channel** — **DATA** — no national parcel WFS found; cadastres are comú-level (named
    probe: per-comú viewers).
  - **The POUP zoning geometry** — **DATA** — not found as a WFS (UNKNOWN, named probe: comú
    viewers / geoportal catalogue walk).
  - **Extract POUP envelope parameters from the per-parròquia PDFs** — **US + DATA** — the 7 comuns'
    POUPs are documents; edificabilitat/height/setback numbers are in them.
  - **Read the licence** — **DATA** — Govern d'Andorra terms unread (page fetch pending).
- **EFFORT:** a full country onboarding from source discovery upward (weeks), and the smallest market in
  the region. **Unblock = the first comú-viewer walk** to find whether the POUP is served as geometry at
  all. Lowest priority in the region; the hazard WFS is worth wiring as a constraint overlay cheaply
  regardless.

---

## Region roll-up — where the cheapest wins are

| Rank | Move | Type | Why it is cheapest |
|---|---|---|---|
| 1 | **Wire the France GPU prescription-geometry consumer nationally** | CONSUME (built) | 69,739 lines + 61,176 height polygons + 5,291 plan-masse, national, keyless, licence-clear; the module exists; Paris proves the shape (`census-west.md`; `frPrescriptionGeometry.ts`) |
| 2 | **Extend Madrid NZ-1 with the 29,105 alignment lines** | CONSUME | already-registered pack; lines re-proven live; do NOT touch the fondo layer 12 (`census-west.md` #6) |
| 3 | **Sign the open Spanish transcriptions** (Madrid PGOUM SIG-M1, Murcia SIG-MU2, CM-SPACM) | FOUNDER | machinery built, only the human sign-off missing (`l449CertificationGates.ts`) |
| 4 | **Verify the Canarias SIPU columns** | US | parameters are already structured data (`EDIF.mdb`); resolve the sentinel-`'I'` meaning, then sign |
| 5 | **Build the P4 règlement/regulamento extraction pipeline** | US (shared FR + PT) | the single largest multiplier: it unblocks the France numeric tail AND every Portuguese city at once — both are the identical "identity national + free, numbers in the PDF" shape |
| 6 | **Land the `fabricDerivedHeight` / `CONTEXT_AGGREGATE` kind** | US (in-flight) | closes Porto's moda-da-cércea, the "no-cornice-height gap" schema half; also serves ES neighbour-derived + FR filet-M |

**The single most-unblocking investment for the region is #5 — one document-extraction pipeline** — because
France and Portugal are the same problem: national zone identity is already served and free (GPU `idurba` /
CRUS 18-category), Ω is filled, and the *only* thing standing between them and a drawn envelope is turning
règlement / regulamento PDF numbers into cited parameters, deterministically, refusing where R151-12 /
prose says no number exists.
