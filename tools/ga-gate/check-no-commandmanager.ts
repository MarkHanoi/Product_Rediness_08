#!/usr/bin/env tsx
/**
 * Phase 2 Task 2.1 — commandManager.execute() + alias ratchet (monotonic gate).
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md §4
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §E.5
 * OI-046 complete 2026-05-16 — all three alias loopholes closed.
 *
 * Hard-fail if ANY of the three counters rises above its ceiling:
 *
 *   A) LITERAL  — commandManager.execute() anywhere in apps/editor/src/
 *      Ceiling: 0 (hard-fail — already migrated).  Any value > 0 = regression.
 *
 *   B) WINDOW   — cmdMgr.execute + window.commandManager references
 *      in apps/editor/src/ (excludes initBusHandlers.ts which is the
 *      intentional bridge between the typed bus and the legacy cmdMgr).
 *      Ceiling: CMDMGR_WINDOW_CEILING (env-override; ratchets down).
 *      2026-05-16 post-E.5.4 actual: 2 (both context-reads, not executes).
 *
 *   C) CM_EXEC  — cm.execute() calls in apps/editor/src/ that escape the
 *      window.commandManager scan — the most common alias pattern.
 *      Excludes initBusHandlers.ts (the sole authorised bridge file).
 *      Ceiling: CMDMGR_CM_EXEC_CEILING (env-override; ratchets down).
 *      2026-05-16 post-E.5.4 actual: 49 (migration backlog for E.5.5+).
 *
 * Baseline file: .ga-gate/baselines/no-commandmanager.json
 * --no-ratchet  : skip the auto-lower write (CI mode).
 *
 * Count methodology:
 *   Literal:  rg "commandManager\.execute" apps/editor/src --type ts
 *             | grep -v "//" | wc -l
 *   Window:   rg "cmdMgr\.execute\b|window\.commandManager\b" apps/editor/src
 *             --type ts --glob '!path-to-initBusHandlers' | grep -v "//" | wc -l
 *             (initBusHandlers.ts excluded — authorised bridge)
 *   CmExec:   rg "\bcm\.execute\b" apps/editor/src --type ts
 *             --glob '!path-to-initBusHandlers' | grep -v "//" | wc -l
 *             (initBusHandlers.ts excluded — authorised bridge)
 *
 * Trajectory (WINDOW + CM_EXEC combined — Phase E.5.x):
 *   2026-05-16 baseline E.5.2     :  111  (cmdMgr.execute + window.commandManager only;
 *                                          cm.execute was not yet tracked → loophole)
 *   OI-046 fix 2026-05-16         :  WINDOW=2, CM_EXEC=49
 *                                    (both tracked separately after E.5.4 plantools migration)
 *   E.5.5 (UI panels batch 1)     :  CM_EXEC ≤ 30  (OverridePanel, ViewsRailPanel, RadialMenu,
 *                                                    HeaderIntentPicker, SpineOverrideList)
 *   E.5.6 (UI panels batch 2)     :  CM_EXEC ≤ 15  (DataWorkbench tree + HierarchyTree actions)
 *   E.5.7 (remaining UI + plantools): CM_EXEC ≤ 5  (ViewPropertiesPanel, SheetEditor,
 *                                                    WindowPlanToolHandler, DoorPlanToolHandler)
 *   E.5.8 (final cleanup)         :  CM_EXEC = 0
 *   WINDOW target                 :  0  (2 context-read-only refs — migrate when stores typed)
 */
import { execSync }                                from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve }                        from 'node:path';

const REPO_ROOT      = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE  = resolve(REPO_ROOT, '.ga-gate/baselines/no-commandmanager.json');
const NO_RATCHET     = process.argv.includes('--no-ratchet');

/**
 * Hard ceiling for commandManager.execute() LITERAL calls.
 * Already migrated to 0. Any regression = hard-fail; ceiling NEVER raised.
 */
const LITERAL_CEILING = 0;

/**
 * Ceiling for WINDOW alias patterns (cmdMgr.execute + window.commandManager).
 * Excludes initBusHandlers.ts (intentional bridge, not a migration target).
 * Post-E.5.4 actual: 2 (context-reads; target: 0 when stores are typed).
 */
const WINDOW_CEILING = parseInt(process.env.CMDMGR_WINDOW_CEILING ?? '2', 10);

/**
 * Ceiling for CM_EXEC pattern (cm.execute in apps/editor/src/ excl. bridge).
 * Post-E.5.4 actual: 49 (migration backlog — decreases per E.5.5+ sprint).
 * Override via CMDMGR_CM_EXEC_CEILING env var to step down per-sprint.
 */
const CM_EXEC_CEILING = parseInt(process.env.CMDMGR_CM_EXEC_CEILING ?? '49', 10);

function execCount(cmd: string): number {
    let out: string;
    try {
        out = execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT, shell: '/bin/bash' });
    } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 1) return 0;
        throw err;
    }
    return parseInt(out.trim() || '0', 10);
}

/** A) commandManager.execute() literal — hard-fail ceiling 0. */
function countLiteral(): number {
    return execCount(
        `rg "commandManager\\.execute" apps/editor/src --type ts | grep -v "//" | wc -l`,
    );
}

/**
 * B) cmdMgr.execute + window.commandManager — the original alias patterns.
 * Excludes initBusHandlers.ts (authorised bridge) and the globals.d.ts declaration.
 */
function countWindow(): number {
    return execCount(
        `rg "cmdMgr\\.execute\\b|window\\.commandManager\\b" apps/editor/src --type ts` +
        ` --glob '!**/initBusHandlers.ts' --glob '!**/globals.d.ts' | grep -v "//" | wc -l`,
    );
}

/**
 * C) cm.execute() — the most common alias pattern that previously escaped detection.
 * Excludes initBusHandlers.ts (authorised legacy bridge) and globals.d.ts.
 */
function countCmExecute(): number {
    return execCount(
        `rg "\\bcm\\.execute\\b" apps/editor/src --type ts` +
        ` --glob '!**/initBusHandlers.ts' --glob '!**/globals.d.ts' | grep -v "//" | wc -l`,
    );
}

interface Baseline {
    windowCount:    number;
    cmExecuteCount: number;
}

function loadBaseline(): Baseline {
    if (!existsSync(BASELINE_FILE)) {
        return { windowCount: WINDOW_CEILING, cmExecuteCount: CM_EXEC_CEILING };
    }
    const data = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    return {
        windowCount:    data.windowCount    ?? data.aliasCount ?? WINDOW_CEILING,
        cmExecuteCount: data.cmExecuteCount ?? CM_EXEC_CEILING,
    };
}

function writeBaseline(windowCount: number, cmExecuteCount: number): void {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
            {
                windowCount,
                cmExecuteCount,
                ratchedAt: new Date().toISOString(),
                comment:
                    'OI-046 complete 2026-05-16. Three-counter gate: (A) literal=0 hard-fail, ' +
                    '(B) window alias (cmdMgr.execute+window.commandManager excl. bridge) ratchet, ' +
                    '(C) cm.execute excl. initBusHandlers.ts ratchet. ' +
                    'Trajectory: WINDOW 2→0, CM_EXEC 49→30→15→5→0 per Phase E.5.5–E.5.8.',
            },
            null,
            2,
        ) + '\n',
    );
}

function checkCounter(
    label:   string,
    current: number,
    ceiling: number,
    baseline: number,
    failed:  boolean,
): boolean {
    if (current > ceiling) {
        console.error(
            `[no-commandmanager] FAIL (${label}): ${current} exceeds CEILING ${ceiling}.`,
        );
        console.error(
            `  Fix: migrate to window.runtime?.bus?.executeCommand() per` +
            ` docs/03_PRYZM3/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §E.5`,
        );
        return true;
    }
    if (current > baseline) {
        console.error(
            `[no-commandmanager] FAIL (${label} ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(
            `  ${current - baseline} new ${label} call(s) introduced — ratchet regression.`,
        );
        return true;
    }
    return false;
}

function main(): number {
    const literal   = countLiteral();
    const window_   = countWindow();
    const cmExecute = countCmExecute();
    const baseline  = loadBaseline();
    let failed = false;

    // A) Literal — hard-fail
    if (literal > LITERAL_CEILING) {
        console.error(
            `[no-commandmanager] FAIL (literal): commandManager.execute = ${literal}` +
            ` exceeds LITERAL_CEILING ${LITERAL_CEILING} — hard regression.`,
        );
        console.error(
            '  Fix: migrate to runtime.bus.executeCommand() per' +
            ' docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5',
        );
        failed = true;
    } else {
        console.log(`[no-commandmanager] OK (literal): ${literal} / ${LITERAL_CEILING}`);
    }

    // B) Window alias ratchet
    const windowFailed = checkCounter('window', window_, WINDOW_CEILING, baseline.windowCount, failed);
    if (!windowFailed) {
        if (window_ < baseline.windowCount) {
            if (NO_RATCHET) {
                console.log(
                    `[no-commandmanager] OK (window): ${window_}` +
                    ` (would ratchet ${baseline.windowCount} → ${window_}; --no-ratchet active).`,
                );
            } else {
                console.log(
                    `[no-commandmanager] OK (window): ${window_}` +
                    ` (ratchet lowered ${baseline.windowCount} → ${window_}).`,
                );
            }
        } else {
            console.log(`[no-commandmanager] OK (window): ${window_} / ${WINDOW_CEILING}`);
        }
    }
    failed = failed || windowFailed;

    // C) cm.execute ratchet
    const cmFailed = checkCounter('cm.execute', cmExecute, CM_EXEC_CEILING, baseline.cmExecuteCount, failed);
    if (!cmFailed) {
        if (cmExecute < baseline.cmExecuteCount) {
            if (NO_RATCHET) {
                console.log(
                    `[no-commandmanager] OK (cm.execute): ${cmExecute}` +
                    ` (would ratchet ${baseline.cmExecuteCount} → ${cmExecute}; --no-ratchet active).`,
                );
            } else {
                console.log(
                    `[no-commandmanager] OK (cm.execute): ${cmExecute}` +
                    ` (ratchet lowered ${baseline.cmExecuteCount} → ${cmExecute}).`,
                );
            }
        } else {
            console.log(`[no-commandmanager] OK (cm.execute): ${cmExecute} / ${CM_EXEC_CEILING}`);
        }
    }
    failed = failed || cmFailed;

    // Write unified baseline if any ratchet improved and we're not in --no-ratchet mode
    if (!failed && !NO_RATCHET) {
        const newWindow   = Math.min(window_,    baseline.windowCount);
        const newCmExec   = Math.min(cmExecute,  baseline.cmExecuteCount);
        if (newWindow < baseline.windowCount || newCmExec < baseline.cmExecuteCount) {
            writeBaseline(newWindow, newCmExec);
        }
    }

    return failed ? 1 : 0;
}

process.exit(main());
