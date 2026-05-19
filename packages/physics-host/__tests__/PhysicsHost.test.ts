import { describe, it, expect } from 'vitest';
import {
  NullPhysicsHost,
  createNullPhysicsHost,
  type PhysicsHost,
  type Vec3,
  type AabbBox,
} from '../src/index.js';

describe('@pryzm/physics-host — Phase 1A NullPhysicsHost', () => {
  describe('contract conformance', () => {
    it('createNullPhysicsHost() returns an instance that implements PhysicsHost', () => {
      const host: PhysicsHost = createNullPhysicsHost();
      expect(typeof host.isReady).toBe('function');
      expect(typeof host.raycast).toBe('function');
      expect(typeof host.queryAabb).toBe('function');
      expect(typeof host.pointInVolume).toBe('function');
      expect(typeof host.dispose).toBe('function');
    });

    it('NullPhysicsHost is a constructible class (not just a factory)', () => {
      const host = new NullPhysicsHost();
      expect(host).toBeInstanceOf(NullPhysicsHost);
    });
  });

  describe('isReady()', () => {
    it('always returns false for the Null backend', () => {
      const host = createNullPhysicsHost();
      expect(host.isReady()).toBe(false);
      expect(host.isReady()).toBe(false);
    });
  });

  describe('raycast()', () => {
    const origin: Vec3 = [0, 0, 0];
    const direction: Vec3 = [1, 0, 0];

    it('returns null for any input (Phase 1A no-op behaviour)', () => {
      const host = createNullPhysicsHost();
      expect(host.raycast(origin, direction)).toBeNull();
      expect(host.raycast([5, 5, 5], [0, -1, 0], 100)).toBeNull();
    });

    it('honours the optional maxDistance parameter without throwing', () => {
      const host = createNullPhysicsHost();
      expect(() => host.raycast(origin, direction, 50)).not.toThrow();
      expect(() => host.raycast(origin, direction, Infinity)).not.toThrow();
    });
  });

  describe('queryAabb()', () => {
    it('returns the empty array (frozen, ID-stable)', () => {
      const host = createNullPhysicsHost();
      const box: AabbBox = { min: [0, 0, 0], max: [10, 10, 10] };
      const result = host.queryAabb(box);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('returns the SAME frozen empty array across calls (no GC churn)', () => {
      const host = createNullPhysicsHost();
      const a = host.queryAabb({ min: [0, 0, 0], max: [1, 1, 1] });
      const b = host.queryAabb({ min: [-1, -1, -1], max: [0, 0, 0] });
      expect(a).toBe(b);
    });
  });

  describe('pointInVolume()', () => {
    it('returns the empty array for any point', () => {
      const host = createNullPhysicsHost();
      expect(host.pointInVolume([0, 0, 0])).toEqual([]);
      expect(host.pointInVolume([1e6, -1e6, 1e6])).toEqual([]);
    });
  });

  describe('dispose() lifecycle', () => {
    it('is idempotent', () => {
      const host = createNullPhysicsHost();
      host.dispose();
      expect(() => host.dispose()).not.toThrow();
      expect(() => host.dispose()).not.toThrow();
    });

    it('post-dispose queries throw a NAMED error (no silent undefined behaviour)', () => {
      const host = createNullPhysicsHost();
      host.dispose();
      expect(() => host.raycast([0, 0, 0], [1, 0, 0])).toThrow(/disposed NullPhysicsHost/);
      expect(() => host.queryAabb({ min: [0, 0, 0], max: [1, 1, 1] })).toThrow(/disposed NullPhysicsHost/);
      expect(() => host.pointInVolume([0, 0, 0])).toThrow(/disposed NullPhysicsHost/);
    });

    it('isReady() does NOT throw post-dispose (callers may probe before deciding to recreate)', () => {
      const host = createNullPhysicsHost();
      host.dispose();
      expect(() => host.isReady()).not.toThrow();
      expect(host.isReady()).toBe(false);
    });
  });

  describe('isolation', () => {
    it('two factory calls return independent instances', () => {
      const a = createNullPhysicsHost();
      const b = createNullPhysicsHost();
      expect(a).not.toBe(b);
      a.dispose();
      // b must still be usable
      expect(() => b.raycast([0, 0, 0], [1, 0, 0])).not.toThrow();
    });
  });
});
