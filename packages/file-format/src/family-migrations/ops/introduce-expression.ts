// Op #5: introduce-expression (S57 §19.6).
//
// Replaces a parameter's constant `defaultValue` (and optionally clears
// per-type overrides for that parameter) with an expression source
// string that references other parameters by name.  The expression
// itself is NOT evaluated here — that happens at bake time inside
// `@pryzm/family-runtime`.
//
// ⚠ §SUPERSEDED-DEFAULT (ADR-0376 D4). The word "Replaces" above was
//   ASPIRATIONAL: `apply` set `expression` and left `defaultValue`
//   exactly where it was.  Paired with the resolver's then-inverted
//   precedence (default before expression), that produced a migration
//   whose entire visible effect was nothing — the document gained an
//   expression that could never be reached.  The only test arm asserted
//   `expression === 'Height / 2'` and never looked at the default it
//   was supposed to have replaced, so both halves of the defect were
//   green.  `apply` now CLEARS the default and moves it to
//   `supersededDefault` for provenance.

import type { Migrator, RawFamily } from '../types.js';

export interface IntroduceExpressionParams {
  readonly parameterId: string;
  readonly expression: string;
  /** When true, removes the parameter's value from every
   *  `document.types[*].values` (since the expression now drives it).
   *  Defaults to `false`. */
  readonly clearTypeOverrides?: boolean;
  /** When `true` (the DEFAULT), a non-null `defaultValue` that the new
   *  expression supersedes is moved to `supersededDefault` for provenance.
   *  Set `false` to DROP it instead.  Either way the `defaultValue` is
   *  cleared — that is not optional, it is ADR-0376 D4. */
  readonly recordSupersededDefault?: boolean;
}

export function makeIntroduceExpressionMigrator(
  from: string,
  to: string,
  params: IntroduceExpressionParams,
): Migrator {
  return {
    id: `introduce-expression:${params.parameterId}`,
    from,
    to,
    description: `introduce expression on parameter ${params.parameterId}`,
    apply(input: RawFamily): RawFamily {
      const target = input.document.parameters.find(
        (p) => p.id === params.parameterId,
      );
      if (!target) throw new Error(`parameter ${params.parameterId} not found`);
      if (target.expression && target.expression.trim().length > 0) {
        throw new Error(
          `parameter ${params.parameterId} already has an expression; ` +
            `use a paired delete-expression migrator first`,
        );
      }

      const parameters = input.document.parameters.map((p) => {
        if (p.id !== params.parameterId) return p;
        // §SUPERSEDED-DEFAULT — clearing the default is the POINT of this op,
        // not a nicety. Leaving it behind is what made the migration a no-op.
        const next = { ...p, expression: params.expression, defaultValue: null };
        if (p.defaultValue !== null && params.recordSupersededDefault !== false) {
          return { ...next, supersededDefault: p.defaultValue };
        }
        // No default to record — and do not carry a STALE supersededDefault
        // forward from an earlier op onto a value it never described.
        // `next` is a fresh spread, so this never mutates `input` (Migrator.apply
        // is contractually pure — see family-migrations/types.ts).
        delete (next as { supersededDefault?: number | string }).supersededDefault;
        return next;
      });

      const types = params.clearTypeOverrides
        ? input.document.types.map((t) => {
            if (!(params.parameterId in t.values)) return t;
            const { [params.parameterId]: _r, ...rest } = t.values;
            return { ...t, values: rest };
          })
        : input.document.types;

      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to as '1.0',
          parameters,
          types,
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
