/**
 * §FIX-HANDRAIL-MATERIAL-WARN-AGGREGATE (L-1292) — the ~145-line-per-load
 * `§C100-HANDRAIL-MATERIAL-ID` flood becomes ONE line per REASON.
 *
 * ⭐ WHAT THIS PINS IS THAT THE MESSAGE SURVIVES. The obvious "fix" for a noisy
 * warning is to make it quieter, and here that would be a regression with a perf
 * justification attached: C100 §5 forbids a SILENT grey fallback because it makes
 * *"the material was deleted"*, *"the id is stale"* and *"this rail names no
 * material"* the same pixel — and this warning is the only reason the four
 * generator defects in `generatedGuardSpec.ts` were measurable at all (L-1203 /
 * C95 §15.16.7). So the aggregation is keyed on the REASON, and the count, the
 * reason, the fallback and sample ids all have to still be there.
 *
 * ⚠ NOT a perf claim. PERF1 counted the LINES, not the cost of their stack
 * captures. This is legibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from './HandrailFragmentBuilder';

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

/** A record that names NO material — the shape the four auto-generators emit. */
function noMaterialRail(id: string): HandrailData {
    return {
        id,
        type: 'handrail',
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        fillType: 'baluster',
        balusterSpacing: 0.2,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
        // deliberately no materialId, no materialColor
    } as HandrailData;
}

describe('§FIX-HANDRAIL-MATERIAL-WARN-AGGREGATE — one line per REASON, not per element', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warn.mockRestore(); });

    it('N handrails failing the SAME way produce ONE warning carrying the count and samples', () => {
        const builder = new HandrailFragmentBuilder(new THREE.Scene(), stubBim);
        const N = 12;
        for (let i = 0; i < N; i++) builder.updateHandrail(noMaterialRail(`gen-rail-${i}`));

        // ⛔ Nothing is printed while the load is still running — the whole point.
        expect(warn, 'the flood must not be re-emitted one line at a time').not.toHaveBeenCalled();

        const lines = builder.flushUnresolvedMaterialReports();
        expect(lines, 'twelve elements, one reason, one line').toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);

        const msg = String(warn.mock.calls[0]?.[0] ?? '');
        // Every load-bearing part of the original message must still be there.
        expect(msg, 'the tag must survive so the console stays greppable').toContain('§C100-HANDRAIL-MATERIAL-ID');
        expect(msg, 'the COUNT is the thing aggregation adds').toContain(`${N} handrails`);
        expect(msg, 'the diagnosis must survive').toContain('NO RESOLVABLE MATERIAL');
        expect(msg, 'the fallback must be named, never implied').toContain('Falling back to');
        expect(msg, 'C100 §5 — the user must be told the pixel is not the material')
            .toContain('is NOT these elements’ material');
        // Samples, capped, with the remainder declared rather than dropped.
        expect(msg).toContain('gen-rail-0');
        expect(msg).toContain(`(+${N - 3} more)`);
    });

    it('a flush with nothing buffered emits nothing — silence is only correct when there is nothing to say', () => {
        const builder = new HandrailFragmentBuilder(new THREE.Scene(), stubBim);
        expect(builder.flushUnresolvedMaterialReports()).toBe(0);
        expect(warn).not.toHaveBeenCalled();
    });

    it('dispose() FLUSHES rather than dropping — a project switch must not swallow the report', () => {
        const builder = new HandrailFragmentBuilder(new THREE.Scene(), stubBim);
        builder.updateHandrail(noMaterialRail('switch-rail-1'));
        expect(warn).not.toHaveBeenCalled();

        builder.dispose();
        // ⛔ Dropping the buffer here would be the C100 §5 silent fallback with an
        // extra step: the elements rendered grey and nobody was ever told why.
        expect(warn, 'the pending report must be said before the buffer is cleared').toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('switch-rail-1');
    });

    it('the per-ELEMENT dedupe is retained — one rail is one report, not one per baluster', () => {
        const builder = new HandrailFragmentBuilder(new THREE.Scene(), stubBim);
        // A single rail emits rail + infill + posts + N balusters, every one of which
        // calls resolveColour. It must still count as ONE.
        builder.updateHandrail(noMaterialRail('one-rail'));
        builder.flushUnresolvedMaterialReports();
        const msg = String(warn.mock.calls[0]?.[0] ?? '');
        expect(msg, 'a 10-baluster rail is one element, not eleven').toContain('1 handrail ');
        expect(msg).toContain('is NOT this element’s material');
    });
});
