# Lane U4 — the type catalog

**Lane:** U4 (UI/UX wave) · **Date:** 2026-09-03 · **Authority:** UIUX-PLAN §U4 + §4 (R-f) + §5 ·
lane-u3-definition-editor.md (the draft-save shape + the ops discipline + the reachability ARM
A/B structure + the vitest include) · lane-u0-definition-seam.md (the catalogue + bytes pipeline) ·
lane-u1-placement.md (the browser seam) · lane-u2-property-section.md (the placed-instance
read-back) · ADR-0376 D4/D5 · C110 §2.2/§3.3 · C111 §4.1-b/§4.3-b · C84 EI-9 · C16 CA-18/CA-21 ·
audit R1. **NOT COMMITTED by this lane** (per brief — the orchestrator owns the commit).

---

## §0 — One paragraph

**A component definition's Types are now managed end to end by clicks — created, edited, deleted —
without a single new bus verb.** The Components browser (U1's panel) gained a **"Types…"** entry;
it opens a new **type catalog** (`apps/editor/src/ui/component-type-catalog/`, extended by
composition — U3's `component-editor-workspace/**` is untouched) that holds the definition as a
draft and moves its `types` collection **only** through the file-format package's ops discipline.
**CREATE / DUPLICATE rides the DEDICATED `makeSplitTypeMigrator` op** (op #8 — clone a source type,
apply value overrides, recompute the checksum, re-validate the document), which is also the
lane's **falsification seam**. **EDIT (rename + value set) and DELETE** have **no dedicated
migrator** (measured: `ls family-migrations/ops/` → 8 ops, none is `change-type-value`,
`rename-type` or `delete-type`), so — exactly as the brief and UIUX-PLAN §U4 recommendation (a)
direct — they edit the document's `types` collection through the **same discipline**: an immutable
transform, **re-validated by `FamilyDocumentSchema`**, the typed refusal rendered in place, the
draft untouched on refusal, and **each OWED BY NAME** (§6). Deleting the sole type needs no bespoke
guard — `FamilyDocumentSchema`'s `types.min(1)` is the one voice that refuses it. Each type's
**overrides vs the definition defaults** are shown by **mounting lane 4F's parameter table** scoped
to that type (the `Type` source badge IS the override badge — C110 §2.2, reused). SAVE packs through
**`packFamily`** and reloads through **the ONE catalogue/loader** (U0), so a new type re-enters the
way every definition enters and the browser's type sub-list refreshes on `subscribe()` with no
extra wiring. **A placed instance of a created type resolves the override in U2's section:
Width = 2400 mm, source Type.** **7/7 acceptance arms** through the real `composeRuntime()` + real
DOM, **8/8 reachability**, **315/315** across the panel + component + workspace + type-catalog
suites, **57/57** file-format family suites, **falsification seen failing 6/7** with the loud typed
refusal in every mutation arm and restored **byte-identical**, **root tsc RC=0 for this lane's
files @6144 MB** (the tree's only tsc errors are other lanes' uncommitted work — §7).

## §1 — What shipped (files)

| File | What |
|---|---|
| `apps/editor/src/ui/component-type-catalog/ComponentTypeCatalog.ts` *(new — OWNS)* | The type catalog surface: draft `{manifest, document, events}` · the ONE lazy `loadFileFormat()` gateway (the falsification seam) · `applyDraft(opLabel, build)` — the ONE draft mutation, `FamilyDocumentSchema`-re-validated · CREATE/DUPLICATE via `makeSplitTypeMigrator` with a name-uniqueness guard (OWED O-1) · EDIT (rename + full override set, blank clears) and DELETE via immutable `types` transforms (OWED O-2/O-3) · the 4F table (`attrPrefix 'ctct'`) scoped to the selected type for the D4 override display · per-type override-count badge · save-via-pack → catalogue reload · honest refusals in place (create form + per-row); unloaded definition refuses by name. |
| `apps/editor/src/ui/component-type-catalog/index.ts` *(new)* | The barrel (`openComponentTypeCatalog` + types). |
| `apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts` *(edit — U1's file, additive)* | The **"Types…"** button per definition card → the catalog opener; an open refusal renders in the panel's own status line (CA-18). Static import is safe — the catalog keeps file-format LAZY. |
| `vitest.config.ts` *(edit, additive)* | The allowlist include for the new `component-type-catalog/__tests__` dir (§L-851's ALLOWLIST rule — added with the files, not after). |
| `apps/editor/src/ui/component-type-catalog/__tests__/componentTypeCatalogReachability.spec.ts` *(new)* | ARM A honest states (unloaded definition refuses by name, mounts nothing) + ARM B source-level (the browser carries the entry; CREATE rides split-type; EDIT/DELETE re-validate; no bus verb; no rival write path; OWED ops named). 8/8. |
| `apps/editor/__tests__/componentTypeCatalogThroughComposedRuntime.test.ts` *(new)* | The acceptance — §3. |

Untouched, per the hard rules: `apps/editor/src/ui/component-editor-workspace/**` (U3's),
`packages/schemas/**`, `packages/file-format/**` (READ-only — zero edits; the ops are consumed),
`packages/family-runtime/**`, `packages/family-loader/**`, `packages/family-instance/**`,
`apps/editor/src/ui/component/**` (4F's — mounted), `apps/editor/src/services/componentCatalog/**`
(U0's — consumed), `PropertyPanelBodyRenderer.ts` + the serialize-only trio +
`ElevationOutlineSurface.ts`, `countryAdapters/**`, `tools/**`, all verbs and handlers.
**No new verb, no schema edit, no package.json edit, no commit.**

## §2 — The mutation shape, exactly (the brief's spine)

- **CREATE via the dedicated op:** `makeSplitTypeMigrator(v, v, {sourceTypeId, newTypeId,
  newTypeName, valueOverrides})` applied directly (`from === to === document.formatVersion` — the
  direct-apply convention `family-migration.test.ts` establishes). The op clones the source type,
  merges the overrides (keyed by parameter id — the resolver reads `type.values[p.id]`), recomputes
  the checksum, and appends the new type. This is the ONLY mutation that rides a real migrator.
- **EDIT / DELETE via the same discipline, no dedicated op:** there is no `change-type-value`,
  `rename-type` or `delete-type` migrator (measured), and this lane may not mint one
  (`@pryzm/file-format` is frozen — HARD RULE). So the transform is an **immutable** rebuild of the
  `types` array (`map` for edit, `filter` for delete), wrapped into a new document, and
  **re-validated by `ff.FamilyDocumentSchema.safeParse`** — the same gateway, the same re-validation,
  the same in-place typed refusal U3's ops get. No second document validator and no second refusal
  vocabulary (C84 EI-9).
- **Name uniqueness** is enforced by **neither** `FamilyTypeSchema` **nor** `makeSplitTypeMigrator`
  (which guards only the id) — a genuine gap. This surface guards it with a typed refusal
  ("A type named … already exists"); because nothing else validates names, nothing can drift.
  OWED O-1.
- **The last-type invariant is the schema's, not this surface's:** filtering the sole type yields
  `types: []` and `FamilyDocumentSchema`'s `types.min(1)` refuses it — rendered in place. The
  surface does not restate the invariant.
- **Save:** `packFamily({manifest, document, events})` → `componentCatalog.loadFromBytes(bytes,
  {provenance, expectId})` → the draft REBASES on the reloaded (loader-validated) entry. The
  schemaHash is re-stamped by the packer and verified by the loader.
- **Per-type `checksum` on EDIT is carried UNCHANGED** — no op recomputes it and the loader does
  not verify it (U3 O-4, measured: no `checksum` refs in `family-loader` / `family-unpack`), so
  recomputing here would be a rival writer. `split-type` recomputes it on CREATE (its own design);
  the inconsistency is inert and OWED O-4.

## §3 — Executed proof (all foreground; transcripts beside this file)

| Proof | Transcript | Verdict |
|---|---|---|
| ⭐⭐ **THE ACCEPTANCE** — 7 arms through `composeRuntime()` + `bootstrapWithEverything`, definition via `packFamily` → the ONE loader → the SAME `componentCatalog` singleton, real DOM: **(1)** browser → "Types…" click → catalog mounts, W-1200/W-1500 listed, W-1200 shows "1 override", D5 copy clean · **(2)** ⭐⭐ CREATE **'Wide'** overriding **Width=2400** via `makeSplitTypeMigrator` → new `typ_` id, `values[Width]===2400`, list badge "1 override", scoped 4F table shows **Width source `type` value `2400`** (the OVERRIDE BADGE), Height falling to `default`/2100, dirty=true · **(3)** ⭐⭐ SAVE → schemaHash MOVED, reloaded document carries 'Wide' with Width=2400, catalog rebased, override badge identical across the round trip · **(4)** ⭐⭐ `component.place` of a 'Wide' instance via the real bus → CA-21 store read-back (`typeId===WIDE_ID`) → U2's section resolves **Width = 2400 mm, source `type`** · **(5)** DUPLICATE NAME refuses IN PLACE — a second 'Wide' renders the typed refusal under the create form (`data-ctc-create-refusal`, "already exists"), draft type count unchanged · **(6)** EDIT via the re-validated transform — rename 'Wide'→'Wider', Width override → 2600 (scoped table follows), then blank Width → source back to `default`/1200 · **(7)** DELETE via the re-validated transform — a non-last delete succeeds; the last-type delete is REFUSED by the schema's `types.min(1)`, rendered against the row, the sole type surviving | `lane-u4-VERIFY-acceptance-PASSING.txt` | **RC=0 · 7/7** |
| Reachability spec (ARM A honest states + ARM B source-level) under the ROOT config | `lane-u4-VERIFY-reachability-spec-PASSING.txt` | **RC=0 · 8/8** |
| **Panel + component + workspace + type-catalog suites** (root config): `ui/component/__tests__` + `ui/property-panel/__tests__` + `ui/component-editor-workspace/__tests__` + `ui/component-type-catalog/__tests__` | `lane-u4-VERIFY-panel-and-component-suites.txt` | **RC=0 · 24 files · 315/315** |
| file-format family suites: `family-migrations` (migration + v1_1 round-trip) · `family-round-trip` · `family-signature` (consumed, never edited — unchanged from U3's reading) | `lane-u4-VERIFY-fileformat-family-PASSING.txt` | **RC=0 · 4 files · 57/57** |
| **FALSIFICATION** — the ONE `loadFileFormat()` gateway severed at runtime (not the specifier — vite would refuse THAT at transform time, U3 §3's method note): **6/7 arms RED**, every mutation arm (CREATE/SAVE/EDIT/DELETE) refusing loudly — *"The Component document-migration ops could not be loaded from the file-format package — the edit was NOT applied and the draft is unchanged: SEVERED…"* — only the read-only OPEN (ARM 1) survives; edits refuse loudly, never silently lost; restore **byte-identical** (sha256 `5dbca2d8…` before == after) | `lane-u4-VERIFY-falsify-SEEN-FAILING.txt` · `lane-u4-VERIFY-falsify-sha256.txt` | done |
| Root `tsc -p tsconfig.json --noEmit --skipLibCheck` @ 6144 MB (ALSO the scoped check — `apps/editor`'s `typecheck` IS this config) | (§7) | **RC=0 for this lane's files** — the sole tsc error in a U4 file (an unused `Migrator` import, TS6196) was removed; the remaining tree errors are other lanes' uncommitted work (§7) |

⚠ Falsification method note (inherited from U3 §3): the runtime sever rejects the SAME gateway at
runtime, so the arms fire and the refusal is read off the screen; replacing the import specifier
would kill the file at collection and prove nothing about the runtime refusal path.

## §4 — The type-CRUD sequence, as the user executes it

Create → Interior → **Components** → **Types…** on *U4 Window* → **New type…** → name **Wide**,
duplicate from **W-1200**, Width override **2400** → **Create type** → *Wide* joins the list with a
**"1 override"** badge and its scoped table shows **Width · Type · 2400 mm** → **Save definition**
→ *"Saved — packed and reloaded through the catalogue (sha256:…)"* → browser → **Place** *Wide* →
select → the Component section reads **Width 2400 mm, source Type**. Create a second **Wide** and it
refuses in place — *"A type named 'Wide' already exists…"*. **Edit…** *Wide* → rename *Wider*, and
its instances follow the type (spec §66). **Delete** the last remaining type and the schema refuses
— *"types: … at least 1…"*.

## §5 — Deliberate choices a reviewer should see

1. **Extended by composition, not by editing U3.** The catalog is its own directory/opener; U3's
   `component-editor-workspace/**` is untouched (HARD RULE). The plan's "type-list panel inside U3's
   workspace" is satisfied by a peer surface reachable from the same browser, driven by the same
   draft-save shape — no divergent second draft model.
2. **One gateway, one re-validation, for all three verbs.** CREATE's `build` calls the real
   `split-type` migrator; EDIT/DELETE's `build` returns an immutable transform. Both funnel through
   `applyDraft` → `FamilyDocumentSchema.safeParse` → accept-or-refuse. Severing the gateway refuses
   all three (falsification), which is why the seam is trustworthy.
3. **The last-type refusal is the schema's voice, deliberately.** No client-side "can't delete the
   last type" pre-check — `types.min(1)` owns that invariant, and a second statement of it could
   drift (C84 EI-9).
4. **The override display is the 4F table, scoped — not a new "overrides" widget.** The `Type`
   source badge already means "overridden by the selected type"; reusing it keeps C110 §2.2 stated
   once.
5. **EDIT re-specifies the full override set.** Prefilled with the type's current overrides; a blank
   field clears that parameter's override (falls back to the default). This gives add/change/remove
   in one apply without a per-field verb.
6. **`typ_` ids ride the sanctioned ULID factory** (`createId` → `parseId` → re-prefix) — no second
   id generator, mirroring U3's `mintParameterId`.
7. **D5 on screen.** Every rendered string says Component/Type; the rendered OWED notes avoid the
   word "family" (the migration ops are named "the file-format document-migration ops" on screen);
   the frozen wire names (`FamilyDocument`, `FamilyType`, `.pryzm-family`) are type-only imports,
   never rendered. ARM 1 asserts `card.textContent !~ /family/i`.

## §6 — Owed / open (ranked)

| # | Owed | To whom |
|---|---|---|
| O-1 | ⭐ **Type-name uniqueness** — enforced by neither `FamilyTypeSchema` nor `makeSplitTypeMigrator`; this surface guards it. Either a uniqueness refinement on `FamilyDocumentSchema.types`, or a guard inside `split-type`, would make it the one voice | `packages/file-format` / `packages/schemas` (a model lane) |
| O-2 | **`change-type-value` (+ `rename-type`) family-migrations op** — EDIT is a re-validated document transform because no dedicated migrator exists; a migrator would carry the checksum recompute (like split-type) and be composable in a chain | `packages/file-format` (a model lane) |
| O-3 | **`delete-type` family-migrations op** — DELETE is likewise a re-validated transform; the last-type refusal is the schema's, but a dedicated op would make the deletion chainable and telemetered | `packages/file-format` (a model lane) |
| O-4 | **Per-type `checksum` is dead weight at this seam** (U3 O-4, re-confirmed) — recomputed by `split-type` on CREATE, carried stale on EDIT, verified by no loader. Either the loader verifies it or the ops recompute it uniformly; today it is inert and stated | model lane / C111 |
| O-5 | **U2/U3's `numericTypeValues` boolean-coercion export** — this lane added a fourth mirror of `coerceValues` (boolean→1/0) at the same join; one export from `@pryzm/family-instance` deletes all four | `packages/family-instance` (4D) |
| O-6 | **Twenty-instance TYPE-value propagation** proven at the panel + store (spec §66) — the composed acceptance places one instance and reads it back; a broader N-instance sweep (change the type value → all its non-overridden instances follow) is a fuller behavioural arm, not shipped here | UI polish / a future arm |

## §7 — Root tsc note for the orchestrator

Root `tsc -p tsconfig.json --noEmit --skipLibCheck` @6144 MB is **RC=0 for every file this lane
authored or edited** — `grep -c apps/editor` over the error output is **0**. The only U4 error the
first run surfaced — `ComponentTypeCatalog.ts` TS6196, an unused `Migrator` type import — was
removed. The tree's global RC is **2**, from **7 trivial unused-import errors (TS6192/TS6133) in
`packages/site-parcel-data/**` — files this lane never touched, from other lanes' uncommitted
work**, and NOT this lane's to fix (`site-parcel-data`/`countryAdapters` is a HARD-RULE no-touch):

- `packages/site-parcel-data/src/countryAdapters/ro/index.ts` (**untracked**, the RO lane).
- `packages/site-parcel-data/src/jurisdiction/nationalJurisdictionResolver.ts` (**modified**, the
  jurisdiction lane).

⚠ **The shared tree drifted between the two tsc runs** (the multi-agent reality —
[[multi-agent-shared-tree-collisions]]): the first run's `apps/editor/src/ui/ai/
chatPlacementActivation.ts` `TS2339`s (another lane's +77-line edit) were **gone** by the second run
(that lane fixed them), and `nationalJurisdictionResolver.ts` newly appeared. Neither was ever this
lane's; the constant across both runs is that **zero errors reference a U4 file.** Transcript:
`lane-u4-VERIFY-root-tsc.txt`.

## §8 — Shared-tree note for the orchestrator

Everything of this lane's is untracked/modified working-tree at final, verified state:
`apps/editor/src/ui/component-type-catalog/**`,
`apps/editor/__tests__/componentTypeCatalogThroughComposedRuntime.test.ts`, the additive edits to
`apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts` (the "Types…" entry) and
`vitest.config.ts` (the include), the `lane-u4-VERIFY-*` transcripts + this file. NOT this lane's,
in flight in the same tree: `chatPlacementActivation.ts` (+77), the RO lane's
`site-parcel-data`/`countryAdapters` deltas, and every other Phase-4/U-wave uncommitted change.

## §9 — What this lane did NOT do (absence ≠ completion)

No new bus verbs (there are none for type CRUD, by design — R-f); no dedicated `change-type-value`/
`delete-type`/`rename-type` migrator (OWED O-2/O-3 — the model owns those); no per-type checksum
recompute on EDIT (O-4); no N-instance propagation sweep (O-6); no profile/solid/material authoring
(U3/other lanes); no 3-D preview (U5); no AI chat strip (U6); no commit.
