# SPEC — LINKED MODELS (ADR-0346 · C13 §3.13)

| Field | Value |
|---|---|
| Status | **Partly implemented and REACHABLE.** §9 is landed and measured; §10 is deferred by name; §11 is what remains unproven. |
| Date | Created 2026-08-21 (lane LINK2) |
| ADR | [ADR-0346](../../02-decisions/adrs/ADR-0346-a-linked-model-is-a-reference-the-host-owns-never-elements-the-host-holds.md) |
| Contracts | **C13 §3.13 (governing)**, C19 §1.3, C12, C36 §1.12/§2.3, C03/C16, C05/C47, C09/C25, C69, C82, C83, C74, C10 · P1/P2/P3/P6/P7/P8 |
| Issue-log | L-2900…L-2905 (LINK1) · **L-3150…L-3161 (LINK2)** |

---

> ⚠ **WHY THIS FILE EXISTS AT ALL — and it is a defect record, not a preamble.**
>
> ADR-0346 was written citing this SPEC in its header, and **delegated its two most
> load-bearing sections to it**: §9 reads *"See SPEC-LINKED-MODELS §9 for the
> landed/deferred split, stated per item"* and §10 reads *"Named in SPEC §10."*
>
> **This file did not exist.** So the landed/deferred split — the one record that
> tells a reader which parts of a half-built feature are real — was recorded
> **nowhere**, while two documents each pointed at the other.
>
> Worse, the citation had reached the **product surface**: `link.setDisplay`'s
> refusal for the unbuilt detailed representation ends *"See SPEC-LINKED-MODELS
> §10."* (`linkBusHandlers.ts:252`) — a sentence shown to a **user**, naming a
> document that could not be opened. Measured 2026-08-21: **4 citations, 0 files.**
>
> This is the shape `tools/ga-gate/check-contract-cited-paths.ts` polices for
> `contracts/**` (L-960, 1 528 citations / 491 unresolved). **ADRs and SPECs have no
> such gate**, which is why this went unnoticed. Recorded as **L-3162**.

---

## 1 · What a linked model is

Another PRYZM project's building, displayed **read-only** inside this one and
anchored on the shared parcel datum, so the host's author can **see** it, **measure
to** it and **coordinate against** it — without owning or editing it. Revit's
*linked model* / IFC reference-model concept.

**The one invariant everything else follows from (ADR-0346 D1):**

> What crosses the project boundary is a **REFERENCE the host owns**, never
> **elements the host holds.**

The host persists a small `LinkedModelRef`. The source project's elements enter no
`ElementStore`, no `ElementRegistry`, no `BimManager`, no semantic graph, no undo
stack, and no `ProjectSerializer` element capture. The linked geometry lives in a
separate, non-owned scene subtree tagged with its source project, excluded from
serialisation, disposed on project switch.

---

## 2 · The user's flow, end to end

1. **Project Browser → GIS/Site tab → "Linked Models"** opens the panel.
   *That tab because **the parcel is the anchor**: placement derives from both
   projects' `SiteModel.location`, which is authored in that very tab.*
2. **"＋ Link a project…"** lists the user's other projects.
3. **Choose a version.** Newest is preselected and **pinned** (ADR-0346 D5).
   "Follow latest" is one click away and labelled in words.
4. **The C83 verdict is shown BEFORE anything is created** — see §3.
5. **Link.** It renders as translucent PRYZM-violet massing, one draw call.
6. **Show / Hide / Refresh / Unlink** per row; the version and placement of every
   link are visible on its row at all times.

---

## 3 · Placement is a C83 decision the user SEES (ADR-0346 D4)

`resolveLinkAnchor()` is pure and returns the verdict as a **value**. The panel
renders it through `presentLinkAnchor()`; `link.create`'s `canExecute` validates
with the **same function**, so the dialog cannot offer a placement the command then
refuses.

| Verdict | When | What the user is offered |
|---|---|---|
| **FINE** | both origins present, ≤ 5 km apart | *"Ready to align on the shared site datum"* + the measured separation. One action: **Link project**. |
| **INADVISABLE** | both present, > `FAR_SEPARATION_M` (5 km) | *"These projects are further apart than expected"*, naming **BOTH** numbers — the measurement **and** the threshold (C74). **Link anyway** (requires explicit confirmation) **or Place by hand**. |
| **IMPOSSIBLE** | either origin missing | *"Cannot align automatically."* Auto-alignment is refused **by name**; **the link is not**. The hand-placed path (E / N / elevation / rotation) is offered. |

**`separationM` is `null`, never `0`, when unknowable.** "I could not tell" and
"they are in the same place" must never share a value.

**Nothing is ever placed at the origin as a fallback.** A silent mis-alignment
renders, measures and lies; a refusal does not.

---

## 4 · Version pinning (C36 §1.12, adopted verbatim)

**Pinned is the default; `latest` is a declared opt-in.** A linked model is a
coordination datum: if the source moves under the host without the host's author
knowing, every dimension drawn to it is silently wrong.

A pinned version that no longer resolves surfaces as `MISSING_LINK_VERSION` and the
link renders **nothing, with a named reason** — never a silent re-resolve to latest.

**`latest` is NOT live (§LINK-LATEST-IS-NOT-LIVE, L-3161).** It re-resolves on
project open and on an explicit **Refresh**. It does not poll and never mutates
under the user mid-session. The row says so in words.

---

## 5 · Representation and cost (ADR-0346 D6)

| Mode | Scene cost | State |
|---|---|---|
| **massing** (default) | **1 mesh, 1 draw call**, N box instances (N = level bands) | **built** |
| **detailed** | ≈ the source project's own mesh count | **deferred — §10** |
| **hidden** | **0** — nothing is mounted at all | **built** |

`linkMassingCost()` **computes** this rather than asserting it, and a test pins it.
It is **arithmetic, not a frame reading** — deliberately, because L-2502 measured
that the `info.render.calls` figure this repo has been quoting on WebGPU is
cumulative-since-start, not per-frame.

The panel surfaces the number in three places: the budget line, each row's cost
line, and the create dialog **before** the user commits.

---

## 6 · Visibility is INTENT, never `.visible` (P7 / C25 / C09)

A link's visibility is the persisted `display` field on its ref, changed only
through `link.setDisplay`. No UI code touches a THREE object. The renderer **mounts
or unmounts** in response — so *hidden* is not an invisible subtree, it is **no
subtree**, which is why hiding is a real performance answer rather than a cosmetic
one.

---

## 7 · A linked model is never selectable, at four doors (ADR-0346 D8)

1. `userData.underlayActive = true` — honoured by `SelectionManager`'s selectable cache.
2. No `userData.selectable`; `elementType` is `link:<id>`, not a semantic type.
3. `raycast = () => {}` — closes the BVH path.
4. `layers.set(EDITOR_LAYER)` — `SelectionManager`'s raycaster is pinned to `BIM_LAYER`.

There is no fifth door at the command level because there is nothing to resolve:
linked elements are in no store, so a command naming one finds nothing.

**Clicking a linked model passes through to your own geometry behind it.** The panel
states this in words — silent inaction is indistinguishable from a broken tool.

---

## 8 · C13: TAGGED, never EXEMPTED (§3.13)

The subtree **root** carries `pryzmLinkId`, `pryzmLinkSourceProjectId`,
`pryzmLinkHostProjectId`. The scope `links.linkedModels` is the one declared owner,
its ADR-0298 probe answers the **HOST** id, and `describeLinkedModels()` enumerates
every live link **by id in every report, clean or not**.

Untagged foreign geometry remains a violation. The audit **gains** an arm here and
loses none.

---

## 9 · LANDED — what is built, wired and measured

Every row below was **executed**, not merely written. 55 assertions across three
suites (`linkedModelsEngine.spec.ts`, `linkedModelsViewModel.spec.ts`,
`linkedModelsReachability.spec.ts`).

| # | Item | Where | Proof |
|---|---|---|---|
| 9.1 | `LinkedModelRef` + branded `LinkedModelId` + pin/anchor/display schemas | `packages/schemas/src/link/LinkedModelRef.ts` | id mint/validate + schema parse specs |
| 9.2 | `resolveLinkAnchor` — the pure C83 decision + ENU math | `packages/schemas/src/link/resolveLinkAnchor.ts` | 7 specs incl. all three verdicts |
| 9.3 | `LinkedModelStore` — refs only, C13 teardown owner | `apps/editor/src/engine/links/LinkedModelStore.ts` | serialize→restore round-trip; host-mismatch **drop + count** |
| 9.4 | `linkedModelScope` — C13 §3.13 named owner + ADR-0298 probe | `.../links/linkedModelScope.ts` | registered in `declaredProjectScopes.ts:426` |
| 9.5 | `deriveLinkMassing` — bands from a source snapshot | `.../links/linkMassing.ts` | 9 specs against **producer-shaped** fixtures |
| 9.6 | `linkMassingCost` — the structural cost, computed | `.../links/linkMassing.ts` | pinned: 1 draw call non-empty, 0 empty |
| 9.7 | `LinkedModelSceneRenderer` — one InstancedMesh, 4 pick opt-outs | `.../links/LinkedModelSceneRenderer.ts` | ⚠ **not** browser-verified — see §11 |
| 9.8 | `linkSourceGateway` — read a source WITHOUT `ProjectLoader` | `.../links/linkSourceGateway.ts` | route shapes read against `server.js` |
| 9.9 | `probeLinkSource` — the pre-create read (**L-3154**) | `.../links/linkSourceGateway.ts` | closes the anchor/ref circle |
| 9.10 | Four bus verbs: `link.create/remove/setDisplay/setPin` | `.../links/linkBusHandlers.ts` | registered `initBusHandlers.ts:3036` |
| 9.11 | Snapshot round-trip | `ProjectSerializer.ts:1454`, `ProjectLoader.ts:2463` | store-level round-trip pinned |
| 9.12 | **The panel** | `apps/editor/src/ui/links/LinkedModelsPanel.ts` | renders against a **null runtime**; DOM asserted |
| 9.13 | **Reachability** — Project Browser → GIS tab → "Linked Models" | `ProjectBrowserPanel.ts` | 2-arm suite: module loads **and** call site exists |
| 9.14 | `refreshLink` + the `latest` semantics (**L-3161**) | `.../links/linkedModelController.ts` | row states WHEN it updates |

---

## 10 · DEFERRED, by name

Nothing here is claimed to work. Each is refused **by name** where a user can reach it.

| # | Deferred item | How it presents today |
|---|---|---|
| 10.1 | **`display: 'detailed'`** — full source geometry | `link.setDisplay` refuses it by name; the panel shows a **disabled** control stating the cost it would add. **This is the §10 the refusal string cites.** |
| 10.2 | **Cross-USER linking** (L-2901) | All three project read routes scope to `owner_id` on the Supabase path. Surfaces as `SOURCE_UNREACHABLE` **naming the limit**, and the empty picker says so. |
| 10.3 | **Plan / elevation / section projection** of a linked model | Not built. A link is 3D-only today. |
| 10.4 | **Clash detection against a link** (C36 federation) | `FederationMember` still has **0** implementations (L-2902). The pin semantics are adopted; the consumer is not built. |
| 10.5 | **Schedules / property panel** for a linked model | Not built. Deliberately possible later — the ref is not a `ContextBuilding` precisely so this stays legal (L-2903). |
| 10.6 | **Anchor divergence detection** | Both origins are RECORDED on the ref so a later divergence is *detectable*; nothing yet *checks*. |
| 10.7 | **Undo for link operations** | Declared NONE, not omitted — `affectedStores: []`. Unlink/re-link is the escape hatch. |

---

## 11 · UNPROVEN — read this before quoting anything above

- **No browser verification.** `LinkedModelSceneRenderer` has **never been observed
  mounting geometry in a running editor** by any lane. The renderer, the four
  picking opt-outs, the violet massing appearance and the C13 audit's
  `scene.linkedModel` arm are all **argued from code, not seen**. This is the
  single largest open item and it is the one a browser session closes fastest.
- **The end-to-end create → render path has not been run against a live server.**
  Route shapes were read from `server.js` and matched by inspection; no lane has
  actually fetched another project's snapshot and drawn it.
- **Per-frame draw-call cost is UNMEASURED.** §5's number is the structural bound
  and is arithmetic. L-2502 shows the console figure this repo quotes is cumulative.
- **Source-snapshot fetch + massing-build latency is UNMEASURED.**
- **`hostProjectId` agreement between save and restore is UNVERIFIED at runtime.**
  `link.create` stamps `resolveActiveProjectId(runtime)`; `ProjectLoader` compares
  against `snapshot.projectId`. If those two ever disagree, `restore()` **drops
  every link and says so in the console**. A missing `snapshot.projectId` is safe
  (the check is skipped), but the agreeing case has not been observed end to end.
