// @vitest-environment happy-dom
//
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
// decision is what is asserted).
//
// §XSS-NO-SINK (L-XSS, 2026-08-14) — WHY THIS FILE RUNS UNDER happy-dom RATHER THAN THE
// apps/editor DEFAULT 'node' ENV. The subject used to be `buildHouseCirculationBannerHtml`,
// a pure string builder assigned through `host.innerHTML`, and these assertions were
// substring matches against that string. The builder is now
// `buildHouseCirculationBannerElement`, which returns a DOM subtree with every dynamic
// value set via `textContent` — so there is ONE render path, not a string path for the
// tests and a DOM path for the mount, and no opportunity for the two to drift apart.
// The assertions moved with it and got stronger: `querySelector` on the real tree
// instead of `indexOf` on markup, exact `textContent` equality instead of `toContain`,
// and — the assertion the whole change exists for — a room name carrying
// `<img src=x onerror=…>` must appear as LITERAL TEXT and produce NO element.
//
// THE FOUR VERDICT RENDERINGS UNDER TEST (C70 §2.2 — 'unknown' NEVER renders success):
//   banner null        → the success toast, BYTE-IDENTICAL to the pre-wiring text.
//   severity blocking  → NO success toast; persistent dismiss-required banner
//                        (headline → lines → qualifier), error weight, sealed rooms named.
//   severity unknown   → the SAME banner surface at WARNING weight — never success.
//   severity advisory  → a warning toast carrying the headline. No success toast.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    houseBuildSuccessMessage,
    announceHouseCirculation,
    buildHouseCirculationBannerElement,
    presentHouseCirculationBanner,
    dismissHouseCirculationBanner,
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

// ── DOM helpers ───────────────────────────────────────────────────────────────

const build = (banner: HouseCirculationBanner): HTMLDivElement =>
    buildHouseCirculationBannerElement(banner, document);

/** The card's fixed chrome, one element per node, EXCLUDING the per-storey lines:
 *  header · region · notice · icon · body · headline · lines · qualifier · footer · button. */
const FIXED_ELEMENT_COUNT = 10;

const textOf = (root: ParentNode, selector: string): string =>
    root.querySelector(selector)?.textContent ?? '<<missing>>';

const lineTexts = (root: ParentNode): string[] =>
    [...root.querySelectorAll('[data-role="hcb-line"]')].map((n) => n.textContent ?? '');

/** The `data-role` stamps in DOCUMENT ORDER — the contractual render order, read off
 *  the real tree rather than inferred from substring offsets in a markup string. */
const roleOrder = (root: ParentNode): string[] =>
    [...root.querySelectorAll('[data-role]')].map((n) => n.getAttribute('data-role') ?? '');

afterEach(() => {
    dismissHouseCirculationBanner();
    document.body.innerHTML = '';
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
        const card = build(blockingBanner);

        // The rooms the founder saw — all three names, from BOTH distinct sets. VERBATIM:
        // the whole engine line, exact-equal, not a substring of escaped markup.
        expect(lineTexts(card)).toEqual([sealedVerdict.line]);
        expect(card.textContent).toContain('Storage 2');
        expect(card.textContent).toContain('Storage 3');
        expect(card.textContent).toContain('Storage 4');
        // The failed rule travels with the rooms (the founder asked for both).
        expect(card.textContent).toContain('rules failed: reach');

        // Order: headline, then the per-storey lines, then the honesty qualifier —
        // asserted as DOCUMENT ORDER, which a substring offset could only approximate.
        expect(roleOrder(card)).toEqual(['hcb-headline', 'hcb-line', 'hcb-qualifier']);
        expect(textOf(card, '[data-role="hcb-headline"]')).toBe(blockingBanner.headline);
        expect(textOf(card, '[data-role="hcb-qualifier"]')).toBe(blockingBanner.qualifier);

        // Severity is stamped (machine-readable, quotable in a bug report) and the
        // established ERROR token carries the weight — no ad-hoc red.
        expect(card.getAttribute('data-severity')).toBe('blocking');
        expect(card.querySelector('.alm-notice')?.className).toBe('alm-notice alm-notice--rejected hcb-notice');
        // Persistent + dismiss-required: an explicit dismiss control, no auto-hide.
        expect(card.querySelector('[data-action="dismiss-circulation-banner"]')).not.toBeNull();
        // Blocking interrupts assistive tech too.
        expect(card.getAttribute('role')).toBe('alert');
        expect(card.getAttribute('aria-live')).toBe('assertive');
        expect(card.getAttribute('aria-label')).toBe('House built with sealed rooms');
    });

    it('renders EVERY non-empty bucket — one rendered line per banner line, none hidden', () => {
        const card = build(blockingWithAllBuckets);
        // Exact, in order, untruncated: a silently shortened list understates the defect.
        expect(lineTexts(card)).toEqual(blockingWithAllBuckets.lines);
        // The not-measured bucket is named as such — never laundered into a pass.
        expect(card.textContent).toContain('NOT MEASURED');
        // …and the unsound bucket, which has neither a sealed room nor an absent verdict.
        expect(card.textContent).toContain('UNSOUND — rules failed: window-min-area');
    });

    it('carries the exact chrome — classes, region structure and the dismiss button', () => {
        const card = build(blockingBanner);
        expect(card.className).toBe('alm-panel hcb-card');
        expect(card.querySelector('.alm-header')?.className).toBe('alm-header hcb-header');
        expect(card.querySelector('.alm-notice-region')?.className).toBe('alm-notice-region hcb-region');
        expect(card.querySelector('.alm-notice-icon')?.getAttribute('aria-hidden')).toBe('true');
        expect(card.querySelector('.hcb-headline')?.className).toBe('alm-notice-title hcb-headline');
        expect(card.querySelector('.hcb-lines')?.className).toBe('alm-notice-text hcb-lines');
        expect(card.querySelector('.hcb-qualifier')?.className).toBe('alm-notice-hint hcb-qualifier');
        expect(card.querySelector('.alm-footer')?.className).toBe('alm-footer hcb-footer');

        const dismiss = card.querySelector<HTMLButtonElement>('[data-action="dismiss-circulation-banner"]');
        expect(dismiss?.tagName).toBe('BUTTON');
        expect(dismiss?.getAttribute('type')).toBe('button');
        expect(dismiss?.className).toBe('alm-select hcb-dismiss');
        expect(dismiss?.textContent).toBe('I understand — dismiss');
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
        const card = build(unknownBanner);
        expect(card.getAttribute('data-severity')).toBe('unknown');
        const notice = card.querySelector('.alm-notice');
        expect(notice?.classList.contains('alm-notice--rejected')).toBe(false);
        expect(notice?.classList.contains('alm-notice--reduced')).toBe(true);
        expect(card.getAttribute('role')).toBe('status');
        expect(card.getAttribute('aria-live')).toBe('polite');
        expect(card.getAttribute('aria-label')).toBe('House built — circulation could not be fully checked');
        // Still dismiss-required, still ordered headline → lines → qualifier.
        expect(card.querySelector('[data-action="dismiss-circulation-banner"]')).not.toBeNull();
        expect(roleOrder(card)).toEqual(['hcb-headline', 'hcb-line', 'hcb-qualifier']);
        expect(textOf(card, '[data-role="hcb-headline"]')).toBe(unknownBanner.headline);
        expect(textOf(card, '[data-role="hcb-qualifier"]')).toBe(unknownBanner.qualifier);
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

// ── §XSS-NO-SINK — the assertion the DOM conversion exists for ───────────────
//
// Room names reach this banner from AI generation and from user input. Under the former
// `innerHTML` builder these tests would go RED the moment a future edit dropped one
// `esc()` call — which is the failure mode this file must be able to catch. They are
// written against the DOM, not the markup, so they cannot be satisfied by an escape
// that merely LOOKS applied: an injected `<img>` either is an element in the tree or
// it is not.

describe('§XSS-NO-SINK — engine/user text is TEXT, structurally', () => {
    const XSS = '<img src=x onerror="alert(1)">';

    const injected: HouseCirculationBanner = {
        ...blockingBanner,
        headline: `1 of 2 storeys ships with a sealed room ${XSS}`,
        qualifier: `Checked 2 of 2 storeys ${XSS}`,
        lines: [
            `Storey 1 (L-house-01): SEALED — no door at all: ${XSS} · rules failed: reach`,
            `Storey 2 (L-house-02): SEALED — no door at all: <script>alert(2)</script>`,
        ],
    };

    it('renders an injected room name as literal text and creates NO element from it', () => {
        const card = build(injected);

        // NOTHING was parsed as markup — not in the tree, not in a detached branch.
        expect(card.querySelector('img')).toBeNull();
        expect(card.querySelector('script')).toBeNull();
        // Element census: the fixed chrome plus exactly one <div> per banner line, and
        // not one node more. An injected element would push this over.
        expect(card.querySelectorAll('*')).toHaveLength(FIXED_ELEMENT_COUNT + injected.lines.length);

        // …and the payload is still SHOWN to the user, verbatim, as text. Dropping the
        // dangerous characters instead of rendering them would be its own defect: the
        // room name in the model is what the architect has to go and fix.
        expect(lineTexts(card)).toEqual(injected.lines);
        expect(textOf(card, '[data-role="hcb-headline"]')).toBe(injected.headline);
        expect(textOf(card, '[data-role="hcb-qualifier"]')).toBe(injected.qualifier);
    });

    it('survives the mount — the injected payload is inert in the live document too', () => {
        presentHouseCirculationBanner(injected);

        const host = document.getElementById('hcb-circulation-banner-host');
        expect(host).not.toBeNull();
        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('script')).toBeNull();
        expect(host?.textContent).toContain(XSS);
    });

    it('cannot break out of an attribute value either', () => {
        // `severity` is a closed union at the type boundary, so a hostile value can only
        // arrive from an engine/protocol drift — exactly the case setAttribute makes safe.
        const hostile = { ...blockingBanner, severity: '" onmouseover="alert(1)' } as unknown as HouseCirculationBanner;
        const card = build(hostile);
        expect(card.getAttribute('data-severity')).toBe('" onmouseover="alert(1)');
        expect(card.getAttribute('onmouseover')).toBeNull();
        expect(card.querySelectorAll('*')).toHaveLength(FIXED_ELEMENT_COUNT + hostile.lines.length);
    });

    it('renders a missing headline/qualifier as empty text, never the word "null"', () => {
        // Pins the one normalisation the former `esc()` performed (`String(v ?? '')`).
        const sparse = { ...blockingBanner, headline: null, qualifier: undefined } as unknown as HouseCirculationBanner;
        const card = build(sparse);
        expect(textOf(card, '[data-role="hcb-headline"]')).toBe('');
        expect(textOf(card, '[data-role="hcb-qualifier"]')).toBe('');
    });
});

// ── The mount: singleton, dismiss-required, no auto-hide ─────────────────────

describe('§CI-1-BANNER — the DOM mount', () => {
    it('mounts one host, and the dismiss button click handler removes it', () => {
        presentHouseCirculationBanner(blockingBanner);
        const host = document.getElementById('hcb-circulation-banner-host');
        expect(host).not.toBeNull();
        expect(host?.querySelector('.hcb-card')).not.toBeNull();

        const dismiss = host?.querySelector<HTMLButtonElement>('[data-action="dismiss-circulation-banner"]');
        expect(dismiss).not.toBeNull();
        dismiss?.click();
        expect(document.getElementById('hcb-circulation-banner-host')).toBeNull();
    });

    it('is a singleton — a re-run replaces the previous card rather than stacking', () => {
        presentHouseCirculationBanner(blockingBanner);
        presentHouseCirculationBanner(unknownBanner);
        expect(document.querySelectorAll('#hcb-circulation-banner-host')).toHaveLength(1);
        expect(document.querySelectorAll('.hcb-card')).toHaveLength(1);
        expect(document.querySelector('.hcb-card')?.getAttribute('data-severity')).toBe('unknown');
    });

    it('dismiss is idempotent and never throws when nothing is mounted', () => {
        expect(() => dismissHouseCirculationBanner()).not.toThrow();
        expect(() => dismissHouseCirculationBanner()).not.toThrow();
    });
});
