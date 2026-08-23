/**
 * §ELEV-SYMBOL-OPENING (L-1240) — **THE DOUBLE DRAW, AND THE BOTH-WAYS PIN.**
 *
 * The authored symbol on its own was only half a fix. Injected BESIDE the solid's wireframe it
 * left the malformed linework on screen and added more — from the founder's side the bug reads
 * as doubled, not fixed. `suppressSymbolisedElementLinework()` is the other half.
 *
 * ⭐ **§A IS THE WHOLE SAFETY ARGUMENT, AND IT IS PINNED IN BOTH DIRECTIONS** — the same rule
 * §L955 used for the instancing exclusion, because a one-way assertion cannot tell a correct
 * suppression from an over-eager one:
 *
 *   • symbol EMITTED  ⇒ that element's raw projected linework is GONE;
 *   • symbol ABSENT   ⇒ that element's raw projected linework is UNTOUCHED.
 *
 * The second half is the one that matters. Suppressing *by element type* — a hand-listed set of
 * types ASSUMED to have symbols — passes the first assertion and **silently deletes** the
 * linework of every opening the builder skipped or REFUSED, leaving nothing where there used to
 * be something wrong. Keying on the EMITTED set is what makes the second assertion true, and this
 * suite is what stops someone "simplifying" it back to a type list.
 *
 * ⛔ No stub at the seam under test: a real `THREE.Object3D` container, real `LineSegments` with
 * real `BufferGeometry`, stamped exactly as `EdgeProjectorService.addProjectedLayer` stamps them
 * (`userData.layerName` + `userData.elementUUID`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/** Vitest roots this package at packages/core-app-model, so the module sits beside its test. */
const __DIR = resolve(process.cwd(), 'src/drawing');
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import {
    suppressSymbolisedElementLinework,
    DOOR_SYM_LAYER,
    GLAZ_SYM_LAYER,
} from './OpeningElevationSymbolBuilder';

/** A drawing carrying only the `.three` container the suppressor touches. */
function makeDrawing(): { drawing: OBC.TechnicalDrawing; three: THREE.Object3D } {
    const three = new THREE.Object3D();
    return { drawing: { three } as unknown as OBC.TechnicalDrawing, three };
}

/** A projected layer, stamped the way `EdgeProjectorService` stamps one. */
function layer(three: THREE.Object3D, layerName: string, elementUUID: string, segCount = 4): THREE.LineSegments {
    const pos: number[] = [];
    for (let i = 0; i < segCount; i++) pos.push(i, 0, 0, i + 1, 0, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial());
    ls.name = layerName;
    ls.userData.layerName = layerName;
    ls.userData.elementUUID = elementUUID;
    three.add(ls);
    return ls;
}

const names = (three: THREE.Object3D) =>
    three.children.map(c => `${c.userData.layerName}#${c.userData.elementUUID}`).sort();

describe('§A — BOTH DIRECTIONS: the suppression is DERIVED from what was emitted', () => {
    it('symbol EMITTED ⇒ that element’s raw linework is removed', () => {
        const { drawing, three } = makeDrawing();
        layer(three, 'A-GLAZ:proj', 'win-1');
        layer(three, `${GLAZ_SYM_LAYER}:proj`, 'win-1');

        const r = suppressSymbolisedElementLinework(drawing, new Set(['win-1']));
        expect(r.removedLayers).toBe(1);
        expect(r.removedSegments).toBe(4);
        expect(names(three)).toEqual(['A-GLAZ-SYM:proj#win-1']);
    });

    it('⭐ symbol ABSENT ⇒ that element’s raw linework is UNTOUCHED — the assertion a type list fails', () => {
        // `win-2` was skipped or REFUSED (a circular opening in a curved host, C86 §10.1 PR-5), so
        // it is not in the covered set. Suppressing by `elementType === 'Window'` would delete this
        // and draw nothing in its place.
        const { drawing, three } = makeDrawing();
        layer(three, 'A-GLAZ:proj', 'win-1');
        layer(three, `${GLAZ_SYM_LAYER}:proj`, 'win-1');
        layer(three, 'A-GLAZ:proj', 'win-2');           // no symbol was emitted for this one

        suppressSymbolisedElementLinework(drawing, new Set(['win-1']));
        expect(names(three)).toEqual(['A-GLAZ-SYM:proj#win-1', 'A-GLAZ:proj#win-2']);
    });

    it('an EMPTY covered set removes nothing at all — the builder-did-not-run case', () => {
        const { drawing, three } = makeDrawing();
        layer(three, 'A-GLAZ:proj', 'win-1');
        layer(three, 'A-DOOR:proj', 'door-1');
        const before = names(three);
        const r = suppressSymbolisedElementLinework(drawing, new Set());
        expect(r).toEqual({ removedLayers: 0, removedSegments: 0 });
        expect(names(three)).toEqual(before);
    });
});

describe('§B — the guard that stops it eating its own output', () => {
    it('⛔ NEVER removes a -SYM layer, even though it carries the SAME elementUUID', () => {
        const { drawing, three } = makeDrawing();
        layer(three, `${GLAZ_SYM_LAYER}:proj`, 'win-1');
        layer(three, `${DOOR_SYM_LAYER}:hidden`, 'door-1');
        suppressSymbolisedElementLinework(drawing, new Set(['win-1', 'door-1']));
        expect(names(three)).toEqual(['A-DOOR-SYM:hidden#door-1', 'A-GLAZ-SYM:proj#win-1']);
    });

    it('removes EVERY zone of a covered element’s raw linework, not just :proj', () => {
        const { drawing, three } = makeDrawing();
        layer(three, 'A-GLAZ:proj', 'win-1');
        layer(three, 'A-GLAZ:beyond', 'win-1');
        layer(three, 'A-GLAZ:hidden', 'win-1');
        layer(three, `${GLAZ_SYM_LAYER}:proj`, 'win-1');
        const r = suppressSymbolisedElementLinework(drawing, new Set(['win-1']));
        expect(r.removedLayers).toBe(3);
        expect(names(three)).toEqual(['A-GLAZ-SYM:proj#win-1']);
    });

    it('leaves the HOST WALL alone — it is a different element and keeps its own linework', () => {
        const { drawing, three } = makeDrawing();
        layer(three, 'A-WALL:proj', 'wall-1');
        layer(three, 'A-WALL:cut', 'wall-1');
        layer(three, 'A-GLAZ:proj', 'win-1');
        layer(three, `${GLAZ_SYM_LAYER}:proj`, 'win-1');
        suppressSymbolisedElementLinework(drawing, new Set(['win-1']));
        expect(names(three)).toEqual(['A-GLAZ-SYM:proj#win-1', 'A-WALL:cut#wall-1', 'A-WALL:proj#wall-1']);
    });

    it('ignores unstamped linework rather than guessing who owns it', () => {
        const { drawing, three } = makeDrawing();
        const orphan = layer(three, 'projection-visible', 'x');
        delete orphan.userData.elementUUID;              // the IFC fallback path stamps none
        layer(three, `${GLAZ_SYM_LAYER}:proj`, 'win-1');
        const r = suppressSymbolisedElementLinework(drawing, new Set(['win-1']));
        expect(r.removedLayers).toBe(0);
        expect(three.children).toHaveLength(2);
    });
});

describe('§C — it is safe on the degenerate inputs the projector can hand it', () => {
    it('a drawing with no container returns zero rather than throwing', () => {
        expect(suppressSymbolisedElementLinework({} as unknown as OBC.TechnicalDrawing, new Set(['a'])))
            .toEqual({ removedLayers: 0, removedSegments: 0 });
    });

    it('iterating while removing does not skip a sibling — all covered layers go in one pass', () => {
        // The removal is collected first and applied afterwards; mutating `children` mid-loop is
        // the classic way to leave every second entry behind, and four adjacent layers is the
        // arrangement that exposes it.
        const { drawing, three } = makeDrawing();
        for (let i = 0; i < 4; i++) layer(three, 'A-GLAZ:proj', 'win-1');
        const r = suppressSymbolisedElementLinework(drawing, new Set(['win-1']));
        expect(r.removedLayers).toBe(4);
        expect(three.children).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('§D — THE READER NAMES A FIELD THE MODEL ACTUALLY HAS (OPEN38, L-7404)', () => {
    // ⚠ THIS IS A SOURCE SCAN, AND IT IS THE RIGHT INSTRUMENT FOR THIS DEFECT CLASS RATHER
    //   THAN A CONCESSION. The defect is not "the refusal is wrong" — the refusal is right.
    //   It is "the flag that drives the refusal is read from a key `WallData` does not have",
    //   so the flag is always false and the refusal is unreachable. A behavioural test cannot
    //   see it: `WallElevationSymbol.test.ts:195` passes `hasProfile: true` in BY HAND and
    //   goes green while production draws the wrong wall. Only the NAME can be asserted.
    //
    // ⛔ IT HAS NOW HAPPENED TWICE IN ONE DECLARATION. The first cut read `wall.arc`, which
    //    does not exist — so `curved` was always false and the C86 §10.1 PR-5 curved-host
    //    refusal could never fire; that is recorded in this file's own type block. The second
    //    read `wall.profile` where the field is `wallProfile`, so `PROFILED_TOP` could never
    //    fire either — and because the builder ALSO suppresses the wall's true linework, a
    //    gabled wall was drawn as a flat-topped rectangle with its real outline deleted.
    //    Two instances is a pattern, and the pattern gets a guard.
    // ⚠ COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT HYGIENE — IT IS THE TEST WORKING.
    //   The first run went RED against the corrected file, because the correction NOTE in the
    //   type block quotes the defect verbatim ("`hasWallProfile(wall.profile)` was ALWAYS
    //   FALSE") and so does the `wall.arc` note above it. A scan that reads prose cannot tell
    //   a bug from a description of a bug — and this codebase deliberately keeps descriptions
    //   of bugs in place (C84 §6, so the retraction stays legible), which makes stripping
    //   mandatory rather than optional here. `tools/ga-gate/check-refusal-identity.ts` strips
    //   comments before its own scan for exactly this reason.
    const stripComments = (src: string): string =>
        src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*/g, ' ');
    const SRC = stripComments(readFileSync(resolve(__DIR, 'OpeningElevationSymbolBuilder.ts'), 'utf8'));

    it('the stripper actually removes prose — non-vacuity for the two assertions below', () => {
        // Without this, a stripper that emptied the file would make both of them pass.
        expect(SRC).toContain('hasWallProfile');
        expect(SRC).not.toContain('ALWAYS FALSE');
    });

    it('reads `wall.wallProfile` — the key WallData declares — and never `wall.profile`', () => {
        expect(SRC).toContain('hasWallProfile(wall.wallProfile)');
        expect(SRC).not.toMatch(/hasWallProfile\(\s*wall\.profile\s*\)/);
    });

    it('reads `wall.curve` and never `wall.arc` — the first instance of the same defect', () => {
        expect(SRC).not.toMatch(/\bwall\.arc\b/);
    });
});
