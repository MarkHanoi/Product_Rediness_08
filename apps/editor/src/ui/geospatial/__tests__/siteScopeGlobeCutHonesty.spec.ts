/**
 * §SITE-SCOPE — THE GLOBE LEG MUST SAY WHAT IT DID, ON EVERY PATH (C12 §13.3 / §CONTEXT-DATA-HONESTY).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS — IT COST A WHOLE FOUNDER TEST CYCLE
 * ═════════════════════════════════════════════════════════════════════════════
 * On build `2c12b8d5` the founder photographed a vast beige hill-shaded landmass with a small
 * clipped rectangle of city floating in it. Eleven `§SITE-SCOPE clip` lines printed — water-areas,
 * waterways, landuse, rail, buildings-shadowed, buildings-demoted, buildings-far, parks, trees,
 * roads, sea — and **not one line about the globe, the terrain or the slab side.**
 *
 * The cause was a SILENT `return` on the first line of `applySiteScopeClip`
 * (`this.photorealTilesActive`, a flag set when the photoreal tileset loads and cleared only on
 * dispose — `hasRealTileProvider()`'s own comment already recorded it as sticky, L-371). The
 * feature was disabled on the DEFAULT onboarding path and said nothing.
 *
 * ⛔ THE LESSON IS NOT "that flag was wrong". It is that a leg which can decline for six different
 * reasons and prints on none of them is indistinguishable from a leg that was never written — and
 * no screenshot can tell you which. So: **every `return` in the globe leg is preceded by a line.**
 *
 * ⚠ SOURCE-TEXT ARM. `applySiteScopeClip` needs a live `Cesium.Viewer` on a WebGL context; happy-dom
 * has none, and a fake Cesium built from this file's own expectations could not falsify them
 * (memory `fake-more-capable-than-real`). What is checkable without a browser is that no exit from
 * that method is silent, and that the properties are READ BACK rather than assumed. What this
 * CANNOT tell you is whether the terrain actually disappears — that is the founder's next screenshot.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../CesiumViewport.ts'), 'utf8');

/** The body of `applySiteScopeClip`, from its declaration to the next method at the same indent. */
function applyBody(): string {
    const at = SRC.indexOf('private async applySiteScopeClip(');
    expect(at, 'applySiteScopeClip was renamed or removed').toBeGreaterThan(-1);
    const rest = SRC.slice(at);
    const next = /\n  (?:public|private|protected)[ \t]/.exec(rest);
    return rest.slice(0, next ? next.index : rest.length);
}

/** Source with comment lines removed — a comment describing a log line is not a log line. */
function codeOnly(src: string): string {
    return src
        .split('\n')
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join('\n');
}

describe('§SITE-SCOPE globe — ARM A: no exit is silent', () => {
    const BODY = codeOnly(applyBody());

    it('the body was located and really contains the globe legs', () => {
        expect(BODY).toContain('cartographicLimitRectangle');
        expect(BODY).toContain('clippingPolygons');
        expect(BODY.length).toBeGreaterThan(1500);
    });

    /**
     * ⚠ THIS ARM'S FIRST DRAFT COULD NOT FAIL, AND THE NEGATIVE CONTROL IS WHY IT IS WRITTEN THIS
     * WAY. It walked LINES and recognised a return only as `^return;`, `return;$`, or the exact
     * `{ say(...); return; }` shape. Deleting the `say(...)` from `if (!viewer) { say(…); return; }`
     * left `if (!viewer) { return; }` — which matched NONE of the three — and the suite still
     * reported 9 passed. A test that cannot fail proves nothing (memory
     * `corpus-never-jittered-min-over-peers`), and it would have proved nothing about precisely the
     * defect that cost the founder's test cycle.
     *
     * It now scans by CHARACTER INDEX over every `return;` in the method, and — the second half of
     * the same lesson — it scans the body **with the `say` helper's own definition removed**, because
     * that definition contains a `console.log(` and would have satisfied the window for the very
     * first return no matter what. Re-verified by re-running the same negative control.
     */
    it('⛔ every `return` is preceded by a printed verdict', () => {
        // Drop the `say` helper definition: its own `console.log` is not a verdict about anything.
        const defAt = BODY.indexOf('const say = ');
        expect(defAt, 'the say() helper was renamed — re-derive this arm').toBeGreaterThan(-1);
        const defEnd = BODY.indexOf('};', defAt);
        expect(defEnd).toBeGreaterThan(defAt);
        const scanned = BODY.slice(defEnd + 2);

        const speaks = /\bsay\(|console\.(?:log|warn|error)\(/;
        const returns = [...scanned.matchAll(/\breturn;/g)].map((m) => m.index ?? -1);
        expect(returns.length, 'no `return;` found — the arm would pass vacuously').toBeGreaterThan(3);

        const offenders: string[] = [];
        let windowStart = 0;
        for (const at of returns) {
            if (!speaks.test(scanned.slice(windowStart, at))) {
                // Report the enclosing line so a failure names the offending early-out.
                const from = scanned.lastIndexOf('\n', at) + 1;
                offenders.push(scanned.slice(from, scanned.indexOf('\n', at)).trim());
            }
            windowStart = at;
        }
        expect(
            offenders,
            'a `return` in applySiteScopeClip has no printed verdict before it — a decline nobody ' +
                'can tell apart from "not implemented" (§CONTEXT-DATA-HONESTY)',
        ).toEqual([]);
    });

    it('every declared verdict word is actually emitted', () => {
        // The vocabulary is small ON PURPOSE, so a console can be grepped for one token.
        for (const verdict of ['SKIPPED', 'REFUSED', 'UNCHANGED', 'DEGRADED', 'APPLIED']) {
            expect(BODY, `the globe leg can no longer say ${verdict}`).toContain(`'${verdict}`);
        }
    });
});

describe('§SITE-SCOPE globe — ARM B: the stale-flag root cause cannot come back', () => {
    const BODY = codeOnly(applyBody());

    it('⛔ it does NOT gate on `photorealTilesActive` — that flag is sticky by design', () => {
        // Set when the tileset loads, cleared only on dispose. `hasRealTileProvider()` records it:
        // "a prior globe view leaves photorealTilesActive === true (it is not reset on Forma
        // re-entry)". Gating a Forma-only feature on it disables the feature for every user who
        // passed through the globe first — which is the onboarding flow.
        expect(
            BODY,
            'the globe leg is gating on the sticky photorealTilesActive flag again (L-371 shape)',
        ).not.toContain('photorealTilesActive');
    });

    it('it asks whether the tileset is SHOWING — a fact with no memory', () => {
        expect(BODY).toMatch(/this\.photorealTileset\?\.show === true/);
    });

    it('the flag itself is still sticky, so this arm is not vacuous', () => {
        // Guard the premise: if someone makes `photorealTilesActive` non-sticky, ARM B's reasoning
        // changes and should be re-derived rather than left asserting a stale rationale.
        const setters = [...SRC.matchAll(/this\.photorealTilesActive = (true|false)/g)].map((m) => m[1]);
        expect(setters).toContain('true');
        // Exactly one place clears it, and it is the dispose path.
        expect(setters.filter((v) => v === 'false')).toHaveLength(1);
    });
});

describe('§SITE-SCOPE globe — ARM C: the rectangle leg is unconditional, and it is put back', () => {
    const BODY = codeOnly(applyBody());

    it('the rectangle bound is applied WITHOUT the WebGL-2 support gate', () => {
        // `cartographicLimitRectangle` is a plain fragment `discard` under the TILE_LIMIT_RECTANGLE
        // define — no `isSupported`, no SDF texture. It is what guarantees the landmass is gone on
        // a machine where `ClippingPolygonCollection.isSupported` is false.
        const rectAt = BODY.indexOf('cartographicLimitRectangle =');
        const gateAt = BODY.indexOf('ClippingPolygonCollection.isSupported');
        expect(rectAt).toBeGreaterThan(-1);
        expect(gateAt).toBeGreaterThan(-1);
        expect(rectAt, 'the rectangle leg moved behind the WebGL-2 gate').toBeLessThan(gateAt);
    });

    it('the APPLIED line READS THE PROPERTY BACK rather than reporting what was assigned', () => {
        expect(BODY).toMatch(/const rectLive = viewer\.scene\.globe\.cartographicLimitRectangle/);
        expect(BODY).toMatch(/polygonApplied = !!viewer\.scene\.globe\.clippingPolygons/);
    });

    it('⛔ the teardown restores Rectangle.MAX_VALUE — a bounded globe has no owner and no lifetime', () => {
        const clearAt = SRC.indexOf('public clearContextEarthSlab()');
        expect(clearAt).toBeGreaterThan(-1);
        const clearBody = SRC.slice(clearAt, clearAt + 2600);
        expect(clearBody).toContain('cartographicLimitRectangle = Cesium.Rectangle.clone(Cesium.Rectangle.MAX_VALUE)');
        // Guarded by our own flag, so it can never clobber a limit somebody else set.
        expect(clearBody).toContain('this.siteScopeLimitRectApplied');
    });
});
