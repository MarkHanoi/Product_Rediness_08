/**
 * @pryzm/formula-library — types & validation.
 *
 * Source authority:
 *   - ADR-027 (formula library extraction for plugin-SDK exposure)
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S65 work-item 9
 *   - ADR-0044 §A (S65 closure + plugin-SDK contract)
 *
 * The formula library is a CURATED, READ-ONLY catalogue of pure
 * numerical functions plugins can call without going through the
 * expr-eval interpreter.  Why a separate package and not just
 * expr-eval directly:
 *
 *   • Plugins can DISCOVER formulas (`list()`) without parsing strings.
 *   • Calling a formula by id avoids each plugin reimplementing the
 *     same arithmetic + risking off-by-one or unit bugs.
 *   • Built-in formulas can be VERSIONED here independently of
 *     expr-eval grammar evolution.
 *
 * The catalogue is read-only at the public surface: the plugin SDK
 * exposes `iterate()` + `invoke(id, args)`, never `register()`.
 * Built-in formulas are registered at module-load time; third-party
 * additions go through the marketplace at S66.
 */

export type FormulaParamType = 'number' | 'array<number>' | 'string';
export type FormulaReturnType = 'number' | 'string';

export interface FormulaParam {
  readonly name: string;
  readonly type: FormulaParamType;
  /** Optional human description for UI tooltips. */
  readonly description?: string;
}

export interface FormulaSignature {
  readonly params: readonly FormulaParam[];
  readonly returnType: FormulaReturnType;
}

export interface FormulaDescriptor {
  /** Stable id, kebab-case, e.g. `sum`, `avg`, `area-rect-mm2`. */
  readonly id: string;
  /** Human-readable title. */
  readonly name: string;
  /** Markdown-light description used by editor tooltips + plugin docs. */
  readonly description: string;
  readonly signature: FormulaSignature;
  /** Pinned semver — bumped on any signature change. */
  readonly version: string;
}

export type FormulaArg = number | string | readonly number[];
export type FormulaResult = number | string;

export type FormulaImpl = (args: readonly FormulaArg[]) => FormulaResult;

export interface FormulaEntry {
  readonly descriptor: FormulaDescriptor;
  readonly impl: FormulaImpl;
}

// ──────────────────────────────────────────────────────────────────────
//  Errors — both loud, both carry actionable detail.
// ──────────────────────────────────────────────────────────────────────

export class FormulaNotFoundError extends Error {
  public readonly name = 'FormulaNotFoundError';
  public readonly formulaId: string;
  constructor(id: string) {
    super(`FormulaCatalog: '${id}' is not registered.`);
    this.formulaId = id;
  }
}

export class FormulaArgumentError extends Error {
  public readonly name = 'FormulaArgumentError';
  public readonly formulaId: string;
  public readonly paramIndex: number;
  public readonly expected: FormulaParamType;
  public readonly received: string;
  constructor(opts: {
    formulaId: string;
    paramIndex: number;
    expected: FormulaParamType;
    received: string;
  }) {
    super(
      `FormulaCatalog['${opts.formulaId}']: param[${opts.paramIndex}] expected ${opts.expected}, received ${opts.received}.`,
    );
    this.formulaId = opts.formulaId;
    this.paramIndex = opts.paramIndex;
    this.expected = opts.expected;
    this.received = opts.received;
  }
}

export class FormulaArityError extends Error {
  public readonly name = 'FormulaArityError';
  public readonly formulaId: string;
  public readonly expected: number;
  public readonly received: number;
  constructor(opts: { formulaId: string; expected: number; received: number }) {
    super(
      `FormulaCatalog['${opts.formulaId}']: expected ${opts.expected} args, received ${opts.received}.`,
    );
    this.formulaId = opts.formulaId;
    this.expected = opts.expected;
    this.received = opts.received;
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Argument validation
// ──────────────────────────────────────────────────────────────────────

export function describeArg(arg: FormulaArg): string {
  if (typeof arg === 'number') return Number.isFinite(arg) ? 'number' : `non-finite-number(${arg})`;
  if (typeof arg === 'string') return 'string';
  if (Array.isArray(arg)) {
    if (arg.length === 0) return 'array<number>(empty)';
    return arg.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? 'array<number>'
      : 'array<mixed>';
  }
  return typeof arg;
}

export function validateArgs(
  formulaId: string,
  signature: FormulaSignature,
  args: readonly FormulaArg[],
): void {
  if (args.length !== signature.params.length) {
    throw new FormulaArityError({
      formulaId,
      expected: signature.params.length,
      received: args.length,
    });
  }
  for (let i = 0; i < args.length; i++) {
    const param = signature.params[i]!;
    const arg = args[i]!;
    const got = describeArg(arg);
    if (param.type === 'number') {
      if (typeof arg !== 'number' || !Number.isFinite(arg)) {
        throw new FormulaArgumentError({
          formulaId, paramIndex: i, expected: param.type, received: got,
        });
      }
    } else if (param.type === 'string') {
      if (typeof arg !== 'string') {
        throw new FormulaArgumentError({
          formulaId, paramIndex: i, expected: param.type, received: got,
        });
      }
    } else if (param.type === 'array<number>') {
      if (
        !Array.isArray(arg) ||
        !arg.every((n) => typeof n === 'number' && Number.isFinite(n))
      ) {
        throw new FormulaArgumentError({
          formulaId, paramIndex: i, expected: param.type, received: got,
        });
      }
    }
  }
}
