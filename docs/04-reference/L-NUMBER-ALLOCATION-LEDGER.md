# L-NUMBER ALLOCATION LEDGER

> **Status:** LIVE ALLOCATOR — not a contract, not a log. The ISSUE LOG
> (`docs/04-reference/ISSUE-LOG.md`) remains the record of what each L-number *means*.
> This file records only **who may mint which numbers**, so two lanes cannot mint the same one.

## 0. Why this exists

**Grep-before-minting stopped working on 2026-08-19.** Measured that session:

- the frontier moved **L-1199 → L-1226 in a few hours** — 27 numbers;
- **three lanes minted `L-1202` within one hour** (HR5, SITE1, UND1);
- one lane renumbered **three times** (`1197/1198` → `1202` → `1221`, each taken mid-flight);
- another minted `L-1214` only for a third lane's commit to sweep the same number into HEAD first.

The convention was *"grep the ISSUE LOG, then take the next free number"*. That is a
**read-then-write against a file many writers append to concurrently** — a textbook race. It is
correct for one writer and cannot be made correct for six by trying harder. Every lane that hit it
followed the instruction exactly and still collided.

⭐ **The failure is the same shape this codebase keeps finding elsewhere: a value that must be
REMEMBERED rather than DERIVED, read at a moment that has already passed by the time it is used.**
Two independent lanes proposed the identical fix — **reserved blocks** — which is what this file is.

## 1. The rule

1. **The orchestrator allocates a block to a lane when the lane is launched**, and writes the row
   below **in the same action**. A lane never chooses its own numbers.
2. **A lane mints only inside its own block.** No grep, no frontier check, no "next free" —
   the block IS the authority, and it cannot race because nobody else holds it.
3. **A lane that exhausts its block asks the orchestrator for a second block.** It does not
   continue past the end. Blocks are 10 wide, which has covered every lane measured so far
   (largest single-lane consumption: 6).
4. **Unused numbers in a closed block are NOT reclaimed.** A gap in the ISSUE LOG costs nothing;
   a reissued number costs a day of two people describing different defects under one id.
5. **The frontier only ever moves forward.** New blocks start above the highest number ever
   *allocated*, never above the highest number *found in the log* — an unlanded lane's rows are
   invisible to grep and that is precisely the race.

## 2. Allocation table

**Highest number allocated: `L-1369`.** Next free block starts at **`L-1370`**.

| Block | Lane | Session | State |
|---|---|---|---|
| L-1227 – L-1239 | UND1 — 3D linework / underlay view scope (allocated from the buffer) | 2026-08-19 | **L-1227 ✅ FIXED, L-1228 logged** (2 of 13 used) |
| L-1240 – L-1249 | ELEV1 — window/door elevation symbols | 2026-08-19 | **L-1240, L-1241 minted** (2 of 10 used) |
| L-1250 – L-1259 | ROUND1 — circular windows / arched doors | 2026-08-19 | **L-1250, L-1251, L-1252 ✅ SHIPPED** (3 of 10 used) |
| L-1260 – L-1269 | NL1 — wall finish / layer chat grammar | 2026-08-19 | **L-1260, L-1261, L-1262, L-1263 minted** (4 of 10 used) |
| L-1270 – L-1279 | JOIN1 — raked-wall joints (gap opens toward the top) | 2026-08-19 | **L-1270, L-1271, L-1272 minted** (3 of 10 used) |
| L-1280 – L-1289 | LOG1 — boot-log defect sweep (clash dead, durable thumbnails, triple open) | 2026-08-19 | **L-1280 … L-1289 minted — BLOCK EXHAUSTED** (10 of 10 used) |
| L-1290 – L-1299 | GPU1 — ShadowDepthTexture destroyed mid-submit on railing MATERIAL change | 2026-08-19 | **L-1290, L-1291, L-1292 ✅ FIXED; L-1293 ⛔ OPEN (measured)** (4 of 10 used) |
| L-1300 – L-1309 | PERF1 — load/render performance (145 warns, 13.2 MB autosave, cache thrash) | 2026-08-19 | **in use — L-1300 ✅ FIXED; L-1301–L-1305 logged; L-1306–L-1309 free** |
| L-1310 – L-1319 | SYNC1 — the plan-rejection latch + the blockers in the recovery path | 2026-08-19 | **L-1310, L-1311, L-1312 ✅ FIXED** (3 of 10 used; L-1313–L-1319 free) |
| L-1320 – L-1329 | SHAPE1 — shape modes (rect/circular/elliptical) across wall, curtain wall, slab, ceiling, floor | 2026-08-19 | **in use — L-1320 🔴 OPEN (slab profile-edit unreachable, reported not fixed) · L-1321 ✅ DECLARED (C87 R-11 + §13.14) · L-1322 🟡 OPEN (five shape spellings + `BoundaryDrawMode` name collision) · L-1323 🟡 OPEN (tessellation loses shape intent — founder decision) · L-1324 🟡 OPEN (circular slabs plan-only) · L-1325 🟡 OPEN (closed-loop wall runs plan-only) · L-1326–L-1329 free** |
| L-1330 – L-1339 | LIGHT1 — 20 LOD-200 lighting fixtures with photometrics | 2026-08-19 | **L-1330 ✅ SHIPPED** (20 families derived from ONE matrix; lumen-reader verdict: READ by the renderer, NOT by any analysis path — no illuminance calculation exists) · **L-1334 ✅ FIXED** (barrel-at-module-load broke repo-wide test collection) · **L-1331 ✅ FIXED** (C96 §9.1 / EI-3 CLOSED — exit (a): the LOD-200 matrix moved to L0 so `LightingKind` DERIVES its accepted set; 30-of-32 refused → 0; zero `apps/editor` changes) · **L-1332, L-1333 ⛔ OPEN** (generic plan symbols · beam angle does not narrow the light) — 5 of 10 used; L-1335–L-1339 free |
| L-1340 – L-1349 | LOG1 (second block) — project-open coalescing keyed on nothing | 2026-08-20 | **L-1340 minted** (1 of 10 used) |
| L-1350 – L-1359 | BG1 — grey WebGL-fallback viewport + WebGPU navigation ghost ("reminiscencia") | 2026-08-20 | **L-1350 ✅ FIXED** (§FRAME-STARTS-CLEAN-ON-EVERY-BACKEND — the per-frame OBC base clear was armed on the ONE backend whose overlay is opaque and DISARMED on the one whose overlay presents alpha 0 in empty space; the arms were INVERTED and a green test pinned the inversion) · **L-1351 ✅ FIXED** (the `background: #ffffff (all layers)` log line claimed three layers from a call that writes one on every Phase-5 backend) · **L-1352 ✅ FIXED** (§VIEWPORT-BG-PROBE enumerated the five BACKGROUNDS and could not name a grey that is DRAWN — ground shadow-catcher added as surface 0) · **L-1353 🟡 OPEN — MEASURED, NOT FIXED** (the grey is very likely the 4 km `ShadowMaterial` ground catcher, not the background stack; mechanism derived from three r183 `ShadowMaskModel`; needs ONE browser measurement to close) (4 of 10 used; L-1354–L-1359 free) |
| L-1360 – L-1369 | GIS1 (second block) — GIS panel phase 2b: legacy pill removal, PRYZM styling, buildability re-host | 2026-08-20 | **in use** |

> ⚠ **L-1197 … L-1226 are PRE-LEDGER** and were minted under the old racing convention. Several were
> renumbered in flight. **Trust the ISSUE LOG for what they mean, not any lane report that cites
> them** — at least four lane reports quote a number they later changed, and one commit message
> (`bd15d644`) still cites `L-1202` for a row that landed as `L-1225`.

## 3. What this does NOT fix

- **It does not detect a collision.** Nothing yet asserts that each `L-NNNN` appears under exactly
  one heading in the ISSUE LOG, nor that a cited number exists at all. That is a real gate and it
  does not exist — the same class as the contract-suite gates built the same day
  (`check-contract-cited-paths.ts`, `check-contract-index-equivalence.ts`). **Proposed as its own
  row when someone picks it up.**
- **It does not stop a lane ignoring its block.** It is a convention with an owner, not an
  enforced invariant. ⭐ Do not describe it as enforced; that would be exactly the
  "declared but never called" defect the amendment register catalogues.
- **It says nothing about ADR or SPEC numbering**, which have their own drift (ADR 268 → 272 and
  SPEC 96 → 97 in a single day, the sixth recurrence of the count-staleness failure).
