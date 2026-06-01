# §10  What 'done' looks like (operator-visible + architecturally honest)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 689–712.

---

## §10 What "done" looks like (operator-visible + architecturally honest)

After Phase H D-last:

1. **Visually identical to PRYZM 1.** Open `/`. White landing. Click Log in. White hub. Click + New project. White modal. Project created via `ProjectListClient` → server → event log. Click Open. White toolbar + sidebars + inspector paint over a canvas owned by the new `Renderer` mounted into `#container`. The user does not notice that the engine was replaced.

2. **One source of truth for everything.** One bus, one undo stack, one set of stores, one event log, one sync client, one renderer, one frame scheduler, one plugin host, one AI client, one bake coordinator. `rg "window as any" src/` returns 0. `rg "import.*from.*src/(engine|elements|commands|ai)" src/` returns 0.

3. **All 12 element families behave identically to PRYZM 1.** Wall create, slab edit, door place, window resize, roof draw, curtain-wall pattern, grid offset, column copy, beam connect, stair flight, handrail trace, ceiling void — every operation visually + behaviourally identical, dispatched through `runtime.bus`.

4. **Plugins, AI, IFC, Rhino, BCF, PDF all functional through the white UI.** Marketplace install lands a contribution; the white toolbar shows the new tool. AI sidebar streams tokens. IFC import uploads + parses + materialises. BCF viewpoints round-trip. Rhino .3dm imports. PDF-to-BIM extracts.

5. **Multi-tab + multi-user works.** Open the same project in a second tab; presence cursors paint; edits sync sub-second; conflicts surface a typed toast in the white UI.

6. **The perf budget is met.** First-frame ≤ 800 ms. Idle 0 fps. Scrub 120 fps. 50K-element project opens in ≤ 2 s P95. Memory ≤ 1.5 GB on L-large. The OTel `pryzm.boot.first_frame_ms` span confirms it on every session.

7. **The code base is half the size it was before.** ~150K LOC of legacy gone. ~3K LOC of `runtime-composer` added. Net contraction. Every package ships only what the runtime consumes.

8. **The contract is enforced by a robot, not by tradition.** Lint rules block `window as any`, `requestAnimationFrame` outside the scheduler, `localStorage.setItem` outside the event log, `document.createElement('canvas')` outside the renderer, imports from `apps/editor/src/projects/`, and the literal `#1a1f2e` in the wrong package. CI fails the build the moment any contract regresses.

That is the best browser BIM app — same UI the customer trained on, every L0–L7.5 capability live behind it, no patches, no forks, no second source of truth. The 36-month rebuild was about making this picture true. This plan is the wireup.

---

