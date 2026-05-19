// Command-bus CI gate — affectedStores contract (ADR-002 §3, C11 §5.2).
//
// Spec: docs/03_PRYZM3/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §2
// Plan: docs/03_PRYZM3/04-PLAN-FORWARD/23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md §S03
//
// Rules enforced (static analysis — no runtime import of handlers needed):
//
//   R1. Every handler file in plugins/<name>/src/handlers/ (excluding index.ts
//       and test files) MUST contain an affectedStores declaration.
//
//   R2. Every handler's "readonly type = '...'" string MUST be globally
//       unique across all plugin handler files.  Duplicate type strings
//       cause a silent last-write-wins collision in the CommandBus registry.
//
//   R3. Handler count must stay >= 100.  Guards against accidental mass
//       deletion — a drop below the floor triggers a mandatory review.
//
//   R4. Every handler file MUST contain both canExecute and execute
//       method/function names (interface completeness gate).
//
// Why static analysis (grep/fs) rather than dynamic import?
//   Dynamic import of 177+ ESM handler modules from a Node test process
//   requires each package to be built first (dist/).  Static analysis
//   runs on raw TypeScript source — no build step, works in CI from a
//   fresh checkout, and is meaningfully faster (< 200 ms vs 30+ s).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const PLUGINS_DIR = join(REPO_ROOT, 'plugins');

// ── File discovery ────────────────────────────────────────────────────────────

// The marker "@command-gate: not-a-command-bus-handler" in a handler file's
// first 10 lines explicitly opts that file out of the gate.  Use this only
// for files that live in src/handlers/ for co-location reasons but do NOT
// implement the CommandBus CommandHandler interface (e.g. plugin factory files
// that use a separate slot protocol such as IfcImportPluginHandler).
const GATE_EXCLUDE_MARKER = '@command-gate: not-a-command-bus-handler';

// Find all production handler files.
//
// A file qualifies when:
//   - It lives under plugins/<name>/src/handlers/ (one level deep — prevents
//     picking up nested helpers or __tests__ files in subdirs).
//   - Its filename is NOT index.ts.
//   - Its filename does NOT contain .test., .spec., or .mock.
//   - Its first 10 lines do NOT contain the GATE_EXCLUDE_MARKER.
function findHandlerFiles(): string[] {
  const files: string[] = [];
  if (!existsSync(PLUGINS_DIR)) return files;

  for (const plugin of readdirSync(PLUGINS_DIR)) {
    const handlersDir = join(PLUGINS_DIR, plugin, 'src', 'handlers');
    if (!existsSync(handlersDir)) continue;

    for (const entry of readdirSync(handlersDir)) {
      if (
        entry === 'index.ts' ||
        !entry.endsWith('.ts') ||
        entry.includes('.test.') ||
        entry.includes('.spec.') ||
        entry.includes('.mock.')
      ) continue;

      const full = join(handlersDir, entry);
      if (!statSync(full).isFile()) continue;

      // Exclusion marker check: read first 600 bytes (covers ~10 lines) only.
      const head = readFileSync(full, { encoding: 'utf-8' }).slice(0, 600);
      if (head.includes(GATE_EXCLUDE_MARKER)) {
        console.log('[commands-gate] skipping (excluded):', relative(REPO_ROOT, full));
        continue;
      }

      files.push(full);
    }
  }
  return files;
}

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

// Extract all "readonly type = 'some.string'" values from handler source.
function extractTypeStrings(src: string): string[] {
  const matches = [...src.matchAll(/readonly\s+type\s*=\s*['"]([^'"]+)['"]/g)];
  return matches.map(m => m[1]!);
}

// ── Pre-load handler files once ───────────────────────────────────────────────

const handlerFiles = findHandlerFiles();
const handlerSources = new Map<string, string>(
  handlerFiles.map(f => [f, readFile(f)]),
);

// ── R3: Count floor ───────────────────────────────────────────────────────────

describe('R3 — handler count floor', () => {
  it('has at least 100 production handler files (guards against mass deletion)', () => {
    expect(handlerFiles.length).toBeGreaterThanOrEqual(100);
  });

  it('reports handler count for visibility', () => {
    console.log(`[commands-gate] handler count: ${handlerFiles.length}`);
    expect(handlerFiles.length).toBeGreaterThan(0);
  });
});

// ── R1: affectedStores presence ───────────────────────────────────────────────

describe('R1 — affectedStores declaration', () => {
  it('every handler file declares affectedStores (bulk check)', () => {
    const violations: string[] = [];

    for (const [file, src] of handlerSources) {
      if (!src.includes('affectedStores')) {
        violations.push(relative(REPO_ROOT, file));
      }
    }

    if (violations.length > 0) {
      expect.fail(
        violations.length +
        ' handler file(s) missing affectedStores declaration ' +
        '(ADR-002 §3 — every CommandHandler MUST declare affectedStores):\n\n' +
        violations.map(f => '  - ' + f).join('\n') +
        '\n\nFix: add "readonly affectedStores = [\'<store-key>\'] as const;" ' +
        'to each handler class or "affectedStores: [\'<store-key>\']," to each handler object.',
      );
    }
  });

  it.each(handlerFiles.map(f => [relative(REPO_ROOT, f), f] as [string, string]))(
    '%s -> has affectedStores',
    (_rel, file) => {
      const src = handlerSources.get(file)!;
      expect(src, `${_rel} must declare affectedStores`).toContain('affectedStores');
    },
  );
});

// ── R4: canExecute + execute completeness ─────────────────────────────────────

describe('R4 — CommandHandler interface completeness', () => {
  it('every handler file contains both canExecute and execute', () => {
    const violations: string[] = [];

    for (const [file, src] of handlerSources) {
      const hasCanExecute = src.includes('canExecute');
      const hasExecute    = src.includes('execute');
      if (!hasCanExecute || !hasExecute) {
        violations.push(
          relative(REPO_ROOT, file) + ' — missing: ' +
          [!hasCanExecute && 'canExecute', !hasExecute && 'execute']
            .filter(Boolean)
            .join(', '),
        );
      }
    }

    if (violations.length > 0) {
      expect.fail(
        violations.length + ' handler file(s) missing required CommandHandler methods:\n\n' +
        violations.map(v => '  - ' + v).join('\n'),
      );
    }
  });
});

// ── R2: type string uniqueness ────────────────────────────────────────────────

describe('R2 — handler type string uniqueness', () => {
  it('every handler type string is globally unique across all plugins', () => {
    const seen = new Map<string, string[]>();

    for (const [file, src] of handlerSources) {
      for (const typeStr of extractTypeStrings(src)) {
        if (!seen.has(typeStr)) seen.set(typeStr, []);
        seen.get(typeStr)!.push(relative(REPO_ROOT, file));
      }
    }

    const duplicates = [...seen.entries()].filter(([, files]) => files.length > 1);

    if (duplicates.length > 0) {
      expect.fail(
        duplicates.length + ' duplicate handler type string(s) found ' +
        '(CommandBus.register() throws on duplicate — silent last-write-wins risk):\n\n' +
        duplicates
          .map(([type, files]) =>
            '  "' + type + '" in:\n' +
            files.map(f => '    - ' + f).join('\n'),
          )
          .join('\n'),
      );
    }
  });
});
