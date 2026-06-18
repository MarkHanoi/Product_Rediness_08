// @vitest-environment happy-dom
//
// §GLOBE-FRAME-NO-JUMP — guard tests for the initial-framing re-fly.
//
// Regression context (founder 2026-06-18): opening the 3D globe made the camera
// JUMP OFF the building instead of settling on it (seen on BOTH Forma tiles and
// Google photoreal). Root cause: the photoreal-tile / terrain base-settle re-flew
// the camera UNCONDITIONALLY, and the base can settle MORE THAN ONCE (tiles stream
// progressively) — so the corrective re-frame re-fired, yanking the camera, and it
// also fired after the user had already moved.
//
// `performInitialReframe` is the single funnel that now enforces:
//   1. fire AT MOST ONCE per framing open,
//   2. NEVER fire after the user has taken camera control,
//   3. only fly with a placed origin (invalid targets are rejected in flyToFormaSite).
//
// The test calls the private method via the prototype on a minimal stub `this`, so
// it exercises the SHIPPED decision logic without constructing a Cesium viewer.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `cesium` is a large browser module; the only thing the module-under-test touches at
// IMPORT time is `Cesium.Ion.defaultAccessToken` (a top-level assignment). Provide a
// minimal stub so the import succeeds — the framing logic under test never calls into
// Cesium itself.
vi.mock('cesium', () => ({ Ion: { defaultAccessToken: '' } }));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

type Stub = {
  formaMassingOrigin: unknown;
  formaInitialReframeFired: boolean;
  formaUserMovedCamera: boolean;
  formaTerrainBaseHeight: number;
  flyToFormaSite: ReturnType<typeof vi.fn>;
  flyToFormaPlan: ReturnType<typeof vi.fn>;
  performInitialReframe: (preset: 'oblique' | 'plan', reason: string) => void;
};

const proto = CesiumViewport.prototype as unknown as {
  performInitialReframe: (preset: 'oblique' | 'plan', reason: string) => void;
};

function makeStub(over: Partial<Stub> = {}): Stub {
  const stub: Partial<Stub> = {
    formaMassingOrigin: { lat: 51.5, lon: -0.12, centroidEast: 0, centroidNorth: 0, areaM2: 200 },
    formaInitialReframeFired: false,
    formaUserMovedCamera: false,
    formaTerrainBaseHeight: 382,
    flyToFormaSite: vi.fn(),
    flyToFormaPlan: vi.fn(),
    ...over,
  };
  stub.performInitialReframe = proto.performInitialReframe.bind(stub);
  return stub as Stub;
}

describe('§GLOBE-FRAME-NO-JUMP performInitialReframe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flies exactly once even when the base settles twice (no re-yank)', () => {
    const s = makeStub();
    // Two progressive base-settle events (the tile-streaming case that re-yanked).
    s.performInitialReframe('oblique', 'settle #1');
    s.performInitialReframe('oblique', 'settle #2');
    expect(s.flyToFormaSite).toHaveBeenCalledTimes(1);
    expect(s.formaInitialReframeFired).toBe(true);
  });

  it('does NOT fly if the user already moved the camera', () => {
    const s = makeStub({ formaUserMovedCamera: true });
    s.performInitialReframe('oblique', 'settle after user pan');
    expect(s.flyToFormaSite).not.toHaveBeenCalled();
    // Latched so a later settle is also suppressed.
    expect(s.formaInitialReframeFired).toBe(true);
    s.performInitialReframe('oblique', 'later settle');
    expect(s.flyToFormaSite).not.toHaveBeenCalled();
  });

  it('does NOT fly when no massing origin is placed (nothing to frame)', () => {
    const s = makeStub({ formaMassingOrigin: null });
    s.performInitialReframe('oblique', 'no origin');
    expect(s.flyToFormaSite).not.toHaveBeenCalled();
    // Not latched — a later real placement may still frame.
    expect(s.formaInitialReframeFired).toBe(false);
  });

  it("routes the 'plan' preset to flyToFormaPlan, once", () => {
    const s = makeStub();
    s.performInitialReframe('plan', 'settle');
    s.performInitialReframe('plan', 'settle again');
    expect(s.flyToFormaPlan).toHaveBeenCalledTimes(1);
    expect(s.flyToFormaSite).not.toHaveBeenCalled();
  });
});
