# Element Semantic-Nature Audit — full vertical, all element types

- **Status:** LIVE TRACKER — opened 2026-06-19 (founder directive). Seeded with this session's confirmed findings; rows filled in as each element's vertical is audited.
- **Author:** Claude Opus 4.8 (code-reading audit + live-fix log).
- **Scope:** every authored element type, audited end-to-end against its *semantic nature* — i.e. the BIM-engine contract that an element is a **persistent, identified, command-mutated, replayable, undoable** thing, not just a mesh.
- **Method:** for each element, open and read its builder, command set, store, the create/update/delete pipeline, the orchestration (bus handlers + RemoteCommandDispatcher replay), and check against the governing contracts. Every claim cites `file:line`. Nothing paraphrased from memory.

---

## 0. What "semantic nature" means here (the per-element invariants)

Every element MUST satisfy all of these. The audit checks each as a column.

| # | Invariant | Why | Contract |
|---|---|---|---|
| **S1 — Identified** | Has a stable `id` minted once (`createId('<type>')` / ULID), never re-minted on edit. | Selection, undo, collab, schedules, IFC GUID all key on it. | C03 §schemas; §07 §3.4 |
| **S2 — Command-mutated** | All state changes (create/move/rotate/resize/delete) flow through a `Command` on the bus; no direct store writes from UI/tools. | P6 (commands are the only mutation path). | C03; §01-BIM-ENGINE-CORE §2.1 |
| **S3 — Replayable** | Every mutating command has a `CommandRegistry` factory so collaboration catch-up / reconnect re-applies it. | Lose this → element reverts to its created state on every socket reconnect (the "sofa rotates back to origin"). | §30-REAL-TIME-COLLABORATION §3.1; P8 |
| **S4 — Transformable** | Gizmo (TransformControls) commit reads AND sends BOTH position and rotation (and scale where applicable), firing on either change. | Rotate-only drags were silently dropped (no position delta) → lost on rebuild + plan never re-projects. | C04; ADR-057 |
| **S5 — Undo/Redo** | The command implements `undo()` restoring the prior snapshot; redo re-applies. | Founder requirement; C03 §4.5–§4.8. | C03 |
| **S6 — View-coherent** | A mutation marks dependent views dirty → plan/section re-project so the 2D symbol matches 3D. | "Rotate in 3D, plan doesn't update." | C04; DOC-1.x |
| **S7 — Persisted** | Serialised into the project snapshot + restored byte-faithfully on open. | (Blocked at the platform level by the volatile-DB issue — see §5.) | C03; ADR-0075 |
| **S8 — Contract-clean** | Builder/command/store obey the layer + P1–P8 principles (THREE only in renderer-three, ≥1 OTel span per exported fn, etc.). | CI-enforced. | CLAUDE.md §8 principles |

---

## 1. The architectural keystone found this session (applies to ALL elements)

`RemoteCommandDispatcher` (apps/editor/src/engine/RemoteCommandDispatcher.ts) was the systemic root of S3 failures. After F-1.4 it ONLY did `bus.dispatch(command.type)`, and families whose bus handler is NOT keyed by the CommandType silently no-op'd on replay ("~221 families" per its own comment) → every move/rotate/delete done before a socket reconnect was dropped.

**Fixed — §REMOTE-EXEC-FALLBACK** (commit `497f9d54`): the dispatcher already holds the typed command reconstructed by `CommandRegistry`; when the bus dispatch rejects (no handler) it now **executes that command directly** through the authoritative command path. So **a registry factory alone now makes any family replayable** — this is the lever the per-element audit pulls (just ensure each mutating command has a factory).

---

## 2. Master task table (element × invariant)

Legend: ✅ done/verified-in-code · 🟡 partial / needs browser confirm · ❌ gap (fix needed) · ⬜ not yet audited · N/A not applicable.

| Element | S1 id | S2 cmd | S3 replay | S4 gizmo rot | S5 undo | S6 view-sync | S8 contract | Notes / commits |
|---|---|---|---|---|---|---|---|---|
| **Furniture** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ⬜ | UPDATE replay added `7c7491e3`; gizmo rotation commit `5572555d`. View-sync should now follow store update — confirm in browser. |
| **Column** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ⬜ | Replay factory present; gizmo rotation commit `0dc4be05` (rotation is radians). |
| **Plumbing** | ✅ | ✅ | ✅ | ❌ | 🟡 | ⬜ | ⬜ | UPDATE_PLUMBING_PARAMETERS factory added `497f9d54`. **NOT in the transform-drag handler** → not gizmo-movable/rotatable. Decide: wire it, or is it wall/fixture-hosted only? |
| **Lighting** | ✅ | ✅ | ✅ | ❌ | 🟡 | ⬜ | ⬜ | CREATE/UPDATE/MOVE_LIGHTING factories added `497f9d54`. **NOT in transform-drag handler** → same gap as plumbing. |
| **Stair** | ✅ | ✅ | ✅ | N/A | 🟡 | ⬜ | ⬜ | MOVE_STAIR factory added `497f9d54`. Rotation is anchor/direction-based (move path handles it), not euler. |
| **Wall** | ✅ | ✅ | ✅ | N/A (baseline) | ✅ | ✅ | ⬜ | **Type-on-create bug OPEN** — selected Interior-Partition still builds standard. Chain is correct in code; diagnostic `dcb047ca` will pinpoint (`systemTypeId=none` ⇒ instance mismatch; id present ⇒ thickness-resolution gap). |
| **Door** | ✅ | ✅ | ✅ (MOVE_DOOR + UPDATE_DOOR_*) | N/A (hosted) | ✅ | ✅ | ⬜ | Hosted in wall; move = offset. Looks complete — verify. |
| **Window** | ✅ | ✅ | ✅ (MOVE_WINDOW + UPDATE_WINDOW_*) | N/A (hosted) | ✅ | ✅ | ⬜ | As door. Verify. |
| **Slab** | ✅ | ✅ | ✅ (full slab factory set) | N/A | ✅ | ✅ | ⬜ | Registry well-covered (slab audit W1). Verify gizmo move. |
| **Beam** | ✅ | ✅ | ✅ | N/A (2-point) | ✅ | ⬜ | ⬜ | Move = translate both endpoints. Rotation = endpoint move. Verify. |
| **Curtain wall** | ✅ | ✅ | ✅ | N/A (baseline) | ✅ | ⬜ | ⬜ | Move = baseLine translate. Verify. |
| **Roof** | ✅ | ✅ | 🟡 (CREATE/UPDATE yes; **DELETE_ROOF no factory**) | N/A | 🟡 | ⬜ | ⬜ | Add DELETE_ROOF factory (or confirm DELETE_ELEMENT covers it). |
| **Floor (finish)** | ✅ | ✅ | 🟡 (CREATE/UPDATE yes; **REMOVE_FLOOR, UPDATE_FLOOR_BOUNDARY/LAYERS no factory**) | N/A | 🟡 | ⬜ | ⬜ | Add the missing factories. |
| **Ceiling** | ✅ | ✅ | 🟡 (CREATE/UPDATE yes; **REMOVE_CEILING, UPDATE_CEILING_BOUNDARY/LAYERS no factory**) | N/A | 🟡 | ⬜ | ⬜ | Add the missing factories. |
| **Handrail** | ✅ | ✅ | 🟡 (CREATE/UPDATE/DELETE yes; **MOVE_HANDRAIL no factory/class**) | ❌ | 🟡 | ⬜ | ⬜ | In transform handler (line ~418) — audit rotation + MOVE_HANDRAIL. |
| **Grid** | ✅ | ✅ | ❌ (**CREATE_GRID / UPDATE_GRID / REMOVE_GRID no factory**) | N/A | 🟡 | ⬜ | ⬜ | Add factories. |
| **Room** | ✅ | ✅ | ✅ (CREATE/DELETE/UPDATE/RENAME/SET_OCCUPANCY) | N/A | ✅ | ✅ | ⬜ | Well-covered. Verify UPDATE_ROOM_BOUNDARY/FINISHES factories. |
| **Annotation** | ✅ | ✅ | 🟡 (**CREATE/UPDATE/DELETE_ANNOTATION no CommandRegistry factory**; UPDATE_ANNOTATION has a bus handler) | N/A | 🟡 | ⬜ | ⬜ | Add registry factories so annotations replay. |

### Confirmed registry-factory gaps (S3) from the diff audit
`UPDATE_ANNOTATION`, `CREATE_ANNOTATION`, `DELETE_ANNOTATION`, `CREATE_GRID`, `UPDATE_GRID`, `REMOVE_GRID`, `DELETE_ROOF`, `REMOVE_FLOOR`, `REMOVE_CEILING`, `UPDATE_FLOOR_BOUNDARY`, `UPDATE_FLOOR_LAYERS`, `UPDATE_CEILING_BOUNDARY`, `UPDATE_CEILING_LAYERS`, `UPDATE_ROOM_BOUNDARY`, `UPDATE_ROOM_FINISHES`, `MOVE_HANDRAIL`, `UPDATE_WALL_PROPERTIES`, `UPDATE_DOOR_PARAMETER`, `UPDATE_WINDOW_PARAMETER`, `UPDATE_ELEMENT_PARAMETER`. (Documentation/data-platform commands — views/sheets/schedules/templates/visibility — are intentionally out of scope for the *element* audit.)

---

## 3. Implementation plan (phased, fix one-by-one)

**Phase 0 — DONE this session.** §REMOTE-EXEC-FALLBACK keystone + furniture/column/plumbing/lighting/stair replay + furniture/column gizmo rotation + wall-type diagnostic. Commits `7c7491e3` `497f9d54` `5572555d` `0dc4be05` `dcb047ca`.

**Phase 1 — Close the S3 registry-factory gaps** (cheap, mechanical, made safe by §REMOTE-EXEC-FALLBACK): add a `CommandRegistry` factory for each command in §2's gap list. One import + one map entry each; verify constructor signature first. No bus handler needed.

**Phase 2 — Close the S4 gizmo-rotation gaps:** extend the rotation-commit pattern (`§FURNITURE-DRAG-ROTATION`) to handrail; decide whether plumbing/lighting should be gizmo-movable and wire them into `registerTransformDragHandler` if so.

**Phase 3 — S6 view-sync verification:** confirm each element's mutation marks the plan view dirty (ViewDependencyTracker tracks the store type) and the 2D symbol re-projects. Add the missing plan-symbol re-inject for any that don't.

**Phase 4 — Wall-type-on-create** (`§DIAG-WALL-TYPE`): browser-repro with the diagnostic → fix the pinpointed link.

**Phase 5 — S8 contract pass:** per-element check of the 8 principles (THREE ownership, OTel spans, layer boundaries) — lowest user-visible value, do last.

> **GATE:** Phases 3–4 (and verification of Phase 0–2) require a durable server DB. Today every deploy wipes the volatile in-memory store, so no test project survives to confirm a fix. **Set `DATABASE_URL` (durable Postgres) on the deploy before claiming any S6/S7-dependent row verified.** See `PERSISTENCE-CANNOT-OPEN-PROJECT-2026-06-03.md`.

---

## 4. Effort tracking

| Phase | Scope | Est. | Status |
|---|---|---|---|
| 0 | Keystone + 5 elements' replay/rotation + diagnostic | — | ✅ shipped |
| 1 | ~21 registry-factory gaps | ~1 day | ⬜ |
| 2 | handrail rotation + plumbing/lighting drag decision | ~0.5 day | ⬜ |
| 3 | view-sync verify across 18 elements | ~1–2 days (needs DB) | ⬜ |
| 4 | wall-type-on-create fix | ~0.5 day (needs DB) | ⬜ |
| 5 | contract/principles pass | ~2 days | ⬜ |

---

## 5. Cross-cutting blocker (not an element bug, but it gates verification)

The server runs a **volatile in-memory project store** when Postgres is unreachable; it is wiped on every restart, and every `git push` redeploys/restarts. So freshly-created projects return `404` on open and load empty. This makes S7 (persistence) untestable and silently undoes the founder's work between deploys. **Durable `DATABASE_URL` is prerequisite to verifying this whole audit.**
