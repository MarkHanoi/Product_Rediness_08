// ADR-0383 S7 (lane MP-UI, 2026-09-09) — THE READER: which massing GROUPS are in this project, what
// each one is made of, and where two of them collide.
//
// ADR-0383 D1 / D4 · C114 §3a · C84 EI-9 · C73 §C73-POLY-BOOLEAN / GE-05 · C58 §1.4 · L-616 ·
// §CONTEXT-DATA-HONESTY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS IS — AND THE FOUR THINGS IT DELIBERATELY DOES NOT RE-IMPLEMENT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADR-0383 D1 gives `SpaceEnvelope` a third identity axis, `group: { id, label } | null`, and names
// the reader that reports on it. This is that reader, plus the overlap ADVISORY of D4. It is PURE
// over its inputs and never throws.
//
// [[same-rule-two-implementations]] is this repo's dominant defect (seven recurrences), so every
// rule this file needs and does not own is CALLED, not copied:
//   1. *"what counts as a level envelope"* → `readLevelEnvelopes` (`levelEnvelopeSupersession.ts`),
//      the same read the authoring control and the adopt card already share. ⛔ No second
//      `role === 'level'` filter and no second provenance projection.
//   2. *"what is a storey called and how high is it"* → `AdoptLevelCandidate`, produced by
//      `readLevelCandidates`. ⛔ No second level reader.
//   3. *"how do two rings intersect"* → the kernel's `intersectPolygons2D` (GE-05, oracle-pinned).
//      The kernel's own index records that this tree once carried ≥5 rival Sutherland–Hodgman
//      clippers; this is not the sixth.
//   4. *"how big is a ring"* → the kernel's ONE shoelace, `polygonSignedAreaOrdinates` (C73).
//
// ⚠ THE ONE PROJECTION THIS FILE DOES OWN, AND WHY. `ExistingLevelEnvelope` carries id / levelId /
// name / footprintAreaM2 / provenance — it does not carry `group` or the RING, because the
// supersession decision needs neither. So this file makes a SECOND PROJECTION over the SAME
// `getState()` map (read exactly once, then handed to `readLevelEnvelopes` through a synthetic
// handle, so the two projections cannot see different vintages of the store). ⛔ That is a
// projection of extra FIELDS, never a second answer to "which records are level envelopes" — the
// row set comes from `readLevelEnvelopes` and ids not in it are dropped.
//
// ⭐ WHEN LANE MP-SPINE's S1/S2 LAND `group` ON `ExistingLevelEnvelope`, the `extras` pass here
// collapses into the row read and this note comes out. It is written as a join rather than as an
// edit to `levelEnvelopeSupersession.ts` because that file belongs to the spine lane this session;
// the join is the small, reversible half.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AREA VOCABULARY — `intendedAreaChannel.ts` IS THE AUTHORITY AND ITS RULE IS OBEYED VERBATIM
// ══════════════════════════════════════════════════════════════════════════════════════════════
// C114 §3a: *"three questions, three authorities, never summed into one number"* — BUILT is
// `measureAuthoredDesign`, INTENDED is the space-envelope family's `footprintAreaM2` × membership,
// PERMITTED is the `BuildableEnvelope`. The schema's own rider on `footprintAreaM2` says *"THIS IS
// NOT A GROSS FLOOR AREA AND MUST NEVER BE SUMMED INTO ONE."*
//
// So a group's total is `totalIntendedM2` — the SAME name and the SAME arithmetic
// `collectIntendedAreas` already publishes for the whole project, split by group instead of by
// storey. ⛔ It is never called GFA, never mixed with room areas, and `null` when the group has no
// readable area — because none declared is not zero declared (C58 §1.4 / L-616).
//
// ⭐ AND THE SPLIT IS CHECKED AGAINST THE WHOLE. [[same-rule-two-implementations]]'s own
// prescription is *"add a cross-model agreement check"*: `massingGroupRoster.spec.ts` asserts that
// the group totals sum to `collectIntendedAreas(...).totalIntendedM2` over the same store. Two
// readers of one quantity are only safe when something fails when they disagree.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ OVERLAP IS AN ADVISORY WITH BOTH NUMBERS — NEVER A REFUSAL (ADR-0383 D4)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   > *"⛔ It is not a refusal. C114 §12's decisive row: 'Refusing an architect's edit on the
//   >  authority of a study PRYZM computed would tell a professional they may not draw something
//   >  they may well be entitled to build.' At massing stage an architect deliberately overlaps
//   >  volumes while studying options."*
//
// Two rules follow, and both are enforced by the shape of the result rather than by a caller
// remembering them:
//   · SAME STOREY ONLY. Two profiles overlapping on DIFFERENT storeys is *not a finding at all* —
//     that is a podium with towers on it, and flagging it would train the user to ignore the
//     warning. There is no arm of this result that can carry one.
//   · A KERNEL REFUSAL IS NOT "NO OVERLAP". `intersectPolygons2D` can return `ok: false`
//     (unresolved topology on a self-crossing ring). That lands in `unmeasurable`, with its reason,
//     NEVER in `overlaps` and never silently as zero — a failure and an emptiness sharing one value
//     is this repo's most-repeated defect (§CONTEXT-DATA-HONESTY).
//
// PURE: no DOM, no THREE, no bus, no clock, no RNG, no module state. Never throws. Deterministic.

import { trace } from '@opentelemetry/api';
import { intersectPolygons2D, polygonSignedAreaOrdinates, type Pt2 } from '@pryzm/geometry-kernel';
import type { AdoptLevelCandidate } from './adoptProposalAsEnvelope';
import type { SpaceEnvelopeReadHandle } from './intendedAreaChannel';
import {
    readLevelEnvelopes,
    type ExistingLevelEnvelope,
} from './levelEnvelopeSupersession';

const _tracer = trace.getTracer('pryzm.site.massingGroupRoster');

/**
 * The `group` value ADR-0383 D1 puts on `SpaceEnvelope`.
 *
 * ⚠ DECLARED HERE ONLY UNTIL LANE MP-SPINE's S1 LANDS IT ON THE SCHEMA, and it is structurally
 * identical by intent, not by coincidence — `{ id, label }`, D1's exact words. ⛔ It is NOT a rival
 * definition: this file reads records off an `unknown` store map and needs a shape to validate
 * against whether or not the schema type is importable yet. When `@pryzm/schemas` exports it, this
 * alias becomes an import and nothing else here changes.
 */
export interface MassingGroupRef {
    readonly id: string;
    readonly label: string;
}

/** The ungrouped bucket's label. ADR-0383 D3: ungrouped is its own bucket, not a missing group. */
export const UNGROUPED_MASSING_LABEL = 'Ungrouped envelopes';

/** One storey of one group — a `role: 'level'` envelope, with the storey it is seated on. */
export interface MassingGroupStorey {
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    /**
     * From the BIM level store when `levelId` resolves; `null` when the envelope names a storey the
     * store does not have. ⛔ SHOWN, NEVER DROPPED — a dangling `levelId` is itself a fact, the same
     * decision `IntendedLevelArea.name` records.
     */
    readonly levelName: string | null;
    readonly elevationM: number | null;
    /** The envelope's own authored name, trimmed; `null` when it carries none. Never invented. */
    readonly envelopeName: string | null;
    /** `SpaceEnvelope.footprintAreaM2`. ⛔ A FOOTPRINT, not a floor area — see the header. */
    readonly footprintAreaM2: number | null;
    /** `SpaceEnvelope.height`, metres. `null` when unreadable. */
    readonly heightM: number | null;
    /**
     * `SpaceEnvelope.baseOffset` — metres above the **PROJECT datum**, an ABSOLUTE seat.
     * ⛔ §BASE-OFFSET-IS-ABSOLUTE (L-13286): adding `elevationM` to this counts the storey
     * elevation twice and produced a false "your building is too tall" refusal.
     */
    readonly baseOffsetM: number | null;
    /** The footprint ring in scene-XZ metres, or `null` when the record carries no usable one. */
    readonly ring: readonly Readonly<{ x: number; z: number }>[] | null;
}

/** One massing group — a building — as the panel and the scene both need it. */
export interface MassingGroup {
    /** `group.id`, or `null` for the UNGROUPED bucket (ADR-0383 D3). */
    readonly groupId: string | null;
    /**
     * How the group reads. Taken from the LOWEST-SEATED member (ADR-0383 D1 point 3), never voted
     * on and never merged.
     */
    readonly label: string;
    /**
     * ⭐ ADR-0383 D1 point 3 — *"the READER refuses to paper over a disagreement"*. `null` when
     * every member spells the label the same way; otherwise EVERY distinct spelling seen, lowest
     * member first. A drift becomes visible, not invisible (§CONTEXT-DATA-HONESTY, L-581/L-616).
     */
    readonly labelDisagreement: readonly string[] | null;
    /** The group's storeys, lowest first. Unresolvable elevations sort last, in `levelId` order. */
    readonly storeys: readonly MassingGroupStorey[];
    /** `storeys.length`. Named because the panel's storey control reads it and a test pins it. */
    readonly storeyCount: number;
    /**
     * The LOWEST-seated storey's footprint area, m² — the building's plate on the ground.
     * `null` when that storey carries no readable area. ⛔ Not an average and not the largest.
     */
    readonly footprintAreaM2: number | null;
    /**
     * The group's INTENDED area: the sum of its level envelopes' `footprintAreaM2`.
     * `null` when the group has NO readable area at all — none declared is not zero declared.
     * ⛔ NOT A GROSS FLOOR AREA — see the header's area-vocabulary section.
     */
    readonly totalIntendedM2: number | null;
    /**
     * `true` when at least one storey had NO readable area while at least one did, so
     * `totalIntendedM2` is a sum over SOME of the building. ⛔ A partial total rendered as a total
     * is the §L-616 overstatement; the panel prints the rider.
     */
    readonly totalIsPartial: boolean;
}

/** Reading the store can FAIL, and a failure is not an empty project. */
export type MassingGroupRosterResult =
    | {
        readonly readable: true;
        /** Every group, ungrouped bucket LAST. Groups ordered by label, case-insensitively. */
        readonly groups: readonly MassingGroup[];
        /** Level envelopes seen in total, across every group. */
        readonly memberCount: number;
    }
    | {
        readonly readable: false;
        readonly reason: 'no-store' | 'store-threw';
        readonly text: string;
    };

const NO_STORE_TEXT =
    'This runtime exposes no space-envelope store, so PRYZM cannot see which massing groups exist. '
    + 'This is a gap in PRYZM\'s wiring — NOT a finding that this parcel holds no buildings.';
const STORE_THREW_TEXT =
    'Reading the space-envelope store failed, so PRYZM cannot list the massing groups. This is a '
    + 'failure to read — NOT a finding that this parcel holds no buildings.';

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Read `group` off a raw store record. `null` ⇒ ungrouped, which is every envelope written before
 * ADR-0383 (D3: back-compatibility falls out by construction).
 *
 * ⛔ A `group` WITH A BLANK ID READS AS UNGROUPED, not as a group called "". A group whose id
 * matches nothing would render as a building the user cannot select — the same defect
 * `setMassingGroupSelection` refuses at the other end of the channel.
 */
export function readMassingGroupRef(raw: unknown): MassingGroupRef | null {
    if (!isRec(raw)) return null;
    const g = raw.group;
    if (!isRec(g)) return null;
    const id = typeof g.id === 'string' ? g.id.trim() : '';
    if (id.length === 0) return null;
    const labelRaw = typeof g.label === 'string' ? g.label.trim() : '';
    return { id, label: labelRaw.length > 0 ? labelRaw : id };
}

/** The extra fields the roster needs and `ExistingLevelEnvelope` does not carry. See the header. */
interface MemberExtras {
    readonly group: MassingGroupRef | null;
    readonly heightM: number | null;
    readonly baseOffsetM: number | null;
    readonly ring: readonly Readonly<{ x: number; z: number }>[] | null;
}

/** Project the ring off a raw record. `SpaceEnvelope.footprint` is `Vec3[]` with `y === 0`. */
function readRing(raw: Record<string, unknown>): readonly Readonly<{ x: number; z: number }>[] | null {
    const fp = raw.footprint;
    if (!Array.isArray(fp) || fp.length < 3) return null;
    const out: { x: number; z: number }[] = [];
    for (const p of fp) {
        if (!isRec(p)) return null;
        const x = finite(p.x);
        const z = finite(p.z);
        if (x === null || z === null) return null;
        out.push({ x, z });
    }
    return Object.freeze(out);
}

/**
 * Every massing group in the store, with its storeys and its areas.
 *
 * @param store  `runtime.stores.spaceEnvelope`, or `null`/`undefined` when the runtime has none
 * @param levels the BIM level records, as `readLevelCandidates` returned them — for names and
 *               elevations only. An empty array is legitimate: it means the storeys are unnamed
 *               here, never that the envelopes do not exist.
 */
export function readMassingGroups(
    store: SpaceEnvelopeReadHandle | null | undefined,
    levels: readonly AdoptLevelCandidate[] = [],
): MassingGroupRosterResult {
    const span = _tracer.startSpan('pryzm.site.readMassingGroups');
    try {
        if (!store || typeof store.getState !== 'function') {
            span.setAttribute('pryzm.massingGroup.read', 'no-store');
            return { readable: false, reason: 'no-store', text: NO_STORE_TEXT };
        }
        let state: ReadonlyMap<string, unknown>;
        try {
            state = store.getState();
        } catch {
            span.setAttribute('pryzm.massingGroup.read', 'store-threw');
            return { readable: false, reason: 'store-threw', text: STORE_THREW_TEXT };
        }

        // ⭐ ONE `getState()`, TWO PROJECTIONS. The canonical rows come from the shared reader,
        // handed the map already in hand so the row set and the extras cannot see different
        // vintages of the store.
        const base = readLevelEnvelopes({ getState: () => state });
        if (!base.readable) {
            // Unreachable in practice (the handle above is valid), but a two-armed result whose
            // second arm is dropped is how a failure becomes an emptiness.
            span.setAttribute('pryzm.massingGroup.read', base.reason);
            return { readable: false, reason: base.reason, text: base.text };
        }

        const extras = new Map<string, MemberExtras>();
        for (const raw of state.values()) {
            if (!isRec(raw)) continue;
            const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
            if (id === null) continue;
            extras.set(id, {
                group: readMassingGroupRef(raw),
                heightM: finite(raw.height),
                baseOffsetM: finite(raw.baseOffset),
                ring: readRing(raw),
            });
        }

        const levelById = new Map<string, AdoptLevelCandidate>();
        for (const l of levels) if (l && typeof l.id === 'string' && l.id.length > 0) levelById.set(l.id, l);

        /** Bucketed by `group.id`, with `''` standing for the ungrouped bucket internally only. */
        const buckets = new Map<string, { ref: MassingGroupRef | null; rows: MassingGroupStorey[]; labels: string[] }>();

        for (const row of base.rows) {
            const ex = extras.get(row.id);
            const group = ex?.group ?? null;
            const key = group === null ? '' : group.id;
            let bucket = buckets.get(key);
            if (bucket === undefined) {
                bucket = { ref: group, rows: [], labels: [] };
                buckets.set(key, bucket);
            }
            const level = levelById.get(row.levelId) ?? null;
            bucket.rows.push(Object.freeze({
                spaceEnvelopeId: row.id,
                levelId: row.levelId,
                levelName: level?.name ?? null,
                elevationM: level === null ? null : level.elevation,
                envelopeName: row.name,
                footprintAreaM2: row.footprintAreaM2,
                heightM: ex?.heightM ?? null,
                baseOffsetM: ex?.baseOffsetM ?? null,
                ring: ex?.ring ?? null,
            }));
            if (group !== null) bucket.labels.push(group.label);
        }

        const groups: MassingGroup[] = [];
        for (const [key, bucket] of buckets) {
            // Lowest first. An unresolvable elevation sorts LAST rather than as 0 — a storey PRYZM
            // cannot place must not be drawn at the bottom of the stack as though it were the plate.
            const storeys = [...bucket.rows].sort((a, b) => {
                const ae = a.elevationM;
                const be = b.elevationM;
                if (ae === null && be === null) return a.levelId.localeCompare(b.levelId);
                if (ae === null) return 1;
                if (be === null) return -1;
                if (ae !== be) return ae - be;
                return a.levelId.localeCompare(b.levelId);
            });

            let sum = 0;
            let withArea = 0;
            for (const s of storeys) {
                if (s.footprintAreaM2 !== null) { sum += s.footprintAreaM2; withArea += 1; }
            }
            const totalIntendedM2 = withArea === 0 ? null : sum;

            // ADR-0383 D1 point 3 — the label comes from the LOWEST-SEATED member, and every other
            // spelling is REPORTED rather than discarded.
            const lowestId = storeys[0]?.spaceEnvelopeId ?? null;
            const lowestLabel = lowestId === null ? null : (extras.get(lowestId)?.group?.label ?? null);
            const distinct: string[] = [];
            for (const l of bucket.labels) if (!distinct.includes(l)) distinct.push(l);
            const label = key === ''
                ? UNGROUPED_MASSING_LABEL
                : (lowestLabel ?? bucket.ref?.label ?? key);
            if (key !== '' && lowestLabel !== null) {
                // Put the authoritative spelling first, so a reader of the disagreement can see
                // which one the roster is actually using.
                const i = distinct.indexOf(lowestLabel);
                if (i > 0) { distinct.splice(i, 1); distinct.unshift(lowestLabel); }
            }

            groups.push(Object.freeze({
                groupId: key === '' ? null : key,
                label,
                labelDisagreement: distinct.length > 1 ? Object.freeze(distinct) : null,
                storeys: Object.freeze(storeys),
                storeyCount: storeys.length,
                footprintAreaM2: storeys[0]?.footprintAreaM2 ?? null,
                totalIntendedM2,
                totalIsPartial: withArea > 0 && withArea < storeys.length,
            }));
        }

        // Named groups first, by label; the ungrouped bucket LAST — it is the residue, not a peer.
        groups.sort((a, b) => {
            if ((a.groupId === null) !== (b.groupId === null)) return a.groupId === null ? 1 : -1;
            const c = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
            return c !== 0 ? c : String(a.groupId).localeCompare(String(b.groupId));
        });

        span.setAttribute('pryzm.massingGroup.groups', groups.length);
        span.setAttribute('pryzm.massingGroup.members', base.rows.length);
        return { readable: true, groups: Object.freeze(groups), memberCount: base.rows.length };
    } finally {
        span.end();
    }
}

/**
 * Which group holds this envelope? For S8's *click-selects-group*: a surface picks an envelope id
 * and needs the group to select.
 *
 * ⭐ IT TAKES THE ROSTER, NOT THE STORE, so the surface's answer and the panel's roster are the
 * same read (C84 EI-9). `null` ⇒ the id is not a level envelope in this roster, which includes the
 * case of a ROOM envelope being clicked — a room belongs to a level, not to a group.
 */
export function resolveGroupOfEnvelope(
    roster: MassingGroupRosterResult,
    spaceEnvelopeId: string,
): MassingGroup | null {
    if (!roster.readable) return null;
    for (const g of roster.groups) {
        for (const s of g.storeys) if (s.spaceEnvelopeId === spaceEnvelopeId) return g;
    }
    return null;
}

/** One measured collision between two groups on ONE storey. Both numbers, always. */
export interface MassingGroupOverlap {
    readonly levelId: string;
    /** `null` when the storey is not in the level store — shown as the id, never invented. */
    readonly levelName: string | null;
    readonly aLabel: string;
    readonly bLabel: string;
    readonly aGroupId: string | null;
    readonly bGroupId: string | null;
    /** ⭐ MEASURED by the kernel's `intersectPolygons2D`, never estimated (ADR-0383 D4). */
    readonly overlapAreaM2: number;
    /** BOTH numbers — the two footprints the overlap is a fraction of. */
    readonly aAreaM2: number;
    readonly bAreaM2: number;
    /** The advisory in the user's words. ⛔ Advisory voice — never a refusal. */
    readonly sentence: string;
}

/** A pair PRYZM could not measure. ⛔ NOT the same value as "they do not overlap". */
export interface MassingGroupOverlapGap {
    readonly levelId: string;
    readonly aLabel: string;
    readonly bLabel: string;
    /** `no-ring` — a record carries no usable footprint; `kernel-refused` — the boolean refused. */
    readonly reason: 'no-ring' | 'kernel-refused';
    readonly text: string;
}

export interface MassingGroupOverlapScan {
    readonly overlaps: readonly MassingGroupOverlap[];
    readonly unmeasurable: readonly MassingGroupOverlapGap[];
    /** How many same-storey pairs were examined. `0` ⇒ there was nothing that COULD overlap. */
    readonly pairsExamined: number;
}

/** Below this a "collision" is two rings sharing an edge, not two buildings in each other. */
const OVERLAP_FLOOR_M2 = 0.5;

const toPt2 = (ring: readonly Readonly<{ x: number; z: number }>[]): Pt2[] =>
    ring.map((p) => [p.x, p.z] as Pt2);

/** |Σ signed loop areas| through the kernel's ONE shoelace (C73). Never a second area routine. */
function loopsAreaM2(loops: readonly (readonly Pt2[])[]): number {
    let total = 0;
    for (const loop of loops) {
        if (loop.length < 3) continue;
        total += polygonSignedAreaOrdinates(loop.length, (i) => loop[i]![0], (i) => loop[i]![1]);
    }
    return Math.abs(total);
}

/**
 * ADR-0383 D4 — where two GROUPS occupy the same ground on the SAME storey.
 *
 * ⛔ ADVISORY, NEVER A REFUSAL, and nothing in this result can be read as one: there is no `ok`
 * field and no `blocked` arm. At massing stage an architect deliberately overlaps volumes while
 * studying options, and C114 §12 forbids refusing an architect's edit on the authority of a study.
 *
 * ⛔ DIFFERENT STOREYS ARE NOT A FINDING. A podium with towers on it is a normal master-planning
 * scheme; flagging it would train the user to ignore the warning.
 *
 * ⛔ WITHIN one group, two envelopes on one storey are not examined here — that is the
 * supersession rule's question (`resolveLevelEnvelopeSupersession`), asked at create time, and
 * answering it a second time here would be two verdicts on one state.
 */
export function findMassingGroupOverlaps(roster: MassingGroupRosterResult): MassingGroupOverlapScan {
    const span = _tracer.startSpan('pryzm.site.findMassingGroupOverlaps');
    try {
        const overlaps: MassingGroupOverlap[] = [];
        const unmeasurable: MassingGroupOverlapGap[] = [];
        let pairsExamined = 0;
        if (!roster.readable || roster.groups.length < 2) {
            return { overlaps: [], unmeasurable: [], pairsExamined: 0 };
        }
        const groups = roster.groups;
        for (let i = 0; i < groups.length; i += 1) {
            for (let j = i + 1; j < groups.length; j += 1) {
                const a = groups[i]!;
                const b = groups[j]!;
                for (const sa of a.storeys) {
                    for (const sb of b.storeys) {
                        if (sa.levelId !== sb.levelId) continue;  // ⛔ same storey only
                        pairsExamined += 1;
                        if (sa.ring === null || sb.ring === null) {
                            unmeasurable.push(Object.freeze({
                                levelId: sa.levelId,
                                aLabel: a.label,
                                bLabel: b.label,
                                reason: 'no-ring' as const,
                                text:
                                    `PRYZM could not measure whether ${a.label} and ${b.label} overlap on `
                                    + `${sa.levelName ?? sa.levelId}: one of the two envelopes carries no `
                                    + 'readable footprint. This is a failure to read — NOT a finding that '
                                    + 'they are clear of each other.',
                            }));
                            continue;
                        }
                        const res = intersectPolygons2D(toPt2(sa.ring), toPt2(sb.ring));
                        if (!res.ok) {
                            unmeasurable.push(Object.freeze({
                                levelId: sa.levelId,
                                aLabel: a.label,
                                bLabel: b.label,
                                reason: 'kernel-refused' as const,
                                text:
                                    `PRYZM could not measure the overlap between ${a.label} and ${b.label} on `
                                    + `${sa.levelName ?? sa.levelId} (${res.reason}). This is a failure to `
                                    + 'measure — NOT a finding that they are clear of each other. A '
                                    + 'self-crossing perimeter is the usual cause; redraw it and PRYZM will '
                                    + 'report the number.',
                            }));
                            continue;
                        }
                        const areaM2 = loopsAreaM2(res.loops);
                        if (areaM2 < OVERLAP_FLOOR_M2) continue;
                        const aArea = sa.footprintAreaM2;
                        const bArea = sb.footprintAreaM2;
                        const where = sa.levelName ?? sa.levelId;
                        // ⛔ BOTH NUMBERS, in the advisory voice. The user decides.
                        const both = (aArea === null || bArea === null)
                            ? 'PRYZM could not read one of the two footprint areas, so it states the '
                              + 'overlap alone rather than a proportion it cannot support.'
                            : `${a.label} covers ${aArea.toFixed(0)} m² there and ${b.label} covers `
                              + `${bArea.toFixed(0)} m².`;
                        overlaps.push(Object.freeze({
                            levelId: sa.levelId,
                            levelName: sa.levelName,
                            aLabel: a.label,
                            bLabel: b.label,
                            aGroupId: a.groupId,
                            bGroupId: b.groupId,
                            overlapAreaM2: areaM2,
                            aAreaM2: aArea ?? 0,
                            bAreaM2: bArea ?? 0,
                            sentence:
                                `${a.label} and ${b.label} overlap by ${areaM2.toFixed(0)} m² on ${where}. `
                                + `${both} This is a NOTE, not a refusal — overlapping volumes at massing `
                                + 'stage are a normal way to study options, and PRYZM will not decline to '
                                + 'draw what you asked for.',
                        }));
                    }
                }
            }
        }
        span.setAttribute('pryzm.massingGroup.overlaps', overlaps.length);
        span.setAttribute('pryzm.massingGroup.overlapPairs', pairsExamined);
        span.setAttribute('pryzm.massingGroup.overlapUnmeasurable', unmeasurable.length);
        return {
            overlaps: Object.freeze(overlaps),
            unmeasurable: Object.freeze(unmeasurable),
            pairsExamined,
        };
    } finally {
        span.end();
    }
}

/** Every live group id, for `reconcileMassingGroupSelection`. Empty when the read failed. */
export function liveMassingGroupIds(roster: MassingGroupRosterResult): readonly string[] {
    if (!roster.readable) return [];
    const out: string[] = [];
    for (const g of roster.groups) if (g.groupId !== null) out.push(g.groupId);
    return out;
}

/** How one storey reads in a row: its level name, or its dangling id, said as such. */
export function describeMassingGroupStorey(s: MassingGroupStorey): string {
    const where = s.levelName ?? `${s.levelId} (a storey this project does not have)`;
    const area = s.footprintAreaM2 === null ? 'area not readable' : `${s.footprintAreaM2.toFixed(0)} m²`;
    const height = s.heightM === null ? '' : ` · ${s.heightM.toFixed(1)} m tall`;
    return `${where} — ${area}${height}`;
}

/** A typed row for the unused-import guard: the roster's member type, re-exported for callers. */
export type { ExistingLevelEnvelope };
