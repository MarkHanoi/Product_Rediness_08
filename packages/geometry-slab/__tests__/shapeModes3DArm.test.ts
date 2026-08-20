/**
 * shapeModes3DArm.test — L-1324 / L-1325: THE 3-D ARMS EXIST, so the "plan-only"
 * declarations retire honestly instead of standing forever.
 *
 * ⭐ WHY THIS FILE IS MOSTLY ABOUT `default:` BRANCHES.
 *
 * `ToolManager.activateSlab`'s own header states the hazard verbatim:
 *
 *   "Adding them here is REQUIRED, not cosmetic … a mode this switch did not know
 *    would have fallen through to `default` and silently drawn a 2-point rectangle."
 *
 * That is the failure this whole feature refuses by name — a silent substitution of a
 * rectangle for the shape the user asked for (§L955, C86 PR-9). A UI pill wired to a
 * dispatcher with no case is *worse* than no pill: it reports success and draws the
 * wrong element. So the arms below check the DISPATCH, not just the existence of a
 * method someone could have called.
 *
 * ⚠ These are source assertions. They are weak evidence of geometry and STRONG
 * evidence of REACHABILITY — and reachability, not geometry, is what was missing
 * (`committed ≠ reachable`). The geometry itself is proven by `boundaryLoops.test.ts`
 * against the same functions these paths call.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOUNDARY_LOOP_MODES } from '../src/boundaryLoops';

const REPO = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

const SLAB_TOOL = 'packages/geometry-slab/src/SlabTool.ts';
const SLAB_TYPES = 'packages/geometry-slab/src/SlabTypes.ts';
const WALL_TOOL = 'packages/geometry-wall/src/WallTool.ts';
const WALL_TYPES = 'packages/geometry-wall/src/WallTypes.ts';
const TOOL_MANAGER = 'packages/input-host/src/ToolManager.ts';
const MATRIX = 'apps/editor/src/engine/views/plantools/elementCreationMatrix.ts';
const LAYOUT = 'apps/editor/src/ui/layout/ToolsAreaLayout.ts';

describe('L-1324 — the 3-D SLAB arm exists and is DISPATCHED', () => {
    it('SlabTool declares both entry verbs', () => {
        const s = read(SLAB_TOOL);
        expect(s).toMatch(/public async enterCircularMode\(\)/);
        expect(s).toMatch(/public async enterEllipticalMode\(\)/);
    });

    it('SlabToolMode carries the two members', () => {
        const s = read(SLAB_TYPES);
        expect(s).toMatch(/'CIRCULAR_SLAB'/);
        expect(s).toMatch(/'ELLIPTICAL_SLAB'/);
    });

    // ⭐ C92 SL-Voc-2 closed on the way past: the union had THREE hand-copies.
    it('⭐ SlabToolMode is declared ONCE — the two rival copies now reference it', () => {
        const tool = read(SLAB_TOOL);
        const literal = /'NONE'\s*\|\s*'FLOOR_SKETCH'\s*\|\s*'REGION_SLAB'/;
        expect(literal.test(tool), 'SlabTool still hand-copies the union').toBe(false);
        expect(tool).toMatch(/private activeTool: SlabToolMode/);
        expect(tool).toMatch(/get toolMode\(\): SlabToolMode/);
    });

    // ⛔ THE ONE THAT MATTERS — the header's own warning.
    it('⛔ ToolManager.activateSlab has a CASE for each, so neither falls through to a rectangle', () => {
        const s = read(TOOL_MANAGER);
        const at = s.indexOf('async activateSlab(');
        expect(at).toBeGreaterThan(-1);
        const body = s.slice(at, s.indexOf('async activateWall(', at));
        expect(body).toMatch(/case 'circular':/);
        expect(body).toMatch(/enterCircularMode\(\)/);
        expect(body).toMatch(/case 'elliptical':/);
        expect(body).toMatch(/enterEllipticalMode\(\)/);
        // The mode parameter must accept them, or the call site cannot even type-check.
        expect(body.slice(0, body.indexOf(')'))).toMatch(/'circular' \| 'elliptical'/);
    });

    it('the 3-D commit routes through the SHARED generators, not a private copy', () => {
        const s = read(SLAB_TOOL);
        expect(s).toMatch(/boundaryLoopVertices\(/);
        expect(s).toMatch(/boundaryLoopRefusal\(/);
        // §FEAT-BOUNDARY-SHAPE-DESCRIPTOR — the intent travels with the ring.
        expect(s).toMatch(/describeBoundaryLoop\(/);
    });
});

describe('L-1325 — the 3-D WALL arm exists and is DISPATCHED', () => {
    it('WallDrawingMode carries the three loop members', () => {
        const s = read(WALL_TYPES);
        for (const m of ['RECTANGULAR_LOOP', 'CIRCULAR_LOOP', 'ELLIPTICAL_LOOP']) {
            expect(s, `WallDrawingMode is missing ${m}`).toMatch(new RegExp(`${m} = '${m}'`));
        }
    });

    it('WallTool maps them and commits a run', () => {
        const s = read(WALL_TOOL);
        expect(s).toMatch(/private _loopMode\(\): BoundaryLoopMode \| null/);
        expect(s).toMatch(/private async commitLoopRun\(/);
    });

    // ⭐ The run must reuse the tool's OWN wall creator, not dispatch its own command —
    // otherwise the spatial gate and system-type stamping are silently skipped.
    it('⭐ every edge goes through the tool’s existing createWall, not a new dispatch', () => {
        const s = read(WALL_TOOL);
        const at = s.indexOf('private async commitLoopRun(');
        const body = s.slice(at, s.indexOf('private async onPointerDown', at));
        expect(body).toMatch(/await this\.createWall\(/);
        expect(body).not.toMatch(/executeCommand\(/);
    });

    it('⚠ uses the WALL density policy — a chord is a real wall, not a rendered outline', () => {
        const s = read(WALL_TOOL);
        expect(s).toMatch(/WALL_LOOP_DENSITY/);
        expect(s).not.toMatch(/PLATE_LOOP_DENSITY/);
    });

    // ⛔ Both surfaces or neither: setting one vocabulary leaves the other in its old mode.
    it('⛔ arming a loop pill drives BOTH the picker string AND the 3-D enum', () => {
        const s = read(LAYOUT);
        const at = s.indexOf('onSelectRectangular:');
        expect(at).toBeGreaterThan(-1);
        const body = s.slice(at, at + 1400);
        for (const m of ['RECTANGULAR_LOOP', 'CIRCULAR_LOOP', 'ELLIPTICAL_LOOP']) {
            expect(body, `pill does not activate ${m} in 3-D`).toContain(m);
        }
        expect(body).toMatch(/setActiveMode\?\.\('rectangular'\)/);
        expect(body).toMatch(/setActiveMode\?\.\('circular'\)/);
        expect(body).toMatch(/setActiveMode\?\.\('elliptical'\)/);
    });
});

describe('L-1324 / L-1325 — the declarations RETIRED, they were not left standing', () => {
    it('⛔ the matrix no longer calls either family plan-only', () => {
        const s = read(MATRIX);
        expect(s).not.toMatch(/PLAN-ONLY TODAY/);
        expect(s).not.toMatch(/\(plan view\)'/);
    });

    it('every canonical shape is offered by slab, floor, ceiling AND wall', () => {
        const s = read(MATRIX);
        for (const tool of ['slab', 'floor', 'ceiling', 'wall']) {
            const at = s.indexOf(`tool: '${tool}'`);
            const block = s.slice(at, s.indexOf('autoIn:', at));
            const ids = [...block.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
            // Each family spells its rectangle with its own historic id (L-1322), so only
            // the two curved modes are required to be spelled canonically everywhere.
            for (const shape of BOUNDARY_LOOP_MODES.filter((m) => m !== 'rectangular')) {
                expect(ids, `${tool} does not offer ${shape}`).toContain(shape);
            }
        }
    });

    // ⭐ Curtain wall stays REFUSED — retiring two declarations must not quietly
    // retire the third, which is a measured impossibility, not a missing arm.
    it('⭐ CURTAIN WALL is still NOT offered a shape mode (C87 §13.14 R-11)', () => {
        const s = read(MATRIX);
        const at = s.indexOf(`tool: 'curtain-wall'`);
        expect(at).toBeGreaterThan(-1);
        const block = s.slice(at, s.indexOf('gap:', at));
        const ids = [...block.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
        for (const shape of ['circular', 'elliptical', 'rectangular']) {
            expect(ids, `curtain wall must not offer ${shape}`).not.toContain(shape);
        }
    });
});
