#!/usr/bin/env tsx
/**
 * Gate G-NEW-05: structuredClone undo snapshots in packages/command-registry/
 * must not increase above the baseline.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §4 Gate P0-G5
 * OI-050
 *
 * New commands MUST use `produceWithPatches` (Immer) for undo, NOT `structuredClone`.
 * The existing 144 uses are all in the legacy CommandManager.ts path; they are
 * eliminated one-by-one as Phase E.undo migrates each command class to a handler.
 *
 * Ratchet direction: downward — hard-fail on any increase above CEILING.
 * The gate specifically guards against NEW commands being written with structuredClone.
 *
 * Exclusions: CommandManager.ts (contains the existing legacy snapshot implementations).
 *
 * Baseline 2026-05-16: 144 sites (excluding CommandManager.ts)
 * Target: 0 (Phase E.undo completes)
 *
 * IMPORTANT: If you are writing a new command handler, use produceWithPatches:
 *   const [, patches, inverse] = produceWithPatches(store.getAll(), draft => { ... });
 *   ctx.undoStack.push({ forward: patches, inverse, affectedStores: ['xStore'] });
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/structuredclone-commands.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.STRUCTUREDCLONE_CEILING ?? '157', 10);

function count(): number {
    let out: string;
    try {
        out = execSync(
            `rg -c "structuredClone" packages/command-registry/src --type ts --glob '!**/CommandManager.ts' | awk -F: '{s+=$2} END {print s+0}'`,
            { encoding: 'utf8', cwd: REPO_ROOT, shell: '/bin/bash' },
        );
    } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 1) return 0;
        throw err;
    }
    return parseInt(out.trim() || '0', 10);
}

function loadBaseline(): number {
    if (!existsSync(BASELINE_FILE)) return CEILING;
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count ?? CEILING;
}

function writeBaseline(n: number): void {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
            {
                count: n,
                ratchedAt: new Date().toISOString(),
                comment:
                    'G-NEW-05: structuredClone uses in packages/command-registry/ (excl CommandManager.ts). ' +
                    'Target: 0 (Phase E.undo). ' +
                    'New commands must use produceWithPatches — structuredClone undo PROHIBITED for new code. ' +
                    'Use STRUCTUREDCLONE_CEILING env var to step ceiling down per sprint.',
            },
            null,
            2,
        ) + '\n',
    );
}

function main(): number {
    const current  = count();
    const baseline = loadBaseline();

    if (current > CEILING) {
        console.error(
            `[structuredclone-commands] FAIL: ${current} structuredClone uses in command-registry/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: new commands must use produceWithPatches (Immer) for undo snapshots. ' +
            'See docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5 Phase E.undo',
        );
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[structuredclone-commands] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(
            `  ${current - baseline} new structuredClone use(s) added to command-registry/ — PROHIBITED.`,
        );
        console.error(
            '  New command handlers must use produceWithPatches, not structuredClone.',
        );
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(`[structuredclone-commands] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
        } else {
            writeBaseline(current);
            console.log(`[structuredclone-commands] OK: ${current} (ratchet lowered ${baseline} → ${current}).`);
        }
    } else {
        console.log(`[structuredclone-commands] OK: ${current} / ${CEILING}`);
    }
    return 0;
}

process.exit(main());
