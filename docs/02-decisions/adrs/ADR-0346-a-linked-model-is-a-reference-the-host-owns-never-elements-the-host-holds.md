# ADR-0346 — A linked model is a REFERENCE the host OWNS, never elements the host HOLDS

- **Status:** Accepted (architecture) · **Implementation: SLICE 1 landed, the rest named as deferred in §10**
- **Date:** 2026-08-21
- **Lane:** LINK1
- **Supersedes:** nothing.
  **Amends in place:** `C13` (new §3.13 — the sanctioned foreign subtree),
  `C19` (§1.5 note — a linked model is not a ContextBuilding),
  `C36` (§2.3 note — `FederationMember.source: 'pryzm-native'` acquires its producer).
  **Adds:** `packages/schemas/src/link/`, `packages/file-format/src/link/LinkedModelStore.ts`,
  `apps/editor/src/engine/links/linkedModelScope.ts`, `plugins/link-model/`,
  `apps/editor/src/ui/links/LinkedModelsPanel.ts`.
- **Contracts:** **C13 (the governing contract — project lifecycle & isolation)**,
  C19 §1.3/§1.5 (site origin, reference-only geometry), C12 (LTP-ENU),
  C36 §1.12/§2.3 (federation members, content-addressed pinning),
  C03/C16 (command authoring), C05/C47 (persistence & format versioning),
  C06 §11 (the underlay precedent), C09/C25 (visibility intent),
  C69 (verb register), C82 (ribbon/panel capability surface),
  C83 (IMPOSSIBLE / INADVISABLE / FINE), C10 (perf & OTel), P1/P2/P6/P7/P8.
- **Issue-log:** L-2900 … L-2910.
- **SPEC:** [SPEC-LINKED-MODELS](../../03-execution/specs/SPEC-LINKED-MODELS.md)

---

## 1 · Context — the founder's request, and the one constraint that shapes every answer

> "I want you to **audit, plan, review, document and implement LINK MODEL** — **two project
> files sharing the same parcel could be linked one into another.** … **Include UI/UX.**"

This is Revit's *linked model* / IFC reference-model concept: I am designing Building A; a
colleague's Building B sits on the same site; I link B into A so I can **see** it, **snap** to it,
**check clashes** against it and **draw** it — **without owning or editing it**.

The constraint that shapes every decision below is that **PRYZM's runtime actively polices exactly
this**. On a normal load the founder's console prints:

```
[ProjectIsolationAudit] Installed — will audit every project load
[C13 VIOLATION] Project-isolation leak detected on load of proj-… — 1 finding(s):
   [scene.foreignElement×26 …]
[StoreEventBus] §C13-CLEAR-EVENTS-DO-NOT-CROSS — dropped 48 event(s) …
[ProjectIsolation] §C13-BUILDER-SCENE-CLEAR — 17/17 builder(s) cleared
```

C13 is not decorative. It is the contract five separate leak families (L-676, L-694a, L-694b,
L-711, L-713) were each closed against, and its §3.10 rule — *"every stateful surface reset on a
project switch MUST have exactly one NAMED OWNER; the audit enumerates OWNERS, not symptoms"* — is
the reason this feature is tractable at all. **A linked model is, by construction, the exact shape
the isolation audit exists to fail.** The design question is therefore not "how do I get B's
geometry into A" — that is easy and catastrophic — but **"how does foreign geometry become
LEGIBLE to the audit as sanctioned, without making the audit blind?"**

---

## 2 · Audit — what already exists (measured, not assumed)

### 2.1 · There is NO cross-project precedent in this repository. Not one.

Every mechanism in the neighbourhood is built to *prevent* Project A's geometry existing while
Project B is open:

| Mechanism | File | What it does |
|---|---|---|
| Foreign-element sweep | `packages/core-app-model/src/persistence/ProjectIsolationAudit.ts` | counts scene objects whose `userData.projectId !== projectId` as a **leak** |
| Underlay attribution | `apps/editor/src/engine/UnderlayPersistence.ts:328` | stamps `mesh.userData.projectId` **specifically so a foreign underlay is catchable** (C06 §11.4 — *"an underlay must name its project"*) |
| Teardown registry | `packages/core-app-model/src/persistence/ProjectScopeRegistry.ts` | clears every declared owner on switch |
| Declared probe set | `packages/core-app-model/src/persistence/declaredProjectScopes.ts` | ADR-0298 — a declared owner that does not answer is a violation |
| Event channel | `StoreEventBus.suppressDuring` | C13 §3.12 — outgoing events must not cross |

So there is no "just do what X does". **This ADR is the first sanctioned crossing, and it must
carry its own proof.**

### 2.2 · The closest precedents, and what each contributes

**`mountedDrawingScope.ts` — the STRUCTURAL template (this is the important one).**
`apps/editor/src/engine/views/mountedDrawingScope.ts` is C13's own answer to "a scene mount that
no element-keyed sweep can see". It is a **module** (not an instance) that owns a scene parenting,
stamps the owning project at mount time, registers both a `projectScopeRegistry` clear and an
ADR-0298 probe, and holds **no THREE import** — the detach closure lives with the THREE owner.
C13 §7.5 names it explicitly as *the* pattern for "a declared probe per producer". A linked model
is the same species: a scene mount that carries no element identity a sweep can key on.

**`DxfOverlayStore` — the PERSISTENCE template.**
`packages/file-format/src/import/dxf/DxfOverlayStore.ts`: N plain-serialisable records, no THREE,
`serialize()`/`restore()`, `projectScopeRegistry.register({ scopeName, clear })` at module scope,
wired into `ProjectSnapshot.dxfOverlays`. This is exactly the shape a `linkedModels` snapshot field
needs — and it proves the slot exists (`apps/editor/src/engine/persistence/ProjectSerializer.ts:1430`,
`ProjectLoader.ts:2329`).

**`createSiteOverlayUnderlay.ts` — the ANCHORING convention.**
`apps/editor/src/engine/createSiteOverlayUnderlay.ts:27-56` already models "place a thing at an
E/N offset from the site origin", and applies it as
`mesh.position.x = positionEast; mesh.position.z = -positionNorth`. That is the C19 §1.3 LTP-ENU
scene frame. **Parcel-anchoring is already solved; it is not new work.**

**`UnderlayRenderService` — the SEMANTIC render precedent.**
`packages/core-app-model/src/presentation/UnderlayRenderService.ts` ghosts foreign-to-this-view
geometry through a shared material, stashes originals, stamps `underlayActive` for pick exclusion,
writes **zero** stores and issues **zero** commands. Its `underlayActive` flag is honoured at four
independent sites (`SelectionManager.ts:3452`, `:3835`, `ViewRangeZoneApplicator.ts:265`,
`initUI.ts:391`) — **that is the picking-exclusion mechanism to reuse**, not the species-A
`window.__underlayHit` one-frame race flag.

**`SetViewUnderlay.ts` — the COMMAND template.**
`plugins/view/src/handlers/SetViewUnderlay.ts` — a real typed handler with `affectedStores`,
`canExecute` returning a named reason, forward/inverse Immer patches, and `withHandlerSpan`.

### 2.3 · What is NOT reusable, and the trap in each

- **`CREATE_UNDERLAY` is a BRIDGE, not a verb.** `initBusHandlers.ts:2818` declares
  `stores: [] as const` and validates only `typeof cmd.execute === 'function'` — the payload is a
  pre-constructed legacy `Command` instance. It appears in **neither**
  `packages/command-bus/src/commands.ts` **nor** `docs/04-reference/API-VERB-REGISTER.md`, and its
  undo routes through two `window.__pryzm*UnderlayInternal` hooks. Copying it would import an
  escape hatch. **Rejected.**
- **The raster underlay is a hard SINGLETON** on `window.floorPlanUnderlayTool`. Linked models are
  inherently N. Nothing in that path survives an N-instance rewrite.
- **The raster underlay is NOT in the project file** — localStorage + IndexedDB keyed by
  `projectId`. A `.pryzm` exported and reopened elsewhere has no underlay. A linked model must be
  in `ProjectSnapshot`.
- **ContextBuildings (C19 §1.5) are the wrong abstraction.** They are opaque massing with *no
  inner structure, no levels, no rooms, no elements*, and C19 §1.5 forbids them from schedules and
  property panels. A linked model has all of those — it is a *building*, temporarily read-only,
  not *environment*. Conflating them would make "show me the linked model's room schedule"
  contract-illegal forever. Recorded as **L-2903**.

### 2.4 · C36 already contracted this concept and nobody built it

`C36-CLASH-DETECTION-AND-COORDINATION.md` §2.3 declares:

```typescript
interface FederationMember {
  memberId: string;
  source: 'pryzm-native' | 'ifc-import' | 'revit-link' | 'dwg-link';
  contentHash: string;                     // SHA-256 per §1.12
  discipline: string;
  importedAt: string;
}
```

Measured: `grep -rn "FederationMember\|federationMember" --include=*.ts packages plugins apps`
→ **0 hits**. The type exists only in the contract. **`source: 'pryzm-native'` is precisely a
PRYZM linked model, and C36 §1.12 already decided the version question** — *"A `ClashSession` SHALL
pin every federation member by `(memberId, contentHash)` … a missing hash MUST surface as a
`MISSING_FEDERATION_MEMBER` warning rather than silently re-running against the latest model."*

**Consequence, and it is the single most important audit finding: do not mint a rival concept.**
A linked model is the producer C36's federation half has been waiting for. This ADR adopts C36's
pinning semantics verbatim rather than inventing a second answer to the same question — the
"one answer per question" rule of ADR-0331.

### 2.5 · MEASURED BLOCKER — cross-USER linking is not reachable today (L-2901)

The founder's framing is *"my colleague's Building B"*. I read the server routes:

- `server.js:2891` `GET /api/projects` → `.eq('owner_id', userId)`
- `server.js:3165` `GET /api/projects/:id` → `.eq('owner_id', userId)`, else 404/403
- `server.js:3474` `GET /api/projects/:id/latest-version` → `.eq('owner_id', userId)`, else 404

A `project_members` table and its routes exist (`server.js:4412`, `:4433`), **but not one of the
three read paths above consults it.** So today a user can only reach snapshots of projects they
personally own.

**This is not a reason to refuse the feature — it is a reason to scope it honestly.** V1 links
projects **the same user owns** (the real "I am designing the tower, my other file is the
podium / the neighbouring block / last week's option" case, which is most of the value). True
cross-user linking needs the three read paths to become members-aware, and that is a C08
(collaboration & security) change with its own permission semantics — **named, not silently
skipped.** Logged **L-2901**.

---

## 3 · Decision

### D1 — What crosses the boundary is a REFERENCE, never elements

The host project persists a `LinkedModelRef`. The source project's elements are **never** added to
the host's `ElementStore`s, `ElementRegistry`, `BimManager`, semantic graph, undo stack, or
`ProjectSerializer` element capture. The linked geometry exists **only** as a scene subtree and a
read-only side table, both owned by one declared module.

**This is also what Revit does.** Revit's "bind link" — which *does* import the elements — is a
one-way destructive operation users are warned about, not the normal mode. We do not ship the
destructive mode.

### D2 — The link's MOUNT is HOST-owned; only the GEOMETRY is foreign

Modelled on `mountedDrawingScope.ts`. `apps/editor/src/engine/links/linkedModelScope.ts` is a
module-scope owner that:

- holds the mount handles for every live link,
- stamps the **HOST** project id at mount time,
- registers `projectScopeRegistry.register({ scopeName: 'links.linkedModels', clear })`,
- registers `registerProjectScopeProbe({ scope: 'links.linkedModels', owningProjectId, describe })`,
- imports **no THREE** (P2) — the detach closure is supplied by the THREE owner.

The probe answers the **host** id, because *the host owns the act of linking*. A link left mounted
after a project switch therefore reads as a leak **automatically**, with no new detector — which is
the whole point of §3.10's "named owners, not symptoms".

### D3 — C13 amendment §3.13: a sanctioned foreign subtree is **TAGGED**, never **EXEMPTED**

The failure mode to avoid is an allowlist that makes the audit blind — *"a clean verdict that never
looked is worse than no verdict, because it manufactures confidence"* (C13 §3.10). So:

1. Foreign geometry is legal **only** when it is reachable from exactly one declared scope
   (`links.linkedModels`) and stamped on the subtree **ROOT** — never on every child, per C13
   §7.4 rule 3 — with:
   `{ pryzmLinkId, pryzmLinkSourceProjectId, pryzmLinkHostProjectId }`.
2. The audit gains a **`scene.linkedModel` counter** that reports links **by name and count in
   every report**, and raises a **finding** when `pryzmLinkHostProjectId !== projectId` — i.e. a
   link belonging to a *different* host is a leak exactly as before.
3. **Untagged foreign geometry remains a violation.** The existing `scene.foreignElement` arm is
   not weakened; it is only taught to attribute tagged link roots to the link arm.
4. Per C13 §7.4 rule 1, the detector's test fixture is **copied from the producer, cited by
   `file:line`** — never written to match the detector — and the suite carries a **positive
   control** (rule 2).

**A link is thus never invisible. It is visible and accounted for.**

### D4 — Anchoring: derived from the shared geo datum, RECORDED, and REFUSED when unprovable

Both projects carry `SiteModel.location` (C19 §1.3) which is the C12 LTP-ENU origin. The link
transform is the ENU offset of the source origin expressed in the host's frame, plus Δ`trueNorth`.

**Both origins and the derived offset are recorded on the ref**, so a later divergence (the host
re-locates its site; the source is re-geocoded) is *detectable* rather than silently wrong. This is
the [[site-origin-on-parcel-regression]] lesson: a ring computed about a stale anchor looks fine.

C83's three-way answer, and **PRYZM always ASKS, never auto-edits**:

| Case | Verdict | Behaviour |
|---|---|---|
| Source has no `SiteModel.location` | **IMPOSSIBLE** to auto-align | refuse auto-align **by name**; offer an explicit transform; **never** silently place at the origin |
| Both located, origins ≤ `NEAR_M` apart | **FINE** | auto-align, show the computed offset |
| Origins > `FAR_M` apart | **INADVISABLE** | ask, showing **both** distances — the offset and the threshold (the [[refusing-half-needs-its-escape-hatch]] rule: the refusal must carry the escape hatch) |

Note the founder said *"the same parcel"*. **The design deliberately does not require identical
parcels** — the common real case is the *adjacent* plot, and requiring parcel equality would refuse
the most valuable use. Parcel identity is *reported*, never *enforced*.

### D5 — Version: **PINNED by default**, "follow latest" is an explicit opt-in, a missing pin REFUSES

Adopted verbatim from C36 §1.12 rather than re-decided. `pin: { mode: 'pinned', versionId }` is the
default; `{ mode: 'latest' }` is a deliberate choice the UI states in words. A pinned version that
no longer resolves surfaces as `MISSING_LINK_VERSION` — C36's `MISSING_FEDERATION_MEMBER` shape —
and the link renders **nothing** with a named reason, rather than silently re-resolving to latest.

**Why pinned is the default:** a linked model is a *coordination datum*. If B moves under A without
A's author knowing, every dimension A drew to B is silently wrong. Revit pins by default for the
same reason. "Follow latest" is right for a same-author two-file split, so it is offered — but
declared, per the founder's standing rule that an undeclared choice is not defensible.

### D6 — LOD: **MASSING is the default**, and the cost is stated, not assumed

Lane PERF1 measured today that the founder's scene is draw-call bound, and he reports navigation
*"gets stuck sometimes"*. A linked model at least doubles the scene. So the default representation
is **massing** — one merged mesh per linked model per level band — with **full detail as an
explicit opt-in per link**.

⚠ **Honesty about the number.** I did **not** measure draw calls in a browser; I cannot in this
lane. And per **L-2502** (lane AUD-3, measured today) the console figure everyone has been quoting
is not what it claims: on WebGPU `info.render.calls` is *"render calls since the app has been
started"* and `Info.reset()` does not zero it, while PRYZM labels it `drawCalls ← LAST RENDERED
FRAME`. **So "7591 draw calls" is not a per-frame reading**, and I will not build an argument on it.

What I can state is the **structural bound**, which is what actually governs the design:

| Representation | Scene meshes added per link | Basis |
|---|---|---|
| **massing** (default) | **1 per level band** (merged) | one `BufferGeometry` merge per band, one material |
| **full** (opt-in) | **≈ N**, N = the source project's mesh count | the source's own mesh cardinality, unchanged |
| **hidden** | **0** | not mounted at all |

For the founder's own project (`sceneMeshes=3898`), a **full** link of a comparable project adds
≈ 3898 meshes; a **massing** link of a 5-level building adds **5**. That ratio is the argument, and
it does not depend on any draw-call reading. **The measured per-frame cost is UNPROVEN and is
recorded as such in §11.**

### D7 — Visibility flows through the intent model; **never** through raw `.visible`

P7 / C09: a link's visibility is authored as **intent** keyed on the link id, not by flipping
THREE `.visible` from UI code. `underlayViewScope.ts` is the architectural template — *one* pure
decision function, many readers, `effective = intent AND gate`, **fails closed on an unclassifiable
view**, and persistence stores the **intent**, never the computed value.

⚠ Carried from the audit as a trap **not** to inherit: the raster underlay has **two** render
paths gated on **two different** visibility fields (`mesh.visible` in the THREE pass,
`floorPlanUnderlayRef.current.visible` in `PlanViewCanvas._drawUnderlay`). Benign today, latent
tomorrow. **A linked model has ONE visibility authority read by every pass.** Logged **L-2904**.

### D8 — A linked model is never selectable and never editable, at BOTH doors

The subtree root and its meshes stamp `underlayActive: true` — the flag already honoured at the
four `SelectionManager` / `ViewRangeZoneApplicator` / `initUI` sites — plus the link tags of D3.
Commands never target link ids: link elements are absent from every element store, so there is
nothing for a command to resolve. Following C82 §1.2's "both doors or neither", this is closed at
the *store* level, not merely at the *pointer* level — a programmatic `executeCommand` naming a
linked element finds no element, exactly as it would for a deleted one.

### D9 — Persistence: the REF is in `ProjectSnapshot`; the GEOMETRY is a cache

`ProjectSnapshot.linkedModels` (version-tagged, C47) holds the refs — small, plain, serialisable,
on the `dxfOverlays` model. The resolved source geometry is a **cache** beside the file, never the
record of truth. A `.pryzm` moved to another machine therefore carries its links; whether they
*resolve* depends on access to the source project, which is the honest answer and is surfaced as
such.

---

## 4 · Alternatives rejected

### 4.1 · Full element import into the host's stores — **REJECTED**

Load B's elements into A's `ElementStore`s with a `linkedFrom` marker.

*Why it looks attractive:* everything works immediately — picking, schedules, IFC export, plan
projection, clash. No new render path.

*Why it is wrong, in order of severity:*

1. **It corrupts both projects on the next save.** `ProjectSerializer` captures from the stores.
   B's elements would be written into A's snapshot, and A's author would then be the owner of a
   copy of B that diverges silently from B. This is the failure the founder named.
2. **It trips C13 by design and there is no honest tag that fixes it**, because the elements are
   genuinely *in* A's stores — the audit would be right and the feature would be wrong.
3. **It makes B editable.** Every command that resolves by element id would find B's elements.
   Closing that needs a predicate on every one of the ~337 registered verbs. That is not a
   feature, it is a permanent tax.
4. **It doubles undo.** B's elements entering stores means store patches, which means undo entries
   for geometry the user does not own.

Revit calls this "bind" and warns before doing it. We do not ship it.

### 4.2 · Auto-align only, on the shared geo origin — **REJECTED as the sole mode**

*Why it looks attractive:* both projects have an LTP-ENU origin; the transform is derivable;
zero UI.

*Why it is not enough:* it has **no answer for the source with no site**, which is the common case
for an early-stage option file. Auto-align alone must then either refuse the link outright
(too strict — the founder would rather place it by hand) or place at the origin, which is a
**silent mis-alignment** and strictly worse than a refusal (C83). So: auto-align **when derivable
and plausible**, explicit transform **as the declared fallback**, and a **named refusal** in
between. Both modes, one recorded choice per link.

### 4.3 · Manual transform only — **REJECTED**

Simplest to build; throws away the one thing that makes this feature tractable here. Two projects
on the same parcel already share a datum (C19 §1.3). Making the user re-establish by hand a
relationship the data already encodes is the [[authored-but-unwired-is-the-bottleneck]] defect
facing outward.

### 4.4 · Live-follow as the default — **REJECTED** (see D5)

### 4.5 · Model it as a `ContextBuilding` (C19 §1.5) — **REJECTED** (see §2.3; L-2903)

### 4.6 · Model it as an IFC import — **REJECTED**

`IfcGeometryRenderer` already renders a foreign model into the scene, and IFC round-trip exists
(C25). Export B to IFC, import into A, done.

*Why it is wrong:* it is **lossy by construction** and destroys the property that makes a
PRYZM-to-PRYZM link worth having — the source stays *itself*. Re-linking after every save is
manual; version pinning becomes "which IFC file"; and the parcel datum is re-derived through a
second CRS hop. It is the right answer for a *Revit* or *ArchiCAD* colleague and the wrong answer
for a PRYZM one. C36 §2.3 already separates these as different `source` values for a reason.

### 4.7 · A whole second `PryzmRuntime` for the source project — **REJECTED**

*Why it looks attractive:* perfect isolation — B gets its own stores, its own everything.

*Why it is wrong:* it breaks **P1** (single composition root) outright, and P1 is one of the four
principles enforced hard at the invariant (`check-single-compose.ts`, 1 definition / 0 rivals).
The isolation a second runtime would buy is bought more cheaply by *not putting B's elements in a
store at all* (D1).

---

## 5 · The C13 §3.13 amendment, in full

> **§3.13 — A SANCTIONED FOREIGN SUBTREE IS TAGGED, NOT EXEMPTED (binding; ADR-0346, L-2900)**
>
> Geometry belonging to a project other than the active one is legal in the scene **only** as a
> **linked model**, and only under all five of:
>
> 1. **One declared owner.** It is mounted by, and reachable only from, the declared project scope
>    `links.linkedModels` (ADR-0298 / §3.11). No second mount path.
> 2. **Root-scoped attribution.** The subtree **ROOT** — never every child (§7.4 rule 3) — carries
>    `pryzmLinkId`, `pryzmLinkSourceProjectId` and `pryzmLinkHostProjectId`.
> 3. **The host owns the mount.** The scope's probe answers the **HOST** project id. A link whose
>    `pryzmLinkHostProjectId` is not the loaded project is a **violation**, reported as
>    `scene.linkedModel` — the ordinary cross-project leak, unchanged.
> 4. **Reported, never suppressed.** Every audit report enumerates live links by id and count even
>    when clean. An audit that stops *reporting* a sanctioned exception has been made blind, which
>    §3.10 forbids.
> 5. **No store, no registry, no undo.** Linked elements enter no `ElementStore`, no
>    `ElementRegistry`, no `BimManager`, no semantic graph, no undo stack, and are excluded from
>    `ProjectSerializer` element capture. Only the `LinkedModelRef` persists.
>
> **Untagged foreign geometry remains a violation.** This section adds an accounted-for category;
> it removes nothing from `scene.foreignElement`.
>
> Per §7.4 rule 1 the `scene.linkedModel` fixture is copied from the producer
> (`linkedModelScope.ts`, cited by `file:line`) and the suite carries a positive control (rule 2).

---

## 6 · Consequences

**Good**

- The first sanctioned cross-project crossing has a named owner, a probe, a counter and a contract
  section — rather than an allowlist.
- C36's federation half acquires the producer it was written for; no rival concept minted.
- Massing-by-default means the feature is affordable on a scene the founder already finds heavy.
- The `LinkedModelRef` is small and plain, so it round-trips through the existing snapshot
  machinery with no new persistence substrate.

**Costs, stated**

- One more declared project scope (the fifth family of leak this list exists to prevent — it is
  *deliberately* joining the list rather than dodging it).
- The source snapshot must be fetched and deserialised. §2.5's measured 31.9 s
  `element_import` for 259 elements is the **host load** path; a massing link deliberately does
  **not** run element import — it consumes geometry only. Whether that is fast is **UNPROVEN**
  (§11).
- Cross-user linking is out of scope until L-2901 is closed.

---

## 7 · Principles

| Principle | How this ADR honours it |
|---|---|
| **P1** | No second runtime (§4.7). The link resolves inside the one composed runtime. |
| **P2** | `linkedModelScope.ts` imports no THREE; the detach closure lives with the THREE owner, exactly as `mountedDrawingScope.ts` does. |
| **P6** | Every link mutation is a bus verb (`link.create` / `link.remove` / `link.setDisplay` / `link.setTransform`) with forward/inverse patches. No UI store write. |
| **P7** | Link visibility is intent keyed on link id (D7), never `.visible` from UI. |
| **P8** | Every handler wraps `withHandlerSpan`; the mount/unmount path emits `pryzm.link.mount` / `pryzm.link.unmount`. |

---

## 8 · Issue-log

| id | what |
|---|---|
| **L-2900** | The linked-model architecture itself; C13 §3.13. |
| **L-2901** | ⛔ **MEASURED BLOCKER** — all three project read routes scope to `owner_id`; `project_members` exists and is consulted by none of them. Cross-**user** linking unreachable. |
| **L-2902** | `FederationMember` (C36 §2.3) has **0** implementations; the contract type is unbuilt. |
| **L-2903** | A linked model must **not** be modelled as a `ContextBuilding` (C19 §1.5 forbids inner structure). |
| **L-2904** | The raster underlay has **two** render paths on **two** visibility fields — a divergence not to inherit. |
| **L-2905** | `CREATE_UNDERLAY` is in neither `command-bus/commands.ts` nor `API-VERB-REGISTER.md` — an unregistered bridge verb. |

---

## 9 · Implemented in this ADR's slice

See [SPEC-LINKED-MODELS](../../03-execution/specs/SPEC-LINKED-MODELS.md) §9 for the landed/deferred
split, stated per item.

> ⚠ **Corrected 2026-08-21 (lane LINK2) — THAT SPEC DID NOT EXIST WHEN THIS LINE WAS WRITTEN.**
> This section and §10 both delegated to a file that was never created, so the landed/deferred split —
> the one record that tells a reader which half of a half-built feature is real — was recorded
> **nowhere**, while two documents pointed at each other. The citation had also reached the
> **product surface**: `link.setDisplay`'s refusal for the unbuilt detailed mode ends *"See
> SPEC-LINKED-MODELS §10."* (`linkBusHandlers.ts:252`) — shown to a **user**, naming a document that
> could not be opened. Measured: **4 citations, 0 files.** The SPEC now exists and carries the split.
> Recorded as **L-3162**; note that `contracts/**` has a gate for exactly this
> (`check-contract-cited-paths.ts`, L-960) and **ADRs/SPECs do not**, which is why it went unseen.

## 10 · Deferred, by name

Named in SPEC §10. Nothing in this ADR should be read as claiming a deferred item works.

## 11 · UNPROVEN — read this before quoting anything above

> ⚠ **Rewritten 2026-08-21 by lane LINK2, which RAN the slice this ADR describes.**
> The engine landed here had **never been executed** — not one line. Running it first, before
> building anything on top ([[committed-is-not-reachable]]), against fixtures copied from the
> PRODUCER (`ProjectSerializer.ts`, cited by line) per C13 §7.4 rule 1: **20 of 24 passed, 4 FAILED.**
> The core was sound. `foldElement` was not, in three ways, all of them the same shape — **a wrong
> answer that looks right**:
>
> - **L-3151** — slab polygons are Vec2 `{x, y}` where `y` **is** the plan Z (`stripVec2`,
>   `ProjectSerializer.ts:555`; emitted at `:757`). The consumer read `p.z`, got `undefined`, and
>   dropped **every vertex**. A slab-only level — a podium, a plinth, a roof terrace — produced no
>   band and was reported "skipped". **The linked building rendered smaller than it is, plausibly,
>   with no error** — precisely the silent mis-alignment D4 exists to refuse.
> - **L-3152** — roofs nest their outline under `footprint: { polygon, centroid }` (`:847-852`) and
>   carry no top-level `position`. The consumer read only top-level keys, so **roofs contributed
>   nothing at all** and a roof-only level lost the building's top.
> - **L-3153** — `contributingElements` counted elements whose every point had been rejected.
>
> The doc comment above `foldElement` **asserted** the wrong shape (*"polygon … Vec3[]"*) and the
> code faithfully matched it. Both are corrected in place. **24/24 green.**

**What is now landed, wired and measured** is enumerated in SPEC §9 — including the UI panel, its
route from the Project Browser's GIS tab, the pre-create source probe (**L-3154**) that closes the
anchor↔ref circle so the C83 verdict can be shown **before** the link is created, and the
`latest`-is-not-live decision (**L-3161**) that D5 left open.

**What remains genuinely unproven, stated so nobody quotes it as working:**

- **NO BROWSER VERIFICATION. This is the largest open item.** `LinkedModelSceneRenderer` has never
  been observed mounting geometry in a running editor by any lane. The renderer, the four picking
  opt-outs, the violet massing appearance, and the audit's `scene.linkedModel` arm are all **argued
  from code, not seen**. A single browser session closes most of this.
- **The end-to-end create → fetch → render path has not been run against a live server.** Route
  shapes were read from `server.js` and matched by inspection only.
- **Per-frame draw-call cost of a link was NOT measured in a browser.** The structural mesh-count
  bound in D6 is arithmetic, and L-2502 shows the console figure this repo has been quoting is
  cumulative, not per-frame. The panel therefore reports the **computed structural** cost and
  claims nothing about frame time.
- **Source-snapshot fetch + massing-build latency is UNMEASURED.**
- **`hostProjectId` agreement between save and restore is UNVERIFIED at runtime** — see SPEC §11.
- **Plan / elevation / section projection of a linked model is NOT built** (SPEC §10.3).
- **Cross-user linking does not work** (L-2901) and no code here changes that.
