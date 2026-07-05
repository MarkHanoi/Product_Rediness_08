import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * §FEAT-PROJECT-ORIGIN (L-109) — Project Origin / Base Point.
 *
 * A Revit-style **Project Base Point**: the single, always-present coordination
 * datum for the whole project, visualised in the editor as an always-on BLUE
 * SPHERE at the project origin. It marks the model-coordination / collaboration
 * centre and is the **shared-coordinate origin** — semantically the C19 §1.3
 * LTP-ENU / ADR-0115 "project base point" (see `SiteLocation.basePoint`).
 *
 * SINGLETON: exactly ONE per project. It is a system-seeded element (auto-created
 * once per project at world origin, never user-drawn), so it is NOT part of the
 * C17 batch-creation catalogue — it has no "place N of these" gesture.
 *
 * PURE (C03 / P5): no THREE, no DOM, no I/O. The blue-sphere marker lives in
 * `packages/renderer-three` (P2); this schema carries only data.
 */
export const ProjectOrigin = defineElement('projectOrigin', {
  /**
   * The datum position in world/scene space. Defaults to the world origin
   * `{0,0,0}` — the shared-coordinate origin. Editable = repositioning the
   * shared-coordinate datum (via the `projectOrigin.setPosition` command, P6).
   */
  position: Vec3.default({ x: 0, y: 0, z: 0 }),
  /**
   * View-Intent visibility for the origin category. Defaults to `true` (the
   * marker is shown by default). Toggled ON/OFF from the View Intent settings
   * like any element (P7) via the `projectOrigin.setVisible` command.
   */
  visible: z.boolean().default(true),
  /** Human-readable label shown in panels/inspectors. */
  label: z.string().default('Project Base Point'),
});

export type ProjectOrigin = z.infer<typeof ProjectOrigin>;
