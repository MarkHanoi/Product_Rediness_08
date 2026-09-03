// Op #1: rename-parameter (S57 §19.6).
//
// Renames a parameter (`par_…`) WITHOUT changing its id.  Updates:
//   - `document.parameters[*].name`
//   - any `lengthExpression` in `document.solids[*]` that references
//     the old name as a bare identifier.
//   - any EXPRESSION-VALUED profile-entity coordinate that references it
//     (lane U8; see below).
//
// Identifiers in expressions are matched on word boundaries so
// `Width` does not match `WidthMM`.
//
// ⭐ §U8-RENAME-REACHES-PROFILES (lane U8). This op used to rewrite
//    `lengthExpression` ONLY. That was complete while nothing bound a PROFILE
//    coordinate to a parameter — but `profileToPolygon` has evaluated
//    expression-valued `x`/`z` since lane 4D (spec §67), the U5 fixture binds
//    a glazing profile to `GlassWidth`, and `add-box-solid` now writes
//    `-(Width) / 2` into every authored box. Renaming `Width` while leaving
//    those strings behind left a document whose geometry silently stopped
//    evaluating — the extrude followed the rename and the profile did not.
//    ⛔ Only STRING values in `entity.data` are touched; a numeric coordinate
//    is a number and has no identifier in it. `constraints[*].parameterRef` is
//    an ID and is deliberately untouched — ids do not carry names.
//
// ⚠ STILL NOT REWRITTEN, and named rather than hidden (C110 §1.4 / G-7): the
//   `expression` on OTHER PARAMETERS. A dependent formula still shows its
//   `unknown-identifier` diagnostic after a rename, which the workspace states
//   in its own status line at the moment of the rename.

import type { Migrator, RawFamily } from '../types.js';

/** Keys whose value is a sibling ENTITY ID, never an expression. */
const REFERENCE_KEYS: ReadonlySet<string> = new Set(['p1', 'p2', 'center']);

export interface RenameParameterParams {
  readonly parameterId: string;
  readonly newName: string;
}

export function makeRenameParameterMigrator(
  from: string,
  to: string,
  params: RenameParameterParams,
): Migrator {
  return {
    id: `rename-parameter:${params.parameterId}`,
    from,
    to,
    description: `rename parameter ${params.parameterId} → "${params.newName}"`,
    apply(input: RawFamily): RawFamily {
      const target = input.document.parameters.find(
        (p) => p.id === params.parameterId,
      );
      if (!target) throw new Error(`parameter ${params.parameterId} not found`);
      const oldName = target.name;
      const newName = params.newName;

      const parameters = input.document.parameters.map((p) =>
        p.id === params.parameterId ? { ...p, name: newName } : p,
      );

      const expressionRewriter = makeIdentifierRewriter(oldName, newName);
      const solids = input.document.solids.map((s) => {
        if (s.kind !== 'extrude') return s;
        return {
          ...s,
          lengthExpression: expressionRewriter(s.lengthExpression),
        };
      });

      // §U8-RENAME-REACHES-PROFILES — expression-valued coordinates follow the
      // rename, exactly as `lengthExpression` does.
      const profiles = input.document.profiles.map((pr) => ({
        ...pr,
        entities: pr.entities.map((e) => {
          let changed = false;
          const data: Record<string, number | string | boolean | null> = {};
          for (const [k, v] of Object.entries(e.data)) {
            // ⛔ `p1`/`p2`/`center` hold SIBLING ENTITY IDS, not expressions
            // (§4D-ENTITY-READ-CONTRACT). Rewriting an identifier inside an id
            // would repoint geometry; the exclusion is by key, not by shape.
            if (typeof v === 'string' && !REFERENCE_KEYS.has(k)) {
              const next = expressionRewriter(v);
              if (next !== v) changed = true;
              data[k] = next;
            } else {
              data[k] = v;
            }
          }
          return changed ? { ...e, data } : e;
        }),
      }));

      return {
        manifest: { ...input.manifest },
        document: {
          ...input.document,
          formatVersion: to,
          parameters,
          profiles,
          solids,
        },
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}

function makeIdentifierRewriter(
  oldName: string,
  newName: string,
): (expr: string) => string {
  const pattern = new RegExp(`\\b${escapeRegex(oldName)}\\b`, 'g');
  return (expr) => expr.replace(pattern, newName);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
