// §RESI-ORCH-ADOPT (lane RESI-ORCH, 2026-09-04) — the R5 edge the plan said did not exist:
// *"a chosen massing option → proposed envelope → …"*. The user's proposed ground-floor plate
// (§5, a SESSION study) becomes a real, undoable, persisted LEVEL ENVELOPE element (C114) through
// the ordinary command bus. This module builds the payload; it dispatches nothing.
//
// ── WHY THIS IS A CONSUMPTION OF C114, NOT A RIVAL TO IT ────────────────────────────────────
// `plugins/space-envelope` owns the family: its schema, its store, its ONE create verb
// (`spaceEnvelope.batch.create`, C114 §6a — the batch verb even for one envelope, so one gesture
// is one undo entry). This module only speaks that verb's payload. It mints nothing the plugin
// recomputes (`footprintAreaM2`, `volumeM3` — C114 §5 says a payload that supplies them is not
// believed), and it never passes `role: 'maximumBuildable'` — the proposal is what the user
// INTENDS, which is exactly what a level envelope records (`standing: 'design-intent'`).
//
// ── ⛔ THE GROUND FLOOR IS THE GROUND FLOOR, NOT THE ACTIVE LEVEL ────────────────────────────
// The §5 proposal is by definition a GROUND-floor plate. Seating it on whatever storey happens to
// be active would put "the ground floor you asked for" on level 3 because that is where the user
// last clicked. So the target storey is the lowest level whose elevation is not below the datum —
// and when no such storey exists, this REFUSES with the reason rather than inventing a level.
//
// ── ⛔ THE HEIGHT NAMES ITS SOURCE ───────────────────────────────────────────────────────────
// A space envelope must have a positive height (schema). The ladder is: the storey's own recorded
// floor-to-floor → the ordinance's max height ÷ derived storeys → 3.0 m ASSUMED. The third rung is
// a synthesised value, and §ENVELOPE-SITE-DATA forbids synthesising a missing value SILENTLY — so
// the source travels with the spec and the statement prints it, and the envelope's NAME carries it
// too, because the name is the one field that follows the element into every panel.
//
// PURE: no store, no DOM, no bus, no clock, no RNG (the id is minted by the CALLER — C16 CA-2:
// `execute()` runs again on REDO, so an id minted anywhere near the handler would differ the
// second time). Never throws.

import { trace } from '@opentelemetry/api';
import type { TargetFootprintProposal } from './targetFootprintAreaSolver';

const _tracer = trace.getTracer('pryzm.site.adoptProposalAsEnvelope');

/** A storey datum as `bimManager.getLevels()` returns it (fields optional — it is `unknown[]`). */
export interface AdoptLevelCandidate {
    readonly id: string;
    readonly name: string | null;
    readonly elevation: number;
    /** Floor-to-floor (m); `null` when the record carries none. */
    readonly height: number | null;
}

/** How the envelope's height was decided — printed, never hidden. */
export type AdoptHeightSource = 'level-record' | 'derived-floor-to-floor' | 'assumed-3m';

export type AdoptRefusalReason =
    /** No proposal is live (withdrawn, refused, or stale against a re-solved envelope). */
    | 'no-proposal'
    /** The project has no storeys at all. */
    | 'no-levels'
    /** Every storey is below the datum — there is no ground floor to seat a ground-floor plate on. */
    | 'no-ground-level';

/** The exact `spaceEnvelope.batch.create` spec shape (C114 §6), spelled locally so this module
 *  needs no import from the plugin it consumes — the bus is the boundary. */
export interface AdoptEnvelopeSpec {
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    readonly footprint: readonly { readonly x: number; readonly y: 0; readonly z: number }[];
    readonly baseOffset: 0;
    readonly height: number;
    readonly role: 'level';
    readonly withinId: null;
    readonly name: string;
}

export interface AdoptProposalPlan {
    readonly ok: true;
    readonly command: 'spaceEnvelope.batch.create';
    readonly payload: { readonly envelopes: readonly [AdoptEnvelopeSpec] };
    readonly level: AdoptLevelCandidate;
    readonly heightSource: AdoptHeightSource;
    readonly heightM: number;
    /** Plain language: what will be created, on which storey, at what height and why that height. */
    readonly statement: string;
}

export interface AdoptProposalRefusal {
    readonly ok: false;
    readonly reason: AdoptRefusalReason;
    readonly statement: string;
}

export type AdoptProposalResult = AdoptProposalPlan | AdoptProposalRefusal;

const ASSUMED_HEIGHT_M = 3;

/** Normalise `bimManager.getLevels()`'s `unknown[]` into candidates. Records without a string id
 *  and a finite elevation are dropped — a storey PRYZM cannot place is not a storey to seat on. */
export function readLevelCandidates(raw: unknown): readonly AdoptLevelCandidate[] {
    if (!Array.isArray(raw)) return [];
    const out: AdoptLevelCandidate[] = [];
    for (const r of raw) {
        if (typeof r !== 'object' || r === null) continue;
        const rec = r as Record<string, unknown>;
        const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : null;
        const elevation = typeof rec.elevation === 'number' && Number.isFinite(rec.elevation) ? rec.elevation : null;
        if (id === null || elevation === null) continue;
        const height = typeof rec.height === 'number' && Number.isFinite(rec.height) && rec.height > 0 ? rec.height : null;
        const name = typeof rec.name === 'string' && rec.name.length > 0 ? rec.name : null;
        out.push({ id, name, elevation, height });
    }
    return out;
}

/** The lowest storey at or above the datum. `null` when there is none. Pure. */
export function pickGroundLevel(levels: readonly AdoptLevelCandidate[]): AdoptLevelCandidate | null {
    let best: AdoptLevelCandidate | null = null;
    for (const l of levels) {
        if (l.elevation < -0.01) continue;
        if (best === null || l.elevation < best.elevation) best = l;
    }
    return best;
}

/**
 * Build the plan. Pure; total; never throws.
 *
 * @param proposal   the LIVE proposal (already passed `resolveLiveTargetFootprintProposal`), or null
 * @param levels     the project's storeys
 * @param ordinance  the card's derived height figures, for the second rung of the height ladder
 * @param mintedId   the `spaceEnvelope_<ulid>` id the CALLER minted (C16 CA-2)
 */
export function buildAdoptProposalPlan(
    proposal: TargetFootprintProposal | null,
    levels: readonly AdoptLevelCandidate[],
    ordinance: { readonly maxHeightM: number | null; readonly maxFloors: number | null },
    mintedId: string,
): AdoptProposalResult {
    const span = _tracer.startSpan('pryzm.site.buildAdoptProposalPlan');
    try {
        if (proposal === null) {
            span.setAttribute('pryzm.adopt.refusal', 'no-proposal');
            return {
                ok: false,
                reason: 'no-proposal',
                statement: 'There is no live proposal to adopt. Fit a ground-floor area first — a withdrawn or '
                    + 'refused proposal has no geometry to make an element from.',
            };
        }
        if (levels.length === 0) {
            span.setAttribute('pryzm.adopt.refusal', 'no-levels');
            return {
                ok: false,
                reason: 'no-levels',
                statement: 'This project has no storeys yet, so there is nothing to seat a level envelope on. '
                    + 'Create a level first; PRYZM will not invent one.',
            };
        }
        const level = pickGroundLevel(levels);
        if (level === null) {
            span.setAttribute('pryzm.adopt.refusal', 'no-ground-level');
            return {
                ok: false,
                reason: 'no-ground-level',
                statement: `Every one of the ${levels.length} storeys in this project sits below the datum, so `
                    + 'there is no ground floor to seat a ground-floor plate on. Add a storey at or above 0 m.',
            };
        }

        let heightM: number;
        let heightSource: AdoptHeightSource;
        if (level.height !== null && level.height > 0) {
            heightM = level.height;
            heightSource = 'level-record';
        } else if (
            ordinance.maxHeightM !== null && ordinance.maxHeightM > 0
            && ordinance.maxFloors !== null && ordinance.maxFloors > 0
        ) {
            heightM = ordinance.maxHeightM / ordinance.maxFloors;
            heightSource = 'derived-floor-to-floor';
        } else {
            heightM = ASSUMED_HEIGHT_M;
            heightSource = 'assumed-3m';
        }

        const heightWhy = heightSource === 'level-record'
            ? `the storey's own recorded floor-to-floor (${heightM.toFixed(2)} m)`
            : heightSource === 'derived-floor-to-floor'
                ? `the ordinance's max height ÷ its derived storey count (${heightM.toFixed(2)} m — an even division for study, not a regulated storey height)`
                : `an ASSUMED ${ASSUMED_HEIGHT_M.toFixed(1)} m, because neither the storey nor the ordinance supplied one`;

        const levelLabel = level.name ?? `storey at ${level.elevation.toFixed(2)} m`;
        const achieved = proposal.achievedAreaM2.toFixed(0);
        const name = heightSource === 'assumed-3m'
            ? `Proposed ground floor · ${achieved} m² · height assumed`
            : `Proposed ground floor · ${achieved} m²`;

        const spec: AdoptEnvelopeSpec = {
            spaceEnvelopeId: mintedId,
            levelId: level.id,
            footprint: proposal.ring.map((p) => ({ x: p.x, y: 0 as const, z: p.z })),
            baseOffset: 0,
            height: heightM,
            role: 'level',
            withinId: null,
            name,
        };

        span.setAttribute('pryzm.adopt.heightSource', heightSource);
        span.setAttribute('pryzm.adopt.levelId', level.id);
        return {
            ok: true,
            command: 'spaceEnvelope.batch.create',
            payload: { envelopes: [spec] },
            level,
            heightSource,
            heightM,
            statement:
                `Creates ONE level envelope of ${achieved} m² on ${levelLabel}, ${heightM.toFixed(2)} m high — `
                + `the height is ${heightWhy}. It records what you INTEND to build; it is not the permitted `
                + `envelope and does not change it. One undo removes it.`,
        };
    } finally {
        span.end();
    }
}
