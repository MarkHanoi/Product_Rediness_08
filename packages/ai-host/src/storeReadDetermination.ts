// ─── storeReadDetermination — "the store did not answer" stops being "the
//     building is empty" (C78 §1.4 · §5 · C71 §4.4 · C79 §5.2.0) ─────────────
//
// THE DEFECT THIS EXISTS TO END, and why this file's instance is the one that
// travels furthest. `WorldModelAdapter` reads six project stores like this:
//
//     private _getWalls(): any[] {
//         try { return _store('wallStore')?.getAll?.() ?? []; }
//         catch { return []; }
//     }
//
// Both an ARM A catch-to-empty AND an ARM B optional-called method, stacked. A
// store that is absent from `window` (project not yet initialised, isolation
// boundary crossed, a load-order race) and a store that threw both produce `[]`,
// which the adapter then counts:
//
//     wallCount: walls.length          → 0
//     totalElements: …                 → 0
//
// and `toPromptContext` SERIALISES THAT INTO AN LLM PROMPT. The model is told,
// flatly and in JSON, that the building has no walls. Every answer it then gives
// — "which walls can I remove without disconnecting rooms?", "what is the
// path-to-exit?" — is reasoned from a fact nobody established. This is the
// `FacadeOrientationService` shape (C79 §5.2.0, bed7aa67): an absence becoming a
// POSITIVE claim. It is the widest-travelling instance in the ledger because the
// claim leaves the type system entirely and becomes English.
//
// The same shape one method over is worse still: `getComplianceContext`'s outer
// catch returned `passRate: 1` with zero violations — an INFRASTRUCTURE FAILURE
// rendered as "fully compliant".
//
// NO RIVAL VOCABULARY. The union is C78 §8.1's, closed at eleven members, at
// `packages/command-bus/src/consequence.ts`. Two members are in play here and
// the distinction between them is the point:
//   · `RELATIONSHIP_NOT_RECORDED` — the field/edge naming the dependency was
//     never written (C79 §5.2.0). Used for `boundingWallIds`.
//   · `RELATIONSHIP_NOT_READABLE` — the substrate that would answer is absent or
//     threw. Used for a store that is missing from `window`, lacks `getAll`, or
//     raised. "I could not look", precisely.
// This module mints nothing; it classifies.
//
// WHY THE UNION IS RESTATED STRUCTURALLY RATHER THAN IMPORTED. Same reasoning as
// `packages/core-app-model/src/boundingWallDetermination.ts` and
// `packages/constraint-solver/src/wallRoomAdjacencyDetermination.ts`:
// `@pryzm/command-bus` is not a declared dependency of `@pryzm/ai-host`, and
// adding one is a manifest + lockfile change that would collide with concurrent
// work in this shared tree. `storeReadDetermination.test.ts` PINS the literals
// against the command-bus source text, so a drift in the closed union fails a
// test rather than forking silently. The type is structurally assignable to
// `ImpactDetermination`.

/**
 * The C78 §8.1 members this module produces, restated structurally.
 * @see packages/command-bus/src/consequence.ts `UndeterminedReason` — the
 * authority. Only the members this module can legitimately produce are named; a
 * partial copy of a closed union is a fork waiting to happen.
 */
export type StoreReadUndeterminedReason =
  | 'RELATIONSHIP_NOT_READABLE'
  | 'RELATIONSHIP_NOT_RECORDED';

/**
 * The answer to "what does this store hold?", with its determination status
 * carried in the type rather than inferred from a length.
 *
 * Structurally assignable to `ImpactDetermination` from
 * `@pryzm/command-bus/consequence`. `[]` is representable ONLY through the
 * `determined` arm, so C71 §4.4 ("`[]` may only ever mean zero results") holds
 * by construction.
 */
export type StoreReadDetermination<T = unknown> =
  | {
      readonly kind: 'determined';
      /** MAY be empty — an empty DETERMINED set is a real answer: the store was
       *  read, and this project genuinely holds no elements of this kind. */
      readonly elements: readonly T[];
    }
  | {
      readonly kind: 'undetermined';
      /** WHAT question went unanswered, for a prompt line or card to render. */
      readonly scope: string;
      readonly reason: StoreReadUndeterminedReason;
      readonly detail?: string;
    };

/**
 * A count that may be UNKNOWN.
 *
 * `null` — never `0` — is the unknown value, because `0` is the exact lie this
 * module exists to stop. C78's rule for `CapabilityRefusal` is the same one:
 * *"it is never `0`-as-a-stand-in for 'we did not look'."*
 */
export type CountOrUnknown = number | null;

/**
 * THE store-read discriminator. Replaces
 * `try { return _store(name)?.getAll?.() ?? []; } catch { return []; }`.
 *
 * - **store present, `getAll` present, returns an array** → `determined`,
 *   whatever its length. An empty project is a real answer.
 * - **store absent from the registry** → `undetermined` +
 *   `RELATIONSHIP_NOT_READABLE`. Nothing was read.
 * - **store present but has no `getAll`** → `undetermined`. ARM B by
 *   construction: an optional-called method that may not exist.
 * - **`getAll` THREW** → `undetermined`. ARM A: a throw is "I could not look" by
 *   definition, and converting it to `[]` asserts a different fact.
 * - **non-array return** → `undetermined`.
 *
 * TOTAL: never throws, so callers need no try/catch that would rebuild the very
 * defect this closes.
 */
export function determineStoreRead<T = unknown>(
  store: unknown,
  storeName: string,
  method = 'getAll',
): StoreReadDetermination<T> {
  const scope = `contents of ${storeName}`;

  if (store === null || store === undefined) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail:
        `${storeName} is not available in this session — the store was never read, ` +
        'so an empty project was NOT determined',
    };
  }

  const fn = (store as Record<string, unknown>)[method];
  if (typeof fn !== 'function') {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail: `${storeName} does not implement ${method}(), so its contents could not be read`,
    };
  }

  let raw: unknown;
  try {
    raw = (fn as (...a: unknown[]) => unknown).call(store);
  } catch (e) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail: `${storeName}.${method}() threw: ${String((e as Error)?.message ?? e)}`,
    };
  }

  if (!Array.isArray(raw)) {
    return {
      kind: 'undetermined',
      scope,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail: `${storeName}.${method}() returned a non-array, so its contents could not be read`,
    };
  }

  return { kind: 'determined', elements: raw as readonly T[] };
}

/**
 * The elements, or `null` when the store could not be read.
 *
 * The migration affordance for readers whose whole use is to iterate. It is NOT
 * a shorthand for `?? []` — returning `null` where the old code returned `[]` is
 * exactly the observable difference this task exists to create.
 */
export function storeElementsOrUnknown<T = unknown>(
  store: unknown,
  storeName: string,
  method = 'getAll',
): readonly T[] | null {
  const d = determineStoreRead<T>(store, storeName, method);
  return d.kind === 'determined' ? d.elements : null;
}

/**
 * The COUNT of a determination — `null` when undetermined.
 *
 * The single most important function in this file, because `….length` on a
 * swallowed `[]` is how "the store did not answer" became "the building has no
 * walls" in an AI prompt.
 */
export function countOrUnknown(d: StoreReadDetermination<unknown>): CountOrUnknown {
  return d.kind === 'determined' ? d.elements.length : null;
}

/**
 * Sum a set of counts, propagating unknown. If ANY input is unknown the total is
 * unknown — a total assembled from a partially-read model is not a total.
 *
 * NEGATIVE CONTROL NOTE: this returns a real number whenever every input is
 * known, including `0` for a genuinely empty project. It does not poison
 * totals by default.
 */
export function sumOrUnknown(counts: readonly CountOrUnknown[]): CountOrUnknown {
  let total = 0;
  for (const c of counts) {
    if (c === null) return null;
    total += c;
  }
  return total;
}

/**
 * Render a possibly-unknown count for a prompt or a UI line.
 *
 * The LLM-facing half of the fix: an unknown count must reach the model as the
 * WORD "unknown", never as a number it will reason from. C78 §5 — discovery
 * must be able to refuse, visibly.
 */
export function renderCount(c: CountOrUnknown): number | 'unknown' {
  return c === null ? 'unknown' : c;
}

/**
 * `room.boundingWallIds`, as a count that may be unknown.
 *
 * The `(room.boundingWallIds ?? []).length` site: an absent field is C79 §7.1's
 * hardcoded-empty writer, so `0` here meant "this room is unbounded" about a
 * room nobody measured. Distinct reason from a store read —
 * `RELATIONSHIP_NOT_RECORDED` — because the field, not the substrate, is what is
 * missing.
 */
export function boundingWallCountOrUnknown(room: {
  boundingWallIds?: readonly string[] | null;
}): CountOrUnknown {
  const raw = room?.boundingWallIds;
  return Array.isArray(raw) ? raw.length : null;
}
