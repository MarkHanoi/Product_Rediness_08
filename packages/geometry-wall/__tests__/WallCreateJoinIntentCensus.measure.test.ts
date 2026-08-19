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
 *
 * ⚠ KNOWN FLAKINESS SOURCE, recorded because it WAS observed (L-927, 2026-08-15). This
 * test reads the WORKING TREE, not a build artefact. Under a multi-agent fleet another
 * lane can write a file mid-scan, and the classification arm then fails once and passes on
 * re-run — which is exactly what happened here: one full-suite run reported an
 * unclassified producer, and both an isolated run and an immediate re-run were clean.
 *
 * So: on a failure of the classification arm, RE-RUN IT ALONE before believing it. A
 * genuine new producer reproduces; a concurrent write does not. Do not "fix" a transient
 * by widening the ledger — that would silently re-admit the defect this file exists to
 * catch. The trade is deliberate: scanning the tree is what lets this census find
 * producers nobody remembered to declare, and that is worth an occasional re-run.
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

/**
 * §SCANNER-BLIND-SPOT — producers this file's scanner CANNOT see, listed by hand because
 * a name-based scan structurally cannot reach them.
 *
 * `elementUndoStoreAdapter` is generic over element types: it resolves its target from
 * `buildUndoStoreMap()` (performUndoRedo.ts) at RUNTIME and calls `store.add(...)` through
 * a variable named `store`. No amount of receiver-name matching finds that, and pretending
 * otherwise would make this census claim a completeness it does not have.
 *
 * Found by an independent full-repo sweep, not by this scanner — which is the point of
 * running both. Recorded here so the denominator below is honest about its own method.
 *
 * Both sites are CORRECT under the L-927 design without any edit, and it is worth saying
 * why, because it is the argument for deriving at the store rather than at N call sites:
 *   - `:272` (redo of a create) prefers the legacy snapshot stashed at undo time, which
 *     CARRIES `joinIntent` ⇒ preserved by guard 1. When that stash is missing it falls
 *     back to the L1 DTO, which has none ⇒ the store re-derives against the state as it
 *     stands at redo time, which is by definition the pre-create neighbourhood — the same
 *     answer the original create got.
 *   - `:277` (`replace` on a missing id) inserts the DTO ⇒ same re-derivation.
 * A per-call-site stamping strategy would have had to find and patch both. Deriving at the
 * store covered them before anyone knew they existed.
 */
const SCANNER_BLIND_SPOT = {
    'apps/editor/src/engine/undo/elementUndoStoreAdapter.ts':
        'Generic undo/redo adapter — resolves the store at runtime via buildUndoStoreMap() and ' +
        'calls store.add() on a variable receiver. Two sites (redo-of-create; replace-when-absent).',
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

    // ⚠ L-994 (2026-08-19) — EXPLICIT TIMEOUT, and the reason matters more than the number.
    // This case walks every `.ts` under seven source roots (`findWallAddSites()`), which took
    // 6816 ms against vitest's 5000 ms default: the run died in the SCAN and the assertion
    // NEVER EXECUTED. It then reported itself with this test's name — "a NEW unstamped
    // producer" — a defect class nothing had measured. That is the §CONTEXT-DATA-HONESTY
    // shape at the harness level: a timeout and a finding printed as the same failure.
    // 60 s is a ceiling for a filesystem walk on a cold cache, NOT a performance budget.
    // ⛔ If this times out again, the fix is the SCAN or the ceiling — never the ledger.
    it('every production wallStore.add() site is classified — an unclassified site is a NEW unstamped producer', { timeout: 60_000 }, () => {
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

        // §L-927 RESOLUTION — the derivation moved DOWN to `WallStore.add()`, which every
        // producer necessarily calls, so ALL of them are now covered at one site. The
        // per-producer list is kept (not deleted) because it is the evidence of what the
        // "single chokepoint" claim was actually worth, and because a future producer that
        // bypasses the store entirely would still have to be classified here.
        const unstamped = UNSTAMPED_PRODUCERS.length;
        const stamped = total - unstamped;

        // eslint-disable-next-line no-console
        console.log(
            `\n§MEASURED-JOININTENT-PRODUCER-CENSUS (L-927)\n` +
            `  wall producers (new records)   : ${total}\n` +
            `  stamping AT THEIR OWN CALL SITE: ${stamped}\n` +
            `  relying on the store chokepoint: ${unstamped}\n` +
            `  restore-only (must preserve)   : ${Object.keys(RESTORERS).length}\n` +
            `  scanner blind spots (by hand)  : ${Object.keys(SCANNER_BLIND_SPOT).length}\n` +
            `  ── covered by WallStore.add()  : ALL of the above\n`,
        );

        // §SHRINK-ONLY ratchet on the per-call-site list.
        expect(
            unstamped,
            'UNSTAMPED_PRODUCERS grew. A new wall producer was added without stamping joinIntent.',
        ).toBeLessThanOrEqual(5);
    });

    it('THE CHOKEPOINT IS REAL: WallStore.add() derives joinIntent, so every producer is covered', () => {
        // This is the assertion that makes the census's conclusion checkable rather than
        // narrated. If the derivation is ever moved back out of the store into N call
        // sites, this fails — and the "1 of 6" defect is back by construction.
        const storeSrc = fs.readFileSync(
            path.join(REPO, 'packages/geometry-wall/src/WallStore.ts'), 'utf8',
        );
        const addBody = storeSrc.slice(
            storeSrc.indexOf('add(rawWall: WallData)'),
            storeSrc.indexOf('// Clone and freeze'),
        );
        expect(addBody).toMatch(/deriveJoinIntent/);
        // Guard 1: an explicit (persisted / restored) intent must win over derivation.
        expect(addBody).toMatch(/wall\.joinIntent\s*!==\s*undefined/);
        // Guard 2: loading must not derive — file order and untrimmed baselines are not
        // the authoring neighbourhood, so a derivation there is a guess.
        expect(addBody).toMatch(/_hydrating/);

        // The derivation lives in exactly ONE module.
        const stampSrc = fs.readFileSync(
            path.join(REPO, 'packages/geometry-wall/src/WallJoinIntentStamp.ts'), 'utf8',
        );
        expect(stampSrc).toMatch(/export function deriveJoinIntent/);

        // …and CreateWallCommand no longer derives its own — it only FORWARDS a persisted one.
        const cmdSrc = fs.readFileSync(
            path.join(REPO, 'packages/command-registry/src/walls/CreateWallCommand.ts'), 'utf8',
        );
        expect(cmdSrc).toMatch(/joinIntent:\s*this\.wallData\.joinIntent/);
        expect(cmdSrc, 'CreateWallCommand must not re-derive intent — one derivation site only')
            .not.toMatch(/committedEndpointsAt/);
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

    it('PERSISTENCE: BOTH serializeWall whitelists carry joinIntent — HARD-0, a save must not destroy a stamp', () => {
        // WAS 2/2 DROPPING at the start of L-927 — the widest breakage of the lot, since it
        // hit every project on every load: the stamp was computed correctly at creation and
        // then thrown away by the next save. `WallJoinIntentChokepointPayoff` measures the
        // consequence directly (drop the field, and the founder's mitre reverts to square
        // caps purely from a reload), so this is a hard 0, not a ratchet.
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
        expect(missing, 'a serializer dropped joinIntent — the stamp will not survive reload').toEqual([]);
    });

    it('PERSISTENCE: all THREE loaders restore the persisted stamp instead of re-deriving it', () => {
        // Three restore paths, and the one the lane brief did not name —
        // `ImportProjectCommand` — is the DEFAULT (`_useImportCommandPath()` returns true).
        // A field threaded through two of three is the same silent-divergence bug the
        // serializer twins already carry a warning comment about.
        const loaders = [
            'packages/command-registry/src/project/ImportProjectCommand.ts',
            'apps/editor/src/engine/persistence/ProjectLoader.ts',
            'packages/persistence-client/src/loader/ProjectLoader.ts',
        ];
        for (const f of loaders) {
            const src = fs.readFileSync(path.join(REPO, f), 'utf8');
            expect(src, `${f} must forward the persisted joinIntent into CreateWallCommand`)
                .toMatch(/joinIntent:\s*\(wall as/);
        }

        // And the two that own the replay loop must suppress DERIVATION while doing it,
        // so a legacy snapshot is not assigned a guess made from file order.
        for (const f of [
            'packages/command-registry/src/project/ImportProjectCommand.ts',
            'apps/editor/src/engine/persistence/ProjectLoader.ts',
        ]) {
            const src = fs.readFileSync(path.join(REPO, f), 'utf8');
            expect(src, `${f} must wrap the wall replay in hydration`).toMatch(/beginHydration/);
            expect(src, `${f} must release hydration in a finally`).toMatch(/_endHydration\?\.\(\)/);
        }
    });
});
