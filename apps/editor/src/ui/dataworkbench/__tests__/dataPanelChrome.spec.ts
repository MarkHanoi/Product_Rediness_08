/**
 * §DW-ONE-HEADER-BAND / §DW-HEATMAP-BAR-HAD-NO-RULE (L-3700..L-3704) —
 * the Data panel's chrome, held to the Inspect surface the founder named.
 *
 * WHAT THESE ASSERTIONS ESTABLISH, AND WHAT THEY CANNOT
 * -----------------------------------------------------
 * They read SHIPPED SOURCE AS TEXT — `DataWorkbench.ts`, this panel's
 * stylesheet, and the Inspect stylesheet. Nothing here renders, lays out, or
 * measures a pixel: "the header is 42px" and "the select is legible on the
 * gradient" are claims this file does NOT make and cannot make. What it pins is
 * the SHAPE of three defects that were real on 2026-08-22, at the only place a
 * text test honestly can. A browser check would be strictly stronger; this is
 * not one, and is not dressed up as one.
 *
 * WHY EACH ARM SURVIVES A RENAME
 * ------------------------------
 * This repo has a recorded pattern of gates that classify by NAME and are
 * satisfied by RENAMING (CLAUDE.md, P4). So:
 *
 *   ARM A  globs the DIRECTORY and cross-resolves two INDEPENDENT artefacts —
 *          the class a `.ts` file emits against the selector the sheet
 *          declares. Renaming `.dw-heatmap-bar` to anything at all does not
 *          help; the new name is undeclared too. The only way to pass is to
 *          declare the rule or stop emitting the class, which is the point.
 *          It is the arm that WOULD have caught the defect below.
 *   ARM B  counts bands by counting appends into the header container, not by
 *          looking for a class called "heatmap".
 *   ARM C  reads Inspect's OWN sheet at test time and requires the Data header
 *          to agree with it. There is no literal to edit on one side only.
 *   ARM D  derives the required heatmap modes from the `HeatmapMode` UNION in
 *          DataVisualizerService.ts. It is the "collapse chrome, do not delete
 *          function" guard: a future tidy-up that drops a mode from the select
 *          fails here even though the select still exists and still works.
 *
 * THE DEFECT ARM A IS FOR (measured 2026-08-22, before this lane):
 *
 *     DataWorkbench.ts emitted   .dw-heatmap-bar / .dw-heatmap-label
 *     the sheet declared         .dw-viz-bar     / .dw-viz-label
 *
 * — so the third chrome band had NO rule that could ever match. Padding, a
 * sunken ground, a bottom border and a 9px uppercase label all existed and were
 * all UNREACHABLE. ABSENT and UNREACHABLE look identical in the browser and
 * have opposite fixes (C01 §6.1). Two names for one thing, and nothing in the
 * repo compared them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const UI = join(REPO, 'apps/editor/src/ui');

const DW_SHEET = join(UI, 'styles/panels/dataWorkbench.ts');
/** The Inspect (F2) header. The founder named this surface as THE reference. */
const INSPECT_SHEET = join(UI, 'styles/panels/autonomous-auditor/auditStack.ts');
const WORKBENCH = join(UI, 'dataworkbench/DataWorkbench.ts');
const VISUALIZER = join(UI, 'dataworkbench/DataVisualizerService.ts');

/** Directories whose `.ts` emits `dw-` classes into this panel. Globbed. */
const EMITTER_DIRS = [
    'apps/editor/src/ui/dataworkbench',
    'apps/editor/src/ui/dataworkbench/buckets',
];

function read(p: string): string {
    return readFileSync(p, 'utf8');
}

/**
 * Strip CSS block comments and `//` line comments.
 *
 * These files deliberately QUOTE the names they deleted ("'.dw-viz-bar' was
 * declared here and nothing emitted it"), because a correction that erases the
 * evidence teaches nobody anything. Those quotations must not read as live
 * declarations or live emissions, so comments come out before scanning.
 */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/** Every `dw-` CLASS SELECTOR the stylesheet declares a rule for. */
function declaredClasses(): Set<string> {
    const out = new Set<string>();
    for (const m of stripComments(read(DW_SHEET)).matchAll(/\.(dw-[a-z0-9-]+)/g)) out.add(m[1]!);
    return out;
}

/**
 * Every `dw-` class a TypeScript file actually puts on an element.
 *
 * Deliberately CLASS CONTEXTS ONLY — `className =`, `classList.*()`,
 * `class="…"` in a template, and `.dw-x` inside a `querySelector`. A blanket
 * `/dw-[a-z-]+/` sweep also catches ELEMENT IDS (`dw-heatmap-select`,
 * `dw-auto-setup-btn`, `#dw-workbench`), which legitimately have no class rule.
 * Measured 2026-08-22: the blunt sweep reports 14 "orphans", 11 of them ids —
 * a baseline mostly made of noise is a baseline nobody reads.
 */
function emittedClasses(): Map<string, Set<string>> {
    const used = new Map<string, Set<string>>();
    const note = (cls: string, file: string): void => {
        if (!used.has(cls)) used.set(cls, new Set());
        used.get(cls)!.add(file);
    };
    for (const dir of EMITTER_DIRS) {
        const abs = join(REPO, dir);
        if (!existsSync(abs)) continue;
        for (const f of readdirSync(abs).sort()) {
            if (!f.endsWith('.ts')) continue;
            const src = stripComments(read(join(abs, f)));
            const blobs: string[] = [];
            for (const m of src.matchAll(/\.className\s*=\s*([^;\n]+)/g)) blobs.push(m[1]!);
            for (const m of src.matchAll(/\.classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) blobs.push(m[1]!);
            for (const m of src.matchAll(/\bclass\s*=\s*["'`]([^"'`]*)["'`]/g)) blobs.push(m[1]!);
            for (const blob of blobs) {
                for (const c of blob.matchAll(/\bdw-[a-z0-9-]+/g)) note(c[0]!, `${dir}/${f}`);
            }
            for (const m of src.matchAll(/querySelector(?:All)?\(\s*['"`]([^'"`]*)['"`]/g)) {
                for (const c of m[1]!.matchAll(/\.(dw-[a-z0-9-]+)/g)) note(c[1]!, `${dir}/${f}`);
            }
        }
    }
    return used;
}

/** The body of one CSS rule in a sheet, comments removed. */
function ruleBody(sheetPath: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
    return re.exec(stripComments(read(sheetPath)))?.[1] ?? '';
}

/** One declaration's value out of a rule body, e.g. `padding` → `14px 16px 12px`. */
function decl(body: string, prop: string): string {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
    return (m?.[1] ?? '').trim();
}

describe('§DW-ONE-HEADER-BAND — the Data panel chrome', () => {
    describe('ARM A — every emitted dw- class has a rule (shrink-only, both directions)', () => {
        /**
         * Classes emitted with no matching rule. Measured 2026-08-22.
         *
         * `dw-heatmap-bar` and `dw-heatmap-label` WERE ON THIS LIST and are now
         * gone — that is the whole subject of L-3703. The three that remain are
         * pre-existing and were NOT introduced or repaired by that lane; they
         * are named rather than silently tolerated.
         *
         * Shrink-only in BOTH directions (see the second assertion): a new
         * orphan fails, AND an entry here that is already fixed fails. Adding a
         * name to silence a new orphan is therefore a visible, reviewable act.
         */
        const ORPHAN_BASELINE: ReadonlyArray<string> = [
            'dw-compliance-summary',   // CompliancePanel.ts
            'dw-toolbar-btn--primary', // CompliancePanel.ts, ProgrammePanel.ts, SpatialQueryPanel.ts
            'dw-toolbar-select',       // CompliancePanel.ts, PhysicsPanel.ts
        ];

        it('no NEW dw- class is emitted without a stylesheet rule', () => {
            const declared = declaredClasses();
            const known = new Set(ORPHAN_BASELINE);
            const unknown: string[] = [];
            const stillPresent = new Set<string>();
            for (const [cls, files] of emittedClasses()) {
                if (declared.has(cls)) continue;
                if (known.has(cls)) { stillPresent.add(cls); continue; }
                unknown.push(`${cls}  <-  ${[...files].join(', ')}`);
            }
            expect(unknown).toEqual([]);
            const stale = ORPHAN_BASELINE.filter((c) => !stillPresent.has(c));
            expect(stale, 'these are FIXED — remove them from ORPHAN_BASELINE').toEqual([]);
        });

        it('the heatmap band that had no rule is gone from BOTH sides', () => {
            // The emitter is gone…
            expect(stripComments(read(WORKBENCH))).not.toContain('dw-heatmap-bar');
            // …and so are the four rules that could never match it. Renaming
            // `.dw-viz-bar` to `.dw-heatmap-bar` would have been the OTHER fix;
            // this asserts which one was taken, so a later reader is not left
            // guessing whether the band exists somewhere unstyled again.
            const sheet = stripComments(read(DW_SHEET));
            expect(sheet).not.toContain('.dw-viz-bar');
            expect(sheet).not.toContain('.dw-viz-label');
            expect(sheet).not.toContain('.dw-viz-btn');
            // The LEGEND is a different thing and is still live —
            // DataVisualizerService.ts emits it. This is here so a future sweep
            // does not delete it as "more dead viz CSS".
            expect(sheet).toContain('#dw-viz-legend');
            expect(read(VISUALIZER)).toContain('dw-viz-legend');
        });
    });

    describe('ARM B — the content header is ONE band plus navigation (hard-0)', () => {
        it('exactly two children are appended to the content header', () => {
            const src = stripComments(read(WORKBENCH));
            const appends = [...src.matchAll(/this\._headerEl\.appendChild\(([^)]*)\)/g)].map((m) => m[1]!.trim());
            // Was THREE: bucket header, sub-tab bar, heatmap bar (~103px of
            // chrome before a row of data). Inspect reaches content in one band.
            expect(appends).toEqual(['this._bucketHeaderEl', 'this._subTabBarEl']);
        });

        it('the header actions slot is a persistent child, not innerHTML fodder', () => {
            const src = stripComments(read(WORKBENCH));
            // The header's right half could never hold a control while every
            // bucket switch did `_bucketHeaderEl.innerHTML = …`. The rebuild now
            // targets the LEFT block only; that is what makes the actions slot
            // possible at all, so it is asserted rather than assumed.
            expect(src).toContain('this._bucketHeaderLeftEl.innerHTML');
            expect(src).not.toContain('this._bucketHeaderEl.innerHTML');
            // §DW-HEADER-BAND-HAS-A-JOB (L-4020) — the slot is now created in
            // its own right ('actions'), and the heatmap control is an inner
            // GROUP inside it. It used to BE the slot, carrying 'display: none'
            // outside AUDIT, which emptied the header's right half in six of
            // seven buckets — the founder's 'almost entirely empty' band.
            expect(src).toContain("actions.className = 'dw-bucket-header-actions'");
            expect(src).toContain("wrap.className = 'dw-header-ctl-group'");
            expect(declaredClasses().has('dw-bucket-header-actions')).toBe(true);
            expect(declaredClasses().has('dw-header-ctl-group')).toBe(true);
        });

        it('⭐ the actions slot is ALWAYS occupied, and by a RE-HOSTED action', () => {
            // C06 §6.1: a mode surface reaches its content in ONE chrome band.
            // A band whose right half is structurally empty is that rule failing
            // from the other side — it is reserved space that nothing can use.
            // §13.3: the dispatch is RE-HOSTED, never re-implemented, so this
            // pins that the click calls the workbench's own existing fan-out
            // rather than a second refresh path.
            const src = stripComments(read(WORKBENCH));
            expect(src).toContain("refreshBtn.className = 'dw-header-btn'");
            expect(src).toContain('refreshBtn.addEventListener(');
            expect(src).toMatch(/refreshBtn\.addEventListener\('click', \(\) => this\.refresh\(\)\)/);
            expect(declaredClasses().has('dw-header-btn')).toBe(true);
        });
    });

    describe('§DW-EMPTY-TOTAL-BAR (L-4024..L-4026) — the SECOND dead band', () => {
        /**
         * The founder's report had TWO dead bands, not one: the empty header
         * half above, and 'a strip of dead space at the very bottom of the
         * panel'. This is the second.
         *
         * ⛔ MEASURED 2026-08-22. 'ProgrammePanel._totalEl' is appended
         * UNCONDITIONALLY with 'padding: 8px 12px', a 2px top rule and a sunken
         * ground. '_renderTable()' clears it and then RETURNS EARLY in the empty
         * state without filling it — so an empty Programme renders an 18px
         * sunken strip under a 2px rule containing nothing, at the foot of the
         * panel. Exactly the screen he screenshotted.
         */
        const PROGRAMME = join(UI, 'dataworkbench/ProgrammePanel.ts');

        it('the total bar is styled by a SHEET class, not an inline cssText block', () => {
            // C06 §6.1 rule 2 — every class a panel EMITS has a rule in that
            // panel's sheet, and ARM A above compares the two artefacts. An
            // inline style block is invisible to that comparison, which is how
            // a band with no content and full chrome went unnoticed.
            const src = stripComments(read(PROGRAMME));
            expect(src).toContain("this._totalEl.className = 'dw-total-bar'");
            expect(src, 'the total bar went back to inline styles').not.toMatch(
                /_totalEl\.style\.cssText/,
            );
            expect(declaredClasses().has('dw-total-bar')).toBe(true);
        });

        it('⛔ its visibility is DERIVED from the row count, in ONE place', () => {
            // A summary bar with nothing to summarise is residue, not chrome.
            // Two toggle sites would be the same defect with an extra step.
            const src = stripComments(read(PROGRAMME));
            const toggles = [...src.matchAll(/_totalEl\.style\.display\s*=/g)];
            expect(toggles.length, 'the total bar is toggled from more than one place').toBe(1);
            expect(src).toMatch(
                /_totalEl\.style\.display = this\._entries\.length === 0 \? 'none' : 'flex'/,
            );
        });

        it('the bar still RENDERS its four figures when there ARE entries', () => {
            // Hiding it must not have deleted it. The capability is preserved;
            // only the empty case changed.
            const src = read(PROGRAMME);
            for (const label of ['Total rooms:', 'Target GIA:', 'Actual GIA:', 'GIA:']) {
                expect(src, `the total bar lost "${label}"`).toContain(label);
            }
        });
    });

    describe('ARM C — the Data header agrees with the Inspect header (hard-0)', () => {
        /**
         * ⚠ THIS ARM IS DELIBERATELY COUPLED TO ANOTHER SURFACE'S STYLESHEET.
         * The founder's instruction was "converge on ONE header treatment across
         * Inspect / Analysis / Data". A convergence that is asserted only as a
         * pair of independent literals diverges the first time one side moves —
         * which is exactly how the Data header ended up 44px/800-weight/no-shadow
         * against Inspect's auto/700/shadow.
         *
         * So when Inspect's `.aud-header` changes, THIS FAILS. The fix is to
         * converge the Data header, or to raise the decision that the two
         * surfaces should differ. It is NOT to delete this arm.
         */
        const dwHeader = () => ruleBody(DW_SHEET, '.dw-bucket-header');
        const audHeader = () => ruleBody(INSPECT_SHEET, '.aud-header');

        it('both headers exist and are found by this test', () => {
            // Guard the premise: an empty rule body would make every comparison
            // below trivially pass on ''.
            expect(dwHeader().length).toBeGreaterThan(20);
            expect(audHeader().length).toBeGreaterThan(20);
        });

        it('padding, brand ground, ink and elevation match Inspect', () => {
            const dw = dwHeader();
            const aud = audHeader();
            expect(decl(dw, 'padding')).toBe(decl(aud, 'padding'));
            expect(decl(dw, 'background')).toBe(decl(aud, 'background'));
            expect(decl(dw, 'color')).toBe(decl(aud, 'color'));
            // The missing box-shadow is why the Data header and the sub-tab row
            // below it read as one thick slab instead of a header over content.
            expect(decl(dw, 'box-shadow')).toBe(decl(aud, 'box-shadow'));
            expect(decl(dw, 'height')).toBe('auto');
        });

        it('the title weight and tracking match Inspect', () => {
            const title = ruleBody(DW_SHEET, '.dw-bucket-header-title');
            const aud = audHeader();
            expect(decl(title, 'font-weight')).toBe(decl(aud, 'font-weight'));
            expect(decl(title, 'letter-spacing')).toBe(decl(aud, 'letter-spacing'));
        });

        it('the header <select> pins its own option list to a light ground', () => {
            // §DW-HEADER-TRANSPARENT (L-3300) was white ink on a white ground
            // reached by a colour that silently failed to resolve. An unstyled
            // <option> is the same trap by a different route: the popup paints on
            // the UA's light ground while the option INHERITS the select's
            // on-accent white. Invisible — and invisible inside a popup that no
            // screenshot of the panel would ever contain.
            const opt = ruleBody(DW_SHEET, '.dw-header-select option');
            expect(opt).toContain('var(--app-panel-bg)');
            expect(opt).toContain('var(--app-text)');
        });
    });

    describe('ARM D — collapsing the band did not delete the capability (hard-0)', () => {
        it('every HeatmapMode in the union is still offered by the control', () => {
            // Derived from the TYPE, not from a copy of the list. A future tidy
            // that drops "Area Δ" to shorten the select fails here.
            const union = /export type HeatmapMode\s*=\s*([^;]+);/.exec(read(VISUALIZER))?.[1] ?? '';
            const modes = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
            expect(modes.length).toBe(5);

            const src = stripComments(read(WORKBENCH));
            const control = /_buildHeatmapControl\(\): HTMLElement \{([\s\S]*?)\n    \}/.exec(src)?.[1] ?? '';
            expect(control.length).toBeGreaterThan(200);
            const missing = modes.filter((m) => !control.includes(`mode: '${m}'`));
            expect(missing, 'a heatmap mode was dropped when the band was collapsed').toEqual([]);
        });

        it('the control still drives the visualizer singleton, not a local flag', () => {
            const src = stripComments(read(WORKBENCH));
            expect(src).toContain('dataVisualizer.setMode(select.value as HeatmapMode)');
            // Re-read on every bucket entry: another surface can change the mode.
            expect(src).toContain('this._syncHeatmapControl()');
        });
    });
});
