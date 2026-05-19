/**
 * `PsetUpdateCommand` schema + helpers (Phase 3-B Sprint S57).
 *
 * Pure functions — no DOM. Exposed so the editor's command bus can validate
 * and apply Pset updates without depending on the panel UI.
 */

import type { IFCInspectorMeta, PsetUpdateCommand, PsetValue } from './types.js';

export type { PsetUpdateCommand } from './types.js';

const VALID_VALUE_KINDS = new Set(['string', 'number', 'boolean']);

/** Parse + validate a candidate `PsetUpdateCommand`. Throws on bad shape. */
export function parsePsetUpdateCommand(input: unknown): PsetUpdateCommand {
  if (input == null || typeof input !== 'object') {
    throw new Error('PsetUpdateCommand: expected object');
  }
  const obj = input as Record<string, unknown>;
  if (obj.kind !== 'element.updatePset') {
    throw new Error(`PsetUpdateCommand: kind must be element.updatePset, got ${String(obj.kind)}`);
  }
  if (typeof obj.elementId !== 'string' || obj.elementId.length === 0) {
    throw new Error('PsetUpdateCommand: elementId must be non-empty string');
  }
  if (typeof obj.psetName !== 'string' || obj.psetName.length === 0) {
    throw new Error('PsetUpdateCommand: psetName must be non-empty string');
  }
  if (typeof obj.propertyName !== 'string' || obj.propertyName.length === 0) {
    throw new Error('PsetUpdateCommand: propertyName must be non-empty string');
  }
  if (obj.value !== null && !VALID_VALUE_KINDS.has(typeof obj.value)) {
    throw new Error(`PsetUpdateCommand: value must be scalar (string|number|boolean|null), got ${typeof obj.value}`);
  }
  return {
    kind: 'element.updatePset',
    elementId: obj.elementId,
    psetName: obj.psetName,
    propertyName: obj.propertyName,
    value: obj.value as PsetValue,
  };
}

/**
 * Pure reducer — apply a `PsetUpdateCommand` to a single inspector meta.
 * Returns a *fresh* meta with the change applied; the original is untouched.
 * Lazy-creates the pset if it doesn't exist.
 */
export function applyPsetUpdate(meta: IFCInspectorMeta, cmd: PsetUpdateCommand): IFCInspectorMeta {
  if (cmd.elementId !== meta.pryzmElementId) {
    throw new Error(`applyPsetUpdate: elementId ${cmd.elementId} !== meta.pryzmElementId ${meta.pryzmElementId}`);
  }
  const psets = { ...meta.psets };
  const pset = { ...(psets[cmd.psetName] ?? {}) };
  pset[cmd.propertyName] = cmd.value;
  psets[cmd.psetName] = pset;
  return { ...meta, psets };
}

/** `typeof` value with `null` extracted as its own kind. */
export function valueKind(v: PsetValue): 'string' | 'number' | 'boolean' | 'null' {
  if (v === null) return 'null';
  return typeof v as 'string' | 'number' | 'boolean';
}
