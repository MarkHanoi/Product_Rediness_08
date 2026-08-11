// secondCompositionRoot.invariants — the ADR-0316 drift tripwire.
//
// P1 says "production code obtains a runtime ONLY via composeRuntime()".
// `createFamilyEditorRuntime()` does not, and ADR-0316 blesses that: the
// Family Creator is a genuinely different product surface (no project, no
// site, no collaboration, no renderer, 180 KB first-paint budget) and
// forcing it through composeRuntime() would drag ~281 KB gzip of THREE
// through the door before the first pixel.
//
// A blessing is only safe while the two roots stay DIFFERENT ON PURPOSE.
// The failure mode of a second composition root is not its existence — it
// is DRIFT: two subtly different mutation paths for the same conceptual
// operation, discovered years later by a user. This file turns that
// discovery into a test failure.
//
// Every `it()` below pins one clause of ADR-0316. If one fails, the answer
// is NOT to relax the assertion — it is to re-read ADR-0316 §"What would
// make this decision wrong later" and check whether the blessing still
// holds.
//
// @vitest-environment node

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { loadAllSrcFiles, SRC_ROOT } from '../quality-gates/_walk.js';
import { createFamilyEditorRuntime } from '../../src/app/familyEditorRuntime.js';
import {
  clearSpanSinks,
  installSpanSink,
  type SpanRecord,
} from '../../src/app/otel.js';

/**
 * ADR-0316 §"Allowed to differ" is bounded by this list. These are the
 * packages that MAKE composeRuntime() what it is — project persistence,
 * collaboration, the BIM aggregate stores, the renderer. The moment the
 * Family Creator needs one of them it is no longer a distinct surface,
 * the "second surface" argument collapses, and it must delegate to
 * composeRuntime() instead of re-wiring a rival.
 *
 * This is the single most important assertion in the file.
 */
const FORBIDDEN_IMPORTS: readonly string[] = [
  '@pryzm/runtime-composer',
  '@pryzm/command-bus',
  '@pryzm/command-registry',
  '@pryzm/stores',
  '@pryzm/core-app-model',
  '@pryzm/renderer',
  '@pryzm/renderer-three',
  '@pryzm/persistence-client',
  '@pryzm/scene-committer',
  '@pryzm/sync-client',
  '@pryzm/runtime-undo-stack',
  '@pryzm/editor',
];

/** Matches an exported command-verb constant in `src/commands/**`. */
const VERB_DECL = /export\s+const\s+[A-Z0-9_]*VERB[A-Z0-9_]*\s*(?::[^=]+)?=\s*'([^']+)'/g;

async function authoredVerbs(): Promise<string[]> {
  const files = await loadAllSrcFiles();
  const verbs = new Set<string>();
  for (const f of files) {
    if (!f.relPath.startsWith('src/commands/')) continue;
    VERB_DECL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = VERB_DECL.exec(f.stripped)) !== null) verbs.add(m[1]!);
  }
  return [...verbs].sort();
}

describe('ADR-0316 — the family editor is a SECOND composition root, on purpose', () => {
  // ── Clause 1: exactly ONE root inside this surface ────────────────────
  //
  // ADR-0316 blesses ONE rival, not "rivals are fine here". A second
  // factory inside apps/component-editor is a violation of the ADR that
  // permits the first one.
  it('declares exactly one runtime factory in src/', async () => {
    const files = await loadAllSrcFiles();
    const factories: string[] = [];
    for (const f of files) {
      for (const m of f.stripped.matchAll(
        /export\s+(?:async\s+)?(?:function|const|class)\s+((?:create|build|make|assemble|compose)[A-Za-z0-9_]*Runtime)\b/g,
      )) {
        factories.push(`${f.relPath}:${m[1]!}`);
      }
    }
    expect(factories).toEqual([
      'src/app/familyEditorRuntime.ts:createFamilyEditorRuntime',
    ]);
  });

  // ── Clause 2: the surfaces stay disjoint ──────────────────────────────
  it('imports nothing that would make it the SAME surface as composeRuntime()', async () => {
    const files = await loadAllSrcFiles();
    const violations: string[] = [];
    for (const f of files) {
      for (const pkg of FORBIDDEN_IMPORTS) {
        // Match the specifier exactly or as a subpath — `@pryzm/stores`
        // and `@pryzm/stores/x`, but never `@pryzm/stores-lite`.
        const re = new RegExp(`from\\s+['"]${pkg.replace('/', '\\/')}(?:\\/[^'"]*)?['"]`);
        const dyn = new RegExp(`import\\(\\s*['"]${pkg.replace('/', '\\/')}(?:\\/[^'"]*)?['"]`);
        if (re.test(f.stripped) || dyn.test(f.stripped)) {
          violations.push(`${f.relPath} → ${pkg}`);
        }
      }
    }
    expect(
      violations,
      'ADR-0316 collapses if the family editor needs the main runtime\'s substrate.\n' +
      'Delegate to composeRuntime() instead of importing a piece of it.',
    ).toEqual([]);
  });

  // ── Clause 3: everything authored is REACHABLE from the root ──────────
  //
  // This is the failure a second root hides best. `solidStore`,
  // `referencePlaneStore` and their commands existed, were unit-tested,
  // and were constructed ONLY inside those tests — the production
  // composition root wired none of them. Existence is not reachability.
  it('registers EVERY authored command verb on the runtime bus', async () => {
    const verbs = await authoredVerbs();
    expect(verbs.length, 'no verbs harvested — the scan is broken, not clean').toBeGreaterThan(5);

    const rt = createFamilyEditorRuntime({ skipSolverUpgrade: true });
    try {
      const unregistered = verbs.filter((v) => !rt.commandBus.has(v));
      expect(
        unregistered,
        'Authored-but-unwired: these verbs exist in src/commands/ but no user can\n' +
        'reach them, because createFamilyEditorRuntime() never registers them.',
      ).toEqual([]);
    } finally {
      rt.dispose();
    }
  });

  // ── Clause 4: every store the runtime exposes has a command path (P6) ─
  it('exposes no store without a command family that mutates it', async () => {
    const rt = createFamilyEditorRuntime({ skipSolverUpgrade: true });
    try {
      // Store-slot name → the verb prefix that owns its mutations.
      const owned: ReadonlyArray<readonly [string, string]> = [
        ['constraintStore', 'constraint.'],
        ['solidStore', 'solid.'],
        ['referencePlaneStore', 'referencePlane.'],
      ];
      const verbs = await authoredVerbs();
      const orphans: string[] = [];
      for (const [slot, prefix] of owned) {
        if (!(slot in rt)) { orphans.push(`${slot} (slot missing)`); continue; }
        const registered = verbs.filter((v) => v.startsWith(prefix) && rt.commandBus.has(v));
        if (registered.length === 0) orphans.push(`${slot} (no registered ${prefix}* verb)`);
      }
      expect(orphans, 'P6: a store the UI can see with no command path is a direct-write invitation.').toEqual([]);
    } finally {
      rt.dispose();
    }
  });

  // ── Clause 5: undo model parity ───────────────────────────────────────
  //
  // The two roots use DIFFERENT undo mechanics (closure inverses here,
  // Immer patch pairs in @pryzm/command-bus) — ADR-0316 allows that. What
  // it does NOT allow is a different undo GRANULARITY: in both roots a
  // batch is ONE undo step (C03 §4.1 / ADR-0314). A user pressing Ctrl-Z
  // must not get a different number of steps depending on which surface
  // they are standing on.
  it('collapses a batch into exactly ONE undo step, like the main bus', async () => {
    const rt = createFamilyEditorRuntime({ skipSolverUpgrade: true });
    try {
      const before = rt.commandBus.undoDepth();
      const p1 = rt.commandBus.execute('referencePlane.add', {
        name: 'A', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 },
      });
      await p1;
      const afterSingle = rt.commandBus.undoDepth();
      expect(afterSingle - before, 'one dispatch ⇒ one undo entry').toBe(1);

      await rt.commandBus.executeBatch([
        { verb: 'referencePlane.add', args: { name: 'B', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } } },
        { verb: 'referencePlane.add', args: { name: 'C', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } } },
        { verb: 'referencePlane.add', args: { name: 'D', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } } },
      ]);
      expect(
        rt.commandBus.undoDepth() - afterSingle,
        'a 3-command batch must be ONE undo step, not three (ADR-0314 / C03 §4.1)',
      ).toBe(1);

      // …and one undo must revert all three.
      expect(rt.referencePlaneStore.get().planes).toHaveLength(4);
      await rt.commandBus.undo();
      expect(rt.referencePlaneStore.get().planes).toHaveLength(1);
    } finally {
      rt.dispose();
    }
  });

  // ── Clause 6: P8 — every dispatch emits a span ────────────────────────
  describe('P8 span coverage', () => {
    const seen: SpanRecord[] = [];
    beforeEach(() => {
      seen.length = 0;
      installSpanSink((r) => { seen.push(r); });
    });
    afterEach(() => { clearSpanSinks(); });

    it('emits a pryzm.family.command.<verb> span for every dispatch', async () => {
      const rt = createFamilyEditorRuntime({ skipSolverUpgrade: true });
      try {
        await rt.commandBus.execute('solid.add', { name: 'S', kind: 'extrude' });
        expect(seen.map((s) => s.name)).toContain('pryzm.family.command.solid.add');
        expect(seen.every((s) => s.name.startsWith('pryzm.family.'))).toBe(true);
      } finally {
        rt.dispose();
      }
    });
  });

  // ── Clause 7: dispose is total ───────────────────────────────────────
  //
  // composeRuntime()'s tearDown() drops every subscription. A long-lived
  // rival that leaks on dispose is how a "separate surface" becomes a
  // memory-leak bug report nobody can attribute.
  it('dispose() drains the undo stack and clears selection', async () => {
    const rt = createFamilyEditorRuntime({ skipSolverUpgrade: true });
    await rt.commandBus.execute('solid.add', { name: 'S', kind: 'extrude' });
    rt.selectionStore.set(['x']);
    expect(rt.commandBus.undoDepth()).toBeGreaterThan(0);
    rt.dispose();
    expect(rt.commandBus.undoDepth()).toBe(0);
    expect(rt.selectionStore.get().ids.length).toBe(0);
  });

  // ── Clause 8: the ADR exists and is cited by the gate ────────────────
  //
  // The whole point of ADR-0316 is that `MAX_RIVALS = 1` stops being a
  // magic constant. If the ADR is deleted or the citation is dropped, the
  // constant reverts to magic and this test says so.
  it('is cited by name in the P1 gate, and the ADR file exists', async () => {
    const repoRoot = path.resolve(SRC_ROOT, '../../..');
    const gate = await fs.readFile(
      path.join(repoRoot, 'tools/ga-gate/check-single-compose.ts'),
      'utf8',
    );
    expect(gate, 'MAX_RIVALS must cite the ADR that justifies it').toMatch(/ADR-0316/);

    const adr = path.join(
      repoRoot,
      'docs/02-decisions/adrs/ADR-0316-family-creator-is-a-second-composition-root.md',
    );
    await expect(fs.stat(adr)).resolves.toBeTruthy();
  });
});
