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

    it('the five shipped modes are present with the canvas layout each needs', () => {
      // These five are asserted by NAME on purpose: they are the shipped
      // product surface, and silently losing one is a regression a
      // shape-only test would pass.
      //
      // ⚠ AMENDED 2026-09-07 (§SITE-IS-A-MODE, L-13180 · C115 §0.3) — this read
      // "the four shipped modes" and named four. `site` is the fifth, and it is
      // added here rather than left to the shape arms for exactly the reason the
      // comment above gives: the Parcel Law panel is now reachable ONLY through
      // this row, so a row silently lost is the whole panel silently lost.
      expect(getWorkspaceMode('author')?.canvas).toBe('full');
      expect(getWorkspaceMode('inspect')?.canvas).toBe('half');
      // ADR-0343 §D.1 reason 2 — a dashboard that cannot highlight what it
      // describes is the thing this mode exists to not be. If this ever reads
      // 'hidden', the Analysis surface has become a DataWorkbench bucket.
      expect(getWorkspaceMode('analysis')?.canvas).toBe('half');
      expect(getWorkspaceMode('data')?.canvas).toBe('hidden');
      // ⛔ SAME REASON, ONE CONTRACT STRONGER. C115 §1.4.1 makes every figure on
      // the Site panel a hyperlink that PAINTS its geometry, and §3.G `C115-27`
      // forbids a dead click. `'hidden'` here turns all 27 control rows into dead
      // clicks in one edit.
      expect(getWorkspaceMode('site')?.canvas).toBe('half');
    });

    it('⛔ Site is FIRST in pill order, and it claims NO keyboard shortcut', () => {
      // Founder 2026-09-07: the Site pill is rendered LEFT OF AUTHOR. Order in
      // this table IS the rendered order and the tab order (see its header), so
      // this is the only place that fact can be asserted.
      expect(WORKSPACE_MODES[0]?.id).toBe('site');
      // ⭐ `null`, not a key, and the reason is a hazard rather than a shortage:
      // F1–F4 are taken, and `WorkspaceController._keyListener` calls
      // `preventDefault()` on any MATCHED key — so binding F5 would swallow
      // browser reload app-wide, which is this project's own documented recovery
      // from a stale service-worker cache. L-13180 holds the chord-map proposal.
      expect(getWorkspaceMode('site')?.shortcut).toBeNull();
      // …and the tooltip must therefore not advertise one. A pill whose title
      // names a key the handler does not hold is a dead affordance with a label.
      // ⛔ UNTIL 2026-09-09 THE BOUNDARIES AROUND `F\\d` HERE WERE LITERAL 0x08 BACKSPACE
      // BYTES, so "the tooltip must not advertise a key" was asserted against a byte no
      // title can contain. Repaired (lane CI-RED) off ESLint `no-control-regex`, then RUN:
      // it passes, and it was scramble-controlled — a title reading `Site (F5)` matches,
      // `FF5x` does not.
      expect(getWorkspaceMode('site')!.title).not.toMatch(/\bF\d\b/);
    });

    it('Site suppresses BOTH the properties panel and the editing toolbar', () => {
      // ⚠ NOT A NEW DECISION — it PRESERVES the behaviour the panel had while it
      // was an Analysis tab (§PANEL-MODE-GATE L-12080 / §TOOLBAR-MODE-GATE
      // L-12220). Asserted because a carried-over decision is exactly the kind
      // that gets silently dropped in a relocation.
      expect(getWorkspaceMode('site')?.propertiesPanel).toBe('suppressed');
      expect(getWorkspaceMode('site')?.editingToolbar).toBe('suppressed');
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
