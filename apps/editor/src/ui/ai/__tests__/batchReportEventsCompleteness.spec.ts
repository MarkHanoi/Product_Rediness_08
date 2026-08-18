/**
 * L-996 — EVERY BATCH HANDLER THAT SENDS A REPORT MUST HAVE A LISTENER.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The founder typed *"make all inner finishes walls on the ground floor to wood"*
 * and was told *"Set the interior finish of all 17 walls on Ground to Wood · Oak
 * (Light). Done — undo with Ctrl+Z."* Nothing changed.
 *
 * Half of that lie is `WallStore`'s dropped field (L-995). The OTHER half is here:
 * `SetWallSideFinishBatchHandler` has always broadcast its real report — the
 * command's own "on N of M walls — K skipped", the grouped refusal reasons, the
 * masked-in-3D caveat, and `outcome:'indeterminate'` when the bridge never ran —
 * on `pryzm-wall-side-finish-batch-report`. `BATCH_REPORT_EVENTS` did not name that
 * verb, so `executeSlice` subscribed to nothing, `expectsReport` was FALSE, and
 * `classifyDispatch` returned `{kind:'applied', lines:[]}`: the branch that prints
 * the resolver's PLANNED summary plus "Done". The engine's verdict was discarded
 * on the way past, and the transcript said the same sentence for 17-of-17,
 * 0-of-17, and never-ran.
 *
 * ⭐ THE ROW WAS MISSING, NOT WRONG — so no assertion about the wall verb could
 * have caught it, only an assertion about the TABLE. This spec derives the
 * required key set from the plugin handlers themselves: every exported
 * `*_REPORT_EVENT` constant, paired with the `type:` its own file declares. Adding
 * a broadcasting handler without a listener now fails here.
 *
 * Measured when written (2026-08-18): THREE verbs were unsubscribed —
 * `wall.setSideFinishBatch`, `slab.updateSystemTypeBatch`,
 * `ceiling.updateSystemTypeBatch`. Only the first was founder-reported; the other
 * two printed the same canned "Done" and nobody had hit them yet.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BATCH_REPORT_EVENTS } from '../ZeroTokenChatBridge';

const PLUGINS_ROOT = resolve(__dirname, '../../../../../../plugins');

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return out; }
    for (const name of entries) {
        if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (full.endsWith('.ts')) out.push(full);
    }
    return out;
}

/** `{ busVerb → report event }`, read off the handlers that actually broadcast. */
function emittersFromSource(): Map<string, { event: string; file: string }> {
    const found = new Map<string, { event: string; file: string }>();
    for (const file of walk(PLUGINS_ROOT)) {
        const src = readFileSync(file, 'utf8');
        const evt = /export const [A-Z0-9_]*REPORT_EVENT\s*=\s*'([^']+)'/.exec(src);
        if (!evt?.[1]) continue;
        // The handler object's own declared verb, in the same file that owns the event.
        const verb = /^\s*type:\s*'([a-z][\w.-]*\.[\w.-]+)'\s*,/m.exec(src);
        if (!verb?.[1]) continue;
        found.set(verb[1], { event: evt[1], file: file.slice(PLUGINS_ROOT.length + 1) });
    }
    return found;
}

describe('L-996 — the chat listens to every batch report a handler sends', () => {
    it('finds the broadcasting handlers at all (the scan itself is not vacuous)', () => {
        // A scan that silently matched nothing would make every assertion below pass
        // for the wrong reason — the same "failure and emptiness are one value" shape
        // this whole file exists to close.
        const emitters = emittersFromSource();
        expect(emitters.size, 'no report-emitting handlers found — the scan is broken').toBeGreaterThanOrEqual(13);
        expect(emitters.get('wall.setSideFinishBatch')?.event).toBe('pryzm-wall-side-finish-batch-report');
    });

    it("every handler's report event is subscribed, under its own verb", () => {
        const emitters = emittersFromSource();
        const unheard: string[] = [];
        const mismatched: string[] = [];
        for (const [verb, { event, file }] of emitters) {
            const listening = BATCH_REPORT_EVENTS[verb];
            if (listening === undefined) unheard.push(`${verb} → ${event}  (${file})`);
            else if (listening !== event) mismatched.push(`${verb}: table says "${listening}", handler emits "${event}"`);
        }
        expect(
            unheard,
            'these verbs broadcast a report nobody hears — the chat will print the canned "Done" ' +
            'whatever they actually did',
        ).toEqual([]);
        expect(mismatched, 'the table names a different event than the handler emits').toEqual([]);
    });

    it('the founder\u2019s verb specifically', () => {
        expect(BATCH_REPORT_EVENTS['wall.setSideFinishBatch']).toBe('pryzm-wall-side-finish-batch-report');
    });
});
