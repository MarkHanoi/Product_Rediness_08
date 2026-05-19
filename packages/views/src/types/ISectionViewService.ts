/**
 * ISectionViewService — contract for BIM section/elevation view management.
 *
 * Sprint F-2.3 (2026-05-15).
 * Concrete implementation: `apps/editor/src/engine/views/SectionViewService.ts`
 *
 * § Design notes
 *
 * `SectionConfig.normal` and `SectionConfig.origin` use the `Vector3Like`
 * structural type defined here — a minimal `{ x, y, z }` shape that matches
 * `THREE.Vector3` structurally without introducing a hard dep on THREE.  The
 * concrete class continues to use `THREE.Vector3` directly; callers that
 * already hold THREE references pass them without change.
 *
 * `EdgeProjectorService` and `ViewDefinition` are typed via import from
 * `@pryzm/core-app-model` so the interface is fully grounded.
 */

import type { ViewDefinition } from '@pryzm/core-app-model';

/** Minimal { x, y, z } shape — matches `THREE.Vector3` structurally. */
export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Configuration for a section/elevation cut.
 *
 * `normal` — world-space unit normal of the cutting plane.
 * `origin` — world-space point the plane passes through.
 * `depth`  — optional depth extent beyond the cutting plane (metres).
 */
export interface SectionConfig {
  normal: Vector3Like;
  origin: Vector3Like;
  depth?: number;
}

/**
 * ISectionViewService — manages BIM-style section/elevation views using
 * fragment-aware clipping planes.
 *
 * Implemented by `SectionViewService` in `apps/editor/src/engine/views/`.
 */
export interface ISectionViewService {
  /**
   * Inject the EdgeProjectorService after construction.
   * Called from `ViewController.setEdgeProjectorService()` so both code
   * paths (ViewController and SectionTool) trigger projection when a
   * `ViewDefinition` is available.
   *
   * Typed `unknown` at F-2.3; narrowed to `EdgeProjectorService` in F-2.4.
   */
  setEdgeProjectorService(svc: unknown): void;

  /**
   * Returns the current fragment bounding box.
   * Typed `unknown` at F-2.3; narrowed to `THREE.Box3` in Sprint F-2.4.
   */
  getFragmentBounds(): unknown;

  /**
   * Activates a section view with the given configuration.
   *
   * DOC-1.9: When a `ViewDefinition` is supplied, triggers a non-blocking
   * EdgeProjectorService projection so a cached `TechnicalDrawing` is ready
   * before the user switches to a technical-drawing panel.
   */
  activateSection(config: SectionConfig, viewDef?: ViewDefinition): Promise<void>;

  /** Deactivates the current section view and removes clipping planes. */
  deactivate(): void;

  /** Deactivates and releases all resources held by this service. */
  dispose(): void;
}
