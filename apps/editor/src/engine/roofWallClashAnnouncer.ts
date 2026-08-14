/**
 * roofWallClashAnnouncer — PR-10 (gap register §2): the roof→walls-beneath
 * subscriber. Runs inside the SpatialAuthority level-rebuild callback
 * (`initWallLevelSubscribers`), AFTER walls rebuild and slabs re-project, and
 * ANNOUNCES what the reconcile could not fix.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * C72 §5.1: the level-elevation reconcile rebuilds Walls and Slabs only. A
 * Roof on a re-elevated level classifies DETERMINED-STRANDED
 * (`SpatialAuthority.classifyForReconcile`) and stays at the OLD elevation —
 * the SHORTFALL warn beside `SpatialAuthority.ts:237-248` names it by kind.
 * Until PR-10, nothing could say what that strand DOES to the building: no
 * subscriber existed that could detect the roof/wall clash (EV-03 §6,
 * MEASURED-ABSENT in both directions). The pure detector landed in
 * `packages/geometry-roof/src/pure/roofWallClash.ts` (§GE-06-ROOF-WALL-SLICE,
 * `83c82c02`, 13 oracle tests); this module is its one production consumer.
 *
 * ── The mapping (pinned from the detector's own model notes) ────────────────
 *   · walls beneath = `wallStore.getByLevel(levelId)`, baseline endpoints in
 *     plan XZ, `baseElevationY` = the level's NEW elevation (the walls were
 *     just rebuilt to it), `heightM` = wall.height;
 *   · eave ring = footprint.polygon expanded outward by `overhang` via the
 *     kernel's `offsetPolygonOrSelf` — the same call `RoofGeometryBuilder.
 *     _applyOverhang` makes, so membership matches what was built;
 *   · form: `roofType === 'flat'` → 'flat'; every other RoofType → 'pitched'
 *     (the uniform-pitch first-order field, per the detector header);
 *   · originY: the roof is STRANDED, so its REAL origin is the elevation the
 *     level had BEFORE this move: (newElevation − elevationDeltaM) + baseOffset.
 *     Computing from the new elevation would read every strand as clean — a
 *     false-clean, which is why an absent delta REFUSES (below) rather than
 *     defaulting to 0.
 *
 * KNOWN LIMIT (stated, not hidden): the strand model is per-move. After TWO
 * uncorrected moves the roof's built origin reflects the elevation at its last
 * rebuild, which this per-event delta cannot reconstruct — the first move's
 * announcement is exact; later ones are relative to the elevation before THAT
 * move. Cumulative tracking belongs to a roof reconcile consumer (PR-07's
 * per-kind rebuild entry point), at which point this stranded-origin model
 * must be retired with it.
 *
 * ── ANNOUNCED means announced ───────────────────────────────────────────────
 * The default channel is `showAppToast` (`role="alert"` DOM node — a user can
 * read it and a harness can query it), with a tagged console.warn beside it
 * for the log trail. `announce` is injectable so the node-env suite can spy;
 * the DEFAULT is wired, so there is no authored-but-unwired parameter here.
 */

import {
    detectRoofWallClashes,
    offsetPolygonOrSelf,
    type RoofClashRoof,
    type RoofClashWall,
    type RoofWallClashFinding,
} from '@pryzm/geometry-roof';
import { showAppToast } from '@pryzm/runtime-composer/showAppToast';

/** The wall-record shape this module reads (a structural subset of WallData). */
interface WallRecordLike {
    id?: string;
    baseLine?: ReadonlyArray<{ x?: number; z?: number }>;
    height?: number;
}

/** The roof-record shape this module reads (a structural subset of RoofData). */
interface RoofRecordLike {
    id?: string;
    footprint?: { polygon?: Array<[number, number]> };
    roofType?: string;
    slope?: number;
    overhang?: number;
    baseOffset?: number;
    thickness?: number;
}

export interface RoofWallClashCheckParams {
    levelId: string;
    /**
     * The level's elevation change (new − old, metres) from the
     * 'spatial-authority-reconcile' detail. `undefined` = unknown → this
     * module REFUSES to classify (failure ≠ clean — §CONTEXT-DATA-HONESTY).
     */
    elevationDeltaM: number | undefined;
    roofStore: { getByLevel(levelId: string): RoofRecordLike[] };
    wallStore: { getByLevel?(levelId: string): WallRecordLike[] };
    /** NEW elevation of the level (BimKernel writes it before dispatching). */
    getLevelElevation: (levelId: string) => number | undefined;
    /** Announcement channel override (tests). Default: showAppToast, 'warn'. */
    announce?: (message: string, kind: 'warn' | 'error') => unknown;
}

export interface RoofWallClashReport {
    roofId: string;
    findings: RoofWallClashFinding[];
    message: string;
}

const TAG = '[roofWallClashAnnouncer]';

function defaultAnnounce(message: string, kind: 'warn' | 'error'): void {
    try {
        showAppToast(message, kind, 10_000);
    } catch (err) {
        // No DOM (should not happen in the editor) — the console.warn the
        // caller already emitted remains the trail; record the channel failure.
        console.error(`${TAG} toast channel failed — announcement degraded to console only.`, err);
    }
}

/**
 * Detect and ANNOUNCE roof-vs-walls-beneath clashes for a just-reconciled
 * level. Returns the per-roof reports (empty = conforming or refused).
 */
export function checkAndAnnounceRoofWallClashes(params: RoofWallClashCheckParams): RoofWallClashReport[] {
    const { levelId, elevationDeltaM, roofStore, wallStore, getLevelElevation } = params;
    const announce = params.announce ?? defaultAnnounce;

    const roofs = roofStore.getByLevel(levelId) ?? [];
    if (roofs.length === 0) return [];

    // REFUSE, loudly, when the stranded origin cannot be known. Classifying
    // from the NEW elevation would call every strand clean — worse than no
    // answer, because it is green (C72 §8.b's one-armed-fix hazard).
    if (typeof elevationDeltaM !== 'number' || !Number.isFinite(elevationDeltaM)) {
        console.warn(
            `${TAG} C72 §5.1 / PR-10 — level "${levelId}" reconciled with ${roofs.length} roof(s) beneath ` +
            `review, but the reconcile carried no elevation delta: the stranded roof origin is unknowable ` +
            `and this check cannot classify. Refusing rather than reading false-clean.`,
        );
        return [];
    }

    const newElevation = getLevelElevation(levelId);
    if (typeof newElevation !== 'number' || !Number.isFinite(newElevation)) {
        console.warn(
            `${TAG} C72 §5.1 / PR-10 — level "${levelId}" has no readable elevation; cannot classify ` +
            `roof/wall strandedness. Refusing rather than reading false-clean.`,
        );
        return [];
    }

    // Walls beneath — rebuilt to the NEW elevation by the callback that runs
    // just before this check.
    const wallRecords = typeof wallStore.getByLevel === 'function' ? (wallStore.getByLevel(levelId) ?? []) : [];
    const walls: RoofClashWall[] = [];
    for (const w of wallRecords) {
        const bl = w?.baseLine;
        if (!w?.id || !bl || bl.length < 2 || typeof w.height !== 'number') continue;
        const a = bl[0]!;
        const b = bl[bl.length - 1]!;
        walls.push({
            id: w.id,
            start: [a.x ?? 0, a.z ?? 0],
            end: [b.x ?? 0, b.z ?? 0],
            baseElevationY: newElevation,
            heightM: w.height,
        });
    }
    if (walls.length === 0) return [];

    const strandedElevation = newElevation - elevationDeltaM; // where the roof still IS
    const reports: RoofWallClashReport[] = [];

    for (const r of roofs) {
        const poly = r?.footprint?.polygon;
        if (!r?.id || !poly || poly.length < 3) continue;
        const overhang = r.overhang ?? 0;
        // Same expansion the builder applied — membership matches the built eave.
        const eavePolygon = overhang > 0 ? offsetPolygonOrSelf(poly, overhang).polygon : poly;

        const roof: RoofClashRoof = {
            id: r.id,
            eavePolygon,
            form: r.roofType === 'flat' ? 'flat' : 'pitched',
            originY: strandedElevation + (r.baseOffset ?? 0),
            thicknessM: r.thickness ?? 0,
            slope: r.slope ?? 0,
        };

        const findings = detectRoofWallClashes(roof, walls);
        if (findings.length === 0) continue;

        const pens = findings.filter((f) => f.kind === 'penetrates');
        const gaps = findings.filter((f) => f.kind === 'gap');
        const parts: string[] = [];
        if (pens.length > 0) {
            const deepest = Math.max(...pens.map((f) => f.magnitudeM));
            parts.push(`${pens.length} wall(s) penetrate its underside (deepest ${deepest.toFixed(2)} m)`);
        }
        if (gaps.length > 0) {
            const closest = Math.min(...gaps.map((f) => f.magnitudeM));
            parts.push(`${gaps.length} wall(s) leave a gap to it (closest ${closest.toFixed(2)} m)`);
        }
        const sign = elevationDeltaM >= 0 ? '+' : '';
        const message =
            `Level "${levelId}" moved ${sign}${elevationDeltaM.toFixed(2)} m but roof "${r.id}" did not follow ` +
            `(no roof reconcile exists — C72 §5.1): ${parts.join('; ')}. ` +
            `Rebuild the roof or adjust its base offset. (PR-10)`;

        // The console trail sits BESIDE the SHORTFALL warn this finding refines.
        console.warn(`${TAG} C72 §5.1 / PR-10 — ${message}`, findings);
        announce(message, 'warn');
        reports.push({ roofId: r.id, findings, message });
    }

    return reports;
}
