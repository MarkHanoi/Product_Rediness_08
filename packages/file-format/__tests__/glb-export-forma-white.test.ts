// §FORMA-WHITE-MATERIAL (ADR-0093) — unit guard for the Forma-white material
// classification used by the GLB exporter's Forma-VIEW-ONLY white override.
//
// The full white remap runs inside exportFragmentsToGLB (DOM-bound GLTFExporter,
// out of scope for this Node-env suite). We test the PURE classifier directly: it
// decides which exported meshes become a clean white massing material and which
// stay translucent glass (windows / glazing), with NO mutation of the live scene.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { classifyFormaWhiteRole } from '../src/export/glb/GLBExporter';

describe('§FORMA-WHITE-MATERIAL — classifyFormaWhiteRole', () => {
  it('classifies window/curtain-wall element types as glass regardless of material', () => {
    const opaque = new THREE.MeshStandardMaterial({ color: 0x884422 });
    expect(classifyFormaWhiteRole('window', opaque)).toBe('glass');
    expect(classifyFormaWhiteRole('Window', opaque)).toBe('glass');       // case-insensitive
    expect(classifyFormaWhiteRole('curtainWall', opaque)).toBe('glass');
    expect(classifyFormaWhiteRole('glazing', opaque)).toBe('glass');
    expect(classifyFormaWhiteRole('skylight', opaque)).toBe('glass');
  });

  it('classifies physically-glass materials (transmission > 0) as glass', () => {
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.9, transparent: true });
    // Even with no element-type hint, the physical glass material is detected.
    expect(classifyFormaWhiteRole(undefined, glass)).toBe('glass');
    expect(classifyFormaWhiteRole('wall', glass)).toBe('glass');
  });

  it('classifies the BIM glazing pattern (transparent + depthWrite off) as glass', () => {
    const glazing = new THREE.MeshPhysicalMaterial({ transparent: true });
    glazing.depthWrite = false;
    expect(classifyFormaWhiteRole(undefined, glazing)).toBe('glass');
  });

  it('does NOT treat a merely-transparent material (depthWrite on) as glass', () => {
    // e.g. a faded preview overlay — opaque role so it goes white, not glass.
    const faded = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 });
    faded.depthWrite = true;
    expect(classifyFormaWhiteRole(undefined, faded)).toBe('opaque');
  });

  it('classifies ordinary building elements as opaque (→ white massing)', () => {
    const brick = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    expect(classifyFormaWhiteRole('wall', brick)).toBe('opaque');
    expect(classifyFormaWhiteRole('slab', brick)).toBe('opaque');
    expect(classifyFormaWhiteRole('roof', brick)).toBe('opaque');
    expect(classifyFormaWhiteRole('door', brick)).toBe('opaque');
    expect(classifyFormaWhiteRole(undefined, brick)).toBe('opaque');
  });

  it('§CW90 item 6 — a curtain PANEL with the authored glazing material reads as glass', () => {
    // The founder's exact shape: `glass-ultra-clear` from the material catalogue
    // is a MeshStandardMaterial — transparent + opacity 0.18, NO transmission,
    // depthWrite left true — stamped on a mesh whose own elementType is
    // 'CurtainWallPart' (which shadows the parent group's 'CurtainWall').
    const glassUltraClear = new THREE.MeshStandardMaterial({
      color: 0xeef8ff, transparent: true, opacity: 0.18,
    });
    expect(classifyFormaWhiteRole('CurtainWallPart', glassUltraClear)).toBe('glass');
    expect(classifyFormaWhiteRole('CurtainPanel', glassUltraClear)).toBe('glass');
    expect(classifyFormaWhiteRole('curtain-panel', glassUltraClear)).toBe('glass');
    expect(classifyFormaWhiteRole('CurtainPanelInstanced', glassUltraClear)).toBe('glass');
  });

  it('§CW90 item 6 — a MULLION part and a STONE panel stay opaque (no forced glass invariant)', () => {
    const anodisedAlu = new THREE.MeshStandardMaterial({ color: 0x999999 });
    // A mullion is also elementType 'CurtainWallPart' — its opaque material decides.
    expect(classifyFormaWhiteRole('CurtainWallPart', anodisedAlu)).toBe('opaque');
    // A marble/metal infill PANEL must not be repainted as glass either —
    // CurtainWallInstanceManager forces no glass invariant, and neither may we.
    expect(classifyFormaWhiteRole('CurtainPanel', anodisedAlu)).toBe('opaque');
    expect(classifyFormaWhiteRole('CurtainPanelInstanced', anodisedAlu)).toBe('opaque');
  });

  it('accepts a material array (uses the first) and a null material', () => {
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.7 });
    const brick = new THREE.MeshStandardMaterial({ color: 0x333333 });
    expect(classifyFormaWhiteRole(undefined, [glass, brick])).toBe('glass');
    expect(classifyFormaWhiteRole(undefined, [brick, glass])).toBe('opaque');
    // No material + no element type → opaque (safe default; goes white).
    expect(classifyFormaWhiteRole(undefined, null)).toBe('opaque');
  });
});
