// ComponentDefinitionResolver — the handlers' DEFINITION-RESOLUTION PORT.
// §COMPONENT-CATALOG (UI/UX wave, lane U0) · ADR-0376 D9 · C111 §1.1/§4.3-b ·
// C110 §3.5-a · C84 §6.2c / EI-9 · audit R1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS PORT IS HOW THE PHASE-4C DECLARED GAP CLOSES WITHOUT MOVING AUTHORITY.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Lane 4C's handlers shipped with an honest note repeated three times: *"there is
// no project-level definition registry at this commit"* — so `component.place`
// accepted any well-formed `fam_<ULID>`, `component.swapType` could dress an
// occurrence in a type its definition never declared, and
// `component.setInstanceParameter` could not ask whether a parameter exists,
// whether its `kind` is `instance`, or whether the value's shape matches its
// `dataType`. Lane U0 builds the ONE catalogue (`apps/editor/src/services/
// componentCatalog/`) and injects it HERE, through this port, so the handlers can
// finally refuse those four things BY NAME.
//
// ─── ⭐ STRUCTURAL, LIKE THE COMMITTER'S PORTS, AND FOR THE SAME REASON ────────
// The definition document lives in `@pryzm/file-format` and is loaded by
// `@pryzm/family-loader`. Declaring either as a dependency of this plugin would
// put a document-format edge on the command surface; `committer/ports.ts` already
// refused that trade for the render seam (*"kept structurally typed so this
// package does not depend on the loader"*) and the same choice is made here.
// TypeScript checks the real catalogue against this shape at the WIRING site
// (`apps/editor/src/PluginRegistry.ts`), where the two actually meet.
//
// ─── ⛔ THE PORT IS OPTIONAL ON EVERY HANDLER, AND THAT IS A CONTRACT ─────────
// A handler constructed WITHOUT a resolver behaves exactly as Phase 4C shipped it:
// format-checked references, existence NOT validated — the declared gap, still
// declared, for hosts that have no catalogue (the plugin's own unit suite, a bare
// bus harness). A handler constructed WITH one enforces existence, membership,
// instance-kind and value-shape. What is FORBIDDEN is a default: a resolver this
// package manufactured could answer "yes" for ids that name nothing, which is
// [[fake-more-capable-than-real]] at the placement seam — the exact shape
// `committer/ports.ts` outlaws with "⛔ NEITHER PORT HAS A DEFAULT".
//
// ⛔ NO RIVAL VOCABULARY (audit R1): this file mints no schema, no loader and no
// refusal channel — the refusal text still flows through `canExecute`'s `reason`
// (C16 CA-3) and the typed errors in `errors.ts`, both of which predate it.

/** Where a loaded definition came from. Carried so the UI (and a refusal) can say
 *  "from the marketplace" vs "loaded into this project" vs "shipped built-in" —
 *  provenance is a fact about the load, never an authority ranking (C84 EI-9:
 *  the catalogue keeps ONE entry per definitionId regardless of source). */
export type ComponentDefinitionProvenance = 'project' | 'marketplace' | 'builtin';

/** One named type of a definition, as the resolver exposes it. */
export interface ComponentDefinitionTypeView {
  readonly id: string;
  readonly name: string;
}

/** One declared parameter of a definition — exactly the three facts the handlers
 *  enforce with: identity, `kind` (instance-overridable or not, C111), and
 *  `dataType` (the value-shape half of C110 §3.5-a's unit-kind rule). */
export interface ComponentDefinitionParameterView {
  readonly id: string;
  readonly name: string;
  readonly kind: 'type' | 'instance';
  readonly dataType: 'length' | 'angle' | 'number' | 'count' | 'boolean' | 'string';
}

/** A loaded definition, viewed through the port. A projection of the
 *  `FamilyDocument` + `FamilyManifest` pair — NEVER a copy of the document
 *  (the document stays in the catalogue's `LoadedFamily`; a second copy here
 *  would be C84 EI-9's two-answers defect one seam down). */
export interface ComponentDefinitionView {
  readonly definitionId: string;
  readonly name: string;
  readonly semver: string;
  readonly schemaHash: string;
  readonly provenance: ComponentDefinitionProvenance;
  readonly types: readonly ComponentDefinitionTypeView[];
  readonly parameters: readonly ComponentDefinitionParameterView[];
}

/**
 * ⭐ THE ONE RESOLVER (UIUX-PLAN §U0's "one-resolver-shared-with-4E" rule).
 *
 * `has()` is deliberately the SAME signature as `committer/ports.ts`'s
 * `ComponentDefinitionSource.has` — one object satisfies both ports, so the
 * command surface and the render seam consult the SAME catalogue and cannot
 * disagree about whether a definition exists.
 *
 * Every method is SYNCHRONOUS: `canExecute` is a sync pre-flight (C16 CA-3), so
 * the catalogue answers from memory and LOADING (async, explicit) happens before
 * dispatch, never inside it.
 */
export interface ComponentDefinitionResolver {
  /** Is a definition loaded for this id? */
  has(definitionId: string): boolean;
  /** The projection for one definition, or `undefined` when none is loaded. */
  view(definitionId: string): ComponentDefinitionView | undefined;
  /** Every loaded definition. ⭐ THE HONEST EMPTY STATE: a project with no
   *  definitions answers `[]` — an answer, not an error. */
  list(): readonly ComponentDefinitionView[];
}

/** Deps bag for `buildComponentHandlerSet` / `registerComponentHandlers`. */
export interface ComponentHandlerDeps {
  /** The project's definition catalogue. Optional — see the header's contract. */
  readonly definitions?: ComponentDefinitionResolver;
}

/**
 * The value-SHAPE half of C110 §3.5-a's unit-kind rule, at the command boundary.
 *
 * Returns `null` when the value can honestly wear the dataType, else a reason
 * FRAGMENT naming both sides. ⚠ NEVER-OVERSTATE (the §KIND-ALGEBRA discipline in
 * `@pryzm/family-runtime`): this checks only what a JS value can prove — a
 * `boolean` parameter takes a boolean, a `string` parameter a string, the four
 * numeric dataTypes a finite number, and a `count` an integer. It does NOT check
 * magnitude or unit (metres arrive already canonical per ADR-0376 D3, converted
 * upstream by family-runtime's typed literals), and it is not a second kind
 * algebra — expression-kind reasoning stays in `unit-coercion.ts` (C84 EI-9).
 */
export function valueShapeRefusal(
  dataType: ComponentDefinitionParameterView['dataType'],
  value: number | string | boolean,
): string | null {
  const t = typeof value;
  switch (dataType) {
    case 'boolean':
      return t === 'boolean' ? null : `dataType 'boolean' takes true/false; got ${t} ${JSON.stringify(value)}`;
    case 'string':
      return t === 'string' ? null : `dataType 'string' takes a string; got ${t} ${JSON.stringify(value)}`;
    case 'count':
      if (t !== 'number' || !Number.isFinite(value as number)) {
        return `dataType 'count' takes a finite number; got ${t} ${JSON.stringify(value)}`;
      }
      return Number.isInteger(value as number)
        ? null
        : `dataType 'count' takes an INTEGER; got ${JSON.stringify(value)}`;
    case 'length':
    case 'angle':
    case 'number':
      return t === 'number' && Number.isFinite(value as number)
        ? null
        : `dataType '${dataType}' takes a finite number (canonical units, ADR-0376 D3); got ${t} ${JSON.stringify(value)}`;
  }
}
