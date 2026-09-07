// §AUTHORED-ENVELOPE-VISIBLE-BY-DEFAULT (lane ENVELOPE-DRAW-AND-STOREYS, 2026-09-07) —
// L-13146 / L-13150.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY A SUITE FOR SOMETHING THAT IS ALREADY TRUE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder created five level envelopes, saw one ground plate, and reported that the three
// items under *"What the volumes in the view mean"* all read UNCHECKED — so the first hypothesis
// was that a toggle he never set had hidden them.
//
// ⛔ IT HAD NOT, AND ESTABLISHING THAT WAS HALF THE DIAGNOSIS. His own log said `drew 5/5`; the
// cause was L-13146 (five prisms at one base). What the investigation found is that the authored
// prisms are **ungated by every visibility authority in the repo** and that every level-visibility
// default is VISIBLE. That is the correct state and it is the state this suite pins, because it is
// invisible to every other test: nothing fails if someone adds a gate here, and a gate defaulting
// to OFF would take a founder-authored envelope off screen with no error anywhere.
//
// ⛔ THIS IS A SOURCE-LEVEL SPEC AND IT SAYS SO. Standing up a real Cesium viewer to prove a
// negative is not something a unit suite can do. ⚠ It cannot establish that the prisms are DRAWN,
// only that no toggle is consulted before drawing them; the drawing itself is browser-only
// ([[committed-is-not-reachable]]). It is a REGRESSION GUARD on a property nobody would otherwise
// notice losing.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    isBuildableEnvelopeVisible,
    isBuildableEnvelopeFootprintVisible,
} from '../envelopeVisibility';

const REPO = resolve(__dirname, '../../../../../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/** One method's body, by name, from `{` to the matching `}` at the same brace depth. */
function methodBody(src: string, signature: string): string {
    const at = src.indexOf(signature);
    expect(at, `${signature} must exist`).toBeGreaterThan(-1);
    let depth = 0;
    let started = false;
    for (let i = at; i < src.length; i += 1) {
        const c = src[i];
        if (c === '{') { depth += 1; started = true; }
        else if (c === '}') {
            depth -= 1;
            if (started && depth === 0) return src.slice(at, i + 1);
        }
    }
    throw new Error(`unbalanced braces after ${signature}`);
}

describe('§AUTHORED-ENVELOPE-VISIBLE-BY-DEFAULT — a level envelope the user just made is on screen', () => {
    it('⛔ the 3-D Site rasteriser consults NO visibility toggle before drawing an authored prism', () => {
        // ⛔ THE NAMES MATTER, not a generic word: these are the actual gate helpers in this tree.
        // `§ENVELOPE-ONE-VISIBILITY` gates the C58 PERMITTED study volume — a different object, in a
        // different collection (`formaMassingEntities`) — and it must never reach this method.
        const body = methodBody(
            read('apps/editor/src/ui/geospatial/CesiumViewport.ts'),
            'private renderSpaceEnvelopes(): void {',
        );
        for (const gate of [
            'getBuildableEnvelopeAxes',
            'applyEnvelopeVisibilityAxes',
            'isBuildableEnvelopeVisible',
            'isBuildableEnvelopeFootprintVisible',
            'formaVisibleLevels',
            'ENVELOPE_LEGEND',
        ]) {
            expect(body, `renderSpaceEnvelopes must not read ${gate}`).not.toContain(gate);
        }
        // …and it DOES read the two things it legitimately needs, so this is not passing by the
        // method having been renamed out from under the probe.
        expect(body).toContain('stores?.spaceEnvelope');
        expect(body).toContain('formaMassingOrigin');
    });

    it('⛔ the BIM rasteriser draws every record it is handed — no toggle, no level filter', () => {
        const src = read('apps/editor/src/engine/attachSpaceEnvelopeRender.ts');
        for (const gate of ['isBuildableEnvelopeVisible', 'applyEnvelopeVisibilityAxes', 'visibleLevels']) {
            expect(src, `attachSpaceEnvelopeRender must not read ${gate}`).not.toContain(gate);
        }
        // ⭐ The initial draw over the WHOLE store is what makes a restored project visible at all —
        // a subscriber alone draws only what changes AFTER it is installed. Losing this line is a
        // different way to arrive at "my envelopes are not there", so it is pinned too.
        expect(src).toContain('for (const id of deps.store.getState().keys()) draw(id, deps.store.getState());');
    });

    it('⭐ both buildable-envelope visibility axes DEFAULT to visible', () => {
        // ⚠ These gate the C58 PERMITTED study, not the authored prisms — but the founder read their
        // state as the reason his envelopes were missing, so their DEFAULT is worth holding. An
        // envelope that silently fails to arrive reads as "there is no constraint here", which is
        // the false negative C58 forbids.
        expect(isBuildableEnvelopeVisible()).toBe(true);
        expect(isBuildableEnvelopeFootprintVisible()).toBe(true);
    });

    it('⭐ a newly created storey is VISIBLE, so an envelope seated on it is not hidden at birth', () => {
        // L-13146 seats each storey's envelope at its own elevation; a level created hidden would
        // undo that at the last hop, and `SpaceEnvelopeMeshBuilder` deliberately tags every group
        // with `levelId` precisely so level visibility DOES apply to it.
        const src = read('packages/core-app-model/src/BimKernel.ts');
        const body = src.slice(src.indexOf('const safeLevel: Level = {'));
        expect(body.slice(0, 700)).toContain('isVisible: true');
        expect(read('apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts'))
            .toContain("group.userData['levelId'] = record.levelId ?? '';");
    });
});
