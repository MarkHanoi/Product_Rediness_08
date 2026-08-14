// §L-MOUNT PHASE 2 — WHY THE FAMILY WAS NOT BLIND-MOUNTED.
//
// The Phase-2 brief said: "find how a surface gets mounted today (the shipped
// Data workbench / the legacy `src/ui` toolbar are your references — the legacy
// one is what users see now)". BOTH references are stale, and this file is the
// executed proof, because "I read the code and it looked wrong" is not evidence
// and the whole point of this lane is that authored ≠ reachable.
//
// FINDING 1 — repo-root `src/ui/` does not exist. The "legacy toolbar users see
// now" has no files. (`vitest.config.ts` §L-851 already recorded the same stale
// path costing 72 spec files their execution.)
//
// FINDING 2 — the one host the shipped code injects toolbar chrome into,
// `.plat-toolbar`, is created by PlatformProjectBrowser.buildToolbar() and is
// appended to `document.body` with `display:none` UNLESS a `.plat-left-panel`
// wrapper exists. No file in the tree CREATES `.plat-left-panel` — Layout.ts,
// which owns the shell markup, contains no `plat-` markup at all. So the
// else-branch is the only branch, and every feature injected into
// `.plat-toolbar` — the Data workbench button and physics dropdown
// (initDataPlatform.ts), the ActiveLevelHUD slot (CreatePanelLayout.ts) —
// is injected into a hidden node.
//
// Mounting the toolbar family there would have satisfied `surfaceMounted`
// (static import evidence) while remaining invisible to every user: L-847
// reproduced, with the probe's own caveat (e) — "surfaceMounted is STATIC
// import evidence, not a rendered-DOM proof" — as the epitaph. So Phase 2
// STOPPED and reported rather than mount into an unproven host.
//
// This file is a LIVE tripwire, not a note: if someone creates
// `.plat-left-panel` (making the host real) or repoints the injections, these
// tests fail and the mount question must be re-opened with fresh measurement.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import * as path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REPO = path.resolve(HERE, '..', '..', '..', '..', '..', '..');
const EDITOR_SRC = path.join(REPO, 'apps', 'editor', 'src');

function* walk(dir: string): Generator<string> {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
        if (e === 'node_modules' || e === 'dist' || e === '__tests__') continue;
        const abs = path.join(dir, e);
        let st; try { st = statSync(abs); } catch { continue; }
        if (st.isDirectory()) yield* walk(abs);
        else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) yield abs;
    }
}

describe('§L-MOUNT Phase 2 — the mount hosts the brief named are stale', () => {
    it('FINDING 1 — repo-root src/ui/ (the "legacy toolbar") does not exist', () => {
        expect(existsSync(path.join(REPO, 'src', 'ui'))).toBe(false);
    });

    it('FINDING 2a — no file CREATES a .plat-left-panel element', () => {
        const creators: string[] = [];
        for (const abs of walk(EDITOR_SRC)) {
            const src = readFileSync(abs, 'utf8');
            // creation, not lookup: a className assignment or authored markup.
            if (/className\s*=\s*['"`][^'"`]*plat-left-panel/.test(src)
                || /class=["'][^"']*plat-left-panel/.test(src)) {
                creators.push(path.relative(REPO, abs).replace(/\\/g, '/'));
            }
        }
        expect(creators, 'a .plat-left-panel creator appeared — the hidden-host '
            + 'finding may no longer hold; RE-MEASURE before mounting anything').toEqual([]);
    }, 60_000);

    it('FINDING 2b — §L-MOUNT-DETACH: buildToolbar() NEVER attaches .plat-toolbar to '
        + 'the document when the wrapper is absent — detached, not display:none', () => {
        // HISTORY, all three states, so the next reader does not re-litigate:
        //   1. originally `display:none` + a hidden body-append — the DEFECT this
        //      file was written to pin (three features injecting into a node
        //      nobody could see: the L-847 shape).
        //   2. `0926167c` made it a VISIBLE body-append. The founder saw the
        //      result: `position:fixed; top:0; left:50%` + `flex-direction:column`
        //      stacked every injected feature down the MIDDLE of the viewport.
        //   3. now DETACHED (founder decision, 2026-08-14).
        //
        // ⚠ The assertion is `not body.appendChild`, NOT `display:none`, and the
        // distinction is the whole point. A hidden-but-ATTACHED node still
        // matches `document.querySelector('.plat-toolbar')`, so the ActiveLevelHUD
        // would mount into an invisible slot and the "Ground" pill would vanish.
        // Detached ⇒ the selector returns null ⇒ every injector takes the null
        // branch 2c proves it has. Re-introducing either the body-append or a
        // display:none-and-attached node fails here.
        const src = readFileSync(
            path.join(EDITOR_SRC, 'ui', 'platform', 'PlatformProjectBrowser.ts'), 'utf8');
        expect(src, 'the left-panel branch is retained for the day the wrapper returns')
            .toMatch(/querySelector\('\.plat-left-panel'\)/);
        expect(src, 'the toolbar must NOT be appended to the body — it is detached')
            .not.toMatch(/document\.body\.appendChild\(this\.toolbar\)/);
        expect(src, 'display:none would keep the node ATTACHED and matching the '
            + "injectors' selector — that is the trap, not the fix")
            .not.toMatch(/this\.toolbar\.style\.display\s*=\s*'none'/);
    });

    it('FINDING 2c — every .plat-toolbar injector has a NULL branch, which is what '
        + 'makes the host removable at all', () => {
        // This is the invariant §L-MOUNT-DETACH rests on. Each injector looks the
        // host up by selector; with the host detached the lookup returns null, so
        // each MUST already handle null — the HUD by falling back to its canvas
        // mount (#alh-hud-mount, Layout.ts), the other two by skipping.
        // An injector that appended unconditionally would throw on a null host.
        const cases: Array<{ file: string; guard: RegExp; note: string }> = [
            {
                file: path.join(EDITOR_SRC, 'ui', 'layout', 'CreatePanelLayout.ts'),
                guard: /getElementById\('alh-hud-mount'\)/,
                note: 'ActiveLevelHUD must fall back to the canvas overlay, or the '
                    + 'Ground pill disappears with the bar',
            },
            {
                file: path.join(EDITOR_SRC, 'engine', 'initDataPlatform.ts'),
                guard: /if\s*\(\s*platToolbar\s*&&/,
                note: 'the Data button + physics dropdown must skip on a null host',
            },
            {
                file: path.join(EDITOR_SRC, 'ui', 'canvas', 'VoiceCommandIndicator.ts'),
                guard: /if\s*\(\s*!toolbar\b/,
                note: 'the voice indicator must skip on a null host',
            },
        ];
        for (const { file, guard, note } of cases) {
            const src = readFileSync(file, 'utf8');
            expect(src, `${path.basename(file)} no longer looks up .plat-toolbar`)
                .toMatch(/querySelector\('\.plat-toolbar'\)/);
            expect(src, `${path.basename(file)}: ${note}`).toMatch(guard);
        }
    });

    it('none of the 30 toolbar surfaces is imported by production code (H6 mount '
        + 'column, re-measured here so this file fails the moment one IS)', () => {
        const TOOLBAR_DIR = path.join(EDITOR_SRC, 'ui', 'toolbar');
        const surfaces = readdirSync(TOOLBAR_DIR)
            .filter((f) => /Toolbar\.ts$/.test(f))
            .map((f) => f.replace(/\.ts$/, ''));
        expect(surfaces.length).toBe(30);
        const importers: string[] = [];
        for (const abs of walk(EDITOR_SRC)) {
            if (abs.replace(/\\/g, '/').includes('/ui/toolbar/')) continue;
            const src = readFileSync(abs, 'utf8');
            for (const s of surfaces) {
                if (src.includes(`toolbar/${s}`)) {
                    importers.push(`${path.relative(REPO, abs).replace(/\\/g, '/')} → ${s}`);
                }
            }
        }
        // NOT a "must stay zero" assertion — it is a CHANGE DETECTOR. When a
        // surface is mounted this fails, and whoever mounts it must re-run H6
        // and record the new EXECUTED-REACHED / NOT-REACHED split here.
        expect(importers, 'a toolbar surface gained a production importer — re-run '
            + 'the H6 probe and update this pin with the new reachability split').toEqual([]);
        // 60 s: this walks + reads every .ts under apps/editor/src (~12 s on an
        // idle machine, more under a loaded fleet). The default 10 s made the
        // test flaky-red on load, which is the worst failure mode a tripwire can
        // have — it teaches people to ignore it.
    }, 60_000);
});
