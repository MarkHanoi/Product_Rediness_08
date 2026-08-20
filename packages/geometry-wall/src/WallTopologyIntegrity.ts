/**
 * @pryzm/geometry-wall — §WALL-TOPOLOGY-INTEGRITY (L-1570)
 *
 * THE PROBE, SHIPPED BEFORE THE FIX.
 *
 * ── WHAT IT ANSWERS ──────────────────────────────────────────────────────────
 * *"Is this level's wall topology corrupt, and WHICH junctions?"* — deterministic,
 * pure, host-derived, and answerable without a camera, a renderer or a store.
 *
 * ── THE DEFECT CLASS IT NAMES (founder session, 2026-08-20, item 2.1) ────────
 * A wall drag produced, in one gesture:
 *
 *   §L-942-UNBLOCK        … "would re-baseline 2 non-subject wall(s) by up to 75 mm …
 *                            REPORTED, NOT REFUSED — the move proceeds"
 *   §MOVE-REWELD-REFUSED  … AMBIGUOUS_WELD_AUTHORSHIP × 2; "LEFT UNREPAIRED"
 *   §NEAR-CORNER-L DEGRADED … "gap=83mm … the corner closes VISUALLY.
 *                            The endpoints do NOT actually meet"
 *   §FIX-T-JOIN-PENETRATION … "penetrates host by 310.0 mm (depth cap 101.5 mm) …
 *                            through-crossing … Left UNHANDLED"
 *
 * Each of those four lines is HONEST on its own and each is emitted by a
 * DIFFERENT subsystem at a DIFFERENT moment. Nothing anywhere read them
 * together, so the one fact they jointly establish — **the model is now visually
 * closed and topologically open** — was never stated by anybody. This module
 * states it, from the stored baselines alone, after the fact, at any time.
 *
 * ── WHY IT MEASURES THE STORE AND NOT THE GESTURE ────────────────────────────
 * The corruption OUTLIVES the gesture: it is written into `baseLine`, and
 * `baseLine` is what the autosave snapshot persists. A probe wired only into the
 * move path could not answer *"is the file I just opened already corrupt?"*, and
 * that is the question that separates a render glitch from data loss. So the
 * input here is a set of walls — a level, a snapshot, a fixture — and nothing else.
 *
 * ── EVERY THRESHOLD IS DERIVED FROM THE HOST'S OWN THICKNESS ─────────────────
 * L-919's bug class is a geometric verdict taken against a CAMERA-derived number
 * (`snapRadius` is `getWorldToleranceForActiveCamera(...)`, clamped to
 * [0.05, 1.0] m), so the same two walls classified differently at two zoom
 * levels. A building does not have that property, and neither does this probe:
 * the only tolerance consumed here is `COINCIDENT_M` (C73 §2.2 — the kernel's
 * declared model-space identity tolerance, consumed, never minted); every band
 * is a multiple of a wall's own thickness. Two runs on the same stored walls give
 * the same findings on any machine, at any zoom, in any process.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 * It does not repair, it does not widen a tolerance so a finding goes away, and
 * it does not consult the semantic `joinedTo` graph. The graph is the thing that
 * DISAGREES with the geometry when the model is corrupt (see
 * `NOT_WELDED_TO_SUBJECT_PREV_SEGMENT` in `WallMoveReweld.ts`), so a probe that
 * asked it would inherit exactly the blindness it exists to detect.
 */

import { COINCIDENT_M, EPSILON_ZERO } from '@pryzm/geometry-kernel';

/** The three fields a wall must expose to be audited. Structural on purpose:
 *  a `WallData`, a snapshot row and a test fixture all satisfy it. */
export interface WallTopologyInput {
    readonly id: string;
    readonly baseLine: ReadonlyArray<{ readonly x: number; readonly y?: number; readonly z: number }>;
    /** Metres. Absent / non-finite ⇒ the wall is audited only as a GUEST, never
     *  as a HOST: every host-side band is derived from this number, and inventing
     *  one would be a verdict manufactured from a missing input. */
    readonly thickness?: number;
}

export type WallTopologyFindingKind =
    /**
     * ⭐ THE HEADLINE. Two wall ENDPOINTS that do not meet, separated by less
     * than one host thickness — i.e. INSIDE the mitre zone, where
     * `WallJoinResolver`'s §NEAR-CORNER-L bisector will close the corner
     * VISUALLY while the endpoints stay apart. The picture is right and the
     * topology is wrong, which is the only species of defect a user cannot see
     * and a room detector cannot survive.
     */
    | 'VISUALLY_CLOSED_TOPOLOGICALLY_OPEN'
    /**
     * A wall's endpoint has crossed PAST the host's CENTRELINE and is stranded
     * inside its solid.
     *
     * ⚠ THE BAND STARTS AT THE CENTRELINE, NOT AT THE FACE, AND THAT IS NOT A
     * SLACKENING. §FIX-T-JOIN-PENETRATION's own derivation states the authoring
     * convention: a snap onto a wall's body resolves to that wall's CENTRELINE,
     * because that is what a wall feature IS geometrically, so a perfectly
     * authored T-stem's stored baseline endpoint sits *exactly* one host
     * half-thickness inside the solid and is trimmed to the face only in the
     * RENDER footprint. A probe that flagged depth > 0 would therefore report
     * every correct T-junction in the model as corrupt — and a probe that cries
     * on healthy geometry is a probe nobody runs twice.
     *
     * ⚠ AND IT IS BOUNDED BY THE TWO SOLIDS, not by a reach. The endpoint must
     * lie where the guest's own body and the host's body OVERLAP
     * (`tHost/2 + tGuest/2`); an endpoint further away than that is not inside
     * anything, and is ARM C's question instead. An earlier draft of this file
     * omitted that bound and reported a wall's FAR endpoint, 2.7 m clear on the
     * other side, as a 2790 mm penetration — this probe's own first test run
     * caught it, which is the argument for shipping the probe before the fix.
     */
    | 'ENDPOINT_INSIDE_BODY'
    /**
     * ⭐ TWO WALL BODIES PASS THROUGH EACH OTHER, with the crossing strictly
     * inside both — neither wall terminates there, so it is not a junction of
     * any kind. This is what the founder's drag left behind: the moved wall was
     * swept ACROSS a partition whose re-weld was then refused, so the partition
     * no longer ends on it, it goes through it.
     *
     * `measuredMm` is the SHORTEST stranded stub — how much wall is left beyond
     * the crossing on the nearest side. That is the number worth reading: it is
     * the fragment nobody authored.
     *
     * ⚠ WHAT THIS WILL ALSO REPORT, said plainly rather than discovered later:
     * a deliberately-authored X where two walls genuinely cross (the shape
     * `JunctionResolverV2` records as `role: 'passthrough'` and
     * §PASS-THROUGH-FLUSH resolves). Separating the two needs the junction
     * INDEX, which records exactly that role and is not reachable from this
     * layer — see the L-1570 report. A legitimate X reported here is a false
     * alarm a human dismisses in one glance; missing the founder's crossing is
     * the failure this probe exists to prevent, and between those two the choice
     * is not close.
     */
    | 'BODY_CROSSING';

export type WallTopologySeverity = 'CORRUPT';

export interface WallTopologyFinding {
    readonly kind: WallTopologyFindingKind;
    readonly severity: WallTopologySeverity;
    /** The wall whose ENDPOINT is the offending one. */
    readonly guestWallId: string;
    /** Which of its two endpoints. */
    readonly guestSide: 'start' | 'end';
    /** The wall it offends against — the HOST whose thickness set the band. */
    readonly hostWallId: string;
    /** For a pair finding, which host endpoint; absent for a body finding. */
    readonly hostSide?: 'start' | 'end';
    /** C83 §10.3 — THE MEASURED NUMBER, mm. */
    readonly measuredMm: number;
    /** C83 §10.3 — THE SECOND NUMBER: what it had to clear, mm. */
    readonly limitMm: number;
    /** Where in the model to look. */
    readonly atX: number;
    readonly atZ: number;
}

export interface WallTopologyAudit {
    /** THE VERDICT. True ⇔ at least one CORRUPT finding. */
    readonly corrupt: boolean;
    /** Deterministically ordered: kind, then guest id, then side, then host id. */
    readonly findings: readonly WallTopologyFinding[];
    /** How many walls were audited — so "0 findings" can be told apart from
     *  "nothing was audited" (§CONTEXT-DATA-HONESTY: failure and empty must
     *  never share a value). */
    readonly wallsAudited: number;
    /** Walls carrying no usable thickness. They are audited as guests only, and
     *  the count is printed so a silent half-audit is impossible. */
    readonly wallsWithoutThickness: number;
}

interface Seg {
    id: string;
    ax: number; az: number;
    bx: number; bz: number;
    len: number;
    /** Unit axis. */
    ux: number; uz: number;
    /** Metres, or undefined when the wall declares none. */
    t?: number;
}

function toSeg(w: WallTopologyInput): Seg | null {
    const a = w.baseLine[0];
    const b = w.baseLine[1];
    if (!a || !b) return null;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len * len < EPSILON_ZERO) return null;     // degenerate — no axis to reason about
    const t = typeof w.thickness === 'number' && Number.isFinite(w.thickness) && w.thickness > 0
        ? w.thickness
        : undefined;
    return { id: w.id, ax: a.x, az: a.z, bx: b.x, bz: b.z, len, ux: dx / len, uz: dz / len, t };
}

/** Foot of the perpendicular from p onto the SEGMENT, plus the along-parameter. */
function foot(px: number, pz: number, s: Seg): { fx: number; fz: number; along: number } {
    let k = ((px - s.ax) * s.ux + (pz - s.az) * s.uz);
    k = Math.max(0, Math.min(s.len, k));
    return { fx: s.ax + s.ux * k, fz: s.az + s.uz * k, along: k };
}

const mm = (m: number): number => Math.round(m * 1000);

/**
 * Audit one level's walls. Pure; O(n²) in wall count, which at a real level
 * (hundreds) is a few hundred thousand scalar operations and is why this can run
 * on every committed move without a budget conversation.
 *
 * ⚠ THE BANDS, AND WHY EACH IS THE ONE IT IS:
 *
 *   pair gap ∈ (COINCIDENT_M, max(tGuest, tHost) + COINCIDENT_M]
 *       Below COINCIDENT_M the endpoints ARE the same model point (C73 §2.2) —
 *       a closed corner, nothing to report. Above one thickness the gap is
 *       outside every mitre the two walls can produce, so it shows as a VISIBLE
 *       hole: still wrong, but not HIDDEN, and this probe is about the hidden
 *       kind. The founder's 83 mm gap between two 100 mm walls sits squarely
 *       inside this band, which is precisely why the resolver papered it over.
 *
 *   penetration > tHost/2 + COINCIDENT_M, foot strictly interior to the host span
 *       Measured from the face the guest APPROACHES FROM, exactly as
 *       `WallJoinResolver._applyT` measures it, so the two agree by construction
 *       rather than by coincidence. The band opens at the CENTRELINE and not at
 *       the face because the centreline is where an authored T-stem's stored
 *       endpoint legitimately sits — see `ENDPOINT_INSIDE_BODY`.
 *
 *   body crossing: the two centrelines meet strictly inside BOTH segments, by
 *       more than each wall's own half-thickness
 *       A wall that TERMINATES at the meeting point is a T or an L and falls
 *       outside that window by construction, so the window admits exactly the
 *       shape where NEITHER wall ends there — which is the shape
 *       §FIX-T-JOIN-PENETRATION declares UNBUILT and leaves UNHANDLED.
 */
export function auditWallTopology(walls: readonly WallTopologyInput[]): WallTopologyAudit {
    const segs: Seg[] = [];
    let withoutThickness = 0;
    for (const w of walls) {
        const s = toSeg(w);
        if (!s) continue;
        if (s.t === undefined) withoutThickness++;
        segs.push(s);
    }

    const findings: WallTopologyFinding[] = [];

    // ── ARM A — endpoint pairs that do not meet, inside the mitre zone ───────
    //
    // Ordered pairs are visited ONCE (j > i) so a single open corner is ONE
    // finding, not two. That is L-1391's lesson consumed rather than repeated:
    // an ordered-pair double count made a room audit report twice the breaks it
    // had found.
    for (let i = 0; i < segs.length; i++) {
        const A = segs[i]!;
        for (let j = i + 1; j < segs.length; j++) {
            const B = segs[j]!;
            const band = Math.max(A.t ?? 0, B.t ?? 0);
            if (band <= 0) continue;                 // neither declares a thickness — no band exists
            const limit = band + COINCIDENT_M;
            for (const as of ['start', 'end'] as const) {
                const ax = as === 'start' ? A.ax : A.bx;
                const az = as === 'start' ? A.az : A.bz;
                for (const bs of ['start', 'end'] as const) {
                    const bx = bs === 'start' ? B.ax : B.bx;
                    const bz = bs === 'start' ? B.az : B.bz;
                    const gap = Math.hypot(ax - bx, az - bz);
                    if (gap <= COINCIDENT_M) continue;   // the same model point: CLOSED
                    if (gap > limit) continue;           // outside every mitre: a VISIBLE hole
                    findings.push({
                        kind: 'VISUALLY_CLOSED_TOPOLOGICALLY_OPEN',
                        severity: 'CORRUPT',
                        guestWallId: A.id, guestSide: as,
                        hostWallId: B.id, hostSide: bs,
                        measuredMm: mm(gap),
                        limitMm: mm(COINCIDENT_M),
                        atX: ax, atZ: az,
                    });
                }
            }
        }
    }

    // ── ARM B — an endpoint stranded inside another wall's solid ────────────
    for (const G of segs) {
        for (const H of segs) {
            if (H.id === G.id) continue;
            if (H.t === undefined) continue;         // no host thickness => no face => no question
            const halfT = H.t / 2;
            // The two solids only meet within this band. Outside it the endpoint is
            // not inside anything, whichever side of the centreline it is on.
            const overlap = halfT + (G.t ?? 0) / 2 + COINCIDENT_M;
            for (const side of ['start', 'end'] as const) {
                const px = side === 'start' ? G.ax : G.bx;
                const pz = side === 'start' ? G.az : G.bz;
                // The guest's OTHER endpoint tells us which side it approaches from.
                const qx = side === 'start' ? G.bx : G.ax;
                const qz = side === 'start' ? G.bz : G.az;
                const f = foot(px, pz, H);
                // Strictly INTERIOR to the host span: an abutment at a host END is a
                // corner, and corners are ARM A's question. `halfT` is the host's own
                // end-cap reach, so this margin is host-derived like every other.
                if (f.along <= halfT || f.along >= H.len - halfT) continue;
                if (Math.hypot(px - f.fx, pz - f.fz) > overlap) continue;  // the solids do not meet here
                // Signed perpendicular offset, measured along the normal that points
                // at the side the guest COMES FROM.
                const nx = -H.uz, nz = H.ux;
                const sign = ((qx - f.fx) * nx + (qz - f.fz) * nz) >= 0 ? 1 : -1;
                const signed = ((px - f.fx) * nx + (pz - f.fz) * nz) * sign;
                const penetration = halfT - signed;
                // The authored T-stem convention: the endpoint snaps to the host's
                // CENTRELINE, i.e. exactly `halfT` past the near face. Everything at
                // or shallower than that is a correctly-authored abutment, not a
                // clash — see the `ENDPOINT_INSIDE_BODY` doc-comment.
                if (penetration <= halfT + COINCIDENT_M) continue;
                findings.push({
                    kind: 'ENDPOINT_INSIDE_BODY',
                    severity: 'CORRUPT',
                    guestWallId: G.id, guestSide: side,
                    hostWallId: H.id,
                    measuredMm: mm(penetration),
                    limitMm: mm(halfT + COINCIDENT_M),
                    atX: px, atZ: pz,
                });
            }
        }
    }

    // ── ARM C — two bodies passing through each other ────────────────────
    //
    // Ordered pairs once (j > i): one crossing is one fact, seen from both walls.
    for (let i = 0; i < segs.length; i++) {
        const A = segs[i];
        if (!A) continue;
        for (let j = i + 1; j < segs.length; j++) {
            const B = segs[j];
            if (!B) continue;
            const halfA = (A.t ?? 0) / 2, halfB = (B.t ?? 0) / 2;
            if (halfA <= 0 && halfB <= 0) continue;
            const cross = A.ux * B.uz - A.uz * B.ux;
            if (Math.abs(cross) < 1e-9) continue;                 // parallel: no crossing
            const rx = B.ax - A.ax, rz = B.az - A.az;
            const tA = (rx * B.uz - rz * B.ux) / cross;
            const tB = (rx * A.uz - rz * A.ux) / cross;
            // STRICTLY interior to BOTH, by each wall's own end-cap reach. A wall
            // that TERMINATES at the crossing is a T or an L — a junction, not a
            // clash — and falls outside this window by construction.
            if (tA <= halfA || tA >= A.len - halfA) continue;
            if (tB <= halfB || tB >= B.len - halfB) continue;
            // The shortest stranded stub: the least wall left beyond the crossing.
            const stub = Math.min(tA, A.len - tA, tB, B.len - tB);
            findings.push({
                kind: 'BODY_CROSSING',
                severity: 'CORRUPT',
                guestWallId: A.id, guestSide: (tA <= A.len - tA ? 'start' : 'end'),
                hostWallId: B.id,
                measuredMm: mm(stub),
                limitMm: mm(Math.max(halfA, halfB)),
                atX: A.ax + A.ux * tA, atZ: A.az + A.uz * tA,
            });
        }
    }

    findings.sort((a, b) =>
        (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
        || (a.guestWallId < b.guestWallId ? -1 : a.guestWallId > b.guestWallId ? 1 : 0)
        || (a.guestSide < b.guestSide ? -1 : a.guestSide > b.guestSide ? 1 : 0)
        || (a.hostWallId < b.hostWallId ? -1 : a.hostWallId > b.hostWallId ? 1 : 0)
        || ((a.hostSide ?? '') < (b.hostSide ?? '') ? -1 : (a.hostSide ?? '') > (b.hostSide ?? '') ? 1 : 0),
    );

    return {
        corrupt: findings.length > 0,
        findings,
        wallsAudited: segs.length,
        wallsWithoutThickness: withoutThickness,
    };
}

/**
 * One finding, as the sentence a human reads — BOTH numbers, always (C83 §10.3).
 *
 * Exported so a test can assert the SENTENCE and not merely the code behind it:
 * L-921's whole finding was that a fact computed and a fact delivered had been
 * printing as the same outcome.
 */
export function describeWallTopologyFinding(f: WallTopologyFinding): string {
    const at = `@(${f.atX.toFixed(3)},${f.atZ.toFixed(3)})`;
    switch (f.kind) {
        case 'VISUALLY_CLOSED_TOPOLOGICALLY_OPEN':
            return `VISUALLY_CLOSED_TOPOLOGICALLY_OPEN ${at}: ${f.guestWallId}(${f.guestSide}) and `
                 + `${f.hostWallId}(${f.hostSide}) are ${f.measuredMm} mm apart — more than the `
                 + `${f.limitMm} mm that makes two endpoints one model point, but inside the mitre `
                 + `zone, so the corner is drawn CLOSED and the endpoints do not meet`;
        case 'ENDPOINT_INSIDE_BODY':
            return `ENDPOINT_INSIDE_BODY ${at}: ${f.guestWallId}(${f.guestSide}) sits `
                 + `${f.measuredMm} mm inside ${f.hostWallId}'s solid, past the ${f.limitMm} mm `
                 + `CENTRELINE depth an authored T-stem snaps to — no authoring gesture places an `
                 + `endpoint there, so this is a clash, not an abutment`;
        case 'BODY_CROSSING':
            return `BODY_CROSSING ${at}: ${f.guestWallId} and ${f.hostWallId} pass THROUGH each `
                 + `other — neither terminates at the crossing, so this is not a junction of any `
                 + `kind. The shortest stranded stub is ${f.measuredMm} mm against a `
                 + `${f.limitMm} mm end-cap reach: that much wall is left beyond the crossing with `
                 + `nothing to join`;
    }
}

/**
 * The audit as ONE console line, or `null` when the topology is sound.
 *
 * `null` rather than a cheerful sentence: a probe that prints on every clean
 * gesture trains its reader to skip it, and the one line that matters then
 * arrives in a stream of noise it is indistinguishable from.
 */
export function summariseWallTopologyAudit(levelId: string, a: WallTopologyAudit): string | null {
    if (!a.corrupt) return null;
    const byKind = new Map<string, number>();
    for (const f of a.findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    return `[WallTopologyIntegrity] §WALL-TOPOLOGY-CORRUPT level='${levelId}' — `
         + `${a.findings.length} finding(s) across ${a.wallsAudited} wall(s) `
         + `[${[...byKind].map(([k, n]) => `${k}×${n}`).join(', ')}]`
         + (a.wallsWithoutThickness > 0
             ? ` (${a.wallsWithoutThickness} wall(s) declare no thickness and were audited as GUESTS ONLY)`
             : '')
         + `: ${a.findings.map(describeWallTopologyFinding).join(' | ')}`;
}
