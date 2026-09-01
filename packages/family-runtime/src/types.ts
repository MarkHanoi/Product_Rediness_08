// @pryzm/family-runtime — public types.
//
// These types are the contract shared by the family editor, the
// bake-worker, and the AI worker.  Keep them tiny and dependency-free
// — every consumer must be able to import this file without paying
// for THREE, DOM, or any heavy dependency.

/**
 * Canonical parameter unit.  `'length'` parameters are stored in
 * millimetres, `'angle'` in radians, `'count'` / `'number'` are
 * unit-less, `'boolean'` is 0 or 1, `'string'` carries an opaque
 * label not used in the numeric resolver.
 */
export type FamilyParameterDataType =
  | 'length'
  | 'angle'
  | 'number'
  | 'count'
  | 'boolean'
  | 'string';

/**
 * 'type' parameters are baked per family-type (one value per
 * placement type); 'instance' parameters are overridable per placed
 * instance in the host project.
 */
export type FamilyParameterKind = 'type' | 'instance';

/** A single parameter declaration in a family document. */
export interface FamilyParameter {
  readonly id: string;
  readonly name: string;
  readonly kind: FamilyParameterKind;
  readonly dataType: FamilyParameterDataType;
  /** Family-level default. Always in canonical units (mm / rad).
   *  ⚠ RANKED BELOW `expression` — ADR-0376 D4. See `resolveParameter`. */
  readonly defaultValue: number | string | null;
  /** Optional expression evaluated at resolve-time. BEATS `defaultValue`
   *  (ADR-0376 D4); an instance or type override still beats it. */
  readonly expression: string | null;
  /** Provenance only, never resolved: the `defaultValue` that an
   *  `introduce-expression` migration pre-empted (ADR-0376 D4). Absent on
   *  every parameter that never had one — it is NOT defaulted to null, so
   *  existing documents round-trip byte-identically. */
  readonly supersededDefault?: number | string;
  /** Optional IFC mapping. */
  readonly ifcMapping: IfcMapping | null;
  /** True if exposed to the host editor's instance inspector. */
  readonly exposed: boolean;
}

/** A family-type — a named pre-baked instance configuration. */
export interface FamilyType {
  readonly id: string;
  readonly name: string;
  /** Per-parameter override values, keyed by parameter id.  Numeric
   *  values are already in canonical units. */
  readonly values: Readonly<Record<string, number | string>>;
}

/** IFC binding (`Pset_DoorCommon` / `IsExternal` etc.). */
export interface IfcMapping {
  readonly psetName: string;
  readonly propertyName: string;
}

/** Per-instance overrides at placement time in the host project. */
export type InstanceOverrides = Readonly<Record<string, number | string>>;

/** Input bundle for the resolver. */
export interface ResolverInput {
  readonly parameters: readonly FamilyParameter[];
  readonly type: FamilyType | null;
  readonly instanceOverrides: InstanceOverrides;
}

/** Successful resolver output. */
export interface ResolverOk {
  readonly ok: true;
  /** Resolved values keyed by parameter NAME (not id) — names are the
   *  identifiers used inside expressions. */
  readonly values: Readonly<Record<string, number | string>>;
  /** Topologically-sorted resolution order (parameter ids). */
  readonly order: readonly string[];
  /** Diagnostics that did not abort resolution. */
  readonly diagnostics: readonly ResolverDiagnostic[];
}

/** Failed resolver output. */
export interface ResolverErr {
  readonly ok: false;
  readonly diagnostics: readonly ResolverDiagnostic[];
}

export type ResolverResult = ResolverOk | ResolverErr;

/** Resolver diagnostic. */
export interface ResolverDiagnostic {
  readonly severity: 'warn' | 'error';
  readonly code:
    | 'unknown-identifier'
    | 'cycle'
    | 'expression-parse'
    | 'expression-eval'
    | 'invalid-default'
    /** WARN (never error): the parameter carries BOTH an expression and a
     *  `defaultValue`. Per ADR-0376 D4 the expression wins and the default is
     *  dead data — a document predating the `introduce-expression` fix. */
    | 'superseded-default'
    | 'invalid-override'
    | 'duplicate-name'
    | 'invalid-name';
  readonly parameterId: string | null;
  readonly message: string;
}
