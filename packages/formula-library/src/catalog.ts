/**
 * @pryzm/formula-library — FormulaCatalog (read-only at the public surface).
 *
 * The catalogue holds the registered formulas in registration order
 * (preserved for predictable list output).  At plugin-SDK exposure we
 * call `freeze()` once and from then on `register()` throws — plugins
 * can `iterate()` + `invoke()` but cannot extend the catalogue.
 *
 * The built-in set is registered automatically at module-load via
 * `index.ts` — callers do not need to wire it up.
 */

import type {
  FormulaArg,
  FormulaDescriptor,
  FormulaEntry,
  FormulaImpl,
  FormulaResult,
} from './types.js';
import { FormulaNotFoundError, validateArgs } from './types.js';

export class FormulaCatalog {
  private readonly map = new Map<string, FormulaEntry>();
  private readonly order: string[] = [];
  private frozen = false;

  /** Register a formula.  Throws after `freeze()` and on id collision. */
  register(descriptor: FormulaDescriptor, impl: FormulaImpl): void {
    if (this.frozen) {
      throw new Error(
        `FormulaCatalog: cannot register '${descriptor.id}' — catalogue is frozen.`,
      );
    }
    if (!isWellFormedDescriptor(descriptor)) {
      throw new Error(
        `FormulaCatalog: descriptor for '${descriptor.id}' is malformed.`,
      );
    }
    if (this.map.has(descriptor.id)) {
      throw new Error(`FormulaCatalog: '${descriptor.id}' is already registered.`);
    }
    const entry: FormulaEntry = Object.freeze({ descriptor, impl });
    this.map.set(descriptor.id, entry);
    this.order.push(descriptor.id);
  }

  /** Freeze — call this BEFORE handing the catalogue to a plugin. */
  freeze(): void { this.frozen = true; }

  /** True iff `freeze()` has been called. */
  isFrozen(): boolean { return this.frozen; }

  /** Get a single descriptor.  Returns undefined if not registered. */
  get(id: string): FormulaDescriptor | undefined {
    return this.map.get(id)?.descriptor;
  }

  has(id: string): boolean { return this.map.has(id); }

  /** Snapshot of all descriptors in registration order. */
  list(): readonly FormulaDescriptor[] {
    const out: FormulaDescriptor[] = [];
    for (const id of this.order) out.push(this.map.get(id)!.descriptor);
    return Object.freeze(out);
  }

  size(): number { return this.map.size; }

  /** Invoke a formula by id with type-checked args.  Validation throws
   *  `FormulaArityError` / `FormulaArgumentError` from `./types.js`. */
  invoke(id: string, args: readonly FormulaArg[]): FormulaResult {
    const entry = this.map.get(id);
    if (!entry) throw new FormulaNotFoundError(id);
    validateArgs(id, entry.descriptor.signature, args);
    return entry.impl(args);
  }

  /** Test-only — clear AND unfreeze. */
  _resetForTests(): void {
    this.map.clear();
    this.order.length = 0;
    this.frozen = false;
  }
}

function isWellFormedDescriptor(d: FormulaDescriptor): boolean {
  if (typeof d.id !== 'string' || d.id.length === 0) return false;
  if (typeof d.name !== 'string' || d.name.length === 0) return false;
  if (typeof d.description !== 'string') return false;
  if (typeof d.version !== 'string' || d.version.length === 0) return false;
  if (!d.signature || !Array.isArray(d.signature.params)) return false;
  for (const p of d.signature.params) {
    if (typeof p.name !== 'string' || p.name.length === 0) return false;
    if (p.type !== 'number' && p.type !== 'string' && p.type !== 'array<number>') return false;
  }
  if (d.signature.returnType !== 'number' && d.signature.returnType !== 'string') return false;
  return true;
}
