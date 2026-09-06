// §PL-LIVE-QUANTITIES (lane PL-COST-AND-CREATE-HOUSE, 2026-09-06) — STR §25.7's four live
// figures and the AREA the indicative estimate multiplies.
//
// Founder, verbatim: *"At the envelope stage, live in the panel: room names · room net surface ·
// brut surface per level · total. Plus an adjustable cost per m² giving a cost estimate before
// going into detail."* And: *"the plan view, the 3d scene and the graph shall talk to each other
// as a single living entity. Everything shall be live."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THREE OF THE FOUR FIGURES ALREADY EXIST AND THIS MODULE DOES NOT RECOMPUTE THEM
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `intendedAreaChannel.ts collectIntendedAreas` ALREADY produces room names, each room's own
// footprint area, the per-storey level-envelope area and the total — with a `readable`
// discriminant that keeps *"PRYZM could not read"* apart from *"nothing is declared"*. C06 §13.3
// is one producer per fact; §25.11 clause 1 is binding and says a copy-paste of an existing
// producer is a FAILURE even when it looks right. So this module takes the SNAPSHOT as input and
// adds exactly one thing: the join to the cost estimator.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHICH NUMBER IS MULTIPLIED, AND WHY IT IS NOT CALLED GFA
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `IntendedAreaSnapshot.totalIntendedM2` — the sum of the LEVEL envelopes' footprint areas across
// storeys. It is the BRUT-per-level figure the founder named, added up, and it is the only area
// that exists at this stage.
//
//   · It is NOT `gfaM2`. `SpaceEnvelope.footprintAreaM2` carries the schema rider *"THIS IS NOT A
//     GROSS FLOOR AREA AND MUST NEVER BE SUMMED INTO ONE"*, and the C114 §3a discipline is *"three
//     questions, three authorities, never summed"*. Calling this GFA in a field name would launder
//     a study into a regulated quantity one identifier at a time. It is `areaM2` with a `basis`
//     sentence that says what it is.
//   · The ROOM areas are NEVER added. `roomsSubtotalM2` is a display sibling. A room sits WITHIN a
//     level (C114 §9a `withinId`), so adding both counts one floor twice.
//   · The BUILT area is NEVER substituted. `measureAuthoredDesign` answers a different question and
//     ADR-0380 D5 forbids it from consuming space envelopes at all.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE ARM THAT MATTERS MOST IS `unreadable`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A runtime with no `spaceEnvelope` store yields `readable: false`. That is an admission about
// PRYZM's WIRING, and it must never reach the cost estimator as "0 m²" — a €0 estimate produced
// from a store PRYZM failed to read is the single most-repeated defect shape in this repo
// ([[context-data-honesty-family]]). This module returns `area: null` with the snapshot's own
// sentence, and the estimator's `no-area` arm is reached only for a store that WAS read and holds
// nothing.
//
// PURE: no store, no DOM, no THREE, no I/O, no clock. Deterministic. Never throws.

import { trace } from '@opentelemetry/api';
import type { IndicativeArea } from '@pryzm/core-app-model';
import type { IntendedAreaSnapshot } from './intendedAreaChannel';

const _tracer = trace.getTracer('pryzm.site.liveQuantitiesModel');

/** One storey's row, as the panel prints it. A projection of `IntendedLevelArea`, never a re-derivation. */
export interface LiveQuantityLevelRow {
    readonly levelId: string;
    /** The authored storey name, or `null` — never invented from the id. */
    readonly name: string | null;
    readonly elevation: number | null;
    /** ⛔ LEVEL envelopes only. The founder's "brut surface per level". */
    readonly brutAreaM2: number;
    /** The rooms on this storey, by name, with their own net areas. Listed, never added. */
    readonly rooms: readonly { readonly name: string | null; readonly netAreaM2: number }[];
    /** The rooms' areas added up, FOR DISPLAY BESIDE `brutAreaM2`. Never added to it. */
    readonly roomsNetSubtotalM2: number;
}

export type LiveQuantitiesModel =
    | {
        /** The store was read. What follows is a finding about the PROJECT. */
        readonly readable: true;
        readonly levels: readonly LiveQuantityLevelRow[];
        /** `null` when NO level envelope is declared — none declared is not zero declared. */
        readonly totalBrutM2: number | null;
        /** Σ of every listed room's net area. Display only; never an addend of `totalBrutM2`. */
        readonly totalRoomsNetM2: number;
        readonly roomCount: number;
        /**
         * The area handed to the cost estimator, or `null` when there is nothing to multiply.
         * Carries its own `basis` and `caveat`, which the estimator prints verbatim.
         */
        readonly area: IndicativeArea | null;
    }
    | {
        /** The store could not be read. What follows is an admission about PRYZM. */
        readonly readable: false;
        readonly reason: 'no-store' | 'store-threw';
        /** The channel's own sentence, forwarded verbatim — never re-worded here. */
        readonly text: string;
        readonly area: null;
    };

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * The `caveat` every indicative estimate built from this area carries. It is a sentence and not a
 * flag because it ends up inside `IndicativeCostEstimate.statement`, where a user reads it.
 */
export const INTENDED_AREA_CAVEAT =
    'it is the sum of the level envelopes you have declared — the footprint each one encloses, '
    + 'added across storeys. It is NOT a measured gross floor area: nothing has been modelled yet, '
    + 'so it excludes nothing for walls, shafts or circulation and includes no allowance for '
    + 'anything an ordinance would count differently. It is a STUDY.';

/**
 * Build the live-quantities model from an intended-area snapshot. Pure; total; never throws.
 *
 * @param snapshot the output of `collectIntendedAreas` — the ONE producer of these figures
 */
export function buildLiveQuantitiesModel(snapshot: IntendedAreaSnapshot): LiveQuantitiesModel {
    const span = _tracer.startSpan('pryzm.site.buildLiveQuantitiesModel');
    try {
        if (!snapshot.readable) {
            span.setAttribute('pryzm.liveQuantities.arm', snapshot.reason);
            return { readable: false, reason: snapshot.reason, text: snapshot.text, area: null };
        }

        const levels: LiveQuantityLevelRow[] = snapshot.byLevel.map((l) => ({
            levelId: l.levelId,
            name: l.name,
            elevation: l.elevation,
            brutAreaM2: l.intendedAreaM2,
            rooms: l.rooms.map((r) => ({ name: r.name, netAreaM2: r.netAreaM2 })),
            roomsNetSubtotalM2: l.roomsSubtotalM2,
        }));

        const totalBrutM2 = snapshot.totalIntendedM2;
        // ⛔ Display sibling. It is NEVER added to `totalBrutM2` — see the header.
        const totalRoomsNetM2 = levels.reduce((s, l) => s + l.roomsNetSubtotalM2, 0);
        const roomCount = levels.reduce((n, l) => n + l.rooms.length, 0);

        const area: IndicativeArea | null =
            totalBrutM2 !== null && totalBrutM2 > 0
                ? {
                    areaM2: round2(totalBrutM2),
                    basis: `Σ of ${levels.length} declared level envelope${levels.length === 1 ? '' : 's'}`,
                    caveat: INTENDED_AREA_CAVEAT,
                }
                : null;

        span.setAttribute('pryzm.liveQuantities.arm', levels.length === 0 ? 'none-declared' : 'present');
        span.setAttribute('pryzm.liveQuantities.levels', levels.length);
        span.setAttribute('pryzm.liveQuantities.rooms', roomCount);
        return {
            readable: true,
            levels: Object.freeze(levels),
            totalBrutM2,
            totalRoomsNetM2: round2(totalRoomsNetM2),
            roomCount,
            area,
        };
    } finally {
        span.end();
    }
}
