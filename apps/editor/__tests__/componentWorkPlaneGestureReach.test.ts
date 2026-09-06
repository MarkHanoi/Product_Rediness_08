/**
 * @vitest-environment happy-dom
 */
// componentWorkPlaneGestureReach — §82.4-DIRECTED-EXTRUDE / §82.1-REFERENCE-PLANES.
//   STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.1 + §82.4 · UCE-REACHABILITY-AUDIT
//   A8 / A9 / G1 · ADR-0376 D5 · C110 §2.2 · C84 EI-6 / EI-9 · spec §75.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE GESTURE CHAIN, AT THE LAYER THE USER TOUCHES (the H6 probe shape):
//     Components browser → "Edit definition…" CLICK → workspace on the page →
//     "Add shape…" CLICK, type 600 × 400 × 2400, "Add shape" CLICK → the LIVE
//     3-D viewport draws a mesh 2.4 m TALL → "Add work plane…" CLICK, name it,
//     choose "builds along +X", "Add plane" CLICK → the shape's "Work plane"
//     SELECT changes → the SAME viewport now draws a mesh 2.4 m WIDE and 0.6 m
//     tall → "Rename" the plane in place → save → the reloaded catalogue document
//     still says +X, under the new name.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
// `set-extrude-work-plane-op.test.ts` proves the OP and
// `produceExtrude.direction.test.ts` proves the PRODUCER. Neither proves a user can
// REACH either: that is the [[committed-is-not-reachable]] failure, and the audit's
// A18/A19/A20 rows are a register of exactly this shape — real, tested code that no
// gesture arrives at. Every act below is a DOM event on the production surface,
// dispatched the way a mouse would; nothing calls a migrator directly and nothing
// reaches past the workspace into the ops.
//
// ─── ⭐ WHERE THE PROPERTY IS READ BACK (C16 CA-21 / audit R14) ─────────────────
// Never off the field the gesture wrote. ARM 3 and ARM 6 measure the POSITION
// BUFFER of the mesh the workspace's own live preview built — the same
// `bakeFamilyInstance` a placed instance goes through, one layer below the pixels.
// If the document field moved and the bake ignored it, ARM 6 fails.
//
// ─── ⚠ WHAT A GREEN HERE DOES NOT ESTABLISH ────────────────────────────────────
//  1. NOT BROWSER-VERIFIED. happy-dom has no WebGL: this asserts the descriptor the
//     renderer would upload, never a pixel. No screenshot of a horizontally built
//     Component exists.
//  2. `ReferencePlane.origin` is still NOT APPLIED (ARM 7 asserts the UI says so
//     rather than collecting an intent that is guaranteed to be refused).
//  3. The SPIN about a plane normal is the minimal rotation and nothing else — the
//     schema persists no in-plane basis (§4D-SCHEMA-DELTA).
//  4. No placed instance is involved; §82.6's render mount has its own suite.

import { describe, expect, it, beforeAll, vi } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ The SAME singleton the PluginRegistry injects into the component handlers.
import { componentCatalog } from '../src/services/componentCatalog/index.js';
// ⭐ The production browser — the workspace's only user entry (audit [RAIL]).
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel.js';
import {
    openComponentDefinitionWorkspace,
    type ComponentDefinitionWorkspaceHandle,
} from '../src/ui/component-editor-workspace/index.js';

const AUDIT = { actorId: 'uce-workplane', projectId: 'uce-workplane', clientId: 'node' } as const;
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5T';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const DEF_ID = `fam_${ulidN(60)}`;
const TYPE_ID = `typ_${ulidN(61)}`;
const PARAM_WIDTH = `par_${ulidN(62)}`;
const HOST_PLANE = `plane_${ulidN(63)}`;
const NOW = '2026-09-06T00:00:00.000Z';

/** A definition with a HOST plane, one bindable parameter and NO solids — the
 *  state an author is in one gesture after "New Component". */
async function packedBytes(): Promise<Uint8Array> {
    const emptyChecksum = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [
            { id: HOST_PLANE, name: 'Base', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
        ],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [{ id: TYPE_ID, name: 'Default', values: {}, checksum: emptyChecksum }],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'Work Plane Probe',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR04', displayName: 'lane-uce-acceptances' },
        description: 'the §82.4 work-plane gesture-reach fixture',
        ifcEntity: 'IfcBuildingElementProxy',
        category: 'Generic',
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

let ws: ComponentDefinitionWorkspaceHandle;
let SOLID_ID = '';
let NEW_PLANE_ID = '';

/* ── the DOM is the surface; `render()` rebuilds it, so every helper re-queries
   rather than caching a node across an act. ── */
function q<T extends Element = HTMLElement>(sel: string): T | null {
    return ws.root.querySelector(sel) as T | null;
}
function click(sel: string): void {
    const n = q(sel);
    if (n === null) throw new Error(`[test] no node for gesture ${sel}`);
    (n as HTMLElement).click();
}
function doc(): any {
    return ws.document as any;
}
/** The measured extent of the mesh the LIVE preview built, in metres — the
 *  bake's own position buffer, not the field the gesture wrote. */
function previewExtent(): { x: number; y: number; z: number } {
    const res = ws.previewResult();
    if (res === null || !res.ok) throw new Error(`preview is not ok: ${JSON.stringify(res)}`);
    const parts = (res.subject.parts as readonly any[]).filter((p) => p?.position instanceof Float32Array);
    if (parts.length === 0) throw new Error('the preview subject carries no mesh part');
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
        const pos = part.position as Float32Array;
        for (let i = 0; i < pos.length; i += 3) {
            for (let a = 0; a < 3; a++) {
                const v = pos[i + a]!;
                if (v < lo[a]!) lo[a] = v;
                if (v > hi[a]!) hi[a] = v;
            }
        }
    }
    return { x: hi[0]! - lo[0]!, y: hi[1]! - lo[1]!, z: hi[2]! - lo[2]! };
}

describe('§82.4 — a user reaches "build this shape along THAT work plane" with nothing but clicks', () => {

    it('ARM 1 — ⭐ OPEN: the production Components browser\'s "Edit definition…" click mounts the workspace, and the plane list is no longer read-only', () => {
        const browser = new ComponentBrowserPanel();
        browser.open();
        const editBtn = document.querySelector(`[data-component-browser-edit="${DEF_ID}"]`) as HTMLElement | null;
        expect(editBtn, 'the browser lists the loaded definition').not.toBeNull();
        editBtn!.click();

        const card = document.querySelector(`[data-cdw-root="${DEF_ID}"]`) as HTMLElement | null;
        expect(card, 'the workspace is ON THE PAGE').not.toBeNull();
        expect(card!.querySelector('[data-cdw-defname]')?.textContent).toBe('Work Plane Probe');
        // ⭐ THE REACHABILITY CLAIM, in one node: before this lane the plane list was
        //    a read-only render and NO gesture could add one.
        expect(card!.querySelector('[data-cdw-add-plane]'), '"Add work plane…" is on the surface').not.toBeNull();
        // A datum whose direction is invisible cannot be chosen between, so the row
        // prints the normal.
        expect(card!.querySelector(`[data-cdw-plane="${HOST_PLANE}"]`)?.textContent).toContain('(0, 1, 0)');
        // D5 — user-facing copy says Component, never Family.
        expect(card!.textContent).not.toMatch(/family/i);

        (card!.querySelector('[data-cdw-close]') as HTMLElement).click();
        browser.close();

        // The rest of the suite drives the SAME opener that button calls.
        const res = openComponentDefinitionWorkspace(DEF_ID);
        expect(res.ok, !res.ok ? res.refusal : '').toBe(true);
        if (!res.ok) return;
        ws = res;
    }, BUDGET);

    it('ARM 2 — ADD A SHAPE by clicking, 600 × 400 × 2400: it mints an extrude solid that starts life building +Y, on the HOST plane', async () => {
        click('[data-cdw-add-shape]');
        expect(q('[data-cdw-add-shape-form]'), 'the form opened').not.toBeNull();
        // Deliberately three DIFFERENT lengths: a 600-cube could not tell one axis
        // from another, and ARM 6 is an axis comparison.
        (q<HTMLInputElement>('[data-cdw-dim-width-value]')!).value = '600';
        (q<HTMLInputElement>('[data-cdw-dim-depth-value]')!).value = '400';
        (q<HTMLInputElement>('[data-cdw-dim-height-value]')!).value = '2400';
        click('[data-cdw-add-shape-apply]');

        await vi.waitFor(() => {
            expect(doc().solids.length).toBe(1);
        });
        const solid = doc().solids[0];
        SOLID_ID = solid.id;
        expect(solid.kind).toBe('extrude');
        // The mint's default axis — the pre-§82.4 behaviour, unchanged.
        expect(solid.direction).toEqual({ x: 0, y: 1, z: 0 });
        const profile = doc().profiles.find((p: any) => p.id === solid.profileId);
        expect(profile.planeId, 'ensurePlane() found the host plane').toBe(HOST_PLANE);
    }, BUDGET);

    it('ARM 3 — ⭐ THE BASELINE PICTURE: the live viewport draws a mesh 0.6 × 2.4 × 0.4 m — tall, because the extrusion runs +Y', async () => {
        await ws.previewSettled();
        expect(ws.root.querySelector('[data-component-preview]')
            ?.getAttribute('data-component-preview-state')).toBe('ok');
        const e = previewExtent();
        expect(e.x).toBeCloseTo(0.6, 5);
        expect(e.y, 'the extrusion length is on +Y').toBeCloseTo(2.4, 5);
        expect(e.z).toBeCloseTo(0.4, 5);
    }, BUDGET);

    it('ARM 4 — ⭐⭐ ADD A WORK PLANE by clicking: name it, choose "builds along +X", "Add plane" — it lands in the DOCUMENT with that normal', async () => {
        click('[data-cdw-add-plane]');
        expect(q('[data-cdw-plane-form]'), 'the plane form opened').not.toBeNull();

        (q<HTMLInputElement>('[data-cdw-plane-name]')!).value = 'Wall face';
        (q<HTMLSelectElement>('[data-cdw-plane-orientation]')!).value = 'x';
        click('[data-cdw-plane-create]');

        await vi.waitFor(() => {
            expect(doc().referencePlanes.length).toBe(2);
        });
        const added = doc().referencePlanes.find((p: any) => p.name === 'Wall face');
        expect(added, 'the NAMED plane is in the draft document').toBeDefined();
        NEW_PLANE_ID = added.id;
        expect(added.normal).toEqual({ x: 1, y: 0, z: 0 });
        expect(added.isHost, 'a work plane is never minted as a second HOST plane').toBe(false);
        expect(q(`[data-cdw-plane="${NEW_PLANE_ID}"]`)?.textContent).toContain('(1, 0, 0)');
    }, BUDGET);

    it('ARM 5 — ⭐⭐ RE-BASE THE SHAPE by changing ONE select: the solid\'s sweep axis AND its profile\'s plane move in ONE act', async () => {
        const sel = q<HTMLSelectElement>(`[data-cdw-shape-plane="${SOLID_ID}"]`);
        expect(sel, 'the per-shape work-plane control is on the surface').not.toBeNull();
        expect(sel!.value, 'it opens on the truth — the plane the profile is actually on').toBe(HOST_PLANE);

        sel!.value = NEW_PLANE_ID;
        sel!.dispatchEvent(new Event('change'));

        await vi.waitFor(() => {
            expect(doc().solids[0].direction).toEqual({ x: 1, y: 0, z: 0 });
        });
        // ⭐ BOTH FIELDS, ONE ACT (C84 EI-9): "profile on the wall plane, extrusion
        //   still vertical" is not a state this surface can produce.
        const solid = doc().solids[0];
        const profile = doc().profiles.find((p: any) => p.id === solid.profileId);
        expect(profile.planeId).toBe(NEW_PLANE_ID);
    }, BUDGET);

    it('ARM 6 — ⭐⭐ THE PICTURE MOVED: the SAME viewport now draws 2.4 × 0.6 × 0.4 m — the extrusion length is on +X, measured on the bake\'s own buffer', async () => {
        await ws.previewSettled();
        expect(ws.root.querySelector('[data-component-preview]')
            ?.getAttribute('data-component-preview-state')).toBe('ok');
        const e = previewExtent();
        expect(e.x, 'the 2.4 m sweep is now on +X — the axis the user chose').toBeCloseTo(2.4, 5);
        expect(e.y, 'and +Y carries the profile ordinate that used to be on +X').toBeCloseTo(0.6, 5);
        expect(e.z, 'the axis untouched by the rotation is unchanged').toBeCloseTo(0.4, 5);
    }, BUDGET);

    it('ARM 7 — ⛔ THE DECLARED LIMIT IS ON THE SURFACE: the form states that a plane\'s ORIGIN is not applied, and offers no origin field to collect an intent that would be refused', () => {
        click('[data-cdw-add-plane]');
        const note = q('[data-cdw-plane-origin-note]');
        expect(note, 'the limit is stated where the author is choosing, not buried').not.toBeNull();
        expect(note!.textContent).toContain('ORIGIN is not applied');
        expect(q('[data-cdw-plane-form]')!.querySelector('[data-cdw-plane-origin]'),
            'no origin field — the op refuses an offset plane rather than half-honouring it').toBeNull();
        click('[data-cdw-plane-cancel]');
    }, BUDGET);

    it('ARM 8 — ⭐⭐ §82.1 "RENAME IT", by clicking: the name changes, the ID does not, and no geometry moves', async () => {
        const solidsBefore = JSON.stringify(doc().solids);
        const profilesBefore = JSON.stringify(doc().profiles);

        click(`[data-cdw-plane-rename="${NEW_PLANE_ID}"]`);
        const input = q<HTMLInputElement>(`[data-cdw-plane-rename-input="${NEW_PLANE_ID}"]`);
        expect(input, 'the inline rename field opened on the row').not.toBeNull();
        expect(input!.value, 'it opens on the current name, not empty').toBe('Wall face');
        input!.value = 'North elevation';
        click(`[data-cdw-plane-rename-apply="${NEW_PLANE_ID}"]`);

        await vi.waitFor(() => {
            expect(doc().referencePlanes.find((p: any) => p.id === NEW_PLANE_ID).name)
                .toBe('North elevation');
        });
        // ⭐ IDENTITY IS THE ID, AND IT DID NOT MOVE — which is exactly why a rename
        //   is offerable on a plane already carrying shapes while reorient/delete
        //   are not: nothing can be orphaned.
        expect(JSON.stringify(doc().solids), 'no solid changed').toBe(solidsBefore);
        expect(JSON.stringify(doc().profiles), 'no profile changed').toBe(profilesBefore);
        // …and the per-shape chooser, which lists planes BY NAME, followed it.
        const opt = q<HTMLSelectElement>(`[data-cdw-shape-plane="${SOLID_ID}"]`)!
            .querySelector(`option[value="${NEW_PLANE_ID}"]`);
        expect(opt?.textContent).toBe('North elevation');
    }, BUDGET);

    it('ARM 9 — ⛔ THE REFUSAL REACHES THE USER VERBATIM: renaming a plane to a name another plane already has is refused, in the op\'s own sentence, and nothing changes', async () => {
        click(`[data-cdw-plane-rename="${NEW_PLANE_ID}"]`);
        const input = q<HTMLInputElement>(`[data-cdw-plane-rename-input="${NEW_PLANE_ID}"]`)!;
        input.value = 'Base';                      // the HOST plane's name
        click(`[data-cdw-plane-rename-apply="${NEW_PLANE_ID}"]`);

        await vi.waitFor(() => {
            expect(ws.statusText).toContain('already carries a reference plane named "Base"');
        });
        // The op's WHOLE sentence, not a paraphrase (spec §75 / audit E2).
        expect(ws.statusText).toContain('chosen by NAME and never by id');
        expect(doc().referencePlanes.find((p: any) => p.id === NEW_PLANE_ID).name)
            .toBe('North elevation');
        // ⛔ The form stays OPEN on a refusal — what the author typed is still there
        //   at the moment they need to correct it.
        expect(q(`[data-cdw-plane-rename-input="${NEW_PLANE_ID}"]`)).not.toBeNull();
        click(`[data-cdw-plane-rename-cancel="${NEW_PLANE_ID}"]`);
    }, BUDGET);

    it('ARM 10 — ⭐ IT SURVIVES THE SAVE: packFamily → the ONE catalogue/loader → the reloaded document still builds along +X', async () => {
        const saveBtn = q('[data-cdw-save]');
        expect(saveBtn, 'the save affordance is on the surface').not.toBeNull();
        (saveBtn as HTMLElement).click();

        await vi.waitFor(() => {
            expect(componentCatalog.entry(DEF_ID)!.family.document.solids.length).toBe(1);
        }, { timeout: 30_000 });

        const reloaded = componentCatalog.entry(DEF_ID)!.family.document as any;
        const solid = reloaded.solids[0];
        // Through pack → unzip → Zod → resolver pre-flight, the axis is intact.
        expect(solid.direction).toEqual({ x: 1, y: 0, z: 0 });
        const profile = reloaded.profiles.find((p: any) => p.id === solid.profileId);
        expect(profile.planeId).toBe(NEW_PLANE_ID);
        expect(reloaded.referencePlanes.find((p: any) => p.id === NEW_PLANE_ID).name)
            .toBe('North elevation');
        ws.close();
    }, BUDGET);
});
