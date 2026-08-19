/**
 * WallJoinResolveMemo — §WJ2-JOIN-MEMO (L-1159, founder 2026-08-19).
 *
 * A content-addressed memo for `WallJoinResolver.resolveLevel`, keyed on the
 * SEVEN wall fields the solve actually reads plus the thresholds and behaviour
 * flags it consults. Nothing else can enter the key, so nothing else can bust it.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The founder reported three separate production stalls on one deployed build,
 * and all three turned out to be the same defect:
 *
 *   1. bulk HEIGHT change over a multi-level project  → `resolveLevel` per flush
 *   2. bulk WINDOW create (one every 1.5 m, all walls) → `resolveLevel` per flush
 *   3. (sibling lane) walls-by-slab create             → whole-level room redetect
 *
 * None of those three gestures can change a join. A height is an EXTRUSION
 * parameter; a window is a HOSTED OPENING; neither can move a centreline, alter
 * a thickness, or change an angle. Yet each one re-ran the whole-level plan
 * solve, because invalidation was keyed on **"something on this level changed"**
 * rather than on **what the computation actually depends on**.
 *
 * ── The measurement this is built on (WJ2HeightEditJoinInvalidation.measure) ──
 * `WallJoinResolver.resolveLevel` output is BYTE-IDENTICAL at h=3.0, h=5.0 and
 * h=0.05 on the same plate, and BYTE-IDENTICAL when every wall gains a window —
 * measured by running the real resolver and comparing the full serialised
 * `JoinData` of every wall, with two controls (host thickness, endpoint move)
 * that DO diverge, so the comparison is known to be capable of failing.
 *
 * A source census agrees and says WHY: across `WallJoinResolver.ts`'s 3236 lines
 * the identifiers `height`, `openings`, `rakeAngleDeg`, `wallProfile`,
 * `baseOffset`, `materialColor`, `properties` and `layers` occur **zero** times.
 * The solve reads `id`, `baseLine`, `_sourceBaseLine`, `thickness`, `curve`,
 * `systemTypeId` and `joinIntent` — and nothing else.
 *
 * ── Why a MEMO and not a looser invalidation rule ───────────────────────────
 * `WallDeltaClassifier`'s own doctrine, earned the hard way: *"a MEMOIZATION
 * rather than an approximation"*. A memo cannot be wrong about a shape nobody
 * anticipated — a cache hit means the inputs were byte-identical, so the solve
 * would have produced the identical answer. Widening a classifier guard, by
 * contrast, is a claim about geometry that the next unanticipated topology can
 * falsify. §CLAMP-COSHARE-WELD was reverted for exactly that class of mistake.
 *
 * This also means the memo is SAFE UNDER THE JOIN DEFECTS IT DOES NOT FIX. The
 * §FIX-T-JOIN-PENETRATION grazing verdicts and §SELF-CLUSTER-GUARD skips are
 * reproduced exactly, because a hit replays the same answer the solve gave.
 *
 * ── What it does NOT do (stated so it is not mistaken for more) ─────────────
 * • It does not stop the flush from RE-ARMING. The founder's stack chains
 *   `tick → scheduleNext → requestAnimationFrame` for 200+ frames; the memo makes
 *   each of those passes cheap, it does not make them stop. The re-arm lives in
 *   the flush layer, not here, and is tracked separately.
 * • It does not make a genuine join edit cheaper. Moving a wall busts the key,
 *   as it must.
 * • It is not a correctness fix for the join classification itself.
 *
 * @file packages/geometry-wall/src/WallJoinResolveMemo.ts
 */

import type * as THREE from '@pryzm/renderer-three/three';
import type { JoinData } from '@pryzm/core-app-model';
import type { WallData } from './WallTypes';

/** The per-call thresholds `_resolveThresholds` produces. Structural, so this
 *  module does not import the resolver (which imports this one). */
export interface JoinThresholdsLike {
    snapRadius: number;
    maxCornerOffset: number;
    minWallLength: number;
}

// ── The behaviour flags the solve consults ──────────────────────────────────
//
// Every `__pryzm*` global read anywhere under `resolveLevel`, enumerated by
// `grep -oE "__[pP][rR][yY][zZ][mM][A-Za-z_]*" WallJoinResolver.ts | sort -u`.
// They are in the key for two different reasons and BOTH matter:
//   · the six behaviour gates change the ANSWER, so a memo that ignored them
//     would serve a result computed under different rules;
//   · the four DIAGNOSTIC gates change the OUTPUT THE DEVELOPER SEES. A cache
//     hit runs no solve and therefore emits no diagnostics, so a developer who
//     switches logging on mid-session would get silence from a warm entry —
//     the debugging tool defeated by the optimisation. Keying on them means
//     flipping a flag busts the cache and the next pass logs in full.
const _BEHAVIOUR_FLAGS = [
    '__pryzmMultiClusterPartitionTrim',
    '__pryzmExistingCornerImmutable',
    '__pryzmNewWallLCornerBiasFix',
    '__pryzmPassThroughCoincidentGate',
    '__pryzmWallDiffThicknessButt',
    '__pryzmWallFaceTrimNoClash',
    '__pryzmWallLCornerCollinearStep',
    '__pryzmDebugWalls',
    '__pryzmWallJoinDiag',
    '__PRYZM_WALL_JOIN_DEBUG',
] as const;

/** Off-switch for bisecting a suspected stale-cache bug:
 *  `globalThis.__pryzmWallJoinMemo = false` in DevTools. Default ON. */
export function wallJoinMemoEnabled(): boolean {
    return (globalThis as unknown as { __pryzmWallJoinMemo?: boolean })
        .__pryzmWallJoinMemo !== false;
}

function _flagBits(): string {
    const g = globalThis as unknown as Record<string, unknown>;
    let s = '';
    for (const f of _BEHAVIOUR_FLAGS) s += g[f] === true ? '1' : (g[f] === false ? '0' : '-');
    return s;
}

// ── The key ─────────────────────────────────────────────────────────────────

/** Exact serialisation of one coordinate. `String(n)` round-trips an IEEE-754
 *  double exactly, so two different numbers can never collide on one key.
 *  ⚠ Do NOT introduce rounding here: a tolerance in a cache key silently maps
 *  distinct geometry onto one answer, which is a correctness bug, not a perf
 *  tuning knob. The COINCIDENCE question belongs in the solve, not in the key. */
const _n = (v: number | undefined): string => (v === undefined ? '~' : String(v));

const _pt = (p: { x: number; y: number; z: number } | undefined): string =>
    p === undefined ? '~' : `${_n(p.x)},${_n(p.y)},${_n(p.z)}`;

/**
 * Build the memo key for one `resolveLevel` call, or `null` when the call must
 * not be memoised (a wall carrying a non-finite coordinate — we refuse to key on
 * NaN rather than risk `NaN !== NaN` semantics leaking into cache identity).
 *
 * The key contains EXACTLY the inputs the solve reads:
 *   per wall, IN ARRAY ORDER (the pair-wise `seen` set and cluster iteration are
 *   order-sensitive, so order is part of the input, not an incidental detail):
 *     id · seed baseline · thickness · curve · systemTypeId · joinIntent
 *   plus: the resolved thresholds, and the behaviour/diagnostic flag bits.
 *
 * The SEED baseline is `_sourceBaseLine ?? baseLine` — what §SOURCE-BL-FIX
 * actually feeds the solve. ⭐ Keying on `baseLine` instead would be a live
 * staleness bug in the exact scenario this memo exists for: the coordinator
 * writes each TRIMMED baseline back to the store after every flush, so
 * `baseLine` changes while `_sourceBaseLine` does not. Keying on the field the
 * solve does not read would have missed on every pass and cached nothing —
 * which is the benign direction, but keying on it while the solve reads the
 * OTHER one is how a memo serves a stale answer. Read the seed, key the seed.
 */
export function wallJoinResolveKey(
    walls: readonly WallData[],
    thresholds: JoinThresholdsLike,
): string | null {
    const parts: string[] = [
        `t:${_n(thresholds.snapRadius)}|${_n(thresholds.maxCornerOffset)}|${_n(thresholds.minWallLength)}`,
        `f:${_flagBits()}`,
        `n:${walls.length}`,
    ];
    for (const w of walls) {
        const seed = ((w as unknown as { _sourceBaseLine?: WallData['baseLine'] })
            ._sourceBaseLine ?? w.baseLine) as WallData['baseLine'] | undefined;
        const a = seed?.[0];
        const b = seed?.[1];
        if (a && b) {
            if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z) ||
                !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z)) {
                return null;   // degenerate input — never memoise
            }
        }
        const c = w.curve;
        const sysType = (w as unknown as { systemTypeId?: string }).systemTypeId;
        const intent = (w as unknown as { joinIntent?: { start?: string; end?: string } }).joinIntent;
        parts.push(
            `${w.id}${_pt(a)}${_pt(b)}${_n(w.thickness)}` +
            `${c ? `${_pt(c.control)}:${_n(c.segments)}` : '~'}` +
            `${sysType ?? '~'}` +
            `${intent ? `${intent.start ?? '~'}>${intent.end ?? '~'}` : '~'}`,
        );
    }
    return parts.join('');
}

// ── The store ───────────────────────────────────────────────────────────────

/** Small FIFO. Sized for a multi-storey project's live level set plus headroom;
 *  each entry is O(walls) small objects, so this is kilobytes, not megabytes. */
const _MAX_ENTRIES = 12;
const _memo = new Map<string, Map<string, JoinData>>();

let _hits = 0;
let _misses = 0;
let _savedMs = 0;

/**
 * Deep copy of a resolve result. Mandatory in BOTH directions.
 *
 * `resolveLevel`'s consumers do not treat `JoinData` as immutable — the
 * coordinator stashes entries in `_prevJoinMap` and hands them to
 * `builder.updateWall`, and the resolver itself mutates `adj` objects in place
 * while solving. Handing out the stored Map would let any consumer edit the
 * cache; storing the returned Map would let the caller edit it afterwards.
 * Both directions copy, so a cached entry is unreachable from outside.
 */
export function cloneJoinMap(src: Map<string, JoinData>): Map<string, JoinData> {
    const out = new Map<string, JoinData>();
    for (const [id, j] of src) {
        const copy: JoinData = {
            baseLine: [j.baseLine[0].clone(), j.baseLine[1].clone()] as [THREE.Vector3, THREE.Vector3],
            startMN: j.startMN ? { nx: j.startMN.nx, nz: j.startMN.nz } : null,
            endMN: j.endMN ? { nx: j.endMN.nx, nz: j.endMN.nz } : null,
        };
        if (j.invalid !== undefined) copy.invalid = j.invalid;
        if (j.invalidReason !== undefined) copy.invalidReason = j.invalidReason;
        out.set(id, copy);
    }
    return out;
}

export function wallJoinMemoLookup(key: string): Map<string, JoinData> | undefined {
    const hit = _memo.get(key);
    if (hit) { _hits++; return hit; }
    _misses++;
    return undefined;
}

export function wallJoinMemoStore(key: string, value: Map<string, JoinData>, solveMs = 0): void {
    if (_memo.has(key)) _memo.delete(key);
    _memo.set(key, value);
    _savedMs = solveMs > 0 ? solveMs : _savedMs;
    while (_memo.size > _MAX_ENTRIES) {
        const oldest = _memo.keys().next();
        if (oldest.done) break;
        _memo.delete(oldest.value);
    }
}

export interface WallJoinMemoStats {
    hits: number;
    misses: number;
    entries: number;
    /** Wall-clock of the most recent real solve (ms) — the cost each hit avoids. */
    lastSolveMs: number;
}

export function wallJoinMemoStats(): WallJoinMemoStats {
    return { hits: _hits, misses: _misses, entries: _memo.size, lastSolveMs: _savedMs };
}

/** Drop every entry and zero the counters.
 *  ⚠ CALLED BY TESTS ONLY TODAY — not yet wired to project teardown/switch, and not
 *  exposed on `globalThis`. Stated plainly rather than described as done. It is safe
 *  that it is unwired: every key embeds the wall IDs, which are unique per project,
 *  so a stale entry can never be SERVED to a different project — the only cost of the
 *  missing call is that up to `_MAX_ENTRIES` maps stay resident across a switch, which
 *  the FIFO already bounds. Wire it when teardown grows a hook; do not claim it here
 *  until it does. */
export function wallJoinMemoReset(): void {
    _memo.clear();
    _hits = 0;
    _misses = 0;
    _savedMs = 0;
}
