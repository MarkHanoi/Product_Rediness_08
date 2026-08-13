// §CI-1-BANNER wiring (SPEC-49 §4 CI-1, founder decision 2026-08-13) — the FINAL seam:
// the editor stops success-toasting over a house that shipped a sealed room.
//
// The engine half landed at 30fae370: `HouseLayoutResult.circulation` is a REQUIRED
// `HouseCirculationReport` whose `banner` names the sealed rooms and the failed rule.
// Before this wiring, `HouseLayoutExecutor.execute()` fired
//     `Built N-storey house — M stair(s), roof on top. Finishing storeys…`  ('success')
// UNCONDITIONALLY — the exact silent-ship surface the founder ruled out.
//
// These tests drive the REAL announce seam the executor calls, with a payload stubbed
// ONLY at the boundary the type defines (`HouseCirculationReport` — that is the
// contract, not the value under test; C74 §3.4 is satisfied because the RENDERING
// decision is what is asserted). Plain-Node (the apps/editor vitest 'node' env), same
// as `residentialError.ts`'s pure builders: the HTML is asserted as a string; the thin
// DOM mount guards on `typeof document`.
//
// THE FOUR VERDICT RENDERINGS UNDER TEST (C70 §2.2 — 'unknown' NEVER renders success):
//   banner null        → the success toast, BYTE-IDENTICAL to the pre-wiring text.
//   severity blocking  → NO success toast; persistent dismiss-required banner
//                        (headline → lines → qualifier), error weight, sealed rooms named.
//   severity unknown   → the SAME banner surface at WARNING weight — never success.
//   severity advisory  → a warning toast carrying the headline. No success toast.

import { describe, it, expect, vi } from 'vitest';
import {
    houseBuildSuccessMessage,
    announceHouseCirculation,
    buildHouseCirculationBannerHtml,
    type HouseCirculationReport,
    type HouseCirculationBanner,
    type StoreyCirculationVerdict,
} from '../houseCirculationNotice.js';

// ── Stubs at the type boundary ────────────────────────────────────────────────

const soundVerdict = (storeyIndex: number, levelId: string): StoreyCirculationVerdict => ({
    storeyIndex,
    levelId,
    status: 'sound',
    failedRules: [],
    unreachableRoomNames: [],
    unroutedToCirculationRoomNames: [],
    doorlessRoomNames: [],
    strandedRoomNames: [],
    corridorStairGap: false,
    corridorHallGap: false,
    roomListUnderstates: false,
    line: '',
});

// The founder's case: storey 1 ships with a doorless room AND two rooms the entrance
// cannot reach. Three room sets stay apart (C75 §1.2) — all three names must render.
const sealedVerdict: StoreyCirculationVerdict = {
    storeyIndex: 1,
    levelId: 'L-house-01',
    status: 'sealed',
    failedRules: ['reach'],
    unreachableRoomNames: ['Storage 2', 'Storage 3'],
    unroutedToCirculationRoomNames: [],
    doorlessRoomNames: ['Storage 4'],
    strandedRoomNames: ['Storage 2', 'Storage 3'],
    corridorStairGap: false,
    corridorHallGap: false,
    roomListUnderstates: false,
    line: 'Storey 1 (L-house-01): SEALED — no door at all: Storage 4 · '
        + 'cannot be reached from the entrance in the BUILT plan: Storage 2, Storage 3 · '
        + 'rules failed: reach',
};

const notMeasuredVerdict: StoreyCirculationVerdict = {
    storeyIndex: 1,
    levelId: 'L-house-01',
    status: 'not-measured',
    notMeasuredReason: 'engine-verdict-absent',
    notMeasuredDetail: 'this storey shipped a layout that carries no circulation verdict. This is not a pass.',
    failedRules: [],
    unreachableRoomNames: [],
    unroutedToCirculationRoomNames: [],
    doorlessRoomNames: [],
    strandedRoomNames: [],
    corridorStairGap: false,
    corridorHallGap: false,
    roomListUnderstates: false,
    line: 'Storey 1 (L-house-01): NOT MEASURED — this storey shipped a layout that carries '
        + 'no circulation verdict. This is not a pass.',
};

const unsoundVerdict: StoreyCirculationVerdict = {
    ...soundVerdict(1, 'L-house-01'),
    status: 'unsound',
    failedRules: ['window-min-area'],
    line: 'Storey 1 (L-house-01): UNSOUND — rules failed: window-min-area',
};

const blockingBanner: HouseCirculationBanner = {
    severity: 'blocking',
    headline: '1 of 2 storeys ships with a sealed room (a room with no door, or one the entrance cannot reach).',
    qualifier: 'Checked 2 of 2 storeys · the layout was generated and SHIPPED anyway — this is a warning '
        + 'about what was built, not a refusal to build it · a storey listed as NOT MEASURED has not been judged sound.',
    sealedStoreys: [sealedVerdict],
    unsoundStoreys: [],
    notMeasuredStoreys: [],
    failedRules: ['reach'],
    lines: [sealedVerdict.line],
};

// A blocking banner whose OTHER buckets are also non-empty — every bucket's line must
// render (a hidden bucket is the reassuring-default failure this exists to prevent).
const blockingWithAllBuckets: HouseCirculationBanner = {
    ...blockingBanner,
    headline: '1 of 3 storeys ships with a sealed room; 1 storey failed a hard circulation rule without '
        + 'sealing a room; 1 storey could not be checked at all — NOT MEASURED, which is not the same as sound.',
    unsoundStoreys: [{ ...unsoundVerdict, storeyIndex: 2, levelId: 'L-house-02' }],
    notMeasuredStoreys: [{ ...notMeasuredVerdict, storeyIndex: 0, levelId: 'L-ground' }],
    lines: [
        notMeasuredVerdict.line.replace('Storey 1 (L-house-01)', 'Storey 0 (L-ground)'),
        sealedVerdict.line,
        unsoundVerdict.line.replace('Storey 1 (L-house-01)', 'Storey 2 (L-house-02)'),
    ],
};

const unknownBanner: HouseCirculationBanner = {
    severity: 'unknown',
    headline: '1 storey could not be checked at all — NOT MEASURED, which is not the same as sound.',
    qualifier: 'Checked 1 of 2 storeys · the layout was generated and SHIPPED anyway — this is a warning '
        + 'about what was built, not a refusal to build it · a storey listed as NOT MEASURED has not been judged sound.',
    sealedStoreys: [],
    unsoundStoreys: [],
    notMeasuredStoreys: [notMeasuredVerdict],
    failedRules: [],
    lines: [notMeasuredVerdict.line],
};

const advisoryBanner: HouseCirculationBanner = {
    severity: 'advisory',
    headline: '1 storey failed a hard circulation rule without sealing a room.',
    qualifier: 'Checked 2 of 2 storeys · the layout was generated and SHIPPED anyway — this is a warning '
        + 'about what was built, not a refusal to build it · a storey listed as NOT MEASURED has not been judged sound.',
    sealedStoreys: [],
    unsoundStoreys: [unsoundVerdict],
    notMeasuredStoreys: [],
    failedRules: ['window-min-area'],
    lines: [unsoundVerdict.line],
};

const reportWith = (banner: HouseCirculationBanner | null): HouseCirculationReport => ({
    storeys: banner === null
        ? [soundVerdict(0, 'L-ground'), soundVerdict(1, 'L-house-01')]
        : [soundVerdict(0, 'L-ground'), sealedVerdict],
    storeysTotal: 2,
    storeysSound: banner === null ? 2 : 1,
    storeysSealed: banner === null ? 0 : 1,
    storeysUnsound: 0,
    storeysNotMeasured: 0,
    banner,
});

// ── (b) null banner → success toast unchanged, byte-identical text ───────────

describe('§CI-1-BANNER — null banner (every storey measured sound)', () => {
    it('emits the success toast with BYTE-IDENTICAL pre-wiring text, and no banner', () => {
        const toast = vi.fn();
        const present = vi.fn();
        announceHouseCirculation(reportWith(null), houseBuildSuccessMessage(2, 1), toast, present);

        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(
            // The exact string HouseLayoutExecutor emitted before this wiring — any drift
            // here is a regression against the "byte-identical on the clean path" rule.
            'Built 2-storey house — 1 stair(s), roof on top. Finishing storeys…',
            'success',
        );
        expect(present).not.toHaveBeenCalled();
    });

    it('houseBuildSuccessMessage pluralises nothing (legacy "stair(s)" form preserved)', () => {
        expect(houseBuildSuccessMessage(1, 0)).toBe(
            'Built 1-storey house — 0 stair(s), roof on top. Finishing storeys…',
        );
        expect(houseBuildSuccessMessage(3, 2)).toBe(
            'Built 3-storey house — 2 stair(s), roof on top. Finishing storeys…',
        );
    });
});

// ── (a) blocking → NO success toast; banner names the sealed rooms ───────────

describe('§CI-1-BANNER — blocking severity', () => {
    it('suppresses the success toast entirely and presents the banner instead', () => {
        const toast = vi.fn();
        const present = vi.fn();
        announceHouseCirculation(reportWith(blockingBanner), houseBuildSuccessMessage(2, 1), toast, present);

        // NO toast call may carry the success severity — that is the silent-ship surface.
        const successCalls = toast.mock.calls.filter((c) => c[1] === 'success');
        expect(successCalls).toHaveLength(0);
        expect(present).toHaveBeenCalledTimes(1);
        expect(present).toHaveBeenCalledWith(blockingBanner);
    });

    it('renders the sealed-room names, error weight, headline → lines → qualifier, and a dismiss control', () => {
        const html = buildHouseCirculationBannerHtml(blockingBanner);

        // The rooms the founder saw — all three names, from BOTH distinct sets.
        expect(html).toContain('Storage 2');
        expect(html).toContain('Storage 3');
        expect(html).toContain('Storage 4');
        // The failed rule travels with the rooms (the founder asked for both).
        expect(html).toContain('reach');

        // Order: headline, then the per-storey lines, then the honesty qualifier.
        const headlineAt = html.indexOf('1 of 2 storeys ships with a sealed room');
        const lineAt = html.indexOf('SEALED — no door at all: Storage 4');
        const qualifierAt = html.indexOf('Checked 2 of 2 storeys');
        expect(headlineAt).toBeGreaterThan(-1);
        expect(lineAt).toBeGreaterThan(headlineAt);
        expect(qualifierAt).toBeGreaterThan(lineAt);

        // Severity is stamped (machine-readable, quotable in a bug report) and the
        // established ERROR token carries the weight — no ad-hoc red.
        expect(html).toContain('data-severity="blocking"');
        expect(html).toContain('alm-notice--rejected');
        // Persistent + dismiss-required: an explicit dismiss control, no auto-hide.
        expect(html).toContain('data-action="dismiss-circulation-banner"');
        // Blocking interrupts assistive tech too.
        expect(html).toContain('role="alert"');
    });

    it('renders EVERY non-empty bucket — one rendered line per banner line, none hidden', () => {
        const html = buildHouseCirculationBannerHtml(blockingWithAllBuckets);
        for (const line of blockingWithAllBuckets.lines) {
            // Lines are HTML-escaped; assert on an escape-stable prefix of each.
            expect(html).toContain(line.slice(0, 24));
        }
        const rendered = html.match(/data-role="hcb-line"/g) ?? [];
        expect(rendered).toHaveLength(blockingWithAllBuckets.lines.length);
        // The not-measured bucket is named as such — never laundered into a pass.
        expect(html).toContain('NOT MEASURED');
    });
});

// ── (c) unknown → the same surface at WARNING weight, never success ──────────

describe('§CI-1-BANNER — unknown severity (C70 §2.2: not-measured is never success)', () => {
    it('suppresses the success toast and presents the SAME banner surface', () => {
        const toast = vi.fn();
        const present = vi.fn();
        announceHouseCirculation(reportWith(unknownBanner), houseBuildSuccessMessage(2, 1), toast, present);

        const successCalls = toast.mock.calls.filter((c) => c[1] === 'success');
        expect(successCalls).toHaveLength(0);
        expect(present).toHaveBeenCalledTimes(1);
        expect(present).toHaveBeenCalledWith(unknownBanner);
    });

    it('renders at WARNING weight — the informative token, not the error token, and role="status"', () => {
        const html = buildHouseCirculationBannerHtml(unknownBanner);
        expect(html).toContain('data-severity="unknown"');
        expect(html).not.toContain('alm-notice--rejected');
        expect(html).toContain('alm-notice--reduced');
        expect(html).toContain('role="status"');
        // Still dismiss-required, still ordered headline → lines → qualifier.
        expect(html).toContain('data-action="dismiss-circulation-banner"');
        const headlineAt = html.indexOf('could not be checked at all');
        const qualifierAt = html.indexOf('Checked 1 of 2 storeys');
        expect(headlineAt).toBeGreaterThan(-1);
        expect(qualifierAt).toBeGreaterThan(headlineAt);
    });
});

// ── advisory → warning toast carrying the headline ───────────────────────────

describe('§CI-1-BANNER — advisory severity', () => {
    it('emits a WARNING toast carrying the headline; no success toast, no banner', () => {
        const toast = vi.fn();
        const present = vi.fn();
        announceHouseCirculation(reportWith(advisoryBanner), houseBuildSuccessMessage(2, 1), toast, present);

        expect(present).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(advisoryBanner.headline, 'warn');
    });
});
