// §NSW-CLAUSE-REGISTRY — the legal role of each spatial control, stated once, per instrument.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT THAT FORCED THIS FILE TO EXIST
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The build prompt's §5 step 2 is *"resolve each control's `LEGIS_REF_CLAUSE`"*. Phase 0 measured
// that field and **it is 0.0% populated on 10 of the 12 vertical overlay layers**
// (PHASE0-REPORT §M1.3): Alternative Building Heights, Alternative HOB, Building Height Allowance,
// Building Height Plane, Floor Height Restriction, Sun Plane Protection, Overshadowing, Airport
// Buffer, Meteorological Station Height Limit, Macquarie Park Incentive HOB — all null.
//
// The base control is well cited (Principal/14 HOB: 94.8%). **The overlays that COMPETE with it
// are not cited at all.** So precedence cannot be resolved from feature attributes, and the
// engine's designed input does not exist. That is the single most important Phase 0 finding.
//
// This registry is the replacement input: a STATIC, HAND-EXTRACTED, SIGNED mapping from
// (instrument, layer[, class]) → legal role + condition + citation. It is the build prompt's §8
// "one-time clause extraction, signed and stored", generalised from Height-Plane classes to the
// whole overlay family, because the measurement says the whole family needs it.
//
// ⛔ THE DEFAULT IS `UNRESOLVED`, AND THAT IS THE WHOLE POINT. A control with no registry entry
// does NOT get a guessed role. The founder's §1.3: *"which control governs is a LEGAL question
// answered by the LEP clause, not an arithmetic one. Tightest-number-wins is a guess wearing a
// plausible face."* An unregistered control is carried, cited, and NOT applied — never minimised
// into the answer, never silently dropped.
//
// ⛔ AND `UNRESOLVED` IS NOT A LICENCE TO PUBLISH. Entries here are the ONLY thing that lets a
// competing control be applied. Adding one is a legal assertion about someone's land; it carries
// a signer and a source, and `signed: false` entries are usable for development but must not
// reach a published envelope (build prompt §1.4 — status A is unreachable without a named signer).
//
// P5-adjacent purity: pure data + pure lookups. No I/O, no clock, no RNG.
// Contracts: C58 §1.2/§1.4, C62 (authority), C74 §0, C75 (provenance).

import { NSW_LAYER } from './nswPortalLayers.js';

/**
 * How a control relates to the base, in LAW. These are the build prompt's §5.3 four roles plus the
 * honest fifth that the measurement made unavoidable.
 *
 *  - `BASE`        — applies by default and IS the governing maximum unless displaced.
 *  - `CONDITIONAL` — applies ONLY if a condition is met (a bonus, an incentive, an alternative
 *                    scheme). ⚠ NEVER APPLIED AUTOMATICALLY. Emitted as an unapplied uplift with
 *                    its condition attached. *"A conditional uplift presented as an entitlement is
 *                    the worst output this engine can produce."*
 *  - `OVERRIDE`    — REPLACES the base where it applies (typically a SEPP over an LEP).
 *  - `CAP`         — applies ON TOP of whatever governs, by intersection: airport surfaces,
 *                    meteorological station limits, sun-access planes. Never raises anything.
 *  - `DATUM`       — ⭐ ROUND-4 ADDITION. The control does not limit anything; it **substitutes the
 *                    origin** from which the base height is measured (Byron LEP 2014 cl 4.3A).
 *                    None of the four roles above can express that, and forcing it into `CAP` is
 *                    how a measurement datum spent two rounds being read as a limit. It is a
 *                    separate role because it composes differently: a cap intersects, an uplift is
 *                    withheld, a datum RELOCATES the answer without changing its magnitude.
 *  - `UNRESOLVED`  — **we have not established the legal role.** Not a guess, not a default, and
 *                    not a synonym for "ignore": the control is reported, uncited-role, unapplied.
 */
export type NswLegalRole = 'BASE' | 'CONDITIONAL' | 'OVERRIDE' | 'CAP' | 'DATUM' | 'UNRESOLVED';

/**
 * Parameters for an inclined-plane control (Building Height Plane, Sun Plane Protection).
 *
 * Feeds `packages/site-parcel-data/src/geometry/inclinedTop.ts` — `InclinedPlaneSpec` takes
 * `{ anchorA, anchorB, baseHeight_m, slopePerMeter }`, so `slopePerMeter = tan(angleDeg)` and the
 * origin line comes from the control polygon's own geometry, oriented by `orientation`.
 *
 * ⭐ THE PRIMITIVE ALREADY EXISTS AND THIS LANE DID NOT REBUILD IT — see the lane report. The
 * build prompt §8 asked for `plane(origin_line, angle, height_at_origin) → half-space` in the
 * SHARED solver; `inclinedTop.ts` is line-anchored exactly that way and predates both this lane
 * and the NL/DK lane. This file supplies PARAMETERS to it; it adds no geometry kernel.
 */
export interface NswPlaneParameters {
    /** Height of the plane at its origin line, metres above existing ground level. */
    readonly lineHeight_m: number;
    /** Angle above the horizontal, degrees. `slopePerMeter = Math.tan(angleDeg * Math.PI / 180)`. */
    readonly angleDeg: number;
    /** Which side of the origin line the plane governs, as the instrument words it. */
    readonly orientation: string;
}

/** One registry row: the legal role of one control, for one instrument, with its citation. */
export interface NswControlRuling {
    /** `EPI_NAME` exactly as the service serves it. */
    readonly instrument: string;
    /** ePlanning Portal layer id. */
    readonly layerId: number;
    /**
     * ⚠ WHICH SERVICE THE LAYER ID BELONGS TO. `null` = "the Principal / Local Provisions family",
     * whose ids do not collide. `'SEPP'` scopes the row to the SEPP service, whose numbering is
     * INDEPENDENT — SEPP/799 is the Growth Centres Incentive HOB map and shares its id with
     * nothing in particular. A registry keyed on a bare integer across three services is one
     * collision away from applying the wrong clause to the right-looking layer.
     */
    readonly service?: 'SEPP' | null;
    /**
     * `LAY_CLASS` this ruling is scoped to, or `null` for "every class on this layer".
     * Building Height Plane needs per-class rows (A–E differ); Alternative HOB does not.
     */
    readonly layClass: string | null;
    readonly role: NswLegalRole;
    /**
     * For `CONDITIONAL`: the condition, in the instrument's own words. **Required** for
     * CONDITIONAL rows — a conditional uplift with no stated condition cannot be shown to a user
     * as anything but a guess, so `nswLookupRuling` refuses such a row.
     */
    readonly condition: string | null;
    /** The clause reference. This is what `LEGIS_REF_CLAUSE` should have carried and does not. */
    readonly clause: string | null;
    /** Where the ruling was read from — a URL, an XML export id, or a served attribute. */
    readonly source: string;
    /**
     * ⭐ THE SENTENCE, VERBATIM, when one was actually read. Carried into refusals and
     * explanations so a reader checks the LAW rather than this file's paraphrase of it — the
     * difference between a citation and an assertion (C58 §1.3).
     *
     * `null` when the row records only served-attribute semantics and no clause text was read.
     * ⛔ A row with `clause` populated and `verbatim` null is a claim about which clause binds
     * without the words that say so; permitted, but weaker, and the gate can tell them apart.
     */
    readonly verbatim?: string | null;
    /** Inclined-plane parameters, when the control is a plane. */
    readonly plane: NswPlaneParameters | null;
    /**
     * A named human who verified this row against the instrument. `null` = NOT SIGNED.
     * Build prompt §1.4: status A is unreachable without a named signer.
     */
    readonly signedBy: string | null;
    /** Free-text provenance note; carried into output so a reader can audit the claim. */
    readonly note: string | null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE REGISTRY
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ SMALL ON PURPOSE. Every row is something this lane actually READ from a government source.
 * The empty space is the honest state of NSW precedence knowledge, and it is what makes the
 * engine emit "we have not established which governs" instead of a confident wrong number.
 */
export const NSW_CONTROL_RULINGS: readonly NswControlRuling[] = Object.freeze([
    // ──────────────────────────────────────────────────────────────────────────────────────────
    // BASE — the one control whose role is not in doubt anywhere in NSW.
    // ──────────────────────────────────────────────────────────────────────────────────────────
    {
        instrument: '*',
        layerId: NSW_LAYER.HEIGHT_OF_BUILDINGS,
        layClass: null,
        role: 'BASE',
        condition: null,
        clause: 'Standard Instrument cl 4.3 (Height of buildings)',
        source: 'Standard Instrument — Principal Local Environmental Plan (NSW), clause 4.3',
        plane: null,
        signedBy: null,
        note:
            'The Standard Instrument makes cl 4.3 the principal height control in every NSW LEP. ' +
            'Measured: Principal/14 carries LEGIS_REF_CLAUSE on 94.8% of features, so most parcels ' +
            'also carry a per-feature citation which SHOULD be preferred over this fallback.',
    },

    // ──────────────────────────────────────────────────────────────────────────────────────────
    // BURWOOD LEP 2012 — Building Height Plane, classes A–E.
    //
    // ⭐ THE FIND OF THIS LANE. Build prompt §8 predicted these parameters would need clause
    // extraction and that an unresolvable class must degrade to status C. Measured: the service
    // serves them outright in `CLASS_DESCRIPTION`, e.g.
    //   "BHP Line Height: 1.8m, BHP Projected Angle: 33°, BHP General Orientation: North of BHP line"
    // All 9 Building Height Plane polygons in NSW are Burwood, and all five classes resolve.
    // So NSW's inclined planes are 🟢 source-complete, NOT status C.
    //
    // Note the current Burwood LEP 2012 XML export carries no "building height plane" clause text
    // (searched, 0 hits) — the parameters exist as DATA while the clause does not resolve. Hence
    // `clause: null` with the served attribute as `source`: an honest citation of what we read.
    // ──────────────────────────────────────────────────────────────────────────────────────────
    ...(
        [
            ['A', 1.0, 54, 'East of BHP line'],
            ['B', 1.8, 54, 'East of BHP line'],
            ['C', 1.0, 36, 'West of BHP line'],
            ['D', 1.0, 33, 'North of BHP line'],
            ['E', 1.8, 33, 'North of BHP line'],
        ] as ReadonlyArray<readonly [string, number, number, string]>
    ).map(
        ([cls, lineHeight_m, angleDeg, orientation]): NswControlRuling => ({
            instrument: 'Burwood Local Environmental Plan 2012',
            layerId: NSW_LAYER.BUILDING_HEIGHT_PLANE,
            layClass: cls,
            role: 'CAP',
            condition: null,
            // ⭐ ROUND 4: the clause IS resolvable, and the round-3 note said it was not. This row
            // read `clause: null` with the comment "the current Burwood LEP 2012 XML export carries
            // no 'building height plane' clause text (searched, 0 hits)". That search was over the
            // XML export; the CONSOLIDATED HTML was fetched successfully on 2026-09-04 and the
            // clause is cl 4.3A. ⚠ §GREP-SILENCE-HAS-THREE-CAUSES: the silence was the CHANNEL,
            // not the law, and a "0 hits" from one channel was read as a fact about the instrument.
            clause: 'Burwood Local Environmental Plan 2012 cl 4.3A (Exceptions to height of buildings)',
            verbatim:
                'Despite clause 4.3, the height of a building on land marked "Area A" on the Height ' +
                'of Buildings Map is not to exceed the building height plane for that land. ... ' +
                'building height plane or BHP means a plane- (a) commencing at a building height ' +
                'plane line shown on the Building Height Plane Map and referred to in Column 1 of ' +
                'the Table to this clause and at the height above ground level (existing) as shown ' +
                'opposite in Column 2 of that Table, and (b) projected at the angle measured above ' +
                'the horizontal as shown opposite in Column 3 of that Table, and (c) having the ' +
                'general orientation ...',
            source:
                'Parameters: ePlanning Portal Local_Provisions/430 CLASS_DESCRIPTION (served ' +
                'attribute), read 2026-09-03. Clause: legislation.nsw.gov.au epi-2012-0550 ' +
                '(consolidated, fetched 2026-09-04, 742,292 bytes), transcript ' +
                'phase0-transcripts/lep-text-probe2.json. PCO_REF_KEY 2012-550.',
            plane: { lineHeight_m, angleDeg, orientation },
            signedBy: null,
            note:
                'Parameters served as data, not extracted from prose — and the clause independently ' +
                'confirms their SHAPE (line height above ground level (existing), angle above the ' +
                'horizontal, general orientation), which is a second reading of the same fact. ' +
                'A building height plane is a CAP: "is not to exceed" — it trims the volume and ' +
                'never raises the base height. ⚠ The clause applies only to land marked "Area A" on ' +
                'the Height of Buildings Map, an applicability condition this pack does not fetch.',
        }),
    ),

    // ──────────────────────────────────────────────────────────────────────────────────────────
    // WOLLONGONG LEP 2009 — Sun Plane Protection. Geometry + TIME WINDOW served; angle derivable.
    //
    // Measured `LAY_CLASS` values carry the window directly: "MacCabe Park 12-2pm 21 June",
    // "Civic Square 11-3pm 21 June", "Pioneer Park 12-2pm 21 June", "Market Square 12-2pm 21 June".
    // The plane angle is therefore 🔵 DERIVABLE from solar geometry at Wollongong's latitude for
    // that window — it is not a clause lookup, which is a better position than §8 assumed.
    //
    // ⛔ NOT DERIVED HERE, AND DELIBERATELY SO. Solar-altitude computation belongs in the shared
    // solar module (@pryzm/solar-analysis), not in a rulepack, and the ORIGIN LINE still comes
    // from the clause. Registered with `role: 'CAP'` and NO plane parameters, so the engine reports
    // the control, applies nothing, and names what is missing.
    // ──────────────────────────────────────────────────────────────────────────────────────────
    {
        instrument: 'Wollongong Local Environmental Plan 2009',
        layerId: NSW_LAYER.SUN_PLANE_PROTECTION,
        layClass: null,
        role: 'CAP',
        condition: null,
        // ⭐ ROUND 4 — THE ANGLE IS NOT SOLAR-DERIVED, IT IS STATED. The round-3 note (kept at the
        // end of this row) said the plane angle was "derivable from solar geometry at the site
        // latitude". The clause states the control numerically instead. That is a better position
        // and a different one, and it matters: a solar derivation would have produced a plausible
        // number that the instrument does not use.
        clause: 'Wollongong Local Environmental Plan 2009 cl 8.3 (Sun plane protection)',
        verbatim:
            '(1) The objective of this clause is to protect specified public open space from ' +
            'excessive overshadowing by restricting the height of buildings. (2) This clause applies ' +
            'to land coloured yellow on the Sun Plane Protection Map. (3) Development on land to ' +
            'which this clause applies is prohibited if the development results in any part of a ' +
            'building projecting above a sun access control set out in this clause. (4) MacCabe Park ' +
            'The sun access control for any point on land shown coloured yellow on the Sun Plane ' +
            'Protection Map and marked "MacCabe Park-Burelli Street" is- (a) 32 metres above the ' +
            'point, or (b) if the point is within 26.4 metres of the boundary of Burelli Street- ' +
            '[FORMULA NOT CAPTURED] metres above the point, where D is the shortest distance in ' +
            'metres between the point and the boundary of Burelli Street.',
        source:
            'legislation.nsw.gov.au epi-2010-0076 (consolidated, fetched 2026-09-04, 1,198,687 ' +
            'bytes), transcript phase0-transcripts/lep-text-probe2.json; geometry and time window ' +
            'from ePlanning Portal Local_Provisions/573 LAY_CLASS, read 2026-09-03',
        plane: null,
        signedBy: null,
        note:
            '⛔ STILL NOT APPLIED, AND THE REASON CHANGED. The control is a per-point height ABOVE ' +
            'THE POINT — 32 m beyond 26.4 m from Burelli Street, and a function of D within it. ' +
            'That is not the line-anchored plane `inclinedTop.ts` takes; it is a distance-decay ' +
            'surface, so even a complete capture would need the origin line to be the STREET ' +
            'BOUNDARY rather than a served polygon edge. ⚠ AND THE FORMULA IS MISSING FROM THE ' +
            'CAPTURE: it is a MathML element the HTML-to-text strip dropped, so the transcript ' +
            'reads "- metres above the point" with the expression gone. That is a KNOWN HOLE IN ' +
            'THE CHANNEL, not in the law, and it is named rather than approximated — a plane fitted ' +
            'to "32 m, less nearer the street" is a guess with a citation attached. Re-fetch ' +
            'preserving MathML to close it.',
    },

    // ──────────────────────────────────────────────────────────────────────────────────────────
    // SINGLETON LEP 2013 — Floor Height Restriction. ABSOLUTE MINIMUM LEVELS, not heights.
    //
    // The service names its own datum in LAY_NAME: "Minimum Floor Height Restriction Heights shown
    // on map in AHD (m)". Measured LAY_CLASS (re-read 2026-09-04, all 14 rows): 40.6 / 40.9 / 41.2
    // / 41.5 / 41.8 / 42.1 / 42.4 / 42.7 / 43 / 78.1 — TEN distinct levels; the first Phase 0 pass
    // enumerated eight and missed 43 and 78.1. Flood planning levels on the Hunter floodplain.
    // ⛔ Terrain must NEVER be added to these — they are already absolute.
    // ──────────────────────────────────────────────────────────────────────────────────────────
    {
        instrument: 'Singleton Local Environmental Plan 2013',
        layerId: NSW_LAYER.FLOOR_HEIGHT_RESTRICTION,
        layClass: null,
        role: 'CAP',
        condition: null,
        // ⭐ ROUND 4 — THE ONE ROUND-3 VERDICT THE CLAUSE CONFIRMS RATHER THAN OVERTURNS. Layer 469
        // really is a minimum FINISHED FLOOR level, and it is a different control from layer 429
        // despite both LAY_NAMEs beginning "Minimum". The clause is what establishes that; the
        // similarity of the strings is what nearly hid it.
        clause: 'Singleton Local Environmental Plan 2013 cl 7.1 (Earthworks / flood planning)',
        verbatim:
            'if the building is located on land identified on the Floor Height Restriction Map-the ' +
            'finished floor height of any habitable room in that building will not be less than the ' +
            'minimum height shown for the land on that map ... if the building is located on land ' +
            'identified on the Floor Height Restriction Map-the finished floor height of the first ' +
            'floor of the building will not be less than the height shown for the land on that map ' +
            'and will not exceed 4 metres above natural ground level',
        source:
            'legislation.nsw.gov.au epi-2013-0524 (consolidated, fetched 2026-09-04, 739,180 bytes), ' +
            'transcript phase0-transcripts/lep-text-probe2.json; values from ePlanning Portal ' +
            'Local_Provisions/469 LAY_NAME + LAY_CLASS (served), read 2026-09-04',
        plane: null,
        signedBy: null,
        note:
            'A MINIMUM habitable floor level in AHD — it constrains how LOW the building may sit, ' +
            'not how high. ⚠ `role: CAP` describes its effect on the FLOOR axis; it is NOT a cap on ' +
            'the envelope top, and what keeps it out of height precedence is the AXIS guard in ' +
            'nswLayName.ts (constrainsEnvelopeTop=false), never this role. A future reader tempted ' +
            'to intersect this against a maximum height is comparing two different axes in two ' +
            'different datums.',
    },

    // ──────────────────────────────────────────────────────────────────────────────────────────
    // BALLINA + BYRON LEPs — Building Height Allowance (layer 429). ⛔ NOT A HEIGHT ALLOWANCE.
    //
    // ⭐ THE LANE'S MOST EXPENSIVE CORRECTION, RECORDED HERE SO THE LAYER TITLE CANNOT RE-MISLEAD.
    // The layer is called "Building Height Allowance Map" and the earlier reading took it at its
    // word: an additive height bonus granted under condition. **`LAY_NAME` says otherwise on
    // 203 of 203 rows: "Minimum Level Australian Height Datum (AHD)".** Values 1.8–2.1 in BALLINA
    // and BYRON — coastal flood LGAs where that is a credible minimum habitable floor level and an
    // absurd height bonus. It is a MINIMUM, it is ABSOLUTE, and it is on the FLOOR axis.
    //
    // The parcel that exposed it is `152//DP877246`: HOB 8.5 m alongside a 429 value of 2.1.
    // `min()` returns 2.1 — a garage where an 8.5 m house is permitted. The earlier guard reached
    // the right answer here from a false premise, which is worse than failing, because the premise
    // travels to the next parcel and the answer does not.
    // ──────────────────────────────────────────────────────────────────────────────────────────
    {
        instrument: 'Byron Local Environmental Plan 2014',
        layerId: NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE,
        layClass: null,
        role: 'DATUM',
        condition: null,
        clause: 'Byron Local Environmental Plan 2014 cl 4.3A (Measurement of height of buildings)',
        verbatim:
            '(1) ... to provide for a consistent point of reference for the measurement of building ' +
            'heights in flood prone areas. (2) This clause applies to land identified as "Minimum ' +
            'Level Australian Height Datum (AHD)" on the Building Height Allowance Map. (3) The ' +
            'maximum height of a building on land to which this clause applies is to be measured ' +
            'from the minimum level AHD permitted for that land on the Building Height Allowance Map.',
        source:
            'legislation.nsw.gov.au epi-2014-0297 (consolidated, fetched 2026-09-04), transcript ' +
            'phase0-transcripts/lep-text-probe2.json; values from ePlanning Portal ' +
            'Local_Provisions/429 LAY_NAME + LAY_CLASS (served), read 2026-09-04',
        plane: null,
        signedBy: null,
        note:
            '⭐ THE ROUND-4 CORRECTION, AND THE THIRD READING OF THIS LAYER. It is neither an ' +
            'additive bonus (round 1-2) nor a minimum floor level (round 3): it is the ORIGIN the ' +
            'maximum height is measured from. On this land an 8.5 m LEP height means RL 2.1 + 8.5 = ' +
            '10.6 m AHD, and reporting "8.5 m above existing ground level" is wrong by ' +
            '(2.1 - existing ground level) metres in whichever direction the site slopes.',
    },
    {
        // ⛔ BALLINA IS THE OTHER HALF OF THOSE 203 ROWS AND ITS CLAUSE HAS NOT BEEN READ.
        // The wildcard row supplies the ROLE (the semantics come from a LAY_NAME identical on all
        // 203 features) and deliberately supplies NO CLAUSE, so Ballina's controls stay in citation
        // state `absent` and are reported, not applied.
        //
        // ⚠ THE TEMPTATION HERE IS THE WHOLE FAILURE MODE OF THIS LANE. Byron's cl 4.3A reads so
        // cleanly, and the served attributes are byte-identical across both LGAs, that copying the
        // citation across would feel like tidying. It would be a claim about Ballina's instrument
        // made from Byron's — §CONFIDENT-REGISTER-ROWS-ARE-THE-WRONG-ONES, committed knowingly.
        // One row, one instrument, one reading.
        instrument: '*',
        layerId: NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE,
        layClass: null,
        role: 'DATUM',
        condition: null,
        clause: null,
        verbatim: null,
        source: 'ePlanning Portal Local_Provisions/429 LAY_NAME (served attribute), read 2026-09-04',
        plane: null,
        signedBy: null,
        note:
            'Measurement-datum semantics from a LAY_NAME populated on 203/203 rows (BALLINA + ' +
            'BYRON). The CLAUSE is read for Byron only. Knowing what a number means is not knowing ' +
            'which clause makes it bind, and only the second one closes Arm C.',
    },

    // ──────────────────────────────────────────────────────────────────────────────────────────
    // WOLLONGONG LEP 2009 — Overshadowing Map (layer 763). ⛔ THE POLYGONS ARE THE EXEMPTIONS.
    //
    // ⭐ THE NEAR-MISS WORTH RECORDING. `LAY_CLASS` reads "C1 Brick Chimney Stack - 29m", and 29 m
    // looks exactly like a height limit encoded in a label. It is not. cl 7.20(4) lists the C1
    // North Stack, the C1 Brick Chimney Stack and the C1 Fine Coal Bin as structures whose
    // overshadowing is EXCUSED from the prohibition. The 29 is the existing chimney's height,
    // recorded so the chimney is not held to breach the clause. Parsing it as a cap would have
    // imposed a 29 m limit sourced from an exemption for someone else's chimney.
    // ──────────────────────────────────────────────────────────────────────────────────────────
    {
        instrument: 'Wollongong Local Environmental Plan 2009',
        layerId: NSW_LAYER.OVERSHADOWING,
        layClass: null,
        role: 'CAP',
        condition: null,
        clause:
            'Wollongong Local Environmental Plan 2009 cl 7.20 (Overshadowing of Heritage Plaza, ' +
            'Central Park and Southern Park)',
        verbatim:
            'consent must not be granted for development on land to which this clause applies if ' +
            'the development will result in overshadowing of the land identified as "Heritage ' +
            'Plaza", "Central Park" and "Southern Park" on the Overshadowing Map between 11am and ' +
            '2pm on 21 June. (4) Subclause (3) does not apply to overshadowing caused by the ' +
            'following structures shown on the Overshadowing Map- (a) C1 North Stack, (b) C1 Brick ' +
            'Chimney Stack, (c) C1 Fine Coal Bin.',
        source:
            'legislation.nsw.gov.au epi-2010-0076 (consolidated, fetched 2026-09-04, 1,198,687 ' +
            'bytes), transcript phase0-transcripts/lep-text-probe2.json',
        plane: null,
        signedBy: null,
        note:
            'A CAP in effect (it can only reduce a building) but NOT a numeric one: the control is ' +
            '"no overshadowing of three named parks between 11am and 2pm on 21 June", which is a ' +
            'shadow computation against a time window, not a height. The layer serves no usable ' +
            'number and the one it appears to serve belongs to an EXEMPT EXISTING STRUCTURE. ' +
            'Reported, not applied — and it makes the envelope an upper bound (L-616).',
    },

    // ──────────────────────────────────────────────────────────────────────────────────────────
    // SEPP SERVICE ROWS. ⚠ `service: SEPP` because SEPP layer numbering is INDEPENDENT of the
    // Principal / Local Provisions numbering; a bare integer key would apply these to whatever
    // Local Provisions layer happens to share the id.
    // ──────────────────────────────────────────────────────────────────────────────────────────
    {
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        layerId: 799, // SEPP/799 Incentive Height of Buildings Map
        service: 'SEPP',
        layClass: null,
        role: 'CONDITIONAL',
        condition:
            'The development is INCENTIVISED DEVELOPMENT within the meaning of the Division — it is ' +
            'not a property of the land, and it is not established by the polygon. Until the ' +
            'incentive is granted, the base height on Principal/14 is what applies.',
        clause:
            'State Environmental Planning Policy (Precincts-Western Parkland City) 2021 s 6.16(3) ' +
            '(Incentivised development)',
        verbatim:
            'Despite section 4.3, the maximum height of a building resulting from incentivised ' +
            'development on land to which this division applies is the height shown for the land on ' +
            'the Incentive Height of Buildings Map. (4) Despite section 4.4, the maximum floor space ' +
            'ratio of buildings resulting from incentivised development on land to which this ' +
            'division applies is the floor space ratio shown for the land on the Incentive Floor ' +
            'Space Ratio Map.',
        source:
            'legislation.nsw.gov.au epi-2021-0728 (consolidated, fetched 2026-09-04, 2,718,235 ' +
            'bytes), transcript phase0-transcripts/lep-text-probe2.json',
        plane: null,
        signedBy: null,
        note:
            '⭐ THE MEASURED NON-REPLICA. sepp-overlap2 Q1 sampled 4 polygons: Principal/14 returned ' +
            '30 m or 24 m at every one while this layer said "80-99.9" — same value on 0 of 4. ' +
            'A conditional uplift of roughly 3x the base, and "a conditional uplift presented as an ' +
            'entitlement is the worst output this engine can produce".',
    },
    {
        instrument: 'State Environmental Planning Policy (Sydney Region Growth Centres) 2006',
        layerId: 800, // SEPP/800 Incentive Floor Space Ratio Map
        service: 'SEPP',
        layClass: null,
        role: 'CONDITIONAL',
        condition:
            'The development is INCENTIVISED DEVELOPMENT within the meaning of the Division. Same ' +
            'condition as the height twin (layer 799) and the same clause.',
        clause:
            'State Environmental Planning Policy (Precincts-Western Parkland City) 2021 s 6.16(4) ' +
            '(Incentivised development)',
        verbatim:
            'Despite section 4.4, the maximum floor space ratio of buildings resulting from ' +
            'incentivised development on land to which this division applies is the floor space ' +
            'ratio shown for the land on the Incentive Floor Space Ratio Map.',
        source:
            'legislation.nsw.gov.au epi-2021-0728 (consolidated, fetched 2026-09-04), transcript ' +
            'phase0-transcripts/lep-text-probe2.json',
        plane: null,
        signedBy: null,
        note: 'The floor-space half of s 6.16. Recorded so the FSR lane inherits the same condition.',
    },
    {
        instrument: 'State Environmental Planning Policy (Western Sydney Aerotropolis) 2020',
        layerId: 278, // SEPP/278 Obstacle Limitation Surface
        service: 'SEPP',
        layClass: null,
        role: 'CAP',
        condition: null,
        clause:
            'State Environmental Planning Policy (Precincts-Western Parkland City) 2021 s 4.22 ' +
            '(Airspace operations)',
        verbatim:
            '(1) This section applies to development that is- (a) on land shown on the Obstacle ' +
            'Limitation Surface Map, and (b) a controlled activity within the meaning of the ' +
            'Airports Act 1996 of the Commonwealth, Part 12, Division 4. (2) Development consent ' +
            'must not be granted to development to which this section applies unless the consent ' +
            'authority is satisfied the development will not- (a) compromise ...',
        source:
            'legislation.nsw.gov.au epi-2021-0728 (consolidated, fetched 2026-09-04), transcript ' +
            'phase0-transcripts/lep-text-probe2.json; attributes from ePlanning Portal SEPP/278, ' +
            'read 2026-09-04',
        plane: null,
        signedBy: null,
        note:
            '⛔ THE CLAUSE STATES NO HEIGHT. It is a discretionary prohibition ("must not be granted ' +
            '... unless the consent authority is satisfied"), and its trigger is a CONTROLLED ' +
            'ACTIVITY under Commonwealth aviation law, not a property of the parcel. The served ' +
            'MINIMUM_HEIGHT / MAXIMUM_HEIGHT (150-230.5, COMMENTS "Horizontal" / "Conical") are the ' +
            'elevations of the obstacle limitation surface itself, in a datum the layer does not ' +
            'name. Aviation OLS are conventionally AHD; ⛔ "conventionally" is not a served datum, ' +
            'so this is reported and NOT applied.',
    },
    {
        instrument: 'State Environmental Planning Policy (Precincts-Central River City) 2021',
        layerId: 718, // SEPP/718 Sydney Olympic Park Reduced Level Map
        service: 'SEPP',
        layClass: null,
        role: 'UNRESOLVED',
        condition: null,
        // ⛔ NO CLAUSE, DELIBERATELY, EVEN THOUGH ONE WAS READ. s 18 names this map, but it does not
        // settle the DATUM, and a citation attached to a number on an unknown datum is worse than
        // no citation: it lends authority to the ambiguity. See `nswReducedLevelConflict`.
        clause: null,
        verbatim:
            'The height of a building on any land within the Sydney Olympic Park site is not to ' +
            'exceed the maximum height shown for the land on the Height of Buildings Map or the ' +
            'Reduced Level Map, whichever is applicable.',
        source:
            'legislation.nsw.gov.au epi-2021-0725 Appendix (Sydney Olympic Park) s 18 (consolidated, ' +
            'fetched 2026-09-04), transcript phase0-transcripts/lep-text-probe2.json',
        plane: null,
        signedBy: null,
        note:
            '⭐ THE ONLY MEASURED SEPP HEIGHT CONTROL PRINCIPAL/14 DOES NOT CARRY (5 of 5 interior ' +
            'points return no Principal/14 polygon), and its DATUM IS CONTESTED BY ITS OWN ' +
            'ATTRIBUTES: LAY_NAME "Maximum Building Height (m)" and UNITS "m" against MAP_TYPE ' +
            '"RDL" and MAP_NAME "... Reduced Level Map". The clause names the two maps separately, ' +
            'which supports AHD without settling it. Three readings say AHD and two say metres; a ' +
            '3-2 vote is not a determination. At Sydney Olympic Park (ground roughly RL 5-10 AHD) ' +
            'the difference is the whole ground elevation.',
    },
]);

/** A frozen empty result, so the miss path allocates nothing and cannot be mutated by a caller. */
const NO_RULING: NswControlRuling | null = null;

/**
 * Find the ruling for one control. Most specific wins: an exact `(instrument, layer, class)` row
 * beats an `(instrument, layer, *)` row, which beats a wildcard-instrument row.
 *
 * Returns `null` when nothing matches — the `UNRESOLVED` path. **A null here is a legitimate,
 * expected outcome, not an error**; it is how the engine says "we have not established which
 * control governs", which is the honest answer for most NSW overlays today.
 *
 * ⛔ A `CONDITIONAL` row with no `condition` is REFUSED (returns `null`). Such a row would let the
 * engine announce an uplift it cannot describe, which is the one output the founder singles out
 * as the worst this engine can produce.
 */
export function nswLookupRuling(
    instrument: string | null,
    layerId: number,
    layClass: string | null,
    service: 'SEPP' | null = null,
): NswControlRuling | null {
    const inst = instrument?.trim() ?? '';
    const cls = layClass?.trim() ?? null;

    const candidates = NSW_CONTROL_RULINGS.filter((r) => {
        if (r.layerId !== layerId) return false;
        // ⛔ SERVICE MUST MATCH EXACTLY. A row scoped to the SEPP service must never satisfy a
        // Local Provisions hit that happens to share the integer, and vice versa. Layer ids are
        // per-service and this is the only place that fact is enforced.
        if ((r.service ?? null) !== service) return false;
        if (r.instrument !== '*' && r.instrument !== inst) return false;
        if (r.layClass !== null && r.layClass !== cls) return false;
        return true;
    });
    if (candidates.length === 0) return NO_RULING;

    // Specificity: class-scoped (2) > instrument-scoped (1) > wildcard instrument (0).
    const score = (r: NswControlRuling): number =>
        (r.layClass !== null ? 2 : 0) + (r.instrument !== '*' ? 1 : 0);
    let best = candidates[0]!;
    for (const c of candidates) if (score(c) > score(best)) best = c;

    if (best.role === 'CONDITIONAL' && !best.condition) return NO_RULING;
    return best;
}

/** Is this ruling publishable? Build prompt §1.4 — status A requires a named signer. */
export function isNswRulingSigned(r: NswControlRuling | null): boolean {
    return r !== null && typeof r.signedBy === 'string' && r.signedBy.trim().length > 0;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §NSW-SIGNING-WORKFLOW — what makes a draft row shippable, as a checkable predicate.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The registry has two populations and they must not be confused:
//
//   DRAFT  (`signedBy: null`) — a lane agent read a government source and wrote down what it said.
//          Computes correctly. **Ships to nobody.** Every row in this file is currently a draft.
//   SIGNED (`signedBy: "Name"`) — a NAMED HUMAN read the consolidated instrument and accepts
//          responsibility for the reading. Only these reach a published envelope (§1.4).
//
// ⭐ THE PROPERTY THAT MAKES THE DISTINCTION WORTH HAVING: **Arm C of the citation gate must not
// fall when a draft is added.** A ratchet that a lane agent can drive to zero by writing rows is
// a ratchet measuring its own author. `nswRulingIsPublishableEvidence` is what Arm C counts.

/** The completeness a row needs before a human can sensibly be asked to sign it. */
export interface NswSigningReadiness {
    readonly ready: boolean;
    /** What is missing, named. Empty when `ready`. */
    readonly missing: readonly string[];
}

/**
 * Is this DRAFT complete enough to put in front of a signer?
 *
 * ⚠ This is not a quality judgement on the reading; it is a checklist. A row with no `verbatim`
 * asks a human to sign a paraphrase, and a row whose `source` cannot be re-fetched asks them to
 * sign something they cannot check. Both are refused here rather than discovered at signing time.
 */
export function nswSigningReadiness(r: NswControlRuling): NswSigningReadiness {
    const missing: string[] = [];
    if (!r.clause || r.clause.trim() === '') missing.push('clause (no reference to sign)');
    if (!r.verbatim || r.verbatim.trim() === '')
        missing.push('verbatim (a signer would be endorsing this file\'s paraphrase, not the law)');
    if (!r.source || r.source.trim() === '') missing.push('source (the reading cannot be re-checked)');
    if (r.role === 'CONDITIONAL' && (!r.condition || r.condition.trim() === ''))
        missing.push('condition (a conditional uplift with no stated condition cannot be shown to a user)');
    return { ready: missing.length === 0, missing };
}

/**
 * ⛔ WHAT ARM C COUNTS AS CLOSED. A ruling closes the uncited count only when a NAMED HUMAN signed
 * it — never merely because a draft supplies a clause string.
 *
 * ⚠ THIS IS DELIBERATELY STRICTER THAN `nswMayContributeValue`. An unsigned draft may drive the
 * ENGINE (so the computation can be tested and reviewed) and may not move the LEDGER (so the
 * outstanding legal work stays visible). Conflating the two would let this lane close its own
 * ratchet by writing prose, which is the failure mode §CONFIDENT-REGISTER-ROWS-ARE-THE-WRONG-ONES
 * describes and §RATCHET-EXCEEDED-IS-NEVER-DEBT forbids paying for with anything but the work.
 */
export function nswRulingIsPublishableEvidence(r: NswControlRuling | null): boolean {
    return isNswRulingSigned(r) && !!r!.clause && r!.clause.trim().length > 0;
}

/** Every draft row that is ready for a signer, in registry order. The founder's work queue. */
export function nswSigningQueue(): readonly { readonly ruling: NswControlRuling; readonly readiness: NswSigningReadiness }[] {
    return NSW_CONTROL_RULINGS.filter((r) => !isNswRulingSigned(r)).map((ruling) => ({
        ruling,
        readiness: nswSigningReadiness(ruling),
    }));
}
