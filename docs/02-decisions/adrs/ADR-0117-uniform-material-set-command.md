# ADR-0117 — Uniform `material.set` surface: per-family `<family>.setMaterial` handlers unified by one dispatch facade

- Status: Accepted
- Date: 2026-07-03
- Tags: `§FEAT-UNIFORM-MATERIAL-COMMAND`
- Scope:
  - New per-family handlers `plugins/{slab,ceiling,roof,floor,column,beam,stair,handrail,furniture,plumbing,lighting,curtain-wall}/src/handlers/Set<Family>Material.ts`
    (registered in each family's `handlers/index.ts` `*_HANDLER_TYPES` + `buildXHandlerSet`).
  - New UI dispatch facade `apps/editor/src/ui/property-inspector/MaterialDispatch.ts`.
  - Wired into `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts`
    (`applyChanges` gains one uniform material-set path).
  - Tests: `plugins/{slab,column,furniture}` handler suites + a facade unit test.
- Governs: C03 (schemas / commands / state — the mutation path), C11 (element
  creation/edit pipeline), C16 (command authoring). Complements the existing
  proven per-family material handlers `wall.setColor`, `room.setMaterial`,
  `structural.setMaterial`.
- Consistent with: P6 (mutations via commands only), P8 (each new exported handler
  carries an OTel span via `withHandlerSpan`), the 8-layer import rule, P1.

## Context (audit L-08)

Only walls/doors/windows could have their material/finish changed through the
command path. Every *other* element family (slabs, floors, roofs, columns, beams,
stairs, handrails, furniture, plumbing, lighting, ceilings, curtain-walls) already:

- carries `materialId` (and, for slab/ceiling/roof/floor/room, `materialColor`) on
  its Zod schema / DTO (`packages/schemas/src/elements/*`, `FloorDataSchema`);
- renders that material through its committer, which already has a
  `MATERIAL_FIELDS = ['materialId','materialColor','systemTypeId']` dirty-check that
  swaps the mesh material on a store change (no geometry rebuild); and
- shows a **Material** dropdown + **Colour Override** in the inspector's generic
  "Visuals" section (`PropertyInspector.ts`).

The only missing link was **dispatch**: `applyChanges` staged the change but had a
per-type branch for just a handful of families, so for the rest the staged material
was silently dropped. There was **no** undoable `<family>.setMaterial` command for
most families.

## Decision

### 1 — Per-family handlers of a uniform shape (NOT one generic handler)

A single generic `material.set` handler is **rejected** on architectural grounds:
under the 8-layer model each element family owns its own Immer store inside its own
L7 plugin, and a bus handler declares exactly one `affectedStores` entry. A generic
mutator would have to import all twelve family stores into one module — breaking
plugin isolation and the layer-import rule, and creating a god-module. The bus's
handler model is deliberately per-type / per-store. This is also exactly how the
three *pre-existing, proven* material handlers are built (`wall.setColor`,
`room.setMaterial`, `structural.setMaterial`).

Therefore each family gets `<family>.setMaterial` with the **uniform payload**:

```ts
interface Set<Family>MaterialPayload {
  readonly <family>Id: string;
  readonly materialId?: string | null;  // null clears the binding; undefined = untouched
  readonly materialColor?: string;       // applied only where the schema has it
}
```

- `canExecute`: id is a non-empty string; at least one of `materialId` /
  `materialColor` is provided; element exists in the store.
- `execute`: `withHandlerSpan(...)` (P8) → `produceCommand<State>` (undoable via the
  ring/cm stack) → mutate `materialId` (with `null` = delete) and, for
  colour-capable families, `materialColor` → return `{ forward, inverse, nextStates }`.
- Colour capability: slab, ceiling, roof, floor accept `materialColor`; the rest are
  `materialId`-only (a catalogue reference — identical to `structural.setMaterial`;
  their rendered colour derives from the material-library entry).

### 2 — One dispatch facade unifies them at the UI (single source of truth)

`MaterialDispatch.dispatchSetMaterial(runtime, elementType, elementId, { materialId,
materialColor })` maps an element type → its family route (`command`, `idField`,
`supportsColor`), normalises aliases (`stairs`→stair, furniture sub-types→furniture,
`curtain-wall`→curtainwall), and dispatches the family command. It returns `false`
for out-of-scope types (wall/door/window keep their own path) and when a family
cannot apply the requested change (e.g. a colour-only edit on a `materialId`-only
family), letting any legacy per-type path (furniture colour) still run.
`applyChanges` calls it once for every selected element; a `dispatchSetMaterialMany`
helper covers multi-select as one undoable gesture.

## Note on the "C18" reference in the audit brief

The audit brief cited "C18 materials/appearance". In this repository
`docs/02-decisions/contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md` is the
**creation-preview (ghost) colour** contract, not a material/appearance-override
contract. The per-element *appearance override* surface is the VG (Visibility /
Graphics) system; the per-element *material* is the `materialId` / `materialColor`
store field applied by each family committer. This ADR governs the latter and maps
onto C03/C11/C16. No change to C18 is implied.

## Consequences

- Slabs, floors, roofs, columns, beams, stairs, handrails, furniture, plumbing,
  lighting, ceilings and curtain-walls now have an undoable, persisted material-set
  command reachable from the properties panel — parity with walls/doors/windows.
- Persistence: `materialId` / `materialColor` are already part of each store DTO and
  round-trip through the project snapshot; no serializer change was needed.
- Undo: `produceCommand` inverse patches flow through the standard ring/cm stack.
- Future: the older per-type material branches in `applyChanges` (wall.setColor,
  furniture colour) can converge onto this facade in a later pass; they are left in
  place here to avoid regressions and to keep the change additive (scope L-08).
