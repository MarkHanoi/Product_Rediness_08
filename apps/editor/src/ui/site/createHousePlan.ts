// §PL-CREATE-HOUSE (lane PL-COST-AND-CREATE-HOUSE, 2026-09-06) — STR §25.8's explicit user
// action, PLANNED before it is run.
//
// Founder: *"The envelope stage ends at an explicit user action — CREATE HOUSE — which produces
// floors, slabs, columns, beams, floor finishes, walls, ceilings automatically."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THIS MODULE BUILDS NOTHING. IT DECIDES WHETHER THE PROVEN EXECUTOR MAY RUN, AND WITH WHAT.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The house pipeline already exists and is proven: `generateHouseFromBoundary(runtime, storeys,
// { footprint, floorToFloorM, roofKind, autoBuild })` draws a closed shell from a footprint ring,
// waits for it to register, gathers the brief, and runs `HouseLayoutExecutor`, whose scene
// mutation happens inside ONE `batchCoordinator.runBatch` so undo removes the whole house in one
// step. Reinventing any of that is the single most expensive recurring failure in this repo
// ([[reuse-residential-house-pipeline-patterns]]). So §25.8's job is the JOIN: turn the level
// space envelopes the user has drawn into that call's arguments — or refuse, with numbers.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ C80's QUESTION, ASKED PER RUN: *"may this pass replace this?"* — AND "WE DO NOT KNOW" IS
//    NOT PERMISSION
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `generateHouseFromBoundary` DRAWS A NEW SHELL on the active level. Run it on a level that
// already carries authored walls and the user gets a second shell threaded through their model,
// with the original neither removed nor accounted for. C80 forbids exactly that, so
// `already-built` is a REFUSAL here and it prints the wall count it refused on. It is the only
// refusal in this module whose cause is the user's own prior work, and it is the important one.
//
// ⛔ THE ENVELOPE IS NOT CONSUMED. C114 §3a keeps INTENDED, BUILT and PERMITTED as three
// channels that are never summed; the space envelopes stay exactly where they are after a build,
// so the panel can go on saying *"you intended 320 m² · you have built 296 m²"*. A pass that
// deleted the envelope it built from would destroy the only record of the intent.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ WHAT THE EXECUTOR ACTUALLY PRODUCES — MEASURED IN ITS SOURCE, NOT ASSUMED FROM THE SPEC
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Dispatched by `HouseLayoutExecutor`: `AddLevelCommand` (storeys + a dedicated roof level),
// `wall.batch.create` (shell + partitions), `BatchCreateRoomsCommand`, `CreateSlabCommand`,
// `CreateRoofCommand`, `CreateStairCommand`, and `runHousePostGenChain` (name → FLOOR FINISH →
// CEILING → furnish → light) across every storey.
//
// ⛔ NOT dispatched: COLUMNS and BEAMS. `grep -n "column\|beam" HouseLayoutExecutor.ts` → 0 hits.
// The founder's sentence names them; the executor does not make them. `willCreate` /
// `willNotCreate` below carry that difference to the user's screen instead of letting a button
// labelled "Create house" imply a frame that never appears. Naming it is the whole reason these
// two fields exist.
//
// PURE: no store, no DOM, no THREE, no I/O, no clock, no RNG. Deterministic. Never throws.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.site.createHousePlan');

/** A footprint vertex as the schema stores it — `y` is always 0 (SpaceEnvelope's own refinement). */
export interface HousePlanVertex { readonly x: number; readonly z: number }

/** One level envelope, as this planner needs it. A projection of `SpaceEnvelope`, never a copy. */
export interface LevelEnvelopeDatum {
    readonly id: string;
    readonly levelId: string;
    readonly name: string | null;
    readonly baseOffset: number;
    readonly height: number;
    readonly footprint: readonly HousePlanVertex[];
    readonly footprintAreaM2: number;
}

export interface CreateHousePlanInput {
    /**
     * The level envelopes on this site, in any order. `null` means THE STORE COULD NOT BE READ —
     * an admission about PRYZM's wiring, and a different answer from `[]`, which is a finding
     * about the project. The two get different refusals.
     */
    readonly levelEnvelopes: readonly LevelEnvelopeDatum[] | null;
    /** The active level id, or `null`/`undefined` when there is none. The executor requires one. */
    readonly activeLevelId: string | null | undefined;
    /**
     * How many walls are already authored on the active level. C80's question is decided from
     * this number, and the refusal prints it.
     */
    readonly authoredWallCountOnActiveLevel: number;
    /** Default 'gable', matching the executor's own default. */
    readonly roofKind?: 'flat' | 'gable' | 'hip';
}

export type CreateHouseRefusalCode =
    | 'envelope-store-unreadable'
    | 'no-level-envelope'
    | 'no-active-level'
    | 'already-built'
    | 'degenerate-footprint'
    | 'ambiguous-ground-plate';

export interface CreateHouseRefusal {
    readonly code: CreateHouseRefusalCode;
    /** ⛔ NAMES BOTH NUMBERS wherever two numbers decided it (§12a, C74). */
    readonly text: string;
}

export interface CreateHousePlan {
    /** The ring handed to `generateHouseFromBoundary` as `opts.footprint`. OPEN, ≥3 vertices. */
    readonly footprint: readonly HousePlanVertex[];
    /** The level the shell is drawn on — the ACTIVE level, which is what the executor uses. */
    readonly groundLevelId: string;
    /** The envelope the footprint came from, so the user can be told WHICH one built the house. */
    readonly sourceEnvelopeId: string;
    readonly sourceEnvelopeName: string | null;
    readonly footprintAreaM2: number;
    /** ≥1. One per LEVEL envelope, so a two-envelope site builds two storeys. */
    readonly storeyCount: number;
    /** Metres. From the ground envelope's own `height` — the volume the user drew. */
    readonly floorToFloorM: number;
    readonly roofKind: 'flat' | 'gable' | 'hip';
    /** ⛔ Measured in the executor's source, not read off the founder's sentence. */
    readonly willCreate: readonly string[];
    /** ⛔ The difference between what the button is called and what the engine does. */
    readonly willNotCreate: readonly string[];
    /** Riders that are TRUE but not refusals — the ADVISORY half of C83. */
    readonly advisories: readonly string[];
}

export type CreateHouseOutcome =
    | { readonly ok: true; readonly plan: CreateHousePlan }
    | { readonly ok: false; readonly refusal: CreateHouseRefusal };

/** Measured in `HouseLayoutExecutor.ts` — see the header. Exported so the renderer cannot drift. */
export const HOUSE_WILL_CREATE: readonly string[] = Object.freeze([
    'storey levels (and a dedicated roof level)',
    'exterior shell walls, one per footprint edge',
    'interior partition walls from the generated layout',
    'rooms',
    'floor slabs',
    'a roof',
    'stairs between storeys',
    'floor finishes and ceilings, per storey',
]);

/**
 * ⛔ THE HONEST DIFFERENCE. The founder's §25.8 sentence names columns and beams; the executor
 * dispatches neither (`grep -n "column\|beam"` over its 3,595 lines returns nothing). Printing
 * this beside the button is the difference between a capability and a claim.
 */
export const HOUSE_WILL_NOT_CREATE: readonly string[] = Object.freeze([
    'columns — the house pipeline does not generate a structural frame',
    'beams — same; a frame is a separate engine PRYZM has not built for this path',
]);

const MIN_FOOTPRINT_AREA_M2 = 1;

/** Shoelace area of an OPEN ring on the XZ plane. Absolute, so winding does not decide it. */
function ringAreaM2(ring: readonly HousePlanVertex[]): number {
    if (ring.length < 3) return 0;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twice) / 2;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Decide whether "Create house" may run, and with what. Pure; total; never throws.
 *
 * ⭐ THE ORDER OF THE ARMS IS DELIBERATE. `envelope-store-unreadable` is checked FIRST because it
 * is the only arm that is about PRYZM rather than about the project, and reporting a wiring gap
 * as "you have not drawn an envelope" is [[context-data-honesty-family]]. `already-built` is
 * checked LAST of the blocking arms so its message can name the plate it would have built.
 */
export function planCreateHouse(input: CreateHousePlanInput): CreateHouseOutcome {
    const span = _tracer.startSpan('pryzm.site.planCreateHouse');
    const refuse = (code: CreateHouseRefusalCode, text: string): CreateHouseOutcome => {
        span.setAttribute('pryzm.createHouse.arm', code);
        return { ok: false, refusal: { code, text } };
    };
    try {
        if (input.levelEnvelopes === null) {
            return refuse('envelope-store-unreadable',
                'PRYZM cannot read the space-envelope store in this session, so it does not know what '
                + 'you intend to build. This is a gap in PRYZM\'s wiring — NOT a finding that you have '
                + 'drawn nothing. Nothing has been created.');
        }
        if (input.levelEnvelopes.length === 0) {
            return refuse('no-level-envelope',
                'No level envelope has been drawn on this site, so there is no footprint to build from. '
                + 'Draw a level envelope — or fit one to a target ground-floor area — and "Create house" '
                + 'becomes available.');
        }
        const activeLevelId = input.activeLevelId ?? null;
        if (!activeLevelId) {
            return refuse('no-active-level',
                'There is no active level, and the house pipeline draws its shell on the active one. '
                + 'Open or create a project level first. Nothing has been created.');
        }

        // The GROUND plate is the lowest envelope by `baseOffset`, then by id so two envelopes at
        // the same height resolve deterministically rather than by store iteration order.
        const sorted = [...input.levelEnvelopes].sort((a, b) => (
            a.baseOffset !== b.baseOffset
                ? a.baseOffset - b.baseOffset
                : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        ));
        const ground = sorted[0]!;

        // ⛔ AMBIGUITY IS A REFUSAL, NOT A TIE-BREAK. Two level envelopes at the SAME base with
        // DIFFERENT areas is a design PRYZM cannot read as one house, and silently taking the
        // first would build the wrong one without saying so.
        const rivals = sorted.filter((e) =>
            e.id !== ground.id
            && e.baseOffset === ground.baseOffset
            && Math.abs(e.footprintAreaM2 - ground.footprintAreaM2) > 0.5);
        if (rivals.length > 0) {
            const r = rivals[0]!;
            return refuse('ambiguous-ground-plate',
                `Two level envelopes sit at the same base height (${round1(ground.baseOffset)} m) with `
                + `different footprints — ${round1(ground.footprintAreaM2)} m² and `
                + `${round1(r.footprintAreaM2)} m². PRYZM will not choose between them, because building `
                + 'the wrong one is indistinguishable from building the right one until you look. Delete '
                + 'or move one, then try again.');
        }

        const ring = ground.footprint ?? [];
        const area = ringAreaM2(ring);
        if (ring.length < 3 || area < MIN_FOOTPRINT_AREA_M2) {
            return refuse('degenerate-footprint',
                `The ground envelope's footprint has ${ring.length} vertices and encloses `
                + `${round1(area)} m², which is below the ${MIN_FOOTPRINT_AREA_M2} m² a shell can be `
                + 'drawn from. A ring this small is a defect in the envelope, not a small house.');
        }

        // ⛔ C80 — the decisive refusal. See the header.
        if (input.authoredWallCountOnActiveLevel > 0) {
            return refuse('already-built',
                `The active level already carries ${input.authoredWallCountOnActiveLevel} authored `
                + `wall${input.authoredWallCountOnActiveLevel === 1 ? '' : 's'}, and "Create house" draws a `
                + `NEW ${round1(area)} m² shell rather than adapting an existing one. Running it here would `
                + 'thread a second shell through the model you have already drawn, and PRYZM cannot tell '
                + 'which of the two you meant to keep. Build on an empty level, or delete the existing '
                + 'walls first. Nothing has been created.');
        }

        const storeyCount = Math.max(1, sorted.length);
        const floorToFloorM = ground.height > 0 ? ground.height : 3;

        const advisories: string[] = [];
        if (sorted.length > 1) {
            const heights = new Set(sorted.map((e) => round1(e.height)));
            if (heights.size > 1) {
                advisories.push(
                    `Your ${sorted.length} level envelopes do not all have the same height `
                    + `(${[...heights].join(' m, ')} m). The house is built with ONE floor-to-floor of `
                    + `${round1(floorToFloorM)} m, taken from the ground envelope — the upper storeys will `
                    + 'not match the volumes you drew.');
            }
        }
        if (ground.levelId && ground.levelId !== activeLevelId) {
            advisories.push(
                `The ground envelope is seated on level "${ground.levelId}", but the shell is drawn on the `
                + `ACTIVE level "${activeLevelId}" — that is where the house pipeline builds. If those are `
                + 'different storeys, switch the active level before building.');
        }
        advisories.push(
            'The room envelopes you have drawn are NOT used as the room programme — the house layout is '
            + 'generated from the project brief. Your envelopes are left untouched, so the panel can go '
            + 'on comparing what you intended with what was built.');

        span.setAttribute('pryzm.createHouse.arm', 'ok');
        span.setAttribute('pryzm.createHouse.storeys', storeyCount);
        return {
            ok: true,
            plan: {
                footprint: Object.freeze([...ring]),
                groundLevelId: activeLevelId,
                sourceEnvelopeId: ground.id,
                sourceEnvelopeName: ground.name,
                footprintAreaM2: Math.round(area * 100) / 100,
                storeyCount,
                floorToFloorM,
                roofKind: input.roofKind ?? 'gable',
                willCreate: HOUSE_WILL_CREATE,
                willNotCreate: HOUSE_WILL_NOT_CREATE,
                advisories: Object.freeze(advisories),
            },
        };
    } finally {
        span.end();
    }
}

/**
 * Read level-envelope data out of a raw `spaceEnvelope` store state.
 *
 * ⛔ RETURNS `null` — NEVER `[]` — WHEN THE STORE IS ABSENT OR THROWS. That distinction is the
 * one `planCreateHouse`'s first two arms are built on, and collapsing it here would make the
 * refusal say "you drew nothing" about a store PRYZM never opened.
 *
 * Rooms are skipped by role: a room envelope is not a storey plate.
 */
export function readLevelEnvelopes(
    store: { getState?: () => ReadonlyMap<string, unknown> } | null | undefined,
): readonly LevelEnvelopeDatum[] | null {
    if (!store || typeof store.getState !== 'function') return null;
    let state: ReadonlyMap<string, unknown>;
    try {
        state = store.getState();
    } catch {
        return null;
    }
    const out: LevelEnvelopeDatum[] = [];
    for (const raw of state.values()) {
        if (typeof raw !== 'object' || raw === null) continue;
        const r = raw as Record<string, unknown>;
        if (r.role !== 'level') continue;
        const fp = Array.isArray(r.footprint) ? r.footprint : [];
        const ring: HousePlanVertex[] = [];
        for (const v of fp) {
            if (typeof v !== 'object' || v === null) continue;
            const p = v as Record<string, unknown>;
            if (typeof p.x !== 'number' || typeof p.z !== 'number') continue;
            if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
            ring.push({ x: p.x, z: p.z });
        }
        out.push({
            id: typeof r.id === 'string' ? r.id : '',
            levelId: typeof r.levelId === 'string' ? r.levelId : '',
            name: typeof r.name === 'string' && r.name.trim().length > 0 ? r.name.trim() : null,
            baseOffset: typeof r.baseOffset === 'number' && Number.isFinite(r.baseOffset) ? r.baseOffset : 0,
            height: typeof r.height === 'number' && Number.isFinite(r.height) ? r.height : 0,
            footprint: ring,
            footprintAreaM2:
                typeof r.footprintAreaM2 === 'number' && Number.isFinite(r.footprintAreaM2)
                    ? r.footprintAreaM2
                    : ringAreaM2(ring),
        });
    }
    return out;
}
