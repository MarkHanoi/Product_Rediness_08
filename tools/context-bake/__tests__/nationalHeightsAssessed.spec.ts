// §NATIONAL-HEIGHTS-ASSESSED (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the assessment table cannot
// go stale silently, and it cannot contain a claim without a measurement.
//
// A "we probed it and there is nothing there" note is the single easiest artefact in this repo to get
// wrong: it is cheap to write, expensive to re-derive, and it is BELIEVED. Spain's own history is the
// warning — nine of fourteen recorded "blockers" turned out to be refusals about the wrong product
// (§BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS), and a WMS GetCapabilities was mistaken for an inventory
// (§GETCAPABILITIES-IS-NOT-AN-INVENTORY). So this spec asserts the SHAPE that makes a refusal
// overturnable: every row names its door, its probe date, and an answer with a status code in it.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIONAL_HEIGHTS_ASSESSED } from '../heights/nationalHeightsAssessed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');

/** The twelve regions this lane's half of the brief named. Every one must have a row. */
const LANE_REGIONS = [
    'netherlands', 'germany', 'france', 'belgium', 'austria', 'czechia',
    'switzerland', 'luxembourg', 'ireland', 'greatbritain', 'italy', 'portugal',
];

describe('§NATIONAL-HEIGHTS-ASSESSED — no country in the lane is silently missing', () => {
    it('every region the lane was asked about has a row', () => {
        const seen = new Set(NATIONAL_HEIGHTS_ASSESSED.map((r) => r.region));
        for (const region of LANE_REGIONS) expect(seen.has(region), `${region} has no assessed row`).toBe(true);
    });

    it('every row names a bake region that actually exists', () => {
        // A row about a region the bake does not have is a note about nothing.
        for (const r of NATIONAL_HEIGHTS_ASSESSED) {
            expect(bake.includes(`name: '${r.region}'`), `${r.region} is not a bake region`).toBe(true);
        }
    });

    it('every row carries a probe date and a status the reader can act on', () => {
        const OK = new Set(['wired-national', 'wired-partial', 'refused-rendered', 'refused-coarse', 'refused-bulk', 'unreachable', 'not-done-shape']);
        for (const r of NATIONAL_HEIGHTS_ASSESSED) {
            expect(OK.has(r.status), `${r.region} status ${r.status}`).toBe(true);
            expect(r.probedAt, `${r.region} probedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });

    it('every NON-wired row carries a DOOR and an answer with an HTTP status in it', () => {
        // ⛔ This is the assertion that makes the table worth trusting. A refusal without the exact
        // answer is a sentence that gets copied forward and rots; with the answer, the next reader can
        // overturn it in one command.
        // 'not-done-shape' is deliberately exempt, and that exemption is the honest part: its source
        // needs no refusing, so there IS no answer to record, and inventing one to satisfy this rule
        // would be the exact dishonesty the table exists to prevent. It owes a named `missing` instead.
        for (const r of NATIONAL_HEIGHTS_ASSESSED.filter((x) => x.status !== 'wired-national' && x.status !== 'not-done-shape')) {
            expect(r.door, `${r.region} door`).toBeTruthy();
            expect(r.reason, `${r.region} reason`).toBeTruthy();
            const measured = /HTTP \d{3}|curl exit \d|Content-Length|pixelType|numberMatched|ExceptionReport|no response/.test(r.reason);
            expect(measured, `${r.region} reason has no measured answer in it`).toBe(true);
        }
    });

    it("a 'not-done-shape' row names the missing PIECE, and never pretends the source refused us", () => {
        for (const r of NATIONAL_HEIGHTS_ASSESSED.filter((x) => x.status === 'not-done-shape')) {
            expect(r.missing, `${r.region} missing`).toBeTruthy();
            expect(String(r.missing).length, `${r.region} missing is too vague`).toBeGreaterThan(20);
            // It is NOT a refusal: the row must say the source is fine.
            expect(r.reason, `${r.region} reason`).toMatch(/NOT REFUSED|NOT DONE/);
        }
    });

    it('a wired-national row matches the wiring in bake.mjs — the table cannot claim more than the code does', () => {
        // The table is a REPORT, not a second source of truth. If someone edits a row to
        // 'wired-national' without wiring the join, this fails.
        for (const r of NATIONAL_HEIGHTS_ASSESSED.filter((x) => x.status === 'wired-national')) {
            const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
            expect(fn, 'stampBboxesFor').not.toBeNull();
            const m = fn![1].match(new RegExp(`r\\.heightJoin === '${r.join}'\\)\\s*return ([A-Z0-9_]+)`));
            expect(m, `${r.region}: stampBboxesFor has no row for '${r.join}'`).not.toBeNull();
            expect(/NATIONAL/.test(m![1]), `${r.region}: '${r.join}' returns ${m![1]}, which is not a national set`).toBe(true);
        }
    });

    it('a wired-partial row names a join that bake.mjs really dispatches', () => {
        for (const r of NATIONAL_HEIGHTS_ASSESSED.filter((x) => x.status === 'wired-partial')) {
            expect(r.join, `${r.region} join`).toBeTruthy();
            expect(bake.includes(`heightJoin: '${r.join}'`), `${r.region}: no region row declares '${r.join}'`).toBe(true);
        }
    });

    it('a refused / unreachable row declares NO join — a refusal may never look like a wiring', () => {
        for (const r of NATIONAL_HEIGHTS_ASSESSED.filter((x) => x.status.startsWith('refused') || x.status === 'unreachable')) {
            expect(r.join, `${r.region} must not claim a join`).toBeNull();
        }
    });

    it("Ireland's row keeps the reason it is refused: the service is a HILLSHADE, not metres", () => {
        // The one row most likely to be "fixed" by someone who sees "DSM ImageServer, TIFF" and wires
        // it. U8 decodes fine and stamps plausible garbage; that is the whole point of the row.
        const ie = NATIONAL_HEIGHTS_ASSESSED.find((r) => r.region === 'ireland')!;
        expect(ie.status).toBe('refused-rendered');
        expect(ie.reason).toContain('U8');
        expect(ie.reason).toContain('_HS_');
    });
});
