// T1.W-C — Shell-wall host resolution for engine-emitted windows.
//
// The window-emission engine (T1.W-A) places windows on EXTERNAL walls. Those
// walls represent the SHELL — they already exist in the editor's wall store
// with their own ids. The default executePlan path skips externals (the
// shell can't be rebuilt) and the windows filter out with them.
//
// This module bridges the gap: given the option's plan-frame external walls
// + the editor's world-frame shell walls (carried via LayoutExecuteOptions),
// match each option external to its source shell wall (by endpoint
// proximity) and return a dispatch-ready { shellWallId, offsetM, widthM,
// ... } record. The wiring layer (buildLayoutCommands) then emits
// wall.createOpening hosted on the existing shell wall id rather than on a
// freshly-minted partition id.
//
// Pure + deterministic — no I/O, no THREE, no DOM.

import type { LayoutWall, LayoutWindow, RoomType, Vec2mm } from '../types.js';

/** A shell wall already present in the editor's wall store. World METRES. */
export interface ShellWall {
    readonly id:    string;
    readonly start: { readonly x: number; readonly z: number };
    readonly end:   { readonly x: number; readonly z: number };
}

/**
 * A resolved dispatch record for one engine-emitted window: the existing
 * shell wall id to host it on plus the (possibly direction-flipped) offset
 * + width along that wall, in METRES.
 *
 * Returned by `resolveShellWindow` when the window's host external wall
 * matches a shell wall; returns null when no match is found (in which case
 * the window is dropped by the wiring layer with a warning).
 */
export interface ShellWindowDispatch {
    readonly shellWallId: string;
    readonly offsetM:     number;
    readonly widthM:      number;
    readonly heightM:     number;
    readonly sillM:       number;
    readonly roomType?:   RoomType;
    readonly name?:       string;
}

/** Tolerance for endpoint matching, in METRES. The shell can have walls
 *  whose endpoints don't EXACTLY equal the option's external-wall endpoints
 *  (the bubble-graph reconciliation re-derives them) — a generous 1 cm
 *  tolerance catches the small float drift without false positives. */
const ENDPOINT_TOL_M = 0.01;

/** Default plan-mm → world-m projection — matches executePlan's default
 *  (plan-x → world-x; plan-y → world-z; divide by 1000). The caller can
 *  pass a custom projector via `resolveShellWindow` for testing /
 *  non-standard frames. */
export type PlanToWorldXZ = (p: Vec2mm) => { readonly x: number; readonly z: number };

const defaultPlanToWorld: PlanToWorldXZ = (p) => ({ x: p.x / 1000, z: p.y / 1000 });

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
    Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Find the shell wall that matches the given option external wall, plus a
 * flag indicating whether its endpoint orientation is REVERSED relative to
 * the option wall's (start→end) direction.
 *
 * Endpoint matching is unordered: a shell wall and an option wall match if
 * their endpoint sets are within `ENDPOINT_TOL_M`. The `reversed` flag is
 * true when shell.start matches option.end (and shell.end matches
 * option.start), i.e. the shell wall is drawn the other way round; in that
 * case the wiring layer flips the window's offset along the shell.
 *
 * Returns null when no shell wall matches.
 */
export function matchShellHost(
    optionWall: LayoutWall,
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
): { shell: ShellWall; reversed: boolean } | null {
    const a = planToWorld(optionWall.start);
    const b = planToWorld(optionWall.end);
    for (const s of shellWalls) {
        // Same-direction match: shell.start ≈ option.start AND shell.end ≈ option.end
        if (dist(s.start, a) <= ENDPOINT_TOL_M && dist(s.end, b) <= ENDPOINT_TOL_M) {
            return { shell: s, reversed: false };
        }
        // Reverse-direction match: shell.start ≈ option.end AND shell.end ≈ option.start
        if (dist(s.start, b) <= ENDPOINT_TOL_M && dist(s.end, a) <= ENDPOINT_TOL_M) {
            return { shell: s, reversed: true };
        }
    }
    return null;
}

/**
 * Resolve a single engine-emitted window into a ShellWindowDispatch record.
 * Returns null when:
 *   • the window's wallRef is out of range; or
 *   • the host wall is NOT external (no need to bridge — the normal
 *     wallRef → newly-built wall id path handles it); or
 *   • no shell wall matches the host's endpoints.
 *
 * Offset arithmetic mirrors the existing `reversedVsMerged` logic in
 * buildLayoutPlan: when the shell wall is reversed relative to the option
 * wall, the window's offset becomes (wallLen − offset − width) along the
 * shell.
 */
export function resolveShellWindow(
    win: LayoutWindow,
    optionWalls: readonly LayoutWall[],
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
): ShellWindowDispatch | null {
    if (win.wallRef < 0 || win.wallRef >= optionWalls.length) return null;
    const host = optionWalls[win.wallRef]!;
    if (host.isExternal !== true) return null;

    const match = matchShellHost(host, shellWalls, planToWorld);
    if (!match) return null;

    const hostStartW = planToWorld(host.start);
    const hostEndW   = planToWorld(host.end);
    const wallLenM = Math.hypot(hostEndW.x - hostStartW.x, hostEndW.z - hostStartW.z);
    const offsetM_local = win.offset / 1000;
    const widthM = win.width / 1000;
    const offsetM = match.reversed ? (wallLenM - offsetM_local - widthM) : offsetM_local;

    return {
        shellWallId: match.shell.id,
        offsetM:     Math.max(0, offsetM),
        widthM,
        heightM:     win.height / 1000,
        sillM:       win.sillHeight / 1000,
        ...(win.roomType ? { roomType: win.roomType } : {}),
        ...(win.name ? { name: win.name } : {}),
    };
}

/**
 * Resolve all shell-hosted windows in an option. Convenience wrapper —
 * iterates `option.windows`, calls `resolveShellWindow` per item, and
 * flattens. Windows that don't match (interior-side or unmatchable
 * externals) are dropped silently here; the wiring layer surfaces them as
 * warnings against the original list.
 */
export function resolveAllShellWindows(
    windows: readonly LayoutWindow[],
    optionWalls: readonly LayoutWall[],
    shellWalls: readonly ShellWall[],
    planToWorld: PlanToWorldXZ = defaultPlanToWorld,
): readonly ShellWindowDispatch[] {
    const out: ShellWindowDispatch[] = [];
    for (const w of windows) {
        const r = resolveShellWindow(w, optionWalls, shellWalls, planToWorld);
        if (r) out.push(r);
    }
    return out;
}
