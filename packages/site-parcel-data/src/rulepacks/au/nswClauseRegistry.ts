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
 *  - `UNRESOLVED`  — **we have not established the legal role.** Not a guess, not a default, and
 *                    not a synonym for "ignore": the control is reported, uncited-role, unapplied.
 */
export type NswLegalRole = 'BASE' | 'CONDITIONAL' | 'OVERRIDE' | 'CAP' | 'UNRESOLVED';

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
            clause: null,
            source:
                'ePlanning Portal Local_Provisions/430 CLASS_DESCRIPTION (served attribute), ' +
                'read 2026-09-03; PCO_REF_KEY 2012-550',
            plane: { lineHeight_m, angleDeg, orientation },
            signedBy: null,
            note:
                'Parameters served as data, not extracted from prose. A building height plane is a ' +
                'CAP: it trims the volume and never raises the base height.',
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
        clause: null,
        source: 'ePlanning Portal Local_Provisions/573 LAY_CLASS (served attribute), read 2026-09-03',
        plane: null,
        signedBy: null,
        note:
            'Time window served in LAY_CLASS (e.g. "12-2pm, 21 June"); plane angle is derivable from ' +
            'solar geometry at the site latitude, origin line is not yet resolved. Reported, not applied.',
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
        clause: null,
        source: 'ePlanning Portal Local_Provisions/469 LAY_NAME + LAY_CLASS (served), read 2026-09-04',
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
        instrument: '*',
        layerId: NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE,
        layClass: null,
        role: 'CAP',
        condition: null,
        // ⚠ STILL null, and Arm C still counts this control as UNCITED — deliberately. Knowing
        // what the number MEANS is not knowing which clause makes it BIND. Recording the semantics
        // here must not be allowed to look like a citation; only a real clause reference closes it.
        clause: null,
        source: 'ePlanning Portal Local_Provisions/429 LAY_NAME (served attribute), read 2026-09-04',
        plane: null,
        signedBy: null,
        note:
            'Minimum habitable floor level in AHD, on the FLOOR axis — despite the layer being ' +
            'titled "Building Height Allowance Map". Measured 203/203 rows, BALLINA + BYRON. ' +
            'Never additive, never a maximum, never comparable to a height above existing ground.',
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
): NswControlRuling | null {
    const inst = instrument?.trim() ?? '';
    const cls = layClass?.trim() ?? null;

    const candidates = NSW_CONTROL_RULINGS.filter((r) => {
        if (r.layerId !== layerId) return false;
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
