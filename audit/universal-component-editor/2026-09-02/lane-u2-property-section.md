# Lane U2 — the component instance property section

**Lane:** U2 (UI/UX wave) · **Date:** 2026-09-02 · **Authority:** UIUX-PLAN §U2 + §0.1 ·
lane-u0-definition-seam.md (the seam: `componentCatalog`, `entry(id).family`, the refusal texts) ·
lane 4F §7 (the named mount seam) · ADR-0376 D4/D5/D9 · C110 §2.2/§2.4/§2.5/§3.3 · C111 §4.1 ·
C16 CA-3/CA-18/CA-21 · C84 EI-1/EI-9 · spec §66 F-2.
**NOT COMMITTED** — per the brief. U0 base committed at `d2a01f29`; U0's load-bearing working-tree
deltas (its §7) were present throughout and untouched.

---

## §0 — One paragraph

**Select a placed component → see and edit its parameters — live end to end.** The
`PropertyPanelBodyRenderer` Phase-D ladder gained a `component` branch that mounts a new
`ComponentSection`: definition name (from the U0 catalogue), a type dropdown (the REUSED generic
picker) dispatching `component.swapType`, and **lane 4F's `ComponentParameterTable` MOUNTED, not
rebuilt** — its first production importer, closing 4F's unmet axis 3 — fed from the composed
`component` store + `componentCatalog.entry(id).family` through the ONE resolver. Row edits
dispatch `component.setInstanceParameter`; every refusal renders in the panel (swap refusals under
the dropdown naming BOTH ids, row refusals against their row); a definition that is not loaded
renders the honest named refusal and **zero rows, never stale numbers**. The profile-editor opener
port (`setComponentProfileEditorOpener`, 4F's O-1 seam verbatim) is wired at the mounting module to
a new view-only dialog over `createComponentProfilePanel`. **8/8 acceptance arms through the REAL
`composeRuntime()`, 301/301 across the whole property-panel + component suites, layer gate at the
same baseline, root tsc RC=0, falsification seen failing 8/8 and restored byte-identically.**

## §1 — What shipped (files)

| File | What |
|---|---|
| `apps/editor/src/ui/property-panel/ComponentSection.ts` *(new — OWNS)* | The section: catalogue-fed header, generic-picker type dropdown → `component.swapType`, the MOUNTED 4F table fed by `resolveParameter` over real store records, inline row editor → `component.setInstanceParameter` (SET + CLEAR legs), profile list + opener port, honest states for every missing wire. |
| `apps/editor/src/ui/property-panel/PropertyPanelBodyRenderer.ts` *(edit — OWNS)* | `elType === 'component'` mount branch + module-scope `setComponentProfileEditorOpener(openComponentProfileEditorDialog)` — the §OUTLINE81 idiom, same site as `setWindowOutlineEditorOpener`. |
| `apps/editor/src/ui/ComponentProfileEditorDialog.ts` *(new)* | The L7 modal satisfying the opener port: chrome around `createComponentProfilePanel`. **View-only from the instance panel and it says so** (no bus verb exists for document-internal edits — U3's draft-save seam; no dead save button). |
| `apps/editor/src/types/globals.d.ts` *(edit, additive)* | Narrow `window.runtime.stores.component` READ slot (get + getState), the `familyRegistryStore`/`tools` precedent — so the section needs no `(window as any)` (P4) and no `unknown` double-cast (L-845). |
| `apps/editor/src/ui/property-panel/__tests__/componentSectionReachability.spec.ts` *(new)* | ARM A: missing-runtime states itself by name, zero rows. ARM B (source-level, labelled): the body renderer imports, mounts, and wires the opener. Runs under the ROOT config (`property-panel/__tests__` already in the include list — no config edit). |
| `apps/editor/__tests__/componentPropertySectionThroughComposedRuntime.test.ts` *(new)* | The acceptance — §3. |

Untouched, per the hard rules: `apps/editor/src/services/componentCatalog/**` (U0's — consumed),
`apps/editor/src/ui/component/**` (4F's — mounted), `CreatePanelLayout`/browser/tool files (U1's),
`site-parcel-data/**` + `ui/site/**` (live lanes), `packages/schemas/**`, all verbs and handlers.
No new verb, no schema edit, no `vitest.config` edit, no `package.json` edit, nothing committed.

## §2 — The feed, stated exactly (C84 EI-9 — one seam, no copy)

`ResolverInput = { parameters: entry.family.document.parameters, type: document.types.find(occ.typeId)
(booleans → 1/0), instanceOverrides: occ.instanceParameters (booleans → 1/0) }` → `buildParameterTableModel`
→ the 4F table. The boolean coercion **mirrors `bakeFamilyInstance`'s private `coerceOverrides` /
`numericTypeValues`** at the identical join — flagged as a candidate export (§6). The store holds no
resolved values by design; the panel resolves at read time, which is why twenty instances follow a
type change with nothing propagated (ARM 3's F-2-at-the-panel).

⚠ **C110 §3.3 inherited, not resolved:** document values are in the resolver's canonical unit
(mm today, `RUNTIME_LENGTH_UNITS_PER_METRE`); the edit affordance labels its input from that SAME
seam, and no conversion is minted. The D3 metre flip (lane 4A's) moves every label here untouched.
⚠ The occurrence store's D3 "metres" doctrine and the resolver's mm are therefore still two
readings of one number at this seam — `bakeFamilyInstance` passes overrides unconverted and so does
this section, deliberately identically. One future conversion site, not two.

## §3 — Executed proof (all transcripts beside this file)

| Proof | Transcript | Verdict |
|---|---|---|
| **U2 acceptance** — 8 arms through `composeRuntime()` + `bootstrapWithEverything`, definition via `packFamily` → the ONE loader → the SAME `componentCatalog` singleton, `window.runtime` published as `engineLauncher` does: **(1)** place via verb → `_renderElementToContainer` (the REAL panel mount) → section, defname, both types in the dropdown with the current one pre-selected, per-row sources `type`/`default`/`expression` + computed `1050` · **(2)** `requestTypeSwap(TYPE_B)` → CA-21 `typeId` read-back + rows re-resolve (`600`, formula `450`) · **(3)** `beginEdit`+`submitEdit(1800)` → CA-21 override read-back, row turns `instance`, formula `1650`; the SECOND instance still `type` and holds `{}` (spec §66 F-2 at the panel) · **(4)** foreign type → refusal RENDERED under the dropdown naming `TYPE_ALIEN` **and** `DEF_ID`, store unmoved · **(5)** `submitEdit('abc')` → the handler's C110 §3.5-a "finite number" refusal AGAINST THE ROW, store untouched · **(6)** CLEAR removes the KEY, row returns to `type` · **(7)** unload the definition → named refusal + ZERO rows + the override value appears NOWHERE; reload → rows return · **(8)** opener unwired refuses by name; wired (the production dialog) it opens over the declared plane, view-only note stated | `lane-u2-VERIFY-acceptance-PASSING.txt` | **RC=0 · 8/8** |
| Reachability spec (ARM A honest states + ARM B source-level mount) under the ROOT config | `lane-u2-VERIFY-reachability-spec-PASSING.txt` | **RC=0 · 5/5** |
| **Gate-J neighbourhood + the whole panel surface**: `apps/editor/src/ui/component/__tests__` + `apps/editor/src/ui/property-panel/__tests__` — includes `openingProfilePanelReachability`, `finishTypeOutlineSection`, `surfaceByteIdentity`, `componentParameterTable`, `componentProfileSurface` | `lane-u2-VERIFY-panel-and-component-suites.txt` | **RC=0 · 22 files · 301/301** |
| Neighbour composed-runtime suites: U0 seam (7) + 4C join (14) + `bootstrap.everything` (4) | `lane-u2-VERIFY-neighbour-suites.txt` | **RC=0 · 25/25** |
| `npx eslint` over every touched file | `lane-u2-VERIFY-eslint.txt` | **RC=0** (10 pre-existing `no-explicit-any` warnings, all in `PropertyPanelBodyRenderer`'s pre-existing host/section code, none in lane files) |
| `check-layer-boundaries` | `lane-u2-VERIFY-gate-layers.txt` | **RC=0** — *"within baselines (violations 48/102, unclassified 13/13, sdk-bypass 159/182)"* — the SAME reading as U0/4F; **no ceiling moved** |
| Root `tsc -p tsconfig.json --noEmit --skipLibCheck` (heap 8192 per 4F §1 note 1) — this is ALSO the scoped check: `apps/editor`'s own `typecheck` script IS `tsc -p ../../tsconfig.json` | `lane-u2-VERIFY-root-tsc.txt` | **RC=0, zero errors** |
| **FALSIFICATION** — the resolved-parameter feed SEVERED inside the section (`componentCatalog.entry(...)` → `undefined`, one line): **all 8 arms RED** and the failing diff shows the honest state (defname `undefined`, no rows — never a stale number as a received value); restore **byte-identical** (`29fb98fb…` before == after, diff clean); re-run **8/8 RC=0** | `lane-u2-VERIFY-falsify-SEEN-FAILING.txt` · `lane-u2-VERIFY-falsify-sha256.txt` · `lane-u2-VERIFY-falsify-RESTORED-GREEN.txt` | done |

⭐ The honest-empty behaviour is proven TWICE, through two different severings: ARM 7 severs at the
REAL seam (`componentCatalog.remove` → refusal renders, `refresh()` recovers after reload — GREEN),
and the falsification severs in CODE (the arms catch it — RED). The first proves the state exists;
the second proves the tests would catch its loss.

## §4 — What this lane closes

- **4F's axis 3** (zero production importers) for `ComponentParameterTable` — and O-1's opener
  port is wired for the INSTANCE panel (`setComponentProfileEditorOpener` + its ARM-B spec).
  The definition-editor workspace wiring of the same port stays U3's (UIUX-PLAN §U3 OWNS).
- **UIUX-PLAN §U2's ALSO-CLOSES, half of it:** the chat deferral string *"Edit it in the
  Properties panel…"* (`ChatCommandClassification.ts:4051`) is now TRUE for a selected component;
  the string itself lives in a wave-held ai-host file and was not touched, per the plan.
- The U0 refusal texts REACH THE USER: both-ids swap refusal, "not loaded … load the definition"
  with its escape hatch, C110 §3.5-a value-shape refusals — all rendered, none console-warned.

## §5 — Deliberate choices a reviewer should see

1. **The edit affordance lives in the SECTION, not the table.** The brief says mount, not rebuild;
   the 4F table stays byte-untouched (its own 14-test spec still green at the same count), and the
   section attaches row-click → inline editor via the table's own `data-cpt-row` read-back
   attributes. "Clear override" renders only when an override exists — a gesture whose refusal is
   guaranteed would be a dead control by design.
2. **`parseRaw` refuses nothing.** An unparseable value is sent AS TYPED so the handler's
   `valueShapeRefusal` is the one voice naming the mismatch (ONE refusal vocabulary, C84 EI-9) —
   ARM 5 reads the handler's own words off the row.
3. **All parameters are fed to the resolver, none display-filtered by `exposed`.** Filtering the
   INPUT would break expression dependencies (an unexposed parameter feeding an exposed formula
   would go unresolved — a fabricated failure); display-filtering would need a table edit. Deferred,
   stated (§6).
4. **The dialog is view-only and says so.** A definition is a document (U3's draft-save mutation
   shape); no verb exists for document-internal edits and this lane mints none — the footer states
   the fact instead of shipping a save button wired to nothing.
5. **`window.runtime` is read at CALL time** through a typed narrow slot added to `globals.d.ts`
   (the `tools`/`familyRegistryStore` precedent) — no `(window as any)`, no `unknown` double-cast,
   and a session without the runtime gets a named refusal, not a blank section.
6. **An occurrence wearing a type its (re)loaded definition no longer declares** renders a named
   warning and resolves WITHOUT type values — store truth can outrun a reloaded document, and
   silently resolving over the gap would be an invented value.

## §6 — Owed / open (ranked)

| # | Owed | To whom |
|---|---|---|
| O-1 | **Export the boolean-coercion + `buildEvalScope` seams from `@pryzm/family-instance`** — this lane and `bakeFamilyInstance` now state each twice (C84 EI-9); one export deletes both mirrors | `packages/family-instance` (4D) |
| O-2 | **Per-row `exposed` display filtering** — needs a table option (4F's file) so resolution still runs over all parameters | a lane owning `ui/component` |
| O-3 | **Live refresh on external change** — the section re-renders after its OWN dispatches; an undo/redo or another client's edit needs the panel's normal re-render (like every other section) or a `subscribeDirty` + disposer once the panel has a dispose seam | panel lifecycle lane |
| O-4 | **4F O-3 unchanged** — `resolveParameter` returning a per-parameter SOURCE would delete the table's derivation; this lane added no third statement of the precedence | `packages/family-runtime` (4A) |
| O-5 | **The mm/metres seam delta (C110 §3.3 / ADR-0376 D3)** — inherited at this panel exactly as at the bake; ONE flip site (`RUNTIME_LENGTH_UNITS_PER_METRE`) moves both | lane 4A |
| O-6 | **Dark-theme restyle of the mounted table** — the section wraps it in a light card so 4F's light-ink table stays legible inside the dark panel; a theme pass belongs with the table, not a fork of it | UI polish |

## §7 — ⚠ Shared-tree note for the orchestrator

Lane **U1 was live in the same tree** during this lane (its `git status` footprint:
`CreatePanelLayout.ts`, `CreateRailPanel.ts`, `BimService.ts`, plantools files,
`ui/component-browser/`, a deleted `FamilyCreatorPlaceholder` trio, `lane-u1-*` transcripts).
**Zero file overlap, verified:** this lane's only shared-file edits are
`PropertyPanelBodyRenderer.ts` (+16 lines, purely additive) and `globals.d.ts` (+22, purely
additive), and `git diff` on both shows ONLY this lane's hunks — no U1 content rides in them.
The neighbour-suite and acceptance runs executed with U1's uncommitted work present in the tree
(shared-tree reality, stated not hidden); all green.

## §8 — What this lane did NOT do (absence ≠ completion)

No 3-D mesh regeneration proof (4E's seam, D10); no placement UI (U1); no definition editing
(U3); no type CRUD (U4); no AI strings touched (U6, wave-held files); no `Family*` panel touched
(U7's retirement); no commit.
