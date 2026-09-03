/**
 * @vitest-environment happy-dom
 */
// componentTypeCatalogThroughComposedRuntime — §U4-TYPE-CATALOG (UI/UX wave, lane U4).
//   UIUX-PLAN §U4 + §4 (R-f) · ADR-0376 D4/D5 · C110 §2.2/§3.3 · C111 §4.1-b/§4.3-b ·
//   C16 CA-18/CA-21 · C84 EI-9 · spec §24 (the type catalog) · audit R1/R12/R14.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ACCEPTANCE, AT THE LAYER THE USER EXPERIENCES:
//     open the type catalog from the Components browser's "Types…" → create 'Wide'
//     overriding Width=2400 → it appears with the OVERRIDE BADGE → save through
//     packFamily → reload through the ONE catalogue (round-trip IDENTICAL) → place
//     an instance of 'Wide' via the real bus → its property section resolves
//     Width=2400 → a duplicate 'Wide' REFUSES in place → edit + delete round out
//     the CRUD, the last-type delete refused by the schema's `types.min(1)`.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ NOTHING HERE IS A FAKE (R12) ────────────────────────────────────────────
// The runtime is `composeRuntime()` over `bootstrapWithEverything`, published to
// `window.runtime`; the definition rides `packFamily` → the ONE loader into the
// SAME `componentCatalog` singleton the handlers consult; CREATE goes through the
// REAL `makeSplitTypeMigrator`; EDIT/DELETE through the REAL `FamilyDocumentSchema`;
// every assertion reads the DOM or the composed store.
//
// ─── ⚠ WHAT THIS FILE DOES NOT PROVE — stated so a green is not over-read ──────
//  1. 3-D pixels for the placed instance — lane 4E's seam (D10 descope stands).
//  2. C110 §3.3's mm/metres delta is INHERITED: values render with the unit the
//     `RUNTIME_LENGTH_UNITS_PER_METRE` seam derives (mm today).

import { describe, expect, it, beforeAll } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ The SAME singleton PluginRegistry injects into the handlers (lane U0).
import { componentCatalog } from '../src/services/componentCatalog/index.js';
// ⭐ Lane U1's REAL browser — the type catalog's production entry (UIUX-PLAN §U4).
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel.js';
// ⭐ Lane U4's type catalog (the same opener the browser "Types…" button calls).
import {
    openComponentTypeCatalog,
    type ComponentTypeCatalogHandle,
} from '../src/ui/component-type-catalog/index.js';
// ⭐ Lane U2's section — the read-back surface for the placed instance.
import { createComponentSection } from '../src/ui/property-panel/ComponentSection.js';

const AUDIT = { actorId: 'component-u4-type-catalog', projectId: 'component-u4-type-catalog', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

/* ── ids — real prefixed ULIDs (the handlers and the schema enforce them) ── */
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5T';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const DEF_ID = `fam_${ulidN(50)}`;
const TYPE_A = `typ_${ulidN(51)}`;   // W-1200 — type value Width 1200
const TYPE_B = `typ_${ulidN(52)}`;   // W-1500 — type value Width 1500
const PARAM_WIDTH = `par_${ulidN(53)}`;  // instance, length, default 1200
const PARAM_HEIGHT = `par_${ulidN(54)}`; // instance, length, default 2100
const OCC1 = `component_${ulidN(55)}`;
const NOW = '2026-09-03T00:00:00.000Z';

/** Fixture family — authored through `packFamily` because C111 §3.1's census
 *  stands: THERE IS NO CORPUS (stated, not hidden). Values are in the family-runtime
 *  canonical unit (mm today, C110 §3.3). Two base types so DELETE has a non-last
 *  target and the last-type refusal is reachable. */
async function packedBytes(): Promise<Uint8Array> {
    const emptyChecksum = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_A, name: 'W-1200', values: { [PARAM_WIDTH]: 1200 }, checksum: emptyChecksum },
            { id: TYPE_B, name: 'W-1500', values: { [PARAM_WIDTH]: 1500 }, checksum: emptyChecksum },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'U4 Window',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR04', displayName: 'lane-u4' },
        description: 'lane U4 type-catalog fixture',
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

/* ── read-back helpers (DOM — the layer the user experiences) ── */
function ctcTypeRow(root: HTMLElement, typeId: string): HTMLElement | null {
    return root.querySelector(`[data-ctc-type="${typeId}"]`);
}
function ctctSourceOf(root: HTMLElement, paramId: string): string | null {
    return root.querySelector(`tr[data-ctct-row="${paramId}"]`)?.getAttribute('data-ctct-source') ?? null;
}
function ctctValueOf(root: HTMLElement, paramId: string): string | null {
    return root
        .querySelector(`tr[data-ctct-row="${paramId}"] [data-ctct-value]`)
        ?.getAttribute('data-ctct-value') ?? null;
}
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component is undefined on the REAL composed runtime');
    return s;
}

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    (window as unknown as { runtime: unknown }).runtime = rt;
    const loaded = await componentCatalog.loadFromBytes(await packedBytes(), { provenance: 'project' });
    if (!loaded.ok) throw new Error(`fixture load failed: ${(loaded as any).message ?? (loaded as any).reason}`);
}, BUDGET);

let cat: ComponentTypeCatalogHandle;
let WIDE_ID = '';

describe('§U4-TYPE-CATALOG — create/edit/delete types, end to end through the real composed runtime', () => {

    it('ARM 1 — ⭐ OPEN FROM THE BROWSER: the real Components browser carries "Types…" and the click mounts the catalog over the loaded definition', () => {
        const browser = new ComponentBrowserPanel();
        browser.open();
        const typesBtn = document.querySelector(`[data-component-browser-types="${DEF_ID}"]`) as HTMLElement | null;
        expect(typesBtn, 'the browser lists the Types entry for the loaded definition').not.toBeNull();
        typesBtn!.click();

        const card = document.querySelector(`[data-ctc-root="${DEF_ID}"]`) as HTMLElement | null;
        expect(card, 'the type catalog is ON THE PAGE').not.toBeNull();
        expect(card!.querySelector('[data-ctc-defname]')?.textContent).toBe('U4 Window');

        // The two base types are listed, W-1200 with its one override.
        expect(ctcTypeRow(card!, TYPE_A), 'W-1200 is listed').not.toBeNull();
        expect(ctcTypeRow(card!, TYPE_B), 'W-1500 is listed').not.toBeNull();
        expect(ctcTypeRow(card!, TYPE_A)!.querySelector('[data-ctc-type-overrides]')?.getAttribute('data-ctc-type-overrides')).toBe('1');

        // D5 — the user-facing copy says Component/Type, never Family.
        expect(card!.textContent).not.toMatch(/family/i);

        (card!.querySelector('[data-ctc-close]') as HTMLElement).click();
        expect(document.querySelector(`[data-ctc-root="${DEF_ID}"]`)).toBeNull();
        browser.close();
    }, BUDGET);

    it('ARM 2 — ⭐⭐ CREATE \'Wide\' overriding Width=2400 through the split-type op → it appears with the OVERRIDE BADGE (source Type, value 2400)', async () => {
        const res = openComponentTypeCatalog(DEF_ID);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        cat = res;

        const before = cat.document.types.length;
        const refusal = await cat.submitCreateType({
            name: 'Wide',
            baseTypeId: TYPE_A,
            overrides: [{ parameterId: PARAM_WIDTH, raw: '2400' }],
        });
        expect(refusal, 'a well-formed new type is accepted').toBeNull();

        const wide = cat.document.types.find((t) => t.name === 'Wide');
        expect(wide, 'the draft document carries the new type').toBeDefined();
        WIDE_ID = wide!.id;
        expect(WIDE_ID).toMatch(/^typ_[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(cat.document.types.length).toBe(before + 1);
        expect(wide!.values[PARAM_WIDTH], 'the split-type op wrote the override').toBe(2400);

        // ⭐ THE OVERRIDE BADGE — the 4F table scoped to 'Wide' shows Width with the
        // "Type" source badge (C110 §2.2) at 2400, Height falling to its default.
        expect(ctcTypeRow(cat.root, WIDE_ID)!.querySelector('[data-ctc-type-overrides]')?.getAttribute('data-ctc-type-overrides')).toBe('1');
        expect(ctctSourceOf(cat.root, PARAM_WIDTH), 'Width IS a Type override').toBe('type');
        expect(ctctValueOf(cat.root, PARAM_WIDTH)).toBe('2400');
        expect(ctctSourceOf(cat.root, PARAM_HEIGHT), 'Height is not overridden by this type').toBe('default');
        expect(ctctValueOf(cat.root, PARAM_HEIGHT)).toBe('2100');
        expect(cat.isDirty()).toBe(true);
    }, BUDGET);

    it('ARM 3 — ⭐⭐ SAVE-VIA-PACK, ROUND-TRIP IDENTICAL: packFamily → the ONE catalogue/loader → the reloaded definition carries \'Wide\' with Width=2400', async () => {
        const hashBefore = componentCatalog.entry(DEF_ID)!.family.schemaHash;
        const refusal = await cat.save();
        expect(refusal, 'the save lands').toBeNull();
        expect(cat.isDirty()).toBe(false);
        expect(cat.statusText).toContain('Saved — packed and reloaded through the catalogue');

        // The catalogue entry MOVED (new schemaHash — the signed-format discipline).
        const entry = componentCatalog.entry(DEF_ID)!;
        expect(entry.family.schemaHash).not.toBe(hashBefore);
        expect(entry.family.schemaHash).toMatch(/^sha256:[0-9a-f]{64}$/);

        // The RELOADED document carries 'Wide' with the override — identical to the draft.
        const wide = entry.family.document.types.find((t) => t.id === WIDE_ID)!;
        expect(wide.name).toBe('Wide');
        expect(wide.values[PARAM_WIDTH]).toBe(2400);

        // The catalog rebased on the reload and still shows the override badge.
        cat.selectType(WIDE_ID);
        expect(ctctSourceOf(cat.root, PARAM_WIDTH)).toBe('type');
        expect(ctctValueOf(cat.root, PARAM_WIDTH)).toBe('2400');
    }, BUDGET);

    it('ARM 4 — ⭐⭐ PLACE AND RESOLVE: `component.place` of a \'Wide\' instance via the real bus → the property section resolves Width = 2400 mm, source Type', async () => {
        await rt.bus.executeCommand('component.place', {
            componentId: OCC1,
            levelId: LEVEL_ID,
            definitionId: DEF_ID,
            typeId: WIDE_ID,
            definitionVersion: '1.0.0',
            origin: { x: 2, y: 0, z: 3 },
            rotation: 0,
        });
        // CA-21 — the authoritative store holds the occurrence…
        expect(store().getState().get(OCC1)).toBeDefined();
        expect(store().getState().get(OCC1).typeId).toBe(WIDE_ID);

        // …and the USER-FACING section (lane U2's, over the SAME catalogue) resolves
        // the type override: Width = 2400 mm, source Type (C110 §3.3 seam → mm).
        const section = createComponentSection({ id: OCC1, type: 'component' });
        const widthRow = section.root.querySelector(`tr[data-cpt-row="${PARAM_WIDTH}"]`);
        expect(widthRow?.getAttribute('data-cpt-source'), 'the TYPE is the source').toBe('type');
        expect(widthRow?.querySelector('[data-cpt-value]')?.getAttribute('data-cpt-value')).toBe('2400');
        expect(widthRow?.querySelector('[data-cpt-value]')?.getAttribute('data-cpt-unit')).toBe('mm');
    }, BUDGET);

    it('ARM 5 — ⭐ DUPLICATE NAME REFUSES IN PLACE: a second \'Wide\' renders the typed refusal, the draft type count unchanged', async () => {
        const before = cat.document.types.length;
        cat.beginCreateType(TYPE_A);
        const refusal = await cat.submitCreateType({
            name: 'Wide',
            baseTypeId: TYPE_A,
            overrides: [{ parameterId: PARAM_WIDTH, raw: '9999' }],
        });
        expect(refusal, 'the duplicate name is refused').not.toBeNull();
        expect(refusal).toContain('already exists');
        // ⭐ Rendered IN PLACE under the create form (C16 CA-18), not a silent no-op.
        const inPlace = cat.root.querySelector('[data-ctc-create-refusal]') as HTMLElement | null;
        expect(inPlace, 'the refusal is on the create form').not.toBeNull();
        expect(inPlace!.textContent).toContain('already exists');
        expect(inPlace!.style.display).not.toBe('none');
        // Nothing created.
        expect(cat.document.types.length).toBe(before);
        expect(cat.document.types.filter((t) => t.name === 'Wide').length).toBe(1);
    }, BUDGET);

    it('ARM 6 — EDIT via a re-validated document transform: rename \'Wide\' → \'Wider\', change Width override to 2600 → the list and the scoped table follow', async () => {
        const refusal = await cat.submitEditType(WIDE_ID, {
            newName: 'Wider',
            overrides: [{ parameterId: PARAM_WIDTH, raw: '2600' }],
        });
        expect(refusal, 'the edit lands').toBeNull();
        const edited = cat.document.types.find((t) => t.id === WIDE_ID)!;
        expect(edited.name).toBe('Wider');
        expect(edited.values[PARAM_WIDTH]).toBe(2600);
        expect(ctcTypeRow(cat.root, WIDE_ID)!.querySelector('[data-ctc-type-name]')?.textContent).toBe('Wider');
        cat.selectType(WIDE_ID);
        expect(ctctValueOf(cat.root, PARAM_WIDTH)).toBe('2600');
        // Clearing an override: blank Width → the parameter falls back to its default.
        const cleared = await cat.submitEditType(WIDE_ID, {
            newName: 'Wider',
            overrides: [{ parameterId: PARAM_WIDTH, raw: '' }],
        });
        expect(cleared).toBeNull();
        cat.selectType(WIDE_ID);
        expect(ctctSourceOf(cat.root, PARAM_WIDTH), 'no override now → back to Default').toBe('default');
        expect(ctctValueOf(cat.root, PARAM_WIDTH)).toBe('1200');
    }, BUDGET);

    it('ARM 7 — DELETE via a re-validated document transform, and the LAST-TYPE delete is refused by the schema\'s types.min(1)', async () => {
        // Delete non-last types down to one.
        expect(await cat.deleteType(WIDE_ID), 'a non-last delete succeeds').toBeNull();
        expect(cat.document.types.some((t) => t.id === WIDE_ID)).toBe(false);
        expect(await cat.deleteType(TYPE_B)).toBeNull();
        expect(cat.document.types.length).toBe(1);

        // ⭐ The last remaining type cannot be deleted — the schema's `types.min(1)`
        // is the ONE voice, rendered in place under the row (C16 CA-18).
        const refusal = await cat.deleteType(TYPE_A);
        expect(refusal, 'deleting the last type is refused').not.toBeNull();
        expect(refusal).toContain('delete-type');
        const inPlace = cat.root.querySelector(`[data-ctc-type-refusal="${TYPE_A}"]`);
        expect(inPlace, 'the schema refusal is rendered against the row').not.toBeNull();
        expect(cat.document.types.length, 'the sole type survives').toBe(1);

        cat.close();
        expect(document.querySelector(`[data-ctc-root="${DEF_ID}"]`)).toBeNull();
    }, BUDGET);
});
