/**
 * @vitest-environment happy-dom
 */
// componentProfileDrawnThroughComposedRuntime — §PROFILE-RING-IS-AUTHORABLE
//   (lane CE-MAKE-IT-REACHABLE · L-12976) · C111 §1.3-b/§9.3 · C110 §2.2 ·
//   ADR-0376 D5 · C84 EI-6/EI-9 · spec §75 · [[committed-is-not-reachable]].
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE ACCEPTANCE THIS LANE OWES, AT THE LAYER THE USER EXPERIENCES.
//
//     L-12976 recorded that the sketching surface a lane had just shipped —
//     `apps/component-editor`, 8 draw tools — HAS NO BUNDLE ENTRY AND NO ROUTE,
//     and that "the sketch never becomes a family": nothing there builds a
//     `FamilyDocument`, and the drawing is in-memory only. This file is the
//     counter-proof for the surface that IS in the product:
//
//       open the REAL Components browser → click its "Edit definition…" entry →
//       open the profile → click DRAW OUTLINE → place five vertices on the REAL
//       SVG the author points at → FINISH → COMMIT → SAVE through `packFamily`
//       → the definition RELOADS through the ONE catalogue → the reloaded
//       document carries FIVE points → `bakeFamilyInstance` extrudes the five-
//       sided polygon.
//
//     Every step below is a DOM event or a real module call. There is no fake
//     catalogue, no fake document and no stubbed op ([[fake-more-capable-than-real]]).
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⚠ WHAT THIS FILE DOES NOT PROVE — stated so a green is not over-read ─────
//  1. **3-D pixels.** The bake's descriptor is asserted; no renderer runs here.
//     That descope is inherited from lane 4E and is unchanged.
//  2. **Curves.** The ring this surface draws is a POLYLINE of `point` entities.
//     `profileToPolygon` can evaluate `arc` / `circle` / cubic-Bézier `spline`
//     entities, and NOTHING in this workspace authors one — a profile that
//     carries one is REFUSED for write-back by name, which ARM 5 proves. The
//     cubic-Bézier gap is C111 §9.6-d and is NOT closed by this lane.
//  3. **Constraints.** `ProfileConstraintSchema` has zero writers in the product
//     (C111 §9.3), so ARM 6's refusal is proven against a hand-built fixture.

import { describe, expect, it, beforeAll, vi } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bakeFamilyInstance } from '@pryzm/family-instance';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ The SAME singleton every handler and the browser read.
import { componentCatalog } from '../src/services/componentCatalog/index.js';
// ⭐ The REAL production entry (CreatePanelLayout.ts → openComponentBrowser).
import { ComponentBrowserPanel } from '../src/ui/component-browser/ComponentBrowserPanel.js';
import type { ComponentDefinitionWorkspaceHandle } from '../src/ui/component-editor-workspace/index.js';
// ⭐ The two pure seams the panel composes — driven directly in ARM 5/6, where the
//    subject is a document shape no production surface can currently author.
import {
    commitRingToProfile,
    profileToSurfaceRing,
} from '../src/ui/component/profileSurfaceAdapter.js';

const AUDIT = { actorId: 'ce-profile-draw', projectId: 'ce-profile-draw', clientId: 'node' } as const;
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G6T';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
/** A BARE (unprefixed) 26-char id — the spelling `ProfileEntitySchema` takes. */
const bare = (n: number): string => `${'0'.repeat(24)}${ulidN(n).slice(-2)}`;

const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_ID = `typ_${ulidN(2)}`;
const PARAM_H = `par_${ulidN(3)}`;
const PLANE_ID = `plane_${ulidN(4)}`;
const PROFILE_ID = `prof_${ulidN(5)}`;
const SOLID_ID = `sol_${ulidN(6)}`;
const NOW = '2026-09-06T00:00:00.000Z';
const EMPTY_CHECKSUM = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

/**
 * The fixture is a plain rectangular SKETCH — four `point` entities with NUMERIC
 * coordinates — extruded by a parameter.
 *
 * ⚠ It is deliberately NOT built by `add-box-solid`: that op writes every corner
 *   as an EXPRESSION STRING, so no profile it produces is write-back admissible
 *   (`profileWriteBackDisposition` refuses an expression-valued coordinate by
 *   name). Two shapes of geometry, two ops, and neither doing the other's job.
 *   Coordinates are in runtime length units (mm, C110 §3.3).
 */
async function packedBytes(): Promise<Uint8Array> {
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [
            { id: PLANE_ID, name: 'Base', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
        ],
        parameters: [
            { id: PARAM_H, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 600, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [{
            id: PROFILE_ID, name: 'Body', planeId: PLANE_ID,
            entities: [
                { id: bare(20), kind: 'point', data: { x: 0, z: 0 } },
                { id: bare(21), kind: 'point', data: { x: 1000, z: 0 } },
                { id: bare(22), kind: 'point', data: { x: 1000, z: 800 } },
                { id: bare(23), kind: 'point', data: { x: 0, z: 800 } },
            ],
            constraints: [],
        }],
        solids: [{
            id: SOLID_ID, kind: 'extrude', profileId: PROFILE_ID, materialSlotId: null,
            lod: { coarse: false, medium: true, fine: true },
            lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 },
        }],
        materialSlots: [],
        types: [{ id: TYPE_ID, name: 'Standard', values: {}, checksum: EMPTY_CHECKSUM }],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'Drawable Bracket',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR04', displayName: 'lane-ce' },
        description: 'lane CE-MAKE-IT-REACHABLE fixture',
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

let ws: ComponentDefinitionWorkspaceHandle;

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

/** The reloaded document's profile — read out of the ONE catalogue, never a local copy. */
function reloadedProfile(): { entities: readonly { id: string; kind: string; data: Record<string, unknown> }[] } {
    const entry = componentCatalog.entry(DEF_ID);
    if (!entry) throw new Error('[test] the definition left the catalogue');
    const p = entry.family.document.profiles.find((pr) => pr.id === PROFILE_ID);
    if (!p) throw new Error('[test] the definition lost its profile');
    return p as never;
}

describe('§PROFILE-RING-IS-AUTHORABLE — a user DRAWS a profile and it survives save → reload → bake', () => {

    it('ARM 1 — ⭐ THE ROUTE A USER WALKS: the real Components browser mounts the workspace, and the profile opens with a DRAW affordance', () => {
        const browser = new ComponentBrowserPanel();
        browser.open();
        const editBtn = document.querySelector(`[data-component-browser-edit="${DEF_ID}"]`) as HTMLElement | null;
        expect(editBtn, 'the browser lists the edit entry for the loaded definition').not.toBeNull();
        editBtn!.click();
        browser.close();

        const card = document.querySelector(`[data-cdw-root="${DEF_ID}"]`) as HTMLElement | null;
        expect(card, 'the workspace is ON THE PAGE').not.toBeNull();

        const handle = (window as unknown as { __cdwHandle?: unknown }).__cdwHandle;
        expect(handle, 'the click published no handle — this ARM reopens through the same opener').toBeUndefined();
    }, BUDGET);

    it('ARM 2 — ⭐⭐ DRAW: five clicks on the real SVG replace a four-vertex rectangle with a five-vertex outline', async () => {
        const mod = await import('../src/ui/component-editor-workspace/index.js');
        // Close the ARM-1 card first — the opener refuses a second mount otherwise.
        (document.querySelector(`[data-cdw-root="${DEF_ID}"] [data-cdw-close]`) as HTMLElement | null)?.click();
        const res = mod.openComponentDefinitionWorkspace(DEF_ID);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        ws = res;

        expect(ws.openProfile(PROFILE_ID), 'the profile mounts').toBe(true);
        const host = (): HTMLElement => ws.root.querySelector('[data-cdw-profile-host]') as HTMLElement;

        // ⭐ THE AFFORDANCE EXISTS AND IS THE ONE THE PANEL OWNS.
        const drawBtn = host().querySelector('[data-dwp-draw]') as HTMLElement | null;
        expect(drawBtn, 'a writable profile gets a DRAW affordance').not.toBeNull();
        expect(host().querySelector('[data-dwp-finish]'), 'and a finish affordance').not.toBeNull();

        const panel = ws.profilePanel()!;
        const surface = panel.surface!;
        expect(surface.ring.length, 'the seeded rectangle').toBe(4);
        expect(surface.mode).toBe('select');

        drawBtn!.click();
        expect(surface.mode, 'the button drove the surface into a construction mode').toBe('polyline');

        // ── FIVE CLICKS on the SVG the author points at ────────────────────────
        // Coordinates are SURFACE units (the sheet is padded by
        // PROFILE_SHEET_MARGIN_FRACTION, so the shape sits inset from the edges).
        const L = [
            { u: 400, v: 400 }, { u: 1400, v: 400 }, { u: 1400, v: 700 },
            { u: 900, v: 700 }, { u: 900, v: 1200 },
        ];
        for (const p of L) {
            const px = surface.toPx(p);
            surface.svg.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, clientX: px.x, clientY: px.y, shiftKey: true,
            }));
        }
        expect(surface.draft?.length, 'five vertices are on the open draft').toBe(5);
        expect(surface.ring.length, 'and the committed ring is untouched until Finish').toBe(4);

        (host().querySelector('[data-dwp-finish]') as HTMLElement).click();
        expect(surface.mode, 'Finish returns to select').toBe('select');
        expect(surface.ring.length, '⭐ the drawn outline IS the ring now').toBe(5);
    }, BUDGET);

    it('ARM 3 — ⭐⭐ COMMIT: the drawn ring lands in the draft document through `set-profile-ring`, minting ONE entity id', async () => {
        const host = ws.root.querySelector('[data-cdw-profile-host]') as HTMLElement;
        (host.querySelector(`[data-cdw-profile-commit="${PROFILE_ID}"]`) as HTMLElement).click();

        await vi.waitFor(() => {
            expect(ws.statusText).toContain('Outline committed to the draft');
        });
        expect(ws.statusText, 'the delta is stated, not implied').toContain('5 point(s) — 1 added, 0 removed');
        expect(ws.isDirty()).toBe(true);

        const draftProfile = ws.document.profiles.find((pr) => pr.id === PROFILE_ID)!;
        expect(draftProfile.entities.length, 'a vertex was MINTED, not refused').toBe(5);
        // ⭐ The four original ids survive, in order — an id-set change is additive
        //   here, so nothing the document already anchored moved.
        expect(draftProfile.entities.slice(0, 4).map((e) => e.id))
            .toEqual([bare(20), bare(21), bare(22), bare(23)]);
        expect(draftProfile.entities[4]!.id, 'the minted id is a bare 26-char ULID')
            .toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(draftProfile.entities[4]!.kind).toBe('point');

        // The workspace's own surface survived the re-render its commit triggered.
        const remounted = ws.root.querySelector('[data-cdw-profile-host]') as HTMLElement;
        expect(remounted.querySelector(`[data-dwp-root="${PROFILE_ID}"]`), 'still mounted').not.toBeNull();
        expect(ws.profilePanel()!.surface!.ring.length).toBe(5);
    }, BUDGET);

    it('ARM 4 — ⭐⭐ SURVIVE: Save → packFamily → the ONE catalogue loader → the RELOADED document carries five points, and the BAKE extrudes a five-sided polygon', async () => {
        const drawn = ws.document.profiles.find((pr) => pr.id === PROFILE_ID)!
            .entities.map((e) => ({ x: e.data['x'] as number, z: e.data['z'] as number }));

        const refusal = await ws.save();
        expect(refusal, 'the save lands').toBeNull();

        // ── THE ROUND TRIP, read out of the singleton catalogue ────────────────
        const reloaded = reloadedProfile();
        expect(reloaded.entities.length, '⭐ FIVE points survived the pack/unpack round trip').toBe(5);
        expect(reloaded.entities.map((e) => ({ x: e.data['x'] as number, z: e.data['z'] as number })),
            'every drawn coordinate came back byte-identical').toEqual(drawn);

        // ── THE BAKE — the shape a placed instance would actually get ──────────
        const entry = componentCatalog.entry(DEF_ID)!;
        const baked = await bakeFamilyInstance({ family: entry.family as never, typeId: TYPE_ID });
        expect(baked.unsupported, 'nothing was skipped').toEqual([]);
        expect(baked.baked.length, 'the extrude baked').toBe(1);

        // A closed 5-gon extruded 600 mm has 10 distinct corner positions. The
        // descriptor is asserted for SHAPE, not for a triangle count: the kernel
        // owns triangulation and this test is not its second authority.
        const desc = baked.baked[0]!.descriptor as unknown as { position: Float32Array | number[] };
        const pos = Array.from(desc.position as ArrayLike<number>);
        expect(pos.length % 3, 'the position buffer is a triple stream').toBe(0);
        const ys = new Set(pos.filter((_, i) => i % 3 === 1).map((v) => Math.round(v * 1e6) / 1e6));
        expect([...ys].sort((a, b) => a - b), 'the extrude runs 0 → Height in metres').toEqual([0, 0.6]);
        const corners = new Set<string>();
        for (let i = 0; i < pos.length; i += 3) {
            corners.add(`${Math.round(pos[i]! * 1e4)},${Math.round(pos[i + 2]! * 1e4)}`);
        }
        expect(corners.size, '⭐ FIVE distinct footprint corners — the drawn outline, not the seeded rectangle')
            .toBe(5);
    }, BUDGET);

    it('ARM 5 — ⛔ THE REFUSING HALF SURVIVES: a profile carrying an `arc` gets NO draw button and NO commit button', async () => {
        // A document shape no production surface can author today (C111 §9.3 /
        // §CURVE-SPLINE-SPELLING), so it is built here and driven through the same
        // pure seam the panel uses.
        const { createComponentProfilePanel } = await import('../src/ui/component/index.js');
        const plane = { id: PLANE_ID, name: 'Base', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true };
        const curved = {
            id: PROFILE_ID, name: 'Curved', planeId: PLANE_ID,
            entities: [
                { id: bare(30), kind: 'point', data: { x: 0, z: 0 } },
                { id: bare(31), kind: 'point', data: { x: 1000, z: 0 } },
                { id: bare(32), kind: 'point', data: { x: 500, z: 500 } },
                { id: bare(33), kind: 'arc', data: { center: bare(32), radius: 300, startAngle: 0, endAngle: 3.14159 } },
            ],
            constraints: [],
        };
        const panel = createComponentProfilePanel({
            profile: curved as never, plane: plane as never,
            mintEntityId: () => bare(40), attrPrefix: 'arcp',
        });
        expect(panel.root.querySelector('[data-arcp-draw]'),
            'no draw affordance over geometry a ring cannot represent').toBeNull();
        expect(panel.beginDraw(), 'and the programmatic seam refuses too').toBe(false);
        expect(panel.statusText.toLowerCase()).toContain('read-only');
    }, BUDGET);

    it('ARM 6 — ⛔ C111 §1.3-b FAIL CLOSED: a CONSTRAINED profile refuses a vertex-count change, naming both numbers', () => {
        const plane = { id: PLANE_ID, name: 'Base', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true };
        const constrained = {
            id: PROFILE_ID, name: 'Constrained', planeId: PLANE_ID,
            entities: [
                { id: bare(20), kind: 'point', data: { x: 0, z: 0 } },
                { id: bare(21), kind: 'point', data: { x: 1000, z: 0 } },
                { id: bare(22), kind: 'point', data: { x: 1000, z: 800 } },
                { id: bare(23), kind: 'point', data: { x: 0, z: 800 } },
            ],
            constraints: [{ id: bare(50), kind: 'coincident', entityIds: [bare(20), bare(21)], parameterRef: null, value: null }],
        };
        const evaluated = profileToSurfaceRing(constrained as never, plane as never, {});
        expect(evaluated.ok).toBe(true);
        if (!evaluated.ok) return;
        const { ring, origin } = evaluated.value;

        const grown = [...ring, { u: 500, v: 1200 }];
        const refused = commitRingToProfile(constrained as never, grown, origin, { mintEntityId: () => bare(40) });
        expect(refused.ok).toBe(false);
        if (refused.ok) return;
        expect(refused.refusal.code).toBe('profile-constrained-ring-change');
        expect(refused.refusal.reason, 'BOTH numbers are in the sentence').toMatch(/1 constraint\(s\).*5 vertices.*4/s);
        expect(refused.refusal.alternative).toContain('remove the constraints');

        // ⭐ And a pure MOVE on the same profile is STILL admitted — the guard is
        //   about identity, not about constrained profiles being read-only.
        const moved = ring.map((v, i) => (i === 2 ? { u: v.u - 100, v: v.v } : v));
        const ok = commitRingToProfile(constrained as never, moved, origin, { mintEntityId: () => bare(40) });
        expect(ok.ok, 'a move re-anchors nothing').toBe(true);
    }, BUDGET);
});
