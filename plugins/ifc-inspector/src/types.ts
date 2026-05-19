/**
 * Public types for `@pryzm/plugin-ifc-inspector`.
 *
 * Phase 3-B Sprint S57 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.2).
 */

export type PsetValue = string | number | boolean | null;
export type Pset = Record<string, PsetValue>;

/**
 * Subset of `IFCElementMeta` (from `@pryzm/plugin-ifc-export`) the editor
 * needs to render. Duck-typed to avoid pulling the export plugin into the
 * inspector's runtime closure.
 */
export interface IFCInspectorMeta {
  pryzmElementId: string;
  globalId: string;
  typeName: string;
  name?: string;
  psets: Record<string, Pset>;
}

/**
 * Command emitted when the user edits a property value. Per spec §3.2 lines
 * 884-891 the kind is `element.updatePset`. The editor's command bus
 * routes this to the persistence layer + IFC meta-store.
 */
export interface PsetUpdateCommand {
  kind: 'element.updatePset';
  elementId: string;
  psetName: string;
  propertyName: string;
  value: PsetValue;
}

/** Minimal command-bus contract — single `execute()` entry. */
export interface CommandBusLike {
  execute(cmd: PsetUpdateCommand): void | Promise<void>;
}
