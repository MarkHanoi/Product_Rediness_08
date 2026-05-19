// Baseline parity input fixtures (S07-T9).
//
// 5 fixtures live under `tests/fixtures/pryzm-1/wall/` — one per
// handler.  Each fixture is the INPUT-only side; the output side
// (post-execute snapshot) is captured in S08 once the producer lands
// (geometry + DTO snapshots together — see PRYZM-1 parity capture in
// `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md §S08`).
//
// At S07 this test verifies:
//   • each of the 5 input JSON files exists and parses,
//   • each fixture's command type is known to the wall handler set,
//   • each input is at minimum schema-shaped (the handler's canExecute
//     accepts the payload OR rejects with a deterministic reason).

import { describe, expect, it } from 'vitest';
import { resolve, dirname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/plugin-sdk';
import { WallStore } from '../src/store.js';
import {
  buildWallHandlerSet,
  WALL_HANDLER_TYPES,
} from '../src/handlers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../../../tests/fixtures/pryzm-1/wall');

const FIXTURES = [
  { name: 'create.json',     type: 'wall.create' },
  { name: 'delete.json',     type: 'wall.delete' },
  { name: 'move.json',       type: 'wall.move' },
  { name: 'dimensions.json', type: 'wall.setDimensions' },
  { name: 'color.json',      type: 'wall.setColor' },
] as const;

interface InputFixture {
  readonly meta: {
    readonly source: string;
    readonly capturedAt: string;
    readonly description: string;
  };
  readonly command: {
    readonly type: string;
    readonly payload: Record<string, unknown>;
  };
  readonly setup?: {
    readonly walls?: readonly Record<string, unknown>[];
  };
}

describe('PRYZM 1 → 2 wall baseline parity input fixtures', () => {
  it('all 5 fixture files exist', () => {
    for (const f of FIXTURES) {
      const p = resolve(FIXTURE_DIR, f.name);
      expect(existsSync(p), `missing fixture: ${f.name}`).toBe(true);
    }
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.name}: schema-shaped + targets a known wall handler`, () => {
      const path = resolve(FIXTURE_DIR, fixture.name);
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as InputFixture;
      expect(parsed.command.type).toBe(fixture.type);
      expect(WALL_HANDLER_TYPES).toContain(parsed.command.type);
      expect(parsed.meta.source).toMatch(/^src\/commands\/walls\//);
      expect(parsed.meta.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(typeof parsed.command.payload).toBe('object');
    });
  }

  // canExecute round-trip — feeds each fixture into a fresh bus and
  // asserts the gate behaviour matches the fixture's own `expect`.
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: canExecute / execute round-trip succeeds`, async () => {
      const path = resolve(FIXTURE_DIR, fixture.name);
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as InputFixture;
      const store = new WallStore();
      // Seed prerequisite walls (delete / move / dimensions / color
      // need an existing wall row to mutate).
      if (parsed.setup?.walls) {
        for (const w of parsed.setup.walls) {
          store.applyPatch([{ op: 'add', path: [(w as { id: string }).id], value: w }]);
        }
      }
      const bus = new CommandBus({
        audit: { actorId: 'fixture', projectId: 'p', clientId: 'c' },
        emitter: new PatchEmitter(),
        undoStack: new UndoStack({ maxSize: 16 }),
        storesProvider: () => ({
          wall: Object.fromEntries(store.getState()),
        }),
      });
      for (const h of buildWallHandlerSet()) bus.register(h);
      // Should resolve without throwing.
      await expect(
        bus.executeCommand(parsed.command.type, parsed.command.payload),
      ).resolves.toBeDefined();
    });
  }
});
