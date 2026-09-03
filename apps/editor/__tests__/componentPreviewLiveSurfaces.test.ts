/**
 * @vitest-environment happy-dom
 */
// componentPreviewLiveSurfaces — §COMPONENT-PREVIEW (UI/UX wave, lane U5).
//   UIUX-PLAN §U3/§U1 · ADR-0376 D5/D10 · L-127 · spec §64/§75 · C84 EI-9.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE §64 DEMO, MADE VISUAL, AT THE LAYER THE USER EXPERIENCES: load the
//     Window through packFamily → the ONE catalogue; open the REAL definition
//     workspace; the live preview evaluates the draft through the ONE bake
//     (`bakeFamilyInstance`) — author `GlassWidth = Width - 2*FrameWidth` and the
//     GLASS MESH goes 1.000 m → 1.050 m; switch the scope to the W-1400 type and
//     it goes to 1.250 m. Then the honest half: break the formula and the canvas
//     is TORN DOWN behind the resolver's own diagnostic — never a stale shape.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── WHAT IS REAL HERE ─────────────────────────────────────────────────────────
// The definition rides `packFamily` → `componentCatalog.loadFromBytes` (the ONE
// loader); the workspace is the production opener; every edit goes through the
// REAL family-migrations ops; every preview number is read back out of the
// bake's own buffers (re-measured independently). The browser panel is the real
// panel and its thumbnail leg runs the REAL renderer path — which, under
// happy-dom, has NO WebGL: the assertion is that the card NAMES that draw-level
// cause (`no-webgl`), which simultaneously proves the EVALUATION succeeded (an
// unevaluable definition names its resolver reason instead).
//
// ─── WHAT THIS FILE DOES NOT PROVE — stated, so a green is not over-read ───────
//  1. Pixels. happy-dom provides no GL context; a mocked one would be a fake
//     more capable than the real thing. Draw honesty is pinned in
//     `ElementPreviewFailureReporting.spec.ts`; the subject numbers here.
//  2. Bus verbs. No verb is dispatched — placement acceptance lives in
//     `componentPlacementFlowThroughComposedRuntime.test.ts`.

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';

import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
// ⭐ The SAME singleton PluginRegistry injects into the handlers (lane U0).
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import {
    openComponentDefinitionWorkspace,
    type ComponentDefinitionWorkspaceHandle,
} from '../src/ui/component-editor-workspace/index.js';
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel.js';
import { isMeshPart, type PreviewMeshPart } from '../src/ui/element-preview/OpeningPreviewSubject.js';

const BUDGET = 600_000;

/* ── ids — real prefixed ULIDs (the packer's Zod schemas enforce them) ── */
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5T';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const DEF_ID = `fam_${ulidN(90)}`;
const TYPE_STD = `typ_${ulidN(91)}`;    // W-1200
const TYPE_WIDE = `typ_${ulidN(92)}`;   // W-1400
const P_WIDTH = `par_${ulidN(93)}`;
const P_HEIGHT = `par_${ulidN(94)}`;
const P_FRAME = `par_${ulidN(95)}`;
const P_GLASS = `par_${ulidN(96)}`;
const PLANE_ID = `plane_${ulidN(97)}`;
const PROF_FRAME = `prof_${ulidN(98)}`;
const PROF_GLASS = `prof_${ulidN(99)}`;
const SOL_FRAME = `sol_${ulidN(100)}`;
const SOL_GLASS = `sol_${ulidN(101)}`;
const NOW = '2026-09-03T00:00:00.000Z';

/** The §64 premise: `GlassWidth` starts as a plain default (1000 mm) with NO
 *  expression — the formula arrives THROUGH the workspace. The glazing profile
 *  is bound to it (`x: 'GlassWidth'`, spec §67 expression coordinates), so the
 *  formula's arrival is measurable in the MESH, not only in the table. */
async function packedBytes(): Promise<Uint8Array> {
    const bare = (n: number): string => ulidN(n);
    const emptyChecksum = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [
            { id: PLANE_ID, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
        ],
        parameters: [
            { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: P_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
            { id: P_FRAME, name: 'FrameWidth', kind: 'type', dataType: 'length', defaultValue: 75, expression: null, ifcMapping: null, exposed: true },
            { id: P_GLASS, name: 'GlassWidth', kind: 'instance', dataType: 'length', defaultValue: 1000, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [
            {
                id: PROF_FRAME, name: 'WindowFrame', planeId: PLANE_ID,
                entities: [
                    { id: bare(110), kind: 'point', data: { x: 0, z: 0 } },
                    { id: bare(111), kind: 'point', data: { x: 'Width', z: 0 } },
                    { id: bare(112), kind: 'point', data: { x: 'Width', z: 'Height' } },
                    { id: bare(113), kind: 'point', data: { x: 0, z: 'Height' } },
                ],
                constraints: [],
            },
            {
                id: PROF_GLASS, name: 'Glazing', planeId: PLANE_ID,
                entities: [
                    { id: bare(114), kind: 'point', data: { x: 0, z: 0 } },
                    { id: bare(115), kind: 'point', data: { x: 'GlassWidth', z: 0 } },
                    { id: bare(116), kind: 'point', data: { x: 'GlassWidth', z: 'Height - 2 * FrameWidth' } },
                    { id: bare(117), kind: 'point', data: { x: 0, z: 'Height - 2 * FrameWidth' } },
                ],
                constraints: [],
            },
        ],
        solids: [
            {
                id: SOL_FRAME, kind: 'extrude', profileId: PROF_FRAME, materialSlotId: null,
                lod: { coarse: false, medium: true, fine: true },
                lengthExpression: 'FrameWidth', direction: { x: 0, y: 1, z: 0 },
            },
            {
                id: SOL_GLASS, kind: 'extrude', profileId: PROF_GLASS, materialSlotId: null,
                lod: { coarse: false, medium: true, fine: true },
                lengthExpression: '25', direction: { x: 0, y: 1, z: 0 },
            },
        ],
        materialSlots: [],
        types: [
            { id: TYPE_STD, name: 'W-1200', values: { [P_WIDTH]: 1200 }, checksum: emptyChecksum },
            { id: TYPE_WIDE, name: 'W-1400', values: { [P_WIDTH]: 1400 }, checksum: emptyChecksum },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'U5 Window',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASU05', displayName: 'lane-u5' },
        description: 'lane U5 live-preview fixture',
        ifcEntity: 'IfcWindow',
        category: 'Window',
        tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: NOW,
        lastModifiedAt: NOW,
    } as unknown as FamilyManifest;
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error(`packFamily failed: ${(packed as { message?: string }).message}`);
    return packed.bytes;
}

beforeAll(async () => {
    const loaded = await componentCatalog.loadFromBytes(await packedBytes(), { provenance: 'project' });
    if (!loaded.ok) {
        throw new Error(`fixture load failed: ${(loaded as { message?: string }).message ?? (loaded as { reason?: string }).reason}`);
    }
}, BUDGET);

afterAll(() => {
    componentCatalog.remove(DEF_ID);
});

/* ── read-back helpers ── */
function previewState(root: HTMLElement): string | null {
    return root.querySelector('[data-component-preview]')
        ?.getAttribute('data-component-preview-state') ?? null;
}
/** The GLASS mesh's measured x-span, straight off the bake's buffers. */
function glassWidthOf(ws: ComponentDefinitionWorkspaceHandle): number {
    const res = ws.previewResult();
    if (res === null || !res.ok) throw new Error(`preview is not ok: ${JSON.stringify(res)}`);
    const parts = (res.subject.parts as readonly PreviewMeshPart[]).filter(isMeshPart);
    const glass = parts[1];
    if (!glass) throw new Error('no glass part in the subject');
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < glass.position.length; i += 3) {
        const v = glass.position[i]!;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return max - min;
}

let ws: ComponentDefinitionWorkspaceHandle;

describe('§COMPONENT-PREVIEW — the workspace live loop (the §64 demo, visual)', () => {
    it('⭐⭐ OPEN: the workspace mounts the preview and the FIRST evaluation renders the loaded document — glass at its 1000 mm default → 1.000 m of mesh', async () => {
        const res = openComponentDefinitionWorkspace(DEF_ID);
        expect(res.ok, !res.ok ? res.refusal : '').toBe(true);
        if (!res.ok) return;
        ws = res;
        expect(ws.root.querySelector('[data-cdw-preview-host]')).not.toBeNull();
        await ws.previewSettled();
        expect(previewState(ws.root)).toBe('ok');
        expect(glassWidthOf(ws)).toBeCloseTo(1.0, 6);
    }, BUDGET);

    it('⭐⭐ THE FORMULA ARRIVES: applyExpression(`Width - 2 * FrameWidth`) through the REAL op → the glass mesh SHRINKS to 1.050 m — §64, visual', async () => {
        const refusal = await ws.applyExpression(P_GLASS, 'Width - 2 * FrameWidth');
        expect(refusal).toBeNull();
        await ws.previewSettled();
        expect(previewState(ws.root)).toBe('ok');
        expect(glassWidthOf(ws)).toBeCloseTo(1.05, 6);
    }, BUDGET);

    it('⭐ SCOPE SWITCH: the W-1400 type re-evaluates the SAME formula → 1.250 m', async () => {
        ws.setScope(TYPE_WIDE);
        await ws.previewSettled();
        expect(previewState(ws.root)).toBe('ok');
        expect(glassWidthOf(ws)).toBeCloseTo(1.25, 6);
    }, BUDGET);

    it('⭐⭐ HONEST DEGRADATION: a formula naming a parameter that does not exist tears the canvas down behind the resolver\'s own diagnostic — and RECOVERS when the bad edit is deleted', async () => {
        // A FRESH parameter (introduce-expression refuses to overwrite an
        // existing formula — its own guard, proven by the U3 suite), broken on
        // purpose: `Ghost` names nothing, so the RESOLVER refuses the pass.
        const addRefusal = await ws.submitAddParameter({
            name: 'Reveal', dataType: 'length', kind: 'instance', defaultRaw: '',
        });
        expect(addRefusal).toBeNull();
        const revealId = ws.document.parameters.find((p) => p.name === 'Reveal')?.id;
        expect(revealId).toBeDefined();
        const refusal = await ws.applyExpression(revealId!, 'Ghost * 2');
        expect(refusal, 'the op applies; unknown-identifier is the RESOLVER\'s verdict (U3 ARM 5)').toBeNull();
        await ws.previewSettled();
        expect(previewState(ws.root)).toBe('refused');
        // ⛔ the stale-shape rule: no canvas remains under the stage.
        expect(ws.root.querySelector('[data-component-preview-stage] canvas')).toBeNull();
        const refusalEl = ws.root.querySelector('[data-component-preview-refusal]') as HTMLElement;
        expect(refusalEl.getAttribute('data-component-preview-refusal-reason')).toBe('resolver-failed');
        expect(refusalEl.textContent).toContain('unknown-identifier');

        const back = await ws.applyDeleteParameter(revealId!);
        expect(back).toBeNull();
        await ws.previewSettled();
        expect(previewState(ws.root)).toBe('ok');
        expect(glassWidthOf(ws)).toBeCloseTo(1.25, 6);
        ws.close();
    }, BUDGET);
});

describe('§COMPONENT-PREVIEW — the browser card thumbnail (real panel, real renderer path)', () => {
    it('⭐ each card carries a thumbnail box, and under happy-dom (no WebGL) it NAMES the draw-level cause — which also proves the evaluation itself succeeded', async () => {
        // The REAL draw path coalesces through the frame scheduler; the render
        // bootstrap normally starts it, so start it here the same way
        // (`bootstrap.render.everything.ts:258`).
        getFrameScheduler().start();

        const panel = new ComponentBrowserPanel();
        panel.open();
        const thumb = document.querySelector(
            `[data-component-browser-thumb="${DEF_ID}"]`,
        ) as HTMLElement | null;
        expect(thumb, 'the card renders its thumbnail box synchronously').not.toBeNull();

        await vi.waitFor(
            () => {
                const state = thumb!.getAttribute('data-component-browser-thumb-state');
                if (state === null) throw new Error('thumbnail still resolving');
                return state;
            },
            { timeout: 30_000 },
        );
        expect(thumb!.getAttribute('data-component-browser-thumb-state')).toBe('refused');
        // 'no-webgl' — a DRAW-level cause. An unevaluable definition would name
        // its resolver reason here instead; the two must never look the same.
        expect(thumb!.getAttribute('data-component-browser-thumb-reason')).toBe('no-webgl');
        expect(thumb!.title.length).toBeGreaterThan(0);
        panel.close();
    }, BUDGET);
});
