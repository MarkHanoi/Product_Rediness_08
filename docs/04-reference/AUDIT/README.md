# PASCAL ↔ PRYZM production-readiness audit (2026-08-23)

Five parallel, **read-only** audits comparing **[pascalorg/editor](https://github.com/pascalorg/editor)**
— a shipping production BIM editor, MIT, React Three Fiber + WebGPU — against PRYZM.

> **Founder ask, verbatim:** *"audit pascal editor from beginning to end — then check the quality
> of production and compare with the code of PRYZM… architecture, builders, commands, plugins, DTO,
> store, scene robustness, quality, speed, collaboration, everything!!! … it needs to be MASSIVE —
> super detailed — super technical — and with a clear implementation plan of what PRYZM should do /
> what is better / clear comparison."*

**Measured against** Pascal `45a8cce` and PRYZM `f07b69cf`.

| File | Axis | Lines |
|---|---|---|
| [A-architecture.md](A-architecture.md) | packages, layering, composition root, extension model | 901 |
| [B-commands-store.md](B-commands-store.md) | commands, DTO stores, undo, mutation path | 741 |
| [C-scene-render.md](C-scene-render.md) | geometry builders, scene graph, render loop, speed, capture | 670 |
| [D-collab-persistence.md](D-collab-persistence.md) | collaboration, sync, persistence, observability | 959 |
| [E-quality-ci.md](E-quality-ci.md) | testing, gates, CI, type safety, DX | 928 |
| | | **4,199** |

Each file carries the same eight sections: scope/method · measured facts · Pascal's design ·
PRYZM's design · **head-to-head table** · **ranked implementation plan** · what PRYZM does better ·
what could not be established.

---

## ⭐ The one finding the five share

PRYZM's defects this session were **not twelve coincidences — they are five structural causes**, and
every one produces the same shape: *built correctly, unreachable.*

| # | Cause | Measured | Explains |
|---|---|---|---|
| 1 | Plugin contract type declared at **L7**, not L0 (`PluginRegistry.ts:133`) | 3 rival censuses — `ls plugins/` **51** · `ALL_PLUGINS` **27** · `PLUGIN_CATALOG` **28** — and **no gate compares them** | **9 element families shipped fully built and undispatchable** (PRYZM's own comments, `PluginRegistry.ts:79-87, 410-423, 507-520`) |
| 2 | **17 `.created` mirrors · 0 `.updated` mirrors** in `initTools.ts` | 217/351 verbs (61.8 %) cannot name the store they write | every `*.setMaterial` REFUSES; the lift rendering 1 of 16 members |
| 3 | Instancing **excludes mitred walls** (`WallFragmentBuilder.ts:1394-1400`, `!startMN && !endMN`) | the only draw-call mechanism skips every wall that joins another | the 367-wall / 32.7 s / 2069-mesh freeze |
| 4 | `PRYZM_TRACING` appears in **zero config files** | 266/266 spans instrumented, none recording | production incidents with no telemetry |
| 5 | 130-gate suite aborting on **2 missing JSON strings** | exit 1 after 9 lines, *before* the runner | ✅ **fixed** in `f07b69cf` — and CI's billing outage hid it |

⚠ **Causes 4 and 5 were hiding each other**: the gate that would have reported the silence could not
run, and the CI that would have reported the gate was dying in 3–4 s on a billing block.

---

## What Pascal actually buys — it is not "smaller is better"

Pascal has **no command layer at all** (`grep "commandBus|dispatchCommand|executeCommand"` over 1,929
files → **0 hits**). Every mutation from every surface goes through four store actions. Material is a
**node field**, so the undo snapshot, the persistence payload and the agent payload are the *same
type*. **PRYZM's dead-verb class is therefore structurally impossible there** — not fixed, impossible.

The cost is visible in authoring: a new editable property is **2 files** in Pascal versus **≥8
registries** in PRYZM; `lift.create` touches **25 files**.

Their compile boundary is the other half: `composite: true` + project references + `exports`-to-`dist`
means **`tsc --build` *is* the layer checker**. PRYZM has 102 package manifests and **zero** exporting
`dist` — which is *why* `eslint-plugin-boundaries` silently checked nothing.

---

## ⭐ What PRYZM does better, and must keep deliberately

- **Hidden-line removal** — 954 lines, one engine, three consumers. Pascal: **0 hits for every HLR
  term.** Likewise sheets, titleblocks, printed scale, poché/hatch/pen-weights, DXF/PDF/IFC-out.
- **Yjs collaboration.** Pascal has **none** — SSE polling, last-writer-wins. Its 409 path never
  advances `versionRef`, so a dismissed conflict makes the session **permanently unable to save**;
  and a newer remote version replaces the store **then clears history**, destroying unsaved edits
  *and* the undo stack that could have recovered them.
- **Zero idle CPU** — one rAF owner across 5,267 files. Pascal calls `advance()` unconditionally at
  50 fps, 80 systems, forever.
- **The conflict-surfacing gate** — 402 real merges, 268 that discarded authored state, **0 SILENT**,
  with a planted silent merge caught by its exact key.
- **`check-no-dark-test-files.ts`** — *"the best engineering artefact in either repo"*: plants a
  negative control to prove its own arms fire, runs a satisfiability proof that green is reachable,
  and names the axis it does not cover.
- **The per-family package split is vindicated** — 103 kind-name branches in PRYZM's framework versus
  **446** in Pascal's. *The split is right; the registration table above it is wrong.*

## ⚠ Fair in the other direction

Pascal carries an **11,639-line `floorplan-panel.tsx`** frozen by rule rather than fixed, 48
`as unknown as` casts at its own registry seam, `noExplicitAny`/`noUnusedVariables` globally off, an
`AGENTS.md` pointing at a directory that does not exist, a README claiming IndexedDB persistence that
`grep` cannot find, and its own authored-but-unwired seam (`installHistoryCommandDelegate`, 0 callers).

**Its Supabase Realtime layer — the one in the founder's console capture — is NOT in the public
repo** (`realtime-observability` → 0 files; `postgres_changes` → 0; `WebSocket|wss://` → 0). The OSS
tree is the single-player engine plus published seams; the multiplayer app is closed. Every
unreachable item was audited as a **seam**, never as a product.

And `apps/editor` is **587,012 LOC — 33 % of PRYZM and 1.32× Pascal's entire product** — at L7, where
nothing can reuse it and no inter-package gate reaches inside.

---

## The three cheapest wins, each with prior art in this repo

1. **`check-plugin-census-equivalence.ts`** — Size **S**, touches no production code. Compare the
   three plugin lists as **sets, both directions**. PRYZM already built this exact gate for its
   contract index; Pascal's equivalent for its element registry is **30 lines**.
2. **`check-mirror-completeness.ts`** — assert that any verb whose `affectedStores` names a plugin
   DTO store has a `CommandEventBridge` case or a declared exemption. *"It would have caught pool,
   lift, balcony, boundaryLine and all 13 `setMaterial` refusals before the founder saw them."*
3. **Surface the instancing reject counters** `WallFragmentBuilder.ts:1420-1440` already bumps — so
   cause #3 is **counted rather than assumed**. ⭐ This is the prerequisite for the geometry-merge
   recommendation, and it can falsify it: *if mitre is not the dominant reject clause, that plan is
   wrong and must be re-ranked.*

---

## ⚠ Status

These five files are the **evidence**, not the contract. **C107 has not been minted** — when it is,
it supersedes this directory as the normative statement and these remain the working papers behind it.

⛔ Nothing here is normative. Where an audit and a contract disagree, the contract wins; where an
audit and the code disagree, **re-run the command in the audit** rather than trusting either.
