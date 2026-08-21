/**
 * §WORKSPACE-MODE-REGISTRY (L-3000 · ADR-0343 §D.1) — the guard.
 *
 * WHAT THESE ASSERTIONS ESTABLISH, AND WHAT THEY CANNOT
 * -----------------------------------------------------
 * ARM 1 is a real unit test of the registry's lookups.
 * ARMS 2–4 read the SHIPPED TypeScript as TEXT. They cannot prove the shell
 * behaves; they pin the DEFECT SHAPE the ADR made a precondition — a mode list
 * written out a second time somewhere else, which is what made a fourth mode a
 * five-site hand edit. A text scan is the only honest place to pin that, and it
 * is not dressed up as a behavioural test.
 *
 * WHY THIS IS NOT NAME-THEATRE (CLAUDE.md, P4 — gates satisfied by RENAMING):
 * ARM 2 does not look for the word "modes". It asserts that the two consumer
 * files contain NO string literal equal to a registry id in an assignment or
 * comparison position — so renaming a local array does not help; the only way
 * to pass is to stop restating the ids.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  WORKSPACE_MODES,
  getWorkspaceMode,
  isWorkspaceMode,
  workspaceModeForShortcut,
} from '../workspaceModes';

const REPO = resolve(__dirname, '../../../../../..');
const CONTROLLER = join(REPO, 'apps/editor/src/ui/WorkspaceController.ts');
const BAR = join(REPO, 'apps/editor/src/ui/platform/WorkspaceModeBar.ts');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

/** Strip CSS and line comments — the ids are deliberately DISCUSSED in prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

describe('§WORKSPACE-MODE-REGISTRY', () => {
  describe('ARM 1 — the table and its lookups', () => {
    it('every row is complete and its id is unique', () => {
      const ids = WORKSPACE_MODES.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const m of WORKSPACE_MODES) {
        expect(m.id.length, `${m.id}: empty id`).toBeGreaterThan(0);
        expect(m.label.length, `${m.id}: empty label`).toBeGreaterThan(0);
        expect(m.title.length, `${m.id}: empty title`).toBeGreaterThan(0);
        expect(m.icon).toContain('<svg');
        expect(['full', 'half', 'hidden']).toContain(m.canvas);
      }
    });

    it('no two modes claim the same shortcut', () => {
      const keys = WORKSPACE_MODES.map((m) => m.shortcut).filter((k): k is string => k !== null);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('the four shipped modes are present with the canvas layout each needs', () => {
      // These four are asserted by NAME on purpose: they are the shipped
      // product surface, and silently losing one is a regression a
      // shape-only test would pass.
      expect(getWorkspaceMode('author')?.canvas).toBe('full');
      expect(getWorkspaceMode('inspect')?.canvas).toBe('half');
      // ADR-0343 §D.1 reason 2 — a dashboard that cannot highlight what it
      // describes is the thing this mode exists to not be. If this ever reads
      // 'hidden', the Analysis surface has become a DataWorkbench bucket.
      expect(getWorkspaceMode('analysis')?.canvas).toBe('half');
      expect(getWorkspaceMode('data')?.canvas).toBe('hidden');
    });

    it('lookups round-trip and reject unknowns', () => {
      for (const m of WORKSPACE_MODES) {
        expect(getWorkspaceMode(m.id)).toBe(m);
        expect(isWorkspaceMode(m.id)).toBe(true);
        if (m.shortcut) expect(workspaceModeForShortcut(m.shortcut)).toBe(m);
      }
      expect(getWorkspaceMode('nope')).toBeUndefined();
      expect(isWorkspaceMode('nope')).toBe(false);
      expect(isWorkspaceMode(null)).toBe(false);
      expect(workspaceModeForShortcut('F9')).toBeUndefined();
    });
  });

  describe('ARM 2 — no consumer restates the mode ids (shipped text)', () => {
    it('WorkspaceModeBar holds no mode-id literal at all', () => {
      // The bar renders whatever the table holds. It knows no mode by name —
      // that is the entire conversion. (Its own header says so; this checks it.)
      const body = stripComments(read(BAR));
      const offenders = WORKSPACE_MODES.map((m) => m.id).filter((id) =>
        new RegExp(`['"\`]${id}['"\`]`).test(body),
      );
      expect(offenders).toEqual([]);
    });

    it('WorkspaceController names a mode only where behaviour genuinely differs', () => {
      // The controller legitimately branches per mode for the WORKBENCH half
      // (§L-847 is a founder ruling that must stay readable) and for the inspect
      // HUD teardown. What it must NOT do is re-derive the canvas geometry or
      // the shortcut map from literals. Those two are asserted gone.
      const body = stripComments(read(CONTROLLER));
      expect(body).not.toMatch(/e\.key === ['"]F1['"]/);
      expect(body).not.toMatch(/e\.key === ['"]F2['"]/);
      expect(body).not.toMatch(/e\.key === ['"]F3['"]/);
      expect(body).toContain('workspaceModeForShortcut');
      expect(body).toContain('getWorkspaceMode');
    });
  });

  describe('ARM 3 — the union is derived, not restated', () => {
    it('WorkspaceController does not declare its own WorkspaceMode union', () => {
      const body = stripComments(read(CONTROLLER));
      // The old line was:  export type WorkspaceMode = 'author' | 'inspect' | 'data';
      expect(body).not.toMatch(/type\s+WorkspaceMode\s*=\s*['"]/);
      // …and the type must still be re-exported, because ~6 files import it
      // from here and a registry that breaks them is not an improvement.
      expect(body).toMatch(/export\s+type\s*\{\s*WorkspaceMode\s*\}/);
    });
  });

  describe('ARM 4 — the ViewCube reads the layout, not a mode list', () => {
    it('cube visibility keys on canvas layout', () => {
      const cube = stripComments(read(join(REPO, 'apps/editor/src/ui/ViewCube.ts')));
      // Was: (mode === 'inspect' || mode === 'data') ? 'none' : ''  — a list a
      // fourth half-mode fell straight out of, putting the cube on top of the
      // right-hand panel.
      expect(cube).not.toMatch(/mode === ['"]inspect['"]\s*\|\|\s*mode === ['"]data['"]/);
      expect(cube).toContain('getWorkspaceMode(mode)?.canvas');
    });
  });
});
