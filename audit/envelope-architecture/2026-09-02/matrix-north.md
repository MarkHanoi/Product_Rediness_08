# LANE MATRIX-NORTH — DK · EE · SE · DE, 12 constraint classes, cell-by-cell against HEAD

**Date:** 2026-09-02 · **Posture:** read-only pre-implementation validation under the three binding
constraints (NO E4 redesign · NO generic constraint graph · NO kernel replacement). Every cell was
verified against code THIS session (foreground reads); the three lane reports were read first and
are cross-checked, not re-derived. Verdicts: **PASS** · **PASS-BY-EXT** (existing kind + data only)
· **GAP** (missing primitive named, preferring lane A's 14). "REFUSAL-ONLY" = honest but
GAP-for-drawing, marked ⟂.

Ground fact for every row: the adapter inventory is `countryAdapters/{dk,ee,fi,fr,lt,lu,no,pl,pt,se}`
— **there is NO `de/` adapter and no XPlanGML parser anywhere in `packages/`** (grep `XPlanGML|XPlanung`
over packages/server/tools → one comment, `sourceRegistry/de.ts:11`). Germany exists as docs +
registry rows + the e8 extraction trial only. The engine's kind registry is
`packages/schemas/src/site/GeometricRule.ts` — exactly 6 kinds (`setback` :52 · `alignment` :124 ·
`block-derived-alignment` :158 · `tiered-occupation` :244 · `occupation-capped-alignment` :352 ·
`explicit-area` :367; union :373-381).

---

## C1 · BUILDING LINES

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DE** | Baulinie vs Baugrenze — live-probed XPlanGML layers `ms:bp_baugrenze_lines`, `ms:bp_baugebietsteilflaeche_polygons` (MV WFS, `docs/04-reference/jurisdictions/de/findings/GERMANY-DATA-RECON-SPIKE.md:118-131`); Berlin extraction targets "`Baugrenze`, `Baulinie`" (`de-be/11000-berlin/EXTRACTION-PIPELINE.md:58`) | **Baugrenze →** `explicit-area` (`GeometricRule.ts:367-371`, `ringRef` — "when the document IS the polygon, transcribing it into parameters is a lossy re-derivation"). **Baulinie →** `alignment` `alignTo:'official-line'`, `alignmentOffset_m:0` (`GeometricRule.ts:84-96,124-140`) | ring ∩ parcel (explicit-area branch); inset + half-plane clip (alignment) | **Baugrenze: PASS-BY-EXT** (kind is 1:1; missing = the DE adapter/data). **Baulinie: PASS-BY-EXT with a named caveat** — `alignment` REQUIRES `buildableDepth_m` strictly positive (`GeometricRule.ts:131-139`), which a Baulinie alone does not state; where Baulinie + rear Baugrenze are both drawn (the normal case) the honest route is the ENCLOSED ring → one `explicit-area`. A build-to-only line with open depth has no kind (lane A row 11 `BUILD_TO_LINE`); for the MAXIMAL envelope the inequality reading is volume-identical, so the residue is an OBLIGATION gap (lane C T3 #7 family), not an envelope gap |
| **DK** | byggelinjer — "Per-edge setbacks are a separate byggelinjer dataset — NOT on the plan feature" (`dk/ENVELOPE-RULES.md` §1 table; `providers/mapPlandataToZoningRecord.ts:59`) | `packages/site-parcel-data/src/geometry/buildingLineOffset.ts` (§L-619 G2/G10): line→parcel-edge match by parallelism+proximity, `BuildingLineConstraint` with `binding:'unknown'`, measured perpendicular offset, NEVER an invented front/side/rear. Consumed by `rulepacks/dkEnvelopePlacement.ts` TIER 2 of the placement ladder (:16-27), which IS wired into `ZoningRulesEngine.ts` | edge-matched offset → band clip | **PASS-BY-EXT** — machinery shipped + engine-wired; the missing piece is the byggelinjer **WFS feed itself** (GAP-ROADMAP G2 "schema NOT verified — probe"). Data only |
| **EE** | hoonestusala — `dp_hoonestus` building-area polygon with ehitusõigus attributes, served + fetched live (`eePlanProvider.ts:10-16,146-160`) | Ring is minted as `SiteIntelPrescription.geometry` (`eeRuleMapper.ts:209-216`, R1 referent ladder rung 1). **No EE→C58 pack exists** — `ee/index.ts` contains zero envelope/contract references (grep) | would be `explicit-area` verbatim | **PASS-BY-EXT** — the kind + the fetched geometry both exist; missing = the EE→C58 join (one adapter function in the `dkPlandataResolvedPack` shape). Today ⟂ (rules catalogued, nothing drawn) |
| **SE** | prickmark/kryss — "setbacks expressed as *prickmark* (no-build area) and *kryss* (must-build area) markings on plan map; not in structured API attributes — ~0%" (`docs/04-reference/jurisdictions/se/LEGISLATION-RATE.md:44`) | **NONE in code.** Geometry provisions sit in the 825 counted-not-imported catalogue rows (`sePlanProvisionCatalogue.ts:20-24`); the detaljplan geometry service is credential-gated — HTTP 401, state's own bytes committed (`seNgpGate.ts:16-28`, `SE_NGP_DEFERRED_TOKEN`) | parcel ∖ prickmark strips = **polygon difference** | **GAP** — kernel `difference (A∖B)` is deliberately NOT delivered (`geometry-kernel/pure/polygonBoolean.ts`: intersection+union only; lane B costed gap #1), and the input data is behind the NGP credential gate. Two independent blockers; the C74 deferred-stub posture is correct meanwhile |

## C2 · VARIABLE (HEIGHT-PROPORTIONAL) SETBACKS

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DE** | BauO NRW 2018 §6: "0.4·H, min 3 m; 0.2·H GE/GI; 0.25·H MK" — verbatim table in `de/de-nw/05315-koeln/NRW-SETBACK-ENGINE.md:19-27`; status "RESEARCH CAPTURE… H-measurement clauses PENDING a primary-text read"; "does NOT populate a per-zone setback metre… there is a formula to code once" | **NONE** — no kind can hold a formula; the C58 scalar `setback` triple is constants-only | closed form: h(x) ≤ dist_i(x)/0.4 per boundary = **pointwise min of inclined half-planes** over the footprint (lane B §1.8 — NOT a cycle for the maximal envelope). The shipped `solveBlockDerivedDepth` bisection (`geometry/blockDerivedDepth.ts:37-48` fixed budget, §L-581-MONOTONICITY premise check :102-116,185+) is the right PATTERN only for the feedback variant (setback(H) with H a design choice) | **GAP** — lane A primitive **#2 `HEIGHT_PROPORTIONAL_OFFSET(k,min_m)`** compiling to an inclined boundary plane, plus kernel primitive **inclined-plane height-field top** (lane B costed gap #3). ⚠ The bisection is NOT a substitute for the closed form: a single flat prism cannot represent a plane — any prism that touches the plane anywhere OVERSTATES elsewhere unless it takes the global min (understating everything else). The primitive is required, not a solver |
| **SE** | — "no national setback formula equivalent to German Abstandsflächen" (`se/LEGISLATION-RATE.md:44`); strips are drawn geometry → class C1 | n/a | n/a | class does not exist as a formula in SE law as repo-carried; no row |
| **DK** | BR18 boundary distances (naboskel metres) — **corpus-absent**: grep `naboskel` over docs+packages → 0 hits; DK legislation extraction covers bebygpct/maxbygnhjd/maxetager only | NONE | plain inset (kind exists) | **GAP-for-data only** — the `setback` kind + `insetPolygonPerEdge` would carry the numbers unchanged; the rule was never extracted from BR18. Cheapest cell in this class |
| **EE** | — detailplaneering draws hoonestusala instead of stating formulas; no repo-carried variable setback | n/a | n/a | class not carried; covered by C1-EE |

## C3 · STREET-WIDTH-DEPENDENT HEIGHTS

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DK** | gadehøjde/vejlinje — **the DK corpus carries none**: grep `vejlinje|gadeh` over docs/packages → 0 hits (the historical byggelov street-height rule was never captured) | NONE | n/a | no row per brief ("where the class exists with a real rule") — recorded as a corpus absence, not a representation gap |
| **DE** | Traufhöhe — an extraction TARGET only: `EXTRACTION-PIPELINE.md:58` (targets "Gebäudehöhe / Traufhöhe / Firsthöhe"); `de-be/11000-berlin/gis/legislation-record.json:37` `allowedMeasurements: ["OK Gebäude","Traufhöhe","Firsthöhe","unknown"]`. No street-width FUNCTION is repo-carried | NONE for DE. The machinery family exists for ES: constructed street width (`geometry/streetWidth.ts` L-537 — frontage-to-frontage from block geometry, cited as constructed) + banded lookup with band-edge refusal (`rulepacks/bcnAlcadaReguladora.ts`) | width construction → band table → height | **PASS-BY-EXT at machinery level, GAP-for-data** — if a B-Plan/BauO states a width-keyed Traufhöhe it lands as pack data over the existing construction pattern (which stays TS — constructions are deliberately not yet declarative, lane B §1.0). Sourcing is the blocker (e8: DE/NRW ~87% scanned) |
| **EE/SE** | class not carried in either corpus | — | — | no rows |

## C4 · INCLINED PLANES

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DK** | **det skrå højdegrænseplan** (BR18 byggeret: height ≤ 1.4 × distance to naboskel/vej) — THE canonical Danish inclined plane. **Zero repo hits**: grep `skrå|skraa|højdegrænse|hoejdegraense` over packages/docs/audit → nothing. Not in `DENMARK-LEGISLATION-EXTRACTION.md`, not in any lane report | **NONE — and it is NOT representable today.** `EnvelopeTierSchema` is polygon × [`baseHeight_m`, `maxHeight_m`] prisms only (`BuildableEnvelope.ts:388-399`); grep `inclined|height.?field|sloped plane` over site-parcel-data + schemas → 0 | per-boundary inclined half-space ∩ prism = height field | **GAP twice** — (a) the CORPUS never captured the rule (all three lane reports discuss DE §6 and the Paris gabarit; **none names the Danish plane** — see Disagreement D3); (b) the kernel primitive is lane B costed gap #3 / lane A STEP_PLANE-INCLINED_PLANE-at-kernel. ⚠ Latent risk: where a lokalplan is silent, the BR18 byggeret plane is the binding height law near boundaries; DK's flat `maxbygnhjd` prism can OVERSTATE there, and DK contributes **zero solves** to `check-envelope-never-overstates.ts` (lane B §1.5: 109 of 115 registered jurisdictions un-walked), so the gate cannot catch it |
| **DE** | §6 LBO Abstandsflächen planes — same construction as C2-DE (`NRW-SETBACK-ENGINE.md:19-27`) | NONE | pointwise min of planes | **GAP** — same two primitives as C2-DE; per-Land H-semantics are adapter DATA (lane A row 2) |
| **EE** | maxsoosak/minsoosak — roof pitch bounds in degrees, SERVED and mapped: `eeRuleMapper.ts:101-102` (`maxRoofPitch`/`minRoofPitch`, layers dp_hoonestus + dp_krunt) | Rule plane only — tier-1 `SiteIntelRule` rows; no envelope consumer, no roof-plane geometry | roof plane at pitch θ over eaves line | **PASS at representation / GAP for drawing** — the same inclined-top primitive would consume it; until then the parameter is honestly catalogued, nothing extruded ⟂ |
| **SE** | Takvinkel provisions in the imported catalogue — `DP_KM_Eg_Takvinkel_Exakt_Byggnad` "Takvinkeln … ska vara [takvinkel:decimaltal] grader" (`sePlanProvisionCatalogue.ts:863-878`) | vocabulary row with `valueBasis` code; values credential-gated → all tier-6 (`seRuleMapper.ts` header: 83 of 83 UNKNOWN) | as EE | same split as EE: **PASS at representation / GAP for drawing** ⟂ |

## C5 · STEPBACKS

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DE** | `z_staffel` (Staffelgeschoss storey count) — a live-probed XPlanGML attribute on `bp_baugebietsteilflaeche` (`GERMANY-DATA-RECON-SPIKE.md:130`) | `EnvelopeTierSchema` explicitly supports podium/tower stacking — "expressible by setting the upper tier's `baseHeight_m` to the lower one's `maxHeight_m`" (`BuildableEnvelope.ts:363-368`) and `envelopeToMassing` rasterises tiers. BUT only ONE engine branch EMITS tiers (`ZoningRulesEngine.ts:412-414` — "EMPTY for every rule kind that…"; the `tiered-occupation` branch) | upper-tier inset polygon at baseHeight | **PASS-BY-EXT** — schema + rasteriser ready; needs a pack/kind that emits an upper tier with a recession (the recession distance is B-Plan text → OCR-bound). No new kernel primitive |
| **DK/EE/SE** | no repo-carried stepback rule (DK ático-class rules live in lokalplan PDFs; EE/SE not captured) | — | — | no rows |

## C6 · HEIGHT FIELDS (ABSOLUTE-DATUM HEIGHTS)

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **EE** | `korgusabs` — "absolute (EH2000 datum where tingimus says so — NORMATIVE, not SURVEYED)" (`eeRuleMapper.ts:27-28`), mapped as its OWN parameter `maxHeightAbsolute` (:90) beside relative `maxHeight` (:89) | Two DISTINCT parameters at the rule plane — the flattening lane A §4.1 warns about is structurally avoided. Consumers of `maxHeightAbsolute`: **none outside tests** (grep) | absolute cap = plane at EH2000 elevation − terrain sample at the legal reference point | **PASS at representation; GAP for drawing** — conversion needs a terrain datum + the façade-point discipline (`facadeRasantDatum.ts` is the pattern but its constants are PGM Art. 240-specific, lane C T3 #1). Nothing conflates the two today because nothing consumes the absolute one ⟂ |
| **DE** | Höhenfestsetzungen über NHN — the E8 catch, verbatim: `maxHeight_m = 72.2` from "…eine Gebäudeoberkante von **bis zu** 72,2 m **über NHN** möglich" — "an absolute elevation over a vertical datum — the L-584 defect… **auto-accepts with zero flags**… today nothing stops it" (`audit/europe-site-intel/2026-08-31/impl/e8-trial.md:225,253-256,338-343`) | **What prevents that class now: NOTHING on the DE path.** Measured in the trial itself: exactly ONE `QualifierLexicon` exists in `packages/ordinance-extraction` and it is `de-CH` (grep `:340`); no German lexicon → 2 of 3 wrong DE claims auto-accept. The guards that DO exist are patterns, not enforcement: the EE distinct-parameter split (this table, row above), SE's `Nollplan` codes (next row), and `hoeheMN` documented per-city (`de-hh/02000-hamburg/README.md:50,70`, `de-by/09162-munich/README.md:59`) | n/a (extraction-layer defect) | **GAP** — two named pieces: a German `QualifierLexicon` (the trial's own 10-pattern artefact exists at `tools/ordinance-trial/lib/germanQualifiers.ts` but is NOT in the package), and lane A row 7's `datum` attribute on every vertical parameter so "über NHN" cannot parse into a relative-height seat at all |
| **SE** | `…NockhojdNollplan` / `…TotalhojdNollplan` vs `…Nockhojd` / `…Totalhojd` — the state serves the datum distinction AS CODE (`sePlanProvisionCatalogue.ts:48-56`: "a `Nollplan` provision needs a datum, not a terrain sample… Both facts ride the code into `valueBasis`"; codes at :308-563) | R2 `valueBasis {scheme:'se-boverket-bestammelsekod', code}` on every row including tier-6 (`seRuleMapper.ts` header) | as EE | **PASS at representation — the strongest of the four** (machine-distinguishable before any terrain is sampled); values credential-gated ⟂ |
| **DK** | Plandata heights are relative (`maxbygnhjd`); no absolute-datum class carried | — | — | no row |

## C7 · FAR + COVERAGE + HEIGHT INTERACTION

| Country | Real example (verbatim from live transcripts) | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DK** | **The walk the brief asked for, executed live 2026-09-01** (`audit/…/impl/lane-dk-transcripts/2026-09-01-chain-executed-live.txt`): **DK-A** Nørrebro matr. 4801 (3,776 m²) — "`bebygpct value=150 … valueBasis={dk-bygberegnaf:4}` … GFA CONSUMER: COMPUTED gfaM2=5664 — GFA = 150 % × 3776 m² … valid because bebygpctaf=4 … parcel-scoped (L-449)"; `maxbygnhjd=24` tier-1; `maxetager` tier-6 UNKNOWN. **DK-B** Aarhus ramme — "`bebygpct value=180 … valueBasis={dk-bygberegnaf:1}` … REFUSED reason=basis-planning-area … **the naive per-parcel multiply would have said 14927.4 m2 - that number is produced NOWHERE**" | Both routes shipped: (1) C58 route — `rulepacks/dkPlandataEnvelope.ts` `resolveDkPlanEnvelope` (:254) FAR only at parcel scope, withheld with typed reason otherwise; `dkPlandataResolvedPack` (:358) → `computeBuildableEnvelope` → `farLimitedHeight` (maxGFA = FAR × parcelArea, denominator hardwired parcel — the header says exactly why withholding is how scope is honoured). (2) E1a route — `dkRuleMapper.ts` valueBasis verbatim (codelist L0-imported, `schemas/src/siteintel/vocabularies/dk.ts`, closed set {1,2,3,4}, fifth value THROWS :306-318) + `dkGfa.ts` consumer ("the wrong-number path is structurally DEAD"). `maxCoverage` honest null — "FAR ≠ coverage" (`dkPlandataEnvelope.ts` zone :~395) | FAR-limited height + height cap + storey floor; coverage absent by national data shape | **PASS** — shipped, live-proven, refusal-correct on the exact trap lane A ranks #2. The `valueBasis` denominator fix is real end to end |
| **EE** | krundi täisehitusprotsent → `protsent` "coveragePercent %" + `tihedus` FAR + `korgus` height (`eeRuleMapper.ts:87-91`); UNKNOWN rule: "" and "0" both → tier-6 ("a filled feature korgus '17.4' beside its sibling korgus '0'", :43-51) | Rule plane complete, tier-1/tier-6 split enforced structurally. **No EE C58 pack** → the engine's coverage∩FAR∩height interaction (jurisdiction-agnostic, shipped) never runs for EE | engine already does the triple | **PASS-BY-EXT** — one adapter join (the `dkPlandataResolvedPack` shape) unlocks the shipped interaction machinery. Today ⟂ |
| **SE** | exploateringsgrad family — four denominator codes one Swedish word apart: "`…AreaProc_BruttoEgen` % av fastighetsarean inom EGENSKAPSOMRÅDET · `…AreaProc_BruttoAnv` … ANVÄNDNINGSOMRÅDET · `…AreaKvm_BruttoFastigh` m² PER FASTIGHET · `…AreaKvm_Brutto` absolute" (`sePlanProvisionCatalogue.ts:38-47` — "reproduces the Aarhus trap with a clean parse" if ignored) | valueBasis carried verbatim on every rule; **all values tier-6** (credential gate) | as DK once values exist | **PASS at vocabulary+basis; values deferred** ⟂ — the DK consumer pattern (`dkGfa.ts`) is the template for the SE consumer when NGP opens |
| **DE** | GRZ+GFZ+Z live-served where content-vectorised: MV probe "`grz 0.4 · z 1 · gfz` empty" per feature; fill 54/162 grz · 48/162 z · 8/162 gfz · 0/162 hoehenangabe (`GERMANY-DATA-RECON-SPIKE.md:100-160`) | NONE (no DE adapter) | engine triple, Denmark-shaped | **PASS-BY-EXT** — the recon spike's own verdict: a DE XPlanung WFS "does deliver populated, machine-readable GRZ + storey-count … Denmark-style, today". Mapper + valueBasis discipline (GRZ denominator = Baugrundstück per BauNVO §19) is adapter work on existing seats |

## C8 · COURTYARDS / HOLES

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DK** | Copenhagen karré courtyard (founder 2026-07-26): "Copenhagen's karré courtyard is the SAME GEOMETRY as Barcelona's *profunditat edificable* … **The machinery already exists** … Denmark reuses it UNCHANGED" (`rulepacks/dkPerimeterBlock.ts:1-24`); placement ladder byggefelt → byggelinjer → lokalplan depth → block-derived STUDY → REFUSE (`rulepacks/dkEnvelopePlacement.ts:16-27`, §NO-SILENT-FALLBACK) | `block-derived-alignment` branch + `solveBlockDerivedDepth` reused; STUDY parameters conservative, human-gated, confidence dropped to `estimated-ruleset` | block-ring erosion → depth band, interior void | **PASS as study · PASS-BY-EXT for certified numbers** (per-plan lokalplan/friareal PDF read is the only missing input — data, human-gated) |
| **DE** | Blockrand inner courtyards — no DE code; the DK row above proves the reuse path for the identical geometry | as DK | as DK | **PASS-BY-EXT** — kind + solver shipped; DE needs adapter + block rings (INJECTED, never fetched — `ZoningRulesEngine.ts:61-72`) + per-plan depth data |
| **holes (kernel status, per lane B's gap list — verified)** | DK byggefelter measured: "**19.4 % are multi-part** (tail up to 55 parts) and **1.2 % have holes**… A HOLE IS A PUBLISHED 'DO NOT BUILD HERE'. It is carried, never dropped" (`geometry/explicitArea.ts:60-83`, n=1,000 systematic) | `explicitArea` handles multi-part + holes bespoke; kernel `polygonBoolean` supports **no holes and no difference** (deliberate — "an unproven boolean silently corrupts every consumer") | even-odd containment per part | **byggefelt holes: PASS** (bespoke, measured-need machinery). **General hole-bearing booleans: GAP** (lane B costed gap #2) — confirmed, and it is the same primitive C1-SE's prickmark carve needs |
| **EE** | hoonestusala multi-part share not measured | inline `NativeCrsGeometry` Polygon (single ring) `eeRuleMapper.ts:165-176` | — | untested; flag for the EE→C58 join lane |

## C9 · NEIGHBOURING-BUILDING / NEIGHBOUR-LAND DEPENDENCIES

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DE** | Abstandsflächen must lie on own land (or be secured on the neighbour's — Baulast); per-Land multiplier table (`docs/04-reference/jurisdictions/de/GERMANY.md:109`; NRW doc as C2) | **NONE.** The injection SEAT pattern exists (`blockRing` — "INJECTED, NEVER FETCHED", `ZoningRulesEngine.ts:66-72`) and is the sanctioned way neighbour-parcel geometry would arrive. `providers/contextDerivedStudyEnvelope.ts` covers only the §34 STUDY, its l449 gate SHUT, "never asserts a legal right to build" | neighbour ring injected → per-boundary planes clipped at the parcel line | **GAP** — needs C2's two primitives PLUS a neighbour-geometry injection input (pattern proven by `blockRing`, so the seat is PASS-BY-EXT; the plane math is the GAP) |
| **DK** | naboskel distances (BR18 byggeret) — corpus-absent (grep 0, see C2-DK) | NONE | plain inset once extracted | **GAP-for-data only** |
| **SE** | no repo-carried neighbour formula ("no national setback formula", `LEGISLATION-RATE.md:44`); legacy 4.5 m-to-boundary case law not captured | NONE | — | corpus-absent; no row beyond this note |
| **EE** | not carried (tingimus free text may hold it — `in-document-text`, never parsed, `eeRuleMapper.ts:40-41`) | tingimus carried verbatim, unparsed | — | honest carry; no drawing claim ⟂ |

## C10 · TERRAIN-DEPENDENT REFERENCE PLANES

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DK** | niveauplan — municipally FIXED reference planes on sloped sites: **zero repo hits** (grep `niveauplan` → 0). DK terrain itself is open (DHM 0.4 m) but unwired (L-383c OPEN, `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md:390`) | The tram/datum pattern exists but is PGM-hardwired: `geometry/facadeRasantDatum.ts` transcribes PGM Art. 240.1 verbatim (lane C T3 #1: "those constants are PGM-specific; other countries' datum rules must arrive as pack data") | a niveauplan is ONE fixed plane per site — geometrically the EASIEST datum case (no façade segmentation needed) | **GAP-for-data + one schema seat** — lane A row 7's `datum` attribute (`relative-to(fixed-niveauplan(z))`) would carry it; no new kernel work. Corpus capture is the real cost |
| **EE** | maapinna keskmine kõrgus (mean ground level — the PlanS reference for `korgus`): **zero repo hits** (grep `maapin` → 0); datum semantics ride `tingimus` free text, never parsed | `korgus` carried datum-less at the rule plane | mean-of-ground-at-building-corners plane | **GAP** — same `datum` attribute; today nothing drawn from `korgus`, so nothing is wrong yet ⟂ |
| **SE** | Nollplan split — see C6-SE: the state pre-answers L-584 as a CODE | valueBasis verbatim | — | **PASS at representation** ⟂ (values gated) |
| **DE** | `hoeheBezugspunkt` — "reference datum + max height" (`de-hh/02000-hamburg/README.md:50`) | docs only | — | **GAP-for-data**, same datum seat as the rest of this class |

## C11 · OVERLAYS / EXCEPTIONS / PRECEDENCE

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DK — lokalplan overrides kommuneplanramme (the precedence rank machinery, cited as asked)** | Live: DK-B transcript shows lokalplan (rank 3) and ramme (rank 4) BOTH visible with per-rule ranks | **Rank lives in three places, one seat each:** (1) the FACT — `dkRuleMapper.ts:270` `rank: {scheme:'dk-plan-ladder', level}` (ladder table `dkPlandataClient.ts:76-86`: byggefelt 1 · delområde 2 · lokalplan 3 · ramme 4); (2) the L0 shape — `schemas/src/siteintel/entities.ts:306-336` (`RuleApplicabilitySchema.rank`, "no precedence algorithm lives in the data model"); (3) the RESOLUTION — `rulepacks/declarative/evaluateDeclarative.ts` engine-side: min level per scheme, `conflicted-rank` refusal on `rank-tie` / `rank-incomparable` (:143,180-183) | n/a (rule selection) | **PASS** — supersession-by-instrument is live for DK and refusal-correct on ties |
| **overlays as CONSUMED constraints (all four)** | — | `ZoningRecord.overlays` is consumed by **NOTHING in the engine** — grep `overlays` in `ZoningRulesEngine.ts` + `envelopeToMassing.ts` → 0 hits (verified; agrees lane B §1.6). DK's overlays are display STRINGS (zonestatus, 'Bindende byggefelt', FAR-basis tag — `mapPlandataToZoningRecord.ts:353-359`). `SiteIntelRestrictionSchema` exists (`entities.ts:255-273`) but every shipped overlay PROVIDER is Spanish (Catalunya flood, BCN heritage, Balears) | overlay ∩ parcel → conditional rule set | **GAP (consumption)** — the declarative path's own design ("rank + condition composed") is blocked on the condition seam, which REFUSES by design (`condition-not-evaluable`, `evaluateDeclarative.ts:202,500`). For the northern four, overlays are model-seat only |
| **DE** | Denkmalschutz — docs only (Berlin risk register; no provider). Regime gate design: "only §30 permits numeric extraction; §34/§35 → `output: 'refusal'`; Baunutzungsplan 1958/60 `confidenceCap: 'corroborated'` — judicial funktionslos risk" (`de-be/11000-berlin/BERLIN-RULEPACK.design.ts:21-30` — a `.design.ts` in DOCS, not shipped code) | cited-refusal design, unimplemented | n/a | **⟂ REFUSAL-ONLY (honest, GAP-for-drawing)** — and correct: lane A Class C says these are permanently refusal-shaped |
| **EE/SE** | EE kitsendused / SE overlay layers — not captured | NONE | — | no rows |

## C12 · TEMPORAL / PLAN LIFECYCLE

| Country | Real example | Current representation | Geometric op | Verdict |
|---|---|---|---|---|
| **DK** | aflyst/vedtaget — "Plan LIFECYCLE is first-class at the source: every theme exists in `_forslag` / `_vedtaget` / `_aflyst` / `_med_historik` variants. This adapter queries the `_vedtaget` (adopted) variants only" (`dkPlandataClient.ts:23-25`); status mirrored VERBATIM ('V' live) with `datovedt`/`datoikraft` → R3 `validityBasis:'legal'` (`dkRuleMapper.ts:196-226`) | status + dates typed; **`_aflyst`/`_forslag` variants NOT queried** — recorded as deferred (`impl/lane-dk-corrections.md:280-283` item 7: "a later lane's") | n/a | **PASS for current-law queries** — an aflyst plan drops out of the `_vedtaget` layer, so the error direction is safe (never an aflyst rule presented as live); pending plans invisible (under-states future — safe). Plan HISTORY ("was this in force on date D in 2019?") is **PASS-BY-EXT** — the variants are served; querying them is data work on the same mapper |
| **EE** | kehtestatud vs menetluses — the adapter reads the `dp_kehtiv` (VALID detail plans) layer (`eePlanProvider.ts:1-2,24,50`); `planseis_nimi` "Kehtiv / Osaliselt kehtiv / …" mirrored verbatim (:97-98); `kehtestkp` adoption date → R3 legal; "PLANK serves no separate in-force axis — mirroring adoption into inForceFrom would be a guess, so both stay null" (`eeRuleMapper.ts:150-156`); a status-less row CANNOT become a Plan (:139-145) | typed, verbatim, refusal-correct | n/a | **PASS** — menetluses plans never enter; Osaliselt kehtiv (partially in force) is carried as an open string, and any consumer branching on it must treat unrecognised statuses as not-in-force (currently no consumer branches — safe by inaction) |
| **DE** | **Veränderungssperre** (BauGB §14 change freeze) — **zero repo hits anywhere** (grep both spellings over docs/packages/audit → 0) | NONE — not even a doc row | n/a | **GAP** — a live Veränderungssperre makes any numeric answer wrong for its duration; the class must land as a restriction/refusal overlay (SiteIntelRestriction + refusal code). Named here because no lane report carries it either (Disagreement D5) |
| **SE** | catalogue-level validity — the import predicate is the state's own lifecycle: "`slutargalla === null` — still in force → 908 of 3,707" (`sePlanProvisionCatalogue.ts:13-17`); R3 legal with `borjargalla` (`seRuleMapper.ts` header) | typed at the provision-definition level; plan-INSTANCE lifecycle gated with the values | n/a | **PASS at catalogue; instance temporality deferred with the credential gate** ⟂ |

---

## DISAGREEMENTS / SHARPENINGS vs THE THREE LANE REPORTS

**D1 — Lane B Q3 (XPlanung row): "Baugrenze/Baulinie/GRZ/GFZ maps almost 1:1 onto existing
geometricRule kinds" — HALF-CONFIRMED, HALF-CORRECTED.** Verified cell-by-cell in the registry:
`Baugrenze polygon → explicit-area` is genuinely 1:1 (`GeometricRule.ts:367-371`). `Baulinie →
alignment` is NOT: `AlignmentRuleSchema` REQUIRES `buildableDepth_m` strictly positive
(`GeometricRule.ts:131-139` — a zero/absent depth is by design "a transcription error"), and a
Baulinie states no depth; plus `sideTreatment` is required data (must be derived from the B-Plan's
Bauweise). The honest DE mapping is: enclosed Baulinie+Baugrenze ring → ONE `explicit-area`;
build-to-only lines → the missing `BUILD_TO_LINE` obligation kind (lane A row 11) whose absence
costs nothing for the maximal envelope. So the DE adapter remains "a mapper to the existing
vocabulary" — but through ONE kind, not a pair-to-pair map, and the claim as written would have a
pack author reaching for `alignment` and inventing a depth.

**D2 — Lane C T3 #6 "Overlays: HANDLED at the model + per-jurisdiction providers" — TRUE ONLY OF
SPAIN.** For all four northern countries there are zero overlay providers, `ZoningRecord.overlays`
is engine-consumed by nothing (grep verified, agrees lane B §1.6), and the declarative overlay
route is blocked on the deliberately-refusing condition seam. The model seat exists; calling the
class "handled" for a DK/DE rollout would repeat the authored-but-unwired pattern the memory
corpus warns about.

**D3 — ALL THREE LANES MISS THE DANISH INCLINED PLANE.** Lane A's counter-example set, lane B's
§1.8 cycle analysis and lane C's hard-case docket all argue inclined planes from DE §6 and Paris.
`det skrå højdegrænseplan` — the byggeret rule governing most Danish low-rise land — appears
NOWHERE in the repo (measured grep, both orthographies) and nowhere in the audit. Consequence
worth stating: it is in the same kernel-primitive class (pointwise-min inclined tops, lane B
costed gap #3), so no NEW primitive is implied — but the DK corpus capture is missing, DK's flat
prisms have a near-boundary overstatement class when a lokalplan is silent on height, and DK
contributes zero solves to the never-overstate gate (lane B's own 6-vs-109 finding), so the one
gate that should catch it structurally cannot. This strengthens lane B's recommendation of
per-jurisdiction live-resolve fixtures, with Denmark first.

**D4 — Lane C T3 #5 "plan hierarchies + temporal validity: HANDLED" — add the DK qualifier.**
Adopted-plan currency is handled and refusal-correct, but the `_aflyst`/`_forslag`/`_med_historik`
variants are unqueried (corrections item 7), so "which version governs" is answered only as "the
currently-adopted one". Point-in-time evaluation (R3's purpose) has its DK data source identified
but unwired. Error direction today is safe; the claim should not be read as plan-history support.

**D5 — A temporal class none of the lanes carries: DE Veränderungssperre** (C12-DE). Zero hits
repo-wide including all audit docs. Cheap to hold (a Restriction row + a refusal code), expensive
to be surprised by.

**D6 — Endorsement with proof the lanes did not cite:** lane A's #2 counter-example (DK
denominator) is not merely designed — the live executed chain shows the refusal firing on real
Aarhus data with the control line "the naive per-parcel multiply would have said 14927.4 m2 -
that number is produced NOWHERE" (`2026-09-01-chain-executed-live.txt`). The strongest single
artifact in the northern corpus for the never-overstate doctrine.

## BOTTOM LINE FOR THE THREE BINDING CONSTRAINTS

Across 4 countries × 12 classes: **no cell requires an E4 redesign, a generic constraint graph, or
a kernel replacement.** Every GAP resolves to one of: (a) the TWO kernel additions lane B already
costed (difference A∖B with under-coverage direction; inclined-plane height-field tops) — both
additive; (b) TWO schema seats lane A already named (row 7 `datum` on vertical parameters; row 2
`HEIGHT_PROPORTIONAL_OFFSET` as a new GeometricRule union variant — the sanctioned growth channel,
`GeometricRule.ts:37-42`); (c) a German `QualifierLexicon` + adapter/data work (DE adapter, DK
byggelinjer feed, EE→C58 join, SE credential registration, DK BR18 byggeret + niveauplan corpus
capture); (d) nothing — the class is already PASS (DK density triple, DK/EE temporal, DK
precedence, DK karré, SE datum codes). The hardest real constructions in the north are either
already handled by the six-kind registry + placement ladder, or are blocked on data and two named
primitives — never on the architecture.
