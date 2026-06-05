// Apartment Layout — gather the generate payload from the live stores (A5-modal).
//
// L5 glue: reads the active level's walls (storeRegistry) + their exterior flag
// (FacadeOrientationService) + openings, then defers to the pure, Node-tested
// buildLayoutRequestPayload. Not unit-tested here (it reads the core-app-model
// barrel → window-at-load); verified by the editor typecheck. The pure mapping
// it calls is fully tested.

import { storeRegistry } from '@pryzm/core-app-model';
import { facadeOrientationService } from '@pryzm/spatial-index';
import type { ApartmentGenerateLayoutPayload, ApartmentProgram } from '@pryzm/ai-host';
import {
    buildLayoutRequestPayload,
    DEFAULT_PROGRAM,
    DEFAULT_CONSTRAINTS,
    type PayloadWall,
} from './layoutRequestPayload.js';
import { resolveApartmentBrief } from './briefToProgram.js';
import { getActiveBriefMetadata } from './activeBrief.js';
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';

interface WallRecord {
    id: string;
    levelId: string;
    /** Wall height in METRES (per the wall store contract). Used at payload-
     *  build time to derive `constraints.floorToCeiling` so the executor can
     *  size generated partitions to match the existing perimeter (§INTERIOR-
     *  HEIGHT-MATCH, 2026-05-29 — replaces the prior live-fix that reached
     *  into the wall store from the executor itself). */
    height?: number;
    baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
    openings?: ReadonlyArray<{
        type: 'window' | 'door';
        elementId?: string;
        offset?: number;    // metres along the wall from baseLine[0]
        width?: number;     // metres
    }>;
}

/**
 * Build the generate payload for `levelId` from the live stores. Returns null
 * when there are no walls on the level. Exterior walls (per SL-3 facades) become
 * the shell.
 *
 * O.12.c — the room program now comes from the STRUCTURED typology brief (single
 * source of truth, no NLP parse). Resolution order for the program:
 *   1. `programOverride` arg (explicit caller-supplied — the onboarding chain
 *      threads the RAC brief through here directly).
 *   2. the active-brief stash (`getActiveBriefMetadata('apartment')`) — set by
 *      the onboarding chain + the picker form, so a no-arg re-trigger (AI panel /
 *      console) still honours the captured brief.
 *   3. DEFAULT_PROGRAM (today's behaviour) — when no brief was captured.
 * Whatever override is found is SPREAD over DEFAULT_PROGRAM, so any field the
 * brief omits keeps its default (graceful fallback).
 *
 * @param levelId the active level.
 * @param programOverride optional explicit partial program (wins over the stash).
 */
export function gatherLayoutPayload(
    levelId: string,
    programOverride?: Partial<ApartmentProgram>,
): ApartmentGenerateLayoutPayload | null {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as
        | { getAll?(): WallRecord[] }
        | undefined;
    const all = wallStore?.getAll?.() ?? [];
    const onLevel = all.filter(w => w.levelId === levelId);
    if (onLevel.length === 0) return null;

    const facades = facadeOrientationService.getFacades(levelId);
    const walls: PayloadWall[] = onLevel.map(w => {
        const bl = w.baseLine;
        const baseLine = bl && bl.length >= 2
            ? ([{ x: bl[0]!.x, z: bl[0]!.z }, { x: bl[1]!.x, z: bl[1]!.z }] as const)
            : undefined;
        return {
            id: w.id,
            isExterior: facades.get(w.id)?.isExterior ?? false,
            ...(baseLine ? { baseLine } : {}),
            openings: (w.openings ?? []).map(o => ({
                type: o.type,
                elementId: o.elementId,
                ...(typeof o.offset === 'number' ? { offset: o.offset } : {}),
                ...(typeof o.width  === 'number' ? { width:  o.width  } : {}),
            })),
        };
    });

    // §INTERIOR-HEIGHT-MATCH (2026-05-29 audit follow-up): derive the
    // partition height from the SHELL — read the max height of every wall
    // on this level (perimeter is the relevant set, but max-over-all is a
    // safe superset for the "tall enough to match the shell" requirement)
    // and inject it into constraints.floorToCeiling (mm). Falls back to
    // the default 2700 mm when no wall on the level has a height.
    let perimeterHeightMm = 0;
    for (const w of onLevel) {
        if (typeof w.height === 'number' && w.height > 0) {
            const hMm = Math.round(w.height * 1000);
            if (hMm > perimeterHeightMm) perimeterHeightMm = hMm;
        }
    }
    const constraints = perimeterHeightMm > 0
        ? { ...DEFAULT_CONSTRAINTS, floorToCeiling: perimeterHeightMm }
        : DEFAULT_CONSTRAINTS;

    // O.12.c — resolve the room program from the STRUCTURED brief (no NLP parse).
    // Explicit override wins; otherwise fall back to the active-brief stash (set
    // by the onboarding chain + the picker), then to DEFAULT_PROGRAM. The
    // override is always a PARTIAL spread over the default, so omitted fields
    // keep their defaults.
    const override = programOverride
        ?? resolveApartmentBrief(getActiveBriefMetadata('apartment')).programOverride;
    const program: ApartmentProgram = { ...DEFAULT_PROGRAM, ...override };

    const payload = buildLayoutRequestPayload({
        levelId,
        walls,
        program,
        constraints,
    });

    // A.21.D6 — stamp the site latitude so the D-TGL biases windows toward the
    // sun-facing façade (climate-driven design). Read the pinned LTP-ENU origin;
    // omitted when no real site location is set (0,0) → pure-length placement.
    const origin = getCurrentSiteOrigin();
    if (origin && Number.isFinite(origin.lat) && (origin.lat !== 0 || origin.lon !== 0)) {
        payload.siteLatitudeDeg = origin.lat;
    }

    return payload;
}
