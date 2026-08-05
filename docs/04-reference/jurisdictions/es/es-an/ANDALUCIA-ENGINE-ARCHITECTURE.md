# Andalucía Engine — Architecture Assessment

**Status**: PROPOSED — architecture document, not an implementation plan. No code accompanies this
file. **Date**: 2026-08-04. **Scope**: should Andalucía become a first-class regional engine inside
PRYZM, with municipalities as plugins/adapters underneath it?

**Reads underlying this document** (all read in full before writing):
[`ANDALUCIA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`](./ANDALUCIA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md) ·
[`14021-cordoba/findings/CAPABILITY-AUDIT-2026-08-04.md`](./14021-cordoba/findings/CAPABILITY-AUDIT-2026-08-04.md) ·
[`14021-cordoba/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./14021-cordoba/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
[`29067-malaga/findings/CAPABILITY-AUDIT-2026-08-04.md`](./29067-malaga/findings/CAPABILITY-AUDIT-2026-08-04.md) ·
[`29067-malaga/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./29067-malaga/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
[`18087-granada/findings/CAPABILITY-AUDIT-2026-08-04.md`](./18087-granada/findings/CAPABILITY-AUDIT-2026-08-04.md) ·
[`18087-granada/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./18087-granada/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
[`41091-sevilla/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./41091-sevilla/findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md) ·
[`41091-sevilla/findings/SOURCE-founder-sevilla-research-programme-2026-08-03.md`](./41091-sevilla/findings/SOURCE-founder-sevilla-research-programme-2026-08-03.md).
Sevilla has no `CAPABILITY-AUDIT-2026-08-04.md` yet — this document uses the two files above and
notes the gap wherever a Sevilla claim would otherwise need it.

Code read directly (not summarised from prose): `CLAUDE.md` (root) ·
`packages/site-parcel-data/src/rulepacks/registry.ts` ·
`packages/site-parcel-data/src/rulepacks/esCordobaZoneClassification.ts` ·
`packages/site-parcel-data/src/rulepacks/esSevilla.ts` ·
`packages/site-parcel-data/src/providers/resolveSevillaAlignments.ts` ·
`packages/site-parcel-data/src/providers/containers/arcgisRest.ts` ·
`docs/02-decisions/adrs/ADR-0294-the-zone-resolver-is-container-agnostic-and-carries-confidence.md` ·
`docs/02-decisions/adrs/ADR-0295-the-capability-engine-five-independent-providers.md` ·
`docs/04-reference/standards/R-P-REGIONAL-SCORING.md`.

**Confidence key used throughout**: **VERIFIED** (directly read this session, cited) / **INFERRED**
(derived from verified facts, not itself independently fetched) / **PROPOSED** (this document's own
architectural recommendation, not a fact about the world).

---

## Executive summary

**PROPOSED, and stated first because it reframes every part below**: PRYZM should **not** build an
"Andalucía Engine" as a new architectural layer, plugin, or code path. That question was already
asked and answered — **VERIFIED**, this is not this document's own opinion — by
[ADR-0294](../../../02-decisions/adrs/ADR-0294-the-zone-resolver-is-container-agnostic-and-carries-confidence.md)
and
[ADR-0295](../../../02-decisions/adrs/ADR-0295-the-capability-engine-five-independent-providers.md)
(2026-08-02), and this session's five-way Andalucía audit (regional + Córdoba + Málaga + Granada +
Sevilla) is a **second, independent confirmation** of the same conclusion, arrived at from raw
municipal evidence rather than from re-reading the ADRs. Both say the same thing from different
directions: **"Spain is organised `parcel → municipality → instrument → detailed zoning → rule`, NOT
by autonomous community. The CCAA is the unit of legal corpus and signature; it is not the unit of
geometry publication."** (ADR-0294 §3, verbatim). Andalucía's own regional audit reaches the mirror
conclusion independently: the region's one candidate for a genuine shortcut — the Normas
Directoras/SITUA-VITUA schema — is verified to lack height, storey, setback and depth fields by
design, and is forward-only from a fourteen-week-old mandate with an unmeasured, plausibly
near-empty corpus (regional audit, Blockers 1–2).

**What Andalucía does contribute, and it is real**: three region-wide constraint-overlay
services — heritage (`bica_public` WMS/WFS), environmental (REDIAM Natura 2000/RENPA), and flood
(REDIAM T10/T50/T100/T500) — confirmed live this session and cheap to wire (regional audit:
"Tiny (<1 week)"). These map exactly onto the fifth of ADR-0295's five independent capabilities
(**constraint overlays**), not onto zoning geometry or legal grammar. **This is the shape the
architecture should take: Andalucía is a bundle of PROVIDERS a municipality's resolver may draw on,
never a code path the engine branches on.**

The four audited capitals prove the point by their sheer heterogeneity, not by resembling each
other: Córdoba publishes GeoServer WFS + vector-outline PDFs (a proven, working container). Málaga
publishes the richest ordinance *text* in the region but its GeoServer account is locked
(`ORA-28000`) — an operational failure, not a format one. Granada's calificación is legally bound to
raster plan sheets by its own ordinance text (Art. 7.9.6) — a legal-source problem no engineering
effort can resolve. Sevilla is the one city with a working ArcGIS REST container and a genuinely
novel result: PRYZM has already built (`containers/arcgisRest.ts`) and partially exercised
(`resolveSevillaZone.ts`, `resolveSevillaAlignments.ts`, one transcribed zone `SB` in `esSevilla.ts`)
a reusable Esri-stack adapter, proving ADR-0294's "one interface, N containers" claim with a fifth
container type. **Four containers, four different failure modes, zero shared zoning geometry format
— this is the strongest possible evidence that a regional zoning/ordinance layer cannot exist**, and
the strongest possible evidence that the *container abstraction* (not a regional abstraction) is
where reuse actually lives.

**The single biggest risk to any reusable-evaluator ambition** (Part 4/8): every municipality's
buildable envelope bottoms out in a **legally delegated, conditional, or graphically-bound**
determination that a generic evaluator cannot generalize past — Sevilla SB's conditional
rear-setback (Art. 12.5.6, ≠ scalar), Córdoba's Manzana Cerrada street-width table (no alignment
layer exists to resolve it), Granada's Art. 7.9.6 graphical delegation (height is *legally* a raster
map, not a number), Madrid's NZ-1 CPPHAN discretionary approval (memory:
`madrid-nz1-ring-only-decision`). These are not missing data; they are **the law itself refusing to
be a formula**, and no abstraction layer, regional or otherwise, changes that.

---

## Part 1 — Inventory of everything reusable

Per-municipality inventory of the eleven dimensions requested, each cell tagged VERIFIED (cited to
one of the audits or code above) or the specific unresolved status the source audit itself reports.

| Dimension | Córdoba | Málaga | Granada | Sevilla | Andalucía (region) |
|---|---|---|---|---|---|
| **Zoning source** | GeoServer WFS 2.0.0, `coaco:ordenanzas` (453 polygons, 2-district pilot only — **VERIFIED**, Córdoba audit) | Locked GeoServer, `sig.malaga.eu` `muralPGOU:POLCALIF_T`, `ORA-28000` — **VERIFIED unreachable** | Raster PDF plan sheets only (`granada.org/pgo/2001-NN.pdf`) — **VERIFIED no vector exists** (byte-level PDF inspection) | ArcGIS REST `Info_Urban_Groups/PGOU/{FeatureServer,MapServer}` layer 25 "Calificación", field `zona_orden` — **VERIFIED live** | DERA "Sistema Urbano" 1:100,000 — **VERIFIED too coarse to use** |
| **Ordinance source** | PGOU-2001, scanned/vector-outline PDFs, OCR'd 13/13 subzones — **VERIFIED, signed** | PGOU 2011 Título 12, 12 natively-text PDFs — **VERIFIED, richest text corpus in region** | Normativa HTML (text-readable) + raster plans (calificación itself, not text) — **VERIFIED split: text ordinance exists, but the operative height/floor value is graphically delegated (Art. 7.9.6)** | PGOU-2006 Texto Refundido, per-zone PDFs linked via `enlace_np`/`enlace_ng` fields — **VERIFIED live for one zone (SB)**, rest untranscribed | Normas Directoras schema (`EDIF_*`, `DENS` only) — **VERIFIED parameter-incomplete by design** |
| **Parcel source** | National Catastro INSPIRE + `coaco:vcatastro_urbanismo` join (5,721/5,725 pilot parcels) — **VERIFIED** | National Catastro (presumed, not Málaga-bbox-tested this pass) — **INFERRED** | `idegranada.dipgra.es` ArcGIS `Parcelas_Catastrales_2024` — **VERIFIED live**, EPSG:3857 | Not independently confirmed; presumed national Catastro per regional pattern — **INFERRED** | National Catastro, no regional layer — **VERIFIED (absence)** |
| **Alignment source** | **None found anywhere in Córdoba's GIS** (105 WFS + 119 WMS + 15 COACo probes) — **VERIFIED absent**, blocks Manzana Cerrada (16.86% of pilot land) | Advertised `muralPGOU:LINALIN_T`, behind the same lock — **VERIFIED advertised, unreachable** | Not found; not investigated as a distinct question this pass — **status not reported** | Layer 4 "Alineaciones", confirmed live with real polyline geometry (28 `A_INTERIOR-MAXIMA` features fetched); `resolveSevillaAlignments.ts` already built against it — **VERIFIED, the only working alignment layer in the audited capitals** | None regionally; Málaga's `LINALIN_T` is the only regional-adjacent named example, and it is locked — **VERIFIED absent** |
| **Heritage source** | GMU `gmucordoba.es/visorcasco/data/**/*.geojson` — historic-centre boundary + catalogued buildings/monuments, previously undocumented — **VERIFIED live, new this session**; no height/setback numbers, protection-level only | IAPH `pmu` WMS (wrong layer, movable heritage only); `datos.gob.es` tabular 27k-entity dataset, geometry type unresolved — **VERIFIED wrong-layer + unresolved-geometry** | Regional `dea100_patrimonio` WMS named in IDEAndalucía catalogue but **not fetched live this pass** — **unresolved**, high-stakes given the Alhambra | Heritage layers appear present in the same ArcGIS service group per founder capture, not independently confirmed this session — **unresolved** | `bica_public` WMS/WFS (CGPHA/ZSA/IBR) — **VERIFIED live, region-wide**, the strongest regional asset found |
| **Flood source** | REDIAM 500-yr consolidated WMS confirmed live; CHG's own GeoServer probed and confirmed to carry **no** flood layer — **VERIFIED** | REDIAM `REDIAM_zonas_inundables_and`, 8 return-period layers, valid GetCapabilities — **VERIFIED live** | REDIAM service family presumed by pattern, not fetched against Granada's bbox — **unverified this pass** | Not fetched this session for Sevilla specifically | REDIAM T10/T50/T100/T500 — **VERIFIED live, region-wide**; CHGuadalquivir basin-authority overlap **not reconciled** |
| **Environmental source** | REDIAM Natura 2000 WMS confirmed live | Located by URL pattern, **not GetCapabilities-tested** this pass | Sierra Nevada/Natura 2000 presumed, not re-verified | Not fetched this session | REDIAM Natura 2000/RENPA — **VERIFIED live, region-wide** (metadata-record level, not byte-level GetCapabilities) |
| **Airport constraints** | No authoritative geometry; AESA's own map is a Google My Maps embed; RD 729/2015 is text-only — **VERIFIED absent as geodata** | PDF plan found but unopened; AESA interactive-map fetch failed — **unresolved** | AESA national KMZ presumed to cover Granada-Jaén (LEGR) per the Barcelona precedent, **not independently re-verified for Granada** | Not investigated this session | Not investigated regionally; Barcelona's AESA KMZ implies a plausible national source, **explicitly flagged UNKNOWN not ABSENT** |
| **Coastline constraints** | N/A (inland) | Not investigated this session despite Málaga's coastline (Costa del Sol) | N/A (inland) | Not investigated this session despite Sevilla's Guadalquivir estuary/tidal reach | Not investigated any session so far — **a genuine gap in this document's own inventory**, flagged rather than filled |
| **Cadastral integration** | Live join, 95% measured (`coaco:vcatastro_urbanismo`) — **VERIFIED** | National default, not Málaga-tested | Live ArcGIS `Parcelas_Catastrales_2024` — **VERIFIED** | Presumed national — **INFERRED** | National INSPIRE, uniform across region — **VERIFIED (as an absence of a regional layer)** |
| **CRS** | Not stated explicitly in the audits read (national Catastro's usual EPSG:25830 zone for this longitude is standard but was not independently re-confirmed in this pass) | Not stated | `Parcelas_Catastrales_2024` = EPSG:3857; `CLASIFICACION_DEL_SUELO`/`ESTRUCTURA_GENERAL` = EPSG:25830 — **VERIFIED, and inconsistent WITHIN Granada's own province IDE** | **EPSG:25830 confirmed** (`esSevilla.ts` code comment, read from the layer's own `?f=json` metadata) — closes a gap two prior research passes left open | `bica_public` = EPSG:25830 (heritage); DERA layers mixed 1:10,000–1:100,000 scale, CRS not uniformly stated |
| **Geometry format** | GeoServer WFS (GML/GeoJSON) | GeoServer WFS (locked) | ArcGIS REST JSON (parcel/classification only; calificación itself is raster PDF) | ArcGIS REST JSON — **VERIFIED, the first Andalucían ArcGIS-published municipality found**, and one of very few Spain-wide | Mixed: WMS/WFS (heritage/flood/environment), GeoPackage template (Normas Directoras) |
| **Dispatch mechanism** | `siteDispatch.ts:3411-3513`, gate `CORDOBA_ENVELOPE_VERIFIED = true` (**signed**, 4 of 13 subzones live) — **VERIFIED, the only Andalucían capital with a live compute path** | **Zero** — no `isInMalaga` branch existed before this session's fabrication-defect close; falls to `applyEstimatedZoning` before that fix | **Not reachable** — classification→detailed-zone step requires reading a raster by eye | **Registered, gate shut**: `SEVILLA_ENVELOPE_VERIFIED = false` in `esSevilla.ts`; zone resolver (`resolveSevillaZone.ts`) and alignment resolver (`resolveSevillaAlignments.ts`) are live code, but the pack (`ES_SEVILLA_PGOU_PACK`) carries exactly one transcribed zone (`SB`) — **VERIFIED, code read directly** | No region-level dispatch; region is not a `packsByZone` unit anywhere in `registry.ts` — **VERIFIED, code read directly** |
| **Refusal mechanism** | `cordobaZoneRefusalFor` / `cordobaNoRulePackRefusal` / `cordobaOutsidePilotRefusal` (`esCordobaZoneClassification.ts`) — three distinct refusal classes: verification-gate, legally-grounded-no, coverage-gap — **VERIFIED, code read directly** | `malagaResearchPendingRefusal` (`esMalaga.ts`, per `registry.ts` import) | `granadaResearchPendingRefusal` (`esGranada.ts`, per `registry.ts` import) | `sevillaNoRulePackRefusal` (`esSevilla.ts`) — zone-named where resolvable, generic otherwise; explicit L-616-pattern structural refusal (`SEVILLA_SB_FONDO_UNRESOLVED_RING`) for SB's conditional depth — **VERIFIED, code read directly, unusually well-developed for a zero-envelope city** | N/A — no regional refusal object; each municipality's own refusal function is what fires |

**Immediate observation, stated as a finding, not an opinion**: every single row of this table is
**municipality-specific except three** — heritage, environmental, and flood overlays. That is not a
coincidence of what got audited; it is what ADR-0295 already predicted (§ context table: "a region
supplies providers, it is not a code path") and it is what the regional capability score (22/100,
almost entirely composed of the three overlay rows) directly measures.

---

## Part 2 — Classification: A / B / C, each proven

### Category A — Regional (implementable once for Andalucía)

| Component | Evidence it is genuinely regional |
|---|---|
| **BIC/heritage overlay** (`bica_public` WMS/WFS) | **VERIFIED** live, region-wide (EPSG:25830), single Junta-operated GeoServer instance serving CGPHA/ZSA/IBR for all 778 municipalities — regional audit §"Machine-readable assets". Córdoba's own municipal GMU catalogue is a *separate, richer, municipal* layer that supplements rather than replaces this — the two are not in conflict, they answer at different resolutions (municipal historic-centre detail vs. region-wide BIC/archaeological-servitude coverage). |
| **REDIAM flood overlay** (T10/T50/T100/T500) | **VERIFIED** live, region-wide WMS, confirmed independently in three of four capital audits (Córdoba, Málaga, regional). The one open question — reconciliation against basin-authority (CHGuadalquivir) data where it overlaps — is a data-quality question about *this same regional layer*, not evidence the layer should be municipal. |
| **REDIAM Natura 2000 / RENPA overlay** | **VERIFIED** live, region-wide, same publisher family and URL pattern as flood — regional audit. Lower priority for dense-urban parcels (Málaga capital core is not Natura-2000-adjacent) but structurally identical: one service, all municipalities. |
| **CRS transforms (EPSG:25830 ↔ WGS84 ↔ EPSG:3857)** | **INFERRED**, not itself audited as a distinct deliverable, but every Andalucían endpoint found this session that states a CRS states EPSG:25830 (Sevilla, heritage) except Granada's cadastral layer (EPSG:3857) — a national/regional coordinate-system split that exists independently of Andalucía and is already a generic GIS utility, not a jurisdiction-specific one. This is a case where "regional" is really "already-generic-before-Andalucía-existed" — see ADR-0294/0295's own framing of Córdoba, quoted in Part 3. |
| **Common GIS helper code** (WFS/WMS/ArcGIS-REST query builders, point-intersect, GetCapabilities parsing) | **VERIFIED** — `containers/arcgisRest.ts` is explicitly documented in its own header as generalizing "the one seam this repo has already proven for an ArcGIS REST layer" (València's `resolveValenciaAlineaciones.ts`), built for Sevilla but designed to be **reused by any future ArcGIS-published Spanish municipality**, not just Andalucían ones. This is the strongest possible A-category evidence: the container abstraction was already generic before Andalucía was audited. |
| **LISTA/SITUA-VITUA regional legal infrastructure** | **VERIFIED partial**: SITUA/VITUA's public viewer tells you *which instrument type* (PGOU/PGOM/PBOM/NNSS/DSU/none) governs a given municipality — a genuine regional contribution to the **routing (`R`)** half of the R/P split (`R-P-REGIONAL-SCORING.md`), scored 2/10 in the regional audit's own breakdown. It is not itself zoning geometry or ordinance text, but it *is* a legitimate once-per-region asset: a routing signal, not a parameter source. |

### Category B — Municipal (must always remain municipality-specific)

| Component | Evidence it cannot generalize |
|---|---|
| **Zoning polygons (calificación)** | Córdoba: GeoServer WFS, 453 polygons, 2-district-only. Málaga: locked GeoServer. Granada: **legally raster**, no vector substitute exists (byte-level PDF inspection: zero fonts, zero text operators, Ghostscript scan wrapper). Sevilla: ArcGIS REST, `zona_orden` field. **Four different containers, zero shared schema, zero shared geometry format** — the definitional case for Category B. |
| **Ordinance transcription (article text → parameter)** | Every capital's ordinance uses different vocabulary for the same concept: `profundidad edificable` (Málaga) vs. `profundidad máxima edificable` (Córdoba) vs. `fondo máximo edificable` (Sevilla) — **VERIFIED**, ADR-0295 §6 names this exact `fondo`-search-misses-27.6%-of-València's-documents failure mode as the reason grammar must be an ontology keyed on concept, never a lexeme search. Different article numbering, different chapter structures, different conditional grammar (Sevilla SB's Art. 12.5.6 is a two-variable conditional; Córdoba's height table is per-street-width; Granada's is graphically delegated). None of this transcription work transfers between cities even within one region. |
| **Height tables** | Sevilla SB: height fixed *per block* on a separate graphic layer (Art. 12.5.7 §2), not a zone-wide scalar. Córdoba MC: a per-street-width table with no alignment layer to resolve it against. Granada: legally bound to reading a raster map by eye (Art. 7.9.6). Málaga: ~90% textually present but with no geometry to attach it to a parcel. Four incompatible height-determination *mechanisms*, not four instances of one mechanism. |
| **Setbacks, occupancy, FAR, buildable depth** | Sevilla SB's occupancy is parcel-size-conditional (Art. 12.5.4: 80% for parcels >110 m², 100% for ≤110 m²) and its FAR is a 2-axis table (parcel size × storey count, six cells). Córdoba CTP-1/MC-1/2/4 FAR is `null` **by design** — the ordinance states it algorithmically, not as a scalar. These are structural properties of each ordinance's own drafting, not gaps a shared evaluator could fill by having "more data." |
| **Local plan interpretation (legal delegation to PERI/PEPRI/Estudio de Detalle)** | Córdoba: ~43-45% of pilot ordinance land measured delegated. Málaga: PEPRI Centro governs a defined historic-centre sub-area with its own catálogo, and — separately — its GIS viewer is independently offline. Granada: PERI/PEPRI inventory for the four Conjunto Histórico sectors not even located yet. Each city's delegation *pattern* (which zones, what fraction of land, which derived-plan types) is a fact about that city's own planning history, not a regional constant. |

### Category C — Potentially reusable (support with evidence, don't invent)

| Component | Evidence for eventual reuse | Evidence against premature reuse |
|---|---|---|
| **Closed-block evaluator** (`geometricRule: 'setback'`/block-ring-derived depth) | Barcelona's Ensanche pack (clau 13a/13E) already implements a block-ring-derived buildable-depth construction (Art. 242) reused across a second Barcelona zone family (13b, semiintensiva, sharing "the SAME Art. 242 depth construction... a DIFFERENT height table" — `registry.ts` comment). Sevilla SB's Art. 12.5.3 mandatory street-alignment + party-wall setback pattern (front 0, side 0) is structurally the same *geometric operation* as a closed-block pack, even though its rear condition differs. | Córdoba's Manzana Cerrada family cannot use this pattern at all — no alignment layer exists to construct the block ring against (ADR-0287: PRYZM's own street-polygon proxy was tested and rejected, 45.4% of streets sit within ±1 m of a height-band edge). The *geometric operation* generalizes; the *inputs it needs* (an alignment layer) do not exist everywhere, so the evaluator is reusable only where its prerequisite geometry is. |
| **Industrial-land evaluator** | Barcelona's `ES_BARCELONA_INDUSTRIAL_PACK` (clau 22a) implements the `tiered-occupation` rule kind (ADR-0273) for Art. 350.2's two-tier solid — a genuinely reusable *rule kind* in the schema (`BuildableEnvelope.tiers`), not tied to Barcelona's own numbers. | It remains **unregistered in production** specifically because a different municipality's industrial land carries a regime question (Pla Parcial vs. no Pla Parcial) the geometry engine cannot resolve without a per-parcel legal-instrument coverage layer — i.e., even the *rule kind* being reusable does not make the *evaluator* portable without each municipality's own regime-determination data. |
| **Historic-centre evaluator** | Every audited capital has a historic-centre/Conjunto Histórico protection regime (Córdoba's PEPCH'01/UNESCO Judería, Málaga's PEPRI Centro, Granada's four-sector Conjunto Histórico including the Alhambra, Sevilla's presumed-but-unconfirmed catálogo). The *shape* of the problem repeats: a protection-level catalogue (point/polygon geometry) that gates buildability but does not itself state height/setback numbers. | None of the four cities' historic-centre rules have been transcribed into a working pack yet (Córdoba's PEPCH is machine-readable geometry but "unverified and unwired" per this session's own finding; the others are less far along). There is no evidence yet — only a *structural* similarity — that a shared evaluator would fit once the ordinance text is read; historic-centre ordinances are notoriously exception-heavy (cf. Part 8). |
| **Height evaluator (street-width-conditioned)** | Córdoba MC and Sevilla SB both key height off a spatial reference (street width / block) rather than a flat zone-wide number — a recurring *pattern*, not a recurring *value*. | Neither city's version is resolvable today (Córdoba: no alignment layer; Sevilla: height fixed per-block on an unread graphic layer). A pattern with zero working instances is evidence for a *future* evaluator design, not evidence a reusable one exists now. |
| **Setback evaluator (conditional, parcel-size/frontage-gated)** | Sevilla SB's Art. 12.5.4/12.5.6 (occupancy and rear-setback conditional on parcel area and depth) is structurally the same *shape* of rule ADR-0295 §6's "conditional grammar... probably the largest hidden problem" names generically, and CyL's DSU case (ADR-0295 context table) shows the same shape recurring outside Andalucía entirely. | This is the clearest C-category candidate with the least Andalucía-specific content: the reusable part (a decision-tree evaluator over parcel geometry facts) is a **schema/engine feature**, independent of any region — which is exactly why it belongs at L2 (`packages/geometry-kernel`/`site-parcel-data`), not in a regional layer. Building it *because* of Andalucía would misattribute a cross-region need to one region. |

---

## Part 3 — Proposed architecture

### 3.1 The question as posed does not survive contact with the existing layer model

**VERIFIED, from `CLAUDE.md`**: PRYZM's 8-layer model (L0–L7.5) is a **dependency-direction rule
enforced by `eslint-plugin-boundaries`**, not a place to register jurisdictions. Every layer (L0
schemas, L1 command-bus/picking/etc., L2 geometry-kernel/ai-host/constraint-solver, L3
runtime-composer/stores, L4 renderer/persistence, L5 apps, L6 plugin-sdk, L7 plugins) is defined by
*what kind of code it contains* (pure math, I/O boundary, UI surface), never by *which country's law
it encodes*. `@pryzm/site-parcel-data` — the package every Andalucía finding in this document
actually lives inside — is **VERIFIED L2** (its own `package.json` description: *"C58 — L2 pure
zoning-rules engine + buildable-envelope solver"*). **An "Andalucía Engine" cannot be a new layer**:
there is no dimension in the 8-layer model along which "region" varies independently of "what kind
of code." Proposing one would be proposing a 9th axis orthogonal to the one CI actually enforces —
architecturally incoherent, not merely unnecessary.

**Could it be a plugin (L7)?** **PROPOSED: no.** Plugins (`plugins/*`, 46 today) are user-facing
*tools* — wall, door, roof, stair — each pairing an L2 geometry package with an L7 UI surface. A
region has no UI surface of its own; the site-feasibility flow one plugin already owns (onboarding →
site → generate → view, per `onboarding-site-generate-view-flow.md`) does not branch its UI by
region today and has no forcing reason to start.

**What IS Andalucía, architecturally?** **PROPOSED, and this is where ADR-0294/0295 already answer
the question**: Andalucía is **a bundle of data-provider registrations inside the existing L2
`site-parcel-data` package** — exactly the shape Sevilla, Córdoba, Málaga, and Granada already take
in `registry.ts` today. Nothing new is required at the layer level. What *is* missing, and what this
document proposes building, is internal organisation *within* that existing package so "Andalucía"
becomes a legible grouping without becoming a code path:

```
packages/site-parcel-data/src/
├── rulepacks/
│   ├── esCordobaPGOU2001.ts        ← municipal, B-category (unchanged)
│   ├── esSevilla.ts                 ← municipal, B-category (unchanged)
│   ├── esMalaga.ts / esGranada.ts   ← municipal, B-category (unchanged)
│   └── registry.ts                  ← ONE flat list, as today — NO region grouping inside it
│
├── providers/
│   ├── containers/
│   │   ├── arcgisRest.ts            ← A/C-category: container, region-agnostic (EXISTS)
│   │   └── sipuShapefile.ts         ← A/C-category: container, region-agnostic (EXISTS)
│   │
│   └── overlays/                    ← PROPOSED new grouping, not a new layer
│       ├── esAndaluciaHeritageBica.ts     ← A-category: bica_public WMS/WFS
│       ├── esAndaluciaFloodRediam.ts      ← A-category: REDIAM T10/T50/T100/T500
│       └── esAndaluciaEnvironmentRediam.ts ← A-category: REDIAM Natura 2000/RENPA
│
└── grammar/                          ← PROPOSED, C-category evaluators, region-agnostic
    └── conditionalSetback.ts         ← e.g. area/frontage-gated decision tree (Part 4)
```

This is a **file-organisation proposal**, not a new architectural layer: `providers/overlays/` sits
at exactly the same L2 depth `providers/` already occupies, and it is populated by **the three A-
category components from Part 2**, named individually per overlay type (heritage, flood, environment)
rather than bundled into one `esAndalucia.ts` — because ADR-0295's "no region-specific branching
inside the engine" rule applies just as much to a bundled Andalucía provider file as to a bundled
Andalucía *code path*: a municipality resolver in Extremadura or Murcia that happens to sit near an
Andalucía border should be able to import `esAndaluciaFloodRediam.ts` without importing heritage or
environment logic it does not need, and without the file implying "Andalucía" is a unit the engine
reasons about.

### 3.2 What belongs at each existing layer, restated for this specific question

| Layer | What belongs here for Andalucía | What absolutely does not |
|---|---|---|
| **L0 schemas** | Nothing Andalucía-specific — `JurisdictionZoningContract`, `EnvelopeRefusal` etc. are already country/region-agnostic (**VERIFIED**, `esSevilla.ts` imports these unchanged from `@pryzm/schemas`) | A region-specific schema variant. If Andalucía's ordinances needed a field type no other region needs, that field belongs in the universal schema (like `tiers` was added for Barcelona's industrial pack) — never a parallel Andalucía schema. |
| **L1/L2 (`site-parcel-data`, `geometry-kernel`)** | Municipal rulepacks (Córdoba/Málaga/Granada/Sevilla), the three regional overlay providers, any C-category evaluator that survives Part 4's evidence bar | An `isInAndalucia()` branch anywhere in the dispatch or resolution path (ADR-0295 §"NO REGION-SPECIFIC BRANCHING INSIDE THE ENGINE", verbatim) |
| **L3–L4 (runtime-composer, renderer)** | Nothing region-specific — already true today, confirmed by the total absence of any Andalucía reference above L2 in the code read this session | Any rendering/massing logic keyed on jurisdiction — this would violate P2/P3 as well as the region-agnosticism principle |
| **L5 (`apps/editor`)** | `siteDispatch.ts`'s existing per-municipality `isInCordoba`/`isInSevilla`/... routing predicates (already present, already the pattern every jurisdiction in `registry.ts` uses) | A grouped `isInAndalucia()` gate wrapping the municipal ones — this is the one place a tempting-but-wrong regional code path could actually get written, and Part 8 explains why (a parcel two streets from the Málaga/Cádiz border must resolve to whichever municipality's own container answers, not to "Andalucía generically") |
| **L7/plugins** | The site-feasibility onboarding flow, unchanged — it already asks "where," resolves a municipality (or refuses), and never asks "which autonomous community" as a distinct question | A CCAA selector in the UI. The founder-ratified UX (`onboarding-site-generate-view-flow.md`) is location → draw → generate; inserting a region-choice step would be new UI surface this document finds no evidence justifies |

### 3.3 ASCII architecture diagram

```
                         ┌─────────────────────────────┐
                         │   Spain (national default)   │   L2 — Catastro INSPIRE
                         │   parcel geometry, uniform    │   (the ONE genuinely national layer)
                         └───────────────┬───────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                 │                                 │
┌───────▼────────┐             ┌─────────▼─────────┐              ┌────────▼────────┐
│  Andalucía       │             │  Catalunya          │              │  Madrid /         │
│  overlay bundle  │             │  overlay bundle      │              │  other regions'   │
│  (A-category,     │             │  (AMB Refós is a     │              │  own overlay      │
│  PROVIDERS not    │             │  genuine regional-   │              │  bundles           │
│  a code path)     │             │  metro LEGAL TEXT,   │              │                    │
│                    │             │  see Part 6)         │              │                    │
│ • bica_public      │             └──────────┬──────────┘              └────────┬─────────┘
│   (heritage)       │                        │                                   │
│ • REDIAM flood     │                        │                                   │
│ • REDIAM Natura     │                        │                                   │
│   2000/RENPA        │                        │                                   │
└─────────┬──────────┘                        │                                   │
          │  (consumed BY municipal            │                                   │
          │   resolvers, never routes           │                                   │
          │   THROUGH a regional gate)          │                                   │
          │                                      │                                   │
┌─────────▼──────────┐   ┌──────────┐  ┌────────▼────┐  ┌──────────┐   ┌───────────▼──────┐
│ Córdoba adapter      │   │ Málaga    │  │ Barcelona    │  │ L'Hosp.   │   │ Madrid PGOUM97     │
│ (GeoServer WFS         │   │ adapter   │  │ adapter       │  │ /Badalona │   │ adapter              │
│  container, SIGNED)   │   │ (locked)  │  │ (SIGNED,      │  │ (refusal- │   │ (refusal-only,      │
│                        │   │           │  │  4 packs)     │  │  only)    │   │  machine-extracted) │
└─────────┬─────────────┘   └────┬─────┘  └──────┬───────┘  └────┬──────┘   └─────────┬────────────┘
          │                       │                │                │                    │
┌─────────▼─────────────┐  ┌─────▼──────┐   ┌─────▼──────┐  ┌─────▼──────┐    ┌─────────▼──────────┐
│ Granada adapter          │  │ Sevilla     │   │ Every other │  │            │    │ Every other Spanish │
│ (raster-legal, refuses    │  │ adapter     │   │ municipality│  │            │    │ municipality with a │
│  by design, Art 7.9.6)    │  │ (ArcGIS     │   │ registered  │  │            │    │ registration         │
│                            │  │  REST,      │   │ in          │  │            │    │                       │
│                            │  │  gate shut) │   │ registry.ts │  │            │    │                       │
└────────────────────────────┘  └─────────────┘   └─────────────┘  └────────────┘    └───────────────────────┘
          │                       │                │                                     │
          └───────────────────────┴────────────────┴─────────────────────────────────────┘
                                         │
                              ┌──────────▼───────────┐
                              │  Envelope engine       │   L2 — ONE compute path
                              │  (computeBuildable-     │   (`computeBuildableEnvelope`,
                              │  Envelope, geometric     │    `tiered-occupation`,
                              │  rule kinds, tiers)      │    `explicit-area`, `setback`…)
                              └───────────────────────┘
```

**Key property this diagram is drawn to make visible**: the overlay bundle sits **beside** the
municipal adapters, feeding into them, never **above** them as a routing gate. A parcel resolution
never asks "is this Andalucía?" — it asks "is this Córdoba / Málaga / Granada / Sevilla / [747 other
Andalucían municipalities not yet touched]?", and *separately*, any of those resolvers may optionally
consult the Andalucía overlay bundle for heritage/flood/environment facts, the same way a Madrid or
Barcelona resolver could in principle consult it too if their own parcels ever cross into Andalucía
(they structurally cannot, but the point is the overlay bundle has no dependency on which
municipality is asking).

### 3.4 Dependency diagram (who imports whom)

```
esAndaluciaHeritageBica.ts ─┐
esAndaluciaFloodRediam.ts ──┼──►  imported optionally by  ──►  esCordobaPGOU2001.ts
esAndaluciaEnvironment...ts ┘                                   esSevilla.ts
                                                                  esMalaga.ts / esGranada.ts
                                                                  (and, in principle, any future
                                                                   Andalucían registration —
                                                                   NOT imported by registry.ts
                                                                   itself, and NOT imported by
                                                                   siteDispatch.ts)

containers/arcgisRest.ts ───────► imported by ──► resolveSevillaZone.ts, resolveSevillaAlignments.ts
                                                     (and, per its own header comment, DESIGNED to be
                                                      imported by any future ArcGIS-published Spanish
                                                      municipality — not Andalucía-specific)

registry.ts ─────────────────────► imports every municipal rulepack DIRECTLY, flat list, no
                                     intermediate "Andalucía" aggregation object
```

The dependency rule that matters: **overlay providers are a leaf a municipal adapter may optionally
depend on; nothing depends on "Andalucía" as a concept**, because no such module exists to depend on.
This is the concrete difference between "Andalucía as an engine" (rejected) and "Andalucía as a
provider bundle" (proposed) — the former requires every municipal adapter to route *through* it, the
latter lets each adapter *pull from* it or not.

---

## Part 4 — Common rule abstractions

**Method, stated up front per the brief's constraint**: this section identifies recurring *shapes*
across the four capitals actually researched (plus Barcelona/Madrid/CyL where the existing codebase
already generalizes past a single city) and states, for each, whether the evidence supports treating
it as reusable. Where the answer is "not yet, only one instance exists," that is reported as the
finding — not dressed up as a design.

### 4.1 Conditional setback/occupancy evaluator — the strongest candidate

**Input → common rule model → output**, described without code:

- **Input**: a parcel's own measured facts (area, street frontage, block depth, corner/mid-block
  status) plus an ordinance's decision tree over those facts (e.g. Sevilla SB Art. 12.5.4: `IF area
  ≤ 110 m² THEN occupancy = 100% ELSE occupancy = 80%`; Art. 12.5.6: `IF area > 110 m² AND depth >
  15 m THEN rear_setback = max(0.4 × height, 3 m) ELSE rear_setback = 0`).
- **Common rule model**: a small decision-tree/rule-table schema — condition (parcel-fact
  comparator) → consequence (a scalar or a reference to another rule) — evaluated against the
  parcel's resolved facts at dispatch time, rather than a scalar baked into the pack at authoring
  time. ADR-0295 §"conditional grammar" already names this as "probably the largest hidden problem"
  and the CyL DSU case (its own context table) shows the exact same shape recurring **outside**
  Andalucía, which is the evidence this is a cross-region primitive, not an Andalucía one.
- **Output**: the same `BuildableEnvelope.setbacks`/`maxCoverage` fields the schema already
  carries — the evaluator changes *how* a value is derived, not the schema it populates.
- **Evidence status**: **INFERRED reusable, zero shipped instances.** Sevilla SB is the only
  transcribed example of this shape in the Andalucía corpus, and it is not itself dispatched
  (`SEVILLA_ENVELOPE_VERIFIED = false`). This is a genuine C-category candidate — worth building as
  an L2 primitive precisely *because* it is not region-specific — but it should not be described as
  proven until a second independent instance (from any region) confirms the shape generalizes rather
  than merely resembling itself once.

### 4.2 Block-ring/alignment-derived depth evaluator

Barcelona's Ensanche (clau 13a/13E, Art. 242) and semiintensiva (clau 13b) packs already **share**
this evaluator — the `registry.ts` comment states explicitly that 13b uses "the SAME Art. 242 depth
construction... a DIFFERENT height table," i.e. one geometric evaluator, two legal parameter sets.
**This is the one evaluator in Part 4 with a working, shipped, cross-zone-family reuse instance
already in production** (VERIFIED, not inferred). Its precondition — a published alignment/block-ring
layer — is exactly what Córdoba's Manzana Cerrada and Sevilla's SB-rear-setback both lack today
(Córdoba: proven absent; Sevilla: present as raw geometry via Layer 4 but not yet clipped into a
depth figure). **The evaluator generalizes; its input does not exist everywhere**, which is the
correct C-category finding: build once, gate its use on a per-municipality data check, never assume.

### 4.3 Closed-block (front-0/side-0, party-wall) evaluator

Sevilla SB's Art. 12.5.3 (mandatory street alignment, no front setback; party-wall side setback) is
structurally the `kind: 'setback'` rule already implemented for Barcelona's `20a/*` aïllada family —
though the *values* differ completely (aïllada is a detached-typology family with real front/lateral
setbacks; SB is the opposite, a zero-setback closed-block pattern). **Evidence status: the rule
*kind* (a typed setback object with some legs at zero) already exists and is reused across Barcelona
zone families; whether it should be labelled a distinct "closed block" *evaluator* separate from the
general setback rule kind is not evidenced by anything found this session** — it may simply be the
generic setback rule with specific zero values, not a separate abstraction. **Report the ambiguity
rather than resolve it speculatively**, per the brief's own instruction not to invent.

### 4.4 Industrial and historic-centre evaluators — see Part 2's Category C table

Both are addressed above with the same evidence discipline: industrial has a working *rule kind*
(`tiered-occupation`) blocked from reuse by a legal-fact gap, not a geometric one; historic-centre has
a repeating *structural pattern* (protection catalogue ≠ buildable numbers) across all four audited
cities but zero transcribed instances anywhere to confirm a shared evaluator would actually fit once
the ordinance text is read.

---

## Part 5 — Scaling analysis

### 5.1 Current cost model: new municipality, build everything

**VERIFIED from the audits**, per-municipality build cost breaks into components that do **not**
share cost across cities even within Andalucía:

| Cost component | Córdoba (done) | Sevilla (partial) | Málaga | Granada |
|---|---|---|---|---|
| Container adapter (GIS query logic) | Built (WFS) | Built (ArcGIS REST, and reusable per §3.1) | Not startable — locked | Not startable — no vector source exists |
| Zone resolver | Built | Built (`resolveSevillaZone.ts`) | Blocked | Blocked |
| Ordinance transcription | 5 subzone families, OCR'd, signed | 1 of an unknown-sized zone universe | 0 — geometry blocks even starting | 0 — geometry blocks even starting |
| Rule pack authoring | 4 subzones dispatched | 1 zone packed, gate shut | 0 | 0 |
| Human sign-off (L-449) | **Done**, `VERIFICATION.md §SIG-1` | Not reached | Not reached | Not reached |
| Estimated total effort (this session's own estimates) | "Very Large" for city-wide completion, "Tiny–Small" for pilot closure | "2-4 engineering days" *once geometry unblocked* per Málaga audit's comparable estimate; Sevilla's own unlock is bounded by transcription volume, not geometry | "Large," dominated by a third-party account-unlock with no PRYZM-controlled timeline | "Very Large," dominated by an unresolved municipal-records question (does an internal vector master exist) |

**The dominant cost is never the container adapter** (the part a regional engine could theoretically
share) — it is **ordinance transcription and legal sign-off**, which is irreducibly per-municipality
because the law itself differs per-municipality (Part 2, Category B). This is the load-bearing fact
for the whole scaling question: **a regional engine would only ever have amortized the smallest line
item.**

### 5.2 Future cost model with the proposed architecture (Part 3), not a hypothetical Andalucía Engine

**PROPOSED, not verified**, because no municipality has yet been built *using* the reusable pieces
identified in Parts 2–4 end-to-end:

- **Container reuse** (A-category): a future ArcGIS-published Andalucían municipality (there is no
  evidence yet how many of the remaining ~774 Andalucían municipalities use ArcGIS vs. GeoServer vs.
  something else — this is genuinely unknown, not merely unstated) could reuse `containers/
  arcgisRest.ts` directly — **VERIFIED as a design property of that file** (it takes a service base
  URL and layer id as parameters, knows nothing about Sevilla specifically), not verified as having
  actually saved effort on a second instance yet (Sevilla is still the only ArcGIS-container
  municipality wired).
- **Overlay reuse** (A-category): the three regional overlay providers, once built (regional audit:
  "Tiny, <1 week"), are consumed with zero marginal cost by every future Andalucían municipality —
  this is the one line item genuinely shared across all 778 municipalities, and it is small.
- **Evaluator reuse** (C-category, Part 4): speculative until a second instance of the conditional-
  setback or block-ring evaluator is built against a non-Barcelona, non-Sevilla ordinance — reported
  honestly as unproven rather than assumed.
- **Ordinance transcription** (B-category): **does not shrink**. Each municipality's PGOU/ordinance
  text must still be read, transcribed, article-cited, and signed by a human, regardless of any
  regional engine. This is the majority of the cost in every one of the four capitals' own effort
  estimates above, and no architecture proposed in this document changes that.

### 5.3 Certification implications (L-449 discipline)

**VERIFIED from repo convention** (`esCordobaZoneClassification.ts`, `esSevilla.ts`,
`founder-gate-publication-authorization` memory): every jurisdiction's verification gate
(`CORDOBA_ENVELOPE_VERIFIED`, `SEVILLA_ENVELOPE_VERIFIED`, `ZARAGOZA_ENVELOPE_VERIFIED`, etc.) is a
**per-jurisdiction founder sign-off act**, never a code state an implementer may set. **This has a
direct, non-negotiable consequence for any regional-engine proposal**: even if PRYZM built a single
shared `arcgisRest.ts`-style container serving five Andalucían municipalities' zoning geometry
identically, **the legal certification of each municipality's rule pack would still require five
separate signatures**, because a signature certifies *this ordinance's parameters, correctly
transcribed and correctly bounded*, not *this container correctly queries a service*. Sharing code
never shares legal liability for a transcription. This is the single clearest argument against
"Andalucía Engine" as a *legal* concept even where it might be tempting as a *code* concept: **the
unit of certification is the municipality's ordinance, full stop**, and no architecture layer can
change that without PRYZM taking on legal risk no ADR in this repo authorizes.

### 5.4 Maintenance cost

**PROPOSED, reasoned from the evidence above**: maintaining N Andalucían municipal adapters under
the proposed architecture costs (a) one shared overlay-bundle maintenance burden (three WMS/WFS
endpoints, low-churn — heritage/flood/environment data changes far less often than zoning ordinances)
plus (b) N independent ordinance-currency-tracking burdens (each municipality's PGOU can be amended,
superseded, or partially modified on its own schedule — see Sevilla's own `Modificaciones PGOU`
layer, Layer 15, which exists specifically because ordinance amendments are a live, per-municipality,
ongoing fact). A regional engine would not reduce (b) at all; it might marginally reduce (a) below
what building three separate overlay files already achieves, which is not a meaningful additional
saving.

---

## Part 6 — Generalization to Spain

### 6.1 The AMB corpus as the test case for "is a metropolitan/regional engine ever right?"

**VERIFIED, from repo memory and the registry code**: the AMB (Àrea Metropolitana de Barcelona)
corpus is the closest existing precedent to a "regional engine," and it is instructive **precisely
because it is not one**. L'Hospitalet, Badalona, Sant Boi, and Cornellà are registered in `registry.ts`
as **four separate municipal jurisdictions** (`extentResolution: 'municipal'`), each with its own
bbox and its own refusal function (`lhospitaletUnverifiedRefusal`, `badalonaUnverifiedRefusal`,
etc.) — they happen to **share Barcelona's PGM-1976 legal instrument** (same clau vocabulary, same
Catalan MUC source), but the registry's own extensive comment block (§JURISDICTION-SPECIFICITY)
exists specifically to document a real bug that occurred when a *coarser* Barcelona metropolitan bbox
swallowed these four municipalities' land — the fix was to make each municipality's own claim
**finer** than Barcelona's, never to introduce a regional gate above all five. **This is the AMB
precedent's actual lesson, and it argues against, not for, an Andalucía-style regional engine**: even
where several municipalities genuinely share one legal instrument (which is *not* true of the
Andalucía capitals — Córdoba, Málaga, Granada, and Sevilla each have their own distinct PGOU), PRYZM
still resolves them as separate municipal registrations, sharing only the *underlying pack content*
(`esBarcelonaEnsanche.ts` is reused, not reinvented, once L'Hospitalet's numbers are verified equal
to Barcelona's — which the registry comment notes has **not yet been done**, hence the current
refusal-only state for all four AMB municipalities).

**Catalunya's own regional registration** (`esCatalunya.ts`, `extentResolution: 'regional'`) is a
genuinely different case worth naming as a counter-example to Andalucía: it exists as **the
refusal-of-last-resort for the other 947 Catalan municipalities PRYZM has not yet touched**, not as a
computation layer. It answers "what instrument governs here" (a routing/citation service) — it never
supplies a parameter. This is the correct shape for a regional registration everywhere it is used:
**a named, cited refusal target, never a computation shortcut.** An Andalucía-equivalent
(`esAndalucia.ts`, refusing for the other ~770 untouched municipalities by naming SITUA/VITUA's
instrument-type answer where available) is a legitimate, low-cost, Category-A-adjacent addition
this document recommends considering separately from the "engine" question — it is architecture
Catalunya already proves works, at negligible cost, and it upgrades an unregistered-fallback parcel
into a *named* refusal citing the correct instrument type, which is real value distinct from
computation.

### 6.2 Would a Murcia/Madrid/Cataluña/Balears/Canarias Engine make sense?

**PROPOSED, reasoned from each region's own registered shape in `registry.ts`**:

- **Murcia**: municipal GeoServer (distinct from the regional CARM layer per ADR-0294's own
  container table), one municipality registered, pack present but gate shut. No second Murcia
  municipality is registered yet — nothing to generalize across even within the region.
- **Madrid**: `esMadridNZ1.ts` (a live-resolved `explicit-area` declaration) + `esMadridPgoum97.ts`
  (23 machine-extracted zone codes) — both single-municipality (Madrid capital only), and NZ-1's own
  CPPHAN-discretionary nature (Part 8) is a reason a "Comunidad de Madrid Engine" would be actively
  misleading, not merely premature — the region's flagship zone is legally *not* a formula.
- **Cataluña**: the one region with a real multi-municipality shared-instrument case (Barcelona +
  AMB), and even there PRYZM resolves it as N separate municipal registrations sharing pack
  *content*, never a regional computation gate (§6.1).
- **Balears**: `esBalearsMuib.ts` is the Denmark/Paris/NL shape (live-resolved per parcel from the
  MUIB fitxa, `packsByZone` empty, gate shut) — **VERIFIED**, registered as `regional`-equivalent
  because Balears' own instrument (MUIB) genuinely is island-/region-wide, not municipal, which is a
  **different legal fact about that region** than is true of Andalucía (where SITUA/VITUA's own
  Normas Directoras schema was verified this session to be parameter-incomplete). **This is the one
  region in the registry that most resembles a "regional engine" — and it earns that shape because
  the underlying LAW is regional there, not because PRYZM chose an architecture.** Andalucía's law is
  not regional in the same sense (regional audit, throughout) — the architecture must follow the
  legal fact, and the legal facts differ between Balears and Andalucía.
- **Canarias**: `esCanariasSipu.ts` + `buildCanariasMunicipalRegistrations()` — **VERIFIED, and the
  closest existing precedent to "generate N similar municipal registrations from one shared data
  table"** (87 municipalities generated from `canariasMunicipalBboxes.ts` rather than hand-written,
  specifically because the registry's own comment says writing 87 near-identical literals would
  "restate... the single fact 87 times" and risk drift). **This is the correct pattern for Andalucía's
  own long tail** (774 remaining municipalities) if and when SITUA/VITUA's routing signal (§Part 2,
  Category A) is wired: generate refusal-only registrations from a bbox table, exactly as Canarias
  does, rather than hand-author 774 separate files. It is a code-generation pattern, not a regional
  engine — the distinction matters because generated registrations still resolve to municipal
  refusals, never to a shared computation.

**Conclusion for Part 6**: **no region examined — including the ones that look most "regional"
(Balears, AMB) — actually collapses to a shared computation engine.** Balears looks regional because
its *law* is regional. AMB looks regional because four municipalities share one *instrument*, but
still resolve as four registrations. Andalucía has neither property (regional audit: the one
candidate regional instrument is parameter-incomplete; the four capitals have four distinct PGOUs).
**The pattern that generalizes to "feed one national envelope engine" is the registry itself
(`registry.ts`) — already national, already the single computation path every region's municipalities
resolve through — not a hierarchy of regional engines beneath it.**

---

## Part 7 — Internationalization

**VERIFIED, from direct code read** of `dkPlandataEnvelope.ts`, `nlBestemmingsplan.ts`,
`frParisPluBioclimatique.ts`, and `chZoning.ts` (headers and `registry.ts` import comments — see
Part 1's code-read list):

| Country pattern | Shape | Relevant comment |
|---|---|---|
| **Denmark** (`dkPlandataEnvelope.ts`) | National, live-resolved per parcel via Plandata.dk, `packsByZone` EMPTY | "the FIRST fully-automated jurisdiction... registers with an EMPTY `packsByZone` and exists here to light the C60 coverage globe" |
| **Paris** (`frParisPluBioclimatique.ts`) | Municipal (Ville de Paris specifically, not all of France), live-resolved, `packsByZone` EMPTY | "Like Denmark, an ANSWERING jurisdiction whose envelope is resolved LIVE per parcel... `packsByZone` is EMPTY" |
| **Netherlands** (`nlBestemmingsplan.ts`) | National, keyless via the PDOK RP WMS, same live-resolved shape as Denmark/Paris | "Same live-resolved shape as Denmark/Paris" |
| **Switzerland** (`chZoning.ts`) | National, zone identity resolved live, but **refuses** (density/height are model+PDF-bound) | "`packsByZone` is empty; `noRulePackRefusal` returns the Swiss cited refusal" |

**This is the already-international pattern, and it directly answers Part 7's question**: PRYZM's
existing international jurisdictions are organised **exactly like the Spanish municipalities** —
each is a flat registration in the same `registry.ts`, distinguished by whether its underlying
publisher exposes a **live-resolved** container (DK/NL/Paris — query the source at dispatch time,
never cache a static pack) or a **static/curated** one (every ES municipality examined in this
document, plus Switzerland's refusal). **There is no intermediate "country engine" layer in any of
the four — France is not routed through a "France Engine" before reaching Paris; Paris is a flat
registration, same rung as any Spanish city.** This is the single strongest piece of evidence in the
whole document against the very premise of a regional/national engine layer: **PRYZM has already
built four working international jurisdictions, and none of them needed one.**

**Would Country → Regional engine → Municipality adapter → Envelope engine work for Portugal, France,
Italy, Germany, Netherlands, UK?** **PROPOSED, reasoned from the DK/NL/Paris/CH evidence**:

- **What generalizes across countries (universal, PROPOSED)**: the container abstraction (WFS/WMS/
  ArcGIS REST/keyless-WMS/national-registry patterns — already proven across ES, DK, NL, FR, CH); the
  confidence-propagation model (ADR-0294 §2, universal by construction — a Medium-confidence German
  zone should degrade the same way a Medium-confidence Sevilla zone does); the five-independent-
  capabilities decomposition (ADR-0295, stated as universal, not Spain-specific, in its own text);
  the refusal-typing vocabulary (`NO_GRAMMAR`/`NO_ALIGNMENT`/etc., already typed generically).
- **What does not generalize (country-specific, VERIFIED by the four instances read)**: whether a
  country's planning-data publication is genuinely NATIONAL (Denmark, Netherlands — both live-
  resolved at the *country* level, no municipal adapter needed *because the country itself already
  publishes uniformly*) or genuinely MUNICIPAL (Spain, and — on the one data point available — France,
  where only Paris, not a French national layer, is registered). **This is not a question an
  architecture can decide in advance**: it is a fact about each country's own planning-law
  publication structure, discoverable only the way this document's four Andalucía audits discovered
  it for Spain — by direct measurement, municipality (or country) by municipality (or country).
  Portugal/Italy/Germany/UK each need their own version of this session's audit before any layering
  decision is made; assuming any of them will turn out DK-shaped or ES-shaped without checking would
  repeat exactly the "no WFS ⇒ blocked" pessimism-without-verification error ADR-0294 was written to
  correct.
- **Would a "regional engine" sit between country and municipality for any of them?** **PROPOSED: no
  evidence found for any of the four already-built countries that it would help, and the Andalucía
  case study (Parts 1-6) is a direct demonstration of why not**: Denmark and Netherlands don't need
  one (national IS the working level); France's only registered instance is municipal with no
  intermediate region; and Spain's own strongest test of the idea (this document) found the
  candidate regional layer parameter-incomplete. **The burden of proof for inserting a regional tier
  anywhere — Spain, Portugal, Germany, or elsewhere — should be a country-specific finding that the
  region's own instrument is complete enough to serve parcels directly (as Balears' MUIB fitxa
  appears to be, §6.2), not an architectural default.**

---

## Part 8 — Risks: where the abstraction breaks

Every item below is a **specific, evidenced** case where a municipality/region's law resists
generalization, per the brief's instruction to explain *why* — not merely to list categories.

1. **Discretionary approval overriding any formula** — Madrid NZ-1's CPPHAN discretion (memory:
   `madrid-nz1-ring-only-decision` — "Height CPPHAN-discretionary"). **Why it cannot generalize**: a
   discretionary planning-commission approval is, by legal design, not a function of any parcel
   fact PRYZM could hold — it is a human committee decision made *after* the parcel facts are known,
   for reasons the ordinance itself does not fully specify in advance. No evaluator, regional or
   otherwise, can pre-compute a discretionary act. Granada's Art. 7.9.6 graphical delegation is the
   Andalucía-specific instance of the same *class* of risk (the law names an external act — reading a
   map, in Granada's case — as the operative determination, not a formula), and Sevilla SB's height
   (Art. 12.5.7 §2, "fixed on the Planos... per manzana", not a zone-wide scalar) is a third instance
   in the same audited set.
2. **Special plans (PERI/PEPRI/Plan Especial/Estudio de Detalle)** — measured at ~43-45% of Córdoba's
   pilot ordinance land, present (but unquantified) in Málaga (PEPRI Centro) and presumably Granada
   (four Conjunto Histórico sectors). **Why it cannot generalize**: each special plan is itself an
   independent legal instrument with its own boundary, its own approval date, its own parameters —
   generalizing "special plans exist" into a shared evaluator would require reading N independent
   plans, which is exactly the B-category ordinance-transcription cost Part 5 already found does not
   shrink.
3. **Heritage overrides** — Córdoba's PEPCH'01 catalogue supplies protection *level*, never
   height/setback numbers (VERIFIED, Córdoba audit §5); Granada's Alhambra/Generalife stakes are the
   highest in the region and the regional heritage layer's applicability to Granada specifically was
   **not verified live this session** — a genuine open risk, not merely a hypothetical one. **Why it
   cannot generalize**: heritage protection regimes are drafted per protected asset/zone, and a
   "protection level" is a pointer to a *separate* legal instrument (a catalogue entry, a Plan
   Especial de Protección), not itself a computable constraint — the same structural problem as item
   2, one level down.
4. **Coastal legislation** — **flagged as an explicit gap in this document's own Part 1 inventory**,
   not evidenced either way: neither Málaga (Costa del Sol) nor Sevilla (Guadalquivir tidal reach) had
   Ley de Costas / DPMT (dominio público marítimo-terrestre) servitude geometry investigated in any
   session this document draws on. **Why this is a named risk rather than a filled-in row**: Spain's
   coastal servitude law is a *national* instrument (Ley de Costas 22/1988) that could plausibly be
   Category A (regional/national overlay, like heritage/flood) — but this document explicitly refuses
   to classify it without verification, per the brief's own constraint against invented claims.
5. **Airport legislation** — verified UNKNOWN, not ABSENT, for three of four capitals (Málaga,
   Granada, Sevilla) and confirmed absent as usable geodata for Córdoba (Google My Maps embed, not an
   authoritative service). **Why it resists a shared evaluator even where the source (AESA, national)
   is plausibly regional-or-national**: the audits found the actual **servitude geometry** access
   pattern differs per airport (Barcelona: full 3D KMZ, VERIFIED; Córdoba/Málaga/Granada: unresolved
   or PDF-only) — a nominally-national publisher does not guarantee uniform per-airport data quality,
   so even a Category-A overlay here would need per-airport verification, not a blanket assumption.
6. **Delegated planning instruments generally** — the Normas Directoras schema itself (regional
   audit) is the clearest evidence in this whole document of the risk class: a genuine *regional*
   legal instrument exists, is mandatory, is live — and still cannot supply an envelope, because the
   legislature that wrote it chose to standardise classification and FAR, not the full parameter set.
   **Why this specifically breaks a "regional engine" assumption**: it demonstrates that regional
   legal *harmonization* (a real, valuable thing SITUA/VITUA achieves) is a completely different
   claim from regional *parameter completeness* (which it does not achieve) — conflating the two is
   the exact mistake this document's Part 3 recommendation is structured to avoid.
7. **Conditional ordinances (the Sevilla SB case, generalized)** — Art. 12.5.4/12.5.6's parcel-size
   and depth thresholds are the mildest version of this risk (Part 4.1 proposes an evaluator for
   exactly this shape) — but ADR-0295 §"conditional grammar" independently names this "probably the
   largest hidden problem" *before* any Andalucía-specific evidence existed, meaning the risk is
   already known to be systemic across regions, not particular to Andalucía. **Why a shared evaluator
   only partly mitigates it**: the evaluator can execute a decision tree once one is transcribed, but
   authoring that tree is still B-category, per-ordinance, human work — the risk shifts from "can the
   engine represent this" (solvable, Part 4) to "has a human correctly transcribed this specific
   ordinance's tree" (does not shrink, ever, per Part 5.3's certification argument).

---

## Deliverables summary

- **Reusable components (Category A)**: `bica_public` heritage WMS/WFS, REDIAM flood WMS/WFS, REDIAM
  Natura 2000/RENPA WMS/WFS, `containers/arcgisRest.ts` (already built, proven on Sevilla),
  `containers/sipuShapefile.ts` (already built, proven on Canarias), SITUA/VITUA as a routing/
  citation signal (not a parameter source).
- **Municipality-specific components (Category B)**: every zoning polygon source, every ordinance
  transcription, every height/FAR/setback/depth table, every legal-delegation determination, for
  every one of Córdoba/Málaga/Granada/Sevilla individually — none reduced by this document's proposal.
- **Potentially reusable (Category C, unproven)**: conditional setback/occupancy decision-tree
  evaluator (strongest candidate, zero shipped cross-region instances yet); block-ring/alignment
  depth evaluator (proven within Barcelona's own zone families, blocked elsewhere by missing
  alignment data, not by the evaluator itself); closed-block, industrial, and historic-centre
  evaluators (structural similarity observed, insufficient transcribed instances to confirm).
- **Architecture diagrams**: §3.3 (layered ASCII), §3.4 (dependency diagram) — both show overlay
  providers feeding municipal adapters, never a regional gate above them.
- **Scaling roadmap**: Part 5 — container/overlay reuse is real but small; ordinance transcription
  and per-jurisdiction certification (L-449) are the dominant, non-shrinking cost, regardless of
  architecture.
- **Implementation roadmap** (PROPOSED, ordered by evidenced cost/value):
  1. Build the three `providers/overlays/es-an*` files (Tiny, regional audit's own estimate) —
     highest ratio of verified-live-data to engineering cost in this whole document.
  2. Register `esAndaluciaRegionalRefusal` (Catalunya-pattern, §6.1) so the ~770 untouched
     Andalucían municipalities resolve to a named, SITUA/VITUA-cited refusal instead of an
     unregistered fallback — small, evidenced, non-computational.
  3. Continue municipal work exactly as the four capital audits each independently recommend:
     Córdoba (finish pilot-scope blockers 3-4, "Tiny-Small"), Málaga (wait for the GeoServer
     account unlock — external, not engineering), Granada (file the municipal-records request
     before any digitisation estimate is trusted), Sevilla (continue the zone-by-zone
     transcription the `SB` pack already demonstrates the pattern for).
  4. Only after a second, non-Barcelona, non-Sevilla instance of the conditional-setback
     evaluator (§4.1) is transcribed, consider promoting it from "candidate" to "built primitive."
- **Certification implications**: L-449 signatures remain strictly per-municipality no matter what
  is shared in code (§5.3) — this is the one conclusion in this document that is not contingent on
  any future measurement; it follows directly from how PRYZM's existing sign-off discipline is
  defined.

---

*Maintainer: UNASSIGNED. This document synthesizes five 2026-08-04 capability audits plus direct
code/ADR reads; it makes no claim not traceable to one of the sources listed at the top. Where a
claim in a source audit was itself marked unverified/unresolved, this document preserves that
marking rather than upgrading it.*
