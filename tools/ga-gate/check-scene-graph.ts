#!/usr/bin/env tsx
/**
 * G2-T2 — NME proxy-in-scene tripwire.
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §2 (G2-T2)
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md N2
 *
 * Hard-fail if any TypeScript source file adds an NME proxy group or proxy mesh
 * to the live THREE.js scene.  NME proxy groups — produced by
 * `NativeElementMeshExporter.exportForView()` — MUST only be consumed by
 * `EdgeProjectorService.project()` for off-screen 2D technical drawing projection.
 * Passing them to `scene.add()` (or any equivalent) places flat slab/mullion
 * Mesh objects directly in the rendered scene, causing:
 *
 *   • 123–153 draw calls at 14 triangles each (vs. 7 instanced draw calls)
 *   • ≈4× geometry count inflation (Source B from doc 49 §2.2)
 *   • 4–8 fps navigation (vs. 45–55 fps target NFT-04)
 *
 * Antipatterns detected (either → exit 1):
 *
 *   Pattern A — nativeGroup/nativeGroups variable passed to any .add() call:
 *     world.scene.three.add(nativeGroups)
 *     scene.add(nativeGroups[0])
 *     group.add(nativeGroup)
 *
 *   Pattern B — exportForView() chained directly into .add():
 *     scene.add(nativeElementMeshExporter.exportForView(viewDef)[0])
 *
 * Safe usage (NOT flagged by this gate):
 *   edgeProjectorService.project(viewDef, models, nativeGroups, ifcSceneGroups)
 *   nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true })
 *   scene.children                  ← read-only traversal to collect IFC groups
 *
 * Hard-fail = 0.  Any match is an immediate CI blocker.
 *
 * Exclusions:
 *   node_modules, dist, build, .next  — generated artifacts
 *   editor/**                         — separate sub-project (not in pnpm workspace)
 *   attached_assets/**                — snapshots / user uploads
 *   tools/ga-gate/check-scene-graph.ts — this file (the rg pattern literals live here)
 *   __tests__ directories              — unit-test mocks / stubs
 *   __fixtures__ directories          — lint/eslint fixtures
 */
import { execFileSync } from 'node:child_process';

const HARD_FAIL = 0;

const EXCLUSIONS = [
    '-g', '!node_modules',
    '-g', '!dist',
    '-g', '!build',
    '-g', '!.next',
    '-g', '!editor/**',
    '-g', '!attached_assets/**',
    '-g', '!tools/ga-gate/check-scene-graph.ts',
    '-g', '!**/__tests__/**',
    '-g', '!**/__fixtures__/**',
];

/**
 * Pattern A — nativeGroup(s) variable passed to .add().
 *
 * Matches any `.add(` call whose first argument token starts with `nativeGroup`,
 * covering:
 *   .add(nativeGroups)
 *   .add(nativeGroups[0])
 *   .add(nativeGroup)
 *   .add( nativeGroups  // whitespace variants
 *
 * Does NOT match:
 *   .project(viewDef, models, nativeGroups, ...)  ← no `.add(`
 *   .releaseGroups(nativeGroups, ...)             ← no `.add(`
 */
function countPatternA(): number {
    try {
        const out = execFileSync(
            'rg',
            [
                String.raw`\.add\(\s*nativeGroup`,
                '.',
                '--type', 'ts',
                ...EXCLUSIONS,
                '--count-matches',
            ],
            { encoding: 'utf8' },
        );
        return out.trim().split('\n')
            .filter(Boolean)
            .reduce((sum, line) => {
                const m = line.match(/:(\d+)$/);
                return sum + (m ? parseInt(m[1], 10) : 0);
            }, 0);
    } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 1) return 0; // rg: no matches
        throw err;
    }
}

/**
 * Pattern B — exportForView() chained directly into .add().
 *
 * Matches any `.add(` call on the same line as `exportForView`:
 *   scene.add(nativeElementMeshExporter.exportForView(viewDef)[0])
 *   group.add( nmeExporter.exportForView(v) )
 *
 * Does NOT match:
 *   const nativeGroups = nativeElementMeshExporter.exportForView(viewDef)
 *   // ... (different line) ...
 *   project(viewDef, models, nativeGroups, ...)
 */
function countPatternB(): number {
    try {
        const out = execFileSync(
            'rg',
            [
                String.raw`\.add\([^)]*exportForView`,
                '.',
                '--type', 'ts',
                ...EXCLUSIONS,
                '--count-matches',
            ],
            { encoding: 'utf8' },
        );
        return out.trim().split('\n')
            .filter(Boolean)
            .reduce((sum, line) => {
                const m = line.match(/:(\d+)$/);
                return sum + (m ? parseInt(m[1], 10) : 0);
            }, 0);
    } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 1) return 0; // rg: no matches
        throw err;
    }
}

function main(): number {
    const a = countPatternA();
    const b = countPatternB();
    const total = a + b;

    if (total > HARD_FAIL) {
        console.error(
            `[scene-graph-tripwire] FAIL: ${total} NME proxy-add-to-scene violation(s) detected.`,
        );
        if (a > 0) {
            console.error(
                `  Pattern A (nativeGroup passed to .add()): ${a} match(es).`,
            );
            console.error(
                `  Find them: rg '\\.add\\(\\s*nativeGroup' . --type ts -g '!node_modules' -n`,
            );
        }
        if (b > 0) {
            console.error(
                `  Pattern B (exportForView chained into .add()): ${b} match(es).`,
            );
            console.error(
                `  Find them: rg '\\.add\\([^)]*exportForView' . --type ts -g '!node_modules' -n`,
            );
        }
        console.error(
            `  Fix: NME proxy groups MUST be passed to EdgeProjectorService.project()`,
        );
        console.error(
            `       NEVER to scene.add() or any THREE.Object3D.add() call.`,
        );
        console.error(
            `  Read: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §2 (N2, G2-T2)`,
        );
        return 1;
    }

    console.log(
        `[scene-graph-tripwire] OK: 0 NME proxy-add-to-scene violations (Pattern A=${a}, B=${b}).`,
    );
    return 0;
}

process.exit(main());
