/**
 * §MEASURED-JOININTENT-PRODUCER-CENSUS (L-927)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THE CLAIM THIS FILE EXISTS TO FALSIFY.
 *
 * `CreateWallCommand.ts:415-444` stamps `joinIntent` under a comment asserting it is
 * *"the single element-creation chokepoint (C11), so it is captured identically for the
 * 3D tool, the plan tool, batch generators and AI — one path, not five."*
 *
 * **That claim was false when it was written.** L-923 proved the FIX works (stamping
 * `joinIntent` keeps the founder's mitre byte-identical); this census proves the fix was
 * only ever REACHING one producer out of several. The founder kept seeing the corrupted
 * joint because the path he actually draws on — the plan tool, and every batch generator
 * — never went through the site that stamps.
 *
 * WHY A SCANNING TEST AND NOT A HAND LIST (C69 rival-list rule).
 * A hand-written list of producers is exactly the artefact that produced the false
 * chokepoint claim in the first place: someone enumerated the paths they could think of.
 * So this test does not trust an enumeration — it DERIVES one, by scanning production
 * source for call sites of the only store method that can introduce a wall record, and
 * failing when it finds a site the ledger below does not classify.
 *
 * WHY `WallStore.add()` IS THE CORRECT DENOMINATOR.
 * `WallStore` (packages/geometry-wall/src/WallStore.ts) exposes exactly one mutator that
 * can introduce a record that was not already present:
 *   - `add(rawWall)`            — introduces. THE denominator.
 *   - `update(id, patch)`       — no-ops on a missing id.
 *   - `updateWall(wall)`        — `throw new Error('Wall ${id} not found')` on a missing id.
 *   - `addOpening` / `addDoor` / `addWindow` — mutate an EXISTING wall's children.
 *   - `remove` / `removeLevel` / `clear` — destructive.
 * So "every production site that creates a wall" == "every production call site of
 * `WallStore.add()`". That equivalence is asserted structurally in the first test below,
 * so this census cannot silently rot if a new introducing mutator is added later.
 *
 * SHRINK-ONLY. `UNSTAMPED_PRODUCERS` may only ever get smaller. A new unclassified
 * `wallStore.add()` site fails this suite immediately.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Repo root discovery (independent of which cwd vitest was launched from) ──────
function findRepoRoot(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error('[census] could not locate repo root (pnpm-workspace.yaml)');
}

const REPO = findRepoRoot();

/** Production source roots that could plausibly hold a wall producer. */
const SCAN_ROOTS = [
    'packages/command-registry/src',
    'packages/geometry-wall/src',
    'packages/runtime-composer/src',
    'packages/persistence-client/src',
    'packages/ai-host/src',
    'apps/editor/src',
    'plugins/wall/src',
];

const EXCLUDED_SEGMENTS = ['__tests__', 'node_modules', 'dist', '.tsbuildinfo'];

function walk(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDED_SEGMENTS.some(s => entry.name.includes(s))) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(entry.name)) out.push(full);
    }
    return out;
}

/**
 * Blank out comments AND string literals, preserving line numbering.
 *
 * Both are needed, and both were found empirically by this scanner's first run:
 *   - COMMENTS: `CreateWallsFromSlabCommand`, `WallTool` and `PreviewManager` all DISCUSS
 *     `wallStore.add()` in prose without calling it.
 *   - STRING LITERALS: `plugins/wall/src/handlers/CreateWall.ts` embeds the text
 *     `'WallStore.add() refuses rather than admit a wall onto a level…'` as a REFUSAL
 *     MESSAGE. Scanning raw text reports it as a producer; it is not one.
 */
function stripNonCode(src: string): string {
    const blankKeepingNewlines = (m: string) => m.replace(/[^\n]/g, ' ');
    return src
        .replace(/\/\*[\s\S]*?\*\//g, blankKeepingNewlines)   // block comments
        .replace(/(^|[^:/])\/\/[^\n]*/g, (_m, p1) => p1 + '')  // line comments
        .replace(/'(?:[^'\\\n]|\\.)*'/g, blankKeepingNewlines) // single-quoted
        .replace(/"(?:[^"\\\n]|\\.)*"/g, blankKeepingNewlines) // double-quoted
        .replace(/`(?:[^`\\]|\\.)*`/g, blankKeepingNewlines);  // template literals
}

/** Matches an `.add(` call on anything whose receiver names a wall store. */
const WALL_ADD_CALL = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.add\s*\(/g;

interface Site { file: string; line: number; receiver: string; }

function findWallAddSites(): Site[] {
    const sites: Site[] = [];
    for (const root of SCAN_ROOTS) {
        for (const file of walk(path.join(REPO, root))) {
            const raw = fs.readFileSync(file, 'utf8');
            const code = stripNonCode(raw);
            const lines = code.split('\n');
            lines.forEach((lineText, i) => {
                WALL_ADD_CALL.lastIndex = 0;
                let m: RegExpExecArray | null;
                while ((m = WALL_ADD_CALL.exec(lineText)) !== null) {
                    const receiver = m[1];
                    const tail = receiver.replace(/^.*\./, '');
                    // Receiver must name a WALL store specifically.
                    if (!/wallstore/i.test(tail)) continue;
                    // Exclude stores that are NOT the wall-record store:
                    //   curtainWallStore — a different element type (its own geometry pipeline)
                    //   wallSystemTypeStore — holds TYPE DEFINITIONS, not wall records
                    if (/curtainwall|systemtype/i.test(tail)) continue;
                    sites.push({
                        file: path.relative(REPO, file).replace(/\\/g, '/'),
                        line: i + 1,
                        receiver,
                    });
                }
            });
        }
    }
    return sites;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE LEDGER — every known production site that introduces a wall record.
// ═══════════════════════════════════════════════════════════════════════════════

/** Sites that create a GENUINELY NEW wall — these are the ones that must stamp. */
const PRODUCERS = {
    'packages/command-registry/src/walls/CreateWallCommand.ts':
        'The 3D WallTool path and the ProjectLoader restore path. STAMPS (lines 415-444).',
    'packages/command-registry/src/walls/CreateWallBetweenMarksCommand.ts':
        'Grid/mark-driven wall creation.',
    'packages/command-registry/src/operations/CopyElementCommand.ts':
        'Copy. Clones via serializeWallSnapshot = `{...wall}` spread ⇒ INHERITS the source stamp at a DIFFERENT location.',
    'packages/command-registry/src/operations/MirrorElementCommand.ts':
        'Mirror. Same `{...wall}` spread inheritance.',
    'packages/command-registry/src/operations/OffsetElementCommand.ts':
        'Offset. Same `{...wall}` spread inheritance.',
    'apps/editor/src/engine/initTools.ts':
        '§P2.1 `wall.created` bus→legacy-store bridge. THE PLAN TOOL AND EVERY `wall.batch.create` ' +
        'LAND HERE. Rebuilds the record from a FIELD WHITELIST rather than copying it.',
} as const;

/** Sites that RE-insert a record that already existed — they must PRESERVE, never re-derive. */
const RESTORERS = {
    'packages/command-registry/src/walls/DeleteElementCommand.ts':
        'undo() of a delete. Restores via deserializeWallSnapshot ⇒ preserves the original stamp. Correct.',
    'packages/command-registry/src/CommandManagerImpl.ts':
        'restoreSnapshot() rollback after a failed execute. Restores structuredClone\'d records. Correct.',
} as const;

/**
 * §SHRINK-ONLY. Producers that do NOT stamp a creation-context `joinIntent`.
 * This list may only ever get SHORTER. Deleting an entry is the fix; adding one is a regression.
 */
const UNSTAMPED_PRODUCERS: string[] = [
    'packages/command-registry/src/walls/CreateWallBetweenMarksCommand.ts',
    'packages/command-registry/src/operations/CopyElementCommand.ts',
    'packages/command-registry/src/operations/MirrorElementCommand.ts',
    'packages/command-registry/src/operations/OffsetElementCommand.ts',
    'apps/editor/src/engine/initTools.ts',
];

describe('§MEASURED-JOININTENT-PRODUCER-CENSUS (L-927)', () => {

    it('WallStore.add() is the ONLY mutator that can introduce a wall record — the denominator is sound', () => {
        const storeSrc = fs.readFileSync(
            path.join(REPO, 'packages/geometry-wall/src/WallStore.ts'), 'utf8',
        );

        // `updateWall` must refuse a record that is not already present, otherwise it
        // becomes a second introducing mutator and this census's denominator is wrong.
        expect(storeSrc).toMatch(/updateWall\s*\([\s\S]{0,400}?not found/);

        // `update` must likewise not create — it returns undefined on a missing id.
        const updateBody = storeSrc.slice(storeSrc.indexOf('update(wallId: string'));
        expect(updateBody.slice(0, 400)).toMatch(/if\s*\(!wall\)\s*return undefined/);
    });

    it('every production wallStore.add() site is classified — an unclassified site is a NEW unstamped producer', () => {
        const sites = findWallAddSites();
        const files = [...new Set(sites.map(s => s.file))].sort();

        const classified = new Set([...Object.keys(PRODUCERS), ...Object.keys(RESTORERS)]);
        const unclassified = files.filter(f => !classified.has(f));

        expect(
            unclassified,
            `\n\nA production site adds a wall to WallStore but is NOT in the L-927 census ledger.\n` +
            `If it creates a NEW wall it MUST stamp joinIntent (see CreateWallCommand / stampJoinIntent),\n` +
            `otherwise the founder's mitred corner dies the moment a third wall joins it.\n` +
            `Unclassified: ${JSON.stringify(unclassified, null, 2)}\n`,
        ).toEqual([]);

        // Every ledger entry must still be real — a stale ledger is as bad as a missing one.
        for (const f of Object.keys(PRODUCERS)) {
            expect(files, `ledger names ${f} but no wallStore.add() call site was found there`).toContain(f);
        }
    });

    it('PINS THE DENOMINATOR: how many wall producers stamp joinIntent', () => {
        const producerFiles = Object.keys(PRODUCERS);
        const total = producerFiles.length;
        const unstamped = UNSTAMPED_PRODUCERS.length;
        const stamped = total - unstamped;

        // eslint-disable-next-line no-console
        console.log(
            `\n§MEASURED-JOININTENT-PRODUCER-CENSUS (L-927)\n` +
            `  wall producers (new records) : ${total}\n` +
            `  STAMPED                      : ${stamped}\n` +
            `  UNSTAMPED                    : ${unstamped}\n` +
            `  restore-only (must preserve) : ${Object.keys(RESTORERS).length}\n` +
            UNSTAMPED_PRODUCERS.map(f => `    ✗ ${f}`).join('\n') + '\n',
        );

        // §SHRINK-ONLY ratchet.
        expect(
            unstamped,
            'UNSTAMPED_PRODUCERS grew. A new wall producer was added without stamping joinIntent.',
        ).toBeLessThanOrEqual(5);

        expect(stamped).toBeGreaterThanOrEqual(1);
    });

    it('the §P2.1 bridge rebuilds the wall from a FIELD WHITELIST — the mechanism that strips joinIntent', () => {
        const src = fs.readFileSync(path.join(REPO, 'apps/editor/src/engine/initTools.ts'), 'utf8');
        const addIdx = src.indexOf('_legacyWallStoreForBridge.add({');
        expect(addIdx, 'the §P2.1 wall.created bridge add() site moved — re-derive this census')
            .toBeGreaterThan(0);

        const literal = src.slice(addIdx, src.indexOf('} as any)', addIdx));

        // It is a whitelist, not a spread: this is WHY fields keep getting silently dropped
        // here. `materialColor`, `layers` and `curve` were each a separate founder-visible
        // defect fixed one field at a time; joinIntent is the same failure mode.
        expect(literal).not.toMatch(/\.\.\.ev[,\s}]/);
        expect(literal).toMatch(/materialColor/);
        expect(literal).toMatch(/layers/);
        expect(literal).toMatch(/curve/);
    });

    it('Copy/Mirror/Offset clone via a `{...wall}` spread — so they INHERIT a stale stamp', () => {
        const utils = fs.readFileSync(
            path.join(REPO, 'packages/command-registry/src/walls/wallSnapshotUtils.ts'), 'utf8',
        );
        // The spread is what carries joinIntent from the source wall onto a derived wall
        // that sits somewhere else entirely.
        expect(utils).toMatch(/serializeWallSnapshot[\s\S]{0,200}\.\.\.wall/);

        for (const f of [
            'packages/command-registry/src/operations/CopyElementCommand.ts',
            'packages/command-registry/src/operations/MirrorElementCommand.ts',
            'packages/command-registry/src/operations/OffsetElementCommand.ts',
        ]) {
            const src = fs.readFileSync(path.join(REPO, f), 'utf8');
            expect(src, `${f} should clone through the snapshot codec`)
                .toMatch(/deserializeWallSnapshot\s*\(\s*serializeWallSnapshot/);
        }
    });

    it('PERSISTENCE: joinIntent is absent from BOTH serializeWall whitelists — every save destroys every stamp', () => {
        const serializers = [
            'apps/editor/src/engine/persistence/ProjectSerializer.ts',
            'packages/persistence-client/src/loader/ProjectSerializer.ts',
        ];
        const missing: string[] = [];
        for (const f of serializers) {
            const src = fs.readFileSync(path.join(REPO, f), 'utf8');
            const i = src.indexOf('function serializeWall(');
            expect(i, `serializeWall not found in ${f}`).toBeGreaterThan(0);
            const body = src.slice(i, src.indexOf('\n}', i));
            if (!/joinIntent/.test(body)) missing.push(f);
        }

        // §SHRINK-ONLY: this MUST go to [] — a stamp that does not survive reload is worthless.
        // Documented as the widest breakage: it affects every project on every load.
        expect(missing.length).toBeLessThanOrEqual(2);
        // eslint-disable-next-line no-console
        console.log(`§MEASURED-JOININTENT-PERSISTENCE — serializers dropping joinIntent: ${missing.length}/2`);
    });
});
