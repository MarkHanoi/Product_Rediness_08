// Op #21: set-parameter-default — §PARAM-VALUE-IS-EDITABLE.
//
// C110 §1.1 row 6 (`defaultValue`) · C110 §2 (`§PARAM-PRECEDENCE`,
// `§SUPERSEDED-DEFAULT`) · C110 §3 (quantity kinds) · ADR-0376 D4 · C111 §5.3-a
// (*"`FamilyParameter.defaultValue` is the SOLE definition-default authority"*) ·
// C84 EI-6 / EI-9 · spec §75.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THE ACT THIS OP PERFORMS: *"make Height 2400 instead of 2100."* The most
//    ordinary edit an author of a parametric component makes, and until this op
//    the suite could add a parameter, rename it, retype it, delete it, give it a
//    formula and remove the formula — but could NOT change its VALUE. The only
//    way to move a number was to author a constant FORMULA (`introduce-expression`
//    with `"2400"`), which is a workaround wearing a feature's clothes: it clears
//    the default (D4), records a `supersededDefault`, and leaves the parameter
//    reading as derived when the author only wanted to type a number.
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ IT REFUSES A PARAMETER THAT CARRIES A FORMULA, AND THAT IS THE POINT ──
// ADR-0376 D4: an expression BEATS a `defaultValue`. So writing a default onto a
// parameter that has a formula collects an intent that resolves to NOTHING — the
// resolver would emit `superseded-default` and use the expression, and the author
// would have typed a number that changed no geometry. That is precisely the class
// of silent no-op spec §75 forbids. The refusal names `delete-expression`, which
// is the op that makes the default reachable again.
// ⚠ Note the asymmetry, and it is deliberate: `introduce-expression` does NOT
//   refuse a parameter that has a default — it supersedes it and RECORDS what it
//   superseded. Intent flows one way (a formula is a stronger statement than a
//   number), so the pair is not symmetric and must not be made so.
//
// ─── ⛔ THE VALUE MUST MATCH THE DECLARED DATATYPE (C110 §3, ADR-0376 D3) ─────
// `FamilyParameterSchema.defaultValue` is `number | string | null` with NO
// cross-field rule, so Zod cannot catch a `length` whose default is `"tall"` —
// it validates and then fails at the evaluator, one layer away from the author.
// This op checks the pair, because a number without a declared quantity kind is
// not a measurement. The mapping follows `kindOfDataType` and nothing else:
//   length · angle · number → a finite number
//   count                   → a finite NON-NEGATIVE INTEGER (a count of 2.5 is
//                             not a count; refused rather than rounded)
//   boolean                 → 0 or 1 — the SCALAR encoding the resolver already
//                             uses (`kindOfDataType('boolean') === 'scalar'`) and
//                             the encoding `coerceValues` writes at the
//                             type-values join. ⛔ This lane mints no second
//                             spelling (`"true"`, `true`) for one concept.
//   string                  → a string
// `null` CLEARS the default, and clearing is the same op with a nullable argument
// — never a second verb (the shape `set-plane-offset` established one op ago).
//
// ─── ⛔ WHAT IT DOES NOT DO, DECLARED (C84 EI-6) ─────────────────────────────
//   • It does not touch `supersededDefault`. That field is `introduce-expression`'s
//     provenance record of ONE event; rewriting it here would make it a mutable
//     second default store (C110 §2.8 `§TWO-DEFAULT-STORES`) instead of a record.
//   • It does not touch a TYPE's `values` — that is `set-type-values`, a different
//     authority answering "what does THIS type say", and the two must not merge.
//   • It does not touch an instance override; there is no instance here.
//   • It does not RENAME or RETYPE. `change-parameter-type` owns the datatype, and
//     a value edit that silently retyped would be two acts wearing one name.

import type { FamilyParameter } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

export interface SetParameterDefaultParams {
  /** The `par_` id of an EXISTING parameter. */
  readonly parameterId: string;
  /**
   * The new definition default, in the declared datatype's own terms — a RUNTIME
   * length for `length`, the resolver's scalar 0/1 for `boolean`. `null` CLEARS
   * the default and returns the parameter to having no definition-level value.
   */
  readonly defaultValue: number | string | null;
}

export function makeSetParameterDefaultMigrator(
  from: string,
  to: string,
  params: SetParameterDefaultParams,
): Migrator {
  return {
    id: `set-parameter-default:${params.parameterId}`,
    from,
    to,
    description:
      params.defaultValue === null
        ? `clear the default of parameter ${params.parameterId}`
        : `set parameter ${params.parameterId} default to ${JSON.stringify(params.defaultValue)}`,
    apply(input: RawFamily): RawFamily {
      const doc = input.document;
      const target = doc.parameters.find((p) => p.id === params.parameterId);
      if (!target) {
        throw new Error(
          `parameter ${params.parameterId} is not carried by this definition, so there is no value ` +
            'to change',
        );
      }

      const value = params.defaultValue;

      if (value !== null) {
        if (target.expression !== null && target.expression.trim() !== '') {
          throw new Error(
            `parameter "${target.name}" carries the formula '${target.expression}', and per ADR-0376 D4 ` +
              'an expression BEATS a default — so a value typed here would resolve to nothing and ' +
              'change no geometry. Remove the formula first (delete-expression); the value it ' +
              'superseded comes back with it.',
          );
        }

        switch (target.dataType) {
          case 'length':
          case 'angle':
          case 'number': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              throw new Error(
                `parameter "${target.name}" is declared '${target.dataType}', so its value is a finite ` +
                  `number; ${JSON.stringify(value)} is not one. A number without a declared quantity ` +
                  'kind is not a measurement (C110 §3).',
              );
            }
            break;
          }
          case 'count': {
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
              throw new Error(
                `parameter "${target.name}" is declared 'count', so its value is a non-negative whole ` +
                  `number; ${JSON.stringify(value)} is not one. Refused rather than rounded — a count ` +
                  'of 2.5 is not a count, and rounding would decide for the author (spec §75).',
              );
            }
            break;
          }
          case 'boolean': {
            if (value !== 0 && value !== 1) {
              throw new Error(
                `parameter "${target.name}" is declared 'boolean', which the resolver carries as the ` +
                  `scalar 0 or 1; ${JSON.stringify(value)} is neither. This op mints no second ` +
                  'spelling for one concept.',
              );
            }
            break;
          }
          case 'string': {
            if (typeof value !== 'string') {
              throw new Error(
                `parameter "${target.name}" is declared 'string', so its value is text; ` +
                  `${JSON.stringify(value)} is not.`,
              );
            }
            break;
          }
          default: {
            throw new Error(
              `parameter "${target.name}" declares the unknown dataType ` +
                `'${String(target.dataType)}', so this op cannot say what a valid value for it is. ` +
                'Refused rather than writing one anyway.',
            );
          }
        }

        if (target.defaultValue === value) {
          throw new Error(
            `parameter "${target.name}" already has the value ${JSON.stringify(value)}; refused rather ` +
              'than reporting an edit that changed nothing.',
          );
        }
      } else if (target.defaultValue === null) {
        throw new Error(
          `parameter "${target.name}" already carries no default; refused rather than reporting a ` +
            'clear that cleared nothing.',
        );
      }

      const next: FamilyParameter = { ...target, defaultValue: value };

      return {
        manifest: { ...input.manifest },
        document: {
          ...doc,
          formatVersion: to,
          parameters: doc.parameters.map((p) => (p.id === next.id ? next : p)),
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
