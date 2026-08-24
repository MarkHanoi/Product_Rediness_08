/**
 * §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR — the wall drawing-mode vocabulary, resolved
 * in ONE place, and the ortho lock that depends on it.
 *
 * ── THE FOUNDER DEFECT (production, 2026-08-24) ──────────────────────────────
 *
 *   "if the wall MODE: is ORTHO — it can not -not draw ortho — it can not fall back
 *    to linear — okay? check and fix it!"
 *
 * He drew with ORTHO armed and got visibly diagonal walls. MEASURED root cause:
 * the wall tool is armed with a mode string that is NOT a `WallDrawingMode` member.
 *
 *   plugins/wall/src/contributions.ts      runtime.tools.activate('wall', 'polyline_ortho')
 *   ToolsAreaLayout.ts:177                 (m as WallDrawingMode) ?? POLYLINE_ORTHO
 *   ToolManager.activateWall(mode)  →  WallTool.activate(mode)  →  this.drawingMode = mode
 *
 * `'polyline_ortho'` is lower-case. Every member of `WallDrawingMode` is UPPER-case
 * (`POLYLINE_ORTHO = 'POLYLINE_ORTHO'`), and `m as WallDrawingMode` is a CAST — it
 * asserts, it does not convert, and it does not check. So `drawingMode` held a string
 * that equalled NO branch anywhere in `WallTool`:
 *
 *   • `_applyOrthoLock`'s `=== LINE_ORTHO || === POLYLINE_ORTHO` was FALSE
 *     ⟹ the ortho lock was INERT and every segment took the raw cursor angle;
 *   • `isPolyline`'s five-way `===` list was FALSE
 *     ⟹ the tool DEACTIVATED after one segment — which is the `WallTool deactivated`
 *        line that sits in the founder's console log right after the wall.create.
 *
 * Both observed symptoms fall out of the one mismatch. ⭐ THE FAILURE AND A
 * LEGITIMATE VALUE WERE THE SAME VALUE: "the caller named ORTHO in a spelling I do
 * not know" and "the caller asked for free-angle" produced byte-identical behaviour,
 * silently. That is C01 §6 rule 6 — ABSENT and UNREACHABLE have opposite fixes — and
 * it is the reason this module exists rather than a one-character edit at the two
 * call sites. Fixing the spelling fixes TODAY's caller; resolving the vocabulary
 * fixes the NEXT one, and says so out loud when it cannot.
 *
 * ── WHAT AN UNRECOGNISED MODE DOES, AND WHY IT IS *NOT* SILENT ───────────────
 *
 * It resolves to `SINGLE` — which is byte-for-byte what an unknown string already
 * did (no ortho, no polyline, one segment then deactivate), so nothing that works
 * today changes — and `resolveWallDrawingMode` REPORTS it by name, with the accepted
 * set, so the first console line names the family and the spelling. It deliberately
 * does NOT resolve to an ortho mode: inventing a constraint the caller did not ask
 * for is the same class of lie in the other direction.
 *
 * ⛔ Do NOT add a second spelling table anywhere else. Two tables for one vocabulary
 * is how the plan surface and the 3-D surface came to disagree about the word
 * "ortho" in the first place (see `wallPickerModeFromDrawingMode.ts`, which consumes
 * this one rather than restating it).
 */

import { WallDrawingMode } from './WallTypes';
// §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT — THE ortho rule, consumed from the kernel.
import { orthoConstrainXZ } from '@pryzm/geometry-kernel';

/** Every real member of the enum, as strings. Derived — never hand-listed. */
const MEMBERS = new Set<string>(Object.values(WallDrawingMode));

/**
 * Spellings that are NOT enum members but unambiguously name one. These are the
 * words the UI layer actually uses: `WallPickerMode` ('linear' | 'ortho' | 'curved'
 * | 'byslab' | 'rectangular' | 'circular' | 'elliptical'), plus the human words the
 * HUD shows. Keys are already NORMALISED (upper-case, `-`/space → `_`).
 */
const ALIASES: Readonly<Record<string, WallDrawingMode>> = {
    ORTHO:        WallDrawingMode.POLYLINE_ORTHO,
    ORTHOGONAL:   WallDrawingMode.POLYLINE_ORTHO,
    LINEAR:       WallDrawingMode.POLYLINE,
    CURVED:       WallDrawingMode.POLYLINE_ARC,
    ARC:          WallDrawingMode.POLYLINE_ARC,
    RECTANGULAR:  WallDrawingMode.RECTANGULAR_LOOP,
    CIRCULAR:     WallDrawingMode.CIRCULAR_LOOP,
    ELLIPTICAL:   WallDrawingMode.ELLIPTICAL_LOOP,
};

/**
 * ⚠ `'byslab'` is deliberately ABSENT from `ALIASES`. By-Slab is not a drawing mode
 * at all — it is an ACTION that reads a selected slab and emits a whole run without
 * any pointer gesture (`_execWallBySlab`). Mapping it onto a drawing mode would arm a
 * rubber-band the user never asked for; leaving it unrecognised makes the caller say
 * so. C65 §3.9: no affordance without an implementation.
 */

export interface WallDrawingModeResolution {
    /** The mode to use. `SINGLE` when `raw` named nothing (see `recognised`). */
    readonly mode: WallDrawingMode;
    /** The caller's input, stringified, for reporting. */
    readonly raw: string;
    /** `raw` was already a `WallDrawingMode` member — no interpretation needed. */
    readonly exact: boolean;
    /** `raw` named a mode this module could resolve. FALSE ⟹ `mode` is a fallback. */
    readonly recognised: boolean;
}

/** Upper-case, `-`/whitespace → `_`. `'polyline-ortho'`, `'Polyline Ortho'` ⇒ `'POLYLINE_ORTHO'`. */
function normalise(raw: string): string {
    return raw.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

/**
 * Pure resolution — NEVER logs. Called on the mouse-move path (`isOrthoDrawingMode`),
 * so it must stay free of side effects; `resolveWallDrawingMode` is the reporting wrapper.
 */
function classify(raw: unknown): WallDrawingModeResolution {
    const text = typeof raw === 'string' ? raw : String(raw ?? '');
    if (MEMBERS.has(text)) {
        return { mode: text as WallDrawingMode, raw: text, exact: true, recognised: true };
    }
    const key = normalise(text);
    if (MEMBERS.has(key)) {
        return { mode: key as WallDrawingMode, raw: text, exact: false, recognised: true };
    }
    const alias = ALIASES[key];
    if (alias) {
        return { mode: alias, raw: text, exact: false, recognised: true };
    }
    return { mode: WallDrawingMode.SINGLE, raw: text, exact: false, recognised: false };
}

/**
 * Resolve a caller's drawing-mode string to a real `WallDrawingMode`.
 *
 * `context` names the call site in the console line an unrecognised value produces —
 * pass it wherever a user gesture can reach, so the founder's first console line
 * after a bad activation says WHICH surface armed the tool with WHAT.
 */
export function resolveWallDrawingMode(raw: unknown, context?: string): WallDrawingModeResolution {
    const res = classify(raw);
    if (!res.recognised) {
        console.error(
            `[WallTool] §FIX-ORTHO-CANNOT-FALL-BACK-TO-LINEAR — drawing mode "${res.raw}" is NOT a ` +
            `wall drawing mode${context ? ` (armed from ${context})` : ''}. NOTHING WAS CONSTRAINED: ` +
            `falling back to ${res.mode} (single free-angle segment). If you meant ORTHO, pass ` +
            `WallDrawingMode.POLYLINE_ORTHO or the string 'ortho'. Accepted: ` +
            `[${[...MEMBERS].sort().join(', ')}] or [${Object.keys(ALIASES).sort().join(', ').toLowerCase()}].`,
        );
    }
    return res;
}

/**
 * Does this mode constrain the segment to a cardinal axis?
 *
 * ⭐ Alias-tolerant ON PURPOSE, and that is the founder's rule in one line: a mode
 * that NAMES ortho in any spelling this module knows locks to an axis. It cannot
 * arrive at "free angle" by failing to be spelled the way an `===` expected.
 * Non-logging — this runs per mouse-move.
 */
export function isOrthoDrawingMode(mode: unknown): boolean {
    const res = classify(mode);
    return res.recognised
        && (res.mode === WallDrawingMode.LINE_ORTHO || res.mode === WallDrawingMode.POLYLINE_ORTHO);
}

/**
 * THE ortho lock for the 3-D wall tool — now an ADAPTER onto the ONE implementation in
 * `@pryzm/geometry-kernel`.
 *
 * ⭐ §RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT (founder ruling, 2026-08-24). THIS TOOL'S
 * BEHAVIOUR DOES NOT CHANGE — it already projected, and the ruling picked projection.
 * What changed is that it is no longer this tool's PRIVATE answer: the same function
 * now serves the plan wall tool, the curtain wall, the slab, floor, ceiling, pool and
 * boundary-line tools, which until today ROTATED and disagreed with it by up to
 * 1464 mm on a 5 m drag.
 *
 * ⛔ The body is DELEGATED, not copied. Copying it back would recreate exactly the
 * defect the ruling closes: two functions that both mean "apply ortho" and are free to
 * drift. The kernel is the host because `geometry-wall` and `geometry-slab` depend on
 * EACH OTHER, so neither can hold the shared rule without a module-init cycle.
 */
export function orthoLockXZ(
    start: { readonly x: number; readonly z: number },
    point: { readonly x: number; readonly z: number },
): { x: number; z: number } {
    return orthoConstrainXZ(start, point);
}

/**
 * Departure of the segment `start → end` from the NEAREST cardinal axis, in degrees,
 * in [0, 45]. THE measure for "did ortho actually hold": a boolean cannot tell a wall
 * 0.22° off axis from one 45° off axis, and both of those are failures of a different
 * size. A degenerate (zero-length) segment has no direction and reports 0.
 */
export function offAxisDeg(
    start: { readonly x: number; readonly z: number },
    end: { readonly x: number; readonly z: number },
): number {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    if (dx === 0 && dz === 0) return 0;
    const deg = Math.atan2(dz, dx) * (180 / Math.PI);
    return Math.abs(deg - Math.round(deg / 90) * 90);
}
