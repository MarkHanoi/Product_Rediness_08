/**
 * BCF 3.0 round-trip tests.
 *
 * Phase 3-B Sprint S59 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5
 * and PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S59 BCF round-trip gate
 * G18 — `pnpm test plugins/bcf`).
 *
 * Validates:
 *   (a) write→read parity for the full S59 surface (multiple viewpoints,
 *       components selection / visibility / colouring, related topics,
 *       AssignedTo / DueDate / Stage), and
 *   (b) byte-stable double-write — the same archive object always
 *       serialises to the same bytes.
 */

import { describe, expect, it } from 'vitest';
import { readBCF, writeBCF, type BCFArchive } from '../src/index.js';

function fixture(): BCFArchive {
  return {
    project: {
      projectId: 'proj-1',
      name: 'PRYZM Test Project',
      version: '3.0',
    },
    topics: [
      {
        guid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        topicType: 'Issue',
        topicStatus: 'Open',
        title: 'Wall thickness mismatch',
        priority: 'Major',
        index: 1,
        labels: ['structural', 'phase-3'],
        creationDate: '2026-04-28T10:00:00Z',
        creationAuthor: 'reviewer@pryzm.app',
        assignedTo: 'designer@pryzm.app',
        dueDate: '2026-05-15T17:00:00Z',
        stage: 'DD',
        description: 'Wall on grid B-3 is 200mm but spec calls 250mm.',
        relatedTopics: ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
        comments: [
          {
            guid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            date: '2026-04-28T10:05:00Z',
            author: 'reviewer@pryzm.app',
            comment: 'Confirmed via section view.',
          },
          {
            guid: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            date: '2026-04-28T10:10:00Z',
            author: 'designer@pryzm.app',
            comment: 'Will adjust in next revision.',
            parent: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          },
        ],
        viewpoints: [
          {
            guid: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            position: {
              cameraType: 'perspective',
              cameraViewPoint: { x: 10, y: 20, z: 5 },
              cameraDirection: { x: -1, y: 0, z: 0 },
              cameraUpVector: { x: 0, y: 0, z: 1 },
              fieldOfView: 60,
            },
            components: {
              viewSetupHints: {
                spacesVisible: false,
                spaceBoundariesVisible: false,
                openingsVisible: true,
              },
              selection: [
                { ifcGuid: '2MF28OelM2qx2EtT$3D5nQ' },
                { ifcGuid: '0aFt4QvB59nfV0i9pQH3wB', originatingSystem: 'Revit 2024' },
              ],
              visibility: {
                defaultVisibility: true,
                exceptions: [
                  { ifcGuid: '1HiddenComponentGuid01' },
                ],
              },
              coloring: [
                {
                  color: 'ff00ff00',
                  components: [{ ifcGuid: '2MF28OelM2qx2EtT$3D5nQ' }],
                },
                {
                  color: 'ffff0000',
                  components: [{ ifcGuid: '0aFt4QvB59nfV0i9pQH3wB' }],
                },
              ],
            },
          },
          {
            guid: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            position: {
              cameraType: 'orthogonal',
              cameraViewPoint: { x: 0, y: 0, z: 50 },
              cameraDirection: { x: 0, y: 0, z: -1 },
              cameraUpVector: { x: 0, y: 1, z: 0 },
              viewToWorldScale: 25,
            },
            snapshotPng: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG header bytes
          },
        ],
      },
      {
        guid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        topicType: 'Information',
        topicStatus: 'Closed',
        title: 'Coordination note',
        creationDate: '2026-04-27T08:00:00Z',
        creationAuthor: 'pm@pryzm.app',
        comments: [],
        viewpoints: [],
      },
    ],
  };
}

describe('writeBCF + readBCF round-trip — project / topic basics', () => {
  it('preserves project metadata', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    expect(back.project.projectId).toBe('proj-1');
    expect(back.project.name).toBe('PRYZM Test Project');
    expect(back.project.version).toBe('3.0');
  });

  it('preserves topic count and ordering (guid-sorted)', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    expect(back.topics).toHaveLength(2);
    expect(back.topics[0].guid).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(back.topics[1].guid).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });

  it('preserves topic title, status, type, labels, priority, index', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const t = back.topics[0];
    expect(t.title).toBe('Wall thickness mismatch');
    expect(t.topicStatus).toBe('Open');
    expect(t.topicType).toBe('Issue');
    expect(t.priority).toBe('Major');
    expect(t.index).toBe(1);
    expect(t.labels).toEqual(['structural', 'phase-3']);
  });

  it('preserves comment chain incl. ReplyToComment parent link', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const t = back.topics[0];
    expect(t.comments).toHaveLength(2);
    expect(t.comments[0].comment).toBe('Confirmed via section view.');
    expect(t.comments[1].parent).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
  });

  it('handles topics without any viewpoint', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    expect(back.topics[1].viewpoints).toEqual([]);
  });
});

describe('writeBCF + readBCF — S59 BCF 3.0 high-fidelity surfaces', () => {
  it('preserves AssignedTo, DueDate, Stage', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const t = back.topics[0];
    expect(t.assignedTo).toBe('designer@pryzm.app');
    expect(t.dueDate).toBe('2026-05-15T17:00:00Z');
    expect(t.stage).toBe('DD');
  });

  it('preserves related-topic cross-references (guid-sorted)', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    expect(back.topics[0].relatedTopics).toEqual(['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']);
    expect(back.topics[1].relatedTopics).toBeUndefined();
  });

  it('preserves multiple viewpoints per topic', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const t = back.topics[0];
    expect(t.viewpoints).toHaveLength(2);
    // Sorted by guid → 'eeee...' comes before 'ffff...'.
    expect(t.viewpoints[0].guid).toBe('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    expect(t.viewpoints[1].guid).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
  });

  it('preserves perspective viewpoint vectors + FOV', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const vp = back.topics[0].viewpoints[0];
    expect(vp.position?.cameraType).toBe('perspective');
    expect(vp.position?.cameraViewPoint).toEqual({ x: 10, y: 20, z: 5 });
    expect(vp.position?.fieldOfView).toBeCloseTo(60);
  });

  it('preserves orthographic viewpoint vectors + viewToWorldScale', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const vp = back.topics[0].viewpoints[1];
    expect(vp.position?.cameraType).toBe('orthogonal');
    expect(vp.position?.viewToWorldScale).toBeCloseTo(25);
  });

  it('preserves snapshot PNG bytes alongside the matching viewpoint', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const vp = back.topics[0].viewpoints[1];
    expect(vp.snapshotPng).toBeDefined();
    expect(Array.from(vp.snapshotPng!.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('preserves component selection (IFC GlobalIds) including originatingSystem', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const sel = back.topics[0].viewpoints[0].components?.selection;
    expect(sel).toHaveLength(2);
    // IfcGuid-sorted on write → '0aFt...' before '2MF2...'.
    expect(sel?.[0].ifcGuid).toBe('0aFt4QvB59nfV0i9pQH3wB');
    expect(sel?.[0].originatingSystem).toBe('Revit 2024');
    expect(sel?.[1].ifcGuid).toBe('2MF28OelM2qx2EtT$3D5nQ');
  });

  it('preserves visibility default + exceptions', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const vis = back.topics[0].viewpoints[0].components?.visibility;
    expect(vis?.defaultVisibility).toBe(true);
    expect(vis?.exceptions).toHaveLength(1);
    expect(vis?.exceptions[0].ifcGuid).toBe('1HiddenComponentGuid01');
  });

  it('preserves coloring groups (colour-sorted) and per-group component IfcGuids', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const col = back.topics[0].viewpoints[0].components?.coloring;
    expect(col).toHaveLength(2);
    // Colour-hex sorted on write → 'ff00ff00' (green) before 'ffff0000' (red).
    expect(col?.[0].color).toBe('ff00ff00');
    expect(col?.[0].components[0].ifcGuid).toBe('2MF28OelM2qx2EtT$3D5nQ');
    expect(col?.[1].color).toBe('ffff0000');
  });

  it('preserves view setup hints (spaces / space-boundaries / openings visibility)', async () => {
    const bytes = await writeBCF(fixture());
    const back = await readBCF(bytes);
    const hints = back.topics[0].viewpoints[0].components?.viewSetupHints;
    expect(hints?.spacesVisible).toBe(false);
    expect(hints?.spaceBoundariesVisible).toBe(false);
    expect(hints?.openingsVisible).toBe(true);
  });
});

describe('writeBCF determinism (CI gate G18 byte-stable)', () => {
  it('produces identical bytes on repeated writes of the same archive', async () => {
    const a = await writeBCF(fixture());
    const b = await writeBCF(fixture());
    expect(a.byteLength).toBe(b.byteLength);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('produces identical bytes after a read→write cycle', async () => {
    const original = await writeBCF(fixture());
    const decoded = await readBCF(original);
    const rewritten = await writeBCF(decoded);
    expect(Buffer.from(original).equals(Buffer.from(rewritten))).toBe(true);
  });

  it('produces identical bytes after two read→write cycles (idempotent)', async () => {
    const a = await writeBCF(fixture());
    const b = await writeBCF(await readBCF(a));
    const c = await writeBCF(await readBCF(b));
    expect(Buffer.from(b).equals(Buffer.from(c))).toBe(true);
  });
});
