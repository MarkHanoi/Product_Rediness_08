# SPEC — Master Material Database (single-source unification)

| | |
|---|---|
| **Status** | ACTIVE — implements [C85](../../02-decisions/contracts/C85-MASTER-MATERIAL-DATABASE.md), ratified by [ADR-0333](../../02-decisions/adrs/ADR-0333-the-material-catalogue-is-one-record-shape-at-L0.md) |
| **Created** | 2026-08-18 |
| **Scope** | Making **one** material vocabulary reachable from every layer, and folding the rival tables into it. |
| **NOT this spec** | The user-facing materials *repository* — create/upload/remove, textures, per-element assignment, the schedule, IFC export. That is [SPEC-MATERIALS-REPOSITORY](./SPEC-MATERIALS-REPOSITORY.md), which remains the roadmap for those and is **corrected, not replaced**, by this work. |
| **Governs** | `packages/schemas/src/materials/**` · `packages/core-app-model/src/materialLibrary.ts` · `packages/geometry-kernel/src/producers/_internal/composeMaterialKey.ts` · `packages/ai-host/src/intents/finishRef.ts` · `plugins/*/src/committer/material-bridge.ts` · `apps/editor/src/ui/property-inspector/FloorPropertySection.ts` |

---

## §1 — The problem in one paragraph

Eight vocabularies describe one concept — three more than the brief named. Four of them exist because the seventh fact is true:
`materialLibrary.ts` imports THREE and builds `THREE.Color` at module load, so **no THREE-free
consumer can import the master** — including `geometry-kernel`, the package that composes the
material key and therefore decides the rendered colour. Every consumer that could not reach the name
copied the colour. The unification is therefore not a de-duplication pass; it is a **relocation**,
after which de-duplication becomes possible. See C85 §0.2.

## §2 — Target shape

```
packages/schemas/src/materials/            ← L0, pure, no THREE / DOM / I/O
  materialRecord.ts    MaterialRecord, MaterialCategory
  materialCatalog.ts   MATERIAL_CATALOG (204 rows) + findMaterialRecord + materialHex
  index.ts
        ▲                    ▲                      ▲
        │                    │                      │
 geometry-kernel      core-app-model            plugin-sdk → plugins
 composeMaterialKey   materialLibrary.ts        (adapters only; parse keys)
 (resolves id→hex)    (DERIVED THREE view)      UserMaterialStore (T2, user rows)
                             ▲
                        ai-host finishRef  (aliases stay; hex/label derived)
```

`MaterialRecord` is **adopted from the shipped `UserMaterialDef`** (C85 §4.6), not invented:

```ts
interface MaterialRecord {
  id: string; label: string; category: MaterialCategory;
  color: string;                 // '#rrggbb'
  metalness: number; roughness: number;
  opacity: number; transparent: boolean;
  textureUrl?: string;
  source: 'builtin' | 'user';
}
```

## §3 — Slices, in dependency order

| # | Slice | Files | Done when |
|---|---|---|---|
| **S1** | Catalogue at L0; `STANDARD_MATERIAL_LIBRARY` derived | `schemas/src/materials/*`, `materialLibrary.ts` | 204 rows present; zero colour literals remain in `materialLibrary.ts`; all five accessors unchanged in name/signature/behaviour |
| **S2** | `composeMaterialKey` resolves `materialId` → hex | `geometry-kernel/.../composeMaterialKey.ts` | a key composed from an id alone carries that id's master hex, not `#d4c5b0` |
| **S3'** | ⛔ handrail WITHDRAWN (a concurrent lane wired its own `resolveColour()` and owns the file); coverage proved on **door** instead | `geometry-kernel/src/producers/door.ts` — unchanged, it already routes through `composeMaterialKey` | a door carrying only a `materialId` resolves that material's master colour into the slot its bridge reads |
| **S4** | Floor panel swatches from the master | `FloorPropertySection.ts` | a layer with a master `materialId` shows that material's colour; the function palette no longer overrides it |
| **S5** | `finishRef` derives | `ai-host/src/intents/finishRef.ts` | zero hex literals in the file; every finish's hex equals `materialHex(its id)` |
| **S6** | Named unresolved diagnostic | `composeMaterialKey.ts`, wall bridge | an unknown id yields `unresolved:<id>` and a visibly-wrong colour, deduplicated per id |
| **S7** | Gate | `tools/ga-gate/check-material-single-source.ts` | three arms per C85 §7; exits 0 |

Deferred, each with its blocker named — C85 §8.2 **S8** `RENDER_MATERIAL_LIBRARY` (**8** unmapped ids
= a design decision) · **S9** the `materialName` family in three parts, one blocked on an **acoustic
facet** because `PhysicsEngine.nrcFromName()` reads that prose today · **S10** the AI family (no batch carrier) · **S11** SPEC-MATERIALS-REPOSITORY §3.2–§3.5 ·
**S12** the C65 §3.3 `declaredProjectScopes` breach.

## §4 — Controls, each watched RED before the fix

Per §COMMITTED-IS-NOT-REACHABLE, every control asserts at the layer that **decides the value**, never
at a pure function's return.

| Control | Asserts | RED before |
|---|---|---|
| **C-1 coverage** | a family that read **no** library (**door**) resolves a master colour end to end: `materialId` → `composeMaterialKey` → colour slot → `colorOfDoorMaterialKey` → `THREE.MeshStandardMaterial.color` | the slot carried `#d4c5b0` whatever the id |
| **C-2 propagation** | changing a master row's colour changes what the consumer resolves — the reference model's whole point (C85 §2.2) | consumers held transcribed copies |
| **C-3 diagnostic** | an unknown id yields a **named** unresolved marker, not beige | `#d4c5b0` returned silently |
| **C-4 non-regression** | the six families already reading the master are unchanged; all five accessors behave identically | — (must stay green throughout) |
| **C-5 fidelity** | all 204 rows survive the move: ids, labels, categories, scalars; 198 hexes bit-identical, 6 within the measured 0.951/255 bound | — |
| **C-6 derivation** | every `finishRef` hex equals `materialHex(id)` — the drift the old header asked humans to prevent is now mechanical | header instructed manual sync |

## §5 — Rules for anyone extending this later

1. **Add rows to the master, never beside it.** A projection that needs a row the master lacks adds
   it to the master (C85 §1.3).
2. **A new material-ish field is a `materialId`, not a hex and not an enum** (C85 §2.1, §4.5).
3. **An adapter that needs editing when a material is recoloured is not an adapter** (C85 §3).
4. **No capability family without a carrier** (C85 §6.2) — and the carrier's liveness is proven by an
   executed read-back from a RENDER/PERSIST/EXPORT store, never `success: true` (C16 §5.1 CA-21).
5. **Never substitute on failure.** Visibly wrong plus a named reason beats plausibly wrong (C65 §3.4).
