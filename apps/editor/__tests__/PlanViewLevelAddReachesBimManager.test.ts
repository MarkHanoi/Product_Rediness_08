// @vitest-environment happy-dom
//
// §FIX-GATE-DEFEATABLE-BY-ALIASING (LANE G1) — the pin for deleting the
// `PlanViewToolOverlay._addLevel` dual-write.
//
// ── WHAT WAS DELETED, AND WHY IT COULD NOT JUST BE DELETED ──────────────────
//
// `_addLevel` used to write TWICE: once directly at the legacy command manager,
// reached through bracket notation whose own comment gave the reason —
//
//     "§R7-FIX / §E.5.x: bracket notation avoids `window.commandManager` GA gate
//      pattern; functionally identical"
//     const _lvl = (window as any)['commandManager'] as {…} | undefined;
//     _lvl.execute(new AddLevelCommand({…}));
//
// — and once at the bus with `_skipBridge: true`.
//
// ⚠ THE OBVIOUS FIX WAS WRONG. Deleting the legacy half alone would have made
// "Add level" create NOTHING, silently, because `_skipBridge: true` returns from
// the bridge BEFORE its only creating statement (initBusHandlers.ts:2108-2109)
// and the spec has `stores: []`, no undoPatch, and no sync replication. No test
// covered it, so that regression would have shipped green.
//
// The fix is therefore TWO lines, not one: drop the legacy half AND the flag.
//
// ── WHAT THIS FILE PROVES ───────────────────────────────────────────────────
//
// Arm 1 (BEHAVIOUR) drives the REAL `AddLevelCommand` through the REAL bridge
// semantics and asserts at the OUTCOME — `bimManager.addLevel` — never at
// `success === true`. It pins BOTH branches, because the dangerous one is the
// branch that does nothing:
//     _skipBridge: true   → NO level created   (why the legacy half was needed)
//     no _skipBridge      → level created      (what the new code relies on)
//
// Arm 2 (REACHABILITY) pins the SOURCE, because a behaviour proof about a bridge
// says nothing about which payload the overlay actually sends. Committed is not
// reachable: arm 1 would stay green if `_addLevel` still shipped the flag.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AddLevelCommand } from '@pryzm/command-registry';

const HERE    = dirname(fileURLToPath(import.meta.url));
const OVERLAY = resolve(HERE, '../src/engine/views/PlanViewToolOverlay.ts');

/** Minimal stand-ins for the only collaborators AddLevelCommand.execute touches. */
function makeContext() {
    const levels: { id: string; name: string; elevation: number; height: number }[] = [];
    const bimManager = {
        addLevel: (l: never) => { levels.push(l); },
        removeLevel: (id: string) => {
            const i = levels.findIndex(l => l.id === id);
            if (i >= 0) levels.splice(i, 1);
        },
        getLevels: () => levels,
    };
    return {
        levels,
        ctx: {
            stores: { wallStore: { getLevels: () => levels, removeLevel: () => {} } },
            bimManager,
            projectContext: { activeLevelId: null as string | null },
        },
    };
}

/**
 * Reproduces the production `level.add` bridge at the ONE point that matters:
 * the `_skipBridge` early return sitting ahead of the sole creating statement.
 * Mirrors initBusHandlers.ts:2099-2110 line for line.
 */
function makeLevelAddBridge(ctx: unknown) {
    return (cmd: Record<string, unknown>): void => {
        if (!cmd.levelId) throw new Error('levelId is required');
        // initBusHandlers.ts:2108 — the guard under test.
        if (cmd._skipBridge) return;
        // initBusHandlers.ts:2109 — `_cmExec(new AddLevelCommand({...}))`, whose
        // body is `window.commandManager.execute(cmd, options)`.
        const legacy = (window as unknown as {
            commandManager?: { execute(c: unknown): void };
        }).commandManager;
        legacy?.execute(new AddLevelCommand({
            levelId:   cmd.levelId as string,
            name:      cmd.name as string,
            elevation: cmd.elevation as number,
            height:    cmd.height as number,
        }));
    };
}

describe('§FIX-GATE-DEFEATABLE-BY-ALIASING — level.add reaches BimManager without the dual-write', () => {
    let harness: ReturnType<typeof makeContext>;

    beforeEach(() => {
        harness = makeContext();
        (window as unknown as { commandManager: unknown }).commandManager = {
            execute: (cmd: unknown) => {
                const c = cmd as {
                    canExecute(ctx: unknown): { ok: boolean; reason?: string };
                    execute(ctx: unknown): unknown;
                };
                const v = c.canExecute(harness.ctx);
                if (!v.ok) throw new Error(v.reason ?? 'refused');
                c.execute(harness.ctx);
            },
        };
    });

    it('WITHOUT _skipBridge the level is actually created — the path _addLevel now relies on', () => {
        makeLevelAddBridge(harness.ctx)({
            levelId: 'L1-probe', name: 'Level 1', elevation: 3, height: 3,
        });

        // Assert at the OUTCOME the renderer and serializer read, not at a return value.
        expect(harness.levels).toHaveLength(1);
        expect(harness.levels[0]).toMatchObject({
            id: 'L1-probe', name: 'Level 1', elevation: 3, height: 3,
        });
        expect(harness.ctx.projectContext.activeLevelId).toBe('L1-probe');
    });

    it('WITH _skipBridge the bridge creates NOTHING — this is why the legacy half was load-bearing', () => {
        makeLevelAddBridge(harness.ctx)({
            levelId: 'L1-probe', name: 'Level 1', elevation: 3, height: 3, _skipBridge: true,
        });

        expect(harness.levels).toHaveLength(0);
        expect(harness.ctx.projectContext.activeLevelId).toBeNull();
    });
});

describe('§FIX-GATE-DEFEATABLE-BY-ALIASING — the overlay source, because committed is not reachable', () => {
    const src = readFileSync(OVERLAY, 'utf8');
    /** Comments stripped, so a quotation of the old code in a note cannot pass or fail this. */
    const code = src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

    it('_addLevel dispatches level.add WITHOUT _skipBridge, so the bridge takes the creating branch', () => {
        expect(code).toContain("executeCommand('level.add'");
        expect(code).not.toContain('_skipBridge');
    });

    it('the bracket-notation reach at the legacy command manager is gone', () => {
        expect(code).not.toMatch(/\[\s*['"]commandManager['"]\s*\]/);
        expect(code).not.toMatch(/_lvl\s*\.\s*execute\s*\(/);
    });

    it('no comment instructs a future reader how to dodge a gate', () => {
        // The defect is the INSTRUCTION, not the word. A note may name a gate;
        // it may not tell you which spelling gets past one.
        expect(src).not.toMatch(/avoids?\s+`?window\.commandManager`?\s+GA\s+gate/i);
        expect(src).not.toMatch(/bracket notation avoids/i);
    });
});
