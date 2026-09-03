# MASTER PROMPT — PRYZM Denmark Buildable-Volume Engine

> **PROVENANCE (read before citing).** Founder-forwarded, received **2026-09-03** (lane
> DK-DATA-AUDIT). Captured to the repo per the standing rule "founder research → repo docs
> same-turn". The text below is the received transmission, structure restored, wording preserved.
>
> ⚠ **TRUNCATED IN TRANSMISSION.** The forward cut off **mid-Part-10**, inside the Tinglysning
> per-property servitude field list, ending at the token **"claimant/benefic"** (evidently
> "claimant/beneficiary", but the token — and everything after it — did not arrive). Whatever
> Parts followed Part 10 (if any), and the rest of the Part-10 field list, are **NOT in the repo
> and must not be reconstructed from imagination.** If the founder re-sends the tail, append it
> below §Part 10 with its own dated provenance note; do not splice it silently.
>
> **Companion:** the audit of this prompt against PRYZM's shipped Denmark stack is
> [`DK-DATA-GAP-AUDIT.md`](DK-DATA-GAP-AUDIT.md) (same lane, same date).

---

## OBJECTIVE

Given a Danish property / address / BFE / cadastral parcel → produce the **maximum DEFENSIBLE
buildable 3D envelope + volume at a specified date**; never a generic box. Twenty numbered
determinations:

1. what land
2. which instruments
3. which rules apply — spatially **and** temporally
4. structured constraints
5. environmental/statutory constraints
6. cadastral/private-law constraints
7. existing buildings / cases
8. terrain
9. footprint
10. height
11. storeys
12. floor area
13. volume
14. roof geometry
15. setbacks
16. deterministic vs permit/dispensation-dependent
17. vs document-derived
18. vs unresolved
19. (the partition of every constraint into 16–18)
20. the 3D envelope **with an evidence trail per constraint**

The output **never implies certainty where legal evidence is incomplete**.

## PART 1 — 8 NON-NEGOTIABLE RULES

- **R1 — Authoritative sources first.** Agencies / registers / official APIs / legislation.
  Open-source only for discovery, schemas, tooling, validation — **never the legal authority**.
- **R2 — Never invent an endpoint.** Mark UNVERIFIED + verify via OpenAPI/Swagger/GetCapabilities;
  record exactly what was verified.
- **R3 — Current vs legacy.** Datafordeler is modernizing: do **NOT** build long-term on legacy
  REST/WFS scheduled for shutdown; target **GraphQL + file download + API-key/OAuth**; legacy is
  for validation/backfill only.
- **R4 — DATA ≠ LEGAL EFFECT.** Every constraint carries: source / authority / dataset /
  object-id / effective-date / geometry / legal-basis / legal-effect / confidence /
  interpretation-status.
- **R5 — PHYSICAL ≠ LEGAL.** DHM terrain is not the legal *niveauplan*; store
  `physical_terrain_reference` and `legal_height_reference` **separately**.
- **R6 — EXISTING ≠ PERMITTED FUTURE.** BBR is registered state, not future rights.
- **R7 — INDICATIVE ≠ BINDING.** Plandata *vejledende* geometry is never a hard boundary.
- **R8 — CONDITIONAL ≠ ALLOWED.** Dispensation / landzone / road / environmental / aviation /
  heritage approvals → **CONDITIONAL volume**, never added to the deterministic volume.

## PART 2 — source_registry

A `source_registry` table with fields: `source_id / authority / organization / dataset_name /
type / description / official_url / api_url / documentation_url / protocol / authentication /
coverage / geometry_type / CRS / temporal_model / update_frequency / license /
download_available / api_available / open_source_implementation / legal_relevance /
legal_effect / status / current_or_legacy / last_verified / notes` — across **31 categories
A–AE**: cadastre, property, address, planning, BBR, terrain, topography, environment, nature,
water, flood, coast, roads, road building lines, rail, aviation, heritage, archaeology,
contamination, groundwater, utilities, servitudes, building permits, dispensations, landzone
permissions, legal text, court/administrative decisions, historical data, digital municipal
plans, municipal GIS, open-source implementations.

> "Do not stop after the obvious sources."

## PART 3 — CADASTRE / PROPERTY / ADDRESS / BUILDINGS / TOPO / TERRAIN

- **3.1 MATRIKLEN/MAT** via **modern Datafordeler** (GraphQL endpoint + schema/version + file
  download + OGC + history). Entities: `Jordstykke / JordstykkeTemaflade / Matrikelskel /
  Skelpunkt / Lodflade / SamletFastEjendom / Ejerlejlighed (+lod) / MatrikelKommune / Ejerlav /
  MatrikelSogn / MatrikelRegion / MatrikulaerSag / Nullinje / OptagetVej /
  BygningPaaFremmedGrund`. **Never Google/OSM as legal parcel geometry.**
- **3.2 DAR** address resolution: address → access address → address point → property/building →
  BFE. Inputs: address / BFE / cadastral designation / municipality+parcel / coordinates.
- **3.3 EBR** (property/address/location); document the GraphQL schema.
- **3.4 BBR.** Entities: `BBRSag / Bygning / BygningEjendomsrelation / Ejendomsrelation /
  Enhed (+relation) / Etage / Fordelingsareal / Grund / GrundJordstykke / Opgang / Sagsniveau /
  TekniskAnlæg`. Extract geometry / identity / floor area / floors / use / type / dates / cases /
  permits / completion / history. Evidence of **registered state, NOT future rights**.
- **3.5 GEODANMARK Vektor**: `Bygning / Bygværk / Vejkant / Vejmidte / Jernbane / Dige / Hegn /
  Kyst / Sø / Vandløb / Skov / TekniskAnlæg / Vindmølle` — physical context, **never** legal
  property geometry.
- **3.6 DHM** (terrain + surface WCS, point clouds, historical, height curves) → DTM / DSM /
  slope / aspect / local elevation / cross-sections / statistics per candidate footprint.
  **Physical ≠ legal niveauplan.**

## PART 4 — PLANDATA

- **4.1 LOKALPLAN** (WFS/REST/download/doklink/versions/status/validity) — extract **ALL**
  fields, not just height/storeys/floor-area: `planid / kommunekode / plantype / plannummer /
  plannavn / status / versionsnr / datoforsl / datovedt / datoikraft / datoaflyst / dokumentUrl /
  zone / max height / max storeys / floor area / volume + basis / building % / built-area % /
  dwelling limits / subdivision / use-specific / preservation / signage-facade / text /
  relations / geometry`. Determine exactly which fields exist in the **CURRENT** schema.
- **4.2 BYGGEFELT** national dataset: `planid / lokplan_id / versionsnr / komnr / status /
  delnr / dates / vejledende / kunifelt / tillagtosh / sforhold / nedbrydsf / iomfangreg /
  ianvreg / kompleks / kbeskriv / izonereg / iudstykreg / anvspec* / eareal* / earealh* /
  maxbhjd* / maxetage* / boligenhed* / maxvind*` / all quantitative fields. **SEMANTICS:**
  - `vejledende = true` → not automatically a hard boundary;
  - `kunifelt = true` → must-build-inside, subject to the actual rule semantics;
  - `tillagtosh = true` → carefully resolve how field floor area interacts with higher-level
    floor-area / building-% rules;
  - `kompleks = true` → route to document/legal interpretation;
  - `iomfangreg = true` → the structured fields do **NOT** fully represent the regulation.
- **4.3 KOMMUNEPLANRAMME**: `bebygpct / bebygpctaf / bebygpctar / eareal / earealh / m3_m2 /
  m3_m2h / maxetager / maxbygnhjd / boligenhed / subdivision / use-specific / zone / future
  zone / validity / status / relation / geometry / text`. **CRITICAL: resolve the area-basis
  codes** — entire area vs individual property vs plot vs land parcel — **NEVER calculate
  volume/floor area before the denominator is resolved.**
- **4.4 KOMMUNEPLANTILLÆG**: parent plan, validity, effective date, affected framework + area,
  changed provisions, document, precedence — build a **TEMPORAL VERSION GRAPH**, never
  newest-wins.
- **4.5 KOMMUNEPLAN**: identity / status / dates / document / relationships / content / areas /
  themes.
- **4.6 DIGITAL KOMMUNEPLAN / PLAN DK4 — PRIORITY**: themes (emner) → content (indhold) → areas
  (områder) → legal references → effective periods, stored **STRUCTURED**
  (`Plan → Theme → Content → GeographicArea → LegalRef → EffectivePeriod`), never flattened to
  text — the long-term semantic planning layer.
- **4.7 KOMMUNEPLANRETNINGSLINJER**: all guideline layers — theme code / geometry / status /
  validity / legal basis / link / plan relation; a **national theme-code dictionary**; not every
  guideline is a prohibition.
- **4.8 ZONEKORT**: byzone / landzone / sommerhusområde / future zones. **Landzone ≠ automatic
  no-build.**
- **4.9 LANDZONETILLADELSER**: geometry / affected BFE–Jordstykke / permit type / status /
  effective / expiry / document / use flags → permission → purpose → temporal validity.

## PART 5 — LEGAL

- **5.1 RETSINFORMATION** official API (REST/XML / Lex Dania / ELI / identifiers / versioning /
  effective + repeal dates / references / section structure) → a legal corpus for Planloven /
  BR18 / Naturbeskyttelsesloven / Vejloven / building + environmental / aviation / railway /
  heritage / landzone laws, as
  `law → section → paragraph → subsection → effective-period → references → interpretation`;
  **never hardcode laws as unversioned constants**.
- **5.2 BR18 versioned rule objects**: building % / floor area / height / distances / storeys /
  terrain / niveauplan / secondary buildings / roof-attic / setbacks / sloping terrain. E.g.
  `RULE height_reference: INPUT natural terrain OR municipal niveauplan → OUTPUT legal height
  reference`. **Never apply current-BR18 to historical cases without an effective-date check.**

## PART 6 — ENVIRONMENTAL / STATUTORY overlays

Via Arealdata / Miljøportal +: Natura 2000 (habitat + bird) / §3 nature / fredninger / forest +
lake + stream protection lines / beach-coastal / fortidsminde lines / church / protected dykes /
contamination / groundwater / drinking-water / raw materials / protected landscapes / national
parks / habitat directives / water plans / flood / climate adaptation / coastal hazards /
erosion / wetlands / soil / other. **Per layer:** geometry / legal source / legal effect /
exceptions / prohibition-vs-permission / affects footprint-height-use / assessment-only.
**Classify EXCLUSION vs CONDITIONAL vs SCREENING vs INFORMATIONAL — never a blanket NO_BUILD.**

## PART 7 — HERITAGE

Slots- og Kulturstyrelsen / GeoDanmark / Arealdata: fredede bygninger / bevaringsværdige / SAVE /
fortidsminder / protection zones / cultural environments / archaeology / church surroundings /
UNESCO / monuments; the **FBB** WFS-WMS-API. **Separate:** building-protected vs parcel-affected
vs buffer vs planning designation.

## PART 8 — ROAD / TRANSPORT

- **8.1 Road building lines** (Vejdirektoratet / Plandata / Arealdata / vejman-derived):
  geometry / road / effective date / authority / legal basis / setback effect / permission
  requirement. **Never a generic fixed-width setback.**
- **8.2 Roads** (GeoDanmark): category / public-private / boundary / access.
- **8.3 Rail** (Banedanmark / GeoDanmark). **NEVER invent a generic national railway setback** —
  spatial relationship + statutory/technical restrictions + approval requirement.
- **8.4 Aviation** (Trafikstyrelsen / Plandata): obstacle limitation surfaces / airport
  protection zones / height restrictions. Plandata may show surface geometry **WITHOUT the
  legal elevation** — then `AVIATION_HEIGHT = UNKNOWN / CONDITIONAL`, never inferred from a
  visualization.

## PART 9 — LER 2.0/2.1 utilities

Official OpenAPI; production endpoint / auth / grave request / ledningspakke / format / owners.
`UTILITY_CONSTRAINT` for feasibility/corridors — **not automatic NO_BUILD**.

## PART 10 — TINGLYSNING / SERVITUDES (high priority)

Official Tinglysning / API / data catalogue / commercial APIs / open-source / document
retrieval / historical / attachments. Per property: registered servitudes / date / document id /
title / claimant/benefic—

> ⚠ **TRANSMISSION ENDS HERE** (mid-word, mid-field-list). Everything after
> "claimant/benefic" is missing — see the provenance header. Do not invent the tail.
