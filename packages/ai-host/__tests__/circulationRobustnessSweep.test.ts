// §CIRCULATION-ROBUSTNESS-SWEEP (founder "think big — must work for ANY layout", 2026-06-21)
//
// NOT a plate-specific test. A LAYOUT-AGNOSTIC property harness: sweep many (shell × program)
// combinations through the REAL enumerate pipeline and MEASURE how often it ships a circulation-
// sound winner (hard-valid + no dropped rooms + every habitable room reachable from the entrance).
//
// Purpose: stop chasing one Almanzora plate. This quantifies the GENERAL robustness of the current
// area-first engine and becomes the ACCEPTANCE METRIC for the corridor-spine-first rebuild
// (ADR-0073): the rebuild is "done" when this sweep's sound-rate approaches 100%. The console
// summary reports the per-rule failure breakdown so the dominant root is visible at a glance.
//
// Deterministic: plates/programs are generated from the index (NO Math.random), so the sweep is
// reproducible. The soft assertion only pins that the harness RAN over a broad set — it does NOT
// hard-gate on the (currently low) sound-rate, so this file documents reality without blocking CI.

import { describe, expect, it } from 'vitest';
import { enumerateLayouts, type EnumerateInput } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const HABITABLE = new Set(['living', 'kitchen', 'dining', 'master', 'bedroom', 'study']);

/** Reads the winning candidate's graph: is every habitable Space reachable from the first Space
 *  through permeable (door / open-threshold) edges? (Mirrors the reach-gate's relation.) */
function everyHabitableReachable(c: ReturnType<typeof enumerateLayouts>[number]): boolean {
    const spaces = c.graph.nodes.filter(n => n.kind === 'Space');
    if (spaces.length === 0) return true;
    const adj = new Map<string, string[]>();
    for (const n of spaces) adj.set(n.guid, []);
    for (const e of c.graph.edges) {
        const permeable = e.kind === 'CONNECTS_THROUGH' || (e.kind === 'ADJACENT_TO' && e.props?.permeable === true);
        if (!permeable) continue;
        adj.get(e.from)?.push(e.to);
        adj.get(e.to)?.push(e.from);
    }
    const root = spaces[0]!.guid;
    const seen = new Set([root]); const q = [root];
    while (q.length) { const cur = q.shift()!; for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
    const typeOf = (n: typeof spaces[number]): string =>
        String(n.attrs?.spaceType ?? n.attrs?.roomType ?? n.attrs?.name ?? '').toLowerCase();
    return spaces.every(n => !HABITABLE.has(typeOf(n)) || seen.has(n.guid));
}

/** A rectangular plate width×depth, optionally skewed into a convex quad by `skew` (m). */
function plate(width: number, depth: number, skew: number): Pt[] {
    return [
        { x: -skew, z: skew * 0.5 }, { x: width + skew * 0.5, z: -skew },
        { x: width - skew, z: depth + skew * 0.6 }, { x: skew * 0.4, z: depth - skew * 0.3 },
    ];
}

describe('§CIRCULATION-ROBUSTNESS-SWEEP — does the engine ship a sound layout for ANY plate?', () => {
    it('sweeps many (shell × program) combos and reports the circulation sound-rate', () => {
        // Each program is paired with FEASIBLE plate areas (≈ its programme size) so the envelope
        // gate passes and the circulation signal isn't drowned by size-mismatch rejects. Area model:
        // ~58 m² public/circulation core + ~34 m² per bedroom. Swept over aspect × skew × area-scale.
        const aspects = [1.0, 1.35, 1.75];
        const skews = [0, 0.8, 1.8];
        const areaScales = [0.92, 1.05, 1.18];
        const programs: ApartmentProgram[] = [
            { bedrooms: 1, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true,  livingRoom: true, entranceHall: true },
            { bedrooms: 2, bathrooms: 1, masterEnSuite: true,  openPlanKitchenDining: true,  livingRoom: true, entranceHall: true },
            { bedrooms: 3, bathrooms: 2, masterEnSuite: true,  openPlanKitchenDining: false, livingRoom: true, entranceHall: true },
            { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true,  livingRoom: true, entranceHall: false },
        ];
        const targetAreaOf = (p: ApartmentProgram): number => 58 + p.bedrooms * 34;

        let total = 0, shipped = 0, hardValid = 0, sound = 0;
        const ruleFails = new Map<string, number>();
        let i = 0;
        for (const prog of programs) for (const a of aspects) for (const sk of skews) for (const scale of areaScales) {
            i++;
            const area = targetAreaOf(prog) * scale;
            const w = Math.sqrt(area / a);          // width × (width·a) = area, aspect a = depth/width
            const poly = plate(w, w * a, sk);
            let out: ReturnType<typeof enumerateLayouts>;
            try {
                out = enumerateLayouts({
                    shellPolygon: poly, program: prog, levelId: 'L1',
                    seed: `sweep-${i}`, weights: WEIGHTS, count: 3,
                } as EnumerateInput);
            } catch { out = []; }
            total++;
            if (out.length === 0) continue;
            shipped++;
            const win = out[0]!;
            if (win.hardValid) hardValid++;
            for (const r of win.hardFailedRules ?? []) ruleFails.set(r, (ruleFails.get(r) ?? 0) + 1);
            const dropped = (win as { droppedRooms?: unknown[] }).droppedRooms ?? [];
            const noDrop = dropped.length === 0;
            if (win.hardValid && noDrop && everyHabitableReachable(win)) sound++;
        }

        const pct = (n: number, d: number): string => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
        const ruleBreakdown = [...ruleFails.entries()].sort((x, y) => y[1] - x[1])
            .map(([r, n]) => `${r}=${n}`).join(', ');
        // eslint-disable-next-line no-console
        console.log(
            `\n[§CIRCULATION-ROBUSTNESS-SWEEP] ${total} FEASIBLE (shell × program) combos:\n` +
            `  shipped a winner:        ${shipped}/${total} (${pct(shipped, total)})\n` +
            `  hard-valid winner:       ${hardValid}/${total} (${pct(hardValid, total)})\n` +
            `  FULLY circulation-sound: ${sound}/${total} (${pct(sound, total)})  of all; ` +
            `${pct(sound, shipped)} of those that shipped  ← drive to 100% (ADR-0073)\n` +
            `  hard-fail rule breakdown: ${ruleBreakdown || '(none)'}\n`,
        );

        // The harness must have RUN over a broad set (the contract that matters here).
        expect(total).toBeGreaterThanOrEqual(100);
        // Regression TRIPWIRE: lock the current fully-sound floor (57/108 at authoring) at a
        // conservative 50 so any change that makes the engine LESS circulation-robust across
        // arbitrary plates fails here. RAISE this toward `total` as the corridor-spine-first
        // rebuild (ADR-0073) lands — that is the acceptance metric.
        expect(sound).toBeGreaterThanOrEqual(50);
    });
});
