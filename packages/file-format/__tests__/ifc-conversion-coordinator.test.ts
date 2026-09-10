// §ELEVEN-OF-FIFTEEN-DROPPED-AT-100-PERCENT (L-13298) — the FIRST test for IfcConversionCoordinator.
//
// ── THE DEFECT ───────────────────────────────────────────────────────────────────────────
// `IfcNativeCategory` had 16 members and the coordinator's `switch` 15 cases, but its loop
// iterated `['room','wall','door','window','unsupported']`. Eleven categories were grouped
// and never visited. They touched neither `converted`, `failed` nor `issues`, so they left
// the numerator AND the denominator: a slab-heavy model reported "100% converted, 0 failed"
// beside `Slabs 0 · Columns 0`. A DROP and an ABSENCE shared one value (§CONTEXT-DATA-HONESTY,
// L-581/L-616).
//
// ── WHAT THIS SUITE BINDS ────────────────────────────────────────────────────────────────
// It feeds the REAL coordinator a scene carrying one mesh per category the REAL classifier
// can yield — stamped exactly as `IfcGeometryRenderer` stamps them (`userData.source ===
// 'ifc-import'`, `rawIfcType`, `storeyName`, `psets`) — and asserts the three counts. It
// does not import a converter and call it: the assertions are on `run()`'s report, the
// object the toast and the fidelity card read.
//
// ── SCRAMBLE (L-586) ─────────────────────────────────────────────────────────────────────
// Re-narrowing the coordinator's iteration list to the original four turns the census and
// the accounting arms RED (converted stays 4, but unsupported reads 0 and the invariant
// breaks). Recorded in the commit that added this file.

import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { IfcConversionCoordinator } from '../src/import/ifc/conversion/IfcConversionCoordinator';
import { IFC_NATIVE_CATEGORIES, type IfcNativeCategory } from '../src/import/ifc/conversion/IfcConversionTypes';

// One mesh per category the classifier can yield. `rawIfcType` + `psets.PredefinedType` are
// what `IfcClassifier.classify` reads; the expected category is asserted by the census arm so
// the fixture cannot silently drift away from the classifier.
const FIXTURE: { rawIfcType: string; predefined?: string; expect: IfcNativeCategory; y?: number }[] = [
  { rawIfcType: 'IFCSPACE',              expect: 'room' },
  { rawIfcType: 'IFCWALLSTANDARDCASE',   expect: 'wall' },
  { rawIfcType: 'IFCCURTAINWALL',        expect: 'curtainwall' },
  { rawIfcType: 'IFCDOOR',               expect: 'door' },
  { rawIfcType: 'IFCWINDOW',             expect: 'window' },
  { rawIfcType: 'IFCSLAB',               expect: 'slab' },
  { rawIfcType: 'IFCSLAB', predefined: 'BASESLAB', expect: 'floor' },
  { rawIfcType: 'IFCCOVERING', predefined: 'CEILING', expect: 'ceiling' },
  { rawIfcType: 'IFCCOLUMN',             expect: 'column' },
  { rawIfcType: 'IFCBEAM',               expect: 'beam' },
  { rawIfcType: 'IFCROOF',               expect: 'roof' },
  { rawIfcType: 'IFCSTAIR',              expect: 'stair' },
  { rawIfcType: 'IFCRAILING',            expect: 'railing' },
  { rawIfcType: 'IFCFURNISHINGELEMENT',  expect: 'furniture' },
  { rawIfcType: 'IFCPLATE',              expect: 'native-proxy' },
];

const LEVELS = [
  { id: 'L1', name: 'Level 1', elevation: 0 },
  { id: 'L2', name: 'Level 2', elevation: 3 },
];

function buildScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.userData = { modelId: 'm1', name: 'fixture.ifc', source: 'ifc-import' };
  FIXTURE.forEach((f, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.2), new THREE.MeshBasicMaterial());
    mesh.position.set(i * 6, 1.25, 0);
    mesh.name = `${f.rawIfcType}-${i}`;
    mesh.userData = {
      id: `src-${i}`,
      source: 'ifc-import',
      modelId: 'm1',
      expressID: 1000 + i,
      rawIfcType: f.rawIfcType,
      ifcTypeName: f.rawIfcType,
      storeyName: 'Level 1',
      psets: f.predefined ? { Pset_Common: { PredefinedType: f.predefined } } : {},
    };
    group.add(mesh);
  });
  scene.add(group);
  scene.updateMatrixWorld(true);
  return scene;
}

function makeCoordinator(scene: THREE.Scene): IfcConversionCoordinator {
  const bimManager = { getLevels: () => LEVELS };
  const commandManager = {
    getContext: () => ({ bimManager, stores: {} }),
    execute: () => ({ success: true, affectedElementIds: [] }),
  };
  return new IfcConversionCoordinator({
    scene, commandManager, bimManager,
    options: { mode: 'dry-run', selectedOnly: false, hideSourceMeshes: true },
  });
}

describe('IfcConversionCoordinator — every category is counted (L-13298)', () => {
  let report: ReturnType<IfcConversionCoordinator['run']>;

  beforeAll(() => {
    report = makeCoordinator(buildScene()).run({ mode: 'dry-run' });
  });

  it('CENSUS: the fixture covers every category the classifier can yield, and the coordinator scanned all of them', () => {
    const yieldable = IFC_NATIVE_CATEGORIES.filter((c) => c !== 'unsupported');
    expect([...new Set(FIXTURE.map((f) => f.expect))].sort()).toEqual([...yieldable].sort());
    expect(report.stats.scanned).toBe(FIXTURE.length);
  });

  it('ACCOUNTING: scanned === converted + unsupported + failed — a drop can no longer read as an absence', () => {
    const { scanned, converted, unsupported, failed } = report.stats;
    expect(converted + unsupported + failed).toBe(scanned);
    expect(report.issues.some((i) => /Accounting mismatch/.test(i.message))).toBe(false);
  });

  it('THREE NUMBERS: the unrouted categories are COUNTED as unsupported, not lost', () => {
    // Honesty commit: four categories routed, eleven counted as unsupported by name. The
    // coverage commit that routes the eleven changes these two literals and nothing else here.
    expect(report.stats.converted).toBe(4);
    expect(report.stats.unsupported).toBe(11);
    expect(report.stats.failed).toBe(0);
  });

  it('BY NAME: every unsupported element is named by IFC type in stats AND in a warn-level issue', () => {
    const named = report.stats.unsupportedByIfcType;
    const total = Object.values(named).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.stats.unsupported);
    for (const typeName of Object.keys(named)) {
      const warn = report.issues.find((i) => i.severity === 'warn' && i.message.includes(typeName) && /unsupported/i.test(i.message));
      expect(warn, `no warn-level issue names ${typeName}`).toBeTruthy();
    }
    // A native-proxy is NOT an element: it is never counted as converted.
    expect(named['IFCPLATE']).toBe(1);
    expect(report.createdElementIds.some((id) => id.startsWith('native-proxy-'))).toBe(false);
  });
});
