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
    determinePayloadWalls,
    DEFAULT_PROGRAM,
    DEFAULT_CONSTRAINTS,
    DEFAULT_WEIGHTS,
    DEFAULT_OPTION_COUNT,
    type PayloadWallsRefusal,
} from './layoutRequestPayload.js';
import { resolveApartmentBrief } from './briefToProgram.js';
import { getActiveBriefMetadata } from './activeBrief.js';
import { getActiveScoringWeights, getActiveEngineTuning } from './activeDesignParams.js';
import { getRoomAreaOverrides } from './activeRoomAreaOverrides.js';
import { getRoomTypeOverrides } from './activeRoomTypeOverrides.js';
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';
import { relationshipUndeterminedLabel, relationshipArrayOrUnknown } from '../relationshipDetermination.js';

/** A typed gather refusal (C78 §8.1 vocabulary) handed to `onUndetermined`. */
export type GatherLayoutRefusal = PayloadWallsRefusal;

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
 * @param onUndetermined optional refusal sink (GR-10 / C75 §1.4): called with the
 *   TYPED reason when the gather refuses because a wall's opening set was never
 *   recorded. Callers with a user-facing surface (the trigger's toast, the AI
 *   relay's `{ ok:false, reason }`) render it; headless callers still get the
 *   always-on console.warn.
 */
export function gatherLayoutPayload(
    levelId: string,
    programOverride?: Partial<ApartmentProgram>,
    onUndetermined?: (refusal: GatherLayoutRefusal) => void,
): ApartmentGenerateLayoutPayload | null {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as
        | { getAll?(): WallRecord[] }
        | undefined;
    const all = wallStore?.getAll?.() ?? [];
    const onLevel = all.filter(w => w.levelId === levelId);
    if (onLevel.length === 0) return null;

    // GR-10 / C75 §1.4 — the wall→PayloadWall mapping rides the PURE, node-
    // tested discriminator (determinePayloadWalls, layoutRequestPayload.ts): a
    // wall whose opening set was never recorded REFUSES the gather with a typed
    // reason instead of entering the payload claiming zero openings; a wall
    // with a PRESENT empty array proceeds (a real answer, C71 §4.4). This glue
    // reports the refusal — always to the console, and to the caller's
    // `onUndetermined` sink when one is supplied.
    const facades = facadeOrientationService.getFacades(levelId);
    const wallsDetermination = determinePayloadWalls(
        onLevel,
        (wallId) => facades.get(wallId)?.isExterior ?? false,
        levelId,
    );
    if (wallsDetermination.kind === 'undetermined') {
        console.warn(
            `[apartment-layout] §GR-10 gather REFUSED — ${relationshipUndeterminedLabel(wallsDetermination)}`,
        );
        onUndetermined?.(wallsDetermination);
        return null;
    }
    const walls = wallsDetermination.walls;

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

    // A.26.3 — Editable Living Graph: merge the per-room AREA overrides the
    // inspect card stashed into the program's existing `roomAreasByName`
    // per-instance area targets (the D-TGL bubble graph already honours these,
    // clamped to the room's architectural minimum — ADR-0061). The stash wins
    // over any brief-supplied name-keyed area for the same room. NULL ⇒ no
    // overrides ⇒ the program is unchanged ⇒ generation reproduces the baseline
    // byte-for-byte (ADR-0061 invariant I2). Per-room overrides are the per-node
    // analogue of the A.25 global design sliders — same seam, no parallel mutator.
    const roomAreaOverrides = getRoomAreaOverrides();
    if (roomAreaOverrides) {
        program.roomAreasByName = { ...(program.roomAreasByName ?? {}), ...roomAreaOverrides };
    }

    // A.26.4 — Editable Living Graph: merge the per-room TYPE (occupancy)
    // overrides the inspect card stashed into the program's `roomTypesByName`
    // field (the direct sibling of the AREA merge above). The D-TGL bubble graph
    // re-types the minted room of that name, re-deriving its area weight / minima
    // / habitability / adjacency rules from the new type (ADR-0061 / C52). NULL ⇒
    // no overrides ⇒ the field is omitted ⇒ generation reproduces the byte-
    // identical baseline (ADR-0061 invariant I2). Same per-node-override seam as
    // the AREA edit + the A.25 sliders — no parallel mutator.
    const roomTypeOverrides = getRoomTypeOverrides();
    if (roomTypeOverrides) {
        program.roomTypesByName = { ...(program.roomTypesByName ?? {}), ...roomTypeOverrides };
    }

    // A.25.1 — Living Design Parameters: apply the user's design sliders (if any)
    // as the scorer weights so the next generate ranks options by the user's
    // priorities. Null ⇒ omitted ⇒ buildLayoutRequestPayload uses DEFAULT_WEIGHTS.
    const scoringWeights = getActiveScoringWeights() ?? undefined;

    const payload = buildLayoutRequestPayload({
        levelId,
        walls,
        program,
        constraints,
        ...(scoringWeights ? { scoringWeights } : {}),
    });

    // A.21.D6 — stamp the site latitude so the D-TGL biases windows toward the
    // sun-facing façade (climate-driven design). Read the pinned LTP-ENU origin;
    // omitted when no real site location is set (0,0) → pure-length placement.
    const origin = getCurrentSiteOrigin();
    if (origin && Number.isFinite(origin.lat) && (origin.lat !== 0 || origin.lon !== 0)) {
        payload.siteLatitudeDeg = origin.lat;
    }

    // A.25.3 — stamp the non-scoring engine tuning (adjacency / accessibility /
    // climate / space sliders) so the D-TGL engine RE-RUNS with the user's
    // priorities. Null ⇒ those four sliders are at the neutral midpoint (identity)
    // ⇒ omitted ⇒ the engine uses its defaults (byte-identical baseline).
    const tuning = getActiveEngineTuning();
    if (tuning) payload.tuning = tuning;

    return payload;
}

// ─── §RAC-APARTMENT-IN-ROOM (L-1644, 2026-08-21) — the ROOM-scoped gather ────
//
// "Create an apartment … on room 00-001": the shell is the target room's
// boundary ring, not the level's exterior walls. This glue reads the canonical
// room store row + the room's REAL bounding walls (for opening spans, GR-10
// honesty included) and defers to the pure, node-tested
// `buildRoomScopedLayoutPayload` (@pryzm/ai-host) — which records the ring
// (centreline, deliberately — see its header) on `payload.shellRingWorld` so
// the workflow's shell reader synthesises the shell from geometry and the
// room's existing walls are NEVER re-created or re-resolved by id.

import { buildRoomScopedLayoutPayload, type RoomScopeWall } from '@pryzm/ai-host';

/** The canonical room row this gather reads (room-topology RoomStore shape). */
interface RoomRecordLike {
    id: string;
    levelId: string;
    name?: string;
    roomNumber?: string;
    boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }> };
    boundingWallIds?: ReadonlyArray<string>;
    computed?: { area?: number };
}

export type RoomGatherResult =
    | {
        readonly kind: 'payload';
        readonly payload: ApartmentGenerateLayoutPayload;
        readonly room: { readonly id: string; readonly levelId: string; readonly label: string; readonly areaM2?: number };
      }
    | { readonly kind: 'refusal'; readonly reason: string };

/**
 * Build the room-scoped generate payload for `roomId` from the live stores.
 * Every failure is a NAMED refusal (C84 EI-1b) — a vanished room, a degenerate
 * boundary and an unrecorded opening set are three different sentences.
 */
export function gatherRoomLayoutPayload(
    roomId: string,
    programOverride?: Partial<ApartmentProgram>,
    opts?: { readonly lockBedroomCount?: boolean },
): RoomGatherResult {
    const roomStore = storeRegistry.getStoreForType('room') as unknown as
        | { getById?(id: string): RoomRecordLike | undefined | null }
        | undefined;
    const room = roomStore?.getById?.(roomId) ?? null;
    if (room === null || room === undefined) {
        return {
            kind: 'refusal',
            reason: `that room no longer exists in the room store — re-detect rooms and ask again. Nothing was changed.`,
        };
    }
    const label = (room.roomNumber ?? '').trim().length > 0
        ? `room ${room.roomNumber}`
        : `room ${room.id}`;
    const polygon = room.boundary?.polygon ?? [];
    if (polygon.length < 3) {
        return {
            kind: 'refusal',
            reason:
                `${label} has no usable boundary polygon (${polygon.length} vertices recorded) — ` +
                `the layout engine needs a closed room shape. Nothing was changed.`,
        };
    }

    // The room's REAL bounding walls — read for their OPENING spans only (the
    // pure builder filters spans to the ring; walls beyond the ring, or walls
    // missing from the store, contribute nothing and are never re-created).
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as
        | { getById?(id: string): WallRecord | undefined | null }
        | undefined;
    const boundingWalls: RoomScopeWall[] = [];
    const unrecorded: string[] = [];
    for (const wallId of room.boundingWallIds ?? []) {
        const w = wallStore?.getById?.(wallId);
        if (w === null || w === undefined) continue;      // wall gone — no spans from it
        // GR-10 / C75 §1.4 — an ABSENT opening set is not an empty one: a
        // partition could be punched into an opening nobody recorded.
        const openings = relationshipArrayOrUnknown<NonNullable<WallRecord['openings']>[number]>(w.openings);
        if (openings === null) { unrecorded.push(wallId); continue; }
        const bl = w.baseLine;
        boundingWalls.push({
            id: wallId,
            ...(bl && bl.length >= 2
                ? { baseLine: [{ x: bl[0]!.x, z: bl[0]!.z }, { x: bl[1]!.x, z: bl[1]!.z }] as const }
                : {}),
            openings: openings.map(o => ({
                type: o.type,
                ...(typeof o.elementId === 'string' ? { elementId: o.elementId } : {}),
                ...(typeof o.offset === 'number' ? { offset: o.offset } : {}),
                ...(typeof o.width === 'number' ? { width: o.width } : {}),
            })),
        });
    }
    if (unrecorded.length > 0) {
        return {
            kind: 'refusal',
            reason:
                `the opening set of ${unrecorded.length} of ${label}'s bounding wall(s) was never ` +
                `recorded ([${unrecorded.join(', ')}]) — generating against a guess could put a ` +
                `partition through an opening nobody measured. Nothing was changed.`,
        };
    }

    // §INTERIOR-HEIGHT-MATCH — partitions match the room's own walls.
    let heightMm = 0;
    for (const wallId of room.boundingWallIds ?? []) {
        const w = wallStore?.getById?.(wallId);
        if (w && typeof w.height === 'number' && w.height > 0) {
            heightMm = Math.max(heightMm, Math.round(w.height * 1000));
        }
    }
    const constraints = heightMm > 0
        ? { ...DEFAULT_CONSTRAINTS, floorToCeiling: heightMm }
        : DEFAULT_CONSTRAINTS;

    // O.12.c — the SAME program resolution order as the level gather.
    const override = programOverride
        ?? resolveApartmentBrief(getActiveBriefMetadata('apartment')).programOverride;
    const program: ApartmentProgram = { ...DEFAULT_PROGRAM, ...override };
    const scoringWeights = getActiveScoringWeights() ?? undefined;

    const built = buildRoomScopedLayoutPayload({
        levelId: room.levelId,
        roomPolygon: polygon,
        boundingWalls,
        program,
        constraints,
        count: DEFAULT_OPTION_COUNT,
        scoringWeights: scoringWeights ?? DEFAULT_WEIGHTS,
        ...(opts?.lockBedroomCount === true ? { lockBedroomCount: true } : {}),
    });
    if (built.kind === 'refusal') {
        return { kind: 'refusal', reason: `${label}: ${built.reason}` };
    }

    // A.21.D6 / A.25.3 — the same site + tuning stamps as the level gather.
    const origin = getCurrentSiteOrigin();
    if (origin && Number.isFinite(origin.lat) && (origin.lat !== 0 || origin.lon !== 0)) {
        built.payload.siteLatitudeDeg = origin.lat;
    }
    const tuning = getActiveEngineTuning();
    if (tuning) built.payload.tuning = tuning;

    return {
        kind: 'payload',
        payload: built.payload,
        room: {
            id: room.id,
            levelId: room.levelId,
            label,
            ...(typeof room.computed?.area === 'number' ? { areaM2: room.computed.area } : {}),
        },
    };
}
