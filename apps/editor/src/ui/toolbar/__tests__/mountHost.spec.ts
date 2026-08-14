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

    it('FINDING 2b — buildToolbar() hides .plat-toolbar when that wrapper is absent', () => {
        const src = readFileSync(
            path.join(EDITOR_SRC, 'ui', 'platform', 'PlatformProjectBrowser.ts'), 'utf8');
        // The else-branch is the only reachable branch given 2a.
        expect(src).toMatch(/querySelector\('\.plat-left-panel'\)/);
        expect(src).toMatch(/this\.toolbar\.style\.display\s*=\s*'none'/);
        expect(src).toMatch(/document\.body\.appendChild\(this\.toolbar\)/);
    });

    it('FINDING 2c — shipped features DO inject into that hidden host (so the '
        + 'defect is real and not hypothetical)', () => {
        const injectors = [
            path.join(EDITOR_SRC, 'engine', 'initDataPlatform.ts'),
            path.join(EDITOR_SRC, 'ui', 'layout', 'CreatePanelLayout.ts'),
        ];
        for (const f of injectors) {
            const src = readFileSync(f, 'utf8');
            expect(src, `${path.basename(f)} no longer injects into .plat-toolbar`)
                .toMatch(/querySelector\('\.plat-toolbar'\)/);
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
