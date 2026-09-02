/**
 * @vitest-environment happy-dom
 */
// componentDefinitionWorkspaceThroughComposedRuntime — §U3-DEFINITION-WORKSPACE (UI/UX wave, lane U3).
//   UIUX-PLAN §U3 · ADR-0376 D4/D5 · C110 §2.2/§2.4/§2.4-a/§3.5/§4.4 · C111 §4.1/§4.3-b ·
//   C16 CA-21 · C84 EI-9 · spec §64 (the founder's progressive-parametrisation demo) · audit R12/R14.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ACCEPTANCE, AT THE LAYER THE USER EXPERIENCES — the §64 demo end to end:
//     open the loaded definition from the Components browser's "Edit definition…"
//     → add FrameWidth → author `GlassWidth = Width - 2*FrameWidth` in the
//     workspace with LIVE typed diagnostics → diagnostics clean → save through
//     packFamily → reload through the ONE catalogue → place an instance via the
//     real verb → the placed instance's property section resolves the formula.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ NOTHING HERE IS A FAKE (R12) ────────────────────────────────────────────
// The runtime is `composeRuntime()` over `bootstrapWithEverything`, published to
// `window.runtime` as `engineLauncher` publishes it; the definition rides
// `packFamily` → the ONE loader into the SAME `componentCatalog` singleton the
// handlers consult; every edit goes through the REAL family-migrations ops; every
// assertion reads the DOM or the composed store.
//
// ─── ⚠ WHAT THIS FILE DOES NOT PROVE — stated, so a green is not over-read ─────
//  1. 3-D pixels for the placed instance — lane 4E's seam (D10 descope stands).
//  2. Profile GEOMETRY persistence — no family-migrations op exists for profile
//     write-back (OWED; ARM 9 proves the absence is STATED, not papered over).
//  3. C110 §3.3's mm/metres delta is INHERITED: values render with the unit the
//     `RUNTIME_LENGTH_UNITS_PER_METRE` seam derives (mm today).

import { describe, expect, it, beforeAll, vi } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ The SAME singleton PluginRegistry injects into the handlers (lane U0).
import { componentCatalog } from '../src/services/componentCatalog/index.js';
// ⭐ Lane U1's REAL browser — the workspace's production entry (UIUX-PLAN §U3).
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel.js';
// ⭐ Lane U3's workspace (the same opener the browser button calls).
import {
    openComponentDefinitionWorkspace,
    type ComponentDefinitionWorkspaceHandle,
} from '../src/ui/component-editor-workspace/index.js';
// ⭐ Lane U2's section — the read-back surface for the placed instance.
import { createComponentSection } from '../src/ui/property-panel/ComponentSection.js';

const AUDIT = { actorId: 'component-u3-workspace', projectId: 'component-u3-workspace', clientId: 'node' } as const;
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
const DEF_ID = `fam_${ulidN(40)}`;
const TYPE_A = `typ_${ulidN(41)}`;   // W-1200 — type value Width 1200
const TYPE_B = `typ_${ulidN(42)}`;   // W-1500 — type value Width 1500
const PARAM_WIDTH = `par_${ulidN(43)}`;  // instance, length, default 1200
const PARAM_GLASS = `par_${ulidN(44)}`;  // instance, length, default 1000 — the §64 target
const PARAM_TILT = `par_${ulidN(45)}`;   // instance, angle, default 0.2
const PLANE_ID = `plane_${ulidN(46)}`;
const PROFILE_ID = `prof_${ulidN(47)}`;
const OCC1 = `component_${ulidN(48)}`;
const NOW = '2026-09-02T00:00:00.000Z';

/** Fixture family — authored through `packFamily` because C111 §3.1's census
 *  stands: THERE IS NO CORPUS (stated, not hidden). Document values are in the
 *  family-runtime canonical unit (mm today, C110 §3.3). `GlassWidth` carries a
 *  DEFAULT and NO expression — the §64 progressive-parametrisation premise: the
 *  parameter already had a value when the formula arrives. */
async function packedBytes(): Promise<Uint8Array> {
    const bare = (n: number): string => `${'0'.repeat(24)}${ulidN(n).slice(-2)}`;
    const emptyChecksum = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [
            { id: PLANE_ID, name: 'Front elevation', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: false },
        ],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_GLASS, name: 'GlassWidth', kind: 'instance', dataType: 'length', defaultValue: 1000, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_TILT, name: 'Tilt', kind: 'instance', dataType: 'angle', defaultValue: 0.2, expression: null, ifcMapping: null, exposed: true },
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
        name: 'U3 Window',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR03', displayName: 'lane-u3' },
        description: 'lane U3 definition-workspace fixture',
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

/* ── read-back helpers (DOM — the layer the user experiences) ── */
function rowOf(root: HTMLElement, paramId: string): HTMLElement | null {
    return root.querySelector(`tr[data-dcpt-row="${paramId}"]`);
}
function sourceOf(root: HTMLElement, paramId: string): string | null {
    return rowOf(root, paramId)?.getAttribute('data-dcpt-source') ?? null;
}
function valueOf(root: HTMLElement, paramId: string): string | null {
    return root
        .querySelector(`tr[data-dcpt-row="${paramId}"] [data-dcpt-value]`)
        ?.getAttribute('data-dcpt-value') ?? null;
}
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component is undefined on the REAL composed runtime');
    return s;
}

let ws: ComponentDefinitionWorkspaceHandle;
let FRAME_ID = '';

describe('§U3-DEFINITION-WORKSPACE — the founder\'s §64 demo, end to end through the real composed runtime', () => {

    it('ARM 1 — ⭐⭐ OPEN FROM THE BROWSER: the real Components browser carries "Edit definition…" and the click mounts the workspace over the loaded document', () => {
        const browser = new ComponentBrowserPanel();
        browser.open();
        const editBtn = document.querySelector(`[data-component-browser-edit="${DEF_ID}"]`) as HTMLElement | null;
        expect(editBtn, 'the browser lists the edit entry for the loaded definition').not.toBeNull();
        editBtn!.click();

        const card = document.querySelector(`[data-cdw-root="${DEF_ID}"]`) as HTMLElement | null;
        expect(card, 'the workspace is ON THE PAGE').not.toBeNull();
        expect(card!.querySelector('[data-cdw-defname]')?.textContent).toBe('U3 Window');

        // The 4F table in definition/type scope, sources honest (C110 §2.2 on screen):
        expect(sourceOf(card!, PARAM_WIDTH), 'Width — the W-1200 TYPE declares it').toBe('type');
        expect(valueOf(card!, PARAM_WIDTH)).toBe('1200');
        expect(sourceOf(card!, PARAM_GLASS), 'GlassWidth — definition default, pre-§64').toBe('default');
        expect(valueOf(card!, PARAM_GLASS)).toBe('1000');
        expect(sourceOf(card!, PARAM_TILT)).toBe('default');

        // D5 — the user-facing copy says Component, never Family (wire names like
        // `.pryzm-family` are not rendered on this surface).
        expect(card!.textContent).not.toMatch(/family/i);

        // Close both (ARM 2 reopens through the same opener the button calls).
        (card!.querySelector('[data-cdw-close]') as HTMLElement).click();
        expect(document.querySelector(`[data-cdw-root="${DEF_ID}"]`)).toBeNull();
        browser.close();
    }, BUDGET);

    it('ARM 2 — ADD PARAMETER through the family-migrations op: FrameWidth (length, default 75) lands as a new honest row', async () => {
        const res = openComponentDefinitionWorkspace(DEF_ID);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        ws = res;

        // The DOM form exists (the user path)…
        ws.beginAddParameter();
        expect(ws.root.querySelector('[data-cdw-add-form]')).not.toBeNull();
        expect(ws.root.querySelector('[data-cdw-add-name]')).not.toBeNull();

        // …and the submit rides `makeAddParameterMigrator` (the ONE mutation path).
        const refusal = await ws.submitAddParameter({
            name: 'FrameWidth', dataType: 'length', kind: 'instance', defaultRaw: '75',
        });
        expect(refusal, 'a well-formed parameter is accepted').toBeNull();

        const frame = ws.document.parameters.find((p) => p.name === 'FrameWidth');
        expect(frame, 'the draft document carries the parameter').toBeDefined();
        FRAME_ID = frame!.id;
        expect(FRAME_ID).toMatch(/^par_[0-9A-HJKMNP-TV-Z]{26}$/);

        expect(sourceOf(ws.root, FRAME_ID)).toBe('default');
        expect(valueOf(ws.root, FRAME_ID)).toBe('75');
        expect(ws.isDirty()).toBe(true);
        expect(ws.root.querySelector('[data-cdw-dirty]')?.getAttribute('data-cdw-dirty')).toBe('true');
    }, BUDGET);

    it('ARM 3 — ⭐⭐ THE §64 FORMULA with LIVE diagnostics: type `Width - 2*FrameWidth` → preview clean at 1050 → the superseded default is ANNOUNCED, applied via the DOM button, and recorded as provenance', async () => {
        expect(ws.beginExpressionEdit(PARAM_GLASS), 'the editor opens under the GlassWidth row').toBe(true);
        const input = ws.root.querySelector(`[data-cdw-expr-input="${PARAM_GLASS}"]`) as HTMLInputElement;
        expect(input).not.toBeNull();

        // LIVE preview — resolveParameter runs on every keystroke (the ONE resolver).
        input.value = 'Width - 2*FrameWidth';
        input.dispatchEvent(new Event('input'));
        const preview = ws.root.querySelector(`[data-cdw-expr-preview="${PARAM_GLASS}"]`) as HTMLElement;
        expect(preview.querySelector('[data-cdw-preview-clean]'), 'diagnostics CLEAN').not.toBeNull();
        expect(preview.querySelector('[data-cdw-preview-clean]')?.getAttribute('data-cdw-preview-value'),
            '1200 − 2×75 under the W-1200 scope').toBe('1050');
        expect(preview.querySelectorAll('[data-cdw-preview-diag]').length).toBe(0);
        // ⭐ D4 announced BEFORE the apply: the default (1000) will be cleared.
        expect(preview.querySelector('[data-cdw-preview-supersede]')?.getAttribute('data-cdw-preview-supersede')).toBe('1000');

        // Apply through the DOM button — the same `introduce-expression` op path.
        (ws.root.querySelector(`[data-cdw-expr-apply="${PARAM_GLASS}"]`) as HTMLElement).click();
        await vi.waitFor(() => {
            expect(sourceOf(ws.root, PARAM_GLASS)).toBe('expression');
        });

        expect(valueOf(ws.root, PARAM_GLASS), 'the formula resolves on screen').toBe('1050');
        // ⭐ C110 §2.4-a ON SCREEN: the op CLEARED the default (so NO superseded-default
        // warn fires) and recorded it as provenance (so the line renders).
        expect(ws.root.querySelector(`[data-dcpt-diag="superseded-default"]`),
            'no warn — the op cleared the default, the repair holds').toBeNull();
        expect(ws.root.querySelector(`[data-dcpt-superseded="1000"]`)?.textContent)
            .toContain('Superseded default: 1000');
        const glass = ws.document.parameters.find((p) => p.id === PARAM_GLASS)!;
        expect(glass.expression).toBe('Width - 2*FrameWidth');
        expect(glass.defaultValue).toBeNull();
        expect(glass.supersededDefault).toBe(1000);

        // The formula follows the SCOPE (D4 under both types, no stored copy anywhere):
        ws.setScope(TYPE_B);
        expect(valueOf(ws.root, PARAM_GLASS), '1500 − 150 under W-1500').toBe('1350');
        ws.setScope(TYPE_A);
        expect(valueOf(ws.root, PARAM_GLASS)).toBe('1050');
    }, BUDGET);

    it('ARM 4 — LIVE typed diagnostics for INVALID expressions: `expression-parse`, `unit-mismatch` and `cycle` render in place as the user types — C110 §4.4\'s closed set, never swallowed', () => {
        // The probes ride GlassWidth — a parameter with NO type value, so its
        // candidate expression genuinely EVALUATES under this scope. (On Width the
        // W-1200 TYPE value pre-empts the expression — D4's precedence — so an
        // eval-time diagnostic like unit-mismatch structurally cannot fire there;
        // measured before this arm was written, not assumed.)
        expect(ws.beginExpressionEdit(PARAM_GLASS)).toBe(true);
        // The already-has-a-formula disclosure renders (the op will refuse a second
        // one; delete-expression is OWED) — stated up front, not discovered at apply.
        expect(ws.root.querySelector('[data-cdw-expr-existing-note]')).not.toBeNull();
        const input = ws.root.querySelector(`[data-cdw-expr-input="${PARAM_GLASS}"]`) as HTMLInputElement;
        const preview = ws.root.querySelector(`[data-cdw-expr-preview="${PARAM_GLASS}"]`) as HTMLElement;

        input.value = 'Width - ';
        input.dispatchEvent(new Event('input'));
        const parseDiag = preview.querySelector('[data-cdw-preview-diag="expression-parse"]');
        expect(parseDiag, 'the PARSE failure renders live, typed').not.toBeNull();
        expect(preview.querySelector('[data-cdw-preview-clean]')).toBeNull();

        // ⭐ unit-mismatch — the diagnostic C110 §3.5 waited for (length + angle).
        input.value = 'FrameWidth + Tilt';
        input.dispatchEvent(new Event('input'));
        const unitDiag = preview.querySelector('[data-cdw-preview-diag="unit-mismatch"]');
        expect(unitDiag, 'the unit-mismatch diagnostic renders live, typed').not.toBeNull();
        expect(unitDiag?.getAttribute('data-cdw-preview-diag-severity')).toBe('error');

        // ⭐ cycle — a formula on Width that reads GlassWidth closes the loop
        // (GlassWidth's live formula reads Width), and the Kahn detector says so BY
        // NAME. Cycle detection is structural (edit-time, C110 §4.3), so it fires
        // even though Width's type value would pre-empt the evaluation.
        expect(ws.beginExpressionEdit(PARAM_WIDTH)).toBe(true);
        const wInput = ws.root.querySelector(`[data-cdw-expr-input="${PARAM_WIDTH}"]`) as HTMLInputElement;
        const wPreview = ws.root.querySelector(`[data-cdw-expr-preview="${PARAM_WIDTH}"]`) as HTMLElement;
        wInput.value = 'GlassWidth + Tilt';
        wInput.dispatchEvent(new Event('input'));
        expect(wPreview.querySelector('[data-cdw-preview-diag="cycle"]'),
            'the cycle diagnostic renders live, typed').not.toBeNull();

        // Nothing was applied — the draft is unchanged by any preview.
        expect(ws.document.parameters.find((p) => p.id === PARAM_WIDTH)!.expression).toBeNull();
        expect(ws.document.parameters.find((p) => p.id === PARAM_GLASS)!.expression).toBe('Width - 2*FrameWidth');
    }, BUDGET);

    it('ARM 5 — an APPLIED invalid formula shows its typed diagnostic AGAINST THE ROW (nothing substituted), and delete-parameter recovers the pass', async () => {
        const added = await ws.submitAddParameter({
            name: 'Scratch', dataType: 'number', kind: 'instance', defaultRaw: '1',
        });
        expect(added).toBeNull();
        const scratch = ws.document.parameters.find((p) => p.name === 'Scratch')!;

        // The op does not parse expressions (deliberately — the resolver is the one
        // voice); the TABLE then renders the typed failure against the row.
        const refusal = await ws.applyExpression(scratch.id, 'Width - ');
        expect(refusal).toBeNull();
        const diag = ws.root.querySelector(`[data-dcpt-diag="expression-parse"]`);
        expect(diag, 'the typed diagnostic is IN the table').not.toBeNull();
        expect(sourceOf(ws.root, scratch.id), 'no value substituted (C110 §2.5)').toBe('unresolved');
        expect(valueOf(ws.root, scratch.id)).toBe('');
        expect(ws.root.querySelector('[data-dcpt-status]')?.getAttribute('data-dcpt-status'),
            'the PASS states its failure').toBe('error');

        // delete-parameter (the op) removes it and the pass recovers.
        const del = await ws.applyDeleteParameter(scratch.id);
        expect(del).toBeNull();
        expect(rowOf(ws.root, scratch.id)).toBeNull();
        expect(ws.root.querySelector('[data-dcpt-status]')?.getAttribute('data-dcpt-status')).toBe('ok');
    }, BUDGET);

    it('ARM 6 — change-parameter-type runs WITH ITS GUARD: same-type refuses with the op\'s own sentence against the row; a real change lands and the unit label follows the declaration', async () => {
        const refusal = await ws.applyDataTypeChange(PARAM_TILT, 'angle');
        expect(refusal, 'the op\'s own guard speaks').not.toBeNull();
        expect(refusal).toContain('already has dataType angle');
        const rowRefusal = ws.root.querySelector(`[data-cdw-row-refusal="${PARAM_TILT}"]`);
        expect(rowRefusal, 'rendered against the row, not swallowed').not.toBeNull();
        expect(rowRefusal?.textContent).toContain('already has dataType');

        const ok = await ws.applyDataTypeChange(PARAM_TILT, 'number');
        expect(ok).toBeNull();
        expect(rowOf(ws.root, PARAM_TILT)?.getAttribute('data-dcpt-datatype')).toBe('number');
        // The unit label follows the DECLARED dataType via the one seam (C110 §3.3):
        // an angle wore 'rad'; a number wears nothing.
        expect(rowOf(ws.root, PARAM_TILT)?.querySelector('[data-dcpt-value]')?.getAttribute('data-dcpt-unit')).toBeNull();
    }, BUDGET);

    it('ARM 7 — ⭐⭐ SAVE-VIA-PACK, ROUND-TRIP PROVEN: packFamily → the ONE catalogue/loader → the reloaded document carries the §64 formula and resolves IDENTICALLY', async () => {
        const before = ws.model;
        expect(before?.result.ok).toBe(true);
        const preValues = before!.result.ok ? { ...before!.result.values } : {};
        const hashBefore = componentCatalog.entry(DEF_ID)!.family.schemaHash;

        const refusal = await ws.save();
        expect(refusal, 'the save lands').toBeNull();
        expect(ws.isDirty()).toBe(false);
        expect(ws.statusText).toContain('Saved — packed and reloaded through the catalogue');

        // The catalogue entry MOVED (new schemaHash — the signed-format discipline:
        // packFamily recomputed and stamped it; the loader verified on the way in).
        const entry = componentCatalog.entry(DEF_ID)!;
        expect(entry.family.schemaHash).not.toBe(hashBefore);
        expect(entry.family.schemaHash).toMatch(/^sha256:[0-9a-f]{64}$/);

        // The RELOADED document (through unzip → Zod → resolver pre-flight) carries
        // the §64 state: expression present, default CLEARED, provenance recorded.
        const glass = entry.family.document.parameters.find((p) => p.id === PARAM_GLASS)!;
        expect(glass.expression).toBe('Width - 2*FrameWidth');
        expect(glass.defaultValue).toBeNull();
        expect(glass.supersededDefault).toBe(1000);
        const frame = entry.family.document.parameters.find((p) => p.id === FRAME_ID)!;
        expect(frame.name).toBe('FrameWidth');
        expect(frame.defaultValue).toBe(75);

        // ⭐ IDENTICAL RESOLUTION across the round trip — the workspace re-rendered
        // from the RELOADED entry (it rebases on save), and every value matches the
        // pre-save pass.
        const after = ws.model;
        expect(after?.result.ok).toBe(true);
        expect(after!.result.ok ? after!.result.values : {}).toEqual(preValues);
        expect(valueOf(ws.root, PARAM_GLASS)).toBe('1050');
    }, BUDGET);

    it('ARM 8 — ⭐⭐ PLACE AND RESOLVE (the §64 finish): `component.place` via the real bus → the instance property section resolves GlassWidth = 1050 mm from the SAVED formula', async () => {
        await rt.bus.executeCommand('component.place', {
            componentId: OCC1,
            levelId: LEVEL_ID,
            definitionId: DEF_ID,
            typeId: TYPE_A,
            definitionVersion: '1.0.0',
            origin: { x: 2, y: 0, z: 3 },
            rotation: 0,
        });
        // CA-21 — the authoritative store holds the occurrence…
        expect(store().getState().get(OCC1)).toBeDefined();

        // …and the USER-FACING section (lane U2's, over the SAME catalogue) resolves
        // the formula the workspace authored: 1200 − 2×75 = 1050 (mm — C110 §3.3 seam).
        const section = createComponentSection({ id: OCC1, type: 'component' });
        const glassRow = section.root.querySelector(`tr[data-cpt-row="${PARAM_GLASS}"]`);
        expect(glassRow?.getAttribute('data-cpt-source'), 'the formula IS the source').toBe('expression');
        expect(glassRow?.querySelector('[data-cpt-value]')?.getAttribute('data-cpt-value')).toBe('1050');
        expect(glassRow?.querySelector('[data-cpt-value]')?.getAttribute('data-cpt-unit')).toBe('mm');
        // The provenance the migration recorded reaches this panel too.
        expect(section.root.querySelector('[data-cpt-superseded="1000"]')).not.toBeNull();
    }, BUDGET);

    it('ARM 9 — the PROFILE LEG: the 4F surface mounts over the declared plane, and the missing write-back op is STATED BY NAME, never a lying commit affordance', () => {
        const openBtn = ws.root.querySelector(`[data-cdw-profile-open="${PROFILE_ID}"]`);
        expect(openBtn, 'the definition\'s profile is listed with its affordance').not.toBeNull();

        expect(ws.openProfile(PROFILE_ID)).toBe(true);
        const host = ws.root.querySelector('[data-cdw-profile-host]') as HTMLElement;
        expect(host.querySelector(`[data-dwp-root="${PROFILE_ID}"]`), 'the REAL 4F panel is mounted').not.toBeNull();

        // The OWED refusal, in place, by name — [[refusing-half-needs-its-escape-hatch]]:
        // the absent half is explained, not hidden behind a dead button.
        const owed = host.querySelector(`[data-cdw-profile-owed="${PROFILE_ID}"]`);
        expect(owed).not.toBeNull();
        expect(owed?.textContent).toContain('no profile write-back op');
        expect(owed?.textContent).toContain('OWED');
        // No commit affordance exists on this leg.
        expect(host.querySelector('button')).toBeNull();
    }, BUDGET);

    it('ARM 10 — rename is LOUD about G-7, and close-without-save DISCARDS the draft: the document moves ONLY through save-via-pack', async () => {
        const refusal = await ws.applyRename(PARAM_WIDTH, 'OpeningWidth');
        expect(refusal).toBeNull();
        // ⚠ C110 §1.4/G-7 disclosed by execution: rename-parameter rewrites solids'
        // expressions only — GlassWidth's formula still says `Width`, so the table
        // shows the typed unknown-identifier AGAINST the row. Loud, never silent.
        expect(ws.root.querySelector('[data-dcpt-diag="unknown-identifier"]')).not.toBeNull();
        expect(sourceOf(ws.root, PARAM_GLASS), 'no value substituted for the broken formula').toBe('unresolved');
        expect(ws.statusText).toContain('not rewritten');

        // Close WITHOUT saving — the draft dies with the workspace…
        ws.close();
        expect(document.querySelector(`[data-cdw-root="${DEF_ID}"]`)).toBeNull();

        // …and the catalogue's document is untouched: Width is still Width, and a
        // fresh workspace over the SAME entry resolves the §64 formula again.
        const entry = componentCatalog.entry(DEF_ID)!;
        expect(entry.family.document.parameters.find((p) => p.id === PARAM_WIDTH)!.name).toBe('Width');
        const res = openComponentDefinitionWorkspace(DEF_ID);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(sourceOf(res.root, PARAM_GLASS)).toBe('expression');
        expect(valueOf(res.root, PARAM_GLASS)).toBe('1050');
        res.close();
    }, BUDGET);
});
