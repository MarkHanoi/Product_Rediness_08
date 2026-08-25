/**
 * §OUTLINE82 (SPEC-WINDOW-CUSTOM-OUTLINE D9, C25 §1.9, C86 §10.1) — proves the
 * declared-absence text from `opening-profile-declaration.ts` reaches the
 * ACTUAL exported IFC file, not just the helper function in isolation.
 *
 * The orphan module shipped in `a5238b8f` was correct but unreachable — no
 * call site in `window.ts` / `door.ts` invoked it. This suite is the C67
 * "rule 12" proof: read the effect back from the real, authoritative surface
 * (the STEP bytes `exportProjectToIFC` writes), never from a mocked call.
 *
 * Both Pipeline B entry points (`orchestrator.ts` → IFC4, `IFC4X3Exporter.ts`
 * → IFC4X3) route through the SAME `exportWindow`/`exportDoor` functions, so
 * one fixture proves the shared code path; a second, smaller assertion pins
 * the IFC4X3 call site too, since that is a second, independently-editable
 * call to the same function (C84 EI-12: a wired call site is proven by a
 * call site, not inferred from a sibling one).
 *
 * ⚠ Read C25 §1.7 before trusting this as end-to-end proof of anything a
 * user sees: `plugins/ifc-export/**` is "Pipeline B" — zero non-test callers,
 * not reached from the UI's export button (that is Pipeline A,
 * `packages/file-format/src/export/ifc/**`, which has no opening/profile
 * concept at all yet — recorded as a gap, not silently reconciled here).
 * This suite proves Pipeline B's own exporter now carries the declaration
 * end to end; it does not claim Pipeline B is what the app runs.
 */
import { describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';
import { Door, Wall, Window } from '@pryzm/plugin-sdk';

import { exportProjectToIFC } from '../src/orchestrator.js';
import { exportProjectToIFC4X3 } from '../src/exporters/IFC4X3Exporter.js';
import { InMemoryIFCMetaStore, type ProjectSnapshot } from '../src/index.js';
import { FIXTURE_LEVEL } from './fixtures.js';

// Hand-crafted to satisfy `defineElement`'s `<prefix>_<26-char-Crockford-base32>`
// regex (`packages/schemas/src/base/BaseNode.ts:35`; alphabet excludes I, L, O, U)
// — same convention `fixtures.ts` uses for its own ULID constants.
const Z23 = '00000000000000000000000';
const WALL_ID = `wall_${Z23}PDW`;
const ARCH_WINDOW_ID = `window_${Z23}PDA`;
const RECT_WINDOW_ID = `window_${Z23}PDR`;
const CUSTOM_WINDOW_ID = `window_${Z23}PDC`;
const ARCH_DOOR_ID = `door_${Z23}PDD`;

/**
 * One wall carrying four openings. Three profile kinds are attached
 * POST-`.parse()`, by plain-object mutation, never through the Zod schema —
 * `Opening` does not declare `openingProfile`/`customOutline` yet (OUTLINE80
 * lands that in parallel). This is the exact "read by STRING" contract the
 * module under test documents in its own header: the fixture proves the
 * exporter reads the field the same duck-typed way the module does, not that
 * the schema has landed.
 */
function buildFixtureWall(): Wall {
  const wall = Wall.parse({
    id: WALL_ID,
    levelId: FIXTURE_LEVEL.id,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 8, y: 0, z: 0 },
    ],
    height: 3,
    thickness: 0.2,
    childrenIds: [ARCH_WINDOW_ID, RECT_WINDOW_ID, CUSTOM_WINDOW_ID, ARCH_DOOR_ID],
    openings: [
      {
        id: 'op-arch-window', type: 'window', offset: 1,
        width: 1.2, height: 1.4, sillHeight: 0.9, elementId: ARCH_WINDOW_ID,
      },
      {
        id: 'op-rect-window', type: 'window', offset: 3,
        width: 1.0, height: 1.0, sillHeight: 0.9, elementId: RECT_WINDOW_ID,
      },
      {
        id: 'op-custom-window', type: 'window', offset: 5,
        width: 1.5, height: 1.5, sillHeight: 0.9, elementId: CUSTOM_WINDOW_ID,
      },
      {
        id: 'op-arch-door', type: 'door', offset: 6.5,
        width: 0.9, height: 2.1, sillHeight: 0, elementId: ARCH_DOOR_ID,
      },
    ],
  });

  const openings = wall.openings as unknown as Array<Record<string, unknown>>;
  openings[0].openingProfile = 'segmental-arch';
  // openings[1] stays rectangular — the default, and the "no declaration" pin.
  openings[2].openingProfile = 'custom';
  openings[2].customOutline = {
    vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0.5, v: 1 }],
  };
  openings[3].openingProfile = 'round-arch';

  return wall;
}

function buildSnapshot(): ProjectSnapshot {
  return {
    levels: [FIXTURE_LEVEL],
    walls: [buildFixtureWall()],
    windows: [
      Window.parse({ id: ARCH_WINDOW_ID, wallId: WALL_ID, width: 1.2, height: 1.4, sillHeight: 0.9 }),
      Window.parse({ id: RECT_WINDOW_ID, wallId: WALL_ID, width: 1.0, height: 1.0, sillHeight: 0.9 }),
      Window.parse({ id: CUSTOM_WINDOW_ID, wallId: WALL_ID, width: 1.5, height: 1.5, sillHeight: 0.9 }),
    ],
    doors: [
      Door.parse({ id: ARCH_DOOR_ID, wallId: WALL_ID, width: 0.9, height: 2.1 }),
    ],
  };
}

/** Read `Description` off every entity of `type`, keyed by its `Tag` (the PRYZM element id). */
async function readDescriptionsByTag(
  bytes: Uint8Array,
  type: number,
): Promise<Map<string, string | null>> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelId = api.OpenModel(bytes);
  try {
    const ids = api.GetLineIDsWithType(modelId, type);
    const out = new Map<string, string | null>();
    for (let i = 0; i < ids.size(); i += 1) {
      const line = api.GetLine(modelId, ids.get(i)) as Record<string, unknown>;
      const tag = line.Tag as { value: string } | null | undefined;
      if (!tag) continue;
      const desc = line.Description as { value: string } | null | undefined;
      out.set(tag.value, desc ? desc.value : null);
    }
    return out;
  } finally {
    api.CloseModel(modelId);
  }
}

describe('opening profile declaration — wired into the real exporter (§OUTLINE82)', () => {
  it('IFC4 (orchestrator.ts): declares a non-rectangular window profile in Description', async () => {
    const snapshot = buildSnapshot();
    const metaStore = new InMemoryIFCMetaStore();
    const { bytes } = await exportProjectToIFC(snapshot, metaStore, { name: 'OUTLINE82' });

    const windowDescriptions = await readDescriptionsByTag(bytes, WebIFC.IFCWINDOW);

    const archText = windowDescriptions.get(ARCH_WINDOW_ID);
    expect(archText).not.toBeNull();
    expect(archText).toContain('segmental-arch');
    expect(archText).toContain('Shape NOT represented');
    expect(archText).toContain('C25 s1.9');

    const customText = windowDescriptions.get(CUSTOM_WINDOW_ID);
    expect(customText).not.toBeNull();
    expect(customText).toContain('custom (3 vertices)');

    // PR-2-shaped pin: the rectangular window MUST NOT gain a Description —
    // there the box IS the shape, and there is nothing to declare.
    expect(windowDescriptions.get(RECT_WINDOW_ID)).toBeNull();
  });

  it('IFC4 (orchestrator.ts): declares a non-rectangular door profile in Description', async () => {
    const snapshot = buildSnapshot();
    const metaStore = new InMemoryIFCMetaStore();
    const { bytes } = await exportProjectToIFC(snapshot, metaStore, { name: 'OUTLINE82' });

    const doorDescriptions = await readDescriptionsByTag(bytes, WebIFC.IFCDOOR);
    const archDoorText = doorDescriptions.get(ARCH_DOOR_ID);
    expect(archDoorText).not.toBeNull();
    expect(archDoorText).toContain('round-arch');
    expect(archDoorText).toContain('Shape NOT represented');
  });

  it('preserves an existing IFCMetaStore Description by joining, never dropping it', async () => {
    const snapshot = buildSnapshot();
    const metaStore = new InMemoryIFCMetaStore();
    metaStore.add({
      pryzmElementId: ARCH_WINDOW_ID,
      globalId: '0Arch0Arch0Arch0Arch00',
      typeName: 'IFCWINDOW',
      name: 'Arched Window',
      description: 'Imported from Revit',
      psets: {},
      tier: 1,
    });
    const { bytes } = await exportProjectToIFC(snapshot, metaStore, { name: 'OUTLINE82' });

    const windowDescriptions = await readDescriptionsByTag(bytes, WebIFC.IFCWINDOW);
    const text = windowDescriptions.get(ARCH_WINDOW_ID);
    expect(text).toContain('Imported from Revit');
    expect(text).toContain('segmental-arch');
  });

  it('IFC4X3 (IFC4X3Exporter.ts): the same declaration reaches the second call site', async () => {
    const snapshot = buildSnapshot();
    const metaStore = new InMemoryIFCMetaStore();
    const { bytes } = await exportProjectToIFC4X3(snapshot, metaStore, { name: 'OUTLINE82-4X3' });

    const windowDescriptions = await readDescriptionsByTag(bytes, WebIFC.IFCWINDOW);
    expect(windowDescriptions.get(ARCH_WINDOW_ID)).toContain('segmental-arch');
    expect(windowDescriptions.get(RECT_WINDOW_ID)).toBeNull();
  });
});
