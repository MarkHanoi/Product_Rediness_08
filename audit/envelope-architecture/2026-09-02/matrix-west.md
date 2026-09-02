# LANE MATRIX-WEST — ES · FR · NL construction-class matrix (final pre-implementation validation)

**Date:** 2026-09-02 · **Posture:** adversarial, read-only; every cell re-verified against the file
named in it this session (foreground reads). Repo untouched. Constraints honoured: no E4 redesign
proposed, no generic constraint graph, no kernel replacement — every verdict is "can the CURRENT
architecture carry it", cell by cell.

**Verdict vocabulary:** PASS = runs through the shipped path today (a signed publication gate that is
merely SHUT is stated, not silently counted as PASS) · PASS-EXT = representable with an existing kind
+ data only, zero new code · GAP = missing primitive, named against Lane A's 14-row table (A#n) or new
with justification. Per the brief: a cited refusal is honest but is flagged **GAP-for-drawing** where
the class demands geometry.

Key shared machinery cited throughout (verified this session):
`packages/schemas/src/site/GeometricRule.ts` (6 kinds: setback :52 · alignment :124 ·
block-derived-alignment :158 · tiered-occupation :244 · occupation-capped-alignment :352 ·
explicit-area :367) · `packages/site-parcel-data/src/ZoningRulesEngine.ts` (tiered :629–762 ·
explicit-area :803–857 hard-fail-no-fallthrough :828 · occupation-capped :959–1031) ·
`packages/schemas/src/site/zoning/BuildableEnvelope.ts` (tiers with `baseHeight_m` :355–400;
refusal codes incl. `regime-undetermined` :217/:254).

---

## 1 · Building lines (build-TO vs build-WITHIN)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | PGOUM-97 Art. 8.4.6.1 *"El edificio situará una de sus fachadas exteriores SOBRE y a lo largo de la alineación oficial en toda su altura"* (verbatim in repo); PGM Art. 349 alineació a vial; Murcia Art. 5.22 «alineada a vial, sin permitir retranqueos» (`esMurciaPgou2012.ts:483,527`) | `alignment` kind — `alignTo: 'street'\|'official-line'` (GeometricRule.ts:78), `alignmentOffset_m` :85, `sideTreatment: 'party-wall'\|'setback'` :91 + refine :110–118; `MADRID_NZ4_RULE` (`esMadridPgoum97.ts:459–470` — "A mandatory build-to line, hence offset 0 — not a permissive zero") | relocated inset (front = offset) + depth clip; per-edge capsule-union erosion | **PASS**. Caveat (agrees with Lane A row 11): the kind encodes the equality as offset-0 *inequality*; for envelope MAXIMISATION they coincide (the max envelope presses onto the line), so the gap bites only a future compliance-check tier, not the envelope. |
| FR | Paris ordre continu (façades on the alignment, party walls) — the UG emprise=parcel reading | `parisUgZone()` setbacks 0/0/0 as the CERTIFIED assumption, `fieldProvenance` flags emprise as estimated (`frParisPluBioclimatique.ts`); **signed** §PARIS-SIGN-OFF (`fr/sources/VERIFICATION.md:37`, 2026-09-02). Rest of FR: `countryAdapters/fr/index.ts` — zone-identity ONLY, "NEVER a number", `FR_APPLICABILITY_LADDER` | legacy 0/0/0 inset (= full parcel) ∩ ECM footprint | **PASS** (Paris, live behind the signed gate). Rest-of-FR: cited zone-named refusal = honest; **PASS-EXT** once a règlement is extracted (alignment kind is country-agnostic data). |
| NL | Bouwvlak/bouwgrens (build-within) — SVBP2012; rooilijn/gevellijn (build-TO) | build-within: `NL_RULE = {kind:'explicit-area', ringRef: NL_RING_REF}` (`nlBestemmingsplan.ts`) — "the bouwvlak IS the rule"; build-TO: NOTHING — `nl/LEGISLATION-RATE.md:51` "omgevingsplan rooilijn / bouwvlak — not probed"; gevellijn not among the four proxy layers | parcel ∩ published footprint (`solveExplicitArea`) | **PASS** for build-within (the dominant NL mechanism). Build-TO equality: **NONE**, same A#11 caveat as ES — envelope-neutral today. |

## 2 · Variable setbacks (depth/width/height-dependent)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | **Barcelona Art. 342.5** (20a subzona V): FOUR-column *amplada de vial* table — height, plantes AND edificabilitat off the same row (`bcnAlcada20aAillada.ts:24–30,60,91–120`; band phrasing convention `BCN_ART342_5_EDGE_CONVENTION` :78–88). **Madrid height-proportional retranqueos**: NZ 5 `max(5, H/2)`, NZ 8 `max(4, 2H/3)`/`max(3, H/2)`, NZ 4/9 `max(3, H/3)` (`esMadridPgoum97.ts:55–57`). **Balears** Reculada triple RA/RM/RF (`esBalearsMuib.ts:206–249`) | 342.5: banded lookup w/ band-edge refusal (`band-edge` + `straddles[]` in `Bcn20aEdificabilitatRefusal`, `esBarcelona20aAillada.ts:180–216`). Madrid: packed at the value pairing the zone's OWN max height (policy (a), :67–78 — direction stated: UNDER-states for shorter buildings, safe side; floor-only zones named in `MADRID_FLOOR_ONLY_SEPARATIONS`, (b)). Balears: `kind:'setback'` per edge | banded lookup → scalar; per-edge erosion | **PASS** for the banded ladder + per-edge machinery. The self-referential setback(H) as a live solve = **GAP A#2** (`HEIGHT_PROPORTIONAL_OFFSET`) — the current packs substitute the max-H pairing, a documented conservative DATA choice, so nothing ships wrong-direction. ⛔ **One admitted overstate hole**: NZ 5 front separation is to the STREET CENTRELINE (H/2 − W/2) — "a NEW RULE TYPE… no kind in GeometricRule expresses it… On a narrow street that OVER-STATES" (`esMadridPgoum97.ts:636–652`, front_m null). Held in check only by FAR+50 % ocupación. This is the one cell in the West matrix where a shipped pack documents its own possible overstatement. |
| FR | Paris prospect/marges (UG.3/UG.4 cumulative implantation rules) | `PARIS_PLU_MISSING_RULES = ['emprise_au_sol','emprise_geometrique','gabarit_enveloppe','cumulative_UG3_rules']` — named on the refusal; règlement quoted that cumulative ≠ parcel×height | refusal | Honest refusal → **GAP-for-drawing**, sourcing-bound (Lane A §1.3: representable once extracted; the machinery — banded/proportional — exists on the ES side). |
| NL | — (the bouwvlak internalises setbacks; no NL setback rule sighted anywhere in repo) | — | — | **class-not-sighted** (honest N/A, not a gap). |

## 3 · Street-width-dependent heights

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | **BCN** PGM Art. 327.2 (13a) alçada per *amplada de vial* (`bcnAlcadaReguladora.ts:1–25` + the §L-660 source-correction record); **Madrid** Arts. 8.4.10/8.9.10.1 (`madridAnchoDeCalle.ts:1–40` — own bands, own tops, `appliesToZoneCodes` per table; "crossing the 12 m edge moves NZ 4… a whole storey and 3,50 m"); **Murcia** Arts. 5.3.3/5.5.3/5.7.3/5.9.3 (`esMurciaAnchoDeCalle.ts:1–52`). Width itself: `geometry/streetWidth.ts` (region-agnostic, "takes rings and returns metres") + `ampladaDeVial.ts` ladder, per-city quanta BCN {20,30} :106, Madrid {15,30}, Valencia {25,50}, Córdoba/Sevilla `quanta:[]` :65 | banded lookup over a CONSTRUCTED fact, band-edge straddle → REFUSE (shared `effectiveBandEdgeGuard_m` — Murcia header explicitly refuses to mint a second guard); table provenance separated from width provenance (`MURCIA_ANCHO_FIELD_PROVENANCE` "about the TABLE and never about the width") | banded lookup + refusal | **PASS** (BCN live). Madrid: machinery PASS, publication tier `pipeline-extracted-unverified` behind the human gate — stated. Murcia: machinery PASS, **SIG-MU2 unsigned ⇒ RC/RM/RN/RD1-3rd-storey stay REFUSED** — stated. Murcia MX (height depends on WHICH frontage: eje principal 5pl/16 m vs secundaria 3pl/10 m) refused because "PRYZM does not classify Murcia frontages" (`esMurciaPgou2012.ts:375`) — the edge-classification prerequisite Lane A §4.4 names; honest **GAP-for-drawing**. |
| FR | Paris *filet* (plub_filet): frontage gabarit code → metres; code `M` = "same as existing façade" | read live, mapped, carried in `knownFacts`/refusal extras (`frParisPluBioclimatique.ts` `filetCode`/`filetFrontageHeight_m`) — but **NOT a height candidate** in `computeParisEnvelope` (candidates: ceiling · ECM graphic · HMC-relative only) | fact-carry only | **Carried, not applied** — surfaced honestly, never caps. Code M is the Porto-moda class → **GAP A#1** (`CONTEXT_AGGREGATE`). The numeric filet codes: **PASS-EXT** at most (add to the min-candidate set = data + one array entry — strictly it is a one-line code change, so: near-PASS-EXT, flagged). |
| NL | — (no street-width height construction sighted in the NL corpus) | — | — | **class-not-sighted**. |

## 4 · Inclined planes (couronnement/HMC/gabarit tapers)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| FR | Paris UG.3.2.4 couronnement (filet cour = X → continuous crown taper) | `parisCouronnementRefusal()` — cited PARTIAL per-component refusal; straight prism ships WITH the caveat "the true envelope is at most this, reduced by the crown" (`frParisPluBioclimatique.ts` step 5) | refusal + labelled straight extrusion | Honest per-component refusal → **GAP A-table "deliberately-not-added" / Lane B kernel gap #3**: inclined-plane height-field top. Re-confirmed this session: `EnvelopeTierSchema` = polygon × [base,max]; zero inclined-plane machinery repo-wide. Blocker is BOTH sourcing (taper is PDF-bound) and the kernel primitive. |
| ES | Madrid coronación heights "a different datum, not modelled" (`esMadridPgoum97.ts:767`); no cubierta-plane rule packed anywhere in the ES corpus | cornisa-capped flat prisms | extrude-tier | **GAP** (same primitive) — but omission-UNDERSTATES (roof volume above cornisa omitted), the safe direction; no ES pack is blocked on it today. |
| NL | goothoogte (eave) + bouwhoogte (ridge) pair + `maximum dakhelling` implies a pitched gabarit between eave and ridge | goothoogte: read + typed, "Recorded for provenance; it is NOT the ridge/height cap, so the dispatcher must not use it as maxHeight_m" (`resolveNlBestemmingsplan.ts:186–188`); dakhelling: NOT in the closed `MaatvoeringKind` set (:232–236) → silently unclassified; prism to bouwhoogte ships with **no crown-style caveat** (dispatcher grep: zero goothoogte hits) | flat prism to bouwhoogte | **GAP** (same primitive). Prism-to-bouwhoogte respects the published cap (never exceeds a stated number) but overstates the goot-to-ridge SOLID exactly as Paris's straight prism does — and unlike Paris carries no "at most this" caveat. See Disagreement D5. |

## 5 · Stepbacks (retranqueos at upper floors, áticos)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | PGM Art. 350.2 two-tier tiling (90 % PB + 70 %-of-block band above — `tiered-occupation`, live for clau 22a via `esBarcelonaIndustrial.ts:580`, engine :629–762); Murcia MX fondo 20 m PB / 15 m upper STATED (`esMurciaPgou2012.ts:375`, packed:false); planta àtic reculada — no pack | `EnvelopeTierSchema` — "A podium/tower reading, where an upper tier sits ON a lower one, is expressible by setting the upper tier's `baseHeight_m` to the lower one's `maxHeight_m`" (BuildableEnvelope.ts:363–366, :392); tiers never contradict legacy scalars (principal-tier refinement — legacy consumer UNDER-states, stated) | stacked/tiled prisms (extrude-tier with baseHeight) | **PASS** for tiled tiers (350.2 live). Ático/upper-floor stepback: **PASS-EXT** — the schema documents the exact encoding; NO pack exercises it yet (adversarial note: PASS-EXT here is schema-verified but engine-unexercised — the engine's tiered branch currently *constructs* tiers only via the block-band solve; a data-only ático tier needs the pack to emit tiers, which `JurisdictionZoningContract` zones do not carry — the tier seat is on the ENVELOPE, not the pack. So honest verdict: **PASS-EXT at the model, GAP-for-authoring** — no pack-side seat to declare "upper tier inset 3 m above PB+N" without touching code). |
| FR | Paris crown retrait | see row 4 — refused | refusal | **GAP-for-drawing** (row 4 primitive; a purely stepped — non-inclined — retrait would face the same pack-side authoring gap as ES). |
| NL | — (bouwvlak + single hoogte; no stepback maatvoering sighted) | — | — | **class-not-sighted**. |

## 6 · Height fields (published per-area height geometry)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| FR | Paris plan des hauteurs — plub_hauteur sectors (18/25/31/37 m), ECM polygon w/ graphic height, HMC (UG.3.2.2, NGF) | per-point live resolve → `min(ceiling, ECM graphic, HMC-relative)` with `heightBinding` recorded; plafond ≠ building height documented; HMC-NGF carried-not-applied (needs rasant) | explicit-polygon + min-of-candidates + extrude | **PASS** — live behind the 2026-09-02 signature. HMC-as-cap: GAP-for-drawing → row 10 FR. |
| ES | **Madrid NZ 1**: Fondo de la Edificación polyline + per-manzana `COEF_Z` (String, live) — `esMadridNZ1.ts` explicit-area declaration + `esMadridNZ1Provider.ts` `parseCoefZ` defensive classifier (:26–34,104–117 — "Even a cleanly-numeric COEF_Z is NOT promoted…"), `MADRID_NZ1_CERTIFIED: boolean = true` (`resolveMadridNZ1Ring.ts:132`). **BCN clau 18**: `OV_Trames` footprint + `PLANTES` 100 % populated (`esBarcelonaVolumetria18.ts:1–40`), floors→metres via Art. 327.2 conversion — `block-constructed` only when table-exact (SIG-5), else `estimated-ruleset`, NEVER `structured` | explicit-polygon (engine explicit-area branch) + coefficient/floor conversion | **PASS** (both live behind signed gates SIG-3/SIG-5/L-608 family). |
| NL | maatvoering "maximum bouwhoogte (m)" per vlak — a polygon-keyed height field (Rotterdam 40 / Utrecht 26 / Groningen 24, live-verified) | provider + `structuredFields` → engine (`siteDispatch.ts:3291–3294`) | explicit-polygon + extrude | **PASS** (gate reopened by recorded founder authorization §L-11841, 2026-08-26; storey-derived height sub-gate stays SHUT — stated). |

## 7 · FAR + coverage + height INTERACTION

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | **Telde Lever-3**: A1–A5 FAR+height only → "⛔ FAR ALONE DOES NOT DRAW" (`esTeldePgo2003.ts:52`) — refusal, because FAR-alone silently occupies the whole plot. **Córdoba** Art. 13.5.2.4 occupation-cap-without-siting → `occupation-capped-alignment` (GeometricRule.ts:337–352 "documented, loudly-labelled ENGINEERING DECISION") + `occupationCappedDepth.ts` (ADR-0288), engine :959–1031 (`targetAreaM2 = maxCoverage × parcelArea`) | refusal · labelled-choice construction · engine cap-composition (FAR-limited height, coverage cap, min-of-heights — all shrink-only) | **PASS**, including BOTH honest output kinds the interaction forces (refuse / labelled choice). This is the strongest cell in the matrix: the interaction is not merely representable, its two failure modes are first-class outputs. |
| NL | bouwvlak + bouwhoogte + bebouwingspercentage + bouwlagen pairs | bouwvlak ∩ parcel via explicit-area branch; maatvoering → maxHeight_m / maxCoverage / maxFloors through the SAME engine composition; min-guard refuses "minimale" as max (`resolveNlBestemmingsplan.ts` honesty property 3) | explicit-polygon ∩ + scalar caps | **PASS**. (Coverage denominator = parcel ring area in the engine — matches the NL bouwperceel basis for the common case; no NL counter-example sighted.) |
| FR | emprise au sol / CES + hauteur cumulative (UG.3+UG.4) | PDF-bound → the named-missing-rules refusal; règlement's own sentence that the cumulative application ≠ parcel×height product is quoted in the refusal detail | refusal | Honest refusal → **GAP-for-drawing** (pure sourcing; ES proves the composition machinery). |

## 8 · Courtyards / holes (patios de manzana, interior islands)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | PGM Art. 242.2 (≥30 % of block free, equidistant figure, clamp 11/30) → `blockDerivedDepth.ts` bisection with the §L-581-MONOTONICITY in-run premise gate; Art. 350.2.b 70 %-equality band → `blockConcentricBand.ts` (equality NOT clamped — quantifier distinction in `TieredOccupationRuleSchema` doc); clau 12: Art. 320.2a "L'espai lliure interior d'illa no serà edificable en planta baixa" — **deliberately NOT modelled**, divergence-from-13a documented, cost-zero-today (`esBarcelonaNucliAntic.ts:108–118`); published footprints w/ holes: `explicitArea.ts:77–84` "A HOLE IS A PUBLISHED 'DO NOT BUILD HERE'… NEVER dropped" + engine parts :821–824 | erosion/bisection on the BLOCK ring (injected, never fetched) · boolean with holes | **PASS** for block-derived + concentric band + holes machinery. Clau-12 ground-floor-courtyard rule: honest not-modelled note; becomes a GAP only when a ground-floor-courtyard feature ships — pre-armed in the file. |
| FR | Paris cour / rear-courtyard rule (règlement); cour code drives crown handling | rear-cour named PDF-bound in the refusal; `courCode` read live and drives the per-component crown logic | refusal (footprint side); fact-carry | **GAP-for-drawing** (sourcing) — the ECM polygon partially embeds the answer where published (the state pre-cut the courtyard out of the ECM ring), which is the honest Class-B route. |
| NL | bouwvlak polygons with interior rings / multi-part bouwvlakken | ⛔ `extractOuterRing` (`resolveNlBestemmingsplan.ts:363–380`): Polygon → `coords[0]` (outer only), MultiPolygon → `coords[0][0]` (FIRST part's outer only). Interior rings and further parts are DROPPED — while the ENGINE's `explicitAreaFootprintParts` supports both | outer-ring-only clip | **GAP (provider defect, new finding — see D3)**: a bouwvlak hole is a published "do not build here"; dropping it draws the courtyard buildable = the OVERSTATE direction the whole architecture forbids. Extra-part drop merely understates. Fix is data-plumbing to an existing seat (`explicitAreaFootprintParts`), no new primitive — so architecture PASSES, this leg's wiring does not. |

## 9 · Neighbouring-building dependencies (héberges, medianeras)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | Medianera/mitgera: `sideTreatment: 'party-wall'` — "build to the side boundary, zero setback — the norm in…" (GeometricRule.ts:88–91); Madrid Art. 8.4.5.1 "La edificación se adosará a los linderos laterales — Mandatory medianería" (`esMadridPgoum97.ts:466–467`); cossos sortints ≥1 m from the mitgera → `NOT-THE-RULE-KIND`, post-envelope morphology allowance, deliberately unfolded, omission understates (`esBarcelonaCossosSortints.ts:40–53,101,172`) | party-wall = zero-inset edge in the per-edge erosion; projections = out-of-scope-by-classification | **PASS** for medianera-as-party-wall. Neighbour-DERIVED values (height keyed on what stands next door): only `providers/contextDerivedStudyEnvelope.ts` (median-neighbour STUDY, own l449 gate SHUT, "never asserts a legal right to build") — **GAP A#1** (`CONTEXT_AGGREGATE` / the named `fabricDerivedHeight` C58 amendment). |
| FR | Paris héberges (party-wall profile of the NEIGHBOUR building governs the gabarit at the lot line) | **zero repo hits** — re-measured this session repo-wide (packages + docs + audit): no code, no doc, no NAMED refusal. The generic `cumulative_UG3_rules` refusal covers it only implicitly | none | **GAP A#1 + un-named refusal**. Adversarial sharpening of Lane C T3 row 3: the refusal exists but does not NAME héberges — a Paris user is never told the neighbour-dependency is what is withheld. Cheapest honest fix is a word in `PARIS_PLU_MISSING_RULES`, not code. |
| NL | — (neighbour rules are burenrecht/civil code, not bestemmingsplan constructions) | — | — | **class-not-sighted** in planning data (correct scope). |

## 10 · Terrain-dependent (rasant, slope)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | PGM Art. 240.1.a/b (rasant at the FAÇADE, ≥0,6 m two-branch, mandatory tram subdivision) + Art. 240.3 corner both branches → `geometry/facadeRasantDatum.ts` (`RasantTram` :181, `RasantRule = 'art-240-1-a'\|'art-240-1-b'` :178, refusal codes :192–205, branch pick :362–363, per-tram `ordinanceRef` :542); consumed by `apps/editor/src/ui/geospatial/globeGroundAnchor.ts`. **Art. 255 slope-tiered edificabilitat** (−20 % / −40 % / inedificable): NOT applied — "PRYZM holds no terrain model and does NOT apply it" (`esBarcelona20aAillada.ts:170–172`); `SLOPE_CAVEAT` attached to EVERY successful resolution, "Never empty for a hillside-capable subzone" (:204–222) with the direction stated ("the figure above is an UPPER BOUND") | façade-segment datum sampling; slope: caveat-carry | Rasant datum: **PASS** (Barcelona, at the ordinance's letter — the L-584 scar closed). Slope-conditioned SURFACE parameter: **GAP A#14** (`slope` as a declared fact + condition hook) — the overstatement risk is real, permanent on hillside 20a parcels, and honestly labelled on every output. |
| FR | HMC = NGF absolute altitude; conversion to a height cap needs the façade rasant | deliberately NOT applied as a cap; caveat emitted whenever HMC is NGF (`computeParisEnvelope` step 2 + caveat block) | fact-carry | **GAP A#7/A#14 shared seat** (terrain fact + datum conversion) — honest; the FR fix rides the same primitive as ES row 10, not a new one. |
| NL | Heights legally measured from *peil* | no datum token anywhere in the NL leg (zero `peil` hits in provider/proxy) | metres used as-is | Datum-qualifier gap (**A#7 family**) — low practical risk on flat fabric, but the vocabulary seat exists (E1a) and the NL leg does not stamp it. Not a wrong-number path sighted. |

## 11 · Overlays / exceptions (heritage, flood, transitional, explicit-geometry overlays)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | clau 18 (22.5 % of BCN private buildable land) = explicit geometry `OV_Trames` (`esBarcelonaVolumetria18.ts`, SIG-3 signed, render via `bcnRefosOVProvider`); heritage: `resolveBarcelonaHeritageOverlay.ts`, València heritage seam (`valenciaHeritageRefusal`, founder "Wait. Don't engineer around missing authority" transcribed in `esValenciaAlineaciones.ts:1–30`); flood: `resolveCatalunyaFloodOverlay.ts`, `catalunyaAiguaEspaiFluvial.ts`, Balears MUIB; transitional regimes: `regime-undetermined` refusal code (§L-590c/ADR-0274/0276) SHIPPED — `esBarcelonaIndustrial.ts:292–326` ships the regime-neutral half TODAY, `bcn20aSubzones.ts:369–379` | explicit-polygon · overlay clip · refusal codes | **PASS** (model + live providers; residual coverage is data work — agrees with Lane C T3 row 6, for ES). |
| FR | The PLU-b layers ARE overlays (hauteur/HMC/filet/ECM/EAL); PSMV secteur sauvegardé; EAL liberation strips | all five read live; PSMV → the height-absent refusal names it ("a secteur sauvegardé / PSMV parcel legitimately has no PLU height sector"); EAL subtracted as a conservative whole-area deduction with caveat | polygon read + subtract (area-level) | **PASS** for the read layers; règlement-level exceptions refused honestly. (EAL area-only subtract is the documented direction-safe fallback — Lane A §4.6a, confirmed.) |
| NL | dubbelbestemmingen (Waarde-Archeologie, Waterstaat…) + paraplu plans (Parapluherziening, Herziening Parkeren) | ⛔ dubbelbestemming is NOT among the four proxy layers (plangebied/enkelbestemming/bouwvlak/maatvoering — `nlBestemmingsplanProxy.js:176–182`); paraplu plans are DELIBERATELY excluded from the governing-plan pick (:195–201, "the highest-status ones are usually THEMATIC overlays… that carry NO bouwvlak/maatvoering") with no user-facing caveat | none (picked around) | **GAP (provider + doctrine, see D4)**. The pick-around is correct for the HEIGHT number (verified Groningen example) but a paraplu that amends rules in prose is silently dropped — RASE mandatory-carry ("An exception PRYZM cannot check must still be CARRIED", `ruleformat.ts`) is not honoured on this leg. Model seat exists (`SiteIntelRestrictionSchema`); the NL wiring does not reach it. |

## 12 · Temporal (plan versions, ruleSetVersion, voorbereidingsbesluit)

| Ctry | Real rule | Representation | Geometric op | Verdict |
|---|---|---|---|---|
| ES | Plan vintages, AMB Refós transcription vintage, PGOU transitional states | R3 `validityBasis` (frozen, `provenance.ts`) + `isInForceOn` (`ruleformat.ts:199`) + `SiteIntelEnvelope.ruleSetVersion` (`entities.ts:608`) — structural on route A (declarative evaluator runs the temporal split FIRST); TS packs: `lastReviewed` + vintage certified per signature (SIG-3 conditional on L-449 certifying the Refós vintage); transitional → `regime-undetermined` | data/evaluator | **PASS** structurally for route A; convention-only on the hand-written packs (Lane B §1.1 table row confirmed — no cell disagreement). |
| FR | PLU living text (idurba 75056_PLU_20260616) | `sourceVersion` derived from `idurba`, carried as "PLU version" fact on both success and refusal | fact-carry | **PASS-partial** — version carried and user-visible; no legal-vs-ingestion split on the FR leg (convention, not R3). |
| NL | Overlapping plan generations at one point; voorbereidingsbesluit (prep decision freezing new development) | governing-plan pick = status rank "onherroepelijk/geconsolideerd > vastgesteld > ontwerp" then most-recent `datum` (`nlBestemmingsplanProxy.js:23–24,108–135`) — a REAL precedence+temporal resolution at the provider, mix-across-plans forbidden ("Mixing values across plans would fabricate a rule nobody adopted") | precedence pick | **PASS** for plan-generation pick — the strongest temporal cell of the three countries. Voorbereidingsbesluit: **zero machinery** (the brief's own conditional — "if the pack knows it" — answered: it does not) → **GAP**, data class; a voorbereidingsbesluit can freeze what the picked plan permits, i.e. the current answer can overstate against a live prep-decision. Rides the A#9 applicability/validity seat, no new primitive. |

---

## DISAGREEMENTS / CORRECTIONS vs the prior audit lanes

**D1 — Paris is LIVE, not a refusal jurisdiction (supersedes Lane B §1.5 wording + Lane C T3 row 3).**
`FR_PARIS_PLU_CERTIFIED: boolean = true`, **signed 2026-09-02** — §PARIS-SIGN-OFF exists at
`docs/04-reference/jurisdictions/fr/sources/VERIFICATION.md:37`, the gate is registered
(`l449CertificationGates.ts:173–175`) and wired (`siteDispatch.ts:3782`). Lane C's "FR today =
zone-ID + cited refusal, numbers never invented" described the pre-signature state. Lane B's
structural point **stands and is now sharper**: `computeParisEnvelope` is still walked by **no**
ga-gate, and as of yesterday it draws real volumes for real users — the un-walked surface Lane B
§1.5 warned about is no longer hypothetical. The companion-gate recommendation (per-jurisdiction
frozen fixtures for live-resolved routes) should be treated as URGENT for fr-75056-paris and
nl-bestemmingsplan specifically.

**D2 — `esMadridNZ1.ts` header is stale in two load-bearing claims** (lines ~28–37): "THE ENGINE HAS
NO `explicit-area` BRANCH" and "THE ringRef RESOLVER DOES NOT EXIST". Both exist and are live:
`ZoningRulesEngine.ts:803–857` (with the hard-fail-no-fallthrough at :828) and
`resolveMadridNZ1Ring.ts` with `MADRID_NZ1_CERTIFIED: boolean = true` (:132). Not flagged by any
prior lane. Doc-only fix, but it is exactly the "stale enforcement claim" defect class CLAUDE.md
tracks — worth a row in the issue log.

**D3 — NEW FINDING: the NL provider drops bouwvlak holes and extra parts** while the engine it feeds
supports both. `extractOuterRing` (`resolveNlBestemmingsplan.ts:363–380`) returns `coords[0]` /
`coords[0][0]` — outer ring of the first part only — where `explicitArea.ts:77–84` says "A HOLE IS A
PUBLISHED 'DO NOT BUILD HERE'… NEVER dropped: dropping it inflates" and the engine accepts
`explicitAreaFootprintParts` with holes (:821–824). Hole-drop is the OVERSTATE direction. Lane B
verified the holes machinery via DK (19.4 % multi-part / 1.2 % holes measured) but nobody checked the
NL feed. Data-plumbing fix to an existing seat; no primitive missing. Until fixed, matrix cell 8-NL
is the one live overstate-capable path in the West countries.

**D4 — Lane C T3 row 6 ("overlays HANDLED… coverage is data work") is too generous for NL.** The NL
proxy actively picks AROUND paraplu overlay plans (`nlBestemmingsplanProxy.js:195–201`) and never
queries `dubbelbestemming`; the drop is documented in a code comment only, with no caveat on the
output — in tension with the repo's own RASE mandatory-carry doctrine (`ruleformat.ts`). For ES/FR
Lane C's characterization holds.

**D5 — NL caveat parity (minor):** goothoogte is read and typed but unused with no user-facing
caveat, so the goot-to-bouwhoogte prism ships unlabelled — whereas the exactly-analogous Paris crown
ships WITH "the true envelope is at most this". Same family as D4: the honesty machinery exists,
this leg doesn't emit it.

**D6 — Confirmations under adversarial re-read (no change):** Lane C's build-to-line citation
(`esMadridPgoum97.ts` "mandatory build-to line, hence offset 0") verified at :459–466 (line drift
only); héberges zero-hits re-measured repo-wide, zero; L-581 capsule-union erosion, band-edge
refusals, Telde Lever-3, Córdoba labelled choice, tiered-occupation solve, `regime-undetermined`,
rasant trams — all verified at the cited files, as characterized.

## Verdict roll-up (the founder's question: can the CURRENT architecture handle these?)

- **PASS today:** 20 of 30 populated cells run through shipped paths (some behind named signed/unsigned
  publication gates, each stated in its cell). Spain is near-complete: 10 of 12 classes PASS or
  PASS-EXT; its two gaps (inclined planes, slope-as-fact) both fail in the UNDERSTATE/caveat-carried
  direction.
- **PASS-BY-EXTENSION:** ático/podium tiers (model seat documented in the schema itself; needs a
  pack-side authoring seat — the one place "data only" is not quite true today).
- **GAPs, all already named by Lane A's table — no new primitive is required beyond it:** A#1
  context-aggregate (FR filet-M, ES neighbour-derived), A#2 height-proportional solve (ES packs
  substitute a documented conservative pairing), A#7 datum qualifier (NL peil), A#9
  applicability/validity (NL voorbereidingsbesluit), A#14 slope fact (ES 255, FR HMC), plus Lane B
  kernel gap #3 (inclined-plane tops — FR crown, NL goot/ridge, ES roof volume). The only
  overstate-capable defects found are wiring, not architecture: D3 (NL holes) and the pre-existing,
  self-documented NZ 5 front-edge null (`esMadridPgoum97.ts:636–652`).
- Nothing sighted in ES/FR/NL requires a constraint graph, a kernel replacement, or reopening the
  frozen E4 model. The two structural asks that survive adversarial reading: gate fixtures for the
  live-resolved routes (D1 — now urgent), and the pack-side tier-authoring seat (row 5).
