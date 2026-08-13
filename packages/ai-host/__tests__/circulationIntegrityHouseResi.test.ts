// @vitest-environment happy-dom
//
// §CIRCULATION-INTEGRITY-AUDIT — the HOUSE and RESIDENTIAL-BUILDING arms.
// Companion to `circulationIntegrityAudit.test.ts` (the apartment arm); see that file's
// header for the method. The founder named all THREE generators, so all three are measured
// SEPARATELY — they share the TGL door router but NOT the orchestration that decides what
// ships, which is exactly where the defect is expected to differ.
//
// Both orchestrators are driven for real (C74 §3.4):
//   house  → `generateHouseLayout(shell, program, constraints, weights, { storeyCount })`
//            → result.perStoreyLayout[i]  (a ScoredLayoutOption per storey, index-aligned)
//   resi   → `orchestrateResidentialBuilding(input)`
//            → result.perLevelApartments[l].apartments[i].layout
//
// NEITHER orchestrator applies a final circulation gate. Measured, not assumed:
//   - `houseOrchestrator.assembleHouse` pushes the argmax-score option per storey with NO
//     soundness check; its only failure mode is `null` when the engine returned [].
//   - `enumerate.ts` disables the structured empty rejection entirely on the house path
//     (`isHousePath = envelopeValidator !== undefined`, always true for a house storey).
//   - `runApartmentCellLayout` takes `options[0]` unconditionally, and a resi level with
//     rejected cells still ships as `status:'ok'`.
// So a circulation-unsound layout is EXPECTED to ship; the door graph is the only signal.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import {
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
} from '../src/workflows/residentialBuilding/residentialBuildingOrchestrator.js';
import { polygonAreaM2, type ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type {
    ApartmentConstraints, ApartmentProgram, LayoutOption, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';
import { reachability, doorlessRoomNames } from './helpers/circulationPredicates.js';

const CONSTRAINTS: ApartmentConstraints =
    { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights =
    { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

function mkShell(poly: Pt[]): ShellAnalysis {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z);
        x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z);
    }
    return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
}
const rect = (w: number, d: number): Pt[] =>
    [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];

interface Verdict {
    readonly label: string;
    readonly unreached: readonly string[];
    readonly doorless: readonly string[];
}
function judge(label: string, opt: LayoutOption): Verdict {
    return {
        label,
        unreached: reachability(opt).unreachedRoomNames,
        doorless: doorlessRoomNames(opt),
    };
}
const pct = (n: number, d: number): string => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
const sample = (vs: readonly Verdict[], f: (v: Verdict) => readonly string[]): string =>
    vs.slice(0, 5).map(v => `${v.label}: ${f(v).join(',')}`).join(' | ') || '(none)';

describe('§CIRCULATION-INTEGRITY-AUDIT — houseLayout at HEAD', () => {
    it('measures UNREACHABLE-ROOM and DOORLESS-ROOM rates per SHIPPED storey', () => {
        // Deterministic house sweep: realistic plot sizes × 1 and 2 storeys × two programs.
        // Sizes are the founder-scale plates already used by the house suites (12×10, 17.5×13.4).
        const plates: Array<[number, number]> = [[12, 10], [17.491, 13.416], [10, 8], [14, 11]];
        const programs: ApartmentProgram[] = [
            { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
            { bedrooms: 3, bathrooms: 2, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
        ];
        const storeyCounts = [1, 2];

        const verdicts: Verdict[] = [];
        let storeysTotal = 0, storeysNull = 0;
        for (const [w, d] of plates) for (const prog of programs) for (const sc of storeyCounts) {
            const shell = mkShell(rect(w, d));
            const label = `${w}x${d}-b${prog.bedrooms}-s${sc}`;
            let res: ReturnType<typeof generateHouseLayout> | null = null;
            try { res = generateHouseLayout(shell, prog, CONSTRAINTS, WEIGHTS, { storeyCount: sc }); } catch { res = null; }
            if (!res) { continue; }
            res.perStoreyLayout.forEach((opt, i) => {
                storeysTotal++;
                if (!opt) { storeysNull++; return; }
                verdicts.push(judge(`${label}/F${i}`, opt));
            });
        }
        const shipped = verdicts.length;
        const unreachable = verdicts.filter(v => v.unreached.length > 0);
        const doorless = verdicts.filter(v => v.doorless.length > 0);

        // eslint-disable-next-line no-console
        console.log(
            `\n[§CIRCULATION-INTEGRITY-AUDIT · houseLayout] ${storeysTotal} storeys through ` +
            'generateHouseLayout (the production entry):\n' +
            `  storeys that shipped a layout: ${shipped}/${storeysTotal} (${pct(shipped, storeysTotal)}); null: ${storeysNull}\n` +
            `  DEFECT 1 UNREACHABLE ROOM:     ${unreachable.length}/${shipped} (${pct(unreachable.length, shipped)}) of shipped storeys\n` +
            `     e.g. ${sample(unreachable, v => v.unreached)}\n` +
            `  DEFECT 2 DOORLESS ROOM:        ${doorless.length}/${shipped} (${pct(doorless.length, shipped)}) of shipped storeys\n` +
            `     e.g. ${sample(doorless, v => v.doorless)}\n`,
        );

        // COVERAGE pin only — the harness must have driven the real orchestrator broadly.
        expect(storeysTotal).toBeGreaterThanOrEqual(20);
        expect(shipped).toBeGreaterThanOrEqual(20);
    }, 120_000);
});

describe('§CIRCULATION-INTEGRITY-AUDIT — residentialBuilding at HEAD', () => {
    it('measures UNREACHABLE-ROOM and DOORLESS-ROOM rates per SHIPPED apartment', () => {
        const inputs: Array<[string, ResidentialBuildingOrchestratorInput]> = [
            ['founder-38x43', {
                footprint: rect(38, 43), upperLevels: 1,
                coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
                minApartmentAreaM2: 60, maxApartmentAreaM2: 100,
                typologies: { T1: false, T2: true, T3: true, T4: false },
            }],
            ['slab-45x18', {
                footprint: rect(45, 18), upperLevels: 2,
                coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
                minApartmentAreaM2: 55, maxApartmentAreaM2: 95,
                typologies: { T1: true, T2: true, T3: false, T4: false },
            }],
            ['block-30x30', {
                footprint: rect(30, 30), upperLevels: 1,
                coreWidthM: 6, coreDepthM: 5, corridorWidthM: 1.4,
                minApartmentAreaM2: 65, maxApartmentAreaM2: 110,
                typologies: { T1: false, T2: true, T3: true, T4: true },
            }],
        ];

        const verdicts: Verdict[] = [];
        let cellsTotal = 0, cellsRejected = 0, cellsNoLayout = 0, buildingsRejected = 0;
        for (const [label, input] of inputs) {
            const r = orchestrateResidentialBuilding(input);
            if (r.status !== 'ok') { buildingsRejected++; continue; }
            for (const lvl of r.perLevelApartments) {
                for (let i = 0; i < lvl.apartments.length; i++) {
                    const apt = lvl.apartments[i]!;
                    cellsTotal++;
                    if (apt.status !== 'ok') { cellsRejected++; continue; }
                    if (!apt.layout) { cellsNoLayout++; continue; }
                    verdicts.push(judge(`${label}/L${lvl.levelIndex}/A${i}`, apt.layout));
                }
            }
        }
        const shipped = verdicts.length;
        const unreachable = verdicts.filter(v => v.unreached.length > 0);
        const doorless = verdicts.filter(v => v.doorless.length > 0);

        // eslint-disable-next-line no-console
        console.log(
            `\n[§CIRCULATION-INTEGRITY-AUDIT · residentialBuilding] ${inputs.length} buildings ` +
            `(${buildingsRejected} refused), ${cellsTotal} apartment cells through ` +
            'orchestrateResidentialBuilding (the production entry):\n' +
            `  cells with a shipped layout:   ${shipped}/${cellsTotal} (${pct(shipped, cellsTotal)}); ` +
            `rejected ${cellsRejected}, ok-but-no-layout ${cellsNoLayout}\n` +
            `  DEFECT 1 UNREACHABLE ROOM:     ${unreachable.length}/${shipped} (${pct(unreachable.length, shipped)}) of shipped apartments\n` +
            `     e.g. ${sample(unreachable, v => v.unreached)}\n` +
            `  DEFECT 2 DOORLESS ROOM:        ${doorless.length}/${shipped} (${pct(doorless.length, shipped)}) of shipped apartments\n` +
            `     e.g. ${sample(doorless, v => v.doorless)}\n`,
        );

        expect(cellsTotal).toBeGreaterThan(0);
        expect(shipped).toBeGreaterThan(0);
    }, 180_000);

    // ARM 1b — BUILDING-SCALE circulation. The arm above measures INSIDE each apartment only.
    // For a residential building the founder's "the corridor doesn't reach" also has an
    // inter-unit meaning: the shared core/corridor must reach EVERY unit's front door
    // (§CORRIDOR-STAIR-CONTIGUITY at building scale). The engine already computes this as
    // `ApartmentCell.coreReachable` (§RESI-CORE-CIRCULATION) — but it is OPTIONAL and defaults
    // to true, so an absent value is indistinguishable from a pass. Both are reported.
    it('measures BUILDING-SCALE core reachability + entry-door placement per unit', () => {
        const inputs: Array<[string, ResidentialBuildingOrchestratorInput]> = [
            ['founder-38x43', {
                footprint: rect(38, 43), upperLevels: 1,
                coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
                minApartmentAreaM2: 60, maxApartmentAreaM2: 100,
                typologies: { T1: false, T2: true, T3: true, T4: false },
            }],
            ['slab-45x18', {
                footprint: rect(45, 18), upperLevels: 2,
                coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
                minApartmentAreaM2: 55, maxApartmentAreaM2: 95,
                typologies: { T1: true, T2: true, T3: false, T4: false },
            }],
            ['block-30x30', {
                footprint: rect(30, 30), upperLevels: 1,
                coreWidthM: 6, coreDepthM: 5, corridorWidthM: 1.4,
                minApartmentAreaM2: 65, maxApartmentAreaM2: 110,
                typologies: { T1: false, T2: true, T3: true, T4: true },
            }],
        ];
        let cells = 0, orphaned = 0, unknownReach = 0, noDoorOffset = 0;
        const orphanLabels: string[] = [];
        for (const [label, input] of inputs) {
            const r = orchestrateResidentialBuilding(input);
            if (r.status !== 'ok') continue;
            for (const lvl of r.perLevelApartments) {
                for (let i = 0; i < lvl.apartments.length; i++) {
                    const c = lvl.apartments[i]!.cell;
                    cells++;
                    if (c.coreReachable === undefined) unknownReach++;
                    else if (c.coreReachable === false) { orphaned++; orphanLabels.push(`${label}/L${lvl.levelIndex}/A${i}`); }
                    if (c.coreDoorOffset === undefined) noDoorOffset++;
                }
            }
        }
        // eslint-disable-next-line no-console
        console.log(
            `\n[§CIRCULATION-INTEGRITY-AUDIT · residentialBuilding BUILDING-SCALE] ${cells} units:\n` +
            `  coreReachable === false (ORPHANED from the core): ${orphaned}/${cells} (${pct(orphaned, cells)})` +
            `${orphanLabels.length ? ` — ${orphanLabels.slice(0, 5).join(', ')}` : ''}\n` +
            `  coreReachable UNSET (defaults true — UNPROVEN):   ${unknownReach}/${cells} (${pct(unknownReach, cells)})\n` +
            `  no §RESI-CORE-DOOR entry offset computed:         ${noDoorOffset}/${cells} (${pct(noDoorOffset, cells)})\n`,
        );
        expect(cells).toBeGreaterThan(0);
    }, 180_000);
});
