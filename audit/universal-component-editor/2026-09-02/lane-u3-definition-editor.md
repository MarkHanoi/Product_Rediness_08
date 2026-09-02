# Lane U3 — the definition-editor workspace

**Lane:** U3 (UI/UX wave) · **Date:** 2026-09-02 · **Authority:** UIUX-PLAN §U3 + §4 + §5 ·
lane-u0-definition-seam.md (the catalogue + bytes pipeline) · lane-u1-placement.md (the browser
seam) · lane-u2-property-section.md (the mount pattern + ARM idioms) · ADR-0376 D2/D4/D5 ·
C110 §2.2/§2.4/§2.4-a/§3.3/§3.5/§4.4 · C111 §4.1/§4.3-b · C84 EI-9 · C16 CA-18/CA-21 · audit R1.
**NOT COMMITTED by this lane** (per brief — the orchestrator owns the commit). ⚠ **See §7 —
a Porto-lane commit (`94d65150`) swept three of this lane's mid-flight artifacts into history;
the working tree carries the FINAL state and it is the verified state.**

---

## §0 — One paragraph

**The founder's §64 progressive-parametrisation scenario is executable by clicks, end to end, at
last.** The Components browser (U1's panel) gained its **"Edit definition…"** entry; it opens a
new **definition-editor workspace** (`apps/editor/src/ui/component-editor-workspace/`) that holds
the loaded definition as a draft and moves it **ONLY through the family-migrations ops** of
`@pryzm/file-format` — add-parameter, introduce-expression, rename-parameter,
change-parameter-type, delete-parameter — never a direct document write and never a new bus verb
(document-layer, as the plan rules). The 4F parameter table is MOUNTED in definition/type scope
with a per-type preview-scope selector; a **formula editor previews LIVE typed diagnostics from
`resolveParameter` on every keystroke** — `expression-parse`, `unit-mismatch`, `cycle`, the whole
C110 §4.4 closed set — and **announces the D4 clearing before the apply** ("the default (1000)
will be cleared and recorded as supersededDefault"). SAVE packs through **`packFamily`**
(Zod-validated, canonicalised, schemaHash re-stamped — the signed-format discipline) and reloads
through **the ONE catalogue/loader** (U0), so the saved definition re-enters the way every
definition enters and every subscriber refreshes. `component.place` of a **W-1200** then resolves
**GlassWidth = 1050 mm** from the saved formula in U2's instance section. **10/10 acceptance arms
through the real `composeRuntime()` + real DOM, 307/307 across the panel + component + workspace
suites, 57/57 file-format family suites, 44/44 neighbour composed-runtime suites, layer gate at
the same baseline, root tsc RC=0 @6GB, falsification seen failing 8/10 with the loud refusal in
the diff and restored byte-identically.**

## §1 — What shipped (files)

| File | What |
|---|---|
| `apps/editor/src/ui/component-editor-workspace/ComponentDefinitionWorkspace.ts` *(new — OWNS)* | The workspace: draft `{manifest, document, events}` · every edit via a family-migrations op (`applyOp` → op factory → `apply` → Zod re-validate → accept-or-refuse) · 4F table mounted (`attrPrefix 'dcpt'`) with row action strips (Formula/Rename/Change type/Delete) · live-diagnostics expression editor (pure resolver preview, D4 supersede announcement) · add-parameter form · save-via-pack → catalogue reload · profile leg (4F panel mounted, write-back OWED and stated) · read-only reference-plane/solid/material-slot lists with the R-a boolean refusal verbatim · honest refusals everywhere (op's own sentence against its row; unloaded definition refuses by name). |
| `apps/editor/src/ui/component-editor-workspace/index.ts` *(new)* | The barrel (`openComponentDefinitionWorkspace` + types). |
| `apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts` *(edit — U1's file, additive)* | The **"Edit definition…"** button per definition card → the workspace opener; an open refusal renders in the panel's own status line (CA-18). Static import is safe because the workspace keeps file-format LAZY (below). |
| `vitest.config.ts` *(edit, additive)* | The allowlist include for the new `__tests__` dir — added in the same change-set as the files (§L-851's rule). *(Swept into `94d65150` at final state — §7.)* |
| `apps/editor/src/ui/component-editor-workspace/__tests__/componentWorkspaceReachability.spec.ts` *(new)* | ARM A honest states (unloaded definition refuses by name, mounts nothing) + ARM B source-level (the browser carries the entry; mutations are ops-only; save is packFamily → the one loader; no rival write path). 6/6. |
| `apps/editor/__tests__/componentDefinitionWorkspaceThroughComposedRuntime.test.ts` *(new)* | The acceptance — §3. |

Untouched, per the hard rules: `packages/schemas/**`, `packages/family-runtime/**`,
`packages/file-format/**` (READ-only — zero edits), `packages/family-loader/**`,
`packages/family-instance/**`, `apps/editor/src/ui/component/**` (4F's — mounted),
`apps/editor/src/services/componentCatalog/**` (U0's — consumed),
`PropertyPanelBodyRenderer.ts` + the serialize-only trio + `ElevationOutlineSurface.ts`,
`countryAdapters/**`, `tools/ga-gate/**`, all verbs and handlers. **No new verb, no schema edit,
no package.json edit, no commit.**

## §2 — The mutation shape, exactly (the brief's spine)

- **Ops-only:** `applyOp(build)` lazily loads `@pryzm/file-format` through ONE gateway
  (`loadFileFormat()` — type imports erased, value import deferred, per U0 §5-D2's
  pdfjs/`DOMMatrix` lesson), builds the op with `from === to === document.formatVersion` (the
  direct-apply convention `family-migration.test.ts` establishes), catches the **op's own typed
  throw as the refusal verbatim**, re-validates the produced document with
  `FamilyDocumentSchema.safeParse` (an invalid document REFUSES with the Zod issue named and the
  draft untouched), then accepts and re-renders. There is no second validator and no second
  refusal vocabulary.
- **D4 visible (C110 §2.4-a):** the preview announces the clearing BEFORE the apply; after it,
  the 4F table renders the `supersededDefault` provenance line and NO `superseded-default` warn —
  the repair (op clears the default) shown by its absence-of-warning plus presence-of-provenance.
- **Save:** `packFamily({manifest, document, events})` → `componentCatalog.loadFromBytes(bytes,
  {provenance, expectId})` → the draft REBASES on the reloaded (loader-validated) entry. The
  schemaHash is re-stamped by the packer and verified by the loader — the signed-format
  discipline (fixtures in this programme pack unsigned, as U0's did; the Ed25519 leg is unused
  here, unchanged).
- **Close-without-save discards the draft** — the document moves only through save-via-pack
  (ARM 10 proves the catalogue is untouched by an unsaved rename).

## §3 — Executed proof (all foreground; transcripts beside this file)

| Proof | Transcript | Verdict |
|---|---|---|
| ⭐⭐ **THE ACCEPTANCE** — 10 arms through `composeRuntime()` + `bootstrapWithEverything`, definition via `packFamily` → the ONE loader → the SAME `componentCatalog` singleton, real DOM: **(1)** browser → "Edit definition…" click → workspace mounts, sources honest (Width `type`/1200 · GlassWidth `default`/1000), D5 copy clean · **(2)** add FrameWidth (length, 75) via the op → honest row, dirty=true · **(3)** ⭐⭐ §64: type `Width - 2*FrameWidth` → LIVE preview **clean, 1050**, supersede-1000 ANNOUNCED → DOM apply → source `expression`, value **1050**, provenance line "Superseded default: 1000", NO warn (the op cleared it) → scope W-1500 → **1350** → back → **1050** · **(4)** live typed diagnostics: `expression-parse`, `unit-mismatch` (length+angle), `cycle` — all render as typed codes while typing; draft untouched · **(5)** an APPLIED bad formula renders `expression-parse` against its row, source `unresolved`, value blank, pass status `error`; delete-parameter recovers · **(6)** change-parameter-type same-type → **the op's own guard** ("already has dataType angle") against the row; angle→number lands and the unit label follows the declaration · **(7)** ⭐⭐ save → schemaHash MOVED, reloaded document carries expression + cleared default + supersededDefault:1000 + FrameWidth:75, **resolution IDENTICAL across the round trip** (values object equality) · **(8)** ⭐⭐ `component.place` W-1200 → CA-21 store read-back → U2's section resolves **GlassWidth = 1050 mm, source `expression`**, provenance line present · **(9)** profile leg: 4F panel mounts over the declared plane; the missing write-back op is STATED BY NAME (OWED), zero commit affordances · **(10)** rename Width→OpeningWidth is LOUD (unknown-identifier renders, G-7 disclosed in the status); close-without-save discards; fresh workspace resolves 1050 again | `lane-u3-VERIFY-acceptance-PASSING.txt` (verbose, per-arm) | **RC=0 · 10/10** |
| Reachability spec (ARM A honest states + ARM B source-level) under the ROOT config | `lane-u3-VERIFY-reachability-spec-PASSING.txt` | **RC=0 · 6/6** |
| **Panel + component + workspace suites** (root config): `ui/component/__tests__` + `ui/property-panel/__tests__` + `ui/component-editor-workspace/__tests__` — includes gate-J's `openingProfilePanelReachability`, `surfaceByteIdentity`, `componentParameterTable`, `componentProfileSurface`, U2's reachability | `lane-u3-VERIFY-panel-and-component-suites.txt` | **RC=0 · 23 files · 307/307** |
| file-format family suites: `family-migrations` (migration + v1_1 round-trip) · `family-round-trip` · `family-signature` | `lane-u3-VERIFY-fileformat-family-PASSING.txt` | **RC=0 · 4 files · 57/57** |
| Neighbour composed-runtime suites: U0 seam · 4C join · U1 placement · U2 section · AI slice · `bootstrap.everything` | `lane-u3-VERIFY-neighbour-suites.txt` | **RC=0 · 6 files · 44/44** |
| `npx eslint` over every touched file | `lane-u3-VERIFY-eslint.txt` | **RC=0** (one benign "file ignored" note for `vitest.config.ts` — no matching lint config, pre-existing) |
| `check-layer-boundaries` | `lane-u3-VERIFY-gate-layers.txt` | **RC=0** — *"within baselines (violations 48/102, unclassified 13/13, sdk-bypass 159/182)"* — the SAME reading as U0/U1/U2; **no ceiling moved** |
| Root `tsc -p tsconfig.json --noEmit --skipLibCheck` @ 6144 MB (ALSO the scoped check — `apps/editor`'s own `typecheck` IS this config) | `lane-u3-VERIFY-root-tsc.txt` | **RC=0, zero errors** (an interim run read RC=2 — two `TS18048` in the lane's own file, hoisted-closure narrowing; fixed by capturing `provenance` after the guard) |
| **FALSIFICATION** — the ONE ops gateway severed (`loadFileFormat()` → rejects): **8/10 arms RED** and the failing diffs CONTAIN the loud typed refusal — *"The family-migrations ops could not be loaded from @pryzm/file-format — the edit was NOT applied and the draft is unchanged: SEVERED…"* (×4 in the output) — edits refuse loudly, never silently lost; restore **byte-identical** (sha256 `481483f9…` before == after); re-run **10/10 RC=0** | `lane-u3-VERIFY-falsify-SEEN-FAILING.txt` · `lane-u3-VERIFY-falsify-sha256.txt` · `lane-u3-VERIFY-falsify-RESTORED-GREEN.txt` | done |

⚠ Falsification method note: the first sever attempt replaced the import SPECIFIER with a
nonexistent module — vite refused it at TRANSFORM time and the whole file died at collection
("no tests"), which proves nothing about the runtime refusal path. The recorded sever rejects the
SAME gateway at runtime, so the arms fire and the refusal is read off the screen.

## §4 — The §64 sequence, as the user executes it

Create → Interior → **Components** → **Edit definition…** on *U3 Window* → **Add parameter…**
(`FrameWidth`, length, default 75) → click the **GlassWidth** row → **Formula…** → type
`Width - 2*FrameWidth` → the preview reads *"✓ Diagnostics clean — resolves to 1050 mm under
this scope"* and *"On apply, the current default (1000) is cleared and recorded as
supersededDefault (ADR-0376 D4)"* → **Apply formula** → the row wears the `Formula` badge at
**1050 mm** with *"Superseded default: 1000 — kept as provenance, never resolved"* → **Save
definition** → *"Saved — packed and reloaded through the catalogue (sha256:…)"* → browser →
**Place** W-1200 → plan click → select → the Component section reads **GlassWidth 1050 mm,
source Formula**. Make the frame 100 and the glass follows — the formula, not a copy.

## §5 — Deliberate choices a reviewer should see

1. **Ops applied directly, `from === to`.** The `MigratorRegistry` is a version-lift runner; a
   document edit at constant `formatVersion` calls the op's pure `apply` — the convention the
   file-format suite itself established (`makeAddParameterMigrator('1.0','1.0',…).apply(...)`).
2. **The preview is a resolver INPUT projection, never a document write** — it maps the draft's
   parameters with the candidate expression + cleared default (the post-op state) and feeds
   `buildParameterTableModel`. No second precedence statement anywhere (C84 EI-9).
3. **The retype control does not pre-filter the same dataType.** The op's own guard is the one
   voice; a client-side filter would be a second validator whose wording could drift.
4. **The applied-bad-formula case is ALLOWED and loud.** `introduce-expression` deliberately does
   not parse (the resolver is the voice); the document stays schema-valid and the table renders
   the typed failure with the pass marked `error` and nothing substituted (C110 §2.5/§6.4).
5. **An eval-time diagnostic cannot fire where a type value pre-empts the expression** — that is
   D4 working, not a display gap. Measured mid-lane (a `unit-mismatch` probe on Width returned
   clean because W-1200's type value 1200 won); the acceptance's ARM 4 comment records it so the
   next reader does not re-fight the precedence.
6. **`par_` ids ride the sanctioned ULID factory** (`createId` → `parseId` → re-prefix) — no
   second id generator.
7. **Type checksums pass through untouched.** `FamilyTypeSchema.checksum` is not recomputed by
   the ops and not enforced by the loader (U0's fixtures already load with the empty-map hash on
   non-empty values). Recomputing it here would be a rival writer; noted as O-4.
8. **`lastModifiedAt` is NOT touched on save** — the packer packs what it is given, the save path
   mints no clock, and byte-determinism of an unchanged re-save is preserved. If a modification
   stamp is wanted it needs a ruled owner (manifest-edit op), not a side effect.

## §6 — Owed / open (ranked)

| # | Owed | To whom |
|---|---|---|
| O-1 | ⭐ **`update-profile` family-migrations op** — profile GEOMETRY write-back. The 4F panel's `onCommit`/`commitRingToProfile` seam is ready and consciously unmounted; the workspace states the absence by name (`data-cdw-profile-owed`). Until the op exists the definition editor cannot persist sketch edits | `packages/file-format` (a model lane) |
| O-2 | **`delete-expression` op** — `introduce-expression` refuses a second formula by design ("use a paired delete-expression migrator first") and no such migrator exists; editing an existing formula is therefore impossible and the editor DISCLOSES it (`data-cdw-expr-existing-note`) | `packages/file-format` |
| O-3 | **G-7 stands, now proven at the UI**: `rename-parameter` rewrites solids' `lengthExpression` only — dependent PARAMETER formulas break loudly (`unknown-identifier`). The workspace narrates it; rewriting is the op's debt (C110 §1.4) | `packages/file-format` |
| O-4 | **Type-values `checksum` is dead weight at this seam** — written by authors, recomputed by no op, enforced by no loader. Either the loader verifies it or an op recomputes it; today it is inert and stated | model lane / C111 |
| O-5 | **U2's O-1 boolean-coercion export** — this lane added a third mirror of `numericTypeValues` (boolean→1/0) at the same join; one export from `@pryzm/family-instance` deletes all three | `packages/family-instance` (4D) |
| O-6 | **Type CRUD (U4)** — the workspace edits parameters only; duplicate/rename/create TYPE rows are U4's, via this same draft-save shape (the plan's recommendation (a)) | lane U4 |
| O-7 | **Dirty-close confirmation** — closing a dirty workspace discards silently after the persistent "Unsaved draft changes" banner; a confirm gesture is UX polish, not honesty debt | UI polish |

## §7 — ⚠ Shared-tree note for the orchestrator (the U0-§7 shape, again)

The Porto lane's commit **`94d65150`** (*"feat(pt/§PORTO-FLIP)…"*, mid-session, not this lane's)
swept three U3 artifacts into history at whatever state they were in:

- **`probe-unit-tmp.mjs`** — a THROWAWAY resolver probe this lane ran from the repo root for ~30
  seconds; it is junk, this lane deleted it, and the working-tree **`D probe-unit-tmp.mjs` is
  deliberate — fold the deletion into the U3 commit.**
- **`audit/.../lane-u3-VERIFY-acceptance-PASSING.txt`** — an interim (non-verbose) version got
  committed; the working-tree ` M` is the FINAL verbose per-arm transcript.
- **`vitest.config.ts`** — swept at its FINAL state (the workspace include) — nothing owed.

Everything else of this lane's is untracked working-tree at final, verified state:
`apps/editor/src/ui/component-editor-workspace/**`,
`apps/editor/__tests__/componentDefinitionWorkspaceThroughComposedRuntime.test.ts`, the modified
`apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts`, and the `lane-u3-VERIFY-*`
transcripts + this file. NOT this lane's, in flight: `lane4e-dist/` (4E), the Porto lane's
`site-parcel-data`/`ga-gate` deltas.

## §8 — What this lane did NOT do (absence ≠ completion)

No profile geometry persistence (O-1); no type CRUD (U4); no solid-feature creation UI (plan
§U3's solid scope waits on a feature-LIST authoring decision — the read-only list ships with the
R-a boolean refusal); no reference-plane authoring; no AI chat strip (U6); no 3-D preview (U5);
no `Family*` panel retirement (U7); no commit.
