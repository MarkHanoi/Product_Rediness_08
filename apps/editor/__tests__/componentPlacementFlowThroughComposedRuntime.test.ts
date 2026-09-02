/**
 * @vitest-environment happy-dom
 */
// componentPlacementFlowThroughComposedRuntime — Lane U1 (§COMPONENT-PLACE-TOOL /
// §COMPONENT-BROWSER). UIUX-PLAN §U1 · ADR-0376 D5/D9/D10 · C16 CA-18/CA-21 ·
// C111 §1.1-a/§3.1 · spec §59/§63/§75 · C84 §3.5.1 axis 4.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE USER'S CLICK-TO-PLACE PATH, END TO END, ON THE REAL COMPOSED RUNTIME.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `componentJoinThroughComposedRuntime.test.ts` proves the VERB lands and persists;
// its own caveat 2 says what it does not prove: *"That a CLICK places one. There is
// no plan-view tool for this family yet."* THIS file is that missing half, at the
// layer the user touches ([[committed-is-not-reachable]], C109 R-9's rule shape):
//
//   REAL browser panel DOM → the REAL "Place" button → `armComponentPlaceTool` (the
//   ONE arming function both create surfaces route to) → the REAL split-view plan
//   overlay armed via `activatePlanOnlyToolOrExplain` → a REAL DOM `MouseEvent` on
//   the canvas → `ComponentPlanToolHandler` → `component.place` on the REAL bus from
//   `composeRuntime()` → ⭐ CA-21 READ-BACK out of `rt.stores.component` — the store
//   the serializer saves from. Never `success: true`, a spy on the bus, or a
//   constructed store.
//
// ⛔ WHY THE SPLIT-VIEW OVERLAY: the founder's working layout is 3-D left / plan
// right and his console names `SvpPlanToolOverlay` (`bathroomPodPointerReach.spec.ts`
// records the lesson). Both overlays build their handler map from the ONE registry
// (L-73), so the armed capability set is identical by construction.
//
// ─── WHAT IS STUBBED, DECLARED ─────────────────────────────────────────────────
// The 2-D canvas context (happy-dom returns null and the overlay refuses to arm on
// a null context — unrelated to the subject); `window.wallStore` / `bimManager` /
// `selectionManager` / `toolManager` (overlay-attach collaborators, exactly the
// bathroomPod pointer spec's set). ⭐ THE BUS IS NOT STUBBED — `window.runtime` IS
// the composed runtime, so every dispatch below is the production dispatch.
//
// ─── WHAT THIS FILE DOES NOT PROVE — stated, so a green is not over-read ───────
//  1. That a placed component RENDERS in the production viewport. Lane 4E's
//     `ComponentCommitter` mount is descoped (ADR-0376 D10) and its absence is
//     REPORTED in the lane findings, not worked around here.
//  2. That the PALETTE ROWS reach `openComponentBrowser()` — the rows are
//     dynamic-import actions inside two large layout builders; this file starts at
//     the browser panel those rows open. The rewire is grep-asserted in the lane
//     findings (`familyCreatorPlaceholder` → removal notes only).

import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY ATTACHES (happy-dom's
// getContext('2d') is null; both overlays treat that as "cannot build a draw
// context" and refuse to arm — the bathroomPod spec's finding, inherited).
(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
    function getContext(): unknown {
        return new Proxy(
            {},
            {
                get: (_t, _prop) => (..._args: unknown[]): unknown => undefined,
                set: () => true,
            },
        );
    };
// §R3-SENTINEL — both overlays refuse to arm any handler until init completes.
(window as unknown as { __pryzmInitComplete: boolean }).__pryzmInitComplete = true;

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import { svpPlanToolOverlay } from '../src/engine/views/SvpPlanToolOverlay';
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel';
import { endPlanOnlyToolSession } from '../src/ui/create/activatePlanOnlyTool';
import { clearActiveComponentPlacement } from '../src/engine/views/plantools/activeComponentPlacement';

const AUDIT = { actorId: 'component-place-flow', projectId: 'component-place-flow', clientId: 'node' } as const;
const BUDGET = 600_000;
const VIEW_ID = 'vd-component-place-flow';
const LEVEL_ID = 'level-1';
const PPU = 50; // screen px per world metre on the stub plan canvas

// ── IDS — real prefixed ULIDs (C111 §1.1-a; Crockford base32, no I/L/O/U) ──────
const ULID_STEM = '01BXZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_A = `typ_${ulidN(2)}`;
const TYPE_B = `typ_${ulidN(3)}`;
const PARAM_WIDTH = `par_${ulidN(4)}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let canvas: HTMLCanvasElement;
let panel: ComponentBrowserPanel | null = null;

const planCanvasStub = {
    screenToWorld: (sx: number, sy: number) => ({ worldX: sx / PPU, worldZ: sy / PPU }),
    worldToScreen: (x: number, z: number) => ({ sx: x * PPU, sy: z * PPU }),
    getPixelsPerUnit: () => PPU,
};

/** ⛔ Read off `rt`, NEVER constructed — a store this file built could falsify nothing. */
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) {
        throw new Error('[test] runtime.stores.component missing on the REAL composed runtime.');
    }
    return s;
}
function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
}

/** The fixture definition — authored here through `packFamily` → the ONE loader
 *  (⚠ there is no corpus, C111 §3.1 — stated, not hidden). */
async function loadFixtureDefinition(): Promise<void> {
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_A, name: 'S-900', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
            { id: TYPE_B, name: 'S-1200', values: { [PARAM_WIDTH]: 1200 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'U1FixtureShelf',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'lane-u1' },
        description: 'componentPlacementFlow fixture',
        ifcEntity: 'IfcFurniture',
        category: 'Furniture',
        tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: '2026-09-02T00:00:00.000Z',
        lastModifiedAt: '2026-09-02T00:00:00.000Z',
    } as unknown as FamilyManifest;
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error(`[test] packFamily failed: ${(packed as { message?: string }).message}`);
    const loaded = await componentCatalog.loadFromBytes(packed.bytes, { provenance: 'project' });
    if (!loaded.ok) throw new Error(`[test] catalogue load failed: ${loaded.message}`);
}

// ── Pointer helpers (real DOM events, the bathroomPod idiom) ──────────────────
const px = (worldX: number, worldZ: number): { clientX: number; clientY: number } => ({
    clientX: worldX * PPU,
    clientY: worldZ * PPU,
});
const enterPane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseenter')); };
const click = (worldX: number, worldZ: number): void => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, ...px(worldX, worldZ), bubbles: true }));
};

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });

    // ⭐ THE REAL RUNTIME ON THE REAL SEAM. `SvpPlanToolOverlay._buildCtx()` threads
    // `window.runtime` into the handler ctx (§P4.1), so this line is what makes the
    // click below dispatch on the PRODUCTION bus rather than a stub.
    const w = window as unknown as Record<string, unknown>;
    w.runtime = rt;
    // Overlay-attach collaborators (the bathroomPod pointer spec's declared set).
    const levels = [{ id: LEVEL_ID, elevation: 0 }];
    w.wallStore = { getAll: () => [], getLevels: () => levels };
    w.bimManager = { getLevelById: () => ({ elevation: 0 }), getLevels: () => levels };
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null, selectedObject: undefined };
    w.toolManager = { getActiveTool: () => 'none', subscribe: () => (): void => undefined };

    viewDefinitionStore.create({
        id: VIEW_ID,
        name: 'Component place flow probe',
        viewType: 'plan',
        spatial: { levelId: LEVEL_ID },
    });

    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    canvas.getBoundingClientRect = (): DOMRect =>
        ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);

    componentCatalog.clear();
}, BUDGET);

afterEach(() => {
    panel?.close();
    panel = null;
    endPlanOnlyToolSession();
    clearActiveComponentPlacement();
});

afterAll(() => {
    endPlanOnlyToolSession();
    svpPlanToolOverlay.detach();
    canvas?.remove();
    componentCatalog.clear();
});

describe('§COMPONENT-PLACE-TOOL — browser → place tool → plan click → CA-21 read-back', () => {

    it('ARM A — the browser renders the HONEST EMPTY STATE with the load affordance, then the LOADED state via subscribe()', async () => {
        componentCatalog.clear();
        panel = new ComponentBrowserPanel();
        panel.open();

        // ⭐ Empty is an ANSWER: the sentence + the live route forward, on screen.
        const empty = document.querySelector('[data-component-browser-empty]');
        expect(empty, 'the honest empty state must render').not.toBeNull();
        expect(empty!.textContent).toContain('No Component definitions are loaded');
        expect(
            document.querySelector('[data-component-browser-load]'),
            'the file-open affordance (the catalogue leg that exists) must be offered',
        ).not.toBeNull();
        // D5 — the panel's copy says Component, never Family.
        expect(document.getElementById('pryzm-component-browser')!.textContent).not.toMatch(/family/i);

        // Load WHILE OPEN — the subscribe() leg re-renders without reopening.
        await loadFixtureDefinition();

        expect(document.querySelector('[data-component-browser-empty]'), 'empty state must yield').toBeNull();
        const card = document.querySelector(`[data-component-browser-definition="${DEF_ID}"]`);
        expect(card, 'the loaded definition must be listed').not.toBeNull();
        expect(card!.querySelector('[data-component-browser-name]')!.textContent).toBe('U1FixtureShelf');
        expect(
            card!.querySelector('[data-component-browser-provenance="project"]'),
            'the provenance chip renders the recorded fact',
        ).not.toBeNull();
        expect(card!.querySelectorAll('[data-component-browser-type]').length, 'both types listed').toBe(2);
    }, BUDGET);

    it('ARM B — ⭐⭐ the REAL Place button arms the plan tool; ONE plan click lands ONE occurrence, READ BACK OUT OF THE AUTHORITATIVE STORE', async () => {
        wipe();
        expect(store().getState().size, 'store must start EMPTY or the count proves nothing').toBe(0);
        if (!componentCatalog.has(DEF_ID)) await loadFixtureDefinition();

        panel = new ComponentBrowserPanel();
        panel.open();
        const placeBtn = document.querySelector<HTMLButtonElement>(
            `[data-component-browser-place="${DEF_ID}:${TYPE_A}"]`,
        );
        expect(placeBtn, 'the type row must carry its Place button').not.toBeNull();

        // ⭐ THE REAL BUTTON, not a direct handler call — L-5709: a button can arm a
        // legacy path, so the button IS the subject.
        placeBtn!.click();

        expect(panel.isOpen(), 'the browser closes once a plan surface takes the tool').toBe(false);
        enterPane();
        expect(svpPlanToolOverlay.isPlacing(), 'the overlay must report an armed placement tool').toBe(true);

        // One REAL mousedown at world (2, 3).
        click(2, 3);
        await vi.waitFor(() => expect(store().getState().size).toBe(1), { timeout: 10_000 });

        // ⛔ THE ASSERTION THAT MATTERS — CA-21: the record, out of the store the
        // serializer saves from. Never the dispatch result.
        const placed = [...store().getState().values()][0] as Record<string, unknown>;
        expect(placed.type).toBe('component');
        expect(placed.definitionId, 'the definition half of the join').toBe(DEF_ID);
        expect(placed.typeId, 'the type the Place button chose').toBe(TYPE_A);
        expect(placed.levelId, 'the storey comes from the view definition').toBe(LEVEL_ID);
        expect(placed.origin, 'the CLICK’s world metres (D3)').toEqual({ x: 2, y: 0, z: 3 });
        expect(placed.definitionVersion, 'semver recorded as provenance').toBe('1.0.0');
        expect(String(placed.id)).toMatch(/^component_[0-9A-HJKMNP-TV-Z]{26}$/);

        // Multi-placement: the tool STAYS armed (the furniture idiom).
        click(4, 5);
        await vi.waitFor(() => expect(store().getState().size).toBe(2), { timeout: 10_000 });
        const origins = [...store().getState().values()].map((r: any) => r.origin);
        expect(origins).toContainEqual({ x: 4, y: 0, z: 5 });
    }, BUDGET);

    it('ARM C — NEGATIVE CONTROL (spec §75 / CA-18): with the catalogue EMPTIED, the SAME click REFUSES BY NAME on the live toast channel and writes NOTHING', async () => {
        wipe();
        if (!componentCatalog.has(DEF_ID)) await loadFixtureDefinition();

        // Arm through the real button, then pull the definition out from under the
        // armed tool — the catalogue-refusal path the U0 seam owns.
        panel = new ComponentBrowserPanel();
        panel.open();
        document
            .querySelector<HTMLButtonElement>(`[data-component-browser-place="${DEF_ID}:${TYPE_A}"]`)!
            .click();
        componentCatalog.clear();

        const toastSpy = vi.spyOn(rt.toasts as { show: (...a: unknown[]) => unknown }, 'show');
        try {
            enterPane();
            click(6, 6);
            // ⭐ The refusal is the BUS'S OWN SENTENCE (lane U0's named refusal),
            // surfaced on the ONE subscriber-backed channel (L-7005) — never a
            // silent no-op click.
            await vi.waitFor(() => {
                const messages = toastSpy.mock.calls.map((c) => String(c[0]));
                expect(
                    messages.some(
                        (m) => m.includes('names no definition loaded') && m.includes(DEF_ID),
                    ),
                    `expected the catalogue refusal naming ${DEF_ID}; saw: ${JSON.stringify(messages)}`,
                ).toBe(true);
            }, { timeout: 10_000 });
            expect(store().getState().size, 'a refused placement must write NOTHING').toBe(0);
        } finally {
            toastSpy.mockRestore();
        }
    }, BUDGET);

    it('ARM D — placing with NOTHING SELECTED refuses by name (no guessed definition, ever)', async () => {
        wipe();
        clearActiveComponentPlacement();
        // Arm the tool directly at the overlay seam (the browser cannot offer a
        // Place with nothing loaded — this arm covers the state a stale session
        // could still reach).
        svpPlanToolOverlay.setActiveTool('component');
        const toastSpy = vi.spyOn(rt.toasts as { show: (...a: unknown[]) => unknown }, 'show');
        try {
            enterPane();
            click(1, 1);
            await vi.waitFor(() => {
                const messages = toastSpy.mock.calls.map((c) => String(c[0]));
                expect(
                    messages.some((m) => m.includes('No Component is selected to place')),
                    `expected the no-selection refusal; saw: ${JSON.stringify(messages)}`,
                ).toBe(true);
            }, { timeout: 10_000 });
            expect(store().getState().size).toBe(0);
        } finally {
            toastSpy.mockRestore();
        }
    }, BUDGET);
});
