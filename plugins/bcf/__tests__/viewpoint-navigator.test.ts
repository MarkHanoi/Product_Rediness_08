import { describe, it, expect } from 'vitest';
import {
  viewpointToCameraTarget,
  positionToCameraTarget,
  selectViewpointByGuid,
  focusPointAtDistance,
} from '../src/viewpoint-navigator.js';
import type { BCFViewpoint, BCFViewpointPosition } from '../src/types.js';

const persp: BCFViewpointPosition = {
  cameraType: 'perspective',
  cameraViewPoint: { x: 0, y: 0, z: 10 },
  cameraDirection: { x: 0, y: 0, z: -1 },
  cameraUpVector: { x: 0, y: 1, z: 0 },
  fieldOfView: 60,
};

const ortho: BCFViewpointPosition = {
  cameraType: 'orthogonal',
  cameraViewPoint: { x: 5, y: 5, z: 5 },
  cameraDirection: { x: 1, y: 0, z: 0 },
  cameraUpVector: { x: 0, y: 0, z: 1 },
  viewToWorldScale: 25,
};

describe('positionToCameraTarget — perspective', () => {
  it('preserves position, direction, up exactly when already orthonormal', () => {
    const t = positionToCameraTarget(persp);
    expect(t.kind).toBe('perspective');
    expect(t.position).toEqual({ x: 0, y: 0, z: 10 });
    expect(t.direction).toEqual({ x: 0, y: 0, z: -1 });
    expect(t.up).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('projects target along direction at default distance (10 m)', () => {
    const t = positionToCameraTarget(persp);
    expect(t.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(t.targetDistance).toBe(10);
  });

  it('targetDistance override projects to a custom focus point', () => {
    const t = positionToCameraTarget(persp, { targetDistance: 25 });
    expect(t.target).toEqual({ x: 0, y: 0, z: -15 });
    expect(t.targetDistance).toBe(25);
  });

  it('converts FOV from degrees to radians while preserving the original', () => {
    const t = positionToCameraTarget(persp);
    if (t.kind !== 'perspective') throw new Error('expected perspective');
    expect(t.fovDeg).toBe(60);
    expect(t.fovRad).toBeCloseTo(Math.PI / 3, 6);
  });

  it('defaults FOV to 60° when the viewpoint did not specify one', () => {
    const noFov: BCFViewpointPosition = { ...persp };
    delete (noFov as { fieldOfView?: number }).fieldOfView;
    const t = positionToCameraTarget(noFov);
    if (t.kind !== 'perspective') throw new Error('expected perspective');
    expect(t.fovDeg).toBe(60);
  });

  it('normalises a non-unit direction vector', () => {
    const scaled: BCFViewpointPosition = { ...persp, cameraDirection: { x: 0, y: 0, z: -10 } };
    const t = positionToCameraTarget(scaled);
    expect(t.direction).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('Gram–Schmidt re-orthogonalises a non-orthogonal up vector', () => {
    const skewed: BCFViewpointPosition = {
      ...persp, cameraUpVector: { x: 0, y: 1, z: 0.5 },
    };
    const t = positionToCameraTarget(skewed);
    // up·direction must be ~0 after Gram–Schmidt.
    const dotUpDir = t.up.x * t.direction.x + t.up.y * t.direction.y + t.up.z * t.direction.z;
    expect(Math.abs(dotUpDir)).toBeLessThan(1e-10);
    const upLen = Math.sqrt(t.up.x ** 2 + t.up.y ** 2 + t.up.z ** 2);
    expect(upLen).toBeCloseTo(1, 6);
  });

  it('falls back to a sensible up when up is parallel to direction', () => {
    const parallel: BCFViewpointPosition = {
      ...persp, cameraUpVector: { x: 0, y: 0, z: -1 },
    };
    const t = positionToCameraTarget(parallel);
    const dotUpDir = t.up.x * t.direction.x + t.up.y * t.direction.y + t.up.z * t.direction.z;
    expect(Math.abs(dotUpDir)).toBeLessThan(1e-10);
    expect(Math.sqrt(t.up.x ** 2 + t.up.y ** 2 + t.up.z ** 2)).toBeCloseTo(1, 6);
  });
});

describe('positionToCameraTarget — orthogonal', () => {
  it('returns the orthogonal kind with viewToWorldScale preserved', () => {
    const t = positionToCameraTarget(ortho);
    expect(t.kind).toBe('orthogonal');
    if (t.kind !== 'orthogonal') throw new Error('expected orthogonal');
    expect(t.viewToWorldScale).toBe(25);
  });

  it('defaults viewToWorldScale to 1 when missing', () => {
    const noScale: BCFViewpointPosition = { ...ortho };
    delete (noScale as { viewToWorldScale?: number }).viewToWorldScale;
    const t = positionToCameraTarget(noScale);
    if (t.kind !== 'orthogonal') throw new Error('expected orthogonal');
    expect(t.viewToWorldScale).toBe(1);
  });
});

describe('positionToCameraTarget — guards', () => {
  it('rejects zero-length direction vector', () => {
    const bad: BCFViewpointPosition = { ...persp, cameraDirection: { x: 0, y: 0, z: 0 } };
    expect(() => positionToCameraTarget(bad)).toThrow(/zero-length/);
  });

  it('rejects non-positive targetDistance', () => {
    expect(() => positionToCameraTarget(persp, { targetDistance: 0 })).toThrow(/positive/);
    expect(() => positionToCameraTarget(persp, { targetDistance: -1 })).toThrow(/positive/);
    expect(() => positionToCameraTarget(persp, { targetDistance: NaN })).toThrow(/positive/);
  });
});

describe('viewpointToCameraTarget', () => {
  it('returns null for a viewpoint with no position (snapshot-only)', () => {
    const vp: BCFViewpoint = { guid: 'vp-1', position: null };
    expect(viewpointToCameraTarget(vp)).toBeNull();
  });

  it('forwards to positionToCameraTarget when position is set', () => {
    const vp: BCFViewpoint = { guid: 'vp-1', position: persp };
    const t = viewpointToCameraTarget(vp);
    expect(t).not.toBeNull();
    expect(t!.kind).toBe('perspective');
  });
});

describe('selectViewpointByGuid', () => {
  const vps: BCFViewpoint[] = [
    { guid: 'aaaa', position: persp },
    { guid: 'bbbb', position: ortho },
  ];
  it('finds an existing viewpoint by GUID', () => {
    expect(selectViewpointByGuid(vps, 'bbbb')?.guid).toBe('bbbb');
  });
  it('returns null for an unknown GUID', () => {
    expect(selectViewpointByGuid(vps, 'cccc')).toBeNull();
  });
});

describe('focusPointAtDistance', () => {
  it('projects along the direction at the requested distance', () => {
    expect(focusPointAtDistance(persp, 5)).toEqual({ x: 0, y: 0, z: 5 });
  });
  it('rejects non-positive distance', () => {
    expect(() => focusPointAtDistance(persp, 0)).toThrow(/positive/);
  });
});
