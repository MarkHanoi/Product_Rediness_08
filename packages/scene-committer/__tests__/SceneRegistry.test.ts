// SceneRegistry unit tests.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SceneRegistry } from '../src/SceneRegistry.js';

describe('SceneRegistry', () => {
  it('binds, retrieves, and removes', () => {
    const reg = new SceneRegistry();
    const a = new THREE.Object3D();
    reg.add('a', a);
    expect(reg.get('a')).toBe(a);
    expect(reg.has('a')).toBe(true);
    expect(reg.size()).toBe(1);
    expect(reg.remove('a')).toBe(a);
    expect(reg.size()).toBe(0);
    expect(reg.get('a')).toBeUndefined();
  });

  it('idempotent re-add of the SAME object is allowed', () => {
    const reg = new SceneRegistry();
    const a = new THREE.Object3D();
    reg.add('a', a);
    reg.add('a', a);
    expect(reg.size()).toBe(1);
  });

  it('throws on re-add with a different object — caller must remove first', () => {
    const reg = new SceneRegistry();
    reg.add('a', new THREE.Object3D());
    expect(() => reg.add('a', new THREE.Object3D())).toThrow(/already bound/);
  });

  it('iterates ids, values, entries in insertion order', () => {
    const reg = new SceneRegistry();
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    const c = new THREE.Object3D();
    reg.add('a', a);
    reg.add('b', b);
    reg.add('c', c);
    expect([...reg.ids()]).toEqual(['a', 'b', 'c']);
    expect([...reg.values()]).toEqual([a, b, c]);
    expect([...reg.entries()]).toEqual([
      ['a', a],
      ['b', b],
      ['c', c],
    ]);
  });

  it('clear() drops every binding without disposing the objects', () => {
    const reg = new SceneRegistry();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    reg.add('a', a);
    reg.clear();
    expect(reg.size()).toBe(0);
    // Geometry NOT disposed by registry — caller owns it.
    // (Tested by checking the underlying buffer is still valid.)
    expect((a.geometry as THREE.BoxGeometry).attributes.position.count).toBeGreaterThan(0);
  });

  it('remove of an unknown id returns undefined', () => {
    const reg = new SceneRegistry();
    expect(reg.remove('missing')).toBeUndefined();
  });
});
