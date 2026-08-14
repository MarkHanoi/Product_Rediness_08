// §L-MOUNT Phase 3 — the BACKED set is PINNED to the measurement.
//
// `commandBacking.ts` carries a hand-written set of four verbs. A hand-written
// set rots, and when this one rots it rots in the worst direction: a verb added
// here that has no handler re-opens the §C-B1 silent no-op on a VISIBLE button.
// So the set is not trusted — it is pinned, both ways, against the generated
// census `tools/rac-conformance/gesture-reach/results/verb-census.json`
// (regenerate: `npx tsx tools/rac-conformance/gesture-reach/build-census.ts`).
//
// If a handler is added or removed anywhere in production, the census moves and
// this test fails until the set is corrected. The set is never edited to go
// green — it is edited to match a measurement.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { BACKED_TOOLBAR_VERBS, isBacked, refuseUnbacked, applyCommandBacking, unbackedReason } from '../commandBacking.js';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CENSUS = path.resolve(HERE, '..', '..', '..', '..', '..', '..',
    'tools', 'rac-conformance', 'gesture-reach', 'results', 'verb-census.json');

interface CensusRow { verb: string; backing: 'BACKED' | 'REGISTER-ONLY' | 'UNBACKED' }
interface Census { totals: { verbs: number; backed: number }; rows: CensusRow[] }

function loadCensus(): Census {
    return JSON.parse(readFileSync(CENSUS, 'utf8')) as Census;
}

describe('commandBacking — pinned to the generated verb census', () => {
    it('MISCONFIGURED GUARD — the census exists and covers all 280 declared verbs', () => {
        const c = loadCensus();
        expect(c.rows.length, 'the census did not cover the declared verb set').toBe(280);
    });

    it('BACKED_TOOLBAR_VERBS equals the census BACKED set, exactly, both directions', () => {
        const c = loadCensus();
        const measured = c.rows.filter((r) => r.backing === 'BACKED').map((r) => r.verb).sort();
        const declared = [...BACKED_TOOLBAR_VERBS].sort();
        // both directions: a missing verb needlessly disables a working button;
        // an extra verb re-opens §C-B1 on a VISIBLE one. Neither is tolerable.
        expect(declared).toEqual(measured);
    });

    it('the four measured verbs are the four hand-registered in engineLauncher', () => {
        // §C-B1 (zoom-fit / zoom-selected) + §FIX-COPY-PASTE (copy / paste).
        expect([...BACKED_TOOLBAR_VERBS].sort())
            .toEqual(['copy-selection', 'paste-clipboard', 'zoom-fit', 'zoom-selected']);
    });
});

describe('commandBacking — the refusal behaves, both polarities', () => {
    it('a BACKED verb is not refused and its button stays enabled', () => {
        const btn = document.createElement('button');
        applyCommandBacking(btn, 'zoom-fit');
        expect(isBacked('zoom-fit')).toBe(true);
        expect(refuseUnbacked('zoom-fit')).toBe(false);
        expect(btn.disabled).toBe(false);
        expect(btn.getAttribute('data-backed')).toBe('1');
    });

    it('an UNBACKED verb is refused, visibly, with the verb NAMED', () => {
        const btn = document.createElement('button');
        applyCommandBacking(btn, 'sheet-set-export');
        expect(isBacked('sheet-set-export')).toBe(false);
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute('data-unbacked')).toBe('1');
        expect(btn.getAttribute('aria-disabled')).toBe('true');
        // a refusal that does not say WHAT was refused is barely better than silence
        expect(btn.title).toContain('sheet-set-export');
        expect(unbackedReason('sheet-set-export')).toContain('no registered handler');
    });

    it('refuseUnbacked never throws — a refusal is an answer, not a crash', () => {
        expect(() => refuseUnbacked('does-not-exist-at-all')).not.toThrow();
        expect(refuseUnbacked('does-not-exist-at-all')).toBe(true);
    });
});
