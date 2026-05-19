/**
 * ScheduleDefinitionTypes — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Pure data types for the ScheduleDefinition semantic entity.
 * This is separate from src/core/schedules/ScheduleRegistry.ts which provides
 * the rendering-layer schedule definitions used by SchedulePanel.
 * ScheduleDefinitionTypes defines the Project Browser semantic entity layer.
 *
 * No imports, no circular dependencies, no DOM/Three.js.
 *
 * Contract compliance:
 *   §01 §3.3 — Follows ElementStore<T> schema conventions (stable id, metadata)
 *   §03 §1.1 — Schema-stable first-class entity; no mutation of existing types
 *   §05      — Pure data module; no UI, no rendering
 *
 * Discipline groups:
 *   ARCHITECTURE  — rooms, walls, floors, roofs, ceilings, stairs
 *   OPENINGS      — doors, windows, curtainwalls
 *   STRUCTURE     — columns, beams, slabs
 *   INTERIOR      — furniture, handrails
 *   MEP           — plumbing
 *   DATA PLATFORM — columns, custom, and existing data-platform types
 */

export type ScheduleType =
  // ── Architecture ──────────────────────────────────────────────────────────
  | 'rooms'
  | 'walls'
  | 'floors'
  | 'roofs'
  | 'ceilings'
  | 'stairs'
  // ── Openings ──────────────────────────────────────────────────────────────
  | 'doors'
  | 'windows'
  | 'curtainwalls'
  // ── Structure ─────────────────────────────────────────────────────────────
  | 'columns'
  | 'beams'
  | 'slabs'
  // ── Interior / Finishes ───────────────────────────────────────────────────
  | 'furniture'
  | 'handrails'
  // ── MEP ───────────────────────────────────────────────────────────────────
  | 'plumbing'
  // ── Data Platform ─────────────────────────────────────────────────────────
  | 'custom'
  // ── Materials Library ─────────────────────────────────────────────────────
  | 'materials';

export interface ScheduleDefinition {
    id:           string;
    name:         string;
    scheduleType: ScheduleType;
    fields:       string[];
    metadata: {
        createdAt:  number;
        modifiedAt: number;
    };
}

export interface ScheduleDefinitionStoreSnapshot {
    version:   1;
    schedules: ScheduleDefinition[];
}
