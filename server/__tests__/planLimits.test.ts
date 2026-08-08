/**
 * server/__tests__/planLimits.test.ts
 * ============================================================================
 * §PLAN-LIMITS-ONE-AUTHORITY (L-756) — the parity gate.
 *
 * The bug this pins was NOT a wrong number. It was the same policy declared in
 * three places, two of which agreed. A free-plan user was TOLD they could keep one
 * version (`/api/me/plan` and `PlanConfig.ts` both said 1) and then refused on
 * every save (the enforcement point said 0) — so their work lived only in one
 * browser's IndexedDB. Silent data loss, invisible to anyone who checked the two
 * sources that matched.
 *
 * So the test that matters is not "is free === 1". It is **"can the server's table
 * and the client's table ever disagree again"** — because the moment they can, the
 * same class of defect returns with different numbers.
 *
 * `PlanConfig.ts` is TypeScript in a workspace package and this is a Node-side
 * suite, so the parity check PARSES it rather than importing it. That is
 * deliberate: it means the test keeps working without a build step, and it fails
 * loudly if the file is restructured — which is itself a signal worth having.
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION_LIMITS, AI_LIMITS, versionLimitFor, aiLimitFor } from '../planLimits.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const planConfigPath = resolve(
    repoRoot, 'packages', 'core-app-model', 'src', 'monetization', 'PlanConfig.ts',
);

/** Pull `<plan>: { … maxVersionsPerProject: N … }` out of PlanConfig.ts. */
function parseClientVersionLimits(src: string): Record<string, number> {
    const out: Record<string, number> = {};
    // Each plan block opens with `<id>: {` at some indent; the limit follows inside it.
    const blocks = src.split(/\n\s{4}(?=[a-z_]+\s*:\s*\{)/);
    for (const block of blocks) {
        const id = /^\s*([a-z_]+)\s*:\s*\{/.exec(block)?.[1];
        const max = /maxVersionsPerProject\s*:\s*(-?\d+)/.exec(block)?.[1];
        if (id && max !== undefined) out[id] = Number(max);
    }
    return out;
}

describe('§1 the server table is the single server-side authority', () => {
    it('T1.1 — server.js declares NO local VERSION_LIMITS table any more', () => {
        const serverJs = readFileSync(resolve(repoRoot, 'server.js'), 'utf8');
        // A literal re-declaration is exactly how the drift happened. Catch it.
        expect(serverJs).not.toMatch(/const\s+VERSION_LIMITS\s*=\s*\{/);
        expect(serverJs).not.toMatch(/const\s+AI_LIMITS\s*=\s*\{/);
    });

    it('T1.2 — both the reporting and the enforcing site use the same helper', () => {
        const serverJs = readFileSync(resolve(repoRoot, 'server.js'), 'utf8');
        const uses = serverJs.match(/versionLimitFor\(/g) ?? [];
        // One in /api/me/plan (reports), one at the save gate (enforces).
        expect(uses.length).toBeGreaterThanOrEqual(2);
    });
});

describe('§2 parity with the client policy — the drift gate', () => {
    const clientLimits = parseClientVersionLimits(readFileSync(planConfigPath, 'utf8'));

    it('T2.1 — PlanConfig.ts parsed successfully (guards the test itself)', () => {
        // A positive control: if the parse silently returned {}, every parity
        // assertion below would vacuously pass and the gate would be decorative.
        expect(Object.keys(clientLimits).length).toBeGreaterThanOrEqual(5);
        expect(clientLimits).toHaveProperty('free');
    });

    it('T2.2 — every plan the client declares has the SAME server version limit', () => {
        for (const [plan, clientMax] of Object.entries(clientLimits)) {
            expect(
                VERSION_LIMITS[plan as keyof typeof VERSION_LIMITS],
                `plan "${plan}": client PlanConfig.ts says ${clientMax}, server planLimits.js says `
                + `${VERSION_LIMITS[plan as keyof typeof VERSION_LIMITS]}. `
                + 'These MUST move together — a user told one number and enforced another loses work.',
            ).toBe(clientMax);
        }
    });

    it('T2.3 — the server declares no plan the client does not know about', () => {
        for (const plan of Object.keys(VERSION_LIMITS)) {
            expect(clientLimits, `server knows plan "${plan}" but PlanConfig.ts does not`)
                .toHaveProperty(plan);
        }
    });

    it('T2.4 — free is 1, the specific regression that caused the data loss', () => {
        expect(VERSION_LIMITS.free).toBe(1);
        expect(versionLimitFor('free')).toBe(1);
    });
});

describe('§3 unknown plans degrade to free, never to zero', () => {
    it('T3.1 — an unrecognised plan gets the FREE floor, not a refusal', () => {
        // The old enforcement point used `?? 0`, so a typo or a renamed tier
        // silently became "cannot save anything" in the one place that mattered.
        expect(versionLimitFor('typo-tier')).toBe(VERSION_LIMITS.free);
        expect(versionLimitFor(null)).toBe(VERSION_LIMITS.free);
        expect(versionLimitFor(undefined)).toBe(VERSION_LIMITS.free);
        expect(aiLimitFor('nonsense')).toBe(AI_LIMITS.free);
    });

    it('T3.2 — no plan yields 0 versions (0 means "cannot save at all")', () => {
        for (const [plan, max] of Object.entries(VERSION_LIMITS)) {
            expect(max, `plan "${plan}" would refuse every save`).not.toBe(0);
        }
    });

    it('T3.3 — prototype keys are not mistaken for plans', () => {
        expect(versionLimitFor('constructor')).toBe(VERSION_LIMITS.free);
        expect(versionLimitFor('toString')).toBe(VERSION_LIMITS.free);
    });
});
