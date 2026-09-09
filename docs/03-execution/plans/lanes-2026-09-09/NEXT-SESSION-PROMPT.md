<!--
  NEXT-SESSION PROMPT — written 2026-09-09 at the session limit.
  Paste the block under "THE PROMPT" as the first message of the next session.
-->

# Next session — start here

## THE PROMPT (paste this)

```
Read docs/03-execution/plans/lanes-2026-09-09/NEXT-SESSION-PROMPT.md and pick up from it.

Then, in this order:
1. Deploy and prove the 6 commits sitting on main that are not yet live.
2. Salvage the five lanes that died at the session limit — their partial agent
   results are on disk (§4 below) and are worth more than re-running them.
3. Continue with §3, the ranked work.

Standing rules: commit and deploy as things land; run root tsc before committing;
always run tools/deploy/fly-bundle-proof.sh after a deploy; never git stash.
```

---

## 1 · Where things stand

**LIVE and proven on Fly: `632d57b9`.** Six commits have landed since and are **pushed but not
deployed** — that is the first job.

| Commit | What |
|---|---|
| `ddf426f9` | L-13271 envelope caps are earcut · L-13272 cap faces pinned to their storey |
| `2e625533` | L-13273 3D-Site face drag survives a project switch · L-13274 pen widths are paper mm |
| `e7de601b` | L-13275 the C13 VIOLATION was the audit accusing the project's own envelopes |
| `d4efc703` | L-13276 poché derives its plane from the view frame |
| `632d57b9` | L-13277 globe seat — the ring's picks were roofs ← **this one IS live** |
| `f1118f00` | L-13280 pressing Generate deleted the Draw-my-own card |
| `59f1a0ea` | L-13281 a plan line knows its element · L-13282 isolate no longer blanks the drawing |
| `7b1b9291` | L-13283 the generic municipal-volumes ingest |
| `f4b3308a` | L-13284 the Barcelona preview |

**Deploy recipe:** sync `C:/pryzm-deploy/tree` to the SHA, typecheck **that worktree**
(§6.9.2 — not the main tree), `fly-manual-deploy.sh <sha>`, then **`fly-bundle-proof.sh <sha>`**.
⚠ The proof can fail on a mid-flip and pass on retry; that happened twice today. Check the
served chunk hash against a fresh `/version` before believing a failure.

---

## 2 · 🇪🇸 Barcelona — the state, precisely

**The data is proven. The pipeline is designed. The wiring is not done.**

- `MTM_GPKG_alçades` is staged at `tools/context-bake/sources/bcn-local/` (git-ignored).
  **503,596 volumes**, EPSG:25831, `Z_MIN_VOL`/`Z_MAX_VOL` in **real metres**, zero nulls.
- `tools/context-bake/footprints/municipalVolumes.py` converts it. **Verified end to end:**
  503,242 features, zero unparseable geometry, first feature in El Raval, all four expectation
  checks pass.
- **The preview ships.** `window.pryzmPreviewBcnVolumes()` swaps the baked prisms for 11,013
  municipal volumes over a 450 m disc of Ciutat Vella. ⭐ **The founder has not seen it yet —
  it needs the deploy in §1.** His verdict on that decides whether the rest is worth building.

**Measured constraint that shapes everything:** at his own site there are ~5,100 volumes inside
300 m but **~77,000 inside the default 1,781 m scope**, against a 14,000-footprint budget. This
is a near-ring treatment and can only ever be one.

**The R2 plan is at `docs/04-reference/geospatial/BARCELONA-LOD2-ADOPTION-PLAN.md`.** Read it
before touching the bake. Two landmines from it, both verified in code:

- ⛔ **A failed manifest fetch silently disarms the no-loss gate**, and a `--layer buildings`
  publish then writes a manifest naming only `buildings` — the client memoises every unnamed
  layer as missing and **six live layers vanish for every user** while 63 GB of good bytes sit
  untouched on R2. Fix the `|| echo` in `context-merge-publish.yml` before any publish.
- ⚠ **I told the founder `--expect spain` would delete 48 regions. That was wrong** — a
  historical scar quoted as present tense. The code refuses by name now, and the live count is
  **46**, not 48. The real hazard is the manifest, above.

**Licence: unresolved, and the download needed no signup, so there are no accepted terms.** The
argument that CC BY-ND does not attach is that the product carries only municipal columns —
verified against the actual schema. That is an **argument, not a determination**. §A.5 of the
plan has a drafted email to `cartografia@bcn.cat`. ⛔ Do not block on it; every step except the
final publish is licence-independent.

---

## 3 · The ranked work

1. **Deploy + prove.** Nine fixes are sitting unproven.
2. **Get the founder's verdict on the preview.** One console call. It decides the Barcelona bet.
3. **The performance trilogy** — all three have the same root and it is measured:

   > `§CTX-READ-PROVENANCE roads: this read PAID FOR NOTHING — 25 tiles already decoded,
   > 0 downloaded. Its elapsed ms is WAITING on the read ahead of it.`
   >
   > Roads: **15,314 ms** first read, **4 ms** second. Same tiles.
   > `§DRAPE-COST-ATTRIBUTION: 8,037 ms waiting for terrain (shared FIFO), 23 ms own work.`

   The terrain sampler forces `max concurrent flights 1`. That was **right when written** —
   Córdoba had parks and roads each paying 14.1 s for the same download. The tile memo landed
   today (L-13263), so the premise may have changed. ⛔ **Before going concurrent, establish
   whether the memo dedupes only COMPLETED downloads.** If so, concurrency re-opens the Córdoba
   defect and the correct fix is an **in-flight promise map**, not more flights.

   The three symptoms: new project **9.2 s** on an empty project · location→split **11.5 s** ·
   scope increase **~45 s** with 34,046 footprints decoded and binned.
4. **Parcel highlight regression** — "doesn't get highlighted as before". Untraced. Use git;
   the founder says it worked before.
5. **The dead socket** — `WebSocket is already in CLOSING or CLOSED state` firing from a
   `requestAnimationFrame` tick. A per-frame emit on a closed socket. Also a correctness
   question: is the user silently offline while the UI says otherwise?
6. **Rooms as a category** — ⛔ read `ROOMS-AS-A-GOVERNABLE-CATEGORY.md` first. The row is step
   6 of 7. Three gates sit in front of it and the first is that **the room-colour control the
   founder already has refuses on its own default scope, every click, every session**.

---

## 4 · ⭐ Salvage before re-running — five lanes died at the session limit

They died *after* their expensive work. **The partial agent results are on disk** in
`journal.jsonl` under each transcript dir, and reading them is far cheaper than re-running.

| Lane | Task | Agents done | Transcript |
|---|---|---|---|
| New project 9.2 s | `wmcx1cry0` | 4 of 15 | `wf_a004c904-959` |
| Location → split | `wt27px190` | 5 of 17 | `wf_d0862700-745` |
| Scope in background | `ws7i6j1u2` | 3 of 10 | `wf_3d2ee0cb-14d` |
| Parcel highlight | `wq38x4t23` | 2 of 9 | `wf_8c2219aa-6d9` |
| Unstructured → semantic BIM | `w2qfsxvbq` | 1 of 11 | `wf_fadbe98e-42f` |

Base path: `C:\Users\LENOVO\.claude\projects\c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08\8f2c55de-eb52-4c0b-baee-ca1f2e040df3\subagents\workflows\`

⚠ `resumeFromRunId` is **same-session only**, so it will not work after the restart. Read the
journals directly. The scripts are saved beside them and can be re-invoked with `scriptPath`.

⚠ **The semantic-BIM lane also carries a warning:** its one completed agent (`astra-identity`)
ran while the safety classifier was rate-limited. Verify its output before acting on it.

---

## 5 · What was learned today, that should not be re-learned

⭐ **Six of eight root causes were one shape: one rule, two implementations, and the fix had
landed in the copy the founder was not looking at** — or the rule had one implementation and
several *readers*, one asking a narrower question and reading the missing answer as "no".
**The guarding test was green in nearly every case**, because it measured the copy that was
right. Look for this first.

Concrete instances, all fixed today: the envelope fan vs earcut · the plan painter asking one
of five id channels · the family gate answering a per-element isolate · the C13 audit's
hand-written list vs the persistence ledger · two legacy view bars.

⚠ **And two things I got wrong and corrected in the same session**, recorded so the pattern is
visible: the pen-width fix (my first draft re-opened L-288 by flattening the ISO ladder — the
founder pushed back and the right answer was neither my draft nor my hedge), and the "48 live
regions" claim above. Both were confident and both were wrong.

---

## 6 · Reference

- `docs/03-execution/plans/lanes-2026-09-09/README.md` — eight complete lane reports
- `docs/04-reference/geospatial/BARCELONA-LOD2-ADOPTION-PLAN.md` — plan + first-hand addendum
- `docs/04-reference/geospatial/FINDING-MORE-CITY-BUILDING-DATA.md` — the prompt for finding
  the next city's data, with the reasoning behind every requirement
