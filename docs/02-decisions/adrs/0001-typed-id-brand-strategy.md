# ADR-0001 — Typed-ID brand strategy

- **Status**: Accepted
- **Date**: 2026-04-26
- **Owners**: Agent A drafts, Founder decides — per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §1, "Joint deliverables"
- **Sprint**: S01 (D3)
- **Supersedes**: nothing
- **Related**: `01-TARGET-ARCHITECTURE.md §3`, `05-IMPLEMENTATION-PLAN.md §17`,
  `phases/PHASE-1-FOUNDATION-M1-M12.md §2.S01`

---

## 1. Context

PRYZM 2 has 20 element families (`Wall`, `Slab`, `Door`, …, `Project`). Each
family is keyed by a string. PRYZM 1 used raw `string` everywhere, which
allowed:

```ts
function moveWall(id: string) { /* … */ }

const slabId = createSlab();
moveWall(slabId); // accidentally compiles — a bug class we hit > 30 times
```

We need a representation that:

1. Is **opaque** — a `WallId` is not assignable to a `SlabId` (and vice
   versa) at compile time.
2. Has **zero runtime cost** — IDs travel over the wire as plain strings;
   no wrapper objects, no class instances.
3. Is **serialisation-friendly** — `JSON.stringify(walls)` and
   `MessagePack.encode(walls)` must work without custom replacers.
4. Is **sortable** — the wire format ULID is monotonic-ish so the event log
   can use ID order as a tie-breaker for same-millisecond events
   (`08-VISION.md §4.2`).
5. Is **debuggable** — looking at an ID in DevTools should immediately tell
   you which element family it belongs to, without consulting a registry.

## 2. Decision

PRYZM 2 uses **branded type aliases over `string`** plus a single ID
factory `createId(prefix, ulid?)`. The wire shape is `<prefix>_<26-char
Crockford ULID>`.

```ts
// packages/schemas/src/types/Id.ts
export type Id<TPrefix extends string> = string & { readonly __brand: TPrefix };
export type WallId = Id<'wall'>;
export type SlabId = Id<'slab'>;
// … 18 more

// packages/schemas/src/factory/createId.ts
export function createId<T extends ElementType>(prefix: T, ulid?: string): IdFor<T> {
  const tail = ulid ?? makeUlid();
  if (!isValidUlid(tail)) throw new Error(`bad ulid: ${tail}`);
  return `${prefix}_${tail}` as IdFor<T>;
}
```

The brand is a **phantom type** — it exists only to the TypeScript
checker. At runtime the ID is still just a string, so JSON, MessagePack,
URL-encoding, IndexedDB keys, and OTel attribute values all work without
adapters.

## 3. Considered alternatives

### A. Class wrappers (`new WallId('wall_…')`)

- Pro: nominal typing; runtime instanceof checks.
- **Con**: every ID becomes an allocation. With 50K elements in a project
  this dominates GC. JSON serialisation needs a custom replacer. CRDT
  merges in Phase 2 cannot diff class instances cheaply.
- **Con**: violates P9 (build-time enforcement) — runtime check ≠ compile
  check.

**Rejected.**

### B. UUID v4

- Pro: ubiquitous, well-tooled.
- Con: 36 chars (vs ULID's 26), not lexicographically sortable, no
  embedded timestamp. The event log relies on lexicographic ULID ordering
  as the tie-breaker between same-millisecond events.

**Rejected** for the wire format. (UUIDs are still fine inside
opaque external systems — Stripe, Supabase row IDs, etc.)

### C. Numeric incrementing IDs

- Pro: smallest possible wire size.
- **Con**: needs a centralised allocator → fights with multi-user
  collaboration (D1 differentiator) and offline-first (R1-06 risk).
- **Con**: uninformative in DevTools — `42` tells you nothing.

**Rejected.**

### D. Plain unbranded strings (status quo of PRYZM 1)

- The bug class above re-occurs.

**Rejected** — the entire reason this ADR exists.

## 4. Consequences

### Positive

- Zero-cost compile-time guarantee that wall IDs cannot be passed where
  slab IDs are expected, and vice versa, across all 20 families.
- ULID prefix is human-readable in OTel traces, IndexedDB inspector,
  Postgres rows, log lines: `wall_01H8XZ…` is self-documenting.
- The wire format is the same in every layer (L0 → L7) — no
  `WallIdToString` adapters anywhere.
- The event-log codec (S04) gets free causal ordering: same-millisecond
  events sort by ULID, which sorts by random-tail, which is uniformly
  distributed.

### Negative / mitigations

- **Brand is structurally opaque**, so generic helpers have to surface the
  prefix as a parameter (`createId(prefix, …)`) rather than inferring it
  from the type. **Mitigation**: the `IdFor<T>` mapped type lets callers
  recover the brand from a discriminator without a runtime lookup.
- **Brand is erased at runtime**, so JSON-decoded data needs revalidation.
  **Mitigation**: every store applies `Schema.parse(decoded)` at load
  time (see `Wall.parse`, `Slab.parse`, etc.). The Zod schemas regex-match
  the ID shape (`^<prefix>_[0-9A-HJKMNP-TV-Z]{26}$`).
- **Lint rule needed** to prevent `id as WallId` casts in business code.
  **Mitigation**: `pryzm/no-id-casts` rule scheduled for S07 (lands with
  the wall plugin). Until then, casts are caught manually in PR review.

## 5. Verification

The brand strategy is mechanically verified by two committed tests:

1. `packages/schemas/__tests__/typed-id.test.ts`
   - Runtime: round-trip `createId('wall')` → parse → re-equal.
   - Compile-time: `// @ts-expect-error` on a deliberate `SlabId` →
     `WallId` substitution. If the brand erodes, the test fails to type-check.

2. `packages/schemas/__tests__/round-trip.test.ts`
   - Every `SCHEMA_REGISTRY` entry parses, JSON-encodes, decodes, and
     re-parses with byte equality. Branded IDs survive the round trip
     because they are still strings.

If either test fails after a future refactor, this ADR has been violated
and must be re-opened before merging.

## 6. Migration path

Pre-existing code in `src/` (PRYZM 1) does not need to migrate. Branded IDs
apply only to packages that import from `@pryzm/protocol`. PRYZM 1 deletes
in Phase 3C.

## 7. Outcome

Accepted on 2026-04-26 as the foundation for `packages/schemas/types/Id.ts`
and `packages/schemas/factory/createId.ts`, both shipped at end of S01 D2.
This ADR is the **authoritative reference** for any future change to ID
representation; subsequent ADRs that touch IDs (e.g. ADR-008 wall-handler
triage) cite this one rather than re-litigating the brand decision.
