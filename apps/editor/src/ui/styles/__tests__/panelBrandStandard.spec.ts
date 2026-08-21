/**
 * §PANEL-BRAND-STANDARD (L-1744) — the guard for the two workspace-mode panels.
 *
 * WHAT THESE ASSERTIONS ESTABLISH, AND WHAT THEY CANNOT
 * -----------------------------------------------------
 * They read the SHIPPED CSS STRINGS and the SHIPPED TypeScript source as text.
 * happy-dom performs no layout and paints nothing, so nothing here measures a
 * rendered colour, a contrast ratio, or a scroll height. What they pin is the
 * SHAPE of the defect the founder reported on 2026-08-21 — a panel reaching for
 * a colour that the token layer does not authorise — and they pin it at the
 * only place a text test honestly can: the source of the stylesheet.
 *
 * A rendered check would be strictly stronger. This is not one, and is not
 * dressed up as one.
 *
 * WHY THIS IS NOT NAME-THEATRE
 * ----------------------------
 * This repo has a recorded pattern of gates that classify by NAME and are
 * satisfied by RENAMING (CLAUDE.md, P4). Each arm below is built so a rename
 * cannot satisfy it:
 *
 *   ARM A globs a DIRECTORY, not a file list, so a new sheet dropped beside
 *         these is covered the day it lands rather than the day someone
 *         remembers to add it here.
 *   ARM B keys on the SYNTAX `var(--x, …)`, not on any identifier.
 *   ARM C is the one that matters. It resolves every custom property the two
 *         panels REFERENCE against the properties tokens.ts DECLARES. Renaming
 *         `--app-green` to `--app-emerald` does not help: the new name is
 *         undeclared too. The only way to pass is to declare the token or stop
 *         referencing it — which is the whole point.
 *         Its runtime allowlist cannot be padded either: each entry names the
 *         source file that must contain a `setProperty` for it, and the arm
 *         VERIFIES that file really does.
 *
 * ARM D pins the two structural changes (the aligned label/value grid and the
 * hoisted sheet root/scroller). It is the weakest arm here — shipped-text only,
 * per the caveat above.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const STYLES = join(REPO, 'apps/editor/src/ui/styles');

/** The Data mode surface (F3) and the Inspect mode surface (F2). */
const DATA_SHEET = join(STYLES, 'panels/dataWorkbench.ts');
const INSPECT_DIR = join(STYLES, 'panels/autonomous-auditor');
const TOKENS = join(STYLES, 'tokens.ts');

function read(p: string): string {
    return readFileSync(p, 'utf8');
}

/** Every stylesheet that composes the two mode surfaces. Directory-globbed. */
function modeSurfaceSheets(): Array<{ label: string; path: string; src: string }> {
    const out = [{ label: 'panels/dataWorkbench.ts', path: DATA_SHEET, src: read(DATA_SHEET) }];
    for (const f of readdirSync(INSPECT_DIR).sort()) {
        if (!f.endsWith('.ts')) continue;
        const p = join(INSPECT_DIR, f);
        out.push({ label: `panels/autonomous-auditor/${f}`, path: p, src: read(p) });
    }
    return out;
}

/**
 * Strip every CSS `/* … *\/` and JS `//` comment.
 *
 * The historical values are deliberately QUOTED in the comments these files now
 * carry ("was rgba(0,0,0,0.35) — black, brand-violation"), because a correction
 * that deletes the evidence teaches nobody anything. Those must not read as
 * live colours, so comments are removed before scanning.
 */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/g;

describe('§PANEL-BRAND-STANDARD — the Inspect and Data mode surfaces', () => {
    describe('ARM A — no raw colour literal outside the token layer (hard-0)', () => {
        it('every mode-surface stylesheet resolves its colours through var(--…)', () => {
            const offenders: string[] = [];
            for (const sheet of modeSurfaceSheets()) {
                const lines = stripComments(sheet.src).split('\n');
                lines.forEach((line, i) => {
                    for (const hit of line.match(COLOUR_LITERAL) ?? []) {
                        offenders.push(`${sheet.label}:${i + 1}  ${hit.trim()}  |  ${line.trim()}`);
                    }
                });
            }
            // Hard 0, no baseline. Measured 2026-08-21: these files held 226
            // literals between them before L-1742. If this list is ever
            // non-empty the right move is a token in tokens.ts, never an
            // exception here.
            expect(offenders).toEqual([]);
        });
    });

    describe('ARM B — no var() fallback (hard-0)', () => {
        it('no --app-* reference carries a fallback value', () => {
            // AppTheme.injectAppTheme() concatenates DESIGN_TOKENS ahead of every
            // panel sheet into ONE <style> element, so :root is always defined by
            // the time a panel rule is read and no fallback can ever fire. A dead
            // fallback that DISAGREES with its token is a second palette kept
            // alive in code — which is exactly what dataWorkbench.ts held (164 of
            // them, five contradicting the token they backed).
            const offenders: string[] = [];
            for (const sheet of modeSurfaceSheets()) {
                const body = stripComments(sheet.src);
                for (const m of body.matchAll(/var\(\s*(--app-[a-z0-9-]+)\s*,/g)) {
                    offenders.push(`${sheet.label}  var(${m[1]}, …)`);
                }
            }
            expect(offenders).toEqual([]);
        });

        it('AppTheme really does inject the tokens ahead of these sheets', () => {
            // The claim above is load-bearing for ARM B, so it is asserted rather
            // than assumed. If the assembly order ever changes, ARM B's premise
            // fails here — loudly — instead of silently.
            const theme = read(join(STYLES, 'AppTheme.ts'));
            const tokensAt = theme.indexOf('scaleCssText(DESIGN_TOKENS');
            const dataAt = theme.indexOf('DATA_WORKBENCH_STYLES', tokensAt);
            const auditAt = theme.indexOf('AUTONOMOUS_AUDITOR_STYLES', tokensAt);
            expect(tokensAt).toBeGreaterThan(-1);
            expect(dataAt).toBeGreaterThan(tokensAt);
            expect(auditAt).toBeGreaterThan(tokensAt);
        });
    });

    describe('ARM C — every referenced custom property is DECLARED (hard-0)', () => {
        /**
         * Properties written at runtime rather than declared in tokens.ts. Each
         * entry names the file that must set it — and the arm checks that file,
         * so this list cannot be padded to silence a genuine phantom.
         */
        const RUNTIME_PUBLISHED: ReadonlyArray<{ prop: string; setBy: string }> = [
            { prop: '--bucket-color', setBy: 'apps/editor/src/ui/dataworkbench/DataWorkbench.ts' },
            { prop: '--aud-ramp-from', setBy: 'apps/editor/src/ui/inspect/audit/heatRamp.ts' },
            { prop: '--aud-ramp-to', setBy: 'apps/editor/src/ui/inspect/audit/heatRamp.ts' },
        ];

        function declaredInTokens(): Set<string> {
            const out = new Set<string>();
            for (const m of read(TOKENS).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) out.add(m[1]!);
            return out;
        }

        it('the runtime allowlist is honest — each entry is really published', () => {
            for (const { prop, setBy } of RUNTIME_PUBLISHED) {
                const p = join(REPO, setBy);
                expect(existsSync(p), `${setBy} does not exist`).toBe(true);
                const src = read(p);
                const published =
                    src.includes(`setProperty('${prop}'`) ||
                    src.includes(`setProperty("${prop}"`);
                expect(published, `${setBy} never writes ${prop}`).toBe(true);
            }
        });

        it('no mode-surface sheet references an undeclared custom property', () => {
            const declared = declaredInTokens();
            const runtime = new Set(RUNTIME_PUBLISHED.map((r) => r.prop));
            const phantoms: string[] = [];
            for (const sheet of modeSurfaceSheets()) {
                const body = stripComments(sheet.src);
                for (const m of body.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
                    const prop = m[1]!;
                    if (declared.has(prop) || runtime.has(prop)) continue;
                    phantoms.push(`${sheet.label}  var(${prop})`);
                }
            }
            // This is the arm that would have caught --app-green / --app-amber /
            // --app-red: three names referenced 11 times and declared nowhere, so
            // the neon fallback rendered every time.
            expect(phantoms).toEqual([]);
        });

        /**
         * CLOSED, 2026-08-21 — this was a shrink-only backlog of NINE names and
         * it is now EMPTY, so this arm is hard-0 like the three above it.
         *
         * It existed for one run. The measurement was 62 references to 9
         * undeclared properties across 10 files in the Data workbench's
         * per-sub-panel TypeScript (--dw-border x30, --app-surface x14,
         * --app-surface-2 x7, --app-panel x4, --app-surface-hover x2, --dw-bg
         * x2, --app-hover, --dw-item-bg, --dw-purple). Unlike
         * --app-green/--app-amber/--app-red, every one carried a fallback, so
         * they DID render — the fallback simply WAS the value, and those
         * fallbacks were a divergent palette again (#e5e7eb, #f8fafc, #1e293b,
         * rgba(59,130,246,.08)). Each phantom's fallback is what identified the
         * token it was reaching for; the mapping was read off them, not invented.
         *
         * The list stays as an EMPTY array rather than being deleted, because
         * the two assertions below are what make it shrink-only in BOTH
         * directions: an unknown name fails, and a name listed here that is
         * already gone ALSO fails. Adding an entry to silence a new phantom is
         * therefore a visible, reviewable act — not a quiet baseline bump.
         */
        const PHANTOM_BACKLOG: ReadonlyArray<string> = [];

        it('the panels TypeScript introduces no NEW undeclared custom property', () => {
            // The phantoms did not live in CSS at all — they were emitted from
            // TypeScript as inline style strings, which is precisely why a
            // stylesheet-only scan missed them for as long as it did.
            const declared = declaredInTokens();
            const runtime = new Set(RUNTIME_PUBLISHED.map((r) => r.prop));
            const known = new Set(PHANTOM_BACKLOG);
            const dirs = [
                'apps/editor/src/ui/inspect/audit',
                'apps/editor/src/ui/dataworkbench',
                'apps/editor/src/ui/dataworkbench/buckets',
                'apps/editor/src/ui/data',
            ];
            const unknown: string[] = [];
            const stillPresent = new Set<string>();
            for (const dir of dirs) {
                const abs = join(REPO, dir);
                if (!existsSync(abs)) continue;
                for (const f of readdirSync(abs).sort()) {
                    if (!f.endsWith('.ts')) continue;
                    const body = stripComments(read(join(abs, f)));
                    for (const m of body.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
                        const prop = m[1]!;
                        if (declared.has(prop) || runtime.has(prop)) continue;
                        if (known.has(prop)) { stillPresent.add(prop); continue; }
                        unknown.push(`${dir}/${f}  var(${prop})`);
                    }
                }
            }
            expect(unknown).toEqual([]);
            // Shrink-only: the baseline may not list a name that is already gone,
            // so a fix is forced to update this list rather than leave it stale.
            const stale = PHANTOM_BACKLOG.filter((p) => !stillPresent.has(p));
            expect(stale, 'these are FIXED — remove them from PHANTOM_BACKLOG').toEqual([]);
        });

    });

    describe('ARM D — structure (shipped text only; no layout is performed)', () => {
        const dw = read(DATA_SHEET);

        it('the data-sheet label/value list is the house two-column grid', () => {
            // It was `flex-direction: column`, so labels stacked above values and
            // no two values shared an x. 108px is the same first column as
            // propertyInspector.ts `.dw-section-body`, which is what makes the
            // two surfaces read as one product.
            const rule = /\.dw-field-group\s*\{([^}]*)\}/.exec(dw)?.[1] ?? '';
            expect(rule).toContain('display: grid');
            expect(rule).toContain('grid-template-columns: 108px 1fr');
            const house = read(join(STYLES, 'panels/propertyInspector.ts'));
            expect(house).toContain('grid-template-columns: 108px 1fr');
        });

        it('the data sheet root and scroller are classes, not inline cssText', () => {
            // Inline lengths are invisible to uiScale.scaleCssText(), which
            // rewrites the INJECTED sheet only — so an inline `padding: 0 0 20px`
            // did not move with the ONE density lever while its neighbours did.
            expect(dw).toContain('.dw-sheet-root');
            expect(dw).toContain('.dw-sheet-scroll');
            const panel = read(join(REPO, 'apps/editor/src/ui/dataworkbench/DataSheetPanel.ts'));
            expect(panel).toContain("this._root.className = 'dw-sheet-root'");
            expect(panel).toContain("scroll.className = 'dw-sheet-scroll'");
            expect(panel).not.toContain('style.cssText = \'flex:1;overflow-y:auto');
        });

        it('the discovery legend reads the ramp instead of restating it', () => {
            // The legend gradient and the swatch colours were two independent
            // definitions of one encoding, and they disagreed. The swatch now
            // consumes the properties the ramp module publishes.
            const audit = read(join(INSPECT_DIR, 'auditStack.ts'));
            const swatch = /\.aud-discovery-legend-swatch\s*\{([^}]*)\}/.exec(audit)?.[1] ?? '';
            expect(swatch).toContain('--aud-ramp-from');
            expect(swatch).toContain('--aud-ramp-to');
            const zone = read(join(REPO, 'apps/editor/src/ui/inspect/audit/DiscoveryModeZone.ts'));
            expect(zone).toContain('publishDiscoveryRamp(legend)');
        });

        it('the sync-state colour table has exactly one definition', () => {
            // It was duplicated byte-for-byte in DataSheetPanel and
            // HierarchyTreePanel, so the two surfaces could drift apart silently.
            const dwDir = join(REPO, 'apps/editor/src/ui/dataworkbench');
            const copies = readdirSync(dwDir)
                .filter((f) => f.endsWith('.ts'))
                .filter((f) => /const\s+SYNC_COLOURS/.test(read(join(dwDir, f))));
            expect(copies).toEqual([]);
            expect(existsSync(join(dwDir, 'syncStateColours.ts'))).toBe(true);
        });
    });
});
