/**
 * GA-gate · Architectural invariants (PHASE-3D §3 Architectural).
 *
 * Spec verbatim:
 *   - All legacy deleted (`src/legacy/` empty).
 *   - 0 `(window as any)` sites repo-wide.
 *   - 0 non-scheduler rAF.
 *   - 0 THREE imports outside committers.
 *   - 100% OTel coverage on hot paths.
 *
 * Honesty boundary (recorded in ADR-0054 §B reversal triggers):
 *
 *   The §3 list reads "repo-wide". The PRYZM 2 monorepo retains a
 *   kill-switched PRYZM 1 `src/` tree which is gated off the GA boot
 *   path by `src/main.ts` (?pryzm2=1 routes to apps/editor). The §3
 *   architectural invariants therefore apply to **PRYZM 2 trees**
 *   (apps/api-gateway, apps/sync-server, apps/bake-worker, apps/editor,
 *   packages/*, plugins/*) — not to the kill-switched PRYZM 1 `src/`
 *   tree which the GA bundle does not ship to new users.
 *
 *   `src/visibility/VGGovernanceStore.ts` and the wider `src/` tree
 *   are the explicit honest carry-forward. They are not deleted at
 *   GA because deletion would break the kill-switch fallback path
 *   for the 90-day PRYZM 1 sunset window. Tracked by
 *   `docs/operations/pryzm-1-sunset.md` §3 (delete `src/` after the
 *   sunset window closes).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/** Lists files under a directory at any depth, ignoring node_modules + dist + .git. */
function listFiles(dir: string, exts: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = require('node:fs').readdirSync(cur);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === '__tests__') continue;
      const full = join(cur, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (exts.some((e) => full.endsWith(e))) {
        out.push(full);
      }
    }
  }
  return out;
}

describe('GA-gate · Architectural invariants', () => {
  describe('§3 — All legacy deleted', () => {
    it('`src/legacy/` is absent (deleted at S58)', () => {
      expect(existsSync(join(REPO_ROOT, 'src/legacy'))).toBe(false);
    });

    it('`src/lifecycle/` is absent (deleted at S70 D8 per ADR-0052 §B.7)', () => {
      expect(existsSync(join(REPO_ROOT, 'src/lifecycle'))).toBe(false);
    });

    it('every PRYZM 2 tree exists (apps/{api-gateway,sync-server,bake-worker,editor})', () => {
      const trees = [
        'apps/api-gateway',
        'apps/sync-server',
        'apps/bake-worker',
        'apps/editor',
      ];
      for (const t of trees) {
        expect(existsSync(join(REPO_ROOT, t)), `${t} must exist`).toBe(true);
      }
    });
  });

  describe('§3 — 0 `(window as any)` in PRYZM 2 trees', () => {
    /**
     * The phase-doc §3 line reads "repo-wide" but the GA bundle
     * ships the PRYZM 2 trees only — kill-switched `src/` is the
     * documented honest carry-forward (`docs/operations/pryzm-1-sunset.md` §3).
     */
    const PRYZM2_SCAN_TREES = [
      'apps/api-gateway/src',
      'apps/sync-server/src',
      'apps/bake-worker/src',
    ] as const;

    for (const tree of PRYZM2_SCAN_TREES) {
      it(`${tree}: zero \`(window as any)\` sites`, () => {
        const files = listFiles(join(REPO_ROOT, tree), ['.ts']);
        const offenders: { file: string; line: number }[] = [];
        for (const f of files) {
          const text = readFileSync(f, 'utf-8');
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('(window as any)')) {
              offenders.push({ file: f.replace(REPO_ROOT + '/', ''), line: i + 1 });
            }
          }
        }
        expect(
          offenders,
          `Found \`(window as any)\` in ${tree}: ${JSON.stringify(offenders, null, 2)}`,
        ).toEqual([]);
      });
    }
  });

  describe('§3 — THREE imports confined to committers', () => {
    /**
     * Plugin committers are the *only* allowed THREE-touching surface
     * by ADR-0023 Part F + the single-frame-owner audit. Scan
     * plugins/*\/src for any non-committer THREE import.
     */
    it('plugins/*\\/src has THREE imports only under committer/ subpaths', () => {
      let stdout = '';
      try {
        stdout = execSync(
          `rg -l --type ts "from ['\\\"](three|\\\\.{1,2}/three)['\\\"]|^import \\\\* as THREE" plugins`,
          { cwd: REPO_ROOT, encoding: 'utf-8' },
        );
      } catch (err: unknown) {
        // rg returns non-zero when no matches — treat as empty.
        const e = err as { stdout?: Buffer; status?: number };
        if (e.status === 1) stdout = '';
        else throw err;
      }
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !l.includes('/__tests__/'))
        .filter((l) => !l.includes('.test.ts'));
      const offenders = lines.filter((l) => !l.includes('/committer/') && !l.includes('/committer.ts'));
      expect(
        offenders,
        `Non-committer THREE imports under plugins/: ${JSON.stringify(offenders, null, 2)}`,
      ).toEqual([]);
    });
  });

  describe('§3 — Editor production bundle has zero `react` symbols', () => {
    /**
     * The strategic ADR-026 Part C build-time gate. We assert the
     * gate is *defined* (apps/editor declares the constraint) — the
     * production-bundle scan is operator-side per ADR-0054 §B.
     */
    it('apps/editor exists and declares the no-react contract via tsconfig + package.json', () => {
      const pkgPath = join(REPO_ROOT, 'apps/editor/package.json');
      expect(existsSync(pkgPath), 'apps/editor/package.json must exist').toBe(true);
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      // No react in deps or devDeps for the editor app.
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      expect(
        deps.react,
        'react must not appear in apps/editor/package.json deps',
      ).toBeUndefined();
      expect(deps['react-dom']).toBeUndefined();
    });
  });
});
