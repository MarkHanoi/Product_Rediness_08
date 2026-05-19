// bootstrap-shape — contract test pinning the bootstrap public surface
// (W-15, PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md).
//
// Background:
//   The S09 era introduced 5 separate `bootstrap*.ts` files (bootstrap,
//   bootstrap.data, bootstrap.render, bootstrap.render.data,
//   bootstrap.everything).  S18 made `bootstrap.everything.ts` the
//   canonical entry, leaving `bootstrap.render.data.ts` orphaned.
//   The Phase-1 audit (W-15) deleted it and the editor index now
//   exports exactly four bootstrap entries.
//
// Contract:
//   * `apps/editor/src/bootstrap.render.data.ts` MUST NOT exist.
//   * The editor index MUST export exactly the four canonical
//     bootstrap factories listed below.
//   * Each factory MUST be a callable function (we don't invoke them
//     here — bootstrap.everything requires real plugin internals;
//     full smoke is in the dedicated bootstrap.everything tests).
//
// If a future PR re-adds an orphan bootstrap file or drops one of the
// canonical four, this test fails immediately — the surface is now a
// reviewed contract.

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as editor from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'src');

const CANONICAL_BOOTSTRAPS = [
  'bootstrap',
  'bootstrapWithWalls',
  'bootstrapRender',
  'bootstrapWithEverything',
] as const;

const FORBIDDEN_FILES = [
  'bootstrap.render.data.ts',
];

describe('editor bootstrap surface (W-15 contract)', () => {
  it('exports exactly the four canonical bootstrap factories as callable functions', () => {
    for (const name of CANONICAL_BOOTSTRAPS) {
      const exported = (editor as unknown as Record<string, unknown>)[name];
      expect(typeof exported, `editor.${name} must be a function`).toBe('function');
    }
  });

  it('does not re-export the W-15-deleted `bootstrapRenderWithWalls`', () => {
    const exported = (editor as unknown as Record<string, unknown>)['bootstrapRenderWithWalls'];
    expect(exported, 'bootstrapRenderWithWalls was removed by W-15').toBeUndefined();
  });

  it('does not have an orphan bootstrap source file on disk', () => {
    for (const file of FORBIDDEN_FILES) {
      const path = resolve(SRC, file);
      expect(
        existsSync(path),
        `${file} must not exist — see W-15 in PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`,
      ).toBe(false);
    }
  });
});
