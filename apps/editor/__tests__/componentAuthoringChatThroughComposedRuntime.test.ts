/**
 * @vitest-environment happy-dom
 */
// componentAuthoringChatThroughComposedRuntime — §U6-AI-AUTHORING (UI/UX wave, lane U6).
//   UIUX-PLAN §U6 · ADR-0376 D4/D5/D9 · C110 §2.2/§3.5-a/§4.2/§4.4 · C111 §4.1 ·
//   C16 CA-18/CA-21 · C83 §4.3 · §76 gate D · audit R1/R12/R14.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ACCEPTANCE, AT THE LAYER THE USER EXPERIENCES — through the REAL composed
//     runtime and the REAL authoring-chat strips (never a spy, never a DTO echo):
//       · "set width 1500"  → component.setInstanceParameter → CA-21 read-back
//       · "swap to W-600"    → component.swapType            → CA-21 read-back
//       · "make glass width the opening width minus twice the frame width"
//                            → introduce-expression on the draft, diagnostics CLEAN
//       · "place a Casement Unit" → resolves the DEFINITION/TYPE and arms U1's tool;
//                            a nonexistent name REFUSES by naming real items, no placement
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ NOTHING HERE IS A FAKE (R12 / [[fake-more-capable-than-real]]) ─────────
// The runtime is obtained the one way P1 permits (`composeRuntime()` over
// `bootstrapWithEverything`), published to `window.runtime` exactly as
// `engineLauncher` does, the definition rides `packFamily` → the ONE loader into the
// SAME `componentCatalog` singleton the handlers consult (lane U0). Every dispatch is
// driven by the STRIP's `submit` (strip → controller → resolver → bus) and every
// assertion reads the composed store, the draft document, or the placement config —
// never a mock.
//
// ─── ⚠ WHY THIS IS A CHAT STRIP, NOT A GLOBAL CAPABILITY (the measured reason) ─
// `check-chat-capability-coverage`'s case-arm ratchet is AT baseline (30/30, measured
// 2026-09-03); a main-chat capability for these verbs needs a new `applySemanticIntent`
// arm and would fail the gate. So U6 mirrors `FinishTypeChatStrip`: an offline resolver
// dispatching through the surface's EXISTING command path — no new verb, no new arm,
// no global capability row, UNDECLARED stays 0.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import {
    mountComponentChat,
    makeComponentInstanceController,
    makeComponentExpressionController,
    resolveComponentInstanceAsk,
    resolveComponentExpressionAsk,
    type ComponentInstanceChatPort,
} from '../src/ui/component-chat';
import { openComponentDefinitionWorkspace } from '../src/ui/component-editor-workspace';
import { createComponentSection } from '../src/ui/property-panel/ComponentSection.js';
import {
    activatePlacementFromChat,
    enumeratePlaceables,
    resolvePlacement,
} from '../src/ui/ai/chatPlacementActivation.js';
import {
    getActiveComponentPlacement,
    clearActiveComponentPlacement,
} from '../src/engine/views/plantools/activeComponentPlacement.js';

const AUDIT = { actorId: 'component-u6-chat', projectId: 'component-u6-chat', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G6T';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const OCC1 = `component_${ulidN(1)}`;
const DEF_ID = `fam_${ulidN(3)}`;
const TYPE_A = `typ_${ulidN(4)}`;   // CW-1200
const TYPE_B = `typ_${ulidN(5)}`;   // CW-600
const PARAM_WIDTH = `par_${ulidN(7)}`;    // instance, length
const PARAM_OPENING = `par_${ulidN(8)}`;  // instance, length
const PARAM_FRAME = `par_${ulidN(9)}`;    // instance, length
const PARAM_GLASS = `par_${ulidN(10)}`;   // instance, length, default 1050
const PARAM_SILL = `par_${ulidN(11)}`;    // TYPE, length — the refusal probe
const NOW = '2026-09-03T00:00:00.000Z';

const PLACE = {
    componentId: OCC1,
    levelId: LEVEL_ID,
    definitionId: DEF_ID,
    typeId: TYPE_A,
    definitionVersion: '1.0.0',
    origin: { x: 2, y: 0, z: 3 },
    rotation: 0,
} as const;

function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component is undefined on the REAL composed runtime');
    return s;
}
function readBack(id: string): any {
    return store().getState().get(id);
}

async function packedBytes(): Promise<Uint8Array> {
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_OPENING, name: 'OpeningWidth', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_FRAME, name: 'FrameWidth', kind: 'instance', dataType: 'length', defaultValue: 75, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_GLASS, name: 'GlassWidth', kind: 'instance', dataType: 'length', defaultValue: 1050, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_SILL, name: 'SillHeight', kind: 'type', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_A, name: 'CW-1200', values: { [PARAM_WIDTH]: 1200 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
            { id: TYPE_B, name: 'CW-600', values: { [PARAM_WIDTH]: 600 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'Casement Unit',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR06', displayName: 'lane-u6' },
        description: 'lane U6 authoring-chat fixture',
        ifcEntity: 'IfcWindow',
        category: 'Window',
        tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: NOW,
        lastModifiedAt: NOW,
    } as unknown as FamilyManifest;
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error(`packFamily failed: ${(packed as any).message}`);
    return packed.bytes;
}

/** The port a placed instance's strip drives — dispatches through the REAL composed
 *  bus, exactly as `ComponentSection`'s own port does. */
function instancePort(componentId: string): ComponentInstanceChatPort {
    const dispatch = async (cmd: string, payload: unknown): Promise<string | null> => {
        try { await rt.bus.executeCommand(cmd, payload); return null; }
        catch (e) { return e instanceof Error ? e.message : String(e); }
    };
    return {
        view: () => {
            const o = store().getState().get(componentId);
            return o ? (componentCatalog.view(o.definitionId) ?? null) : null;
        },
        definitionRef: () => store().getState().get(componentId)?.definitionId ?? componentId,
        setParameter: (parameterId, value) => dispatch('component.setInstanceParameter', { componentId, parameterId, value }),
        clearParameter: (parameterId) => dispatch('component.setInstanceParameter', { componentId, parameterId, clear: true }),
        swapType: (typeId) => dispatch('component.swapType', { componentId, typeId }),
    };
}

function transcript(host: HTMLElement): string {
    return [...host.querySelectorAll('[data-ccs-bubble="pryzm"]')].map((b) => b.textContent ?? '').join('\n');
}

beforeAll(async () => {
    rt = await composeRuntime({ audit: AUDIT, canvas: null, bootstrapFn: bootstrapWithEverything as never });
    (globalThis as any).window.runtime = rt;
    componentCatalog.clear();
    const loaded = await componentCatalog.loadFromBytes(await packedBytes(), { provenance: 'project' });
    if (!loaded.ok) throw new Error(`[test] catalogue load failed: ${loaded.message}`);
    await rt.bus.executeCommand('component.place', PLACE);
}, BUDGET);

afterAll(() => {
    delete (globalThis as any).window.runtime;
    componentCatalog.clear();
});

describe('§U6-AI-AUTHORING — the Component authoring chat drives the real verbs and the real draft op', () => {

    it('ARM A — "set width 1500" through the STRIP → component.setInstanceParameter → CA-21 read-back', async () => {
        expect(readBack(OCC1), 'the placed occurrence is present').toBeDefined();
        const host = document.createElement('div');
        const handle = mountComponentChat(host, makeComponentInstanceController(instancePort(OCC1)));

        await handle.submit('set width 1500');

        // ⭐ CA-21: the override is read back out of the AUTHORITATIVE store.
        const rec = readBack(OCC1);
        expect(rec.instanceParameters[PARAM_WIDTH], 'the Width override landed in canonical units (mm)').toBe(1500);
        // The chat SAID it did it, and did not warn.
        expect(transcript(host)).toMatch(/set/i);
        expect(host.querySelector('[data-ccs-bubble="pryzm"][data-ccs-tone="warn"]')).toBeNull();
        handle.dispose();
    }, BUDGET);

    it('ARM B — a TYPE parameter refuses BY NAME in chat, and NOTHING is dispatched (C110 §3.5-a / C111)', async () => {
        const before = readBack(OCC1).instanceParameters[PARAM_SILL];
        const host = document.createElement('div');
        const handle = mountComponentChat(host, makeComponentInstanceController(instancePort(OCC1)));

        await handle.submit('set sill height 800');

        // A TYPE parameter is not per-instance overridable — the resolver refuses before
        // the bus, so the store never changed.
        expect(readBack(OCC1).instanceParameters[PARAM_SILL]).toBe(before);
        expect(transcript(host)).toMatch(/TYPE parameter/i);
        handle.dispose();
    }, BUDGET);

    it('ARM C — "swap to CW-600" through the STRIP → component.swapType → CA-21 read-back', async () => {
        const host = document.createElement('div');
        const handle = mountComponentChat(host, makeComponentInstanceController(instancePort(OCC1)));

        await handle.submit('swap to CW-600');

        expect(readBack(OCC1).typeId, 'the type swap landed and reads back from the store').toBe(TYPE_B);
        expect(transcript(host)).toMatch(/swapped/i);
        handle.dispose();
    }, BUDGET);

    it('ARM D — a nonexistent parameter MISSES, naming what IS authorable, and dispatches nothing', async () => {
        const before = JSON.stringify(readBack(OCC1).instanceParameters);
        const host = document.createElement('div');
        const handle = mountComponentChat(host, makeComponentInstanceController(instancePort(OCC1)));
        await handle.submit('set flombix 42');
        expect(JSON.stringify(readBack(OCC1).instanceParameters)).toBe(before);
        expect(transcript(host)).toMatch(/not a parameter|Options:/i);
        handle.dispose();
    }, BUDGET);

    it('ARM E — ⭐ the §64 formula through the STRIP → introduce-expression on the draft, diagnostics CLEAN', async () => {
        const ws = openComponentDefinitionWorkspace(DEF_ID);
        if (!ws.ok) throw new Error(`[test] workspace refused: ${ws.refusal}`);

        // The workspace mounted the authoring chat strip (production wiring proof).
        expect(ws.root.querySelector('[data-cdw-chat-host]'), 'the workspace mounts the authoring chat').not.toBeNull();

        const host = document.createElement('div');
        const handle = mountComponentChat(host, makeComponentExpressionController({
            params: () => ws.document.parameters as any,
            preview: (id, text) => ws.previewExpression(id, text),
            apply: (id, text) => ws.applyExpression(id, text),
        }));

        // ⭐ THE FOUNDER'S §64 SENTENCE, VERBATIM.
        await handle.submit('make glass width the opening width minus twice the frame width');

        const glass = ws.document.parameters.find((p) => p.id === PARAM_GLASS)!;
        expect(glass.expression, 'the authored formula references the parameters BY NAME').toBe('OpeningWidth - 2 * FrameWidth');
        // ADR-0376 D4 — the superseded default was cleared and recorded as provenance.
        expect(glass.defaultValue).toBeNull();
        expect((glass as any).supersededDefault).toBe(1050);
        // The chat confirmed a CLEAN authoring, and never warned about diagnostics.
        expect(transcript(host)).toMatch(/Authored GlassWidth = OpeningWidth - 2 \* FrameWidth/);
        expect(host.querySelector('[data-ccs-bubble="pryzm"][data-ccs-tone="warn"]')).toBeNull();

        ws.close();
        handle.dispose();
    }, BUDGET);

    it('ARM F — an unresolvable operand in a formula REFUSES by name and authors nothing', () => {
        const params = componentCatalog.view(DEF_ID)!.parameters;
        const res = resolveComponentExpressionAsk('make glass width the flooble minus the frame width', params);
        expect(res.kind).toBe('refusal');
        if (res.kind === 'refusal') expect(res.reason).toMatch(/flooble/i);
    }, BUDGET);

    it('ARM G — placement resolves a DEFINITION/TYPE name to its ids and arms U1\'s tool (C83 §4.3 — no guessed position)', () => {
        const placeables = enumeratePlaceables();
        // The loaded definition and both its types are chat-placeable.
        const byType = resolvePlacement('CW-600', placeables);
        expect(byType.outcome).toBe('resolved');
        if (byType.outcome === 'resolved' && byType.entry.kind === 'component') {
            expect(byType.entry.definitionId).toBe(DEF_ID);
            expect(byType.entry.typeId).toBe(TYPE_B);
        } else { throw new Error('CW-600 did not resolve to the component type'); }

        // Arming records the (definitionId, typeId) at the ONE chokepoint U1 owns — and
        // those exact ids produce a store-accepted placement (the loop U1 proves on click).
        clearActiveComponentPlacement();
        activatePlacementFromChat('Casement Unit');
        const active = getActiveComponentPlacement();
        expect(active?.definitionId).toBe(DEF_ID);
        expect(active?.typeId).toBe(TYPE_A); // the definition entry arms its first/default type
    }, BUDGET);

    it('ARM H — an unknown name REFUSES by naming real items and records NO placement (spec §75)', () => {
        clearActiveComponentPlacement();
        const res = resolvePlacement('floober-widget-9000', enumeratePlaceables());
        expect(res.outcome).toBe('no-match');
        const reply = activatePlacementFromChat('floober-widget-9000');
        expect(reply).toMatch(/nothing was activated/i);
        expect(getActiveComponentPlacement(), 'no placement was fabricated for a name that resolves to nothing').toBeNull();
    }, BUDGET);

    it('ARM I — the property section MOUNTS the instance authoring chat (production wiring)', () => {
        const section = createComponentSection({ id: OCC1, type: 'component' });
        expect(section.root.querySelector('[data-cs-chat-host]'), 'the property section mounts the authoring chat').not.toBeNull();
    }, BUDGET);

    it('ARM J — the pure resolver understands "set width 1500" as a Width override (unit test)', () => {
        const view = componentCatalog.view(DEF_ID)!;
        const r = resolveComponentInstanceAsk('set width 1500', view);
        expect(r.kind).toBe('set-parameter');
        if (r.kind === 'set-parameter') {
            expect(r.parameterId).toBe(PARAM_WIDTH);
            expect(r.value).toBe(1500);
        }
    }, BUDGET);
});
