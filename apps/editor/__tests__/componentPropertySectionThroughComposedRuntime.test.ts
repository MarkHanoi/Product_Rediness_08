/**
 * @vitest-environment happy-dom
 */
// componentPropertySectionThroughComposedRuntime — §U2-COMPONENT-SECTION (UI/UX wave, lane U2).
//   UIUX-PLAN §U2 · ADR-0376 D4/D5/D9 · C110 §2.2/§2.4/§2.5/§3.3 · C111 §4.1 ·
//   C16 CA-3/CA-18/CA-21 · C84 EI-1/EI-9 · spec §66 F-2 (at the panel) · audit R12/R14.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ACCEPTANCE, AT THE LAYER THE USER EXPERIENCES: select a placed component
//     → the panel renders definition name, type dropdown, parameter rows WITH their
//     C110 §2.2 source badges → a type change and a row edit ride the two live verbs
//     and read back from the authoritative store (CA-21) → a foreign type's refusal
//     REACHES THE PANEL, naming both ids.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ NOTHING HERE IS A FAKE (R12 / [[fake-more-capable-than-real]]) ─────────
// The runtime is obtained the one way P1 permits (`composeRuntime()` over
// `bootstrapWithEverything`), published to `window.runtime` exactly as
// `engineLauncher` publishes it, the definition rides `packFamily` → the ONE loader
// into the SAME `componentCatalog` singleton the handlers consult (lane U0), and
// every assertion below a dispatch reads the DOM or the composed store — never a
// mock, never a spy.
//
// ─── ⚠ WHAT THIS FILE DOES NOT PROVE — stated, so a green is not over-read ─────
//  1. That the 3-D mesh regenerates on swap — lane 4E's seam (D10, descope
//     pre-authorised); this file proves the STORE read-back the mesh would bake from.
//  2. That a user can PLACE from the UI — lane U1's browser/tool; placement here is
//     via the verb directly, per the U2 brief.
//  3. C110 §3.3's mm/metres delta is INHERITED, not resolved: values render with the
//     unit label the `RUNTIME_LENGTH_UNITS_PER_METRE` seam derives (mm today).

import { describe, expect, it, beforeAll } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ The SAME singleton PluginRegistry injects into the handlers (lane U0).
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import {
    createComponentSection,
    setComponentProfileEditorOpener,
} from '../src/ui/property-panel/ComponentSection.js';
// Importing the body renderer also executes its module-scope opener wiring — the
// production mount path this file drives in ARM 1.
import {
    _renderElementToContainer,
    type BodyRendererHost,
} from '../src/ui/property-panel/PropertyPanelBodyRenderer.js';
import { openComponentProfileEditorDialog } from '../src/ui/ComponentProfileEditorDialog.js';

const AUDIT = { actorId: 'component-u2-panel', projectId: 'component-u2-panel', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    // Published the one way production publishes it (`engineLauncher.ts`), so the
    // section's call-time `window.runtime` read sees the REAL composed handle.
    (window as unknown as { runtime: unknown }).runtime = rt;

    const bytes = await packedBytes();
    const loaded = await componentCatalog.loadFromBytes(bytes, { provenance: 'project' });
    if (!loaded.ok) throw new Error(`fixture load failed: ${(loaded as any).message ?? (loaded as any).reason}`);
}, BUDGET);

/* ── ids — real prefixed ULIDs (the handlers enforce them) ── */
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5T';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const OCC1 = `component_${ulidN(1)}`;
const OCC2 = `component_${ulidN(2)}`;
const DEF_ID = `fam_${ulidN(3)}`;
const TYPE_A = `typ_${ulidN(4)}`;   // W-1200 — type value Width 1200
const TYPE_B = `typ_${ulidN(5)}`;   // W-600  — type value Width 600
const TYPE_ALIEN = `typ_${ulidN(6)}`; // declared by NO definition
const PARAM_WIDTH = `par_${ulidN(7)}`;  // kind 'instance', length
const PARAM_SILL = `par_${ulidN(8)}`;   // kind 'type', length
const PARAM_GLASS = `par_${ulidN(9)}`;  // expression 'Width - 150'
const PLANE_ID = `plane_${ulidN(10)}`;
const PROFILE_ID = `prof_${ulidN(11)}`;
const NOW = '2026-09-02T00:00:00.000Z';

const PLACE = {
    componentId: OCC1,
    levelId: LEVEL_ID,
    definitionId: DEF_ID,
    typeId: TYPE_A,
    definitionVersion: '1.0.0',
    origin: { x: 2, y: 0, z: 3 },
    rotation: 0,
};

/** ⛔ Read off `rt`, NEVER constructed. */
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component is undefined on the REAL composed runtime');
    return s;
}
function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
}
function readBack(id: string): any {
    return store().getState().get(id);
}

/** Fixture family: two types with TYPE values for Width, a type-kind parameter, an
 *  expression parameter, and one profile on a declared plane. Authored through
 *  `packFamily` because C111 §3.1's census stands: THERE IS NO CORPUS (stated, not
 *  hidden). Document values are in the family-runtime canonical unit (mm today). */
async function packedBytes(): Promise<Uint8Array> {
    const bare = (n: number): string => `${'0'.repeat(24)}${ulidN(n).slice(-2)}`;
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [
            { id: PLANE_ID, name: 'Front elevation', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: false },
        ],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_SILL, name: 'SillHeight', kind: 'type', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_GLASS, name: 'GlassWidth', kind: 'instance', dataType: 'length', defaultValue: null, expression: 'Width - 150', ifcMapping: null, exposed: true },
        ],
        profiles: [
            {
                id: PROFILE_ID, name: 'Opening face', planeId: PLANE_ID,
                entities: [
                    { id: bare(20), kind: 'point', data: { x: 0, z: 0 } },
                    { id: bare(21), kind: 'point', data: { x: 1.2, z: 0 } },
                    { id: bare(22), kind: 'point', data: { x: 1.2, z: 1.5 } },
                    { id: bare(23), kind: 'point', data: { x: 0, z: 1.5 } },
                ],
                constraints: [],
            },
        ],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_A, name: 'W-1200', values: { [PARAM_WIDTH]: 1200 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
            { id: TYPE_B, name: 'W-600', values: { [PARAM_WIDTH]: 600 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'U2 Window',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR02', displayName: 'lane-u2' },
        description: 'lane U2 property-section fixture',
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

/** A minimal REAL host for `_renderElementToContainer` — callbacks the component
 *  section never uses are inert, and none of them fake a store or a bus. */
function minimalHost(): BodyRendererHost {
    return {
        draft: new Map(),
        validationErrors: new Map(),
        roofStore: null,
        commandManager: null,
        selectedObject: null,
        injectStyles: () => {},
        onApply: () => {},
        onDelete: () => {},
        buildCloseBtn: () => window.document.createElement('button'),
        onRerender: () => {},
    };
}

function sourceOf(root: HTMLElement, paramId: string): string | null {
    return root.querySelector(`tr[data-cpt-row="${paramId}"]`)?.getAttribute('data-cpt-source') ?? null;
}
function valueOf(root: HTMLElement, paramId: string): string | null {
    return root
        .querySelector(`tr[data-cpt-row="${paramId}"] [data-cpt-value]`)
        ?.getAttribute('data-cpt-value') ?? null;
}

describe('§U2-COMPONENT-SECTION — select a placed component, see and edit its parameters through the two live verbs', () => {

    it('ARM 1 — ⭐⭐ THE MOUNT: place via the verb → render through the PRODUCTION panel body → the Component section shows name, both types, and per-row C110 §2.2 source badges', async () => {
        wipe();
        await rt.bus.executeCommand('component.place', PLACE);
        const rec = readBack(OCC1);
        expect(rec, 'CA-21: the occurrence is in the authoritative store').toBeDefined();

        const container = window.document.createElement('div');
        // The REAL mount path — the same function `PropertyPanel` calls for the panel
        // the user opens; `elementData` is the store record, `type: 'component'`.
        _renderElementToContainer(container, minimalHost(), { ...rec });

        const section = container.querySelector('[data-cs-root]') as HTMLElement | null;
        expect(section, 'the Component section is IN the rendered panel body').not.toBeNull();
        expect(section!.querySelector('[data-cs-defname]')?.textContent).toBe('U2 Window');

        // The type dropdown lists the definition's DECLARED types, current first-class.
        const select = section!.querySelector('[data-cs-type-picker] select') as HTMLSelectElement;
        expect(select, 'the type dropdown renders').not.toBeNull();
        const optionValues = Array.from(select.options).map((o) => o.value);
        expect(optionValues).toContain(TYPE_A);
        expect(optionValues).toContain(TYPE_B);
        expect(select.value, 'the CURRENT type is pre-selected, read from the record').toBe(TYPE_A);

        // ⭐ Per-row SOURCE labels — the 4F table, fed honestly (D4 on screen).
        expect(sourceOf(section!, PARAM_WIDTH), 'Width comes from the TYPE (W-1200 declares it)').toBe('type');
        expect(valueOf(section!, PARAM_WIDTH)).toBe('1200');
        expect(sourceOf(section!, PARAM_SILL), 'SillHeight falls to the definition default').toBe('default');
        expect(sourceOf(section!, PARAM_GLASS), 'GlassWidth is computed by its formula').toBe('expression');
        expect(valueOf(section!, PARAM_GLASS), 'Width 1200 − 150').toBe('1050');
    }, BUDGET);

    it('ARM 2 — ⭐ TYPE SWAP through the panel path: `component.swapType` dispatches, reads back CA-21, and the rows re-resolve from the new type', async () => {
        const section = createComponentSection({ id: OCC1, type: 'component' });
        const refusal = await section.requestTypeSwap(TYPE_B);
        expect(refusal, 'a declared type swaps without refusal').toBeNull();

        // CA-21 — the authoritative store moved…
        expect(readBack(OCC1).typeId).toBe(TYPE_B);
        // …and the PANEL re-resolved from it: Width is now the W-600 TYPE value, and
        // the dependent formula followed. No stored copy anywhere (spec §66's mechanism).
        expect(sourceOf(section.root, PARAM_WIDTH)).toBe('type');
        expect(valueOf(section.root, PARAM_WIDTH)).toBe('600');
        expect(valueOf(section.root, PARAM_GLASS), 'Width 600 − 150').toBe('450');
    }, BUDGET);

    it('ARM 3 — ⭐ INSTANCE OVERRIDE through the row path: `component.setInstanceParameter` dispatches, reads back, the row turns `instance` — and a SECOND placed instance still reads `type` (spec §66 F-2 at the panel)', async () => {
        await rt.bus.executeCommand('component.place', { ...PLACE, componentId: OCC2, typeId: TYPE_B });

        const section = createComponentSection({ id: OCC1, type: 'component' });
        expect(section.beginEdit(PARAM_WIDTH), 'the inline editor opens under the row').toBe(true);
        expect(section.root.querySelector(`[data-cs-edit-input="${PARAM_WIDTH}"]`)).not.toBeNull();

        const refusal = await section.submitEdit(PARAM_WIDTH, '1800');
        expect(refusal, 'a shape-correct override lands').toBeNull();

        // CA-21 — the override is IN the store, keyed by parameter id…
        expect(readBack(OCC1).instanceParameters[PARAM_WIDTH]).toBe(1800);
        // …and the resolved value updated, wearing the TOP rung's badge.
        expect(sourceOf(section.root, PARAM_WIDTH)).toBe('instance');
        expect(valueOf(section.root, PARAM_WIDTH)).toBe('1800');
        expect(valueOf(section.root, PARAM_GLASS), 'the formula follows the override').toBe('1650');

        // ⭐ F-2 at the panel: the OTHER instance holds no copy and still reads `type`.
        const other = createComponentSection({ id: OCC2, type: 'component' });
        expect(sourceOf(other.root, PARAM_WIDTH)).toBe('type');
        expect(valueOf(other.root, PARAM_WIDTH)).toBe('600');
        expect(Object.keys(readBack(OCC2).instanceParameters)).toEqual([]);
    }, BUDGET);

    it('ARM 4 — ⭐ a FOREIGN-type swap surfaces the handler\'s refusal IN THE PANEL, naming BOTH ids — and the store did not move', async () => {
        const section = createComponentSection({ id: OCC1, type: 'component' });
        const refusal = await section.requestTypeSwap(TYPE_ALIEN);
        expect(refusal, 'the refusal is returned').not.toBeNull();

        // Rendered under the dropdown — not a toast-and-nothing, not console.warn.
        const shown = section.root.querySelector('[data-cs-swap-refusal]') as HTMLElement;
        expect(shown.style.display).not.toBe('none');
        expect(shown.textContent, 'names the alien type').toContain(TYPE_ALIEN);
        expect(shown.textContent, 'names the definition — "wrong type" and "wrong definition" stay different answers').toContain(DEF_ID);

        expect(readBack(OCC1).typeId, 'nothing moved').toBe(TYPE_B);
    }, BUDGET);

    it('ARM 5 — a refused row edit renders the diagnostic AGAINST ITS ROW, and nothing was written', async () => {
        const section = createComponentSection({ id: OCC1, type: 'component' });
        const before = readBack(OCC1).instanceParameters[PARAM_WIDTH];

        const refusal = await section.submitEdit(PARAM_WIDTH, 'abc');
        expect(refusal).not.toBeNull();
        expect(refusal, 'the handler\'s C110 §3.5-a shape refusal, verbatim — ONE refusal vocabulary').toContain('finite number');

        const rowRefusal = section.root.querySelector(`[data-cs-row-refusal="${PARAM_WIDTH}"]`);
        expect(rowRefusal, 'rendered against the row, not swallowed').not.toBeNull();
        expect(rowRefusal?.textContent).toContain('finite number');

        expect(readBack(OCC1).instanceParameters[PARAM_WIDTH], 'the store is untouched').toBe(before);
    }, BUDGET);

    it('ARM 6 — CLEAR through the row path removes the KEY and the row returns to the ladder below it', async () => {
        const section = createComponentSection({ id: OCC1, type: 'component' });
        const refusal = await section.clearOverride(PARAM_WIDTH);
        expect(refusal).toBeNull();

        const params = readBack(OCC1).instanceParameters;
        expect(Object.prototype.hasOwnProperty.call(params, PARAM_WIDTH), 'the KEY is gone, not nulled').toBe(false);
        expect(sourceOf(section.root, PARAM_WIDTH), 'back to the TYPE rung').toBe('type');
        expect(valueOf(section.root, PARAM_WIDTH)).toBe('600');
    }, BUDGET);

    it('ARM 7 — ⭐⭐ THE HONEST EMPTY STATE: sever the definition (unload it) → the section shows the NAMED refusal and ZERO rows — never stale numbers; reload → the rows return', async () => {
        // Put a distinctive override in first, so "stale number" has a needle to find.
        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: OCC1, parameterId: PARAM_WIDTH, value: 1777,
        });
        const section = createComponentSection({ id: OCC1, type: 'component' });
        expect(valueOf(section.root, PARAM_WIDTH)).toBe('1777');

        componentCatalog.remove(DEF_ID);
        section.refresh();

        const refusal = section.root.querySelector(`[data-cs-def-refusal="${DEF_ID}"]`);
        expect(refusal, 'the refusal names the definition').not.toBeNull();
        expect(refusal?.textContent).toContain(DEF_ID);
        expect(refusal?.textContent).toContain('Load the definition');
        expect(section.root.querySelectorAll('tr[data-cpt-row]').length, 'ZERO parameter rows').toBe(0);
        // ⛔ The number this section can no longer resolve appears NOWHERE.
        expect(section.root.innerHTML).not.toContain('1777');
        // The occurrence's own store facts (not resolved values) are still stated.
        expect(section.root.querySelector('[data-cs-def-facts]')?.textContent).toContain('1 instance override(s)');

        // Reload through the ONE loader → the same section recovers.
        const back = await componentCatalog.loadFromBytes(await packedBytes(), { provenance: 'project' });
        expect(back.ok).toBe(true);
        section.refresh();
        expect(section.root.querySelectorAll('tr[data-cpt-row]').length).toBe(3);
        expect(valueOf(section.root, PARAM_WIDTH)).toBe('1777');

        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: OCC1, parameterId: PARAM_WIDTH, clear: true,
        });
    }, BUDGET);

    it('ARM 8 — ⭐ the profile-editor opener port: unwired it REFUSES BY NAME; wired (the production dialog) it OPENS over the declared plane', async () => {
        const section = createComponentSection({ id: OCC1, type: 'component' });
        const profileBtn = section.root.querySelector(`[data-cs-profile-open="${PROFILE_ID}"]`);
        expect(profileBtn, 'the definition\'s profile is listed with its affordance').not.toBeNull();

        // Unwired — the ARM-B rule: a missing wire states itself.
        setComponentProfileEditorOpener(null);
        expect(section.openProfile(PROFILE_ID)).toBe(false);
        expect(section.statusText).toContain('setComponentProfileEditorOpener was never called');

        // Wired with the SAME dialog the mounting module wires in production.
        setComponentProfileEditorOpener(openComponentProfileEditorDialog);
        expect(section.openProfile(PROFILE_ID)).toBe(true);
        const dialog = window.document.querySelector(`[data-cped-root="${PROFILE_ID}"]`);
        expect(dialog, 'the dialog is on the page').not.toBeNull();
        expect(dialog?.querySelector('[data-cped-title]')?.textContent).toContain('Opening face');
        expect(dialog?.querySelector('[data-cped-title]')?.textContent).toContain('Front elevation');
        // View-only from the instance panel — stated, not a dead save button.
        expect(dialog?.querySelector('[data-cped-readonly-note]')?.textContent).toContain('definition editor');
        dialog?.remove();
    }, BUDGET);
});
