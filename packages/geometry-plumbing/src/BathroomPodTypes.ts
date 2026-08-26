// BathroomPod — the PARENT record of a LOD-300 parametric bathroom module.
//
// §FEAT-BATHROOM-POD-COMPOUND (L-11400..L-11412) · C109 · C99 · C84.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S ASK, VERBATIM, BECAUSE §1.1 OF C109 TURNS ON THE WORD "PARAMETRIC"
// ═══════════════════════════════════════════════════════════════════════════════
//   "I WANT YOU TO CREATE LOD 300 TOILET COMPOUNDS - MODULES - PARAMETRIC - MEANS
//    THAT I CAN ADAPT THE MODULE TO THE ROOM DIMENSIONS: SINK (LOD200) + TOILET +
//    SHOWER + PANEL ETC... AS PER THE PHOTO."
//
// ⛔ PARAMETRIC MEANS THE **LAYOUT** ADAPTS. THE FIXTURES DO NOT SCALE.
// A WC is ~700 mm deep in a 1.6 m room and ~700 mm deep in a 4 m room. Sanitaryware
// is manufactured to a small number of real sizes. A module that "adapts to the room"
// by multiplying every footprint by `roomWidth / referenceWidth` produces a 1.4 m-deep
// toilet in a large bathroom and a 400 mm one in a small one, and BOTH ARE
// UNBUILDABLE. That is the scaled-block defect in another costume, and C109 §1.1 is
// the clause that forbids it.
//
// What adapts: which WALL each fixture takes, the ORDER along it, the GAP between
// adjacent fixtures, the ARRANGEMENT (single-wall / L-shaped) — and whether the module
// fits at all. See `BathroomPodAssembly.ts`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠ WHY THIS FILE DECLARES PLAIN TYPES + ONE VALIDATOR AND **NOT** A ZOD SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════
// `LiftCompoundTypes.ts` (the precedent this file otherwise copies) declares a
// `z.object`. It can, because `packages/geometry-lift/package.json` already carries
// `zod`. Measured 2026-08-25: `packages/geometry-plumbing/package.json` does NOT, and
// `ls packages/geometry-plumbing/node_modules/` -> `@pryzm`, `@thatopen` only. So a
// `import { z } from 'zod'` here would either be an UNDECLARED dependency resolved by
// hoisting — which works until the first strict install and then does not — or a
// `package.json` edit plus a lockfile sync, while sibling lanes are committing into
// the same tree (`[[agent-packagejson-breaks-frozen-lockfile]]`).
//
// ⭐ AND THE VALIDATOR IS THE BETTER FIT HERE ANYWAY, NOT MERELY THE CHEAPER ONE.
// C16 CA-18 requires a refusal to NAME THE REASON in a sentence a person reads. A Zod
// issue list has to be translated into one; `validateBathroomPod` returns the sentence
// directly, and BOTH `canExecute` and `execute` call it, so they cannot disagree about
// what a valid pod is — which is the only property the lift's schema was buying.
//
// C109 §12 records the L0 promotion as DEFERRED with its reasons; when it happens, the
// Zod shape is minted in `packages/schemas` (which owns zod) and this validator becomes
// a thin wrapper, not a rival.

/**
 * The kinds of member a pod may contain.
 *
 * ⛔ THERE IS NO `'panel'` MEMBER, AND NONE MAY BE ADDED — C109 R-8.
 * `ShowerGeometry`'s walk-in variants already emit the tray, the gutter, the FRAMELESS
 * GLASS SIDE PANEL AND ITS RETURN, the slim frame, the rain head and the controls as
 * ONE fixture. A separate `panel` record would draw the glass twice — once by the
 * shower's own builder and once by the pod's — which is z-fighting, doubled
 * transmission cost on the WebGL backend, and one id meaning two objects (C84 EI-9).
 * The panel is a PARAMETER of the shower member (`glassSide`), decoded from the variant
 * slug by `walkInGlassSide()`, which already exists.
 */
export type BathroomPodMemberKind = 'shower' | 'wc' | 'basin' | 'bath' | 'accessory';

/**
 * The order Tab descends through a pod's members, and the order the solver lays them
 * out along the primary wall.
 *
 * ⭐ THE ORDER IS NOT ARBITRARY AND C109 §5.3 ARGUES IT:
 *   • the SHOWER takes an END, because it is the deepest member and a walk-in
 *     enclosure wants two walls rather than one;
 *   • the WC sits BETWEEN, because it carries the largest side clearance and putting
 *     it at an end wastes that clearance against a wall;
 *   • the BASIN takes the other END, because it is the shallowest and is the member an
 *     architect most often wants beside the door.
 * `bath` occupies the shower's slot (they are alternatives, not neighbours) and
 * accessories trail, because they are wall-mounted and consume no floor run.
 */
export const BATHROOM_POD_MEMBER_ORDER: readonly BathroomPodMemberKind[] = Object.freeze([
    'shower',
    'bath',
    'wc',
    'basin',
    'accessory',
]);

/**
 * How the pod arranged itself. **DERIVED, never stored** (C109 §4): storing it lets an
 * architect widen the room and leave the arrangement stale, with nothing complaining.
 * It is re-derivable because `solveBathroomPodLayout` is deterministic, which is pinned
 * by a test rather than asserted here.
 */
export type BathroomPodArrangement = 'single-wall' | 'l-shaped';

/** Which end of the primary wall the shower (or bath) takes. */
export type BathroomPodHandedness = 'left' | 'right';

/**
 * The room envelope a pod was fitted to.
 *
 * ⛔ THIS IS NOT A ROOM RECORD AND THE POD DOES NOT OWN ONE (C109 §1.2). It is the
 * QUESTION the solver was asked, stored so the answer can be re-derived and so a pod
 * does not change shape when a wall it was never attached to moves.
 *
 * Local axes: **+X** runs along the room's width; local **−Z** is the PRIMARY WALL —
 * the wet wall, where drainage is assumed. `rotation` is the plan angle about world Y,
 * in radians, that carries local into world.
 */
export interface BathroomPodRoom {
    /** Clear internal width, metres, along local +X. */
    readonly clearWidth: number;
    /** Clear internal depth, metres, along local +Z from the primary wall. */
    readonly clearDepth: number;
    /** The room's local origin in world coordinates — the primary wall's LEFT end. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    /** Plan angle, radians about world Y. Local −Z faces the primary wall. */
    readonly rotation: number;
}

/**
 * One placed member of a pod, as the solver resolves it.
 *
 * The `position` is the midpoint of the member's **WALL-CONTACT EDGE** in world XZ at
 * the level datum, and `rotationY` is its plan angle — the two fields a
 * `PlumbingFixtureData` needs. ⛔ **THE ANCHOR IS DECLARED ONCE, IN
 * `PlumbingFixtureFrame.ts`**, and this field obeys it: origin at the contact edge,
 * local +Z into the room, body over z ∈ [0, length].
 *
 * ⚠ THIS DOCSTRING SAID "FOOTPRINT CENTRE" AND THE SOLVER EMITTED ONE (§PLUMBFRAME,
 * founder 2026-08-26 · L-11490). Every consumer of a `PlumbingFixtureData` — the mesh,
 * the plan symbol, the elevation symbol — reads it as the CONTACT EDGE, so every pod
 * member landed half its own depth further into the room than the solver's own
 * clearance arithmetic assumed. It is the founder's straddling shower plate, at pod
 * scale.
 *
 * The footprint is carried so a consumer (a preview, a plan symbol, an audit) can draw
 * the member without re-resolving the family's tables; ⛔ it is NEVER the source of
 * those numbers, which is `resolveFixtureFootprint` (C109 R-6).
 */
export interface BathroomPodMember {
    /** Pre-minted by the tool (CA-2). Becomes the `plumbing` fixture record's id. */
    readonly id: string;
    readonly kind: BathroomPodMemberKind;
    /**
     * The `PlumbingFixtureType` this member becomes. A pod member is ALWAYS a real
     * record in the plumbing family — C109 §2 / R-2 — never a pod-private object.
     */
    readonly fixtureType: 'toilet' | 'sink' | 'shower' | 'bath' | 'accessory';
    /** Sub-family slug, when the fixture family has one (toilet / shower / accessory). */
    readonly variant?: string;
    /** Footprint centre, world coordinates, at the level datum. */
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    /** Plan angle, radians about world Y. The fixture's BACK faces its wall. */
    readonly rotationY: number;
    /** The footprint the solver placed, metres. Resolved, never invented. */
    readonly footprint: { readonly width: number; readonly length: number; readonly height: number };
    /** Which wall this member took — for the inspector and for the plan hint. */
    readonly wall: 'primary' | 'left-return' | 'right-return';
}

/**
 * The pod record.
 *
 * ⭐ `members` IS THE MEMBER LIST, AND `childrenIds` IS DERIVED FROM IT.
 * C109 §4 as first drafted ruled `childrenIds` STORED and the member placements stored
 * on the member records. Building it exposed that the two would then be TWO STATEMENTS
 * OF ONE FACT on one record — a flat id array beside an array of the same members —
 * which is the drift class §4 exists to forbid. `bathroomPodChildIds()` derives the
 * flat list; C109 §4 is amended in place to match, with the reason recorded there.
 *
 * ⚠ WHAT IS **NOT** HERE, DELIBERATELY: any sanitaryware dimension. C109 R-6 —
 * `TOILET_FOOTPRINTS` / `SHOWER_FOOTPRINTS` / `ACCESSORY_FOOTPRINTS` and
 * `resolveFixtureFootprint`'s fallbacks are the ONLY places one may appear, so the plan
 * symbol and the mesh cannot disagree.
 */
export interface BathroomPod {
    /** `bathroomPod_<ULID>` — minted ONCE by the tool (CA-2: execute() re-runs on redo). */
    readonly id: string;
    readonly type: 'bathroomPod';
    readonly levelId: string;
    readonly room: BathroomPodRoom;
    readonly handedness: BathroomPodHandedness;
    /** The resolved members, in `BATHROOM_POD_MEMBER_ORDER`. */
    readonly members: readonly BathroomPodMember[];
    /** Re-derivable from the room + member set; stored for the inspector, not read back. */
    readonly arrangement: BathroomPodArrangement;
    readonly mark?: string;
    readonly materialId?: string;
}

/** Store shape: `{ [podId]: BathroomPod }`. */
export type BathroomPodsState = Readonly<Record<string, BathroomPod>>;

/**
 * The pod's children, as a flat id list — the C109 §3.2 / R-5 read model.
 *
 * ⛔ IT COMES FROM THE RECORD, NEVER FROM `root.traverse()`. A pod's members are N
 * separate `plumbing` records, each built by `PlumbingFragmentBuilder` as its own
 * fragment — and C99 measured that after any project LOAD the plugin DTO store is EMPTY
 * while the legacy store holds N. A traverse-discovered member list therefore silently
 * drops every member whose fragment has not been built, which for a freshly-loaded
 * project is the COMMON case, not the corner one.
 */
export function bathroomPodChildIds(pod: BathroomPod): readonly string[] {
    return pod.members.map((m) => m.id);
}

/** The one member of a given kind, or `undefined` — what "select the WC alone" resolves through. */
export function bathroomPodMemberOfKind(
    pod: BathroomPod,
    kind: BathroomPodMemberKind,
): BathroomPodMember | undefined {
    return pod.members.find((m) => m.kind === kind);
}

/** A pod validation outcome. The failure arm carries a SENTENCE, not an issue list. */
export type BathroomPodValidation =
    | { readonly ok: true; readonly value: BathroomPod }
    | { readonly ok: false; readonly reason: string };

const MEMBER_KINDS: ReadonlySet<string> = new Set(BATHROOM_POD_MEMBER_ORDER);
const FIXTURE_TYPES: ReadonlySet<string> = new Set(['toilet', 'sink', 'shower', 'bath', 'accessory']);

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isVec3(v: unknown): v is { x: number; y: number; z: number } {
    if (typeof v !== 'object' || v === null) return false;
    const o = v as Record<string, unknown>;
    return isFiniteNumber(o['x']) && isFiniteNumber(o['y']) && isFiniteNumber(o['z']);
}

/**
 * THE one definition of a valid pod.
 *
 * ⭐ CALLED BY BOTH `canExecute` AND `execute`, so they cannot disagree — the property
 * `LiftCompoundSchema` buys for the lift, bought here without the dependency. Every
 * failure sentence names the field AND what was wrong with it (C16 CA-18).
 */
export function validateBathroomPod(v: unknown): BathroomPodValidation {
    if (typeof v !== 'object' || v === null) return { ok: false, reason: 'a bathroom pod must be an object' };
    const o = v as Record<string, unknown>;

    if (typeof o['id'] !== 'string' || o['id'].length === 0) {
        return { ok: false, reason: 'id must be a non-empty string' };
    }
    if (o['type'] !== 'bathroomPod') {
        return { ok: false, reason: `type must be "bathroomPod", got ${JSON.stringify(o['type'])}` };
    }
    if (typeof o['levelId'] !== 'string' || o['levelId'].length === 0) {
        return { ok: false, reason: 'levelId must be a non-empty string' };
    }
    if (o['handedness'] !== 'left' && o['handedness'] !== 'right') {
        return { ok: false, reason: `handedness must be "left" or "right", got ${JSON.stringify(o['handedness'])}` };
    }
    if (o['arrangement'] !== 'single-wall' && o['arrangement'] !== 'l-shaped') {
        return {
            ok: false,
            reason: `arrangement must be "single-wall" or "l-shaped", got ${JSON.stringify(o['arrangement'])}`,
        };
    }

    const room = o['room'];
    if (typeof room !== 'object' || room === null) return { ok: false, reason: 'room is required' };
    const r = room as Record<string, unknown>;
    if (!isFiniteNumber(r['clearWidth']) || r['clearWidth'] <= 0) {
        return { ok: false, reason: 'room.clearWidth must be a positive, finite number of metres' };
    }
    if (!isFiniteNumber(r['clearDepth']) || r['clearDepth'] <= 0) {
        return { ok: false, reason: 'room.clearDepth must be a positive, finite number of metres' };
    }
    if (!isVec3(r['origin'])) return { ok: false, reason: 'room.origin must be a finite {x,y,z}' };
    if (!isFiniteNumber(r['rotation'])) return { ok: false, reason: 'room.rotation must be a finite number of radians' };

    const members = o['members'];
    if (!Array.isArray(members) || members.length === 0) {
        // ⛔ An empty pod is not a pod. C109 R-3 forbids dropping a declared member to
        // make the rest fit, so a pod that ended up with none is a solver defect
        // reaching the store, and it must be refused here rather than stored.
        return { ok: false, reason: 'a bathroom pod must have at least one member' };
    }
    const seenIds = new Set<string>();
    const seenKinds = new Set<string>();
    for (const raw of members) {
        if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'every member must be an object' };
        const m = raw as Record<string, unknown>;
        if (typeof m['id'] !== 'string' || m['id'].length === 0) {
            return { ok: false, reason: 'every member must have a non-empty id' };
        }
        if (seenIds.has(m['id'])) {
            return { ok: false, reason: `member id listed twice: ${m['id']}` };
        }
        seenIds.add(m['id']);
        if (typeof m['kind'] !== 'string' || !MEMBER_KINDS.has(m['kind'])) {
            return { ok: false, reason: `member ${m['id']} has an unknown kind ${JSON.stringify(m['kind'])}` };
        }
        // ⛔ TWO WCs IN ONE POD WOULD BE TWO RECORDS AT THE SAME PLACE, the second
        // invisible — the duplicate-storey defect `CreateLift.canExecute` refuses, one
        // family over. `accessory` is exempt: several are the normal case.
        if (m['kind'] !== 'accessory') {
            if (seenKinds.has(m['kind'] as string)) {
                return { ok: false, reason: `a pod may carry only one ${m['kind']}; it was listed twice` };
            }
            seenKinds.add(m['kind'] as string);
        }
        if (typeof m['fixtureType'] !== 'string' || !FIXTURE_TYPES.has(m['fixtureType'])) {
            return {
                ok: false,
                reason: `member ${m['id']} has an unknown fixtureType ${JSON.stringify(m['fixtureType'])}`,
            };
        }
        if (!isVec3(m['position'])) return { ok: false, reason: `member ${m['id']} has a non-finite position` };
        if (!isFiniteNumber(m['rotationY'])) {
            return { ok: false, reason: `member ${m['id']} has a non-finite rotationY` };
        }
        const fp = m['footprint'];
        if (typeof fp !== 'object' || fp === null) {
            return { ok: false, reason: `member ${m['id']} has no footprint` };
        }
        const f = fp as Record<string, unknown>;
        if (!isFiniteNumber(f['width']) || f['width'] <= 0
            || !isFiniteNumber(f['length']) || f['length'] <= 0
            || !isFiniteNumber(f['height']) || f['height'] <= 0) {
            return { ok: false, reason: `member ${m['id']} has a non-positive footprint dimension` };
        }
        if (m['wall'] !== 'primary' && m['wall'] !== 'left-return' && m['wall'] !== 'right-return') {
            return { ok: false, reason: `member ${m['id']} names an unknown wall ${JSON.stringify(m['wall'])}` };
        }
    }

    return { ok: true, value: v as BathroomPod };
}
