#!/usr/bin/env tsx
/**
 * Gate G-NEW-04: No window.dispatchEvent(new CustomEvent(...)) from apps/editor/src/.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §4 Gate P0-G4
 * OI-050 (Phase F.events.2 — apps-tier migration)
 *
 * Ratchet direction: downward — hard-fail on any increase above baseline.
 * Hard ceiling: controlled via CUSTOMEVENT_APPS_CEILING env var.
 *
 * Baseline 2026-05-16: 297 sites in apps/editor/src/
 * Target trajectory (Phase F.events):
 *   F.events.0 (gate established)                     : 297 (this commit — baseline set)
 *   F.events.1 (EventBus package + runtime.events wiring) : 297 (structural — no site reduction yet)
 *   F.events.2a (first migration wave — engine/ core) : ~220
 *   F.events.2b (second wave — ui/ panels)            : ~120
 *   F.events.2c (third wave — remaining sites)        : 0
 *
 * Replacement API: runtime.events.emit(eventName, payload)
 *   Example: window.dispatchEvent(new CustomEvent('pryzm-wall-created', { detail }))
 *         →  runtime.events.emit('wall.created', detail)
 *   TypeMap: PryzmRuntimeEvents in packages/runtime-composer/src/types.ts
 *
 * NOTE: Packages-tier scan (packages/) is handled by check-custom-event-packages.ts (gate #17).
 * This gate covers apps/editor/src/ only — the highest-traffic mutation tier.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/custom-event-apps.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.CUSTOMEVENT_APPS_CEILING ?? '300', 10);

function count(): number {
    let out: string;
    try {
        out = execSync(
            `rg -c "window\\.dispatchEvent|new CustomEvent" apps/editor/src --type ts | awk -F: '{s+=$2} END {print s+0}'`,
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
                    'G-NEW-04: CustomEvent dispatches in apps/editor/src/. ' +
                    'Target: 0 (Phase F.events.2c). ' +
                    'Use CUSTOMEVENT_APPS_CEILING env var to step ceiling down per sprint. ' +
                    'Replace with runtime.events.emit() — see PryzmRuntimeEvents in ' +
                    'packages/runtime-composer/src/types.ts.',
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
            `[custom-event-apps] FAIL: ${current} CustomEvent dispatches in apps/editor/src/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: replace window.dispatchEvent(new CustomEvent(...)) with ' +
            'runtime.events.emit(eventName, payload) (Phase F.events.2). ' +
            'See docs/03_PRYZM3/PRYZM3-MASTER-STATUS.md §14 item 5.',
        );
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[custom-event-apps] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new CustomEvent dispatch(es) introduced in apps/editor/src/.`);
        console.error('  Replace with runtime.events.emit() — see PryzmRuntimeEvents type map.');
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(`[custom-event-apps] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
        } else {
            writeBaseline(current);
            console.log(`[custom-event-apps] OK: ${current} (ratchet lowered ${baseline} → ${current}).`);
        }
    } else {
        console.log(`[custom-event-apps] OK: ${current} / ${CEILING}`);
    }
    return 0;
}

process.exit(main());
