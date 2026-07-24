# Finland — MASTER DATA-SOURCE & RULE-MECHANISM STUDY for the buildable-envelope engine

Companion to the France, Germany, and Italy studies, same method: separate what is genuinely national from
what a municipality does differently, and treat a different legal mechanism as a different engineering
problem, not a parameter change.

**Headline finding:** Finland is structurally the opposite case from Italy, and arguably the strongest case
encountered across all four studies. Where Italy split into 21 independent legal mechanisms, Finland has one
national planning act (the old Maankäyttö- ja rakennuslaki, MRL, now split as of 1.1.2025 into the
Alueidenkäyttölaki — Land Use Act — and the Rakentamislaki — Building Act), applied uniformly by all ~309
municipalities (kunta), with one national zoning-plan taxonomy (maakuntakaava → yleiskaava → asemakaava,
i.e. regional-plan → master-plan → detailed/local-plan, a strict three-tier hierarchy, not a
regionally-reinvented one), and — the finding that changes the whole shape of the project — a live,
government-run national programme, Ryhti, whose explicit purpose is to make every Finnish zoning plan
machine-readable under one national data model (the kaavatietomalli, built on ISO 19109/19107/19103
spatial-data standards), with a free public API already serving two regions and a national rollout project
(VOOKA) actively converting the rest. On top of that, the cadastre (Maanmittauslaitos), the national
topographic database (Maastotietokanta, including a nationwide laser-scanned 3D building layer), and the
national heritage register (Museovirasto/RKY) are all free, open, nationally uniform, and already exposed
via modern OGC APIs. Finland's problem is not fragmentation — it's timing: the single national zoning data
layer that Italy, France, and Germany all lack is being built right now, is legally mandated, and is
partially live already.

**Status:** research + scoping. No rule pack is implemented by this document. No live probes beyond reading
public documentation pages; treat all "confirmed" statements as documentation-level, not field-verified by
direct API query.

---

## PART A — THE NATIONAL COMMON BASELINE

### A.1 Parcels and cadastre — genuinely unified, genuinely modern

**National baseline:** the cadastre is run by the Maanmittauslaitos (National Land Survey of Finland, NLS;
Swedish: Lantmäteriverket), a single national agency under the Ministry of Agriculture and Forestry, with no
regional or provincial carve-outs of any kind. Parcel data (kiinteistörekisteri) is exposed through a modern
OGC API Features endpoint — a free API-key-based service delivering the cadastre's open "simple" products,
including the cadastral subdivision, at
`https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/`, alongside a fuller
contract-based service for licensed products. The open service delivers cadastral boundaries, cadastral unit
identifiers and boundary markers with location data, plus key information on parcels, register units, and
undivided parcels, as well as usage-right units such as road easements, privately-owned nature reserves, and
power-line corridors recorded in the cadastre, refreshed from the live cadastral register every night by 2am,
with the service available 24/7. Open products are licensed under the National Land Survey's open-data CC
Attribution 4.0 licence; a self-service API key (no formal contract, just email registration via the NLS "My
Account" service) is sufficient for the open tier.

**What is NOT free:** some richer/licensed cadastral products (ownership history, mortgage/lien data —
lainhuuto- ja kiinnitystiedot) sit behind a paid contract tier, same technical endpoint family, different
access class. This is a licence-tier split, not a jurisdictional one — unlike Italy's Trento/Bolzano
exclusion, there is no part of mainland Finland excluded from this system. Åland (an autonomous,
demilitarized Swedish-speaking province) maintains its own separate land registry and building permitting
administration by statute and should be treated as its own jurisdiction, analogous in spirit to Italy's
autonomous provinces — not yet confirmed in this pass whether Åland's cadastre is exposed via the same NLS
API or a wholly separate system.

**§A.1.D Deviations:** none identified for mainland Finland. Åland needs its own confirmation.

---

### A.2 Zoning identification — one national plan hierarchy, one national plan-symbol standard, and a live national data model superseding both

**National baseline, structural:** Finnish land-use planning runs a strict three-tier hierarchy, defined by
national law (now the Alueidenkäyttölaki, replacing MRL from 1.1.2025), applied identically everywhere:

- **Maakuntakaava** (regional plan) — prepared by the regional council (maakunnan liitto), sets strategic
  land-use guidelines for a region.
- **Yleiskaava** (master/general plan) — prepared by the municipality, guides land use at municipality or
  part-municipality scale; in rural areas outside built-up centres this is often the most detailed plan
  level and protection decisions are made at this tier.
- **Asemakaava** (detailed/local plan, sometimes translated "town plan") — the most detailed plan level,
  guiding land use and construction in cities, built-up centres, and often shoreline areas according to
  local conditions, townscape, good building practice, and the existing building stock.

This is the direct structural opposite of Italy's finding: the instrument names and the hierarchy are
identical everywhere in Finland — there is no "PGT-only-in-Lombardy" or "PUC-only-in-three-regions"
problem. A municipality's asemakaava is always structurally the same kind of document as every other
municipality's asemakaava, differing only in its specific content, the same relationship France's PLU has to
itself (not Italy's PGT-vs-PUC-vs-PSC problem).

**National baseline, notation:** unlike DM 1444 (which is a numeric-floor decree, not the operative plan
symbol set), Finland has a national standard plan-symbol and notation system for kaavamerkinnät ja
-määräykset (plan markings and regulations), issued by the Ministry of the Environment, used by every
municipality drafting an asemakaava or yleiskaava. This means the query key problem Italy has (DM 1444
letters may or may not be operative) does not really exist in Finland — the symbol set drawn on any Finnish
local plan is drawn from one shared national library, even though the specific numeric values attached to a
given plot (e.g. e0.25 floor-area ratio, roof height, etc.) are still locally set by that municipality's
own plan.

**National baseline, the live game-changer — Ryhti / kaavatietomalli:** the Ministry of the Environment ran
the Ryhti programme (2020–2025) specifically to build a national digital information system for the built
environment, and its planning component is the national zoning data model (kaavatietomalli). Key facts:

- The logical Ryhti zoning data model is built on the ISO 19109 General Feature Model standard, using the
  broader spatial-data ISO family (19103, 19107) — i.e., this is a genuine, standards-based,
  internationally-interoperable schema, not an ad-hoc national format.
- The national data model enables machine-readability of zoning data and gives it a nationally unified
  structure. A data-model-format plan can be produced with different planning software; some municipalities
  have already moved to data-model-format planning. The model allows flexible, locally-appropriate plan
  solutions and plan regulations while keeping the resulting zoning data nationally interoperable — this is
  the explicit design goal Italy, France, and Germany all lack a working national equivalent of.
- It's already partially live: valid local detailed plans (asemakaava) and master plans (yleiskaava) for the
  South Savo and North Savo regions are already available through open APIs, free of charge, via the Ryhti
  map service and its underlying API. At a later stage the APIs will provide access to data-model-based
  plans, plot divisions, and land-use restrictions nationally, as regions are transferred into the system
  under the VOOKA implementation project — VOOKA's explicit goal is exporting all current zoning and master
  plans in Finland into the national data-model format within the built-environment information system.
- **Legal mandate, with a real date attached:** municipalities must submit building-related data to the
  built-environment information system starting 1.1.2029 at the latest, though they are already obligated
  to produce data-model-format building permits from the start of 2026. The Rakentamislaki (Building Act)
  took effect 1.1.2025, and the submission obligation and data-model conversion only apply to processes
  started on or after the laws' effective date — municipalities are not required to retroactively submit
  existing historical data, though they may choose to.
- **Known limitation, self-disclosed:** the built-environment information system does not use "kaavayksikkö"
  (plan-unit) objects, because not all municipalities use them — smaller municipalities raised this in
  several cooperative working groups, e.g. the KAATIO project found that requiring plan-units in the national
  system could not be mandated. The plan-unit concept remains part of the national zoning data model itself,
  though, so municipalities that do use plan-units can still benefit from the data model. This is a genuine,
  honestly-disclosed structural wrinkle: not every municipality's data will carry the same object
  granularity, even within one national schema.

**Net read for the engine:** Finland is the only one of the four countries studied where "wait for the
national standard" is a defensible near-term strategy for at least some regions, not a multi-decade bet —
South and North Savo are live today, the legal deadline for full national building-data submission is
1.1.2029, and the data model itself is a real, published, ISO-based schema, not a discussion document. The
engineering risk shifts from "no schema exists" (Italy) to "schema exists and is partially live, but full
national coverage is a multi-year rollout in progress, and coverage should be checked per target
municipality/region before assuming it's there."

**§A.2.D Deviations:** none structural (no regional reinvention of the instrument, unlike Italy). The only
real deviation is rollout status — which regions have been migrated into Ryhti's live API (confirmed: South
Savo, North Savo; unconfirmed for all others) — which is a timing question, not a legal-mechanism question.

---

### A.3 Height, density, and floor-area rules — set locally, per plan, but within one national plan-symbol system

**National baseline:** unlike DM 1444's national numeric floor, Finland does not set a national numeric
ceiling on density or height by statute in the same way — density (tehokkuusluku, e, Finland's FAR-equivalent
— floor area divided by plot area) and permitted height/storey count (kerrosluku) are set per plot, in the
asemakaava itself, using the nationally standardized symbol set. This means the numeric value is always local
(same as France, same as Germany), but the symbol/attribute meaning is always national (unlike Italy, where
even the zone letter itself may not be operative).

**What is emerging as structured, not PDF-only, at least regionally:** the Helsinki metropolitan area
publishes an aggregated, block-level (kortteli) structured dataset of currently valid asemakaava floor area,
"SeutuRAMAVA" — containing block-level data aggregated from the current valid detailed plans (asemakaava) of
the whole Helsinki capital region (Espoo, Helsinki, Kauniainen, Vantaa), expressed in floor-area square
metres. This is the Finnish analogue of what the Italy study found only once, narrowly, for Lombardy's
Indagine Offerta PGT — except here it's a live open dataset for an entire metro region's floor-area
entitlement, not a one-off monitoring survey. This is a genuinely strong precedent for the
"Indice di fabbricabilità"-equivalent row: at least in the Helsinki region, aggregate floor-area figures are
already structured and public, ahead of the national Ryhti rollout finishing.

**§A.3.D Deviations:** none structural. Rollout/coverage (whether a given municipality's asemakaava numeric
fields are in Ryhti yet, or only in a PDF/plan-map image) remains the open, per-municipality question,
exactly mirroring the Ryhti rollout status in §A.2.

---

### A.4 Buildings, height, and LoD — a genuine national laser-scanning programme, already delivering 3D building vectors

**National baseline — and this is the strongest positive finding across all four country studies to date:**
Finland runs a national airborne laser-scanning (LiDAR) programme, and — unlike Italy's PST/SIM
(terrain-only) or France's still-in-progress LiDAR HD — Finland already derives an actual national 3D
building vector layer from it:

- National laser-scanning data has been produced from 2008–2019 at an original point density of 0.5
  points/m², predating the national laser-scanning programme; the current national laser-scanning programme,
  running from 2020 onward, is thinned from an original 5-point density down to 0.5 points/m².
- 3D building vectors are three-dimensional instances of the national topographic database's (KMTK) Building
  feature class, produced with a high degree of automation from the 5-point-density laser-scanning data —
  i.e., this is a live, national, automatically-derived, per-building height product, the direct analogue of
  Germany's LoD2-DE, except Germany's is per-Land and Finland's is genuinely national and free.
- The underlying Maastotietokanta (national topographic database) itself is a dataset covering the whole of
  Finland, whose most important object classes include the transport network, buildings and structures,
  administrative boundaries, place names, land use, water bodies, and elevation relationships, kept current
  through aerial imagery, laser-scanning data, and other producers' datasets, maintained in close cooperation
  with municipalities — and is open data. The Buildings object class specifically records human-made
  structures used for various societal purposes, together with information on the buildings' intended use and
  their number of storeys — meaning storey count (a direct proxy for height/massing) is a structured national
  attribute, not a PDF-only figure, for every building in the country.

**What is NOT fully open:** the RHR (rakennus- ja huoneistorekisteri — building and dwelling register),
Finland's authoritative per-building register maintained via the national Population Information System
(väestötietojärjestelmä, VTJ) by DVV (Digital and Population Data Services Agency), holds richer attributes
— Finland's roughly 3 million buildings with their attribute data, including owners, dwellings, business
premises, and population by dwelling and building, with location in ETRS89/TM35FIN coordinates — one of
Finland's core national registers and the most important dataset for monitoring land use and the built
environment — but access is restricted: the data may not be released to third parties without DVV's
permission, and use must observe data-protection and privacy requirements under GDPR and Finland's Data
Protection Act. This is the same "richest layer is access-gated" pattern found repeatedly in the Italy
research, except here the gate is a national personal-data protection rule (GDPR), not an
institutional-fragmentation artifact. There is also an explicit further caveat: the building and dwelling
data in the population information system is not considered publicly authoritative — it may only be used in
decisions concerning a person if that person is explicitly informed of the data's content and use. Building
massing/height data is available another, open way (Maastotietokanta / KMTK 3D vectors above); it's
specifically the ownership/occupancy layer of RHR that's gated.

**§A.4.D Deviations:** Åland's status re: national laser-scanning/topographic-database coverage is
unconfirmed and should be checked separately, consistent with its separate cadastral/legal status noted in
§A.1.

---

### A.5 Heritage and protective overlays — national, open, vector, but explicitly not exhaustive (same caveat pattern as Italy's SITAP, better documented)

**National baseline:** heritage protection is coordinated nationally by Museovirasto (the Finnish Heritage
Agency), which runs open WFS/WMS services covering:

- Scheduled ancient monuments and other cultural-heritage sites (point features), scheduled-monument area
  boundaries, protected buildings from the Building Heritage Register (point and area features), Nationally
  Significant Built Cultural Environments (RKY — point, line, and area features), and World Heritage Sites
  (point and area features) — all genuine vector data, openly licensed, served via standard OGC WFS/WMS.
- The Building Heritage Register component specifically covers buildings protected under specific statutes:
  the 1985 Decree (480/85), the Church Act, the Act on the Orthodox Church, and the 1998 "Railway Agreement"
  — a defined, statute-driven, non-exhaustive list, not "every protected building in Finland."

**§A.5.D Deviations — the caveat that matters, stated with unusual clarity by the source agency itself:**
Museovirasto is explicit that its own national dataset is not the complete picture of protected status: the
agency's spatial-data product does not include sites protected under the Act on the Protection of the Built
Heritage (or the older Building Protection Act), nor buildings or areas protected through a zoning plan.
Data on buildings protected under the Built Heritage Protection Act must be requested from the Regional State
Administrative Agency (Lupa- ja valvontavirasto); data on buildings protected via a zoning plan must be
requested from whoever drafted that plan — the municipality or the regional council.

This is structurally the same caveat pattern as Italy's SITAP self-disclosure ("archival, informational,
not exhaustive") — except here it's more precisely scoped: Museovirasto tells you exactly which two other
channels to check (LVV for statute-based protection, the municipality/region for plan-based protection)
rather than leaving the gap open-ended. A NOT FOUND result from the Museovirasto WFS does not certify the
absence of a heritage constraint — the same discipline recommended for Italy's SITAP applies here, just with
a clearer list of exactly what else to check.

---

### A.6 Municipal fragmentation — real, but structurally mild compared to Italy, France, or Germany

Finland has ~309 municipalities (kunta) — far fewer than Italy's ~7,900 or France's ~34,900, and even below
Germany's ~10,800 — and, crucially, zero regional legal-mechanism variation: every municipality drafts the
same three plan types, using the same national symbol library, under the same national law. The only
fragmentation that exists is:

- **Rollout timing into Ryhti** — some regions (South/North Savo) are live now; the rest are pending under
  the VOOKA project, on a multi-year national schedule with a hard 1.1.2029 backstop for building-permit
  data.
- **Local software/format choice** — some municipalities have already moved to data-model-format planning
  while others have not, meaning even before national rollout, individual municipalities' current internal
  digitisation maturity varies — but this is an implementation-timing variable, not a different legal
  mechanism, the same category of variable as "which comune already migrated its cadastre to digital"
  rather than "which comune uses a different kind of plan."
- **Municipality mergers** — Finland has an active, ongoing municipal-merger process (kuntaliitokset), which
  periodically changes which asemakaava applies to a given historical area; a live-currency check (same
  discipline as checking a French commune's most recent PLU révision) is still warranted, just against a
  much smaller and more centrally-coordinated backdrop than Italy's.

---

## PART B — DEEP-DIVE RESOURCE STUDY PER MUNICIPALITY (preliminary, not yet primary-source-confirmed)

### B.1 Helsinki

Helsinki's own open-data portal publishes its own asemakaava-protected buildings and areas dataset directly
— covering buildings and areas protected via Helsinki's own detailed planning, downloadable in GML, KML,
Excel, DWG, DXF, GeoPackage, MapInfo (TAB & MIF), and Esri Shapefile formats — an unusually generous
multi-format export list compared to anything found in the Italy research.

Helsinki additionally participates in the SeutuRAMAVA capital-region floor-area dataset (§A.3), giving
block-level structured floor-area figures for its entire built-up area — a strong positive relative to any
Italian city studied.

Helsinki's rollout status inside Ryhti/VOOKA specifically (vs. South/North Savo, which are confirmed live)
was not directly confirmed in this pass — needs its own live-probe before assuming Helsinki's plans are
already in the national API versus still pending migration.

**Estimate:** contingent on Ryhti/VOOKA rollout timing for the Uusimaa region, but structurally this looks
like the cheapest, best-supported first city of any studied across all four countries — likely closer to a
config/data-integration task than a new engine kind, unlike every Italian city studied.

### B.2 Regions already live in Ryhti — South Savo and North Savo

These two regions' valid asemakaava and yleiskaava plans are already available through open, free APIs today
— meaning, if the founder's priority is "cheapest possible first Finnish deployment, full stop," these two
regions (rather than Helsinki, the capital-city intuition, or any other major city) are the confirmed,
currently-live starting point, the same "don't default to the capital" lesson the Italy/France/Germany
studies each drew independently (Lyon over Paris, Hamburg over Berlin, Turin over Rome/Milan) — except here
it's not a hedge, it's an already-shipped fact.

---

## PART C — WHAT THIS MEANS FOR SCALE, AND THE HONEST PROJECT SHAPE

Finland inverts the lesson of the Italy study almost exactly:

- A "national Finland integration" is genuinely one legal mechanism, not 21 — every kunta uses the same
  three-tier plan hierarchy and the same national plan-symbol library. The engineering problem is "ingest
  one data model, handle rollout-timing variance," not "build 21 separate GeometricRule kinds."
- The one national machine-readable zoning standard that Italy, France, and Germany each lack (or only have
  as a pilot/per-Land patchwork) is live, government-run, ISO-standards-based, and already serving real API
  traffic for two regions, with a hard national legal deadline (1.1.2029) forcing the rest of the rollout.
  This is a fundamentally different risk profile than "hope a standard eventually appears" (Italy) or "one
  pilot standard, unclear rollout" (France's CNIG SRU).
- Building height/massing is already a national open layer, derived from a live national LiDAR programme —
  not per-region-of-unknown-existence (Italy), not per-Land (Germany), not in-progress-with-a-2026-
  completion-date (France) — already shipping, nationwide, open, today.
- The recurring "richest layer is access-gated" pattern still applies (RHR ownership/occupancy data is
  GDPR-restricted) — Finland is not perfect, but the gate here is a privacy law applied uniformly
  nationally, not an institutional-fragmentation artifact you'd need to solve 21 times.
- The recurring "heritage overlay is not exhaustive" pattern still applies (Museovirasto's own disclosure)
  — but it's unusually well-documented, naming exactly two other channels to check, rather than an
  open-ended "informational only" caveat.

**Recommended framing, mirroring the tiering structures proposed for the other three countries:**

- **Tier 1 — live today:** South Savo and North Savo, via the Ryhti open API. This is not a hedge, it's
  confirmed-live public documentation.
- **Tier 2 — strong candidate, rollout-timing unconfirmed:** Helsinki and the wider capital region (Espoo,
  Vantaa, Kauniainen), given the existing SeutuRAMAVA floor-area dataset and Helsinki's own protected-
  buildings open data, contingent on confirming Uusimaa's Ryhti migration date. Comparable cities/regions
  with similarly mature municipal open-data programmes (Tampere, Turku, Oulu) are plausible near-Tier-2
  candidates but were not directly confirmed in this pass.
- **Tier 3 — everywhere else:** every other region, presumed structurally identical in legal mechanism
  (unlike Italy's genuine Tier 3 uncertainty), with the only open question being when VOOKA migrates that
  region into the live API — a scheduling question, not a legal-research question, which is a categorically
  easier unknown to resolve than anything in the Italy study.

The signature structure, updated for Finland: where Italy needed a signature per region on instrument type,
per city on whether the nominal mechanism still holds, and a standing caveat that the one national overlay
layer (SITAP) is informational-only, Finland needs only a signature per region on Ryhti/VOOKA migration
status, and a standing caveat that Museovirasto's heritage layer must be cross-checked against exactly two
other named channels (LVV for statute-protected buildings, the municipality/region for plan-protected
buildings). This is a materially smaller and more tractable signature set than any of the other three
countries studied.

**Cross-refs:** FRANCE-DATA-SOURCES-SCOPING.md, FRANCE-MASTER-IMPLEMENTATION-STUDY.md,
GERMANY-MASTER-DATA-SOURCES-STUDY.md, ITALY-MASTER-DATA-SOURCES-STUDY.md (parallel studies, same method),
Alueidenkäyttölaki / Rakentamislaki (effective 1.1.2025, replacing Maankäyttö- ja rakennuslaki),
Ryhti / kaavatietomalli (national zoning data model, ISO 19109/19103/19107-based), VOOKA (national
plan-migration project), Maanmittauslaitos OGC API Features (cadastre), Kansallinen maastotietokanta /
KMTK (national topographic database + 3D building vectors), Museovirasto RKY / Rakennusperintörekisteri
(heritage), Väestötietojärjestelmä RHR (building/dwelling register, DVV, GDPR-restricted third-party access).

---

## READINESS-RATE ESTIMATE — Finland (`fi`) national (preliminary, documentation-level only)

**Methodology note:** mirrors the cross-jurisdiction benchmark used for Denmark, Madrid, Barcelona, Germany,
France, and Italy — the fraction of parcel-level building-rule queries returning a complete,
machine-readable answer (parcel geometry + zone identification + at least one numeric building parameter)
without reading a municipal PDF. No live probes were run for this estimate — treat as a documentation-level
estimate pending direct API verification, per the same discipline applied to the Italy readiness rate.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| **Finland (national, South/North Savo live regions)** | **~55–65% (est., unverified)** |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Finland (national, regions not yet in Ryhti)** | **~30–35% (est., unverified)** |
| Italy (national) | ~8% |

**Why the split estimate:** Finland's readiness is genuinely bimodal in a way none of the other countries
were — it depends almost entirely on whether the target region has been migrated into the live Ryhti API
yet, not on which region it structurally is. This is different from Italy's region-by-region legal variance;
it's a rollout-timing variance across an otherwise identical mechanism. In a live Ryhti region: parcel
geometry (Maanmittauslaitos, ~95%+), zone identification and numeric plan attributes (Ryhti API, high —
exact figure needs direct query), building height/massing (KMTK 3D vectors, nationally open, ~85%+),
heritage overlay (Museovirasto WFS, open but non-exhaustive, ~60–70% same tier as Italy's SITAP). Outside
a live Ryhti region: same strong geometry/height/heritage scores, but zone identification and numeric plan
values fall back to whatever that municipality's own website/PDF/local WebGIS publishes — likely still
better than Italy's PDF-only baseline given the universal national symbol system, but not yet API-structured.

**What would raise/confirm the rate:**

| Action | Rate impact | Effort |
|---|---|---|
| Live-probe the Ryhti API for South Savo / North Savo — confirm schema, auth, and actual parcel-level query path | Establishes Finland's real Tier-1 ceiling with field-verified data, not documentation estimate | Low |
| Live-probe Maanmittauslaitos OGC API Features (cadastre) with a real API key | Confirms parcel-geometry baseline | Low |
| Check Helsinki/Uusimaa's specific Ryhti/VOOKA migration date | Determines whether the capital region is Tier 1 or Tier 2 | Low |
| Live-probe KMTK 3D building-vector service for height-field reliability | Confirms Finland's building-height claim at the same rigor as the Italy ARPA Piemonte check | Low |
| Confirm Åland's cadastral/planning system independently | Åland is likely excluded from mainland systems the same way Trento/Bolzano are excluded from Italy's Catasto | Medium |
| Check RHR access-request process for a legitimate research/product use case | Determines whether the gated ownership/occupancy layer is obtainable via a permission request, not just closed | Medium |

**Realistic ceiling:** if Ryhti's national rollout completes on schedule (backstopped by the 1.1.2029 legal
deadline), Finland is plausibly the first country in this entire research programme — across Denmark, Spain,
Germany, France, and Italy — with a credible path to a Denmark-adjacent national readiness rate, via an
actual government-run standard rather than a private aggregator filling a public gap. That is a structurally
different, and better, story than any of the other three countries studied.

---

*Last updated: 2026-07-24. Research-level only — no live probes run. All figures are estimates from public
documentation; no field values are confirmed by direct API query.*
