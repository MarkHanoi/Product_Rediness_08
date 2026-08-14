// §MT-05 — window-store same-instance guard (register row MT-05).
//
// engineLauncher.ts wires initPersistence with `window.columnStore ?? columnStoreInstance`
// and `window.curtainWallStore ?? curtainWallStoreInstance`. Divergence between the
// window global and the launcher-local instance is unreachable TODAY — every writer
// republishes the same instance — but nothing upstream enforces it, and a diverged
// instance would make persistence serialise a store the UI no longer writes (silent
// data loss). Enforcement is two-armed:
//
//   ARM 1 (runtime, engineLauncher.ts): an identity assertion immediately before
//     initPersistence throws loudly if a set global !== the local instance.
//     This spec pins that the assertion EXISTS and keeps its shape.
//
//   ARM 2 (this spec, CI): a writer pin. Every assignment site of
//     window.columnStore / window.curtainWallStore across the client tree is
//     enumerated and must equal the known allowlist. A future fourth writer goes
//     RED here — forcing its author to prove same-instance and update the pin
//     consciously — instead of silently diverging in a browser nobody is watching.
//
// Also pinned: both initPersistence fallbacks use `??` (nullish), never `||` —
// the two lines used to disagree (`??` vs `||`) for no reason; the register row
// documents both as `??`.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../..');

/** Assignment (not read/comparison) to the two guarded globals. `=(?!=)` excludes
 *  `==`/`===`/`!==`; the alternation catches compound-assignment forms. */
const WRITER_RE = /window\.(columnStore|curtainWallStore)\s*(?:=(?!=)|\|\|=|\?\?=|&&=)/g;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '__tests__', '__mocks__', 'coverage']);

/** Where a fourth writer could plausibly land in client code: the editor app,
 *  the transitional root src/, and every workspace src tree under packages/ + plugins/. */
function scanRoots(): string[] {
    const roots: string[] = ['apps/editor/src', 'src'];
    for (const group of ['packages', 'plugins']) {
        const groupAbs = join(REPO_ROOT, group);
        if (!existsSync(groupAbs)) continue;
        for (const entry of readdirSync(groupAbs, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const src = join(group, entry.name, 'src');
            if (existsSync(join(REPO_ROOT, src))) roots.push(src);
        }
    }
    return roots;
}

function* walkTs(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            yield* walkTs(join(dir, entry.name));
        } else if (
            entry.isFile()
            && /\.(ts|tsx)$/.test(entry.name)
            && !/\.(spec|test|d)\.tsx?$/.test(entry.name)
        ) {
            yield join(dir, entry.name);
        }
    }
}

function collectWriters(): Map<string, Set<string>> {
    // global name -> set of repo-relative POSIX paths that ASSIGN it
    const writers = new Map<string, Set<string>>([
        ['columnStore', new Set()],
        ['curtainWallStore', new Set()],
    ]);
    for (const root of scanRoots()) {
        const abs = join(REPO_ROOT, root);
        for (const file of walkTs(abs)) {
            const text = readFileSync(file, 'utf8');
            if (!text.includes('window.columnStore') && !text.includes('window.curtainWallStore')) continue;
            for (const m of text.matchAll(WRITER_RE)) {
                writers.get(m[1])!.add(relative(REPO_ROOT, file).replace(/\\/g, '/'));
            }
        }
    }
    return writers;
}

// The measured writer set (2026-08-14). If you are here because this went RED:
// you added a writer. That is allowed ONLY if it publishes the SAME instance the
// launcher wires into persistence (engineLauncher's §MT-05 guard will throw at
// bootstrap otherwise). Prove it, then extend this allowlist in the same commit.
const ALLOWED_WRITERS: Record<string, string[]> = {
    columnStore: [
        'apps/editor/src/engine/initBuilders.ts',
        'apps/editor/src/engine/initTools.ts',
        'apps/editor/src/engine/initUI.ts',
    ],
    curtainWallStore: [
        'apps/editor/src/engine/initBuilders.ts',
        'apps/editor/src/engine/initUI.ts',
    ],
};

const LAUNCHER = join(REPO_ROOT, 'apps/editor/src/engine/engineLauncher.ts');

describe('§MT-05 window-store same-instance guard', () => {
    // 60s budget: the walk covers ~4,200 files across apps/editor/src + every
    // packages/*/src + plugins/*/src, and this tree lives on OneDrive where cold
    // reads are slow. Measured warm: a few seconds.
    it('ARM 2 — the writer set is exactly the allowlist (a fourth writer goes RED here)', () => {
        const writers = collectWriters();
        for (const [name, allowed] of Object.entries(ALLOWED_WRITERS)) {
            const found = [...writers.get(name)!].sort();
            expect(found, `window.${name} writer set changed`).toEqual([...allowed].sort());
        }
    }, 60_000);

    it('ARM 1 — engineLauncher carries the runtime identity assertion before initPersistence', () => {
        const text = readFileSync(LAUNCHER, 'utf8');
        const guardIdx = text.indexOf('§MT-05 same-instance guard');
        const persistIdx = text.indexOf('initPersistence({');
        expect(guardIdx, 'the §MT-05 guard block was removed from engineLauncher').toBeGreaterThan(-1);
        expect(persistIdx).toBeGreaterThan(-1);
        expect(guardIdx, 'the §MT-05 guard must run BEFORE initPersistence').toBeLessThan(persistIdx);
        // The two identity comparisons + loud failure — not console.warn.
        expect(text).toMatch(/window\.columnStore !== columnStoreInstance/);
        expect(text).toMatch(/window\.curtainWallStore !== curtainWallStoreInstance/);
        expect(text).toMatch(/throw new Error\('\[EngineBootstrap\] §MT-05: window\.columnStore diverged/);
        expect(text).toMatch(/throw new Error\('\[EngineBootstrap\] §MT-05: window\.curtainWallStore diverged/);
    });

    it('fallbacks are nullish (`??`), never truthy (`||`) — the row documents both as `??`', () => {
        const text = readFileSync(LAUNCHER, 'utf8');
        expect(text).toContain('window.columnStore ?? columnStoreInstance');
        expect(text).toContain('window.curtainWallStore ?? curtainWallStoreInstance');
        expect(text, 'a `||` fallback regressed on a guarded store').not.toMatch(/window\.(columnStore|curtainWallStore)\s*\|\|/);
    });
});
