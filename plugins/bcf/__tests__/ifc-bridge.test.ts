/**
 * IFC ↔ BCF bridge tests.
 *
 * Phase 3-B Sprint S59 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5
 * — BCF import: components must resolve back to PRYZM elements via IFC
 * GlobalIds).
 */

import { describe, expect, it } from 'vitest';
import {
  buildResolversFromMap,
  collectReferencedGlobalIds,
  resolveViewpoint,
  selectionToBCFComponents,
  summariseResolution,
  topicsWithComponentRefs,
  type BCFArchive,
  type BCFViewpoint,
} from '../src/index.js';

const GUID_A = '2MF28OelM2qx2EtT$3D5nQ';
const GUID_B = '0aFt4QvB59nfV0i9pQH3wB';
const GUID_C = '1HiddenComponentGuid01';
const GUID_UNKNOWN = '9unknownGuidNotMapped9';

const PRYZM_A = 'wall-001';
const PRYZM_B = 'door-002';
const PRYZM_C = 'slab-003';

function buildResolver() {
  return buildResolversFromMap(new Map([
    [PRYZM_A, GUID_A],
    [PRYZM_B, GUID_B],
    [PRYZM_C, GUID_C],
  ]));
}

function fixtureViewpoint(): BCFViewpoint {
  return {
    guid: 'vp-1',
    position: null,
    components: {
      selection: [{ ifcGuid: GUID_A }, { ifcGuid: GUID_B, originatingSystem: 'Revit 2024' }],
      visibility: {
        defaultVisibility: true,
        exceptions: [{ ifcGuid: GUID_C }],
      },
      coloring: [
        { color: 'ff00ff00', components: [{ ifcGuid: GUID_A }] },
      ],
    },
  };
}

describe('resolveViewpoint', () => {
  it('maps every IFC GlobalId to its PRYZM element id when known', () => {
    const { byGlobalId } = buildResolver();
    const out = resolveViewpoint(fixtureViewpoint(), byGlobalId);
    expect(out.selection).toHaveLength(2);
    expect(out.selection[0]).toMatchObject({ ifcGuid: GUID_A, pryzmElementId: PRYZM_A });
    expect(out.selection[1]).toMatchObject({ ifcGuid: GUID_B, pryzmElementId: PRYZM_B, originatingSystem: 'Revit 2024' });
  });

  it('returns null pryzmElementId for unknown GlobalIds (does not drop the entry)', () => {
    const { byGlobalId } = buildResolver();
    const vp = fixtureViewpoint();
    vp.components!.selection!.push({ ifcGuid: GUID_UNKNOWN });
    const out = resolveViewpoint(vp, byGlobalId);
    expect(out.selection).toHaveLength(3);
    expect(out.selection[2].pryzmElementId).toBeNull();
  });

  it('honours BCF visibility semantic — defaultVisibility=true ⇒ exceptions hidden', () => {
    const { byGlobalId } = buildResolver();
    const out = resolveViewpoint(fixtureViewpoint(), byGlobalId);
    expect(out.defaultVisibility).toBe(true);
    expect(out.hidden).toHaveLength(1);
    expect(out.hidden[0].pryzmElementId).toBe(PRYZM_C);
  });

  it('drops the hidden list when defaultVisibility=false (exceptions are the only-visible)', () => {
    const { byGlobalId } = buildResolver();
    const vp = fixtureViewpoint();
    vp.components!.visibility!.defaultVisibility = false;
    const out = resolveViewpoint(vp, byGlobalId);
    expect(out.defaultVisibility).toBe(false);
    expect(out.hidden).toEqual([]);
  });

  it('preserves coloring groups and resolves their component lists', () => {
    const { byGlobalId } = buildResolver();
    const out = resolveViewpoint(fixtureViewpoint(), byGlobalId);
    expect(out.coloring).toHaveLength(1);
    expect(out.coloring[0].color).toBe('ff00ff00');
    expect(out.coloring[0].components[0].pryzmElementId).toBe(PRYZM_A);
  });

  it('handles a viewpoint with no components block at all', () => {
    const { byGlobalId } = buildResolver();
    const out = resolveViewpoint({ guid: 'bare', position: null }, byGlobalId);
    expect(out.selection).toEqual([]);
    expect(out.hidden).toEqual([]);
    expect(out.coloring).toEqual([]);
  });
});

describe('summariseResolution', () => {
  it('counts resolved vs missing across an archive', () => {
    const { byGlobalId } = buildResolver();
    const archive: BCFArchive = {
      project: { projectId: 'p', name: 'n', version: '3.0' },
      topics: [
        {
          guid: 'topic-1',
          topicType: 'Issue',
          topicStatus: 'Open',
          title: 't',
          creationDate: '2026-04-28T00:00:00Z',
          creationAuthor: 'a',
          comments: [],
          viewpoints: [
            {
              guid: 'vp-1',
              position: null,
              components: {
                selection: [{ ifcGuid: GUID_A }, { ifcGuid: GUID_UNKNOWN }],
              },
            },
          ],
        },
      ],
    };
    const sum = summariseResolution(archive, byGlobalId);
    expect(sum.componentsTotal).toBe(2);
    expect(sum.componentsResolved).toBe(1);
    expect(sum.componentsUnresolved).toEqual([GUID_UNKNOWN]);
  });
});

describe('selectionToBCFComponents', () => {
  it('translates PRYZM ids to IFC GlobalIds for export', () => {
    const { byPryzmId } = buildResolver();
    const out = selectionToBCFComponents([PRYZM_A, PRYZM_B], byPryzmId);
    expect(out.components.selection).toHaveLength(2);
    expect(out.components.selection?.map((c) => c.ifcGuid).sort()).toEqual([GUID_B, GUID_A].sort());
    expect(out.skipped).toEqual([]);
  });

  it('reports PRYZM ids without a known IFC GlobalId as skipped', () => {
    const { byPryzmId } = buildResolver();
    const out = selectionToBCFComponents([PRYZM_A, 'pryzm-orphan-99'], byPryzmId);
    expect(out.components.selection).toHaveLength(1);
    expect(out.skipped).toEqual(['pryzm-orphan-99']);
  });

  it('returns an empty components block when nothing resolves', () => {
    const { byPryzmId } = buildResolver();
    const out = selectionToBCFComponents(['pryzm-orphan-99'], byPryzmId);
    expect(out.components.selection).toBeUndefined();
    expect(out.skipped).toEqual(['pryzm-orphan-99']);
  });
});

describe('collectReferencedGlobalIds + topicsWithComponentRefs', () => {
  const archive: BCFArchive = {
    project: { projectId: 'p', name: 'n', version: '3.0' },
    topics: [
      {
        guid: 'topic-with-comps',
        topicType: 'Issue',
        topicStatus: 'Open',
        title: 't',
        creationDate: '2026-04-28T00:00:00Z',
        creationAuthor: 'a',
        comments: [],
        viewpoints: [fixtureViewpoint()],
      },
      {
        guid: 'topic-bare',
        topicType: 'Information',
        topicStatus: 'Closed',
        title: 'b',
        creationDate: '2026-04-28T00:00:00Z',
        creationAuthor: 'a',
        comments: [],
        viewpoints: [],
      },
    ],
  };

  it('collects unique referenced GlobalIds across all topics, sorted', () => {
    const out = collectReferencedGlobalIds(archive);
    expect(out).toEqual([GUID_B, GUID_C, GUID_A].sort());
  });

  it('returns only topics whose viewpoints carry component references', () => {
    const out = topicsWithComponentRefs(archive);
    expect(out).toHaveLength(1);
    expect(out[0].guid).toBe('topic-with-comps');
  });
});
