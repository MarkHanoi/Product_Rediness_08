// ─────────────────────────────────────────────────────────────────────────────
// §TOP-STACK + §RESELECT-PARCEL — the 2D Site Map's instruction banner and the
// parcel card's third exit. L-13090 / L-13094 / L-13113 · C59 §2.10.3 clause 4.
//
// WHAT THE FOUNDER SAID, 2026-09-07, and what each half of it costs:
//
//   (1) *"On those panels - please add the message further up (first arrow)"* — his arrow
//       drawn at the pane's own `2D Site Map ▾` dropdown. In the SAME screenshots the
//       banner is CUT OFF: its right edge disappears under the parcel card. ⭐ The clip is
//       the primary defect and the height is the secondary one — a banner moved up but
//       still clipped is a banner he cannot read, so this suite pins the CLEARANCE first
//       and the height second.
//
//   (2) *"on the panel where it saysd use this parcel - add - the optin to re-select
//       parcel to change parcel"*.
//
// ⭐ WHY THIS SUITE IS SOURCE-LEVEL RATHER THAN A RENDER TEST. The thing that can break is
// not a value a DOM query would see — happy-dom does no layout, computes no `clamp()`, and
// would report the banner and the card as occupying the same nothing. The two REAL failure
// modes are both textual, and both are silent in production:
//
//   • the token is renamed, moved to a selector that is NOT the banner's ancestor, or the
//     banner is switched back to a hard-coded px. A `var()` that resolves to nothing makes
//     `right` invalid at computed-value time, which falls back to `right: auto` — and
//     `right: auto` is EXACTLY the clipped banner the founder photographed. It throws
//     nothing and logs nothing.
//   • a second re-select route is minted beside `clearParcelSelection`, and the two drift
//     into two different ideas of what "no parcel selected" means. This repo has paid for
//     rival mechanisms repeatedly (three disagreeing commandManager counters, rival compose
//     roots); here the rival would leave a violet highlight painted over land the user is
//     no longer looking at.
//
// So: ARMs A/B/D read the source, and ARM C does the arithmetic the browser would do.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PROJECT_BROWSER_STYLES } from '../../styles/panels/projectBrowser';

const SBM2D = 'apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts';

/**
 * ⛔ NOT `import.meta.url` — under this suite's transform it is not a `file:` URL and
 * `fileURLToPath` throws at COLLECTION, which prints as "0 test" rather than as a failure.
 * Walk up from the cwd instead, and fail LOUDLY if the subject cannot be found: a source-
 * reading guard that silently reads nothing prints the same green as one that passed
 * (§L-851).
 */
function readSubject(): string {
    for (let dir = process.cwd(); ; dir = dirname(dir)) {
        const candidate = resolve(dir, SBM2D);
        if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
        if (dirname(dir) === dir) throw new Error(`[§TOP-STACK spec] cannot locate ${SBM2D} from ${process.cwd()}`);
    }
}

const MAP_SRC = readSubject();

/** The founder's own pane widths, from one session's console (2026-09-07). */
const FOUNDER_PANE_WIDTHS_PX = [459, 742, 812, 841, 1023] as const;

/** The stack's own left inset, and the floor its sentence may never fall below. */
const STACK_LEFT_PX = 12;
const MIN_READABLE_BANNER_PX = 180;

/** Everything inside the `.pryzm-gis-map2d { … }` rule, whitespace-collapsed. */
function map2dTokenRule(): string {
    const at = PROJECT_BROWSER_STYLES.indexOf('.pryzm-gis-map2d {');
    if (at < 0) throw new Error('[§TOP-STACK spec] .pryzm-gis-map2d rule is gone — both tokens live in it');
    const close = PROJECT_BROWSER_STYLES.indexOf('}', at);
    return PROJECT_BROWSER_STYLES.slice(at, close + 1).replace(/\s+/g, ' ');
}

/**
 * ⭐ THE ARITHMETIC BELOW IS READ OUT OF THE STYLESHEET, NOT RETYPED BESIDE IT.
 *
 * A spec that hard-codes `24` and `192` models the CSS instead of testing it: revert the
 * stylesheet and every width case still passes against the spec's own private copy, which
 * is the "fake more capable than real" defect — a guard built from the header cannot
 * falsify the header. So the two constants and the clamp are EXTRACTED, and a shape that no
 * longer matches throws by name rather than quietly reverting to a remembered number.
 */
function readGutterModel(): { cardMin: number; cardPct: number; cardMax: number; gap: number; floor: number } {
    const rule = map2dTokenRule();
    const card = /--map2d-parcel-card-w:\s*clamp\((\d+)px,\s*(\d+)%,\s*(\d+)px\)/.exec(rule);
    if (!card) throw new Error(`[§TOP-STACK spec] --map2d-parcel-card-w is not a clamp(px, %, px): ${rule}`);
    const gutter = /--map2d-top-stack-right:\s*min\(\s*calc\((\d+)px \+ var\(--map2d-parcel-card-w\)\),\s*calc\(100% - (\d+)px\)\s*\)/.exec(rule);
    if (!gutter) throw new Error(`[§TOP-STACK spec] --map2d-top-stack-right lost its min()/card-derived shape: ${rule}`);
    return {
        cardMin: Number(card[1]), cardPct: Number(card[2]), cardMax: Number(card[3]),
        gap: Number(gutter[1]), floor: Number(gutter[2]),
    };
}

const MODEL = readGutterModel();

/** The card's declared width, evaluated at a pane width. */
function cardWidthPx(paneWidthPx: number): number {
    return Math.min(MODEL.cardMax, Math.max(MODEL.cardMin, paneWidthPx * (MODEL.cardPct / 100)));
}

/**
 * The banner's right gutter, evaluated. The second arm is §BANNER-NEVER-STARVES (L-13113).
 */
function topStackRightPx(paneWidthPx: number): number {
    return Math.min(MODEL.gap + cardWidthPx(paneWidthPx), paneWidthPx - MODEL.floor);
}

describe('§TOP-STACK ARM A — the gutter token is declared on the banner\'s OWN ancestor', () => {
    it('declares both tokens in one rule, and derives the gutter FROM the card width', () => {
        const rule = map2dTokenRule();
        expect(rule).toContain('--map2d-parcel-card-w:');
        expect(rule).toContain('--map2d-top-stack-right:');
        // ⭐ ONE NUMBER, TWO READERS. If the gutter ever stops referencing the card width it
        // becomes a second, independent number, and the reservation drifts from the thing it
        // reserves for the first time either is tuned — which is how the banner got clipped.
        expect(rule).toMatch(/--map2d-top-stack-right:[^;]*var\(--map2d-parcel-card-w\)/);
    });

    it('declares them on the class the map overlay actually carries, so the banner INHERITS', () => {
        // The silent killer: tokens declared on a selector that is not an ancestor of the
        // banner resolve to nothing → `right: auto` → the clip is back, with no error.
        expect(MAP_SRC).toContain("overlay.className = 'pryzm-gis-map2d'");
        expect(MAP_SRC).toContain("topStack.className = 'pryzm-gis-map2d-topstack'");
        expect(MAP_SRC).toContain('overlay.appendChild(topStack)');
    });
});

describe('§TOP-STACK ARM B — the banner reads the TOKEN, and sits under the pane dropdown', () => {
    it('sets `right` from the token in the card-up state, never a hard-coded px', () => {
        expect(MAP_SRC).toContain(
            "topStack.style.right = state === 'on' ? 'var(--map2d-top-stack-right)' : '176px'",
        );
    });

    it('has exactly ONE writer of the stack box, so two states cannot disagree', () => {
        // `refreshTopStack()` is that writer. A second assignment anywhere is the shape that
        // let the banner and the card each believe they owned the top-right row.
        expect(MAP_SRC.match(/topStack\.style\.right\s*=/g) ?? []).toHaveLength(1);
        expect(MAP_SRC.match(/topStack\.style\.top\s*=/g) ?? []).toHaveLength(1);
    });

    it('starts at 52px — as far up as a MAP float may go without painting over a PANE control', () => {
        // C59 §2.10.3 clause 4: `PaneViewPicker` owns y ∈ [10, ~42] at z-index 60. This is the
        // founder's "further up", bounded by the dropdown his arrow was pointing AT.
        expect(MAP_SRC).toContain("topStack.style.top = modeBarUp ? '96px' : '52px'");
        for (const top of [52, 96]) expect(top).toBeGreaterThanOrEqual(52);
    });
});

describe('§TOP-STACK ARM C — the banner clears the card, and says so in TWO regimes', () => {
    // The geometry, once, in the browser's own terms:
    //   card   occupies x ∈ [pane − 12 − cardW, pane − 12]   (`right: 12px`)
    //   banner occupies x ∈ [12, pane − gutter]              (`left: 12px; right: gutter`)
    //
    // ⭐ THERE ARE TWO REGIMES AND THIS SUITE REFUSES TO FLATTEN THEM, because flattening is
    // how a spec ends up asserting something the code does not do. Above the break-even the
    // banner CLEARS the card geometrically. Below it — where clearing would leave the
    // sentence too narrow to read — the cap deliberately trades clearance for width, and the
    // banner OVERLAPS. That trade is safe by construction, not by luck (z-index 23 over the
    // card's 22, `pointer-events: none`), and it is the SAME degrade the dragged-card state
    // already takes. Asserting "never crosses" at every width would be a false statement that
    // happens to be green only while no pane is narrow.
    //
    // 380 and 448 are not widths he has been seen at — they are the two that PROVE the cap:
    // 448 is the exact break-even, 380 is comfortably inside the starved regime.
    const rows = [...FOUNDER_PANE_WIDTHS_PX, 380, 448, 1800].map((pane) => {
        const cardW = cardWidthPx(pane);
        const gutter = topStackRightPx(pane);
        return {
            pane,
            cardLeftEdge: pane - 12 - cardW,
            bannerRightEdge: pane - gutter,
            bannerWidth: pane - STACK_LEFT_PX - gutter,
        };
    });

    /** The pane width at which the cap starts to bite, derived: floor + gap + card floor. */
    const BREAK_EVEN_PANE_PX = MODEL.floor + MODEL.gap + MODEL.cardMin;
    const clearing = rows.filter((r) => r.pane >= BREAK_EVEN_PANE_PX);
    const overlapping = rows.filter((r) => r.pane < BREAK_EVEN_PANE_PX);

    it('the break-even is 448px, and EVERY width the founder has been seen at is above it', () => {
        expect(BREAK_EVEN_PANE_PX).toBe(448);
        for (const pane of FOUNDER_PANE_WIDTHS_PX) expect(pane).toBeGreaterThanOrEqual(BREAK_EVEN_PANE_PX);
        expect(overlapping.map((r) => r.pane)).toEqual([380]);
    });

    it.each(clearing)('pane $pane px — the banner never crosses the card\'s left edge', (r) => {
        // ⭐ THE FOUNDER'S ACTUAL DEFECT, asserted as a number. Less-than-or-equal is the whole
        // claim: overlap by even a pixel is the clip he photographed.
        expect(r.bannerRightEdge).toBeLessThanOrEqual(r.cardLeftEdge);
    });

    it.each(rows)('pane $pane px — the banner keeps a readable width', (r) => {
        // §BANNER-NEVER-STARVES (L-13113). Without the `min()` cap this fails below a 448px
        // pane: an uncapped reservation shreds the sentence into a one-word-per-line ribbon,
        // which is unclipped and just as unreadable.
        expect(r.bannerWidth).toBeGreaterThanOrEqual(MIN_READABLE_BANNER_PX);
    });

    it.each(overlapping)('pane $pane px — the starved regime trades clearance for exactly the floor', (r) => {
        // Stated rather than hidden: here the banner DOES sit over the card's column, and it
        // buys precisely the floor and not a pixel more.
        expect(r.bannerRightEdge).toBeGreaterThan(r.cardLeftEdge);
        expect(r.bannerWidth).toBe(MIN_READABLE_BANNER_PX);
    });

    it('the overlap is safe by construction — the banner is ABOVE the card and click-through', () => {
        // The three properties that make the trade legitimate, read off the source. Lose any
        // one and the starved regime stops being a degrade and becomes a defect: a sentence
        // painted under the card, or one that eats the clicks meant for it.
        const stackBlock = MAP_SRC.slice(
            MAP_SRC.indexOf('Object.assign(topStack.style, {'),
            MAP_SRC.indexOf('overlay.appendChild(topStack)'),
        );
        expect(stackBlock).toContain("zIndex: '23'");
        expect(stackBlock).toContain("pointerEvents: 'none'");
        // The card's z-order is the stylesheet's business — it is the HOST that floats the card.
        const hostAt = PROJECT_BROWSER_STYLES.indexOf('.pryzm-gis-parcel-host {');
        const hostRule = PROJECT_BROWSER_STYLES.slice(hostAt, PROJECT_BROWSER_STYLES.indexOf('}', hostAt));
        expect(hostRule).toMatch(/z-index:\s*22\s*;/);
    });

    it('leaves exactly a 12px gap whenever the pane can afford the full reservation', () => {
        // The `24px` in the token is 12px of card margin + this 12px gap; if that arithmetic
        // is ever edited on one side only, this is the assertion that says so.
        for (const pane of FOUNDER_PANE_WIDTHS_PX) {
            const r = rows.find((x) => x.pane === pane)!;
            expect(r.cardLeftEdge - r.bannerRightEdge).toBe(MODEL.gap - 12);
        }
    });

    it('the cap does NOT bite at any width the founder has actually been observed at', () => {
        // Measured, not asserted by hope: this is why L-13113 changes nothing he can see.
        for (const pane of FOUNDER_PANE_WIDTHS_PX) {
            expect(topStackRightPx(pane)).toBe(MODEL.gap + cardWidthPx(pane));
        }
        // …and it DOES bite below a 448px pane, which is the only reason it is there.
        expect(topStackRightPx(400)).toBe(400 - MODEL.floor);
    });

    it('pins the values the arithmetic above was read FROM', () => {
        // These are the numbers `readGutterModel()` extracted. Asserting them here is what
        // turns an extraction into a pin: change the stylesheet and this says which number
        // moved, instead of the suite silently re-deriving itself and staying green.
        expect(MODEL).toEqual({ cardMin: 232, cardPct: 20, cardMax: 360, gap: 24, floor: 192 });
        // 192px is the 180px banner floor + the stack's own 12px left inset. If that identity
        // is ever broken, the floor the starvation arm enforces stops being the floor the CSS
        // delivers — and both would still be green.
        expect(MODEL.floor).toBe(MIN_READABLE_BANNER_PX + STACK_LEFT_PX);
    });
});

describe('§RESELECT-PARCEL ARM D — the founder\'s third exit reaches the EXISTING pick path', () => {
    it('defines exactly one routine that clears the selection and re-arms picking', () => {
        expect(MAP_SRC.match(/function clearParcelSelection\(/g) ?? []).toHaveLength(1);
    });

    it('re-arms SELECT, drops the highlight, hides the card and restores the crosshair', () => {
        const at = MAP_SRC.indexOf('function clearParcelSelection(');
        const body = MAP_SRC.slice(at, at + 900);
        expect(body).toContain("setInteractionMode('select')");
        expect(body).toContain('selectedParcel = null');
        expect(body).toContain('refreshParcelHighlight()');
        expect(body).toContain('hideParcelCard()');
        expect(body).toContain("cursor = 'crosshair'");
    });

    it('is called by the card action AND by the no-parcel branch — one mechanism, two callers', () => {
        // ⛔ THIS IS THE POINT OF THE WHOLE ARM. The founder's button did not mint a route; it
        // reuses the state the map ALREADY returns to when a click finds nothing. Two ways to
        // clear a selection is two ways to leave a highlight painted over the wrong land.
        expect(MAP_SRC).toContain("clearParcelSelection('user-reselect')");
        expect(MAP_SRC).toContain("clearParcelSelection('no-parcel-here')");
        const calls = MAP_SRC.match(/clearParcelSelection\('(?:user-reselect|no-parcel-here)'\)/g) ?? [];
        expect(calls).toHaveLength(2);
    });

    it('wires the card button to that routine, addressed by testid rather than by label', () => {
        const at = MAP_SRC.indexOf('const reselect = {');
        expect(at, 'the card must contribute a reselect ACTION').toBeGreaterThan(-1);
        const literal = MAP_SRC.slice(at, MAP_SRC.indexOf('};', at));
        expect(literal).toContain('testId: PARCEL_RESELECT_BTN_TESTID');
        expect(literal).toContain("onClick: () => clearParcelSelection('user-reselect')");
        // Prose is re-worded; the testid is the address. Exported for exactly that reason.
        expect(MAP_SRC).toContain("export const PARCEL_RESELECT_BTN_TESTID = 'parcel-reselect-btn'");
    });

    it('does NOT touch the committed boundary — re-selecting clears a SELECTION, nothing more', () => {
        // ⚠ The committed-state question from the brief, answered by construction: the routine
        // never assigns `committed`, never calls `commit()` and never clears the ring. The
        // destructive path (replacing a committed plot) stays behind "Use this parcel", which
        // discloses the replacement BEFORE the click via PARCEL_REPLACE_TITLE/NOTE.
        const at = MAP_SRC.indexOf('function clearParcelSelection(');
        const body = MAP_SRC.slice(at, at + 900);
        expect(body).not.toMatch(/committed\s*=/);
        expect(body).not.toMatch(/\bcommit\(\)/);
        expect(body).not.toContain('vertices.length = 0');
        // It only READS `committed`, to say which sentence the chip should carry.
        expect(body).toContain('PARCEL_RESELECT_CHIP');
    });

    it('keeps an escape hatch beside it — the card never traps the user (§L-942)', () => {
        // Three exits off the card: commit, draw instead, and now re-select.
        expect(MAP_SRC).toContain("testId: 'parcel-draw-btn'");
        expect(MAP_SRC).toContain("onClick: () => setInteractionMode('draw')");
    });
});
