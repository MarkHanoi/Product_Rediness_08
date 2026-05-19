/**
 * @pryzm/formula-library — public barrel.
 *
 * S65 work-item 9 per phase-doc-2 §S65 + ADR-027.  Read-only formula
 * catalogue exposed to plugin-SDK and served by the api-gateway at
 * `GET /v1/formulas` + `GET /v1/formulas/:id`.
 *
 * The DEFAULT_CATALOG below is pre-populated with the 12 built-in
 * formulas and is FROZEN — plugins importing this module receive the
 * frozen catalogue.  Tests + the api-gateway can construct their own
 * `FormulaCatalog` instance if they need to register experimental
 * formulas in isolation.
 */

import { FormulaCatalog } from './catalog.js';
import { BUILTIN_FORMULAS } from './builtins.js';

export {
  FormulaCatalog,
} from './catalog.js';

export {
  type FormulaParamType,
  type FormulaReturnType,
  type FormulaParam,
  type FormulaSignature,
  type FormulaDescriptor,
  type FormulaArg,
  type FormulaResult,
  type FormulaImpl,
  type FormulaEntry,
  FormulaNotFoundError,
  FormulaArgumentError,
  FormulaArityError,
  validateArgs,
  describeArg,
} from './types.js';

export { BUILTIN_FORMULAS } from './builtins.js';

/**
 * The default, frozen catalogue exposed to plugins via the SDK.  Built
 * lazily once on first import; subsequent imports get the same
 * instance (singleton — see ADR-0044 §B).
 */
let _defaultCatalog: FormulaCatalog | null = null;

export function getDefaultCatalog(): FormulaCatalog {
  if (_defaultCatalog === null) {
    const c = new FormulaCatalog();
    for (const entry of BUILTIN_FORMULAS) {
      c.register(entry.descriptor, entry.impl);
    }
    c.freeze();
    _defaultCatalog = c;
  }
  return _defaultCatalog;
}

/**
 * Build a fresh, unfrozen catalogue with all built-ins pre-registered
 * — used by tests + by the api-gateway when it wants to layer
 * experimental formulas on top of the built-in set.  Callers SHOULD
 * call `freeze()` before exposing to plugins.
 */
export function buildCatalogWithBuiltins(): FormulaCatalog {
  const c = new FormulaCatalog();
  for (const entry of BUILTIN_FORMULAS) {
    c.register(entry.descriptor, entry.impl);
  }
  return c;
}
