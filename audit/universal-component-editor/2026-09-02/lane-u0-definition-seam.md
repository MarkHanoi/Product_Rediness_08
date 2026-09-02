# Lane U0 — the definition-catalogue seam

**Lane:** U0 (UI/UX wave foundation) · **Date:** 2026-09-02 · **Authority:** UIUX-PLAN §U0 + §0.2 ·
Phase-4 verify still_open item 2 · ADR-0376 D5/D9/D10 · C110 §3.5-a · C111 §1.1/§3.1/§4.3-b ·
C84 §6.2c/EI-9 · C16 CA-3/CA-21 · audit R1.
**Base:** Phase-4 tree committed at `0c90a2da`. ⚠ **See §7 — a perf-wave commit (`7fa60a2b`) swept
this lane's mid-flight files into history before the lane finished; the working tree carries the
FINAL deltas and they are load-bearing.**

---

## §1 — What shipped

**The one production seam that resolves a `definitionId`/`typeId` to a real ComponentDefinition**,
closing the Phase-4 verify's still_open item 2 (*"definitionId resolves to NOTHING in production —
definition-existence, typeId-membership, instance-kind enforcement and unit-kind-at-placement are
all currently unenforceable"*). All four are now enforced through the REAL composed runtime.

### §1.1 — `apps/editor/src/services/componentCatalog/` *(new — the lane's OWNS)*

`ComponentCatalog` + the process-default `componentCatalog` singleton (the `defaultFamilyCache`
precedent). It **wraps the ONE loader** — every definition enters through
`loadFamilyFromBytes` (`@pryzm/family-loader/bytes`) → `unpackFamily` Zod validation → resolver
pre-flight → the `(familyId, schemaHash)` cache (C111 §4.3-b's exact key). There is deliberately
NO `registerDocument()` seam — bytes or nothing, so no rival validation path can grow (audit R1).

- **Three load legs, provenance recorded per entry:** `loadFromFile` (file-open, `'project'`),
  `loadFromMarketplace` (the LIVE `GET /api/v1/families/:id/download` transport — C111 §3.1's one
  LIVE row; HTTP failure → typed `transport-failed`; a download whose manifest id differs from the
  id asked for → `identity-mismatch`, nothing registered), `loadBuiltin` (`'builtin'`).
  `listMarketplace()` drives `GET /api/v1/families` read-only.
- **Honest empty state:** a project with no definitions answers `list() === []` / `has() === false`
  — answers, not errors; a failed load is a typed refusal. The two cannot collapse.
- **One resolver, both seams:** it implements the plugin's `ComponentDefinitionResolver` port AND
  its `has()` satisfies the committer's `ComponentDefinitionSource` (lane 4E's port, ADOPTED —
  `entry(id).family` hands the 4E bake wiring the real `LoadedFamily` for `bakeFamilyInstance`).
- **`subscribe()`** for U1's browser to refresh on register/remove/clear.
- ⚠ **Lazy loader import, deliberately** (see §5-D2): the loader graph reaches the
  `@pryzm/file-format` barrel, which eagerly evaluates pdfjs-dist (`DOMMatrix` at module scope);
  a static import here killed every node-environment boot suite at collection.
- ⚠ **OPEN, flagged, not invented:** *where do a project's definitions persist?* In-memory +
  explicit load per the plan; project-scoped persistence awaits a founder/ADR ruling. `clear()` on
  project close until then.

### §1.2 — `plugins/component/src/definitionResolver.ts` *(new — the port)*

Structural port (`has`/`view`/`list` + `ComponentDefinitionView` projection + provenance), same
reasoning as `committer/ports.ts` — no file-format/loader dependency lands on the command surface;
TypeScript checks the real catalogue against the shape at the wiring site (`PluginRegistry.ts`).
Plus `valueShapeRefusal(dataType, value)` — the value-SHAPE half of C110 §3.5-a, never-overstating
(boolean↔boolean, string↔string, the four numeric dataTypes↔finite number, count additionally
integer; no magnitude/unit claims — D3 canonical metres arrive converted upstream).

### §1.3 — The three handlers, enforcement WITH the port, Phase-4C behaviour WITHOUT it

Injected via `buildComponentHandlerSet({ definitions })` ← the component descriptor in
`PluginRegistry.ts` (which also advertises `buildAuxiliaries: () => ({ componentCatalog })` on
`runtime.auxiliaries`). **No default resolver exists anywhere** — a handler without a catalogue
keeps the declared format-only gap, never a fabricated "yes" ([[fake-more-capable-than-real]]).

| Verb | New refusals (all BY NAME, canExecute reason + typed execute throw, re-checked on REDO) |
|---|---|
| `component.place` | definition not loaded (names the id + catalogue count, "the catalogue is EMPTY" when it is) · typeId not a type of the definition (names BOTH ids + the declared type list) · override key not declared · override on `kind:'type'` parameter (C111) · value shape vs `dataType` (C110 §3.5-a) |
| `component.swapType` | target type not a type of the occurrence's definition (names BOTH ids) · definition not loaded (names it + the escape hatch: load, then swap) |
| `component.setInstanceParameter` | SET leg: same three parameter checks + definition-not-loaded. **CLEAR leg deliberately NOT catalogue-gated** — clearing moves toward the ladder and refusing it would be [[refusing-half-needs-its-escape-hatch]] |

### §1.4 — `@pryzm/family-loader` browser-safe split *(one loader, unchanged behaviour)*

`loadFamilyFromBytes` moved verbatim to its own module; `loadFamily(path)` keeps the
`node:fs/promises` leg and delegates to it; new `./bytes` subpath export carries the browser-safe
surface. Code moved, no pipeline duplicated.

### §1.5 — `unpackFamily` §U0-CORRUPT-ENTRY *(packages/file-format)*

The plan's acceptance says *"a tampered file refuses with the loader's named error"*. Measured: a
ZIP whose central directory parses but whose ENTRY PAYLOAD is corrupt ESCAPED `unpackFamily` as a
raw jszip stream error (`Bug : uncompressed data size mismatch`) — violating its own stated policy.
All seven entry extractions now go through `extractEntry`, and the failure returns
`{ ok:false, reason:'not-a-zip' }` with the entry named. Tracked `src/family-unpack.js`/maps
regenerated from the same compile (they had been shadowing the `.ts` in the vitest graph).

---

## §2 — Executed proof (all foreground; transcripts beside this file)

| Proof | Transcript | Verdict |
|---|---|---|
| ⭐ **RED-FIRST**: place with well-formed, nonexistent `fam_<ULID>` — dispatch RESOLVED before the seam | `lane-u0-VERIFY-redfirst-SEEN-FAILING.txt` *(committed in `7fa60a2b`)* | **RC=1, seen failing** — the resolved command record is in the diff |
| **U0 acceptance**, 7 arms through `composeRuntime()` + `bootstrapWithEverything` (the join-test pattern): refuse-by-name on empty catalogue → load-then-same-dispatch-succeeds → swapType both-ids + unloaded-definition legs → instance-kind + unit-kind at place AND set + ungated clear → three provenances + transport refusals → tampered file → live-instance remove/reload | `lane-u0-VERIFY-acceptance-PASSING.txt` | **RC=0 · 7/7** |
| Join + AI slice suites (fixtures now loaded through `packFamily` → the one loader; caveats 3/4 closed in-file) | `lane-u0-VERIFY-join-and-ai-PASSING.txt` | **RC=0 · 17/17** |
| Plugin suite (incl. new handler-layer enforcement file with no-resolver CONTROL arms) | `lane-u0-VERIFY-plugin-suite-PASSING.txt` *(committed)* | **RC=0 · 29/29** |
| family-loader · family-instance · file-format family suites | `lane-u0-VERIFY-family-loader-PASSING.txt`, `lane-u0-VERIFY-fileformat-family-PASSING.txt` | **RC=0** · 4/4 · 23/23 · 57/57 |
| Editor bootstrap suites (node env — the graph my wiring touches) | `lane-u0-VERIFY-bootstrap-suites-PASSING.txt` | **RC=0 · 24/24** (8 of these were collection-dead before, see §4) |
| **FALSIFICATION**: loader wrap severed inside `loadFromBytes` → 5 arms RED and the failing output CONTAINS the named refusal (`names no definition loaded…the catalogue is EMPTY`, ×2) — the arms fire, never a silent pass; restore **byte-identical** | `lane-u0-VERIFY-falsify-SEEN-FAILING.txt` · `lane-u0-VERIFY-falsify-sha256.txt` (`d816a667…` before == after) · `lane-u0-VERIFY-falsify-RESTORED-GREEN.txt` (**24/24, RC=0**) | done |
| `check-layer-boundaries` | `lane-u0-VERIFY-gate-layers.txt` | **RC=0** — *"within baselines (violations 48/102, unclassified 13/13, sdk-bypass 159/182)"* — **no ceiling raised** |
| Root `tsc --skipLibCheck --noEmit` (build heap) | `lane-u0-VERIFY-root-tsc.txt` | **RC=0, zero errors** (an interim run read RC=2 — 4 errors, ALL in Europe-wave in-flight files `siteDispatch.ts`/`resolveNlBestemmingsplan.ts`, both working-tree-modified by that wave, zero in lane files; their next edit cleared them) |

Zero edits under `packages/schemas/**` (the hard rule; the kind exists). The serialize-only trio
untouched. No new verb, no schema, no rival loader, no new refusal channel (reasons ride C16 CA-3).

---

## §3 — What U1 / U2 / U3 / U6 / 4E can now consume

- **`componentCatalog`** (import `apps/editor/src/services/componentCatalog/`, or
  `runtime.auxiliaries.componentCatalog` off the composed runtime): `list()` for the browser's
  definition/type enumeration (name, semver, provenance, types, parameters — with kind + dataType
  for U2's table), `subscribe()` for refresh, `loadFromFile`/`loadFromMarketplace`/`listMarketplace`
  for the open/browse legs, `entry(id).family` for anything needing the real document.
- **Refusal texts are UI-ready**: every refusal names the ids involved and the live alternative
  (load the definition / edit the type / the declared type list) — C16 CA-18 shape.
- **4E bake wiring**: pass `componentCatalog` as the committer's `definitions` port unchanged, and
  `bake: ({definitionId,…}) => bakeFamilyInstance({ family: componentCatalog.entry(definitionId)!.family, … })`.
- **U6 (AI)**: `resolveCatalogueRef`'s honest "no catalogue" branch can now close over `list()`.

## §4 — Pre-existing defects found and fixed in passing (attributed, measured)

1. **`packages/family-loader/__tests__/loadFamily.test.ts` + `packages/file-format/__tests__/family-round-trip.test.ts`
   were DYING AT COLLECTION** (`ReferenceError: DOMMatrix is not defined` — the file-format barrel
   eagerly evaluates `import/PDFToImageConverter.ts` → pdfjs-dist). Reproduced with a one-line
   barrel-import probe containing no lane code. The **family-round-trip GATE had been running 0
   tests** — a dead gate guarding nothing. Fixed with the happy-dom pragma both files now document.
2. **Unmasking the gate exposed a stale arm**: its schema-hash-mismatch test mutated
   `document.defaults` — a field **§C111-TWO-DEFAULT-CHANNELS deleted in v1.1**; Zod strips it, so
   the mutation had become hash-invisible and the arm failed honestly once it ran at all. Repaired
   to mutate a parameter's `defaultValue` (canonicalised in every supported version). 57/57 green.
3. **`unpackFamily` corrupt-entry escape** — §1.5 above.

## §5 — Defects this lane introduced and fixed before handover (stated per audit rule 6)

- **D1:** the acceptance's first tamper arm crashed instead of refusing — led to §1.5.
- **D2:** the first catalog revision imported the loader STATICALLY, putting the file-format barrel
  (→ pdfjs-dist) on the composition root's module graph and killing `bootstrap.everything.test.ts`
  at collection. Fixed with the lazy `await import('@pryzm/family-loader/bytes')` inside
  `loadFromBytes()` (type imports erased); bootstrap suites re-run 24/24. ⚠ **The committed
  `7fa60a2b` version of `ComponentCatalog.ts` is the STATIC-import revision — the working-tree
  delta is the fix. See §7.**

## §6 — Open items, deliberately NOT done here

- **Project-scoped definition persistence** — founder/ADR ruling owed (plan §U0); the catalogue
  header carries the flag. Nothing invented.
- **4E production render wiring** — the committer port is satisfied by the catalogue but the
  production mount still does not register `ComponentCommitter` (4E's pre-authorised descope);
  wiring it is a U-lane/4E follow-up, one line of `definitions: componentCatalog` when it lands.
- **`catalog.remove()`/`clear()` do not touch placed occurrences** — they are the user's data; the
  verbs refuse further edits by name until the definition is reloaded. UI lanes surface this state.
- **The marketplace legs were driven through an injected fetch** against the LIVE route's exact
  URL/bytes contract; an end-to-end run against the running server is a deploy-time check.

## §7 — ⚠ HANDOVER: the shared-tree sweep, and what MUST be committed

The perf wave's `7fa60a2b` (committed mid-session, not by this lane — this lane made **no commits**
per its brief) swept most U0 files into history at whatever state they were in. Everything swept is
at its FINAL state **except** the items below, which exist only as working-tree deltas and are
**load-bearing** — at bare HEAD, `bootstrap.everything.test.ts` fails at collection (§5-D2's
static import is what got committed):

- `apps/editor/src/services/componentCatalog/ComponentCatalog.ts` — the lazy-import fix (§5-D2).
- `packages/file-format/src/family-unpack.ts` + regenerated `.js`/`.js.map`/`.d.ts.map` — §U0-CORRUPT-ENTRY.
- `packages/file-format/__tests__/family-round-trip.test.ts` — pragma + §4.2 repair.
- `packages/family-loader/__tests__/loadFamily.test.ts` — pragma.
- `audit/universal-component-editor/2026-09-02/lane-u0-*` transcripts + this file.

Also in the tree, NOT this lane's (Europe wave, in flight — do not fold into the U0 commit):
`apps/editor/src/ui/site/siteDispatch.ts`, `packages/site-parcel-data/**`,
`tools/ga-gate/check-envelope-never-overstates.ts`, `packages/site-parcel-data/__tests__/nlBouwvlakHoles.test.ts`.
