// §MT-05 — window-store WRITER pin (register row MT-05).
//
// ⚠ READ THIS BEFORE TRUSTING THIS FILE. It pins STRINGS. It reads source as
// text and cannot observe a single object on the heap. That limitation is why
// the MT-05 register row stayed UNPROVEN while this spec passed 3/3.
//
// THE HEAP PROOF LIVES NEXT DOOR: `mt05StoreIdentityHeap.spec.ts` asserts with
// `toBe` that the object the StoreRegistry holds IS the object
// ProjectSerializer read, across all 15 shared kinds, through the real
// production hand-off. That file is the proof of ADR-0318 I-1. This one is a
// perimeter fence around the legacy globals, and nothing more.
//
// ─── What changed 2026-08-16 ────────────────────────────────────────────────
// The SERIALIZER half of MT-05 is CLOSED BY CONSTRUCTION. engineLauncher no
// longer passes `window.columnStore ?? columnStoreInstance` (and the curtain
// twin) to initPersistence; it builds ONE `authoritativeStores` record and
// derives both the registry bundle and the serializer bundle from it
// (`apps/editor/src/engine/authoritativeStores.ts`). There is no longer an
// expression on the persistence path whose value could differ from the one the
// registry holds — so the third test below, which used to pin those two `??`
// fallbacks as present, now pins them as ABSENT.
//
// What is NOT closed, and is what this file still guards: ~40 legacy readers
// (PropertyInspector, SpatialTree, the plan tools, ScheduleExtractor,
// ExportIFC, AIReadModel, BeamStore …) still resolve their store through
// `window.columnStore` / `window.curtainWallStore` — the TASK-08 debt. If a
// writer publishes a DIFFERENT instance there, the UI edits one store while
// the registry and the serializer hold another. Two arms:
//
//   ARM 1 (runtime, engineLauncher.ts): an identity assertion at the end of
//     bootstrap throws loudly if a set global !== the launcher instance.
//     This spec pins that the assertion EXISTS and keeps its shape.
//
//   ARM 2 (this spec, CI): a writer pin. Every assignment site of
//     window.columnStore / window.curtainWallStore across the client tree is
//     enumerated and must equal the known allowlist. A future fourth writer goes
//     RED here — forcing its author to prove same-instance and update the pin
//     consciously — instead of silently diverging in a browser nobody is watching.

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

// The measured writer set (re-measured 2026-08-16, unchanged). If you are here
// because this went RED: you added a writer. That is allowed ONLY if it publishes
// the SAME instance the launcher holds (engineLauncher's §MT-05 guard will throw
// at bootstrap otherwise). Prove it, then extend this allowlist in the same commit.
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

    it('the serializer hand-off reads NO mutable global — the `??` fallbacks are gone', () => {
        // Comments AND string literals are stripped first. Both were measured
        // false positives on the first two runs of this check: engineLauncher's
        // §MT-05 block QUOTES the deleted expression while explaining why it was
        // deleted (comment), and the guard's own `throw new Error('… window
        // .columnStore diverged …')` names the global (string). A scanner that
        // counts its own documentation and its own error messages as code is the
        // P4 "52% prose" defect — the cure is to read code, not to stop writing
        // the prose.
        const text = readFileSync(LAUNCHER, 'utf8')
        // ⛔ CRLF FIRST, and this line is load-bearing. `/\/\/.*$/` without the `m` flag
        // anchors `$` at END OF STRING, and `.` never matches a carriage return - so on a working tree
        // where the file happens to be checked out CRLF (`.gitattributes` says `eol=lf`,
        // but a local editor can and does rewrite it) EVERY `//` comment survived the
        // strip and this scanner counted its own documentation. That is the same
        // comment-blindness §RAF-GATE-COMMENT-BLIND records, arriving through a line
        // ending instead of a missing flag, and it made a passing engineLauncher read RED
        // on one machine and GREEN on CI — the worst failure direction, because whichever
        // reading you trust the other one is invisible.
            .replace(/\r\n/g, '\n')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
            .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
            .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
            .replace(/`(?:[^`\\]|\\.)*`/g, '``');

        expect(
            text,
            'a `window.columnStore ??` fallback was reintroduced — that is the MT-05 hazard: '
            + 'the registry and the serializer would hold different objects. Pass '
            + 'columnStoreInstance through the authoritativeStores record instead.',
        ).not.toMatch(/window\.columnStore\s*\?\?/);
        expect(
            text,
            'a `window.curtainWallStore ??` fallback was reintroduced',
        ).not.toMatch(/window\.curtainWallStore\s*\?\?/);
        expect(
            text,
            'a `||` fallback appeared on a guarded store — `||` also substitutes on falsy, '
            + 'which is how `window.curtainWallStore || {}` used to hand commands an EMPTY '
            + 'OBJECT that reads as "no curtain walls" (C70 L-INV-1 silence)',
        ).not.toMatch(/window\.(columnStore|curtainWallStore)\s*\|\|/);

        // The only surviving uses are the two guard comparisons.
        const reads = [...text.matchAll(/window\.(columnStore|curtainWallStore)/g)];
        expect(
            reads.length,
            'engineLauncher should touch these globals exactly 4 times — two `!== undefined` '
            + 'checks and two `!== <instance>` comparisons, all inside the §MT-05 guard',
        ).toBe(4);
    });
});
