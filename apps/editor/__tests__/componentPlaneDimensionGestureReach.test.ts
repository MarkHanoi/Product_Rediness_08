/**
 * @vitest-environment happy-dom
 */
// componentPlaneDimensionGestureReach — §82.1-PARAMETRIC-DATUM, lane CE-PARAMS-AND-PLANES.
//   STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.1 (*"Create a reference plane in a
//   2-D view; it is visible in the 3-D view; rename it; DIMENSION TO IT."*) · C110
//   (parameter / unit / expression model) · C111 §5.1 D-9 · C16 CA-21 · C84 EI-6 /
//   EI-9 · spec §75 · ADR-0376 D3/D5.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE REVIT SEMANTIC, AS A GESTURE CHAIN, AT THE LAYER THE USER TOUCHES:
//     Components browser → "Edit definition…" CLICK → "Add shape…" 600 × 400 ×
//     2400 → the live preview bakes a box whose BASE sits at Y = 0 → "Dimension"
//     CLICK on the work plane, "Bind to parameter" → DatumHeight → "Apply" → the
//     SAME bake puts the SAME box with its base at Y = 0.9 m → change the
//     PARAMETER (a formula of 1800) → the base is at 1.8 m, and the box is still
//     exactly 2.4 m tall.
//     (⚠ "bakes", not "draws" — item 2b below says why the pixels of a ONE-solid
//     preview cannot carry this claim, and what does.)
//
//     THAT LAST CLAUSE IS THE WHOLE POINT. Geometry is LOCKED to the plane (the
//     profile's `planeId`), the plane is positioned by a PARAMETRIC dimension, so
//     changing the parameter MOVES THE PLANE and the geometry follows. A control
//     that merely stored a number beside the shape would move the base and could
//     just as easily have grown the box; every arm below asserts BOTH ends of the
//     extent, so "the solid grew" cannot pass as "the datum moved".
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ WHY THIS FILE EXISTS, GIVEN TWO SUITES ALREADY PASS ────────────────────
// `packages/file-format/__tests__/family-migrations/set-plane-offset-op.test.ts`
// proves the OP writes the dimension; `packages/family-instance/__tests__/
// planeOffsetFlex.test.ts` proves the BAKE moves the geometry by the right
// distance in the right unit. Neither proves a USER can reach either — the
// [[committed-is-not-reachable]] / [[authored-but-unwired-is-the-bottleneck]]
// failure this repo keeps re-committing. Every act below is a DOM event on the
// production surface; nothing here calls a migrator, and nothing reaches past the
// workspace into the ops.
//
// ─── ⭐ WHERE THE PROPERTY IS READ BACK (C16 CA-21) ────────────────────────────
// Never off the field the gesture wrote. ARMs 3, 5 and 6 measure the POSITION
// BUFFER of the mesh the workspace's own live preview built — the same
// `bakeFamilyInstance` a placed instance goes through. If the document field moved
// and the bake ignored it, or the bake moved and the RENDER SUBJECT kept its old
// cache key, these arms fail. (The second of those was a real defect this lane
// found and fixed: `componentPreviewSubject`'s key hashed parameters, profiles and
// solids but NOT `referencePlanes`, so a dimensioned plane produced new numbers
// under an unchanged key and `ElementPreviewRenderer` never rebuilt the content.)
//
// ─── ⚠ WHAT A GREEN HERE DOES NOT ESTABLISH ───────────────────────────────────
//  1. NOT BROWSER-VERIFIED. happy-dom has no WebGL: this asserts the descriptor the
//     renderer would upload, never a pixel.
//  2. NO PLACED INSTANCE. The flex is measured in the definition workspace's own
//     preview, not on an instance in a project.
//  2b. ⛔ THE FRAMING HIDES THE MOVE FOR A LONE SOLID, and this file will not
//     pretend otherwise. `componentPreviewSubject` gives every part a shared
//     `center` derived from the UNION bounds so the subject orbits about its own
//     middle; with exactly ONE solid, moving the datum moves the box and the
//     re-centring cancels it, so the PIXELS look identical. What these arms
//     measure is the bake's own position buffer — model space, where the move is
//     real and where a placed instance, a second solid on another datum, and the
//     export all read it. Saying "the viewport moved" of a single-solid preview
//     would be false.
//  3. Plane-to-plane dimensioning does not exist: the offset is measured from the
//     MODEL ORIGIN along the plane's normal, never from another datum.
//  4. ⭐ CORRECTED WITHIN THIS LANE, and recorded rather than quietly deleted:
//     this note read *"the parameter is changed by giving it a FORMULA, because
//     that is the only way this workspace can change a parameter's value at all:
//     there is no `set-parameter-default` op and no default-editing field on the
//     surface."* That was true when ARM 6 was written and is why ARM 6 exists in
//     the shape it does. The op and the field now exist (§PARAM-VALUE-IS-EDITABLE),
//     so ARM 6 types a VALUE — the gesture an author actually reaches for — and
//     ARM 6B keeps the formula path measured beside it, together with the D4
//     refusal that stops the two channels from disagreeing.

import { describe, expect, it, beforeAll, vi } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ The SAME singleton the PluginRegistry injects into the component handlers.
import { componentCatalog } from '../src/services/componentCatalog/index.js';
// ⭐ The production browser — the workspace's only user entry.
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel.js';
import {
    openComponentDefinitionWorkspace,
    type ComponentDefinitionWorkspaceHandle,
} from '../src/ui/component-editor-workspace/index.js';

const AUDIT = { actorId: 'uce-plane-dim', projectId: 'uce-plane-dim', clientId: 'node' } as const;
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5V';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const DEF_ID = `fam_${ulidN(10)}`;
const TYPE_ID = `typ_${ulidN(11)}`;
const PARAM_DATUM = `par_${ulidN(12)}`;
const HOST_PLANE = `plane_${ulidN(13)}`;
const NOW = '2026-09-06T00:00:00.000Z';

/** The datum height, in the runtime's canonical length unit (millimetres today).
 *  ⛔ 900 / 1800 are the NEGATIVE CONTROL on units (C110 §3): both readings —
 *  900 mm / 0.9 m — are physically plausible for a datum, and they differ by
 *  three orders of magnitude, so a skipped metre conversion cannot pass. */
const DATUM_MM = 900;
const DATUM_M = 0.9;
const FLEXED_MM = 1800;
const FLEXED_M = 1.8;
/** The shape, in mm. Three DIFFERENT lengths so no axis can stand in for another. */
const W_MM = 600, D_MM = 400, H_MM = 2400;
const H_M = 2.4;

/** A definition with a HOST plane at the origin, ONE bindable length parameter
 *  and no solids — the state an author is in one gesture after "New Component". */
async function packedBytes(): Promise<Uint8Array> {
    const emptyChecksum = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [
            // ⭐ ABSENT `offsetExpression` — an undimensioned datum. It is not
            //   `null`: absent is the schema's "this plane is not dimensioned".
            { id: HOST_PLANE, name: 'Base', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
        ],
        parameters: [
            {
                id: PARAM_DATUM, name: 'DatumHeight', kind: 'instance', dataType: 'length',
                defaultValue: DATUM_MM, expression: null, ifcMapping: null, exposed: true,
            },
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
        name: 'Datum Probe',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR05', displayName: 'lane-ce-params-and-planes' },
        description: 'the §82.1-PARAMETRIC-DATUM gesture-reach fixture',
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
function plane(): any {
    return doc().referencePlanes.find((p: any) => p.id === HOST_PLANE);
}

/**
 * The BOUNDS of the mesh the LIVE preview built, in metres — read off the bake's
 * own position buffer, never off the field the gesture wrote (C16 CA-21).
 * Both ends, deliberately: `min` alone cannot tell "the datum moved" from "the
 * solid grew downward", which is exactly the confusion this lane must not ship.
 */
function previewBounds(): { minY: number; maxY: number; extentY: number; extentX: number; extentZ: number } {
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
    return {
        minY: lo[1]!, maxY: hi[1]!,
        extentY: hi[1]! - lo[1]!, extentX: hi[0]! - lo[0]!, extentZ: hi[2]! - lo[2]!,
    };
}

describe('§82.1-PARAMETRIC-DATUM — a user dimensions a work plane with a PARAMETER and the geometry follows', () => {

    it('ARM 1 — ⭐ OPEN: the browser\'s "Edit definition…" click mounts the workspace, and the plane row carries a DIMENSION affordance that says the datum is at the origin', () => {
        const browser = new ComponentBrowserPanel();
        browser.open();
        const editBtn = document.querySelector(`[data-component-browser-edit="${DEF_ID}"]`) as HTMLElement | null;
        expect(editBtn, 'the browser lists the loaded definition').not.toBeNull();
        editBtn!.click();

        const card = document.querySelector(`[data-cdw-root="${DEF_ID}"]`) as HTMLElement | null;
        expect(card, 'the workspace is ON THE PAGE').not.toBeNull();
        // ⭐ THE REACHABILITY CLAIM, in one node. Before this lane the op existed,
        //   the schema field existed and the bake honoured it — and NO gesture
        //   arrived at any of the three.
        expect(card!.querySelector(`[data-cdw-plane-dimension="${HOST_PLANE}"]`),
            'the "Dimension" affordance is on the plane row').not.toBeNull();
        // An undimensioned datum SAYS SO — a blank is not an answer (C57 §1.5).
        expect(card!.querySelector(`[data-cdw-plane-dim-label="${HOST_PLANE}"]`)?.textContent)
            .toContain('at the origin');
        // D5 — user-facing copy says Component, never Family.
        expect(card!.textContent).not.toMatch(/family/i);

        (card!.querySelector('[data-cdw-close]') as HTMLElement).click();
        browser.close();

        const res = openComponentDefinitionWorkspace(DEF_ID);
        expect(res.ok, !res.ok ? res.refusal : '').toBe(true);
        if (!res.ok) return;
        ws = res;
    }, BUDGET);

    it('ARM 2 — ADD A SHAPE by clicking, 600 × 400 × 2400: it lands on the HOST plane, which is the LOCK the rest of this suite depends on', async () => {
        click('[data-cdw-add-shape]');
        expect(q('[data-cdw-add-shape-form]'), 'the form opened').not.toBeNull();
        (q<HTMLInputElement>('[data-cdw-dim-width-value]')!).value = String(W_MM);
        (q<HTMLInputElement>('[data-cdw-dim-depth-value]')!).value = String(D_MM);
        (q<HTMLInputElement>('[data-cdw-dim-height-value]')!).value = String(H_MM);
        click('[data-cdw-add-shape-apply]');

        await vi.waitFor(() => { expect(doc().solids.length).toBe(1); });
        const solid = doc().solids[0];
        SOLID_ID = solid.id;
        expect(solid.direction).toEqual({ x: 0, y: 1, z: 0 });
        const profile = doc().profiles.find((p: any) => p.id === solid.profileId);
        // ⭐ THE LOCK. `planeId` is what binds this geometry to the datum; without
        //   it the plane could move all day and nothing would follow.
        expect(profile.planeId, 'the shape is LOCKED to the host plane').toBe(HOST_PLANE);
    }, BUDGET);

    it('ARM 3 — ⭐ THE BASELINE: the live preview bakes the box with its BASE at Y = 0 — the undimensioned datum', async () => {
        await ws.previewSettled();
        expect(ws.root.querySelector('[data-component-preview]')
            ?.getAttribute('data-component-preview-state')).toBe('ok');
        const b = previewBounds();
        expect(b.minY, 'an undimensioned plane puts the base at the model origin').toBeCloseTo(0, 5);
        expect(b.maxY).toBeCloseTo(H_M, 5);
        expect(b.extentX).toBeCloseTo(0.6, 5);
        expect(b.extentZ).toBeCloseTo(0.4, 5);
    }, BUDGET);

    it('ARM 4 — ⭐⭐ DIMENSION THE PLANE by clicking: "Bind to parameter" → DatumHeight → Apply writes the PARAMETER NAME, not its value and not its id', async () => {
        click(`[data-cdw-plane-dimension="${HOST_PLANE}"]`);
        const form = q(`[data-cdw-plane-dim-form="${HOST_PLANE}"]`);
        expect(form, 'the inline dimension form opened on the row').not.toBeNull();

        const mode = q<HTMLSelectElement>(`[data-cdw-plane-dim-mode="${HOST_PLANE}"]`)!;
        // ⭐ The DEFAULT is the parametric one — the founder's requirement is about
        //   a plane a parameter moves, so binding is the offered path, not the
        //   buried one.
        expect(mode.value, 'binding to a parameter is the default when one exists').toBe('parameter');

        const param = q<HTMLSelectElement>(`[data-cdw-plane-dim-param="${HOST_PLANE}"]`)!;
        // C110 §1.4 — the expression grammar identifies a parameter by NAME.
        expect(param.value).toBe('DatumHeight');
        expect(param.querySelector('option')?.textContent).toBe('DatumHeight');

        click(`[data-cdw-plane-dim-apply="${HOST_PLANE}"]`);
        await vi.waitFor(() => { expect(plane().offsetExpression).toBe('DatumHeight'); });

        // ⛔ NOT the value. A document carrying `900` here would be exactly the
        //    "number stored beside the geometry" outcome the requirement excludes:
        //    changing DatumHeight afterwards would move nothing.
        expect(plane().offsetExpression).not.toBe(String(DATUM_MM));
        expect(plane().offsetExpression).not.toBe(PARAM_DATUM);
        expect(q(`[data-cdw-plane-dim-label="${HOST_PLANE}"]`)?.textContent)
            .toContain('dimensioned DatumHeight');
    }, BUDGET);

    it('ARM 5 — ⭐⭐ THE GEOMETRY MOVED: the SAME bake puts the SAME box with its base at 0.9 m in model space — and the box did NOT grow', async () => {
        await ws.previewSettled();
        expect(ws.root.querySelector('[data-component-preview]')
            ?.getAttribute('data-component-preview-state')).toBe('ok');
        const b = previewBounds();
        // ⛔ THE 1000× NEGATIVE CONTROL: a skipped runtime→metres conversion would
        //    read 900 here, not 0.9.
        expect(b.minY, 'the base sits on the dimensioned datum').toBeCloseTo(DATUM_M, 5);
        expect(b.maxY).toBeCloseTo(DATUM_M + H_M, 5);
        // ⭐ BOTH ENDS MOVED TOGETHER. A height that changed would mean the offset
        //   had been folded into the extrusion length — a different bug that passes
        //   a naive min-Y assertion.
        expect(b.extentY, 'the solid did not grow — the DATUM moved').toBeCloseTo(H_M, 5);
    }, BUDGET);

    it('ARM 6 — ⭐⭐⭐ THE FLEX: TYPE A NEW VALUE for the parameter and the plane moves, and the geometry with it — 0.9 m → 1.8 m, still exactly 2.4 m tall', async () => {
        // ⭐ The gesture an author actually reaches for: open the row, "Value…",
        //   type 1800. Not a formula, not a re-added parameter — the ordinary edit
        //   §PARAM-VALUE-IS-EDITABLE exists to make possible.
        const row = ws.root.querySelector(`tr[data-dcpt-row="${PARAM_DATUM}"]`) as HTMLElement | null;
        expect(row, 'the parameter table lists DatumHeight').not.toBeNull();
        row!.click();
        click(`[data-cdw-act-default="${PARAM_DATUM}"]`);
        const input = q<HTMLInputElement>(`[data-cdw-default-input="${PARAM_DATUM}"]`);
        expect(input, 'the value field opened under the row').not.toBeNull();
        // It opens on the TRUTH, not on a placeholder.
        expect(input!.value).toBe(String(DATUM_MM));
        input!.value = String(FLEXED_MM);
        click(`[data-cdw-default-apply="${PARAM_DATUM}"]`);

        await vi.waitFor(() => {
            expect(doc().parameters.find((p: any) => p.id === PARAM_DATUM).defaultValue)
                .toBe(FLEXED_MM);
        });
        // ⛔ And it stayed a VALUE — no formula was minted behind the author's back,
        //    which is what the pre-§PARAM-VALUE-IS-EDITABLE workaround would have done.
        expect(doc().parameters.find((p: any) => p.id === PARAM_DATUM).expression).toBeNull();
        // ⛔ The plane's own field did NOT change — and that is the point. The
        //    dimension still reads "DatumHeight"; what moved is what DatumHeight
        //    resolves to. A design that had baked the number into the plane would
        //    fail here, silently, by not moving.
        expect(plane().offsetExpression).toBe('DatumHeight');

        await ws.previewSettled();
        const b = previewBounds();
        expect(b.minY, 'the datum — and the shape locked to it — moved to 1.8 m').toBeCloseTo(FLEXED_M, 5);
        expect(b.maxY).toBeCloseTo(FLEXED_M + H_M, 5);
        expect(b.extentY, 'and the box is still 2.4 m tall').toBeCloseTo(H_M, 5);
    }, BUDGET);

    it('ARM 6B — ⭐ A FORMULA ON THE PARAMETER FLEXES IT TOO, and typing a value over one is REFUSED in the op\'s own words (ADR-0376 D4)', async () => {
        const row = () => ws.root.querySelector(`tr[data-dcpt-row="${PARAM_DATUM}"]`) as HTMLElement;
        row().click();
        click(`[data-cdw-act-expression="${PARAM_DATUM}"]`);
        (q<HTMLInputElement>(`[data-cdw-expr-input="${PARAM_DATUM}"]`)!).value = '2400';
        click(`[data-cdw-expr-apply="${PARAM_DATUM}"]`);
        await vi.waitFor(() => {
            expect(doc().parameters.find((p: any) => p.id === PARAM_DATUM).expression).toBe('2400');
        });
        await ws.previewSettled();
        expect(previewBounds().minY, 'the formula drives the datum as well').toBeCloseTo(2.4, 5);

        // ⛔ NOW THE TWO CHANNELS MUST NOT DISAGREE. D4 says the expression wins, so
        //    a value typed here would resolve to nothing — a silent no-op is exactly
        //    what spec §75 forbids, and the op refuses instead, naming the way out.
        row().click();
        click(`[data-cdw-act-default="${PARAM_DATUM}"]`);
        (q<HTMLInputElement>(`[data-cdw-default-input="${PARAM_DATUM}"]`)!).value = '600';
        click(`[data-cdw-default-apply="${PARAM_DATUM}"]`);
        await vi.waitFor(() => {
            expect(ws.root.querySelector(`[data-cdw-row-refusal="${PARAM_DATUM}"]`)?.textContent ?? '')
                .toContain('ADR-0376 D4');
        });
        expect(ws.root.querySelector(`[data-cdw-row-refusal="${PARAM_DATUM}"]`)!.textContent)
            .toContain('delete-expression');
        expect(doc().parameters.find((p: any) => p.id === PARAM_DATUM).defaultValue,
            'and nothing was written').toBeNull();

        // Remove the formula; the value it superseded (1800) comes back with it, and
        // the geometry follows it back. That round trip is the D4 contract in one act.
        row().click();
        click(`[data-cdw-act-expression="${PARAM_DATUM}"]`);
        click(`[data-cdw-expr-clear="${PARAM_DATUM}"]`);
        await vi.waitFor(() => {
            expect(doc().parameters.find((p: any) => p.id === PARAM_DATUM).expression).toBeNull();
        });
        expect(doc().parameters.find((p: any) => p.id === PARAM_DATUM).defaultValue).toBe(FLEXED_MM);
        await ws.previewSettled();
        expect(previewBounds().minY).toBeCloseTo(FLEXED_M, 5);
    }, BUDGET);

    it('ARM 7 — ⭐ ARITHMETIC, THROUGH THE ONE EXPRESSION ENGINE: "DatumHeight - 300" resolves to 1.5 m — a parseFloat would read 1800 and a Number() would read NaN', async () => {
        click(`[data-cdw-plane-dimension="${HOST_PLANE}"]`);
        const mode = q<HTMLSelectElement>(`[data-cdw-plane-dim-mode="${HOST_PLANE}"]`)!;
        // The form opened on the TRUTH — the binding that is actually there.
        expect(mode.value).toBe('parameter');
        mode.value = 'expression';
        mode.dispatchEvent(new Event('change'));
        (q<HTMLInputElement>(`[data-cdw-plane-dim-expr="${HOST_PLANE}"]`)!).value = 'DatumHeight - 300';
        click(`[data-cdw-plane-dim-apply="${HOST_PLANE}"]`);

        await vi.waitFor(() => { expect(plane().offsetExpression).toBe('DatumHeight - 300'); });
        await ws.previewSettled();
        const b = previewBounds();
        expect(b.minY).toBeCloseTo(1.5, 5);
        expect(b.extentY).toBeCloseTo(H_M, 5);
    }, BUDGET);

    it('ARM 8 — ⛔ AN UNREADABLE DIMENSION REFUSES AT THE BAKE, IN THE ENGINE\'S OWN WORDS, and the viewport says so rather than drawing a stale shape', async () => {
        click(`[data-cdw-plane-dimension="${HOST_PLANE}"]`);
        const mode = q<HTMLSelectElement>(`[data-cdw-plane-dim-mode="${HOST_PLANE}"]`)!;
        mode.value = 'expression';
        mode.dispatchEvent(new Event('change'));
        (q<HTMLInputElement>(`[data-cdw-plane-dim-expr="${HOST_PLANE}"]`)!).value = 'NoSuchParameter';
        click(`[data-cdw-plane-dim-apply="${HOST_PLANE}"]`);

        await vi.waitFor(() => { expect(plane().offsetExpression).toBe('NoSuchParameter'); });
        await ws.previewSettled();
        const res = ws.previewResult();
        expect(res, 'the preview evaluated').not.toBeNull();
        // ⭐ The refusal is the EVALUATOR's, verbatim — this surface mints no second
        //   parser and no paraphrase (C110 §4, spec §75).
        const sentences = res!.ok
            ? res!.unsupported.map((u: any) => u.message).join(' | ')
            : `${res!.message} | ${(res as any).unsupported.map((u: any) => u.message).join(' | ')}`;
        expect(sentences).toContain('NoSuchParameter');
        expect(ws.root.querySelector('[data-component-preview]')
            ?.getAttribute('data-component-preview-state'),
            'a refused bake is never drawn as an "ok" picture').not.toBe('ok');

        // Put it back so the save arm measures a real definition.
        click(`[data-cdw-plane-dimension="${HOST_PLANE}"]`);
        const m2 = q<HTMLSelectElement>(`[data-cdw-plane-dim-mode="${HOST_PLANE}"]`)!;
        m2.value = 'parameter';
        m2.dispatchEvent(new Event('change'));
        click(`[data-cdw-plane-dim-apply="${HOST_PLANE}"]`);
        await vi.waitFor(() => { expect(plane().offsetExpression).toBe('DatumHeight'); });
    }, BUDGET);

    it('ARM 9 — ⛔ THE FORM\'S OWN REFUSAL: "Fixed" with nothing typed is refused with a sentence naming the unit, and NOTHING is written', async () => {
        const before = plane().offsetExpression;
        click(`[data-cdw-plane-dimension="${HOST_PLANE}"]`);
        const mode = q<HTMLSelectElement>(`[data-cdw-plane-dim-mode="${HOST_PLANE}"]`)!;
        mode.value = 'literal';
        mode.dispatchEvent(new Event('change'));
        (q<HTMLInputElement>(`[data-cdw-plane-dim-value="${HOST_PLANE}"]`)!).value = '';
        click(`[data-cdw-plane-dim-apply="${HOST_PLANE}"]`);

        await vi.waitFor(() => {
            expect(ws.statusText).toContain('A fixed dimension needs a finite number');
        });
        expect(plane().offsetExpression, 'the draft is untouched').toBe(before);
        // ⛔ The form stays OPEN on a refusal — what the author was doing survives
        //   the moment they must correct it.
        expect(q(`[data-cdw-plane-dim-form="${HOST_PLANE}"]`)).not.toBeNull();
        click(`[data-cdw-plane-dim-cancel="${HOST_PLANE}"]`);
    }, BUDGET);

    it('ARM 10 — ⭐ CLEAR returns the datum to the origin, and the geometry comes back with it', async () => {
        click(`[data-cdw-plane-dimension="${HOST_PLANE}"]`);
        click(`[data-cdw-plane-dim-clear="${HOST_PLANE}"]`);
        await vi.waitFor(() => { expect('offsetExpression' in plane()).toBe(false); });
        // ⭐ The KEY is gone, not set to null — an absent field re-packs
        //   byte-identically to a plane that was never dimensioned (C111 §5.4-a).
        await ws.previewSettled();
        expect(previewBounds().minY).toBeCloseTo(0, 5);
        expect(q(`[data-cdw-plane-dim-label="${HOST_PLANE}"]`)?.textContent).toContain('at the origin');

        // Re-bind for the save arm.
        click(`[data-cdw-plane-dimension="${HOST_PLANE}"]`);
        click(`[data-cdw-plane-dim-apply="${HOST_PLANE}"]`);
        await vi.waitFor(() => { expect(plane().offsetExpression).toBe('DatumHeight'); });
    }, BUDGET);

    it('ARM 11 — ⭐ IT SURVIVES THE SAVE: packFamily → the ONE catalogue/loader → the reloaded document still carries the dimension, and it is still a NAME', async () => {
        const saveBtn = q('[data-cdw-save]');
        expect(saveBtn, 'the save affordance is on the surface').not.toBeNull();
        (saveBtn as HTMLElement).click();

        await vi.waitFor(() => {
            expect(componentCatalog.entry(DEF_ID)!.family.document.solids.length).toBe(1);
        }, { timeout: 30_000 });

        const reloaded = componentCatalog.entry(DEF_ID)!.family.document as any;
        const pl = reloaded.referencePlanes.find((p: any) => p.id === HOST_PLANE);
        // Through pack → unzip → Zod → resolver pre-flight, the dimension is intact.
        expect(pl.offsetExpression).toBe('DatumHeight');
        expect(pl.origin, 'the literal origin is still the model origin — one position, not two')
            .toEqual({ x: 0, y: 0, z: 0 });
        const solid = reloaded.solids[0];
        expect(solid.id, 'the same solid, not a re-minted one').toBe(SOLID_ID);
        const profile = reloaded.profiles.find((p: any) => p.id === solid.profileId);
        expect(profile.planeId, 'and the geometry is still locked to it').toBe(HOST_PLANE);
        ws.close();
    }, BUDGET);
});
