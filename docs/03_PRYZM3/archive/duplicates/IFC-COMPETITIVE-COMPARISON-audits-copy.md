# IFC Handling — PRYZM 2 vs Pascal, Forma, Qonic, Motif, Revit, Bonsai

> **Purpose**: a side-by-side comparison of how PRYZM 2 handles IFC versus the credible competitive set, on the axes that matter for a buying decision: load latency, native parity, property-set round-trip, multi-user collaboration on IFC, certification, and openness. The goal is to surface where PRYZM 2 wins, where it merely matches, and where it deliberately concedes.
>
> **Audience**: Founder, customer-facing engineering, sales, partnership conversations.
>
> **Authority**: subordinate to the SPEC and ADR series. Conflict precedence: `specs/SPEC-*` → `adrs/ADR-*` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → phase docs → `12-BIM-2-AND-3-POST-GA-ROADMAP.md` → `03-PASCAL-EDITOR-ANALYSIS.md` → this document. This file is **strategic / explanatory**, not contractual.
>
> **Cross-references**:
> - `[strategic ADR-008]` IFC scope (PRYZM 2's binding contract).
> - `SPEC-40` buildingSMART IFC4 certification (RV + DTV).
> - `M28-IFC-IMPORT-PIPELINE.md` (the pipeline this comparison is rooted in).
> - `03-PASCAL-EDITOR-ANALYSIS.md` (the Pascal-specific verdict).
> - `12-BIM-2-AND-3-POST-GA-ROADMAP.md` §risks (competitive landscape risk register).
> - `08-VISION.md` (positioning).

---

## §0 Methodology + caveats

The PRYZM 2 column is sourced from binding internal docs: `[strategic ADR-008]`, `SPEC-12`, `SPEC-26`, `SPEC-40`, `07-EXECUTION-PLAYBOOK §14`, and `M28-IFC-IMPORT-PIPELINE.md`. It is the post-S55 (M28) reality plus the post-S58 (M29) export reality plus the post-S84 (M42) certified reality.

The competitor columns are sourced from public product documentation, public-facing demos, open-source repositories, and 2025–2026 conference talks (RTC Europe, AU, AEC Magazine reviews). They are the best-effort summary of public knowledge as of 2026-04-28; some closed-source products may have non-public capabilities not captured here. Where evidence is uncertain, the cell carries a **(?)**. Where a product made an explicit roadmap commitment but has not yet shipped, the cell carries a **(announced)** marker.

This is not a sales document. It is an internal positioning aid. Update it whenever a competitor ships a feature that changes a row.

The **competitive set** was selected on three criteria: (1) credible BIM authoring or coordination at architectural scope, (2) explicit IFC interoperability story, (3) evidence of being mentioned by current or prospective PRYZM customers. That gives:

- **Pascal Editor** — open-source, MIT, web-native (the inverse-mirror of PRYZM 2; analysed in depth in `03-PASCAL-EDITOR-ANALYSIS.md`).
- **Autodesk Forma** — cloud-native conceptual design + analysis, the closest "web BIM" name brand.
- **Qonic** — cloud-native open-BIM authoring, ex-Bricsys team, IFC-first positioning.
- **Motif** — newer real-time AEC canvas / collaboration platform.
- **Autodesk Revit (incl. rumored Revit Web)** — desktop incumbent, the IFC interop benchmark customers compare against.
- **Bonsai (formerly BlenderBIM)** — open-source Blender plugin, the IFC fidelity benchmark.

---

## §1 Headline scorecard

The matrix is `★★★★★` (best in class) → `☆☆☆☆☆` (absent / broken). Subjective but defensible from §2 onward.

| Axis | PRYZM 2 (M28+) | Pascal | Forma | Qonic | Motif | Revit | Bonsai |
|---|---|---|---|---|---|---|---|
| Load latency on 50 MB IFC | ★★★★ | ★★★ | ★★★★ | ★★★★ | ★★ | ★★★ | ★★ |
| Initial bundle cost (web only) | ★★★★★ | ★★★ | ★★★★ | ★★★★ | ★★★★ | n/a (desktop) | n/a (desktop) |
| Native parity for imported elements | ★★★★★ | ★★ | ★★ | ★★★ | ★ | ★★ | ★★★★★ |
| Pset round-trip fidelity | ★★★★★ (M42 cert) | ★★★★ | ★★ | ★★★★ | ★ | ★★ (lossy famously) | ★★★★★ |
| Geometry round-trip fidelity | ★★★★★ (M42 cert) | ★★★ | ★★ | ★★★★ | ★ | ★★ | ★★★★★ |
| buildingSMART RV+DTV certification | ★★★★★ (M42) | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★ (announced) | ☆☆☆☆☆ | ★★★★ (cert held) | ☆☆☆☆☆ |
| Real-time multi-user authoring on IFC | ★★★★★ | ☆☆☆☆☆ | ★★ (read-only collab) | ★★★ | ★★★★ (canvas only) | ☆☆☆☆☆ | ☆☆☆☆☆ |
| Soft locks on IFC elements | ★★★★ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★ | ★★ | ★★★ (work-share desktop) | ☆☆☆☆☆ |
| AI proposals on IFC elements | ★★★★ | ☆☆☆☆☆ | ★★★ (analysis only) | ★★ (announced) | ★★★ | ★★ | ★★ |
| Headless / CLI / CI IFC pipeline | ★★★★★ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★ | ☆☆☆☆☆ | ★ (Forge/APS only) | ★★★★★ (ifcopenshell) |
| Self-host | ★★★★ (Phase 3D) | ★★★★★ (it's a repo) | ☆☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★★★ |
| Open license | ★★ (plugin SDK MIT, core source-available) | ★★★★★ (MIT) | ☆☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★★★ (LGPL) |
| IFC4.3 alignment / road / rail | ★★★ (Phase 7, M40+) | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★ (announced) | ☆☆☆☆☆ | ★★ | ★★★ (community) |

---

## §2 Per-axis analysis

### §2.1 Load latency on a 50 MB IFC

The dominant variable is *where* `web-ifc` (or its equivalent) runs.

- **PRYZM 2** runs `web-ifc.wasm` server-side in `apps/ifc-worker` (Node 20). Browser uploads → BullMQ on Upstash Redis → worker parses → returns intermediate model → browser dispatches commands. Browser tab stays interactive throughout. (`07-EXECUTION-PLAYBOOK §14`, `M28-IFC-IMPORT-PIPELINE.md §4`.)
- **Pascal** runs `web-ifc` in the browser (it's React + Three.js + IndexedDB; no server-side worker). The 3.4 MiB WASM blocks the main thread during parse on big files. UI freezes are a documented complaint in their issue tracker.
- **Forma** parses server-side via Autodesk's cloud — fast, but adds round-trip latency and requires a stable connection.
- **Qonic** is server-side parse + WebGL streaming of fragments (similar shape to Forma). Generally fast but the streaming model means full-fidelity geometry is lazy.
- **Motif** is canvas/whiteboard-first; IFC support is thin and (per public demos) not optimised for large files.
- **Revit** parses on the desktop; performance scales with the workstation. Reliable but not "fast" — large IFC import is a documented multi-minute operation.
- **Bonsai** uses `ifcopenshell` (C++) on the desktop. Fast and faithful; UI blocks during parse but the Blender event-loop handles it gracefully.

### §2.2 Initial bundle cost (web only)

For the four web-native players this is a real differentiator.

- **PRYZM 2** — `vite.config.ts` marks `@thatopen/components` and `web-ifc` as **external** in the editor build (SPEC-12 §2.2). Editor pre-load + on-paint ≤ 1.8 MiB gzip target (M36 GA gate); viewer-only build < 800 KB gzip. The 3.4 MiB IFC chunk only downloads when the user clicks "Import IFC".
- **Pascal** — bundle includes OBC + `web-ifc` for any project; their template is "open-source web BIM editor", so heavy initial cost is accepted.
- **Forma** — heavy initial bundle (Autodesk's cloud SDK) but mitigated by aggressive CDN caching.
- **Qonic** — similar to Forma; thin shell + streamed fragments.
- **Motif** — small bundle (canvas-first, IFC is opt-in).

PRYZM 2 wins this row because it is the only player that has *explicitly* engineered IFC weight out of the initial bundle as a first-paint-budget objective.

### §2.3 Native parity for imported elements

The single most important architectural row. Does an imported IFC wall behave like a natively-drawn wall?

- **PRYZM 2 — yes, structurally.** The plugin dispatches `addWall`/`addSlab`/`addDoor` — the same commands native tools use — into `wallStore`/`slabStore`/`doorStore`. The Property Panel resolves schema from the store, not from `mesh.userData.type`. Imported elements participate in Visibility-Intent, multi-user sync, soft locks, AI proposals, and `.pryzm` persistence with zero special cases. (`M28-IFC-IMPORT-PIPELINE.md §7`.)
- **Pascal — no.** Their IFC import places fragments via OBC's fragment system; imported geometry does not become Pascal nodes (`useScene.nodes`). It cannot be edited as a wall, only viewed/measured.
- **Forma — partial.** Imported IFC is read-only context for analysis; you cannot "edit a wall in the imported IFC" — you author your concept geometry alongside it.
- **Qonic — yes, partial.** Qonic is built around editing IFC directly; imported elements are first-class. But Qonic's authoring depth (parametric families, constraint-based modelling) is shallower than PRYZM 2's.
- **Motif — no.** IFC is reference-only.
- **Revit — partial.** IFC import goes through Revit's "linked IFC" or "imported IFC" paths. Linked is read-only. Imported becomes Revit elements but with famously lossy mapping (the "open IFC in Revit" complaint).
- **Bonsai — yes.** IFC elements ARE the Blender objects; this is by design.

PRYZM 2 ties Bonsai for best-in-class on this row, and beats it on every web-native row (load, multi-user, headless, certification path).

### §2.4 Property-set round-trip fidelity

The single most under-served customer pain in the BIM industry. Every customer has a story about losing parameters on Revit↔IFC round-trip.

- **PRYZM 2** — ADR-008 §Property-set round-trip is binding: ≥ 95% of instance properties round-trip at GA, 100% at S84 (cert). Custom Psets preserved as `_ifcCustom` bag; export round-trips byte-equal. The cert programme (SPEC-40) makes this auditable.
- **Pascal** — uses ifcopenshell-style fidelity for Psets they read; preservation on export is good.
- **Forma** — Psets are preserved on the round-trip *through Autodesk's cloud*; the editor itself does not surface every Pset.
- **Qonic** — strong Pset story (it's their pitch). Generally faithful.
- **Motif** — limited Pset visibility.
- **Revit** — famously lossy. The IFC2x3-vs-IFC4 schema mapping in Revit's open-source IFC exporter has known omissions; community workarounds (`Pset_RevitTypeProperties`) exist but aren't standard.
- **Bonsai** — best-in-class; ifcopenshell preserves everything.

This is PRYZM 2's clearest commercial wedge against Revit. The slogan: *"Your Psets survive round-trip."*

### §2.5 Geometry round-trip fidelity

- **PRYZM 2** — SweptSolid for parametric families on write; MappedRepresentation for type-instanced; Brep fallback for booleaned results. Analytic representations written for walls and slabs (ADR-008 §Geometry §Write). 100% geometry round-trip target by S84.
- **Pascal** — depends on OBC; generally faithful for simple geometry, weaker for booleaned results.
- **Forma** — geometry is preserved through Autodesk's pipeline.
- **Qonic** — strong; they edit native IFC representations.
- **Revit** — has the same mesh-tessellation problem on export that loses parametric editability.
- **Bonsai** — best-in-class via ifcopenshell.

### §2.6 buildingSMART RV+DTV certification

The single most market-credible badge in open BIM. Procurement in UK, EU, Singapore, Australia, Spain, Germany references certified-tool lists.

- **PRYZM 2** — SPEC-40 binds the programme: self-test S73–S78, provisional submission S79, independent lab (TUM or KIT) S80–S82, certification awarded S84. Pass rate ≥ 99% by S82, 100% by S84. **Hard Phase 4 exit gate.**
- **Pascal** — no certification programme announced.
- **Forma** — no IFC4 certification (Autodesk's cert is on Revit, not Forma).
- **Qonic** — actively pursuing certification (announced).
- **Motif** — no certification.
- **Revit** — held IFC4 certification historically; cert status varies by year.
- **Bonsai** — no certification (open-source project; certification fees are prohibitive).

PRYZM 2 will be **the first web-native BIM tool with both IFC4 RV and DTV certification**. That's a press-release headline at M42.

### §2.7 Real-time multi-user authoring on IFC

This is the row where PRYZM 2 wins outright.

- **PRYZM 2** — Yjs sync (S43), awareness (S44), soft locks (S45) all work on imported IFC because imported elements are native walls/slabs/doors. Two architects in different countries can edit the same wall in the same imported IFC at < 250 ms p95 latency, with cursor + tool indicators, with conflict-safe locks. (`M28-IFC-IMPORT-PIPELINE.md §9`.)
- **Pascal** — single-user only. No collab in v0.6.0.
- **Forma** — multi-user on Forma's authoring layer, but IFC is read-only context, so "multi-user on IFC" is "multi-user looking at IFC", not editing.
- **Qonic** — multi-user, real-time, cloud-native — the closest direct competitor on this row. But authoring depth shallower.
- **Motif** — multi-user on the canvas but not on BIM elements.
- **Revit** — work-sharing on a desktop central file is multi-user-ish but high-latency, with central-file conflicts; not modern real-time.
- **Bonsai** — single-user (Blender doesn't have real-time multi-user; community projects exist).

The slogan: *"PRYZM 2 is the only product where two architects can edit the same wall in an imported IFC simultaneously."*

### §2.8 Soft locks on IFC elements

- **PRYZM 2** — TTL-based soft locks per element via `pryzm_element_permissions`; rendered as a friendly badge in any view (3D / plan / section / sheet). Auto-expire.
- **Qonic** — yes (their model is server-authoritative); user experience is reasonable.
- **Revit** — work-sharing's borrowing model is a soft-lock equivalent but desktop-centric and high-friction.
- **Pascal / Forma / Motif / Bonsai** — n/a (no real-time concurrent editing).

### §2.9 AI proposals on IFC elements

- **PRYZM 2** — AI approval queue (S47) accepts `CommandPayload` envelopes for *any* element, IFC-imported or native. AI workflows in Phase 3A (S49–S52) include CV / generative / rules / voice. Per-project budget enforced server-side (SPEC-28 §4).
- **Forma** — AI is heavy on analysis (sun, wind, embodied carbon) — strong but not editing IFC.
- **Qonic** — AI tooling announced; less mature.
- **Motif** — AI canvas features but limited to its own object model.
- **Revit** — Forma + Revit Insight integrations exist; not native to Revit.
- **Pascal / Bonsai** — community plugins exist; not first-class.

### §2.10 Headless / CLI / CI IFC pipeline

- **PRYZM 2** — `apps/headless` + `apps/ifc-worker` give `pryzm ifc import …` and CI-runnable buildingSMART fixture suites. Useful for batch onboarding, regression, server-side cleanup pipelines.
- **Bonsai** — ifcopenshell + Python = best-in-class scripting story.
- **Qonic** — partial (their API exposes some operations).
- **Forma** — Autodesk Platform Services (formerly Forge) gives a forms-based pipeline but not "run IFC import in CI".
- **Pascal / Motif / Revit** — limited or absent.

### §2.11 Self-host

- **PRYZM 2** — Phase 3D self-host docker-compose (per `[strategic ADR-012]` minimums + SPEC-15 §7) ships at S70. Editor + gateway + sync-server + bake-worker + ai-worker + ifc-worker + Postgres + Redis + MinIO.
- **Pascal** — it's a public MIT repo; it's already self-hosted by definition.
- **Bonsai** — it's a Blender plugin; trivially self-hosted.
- **Forma / Qonic / Motif / Revit** — closed cloud or closed desktop; no self-host.

### §2.12 Open license

- **Pascal** — MIT, full repo public.
- **Bonsai** — LGPL, full repo public.
- **PRYZM 2** — plugin SDK MIT (Phase 3C, S65), core source-available with commercial licensing for SaaS competition prevention. **This is a deliberate concession** — full MIT competes with Pascal's positioning, and the founder's strategy in `12-BIM-2-AND-3-POST-GA-ROADMAP.md` §risks treats Pascal as a partnership opportunity, not a fight on licence.
- **Forma / Qonic / Motif / Revit** — closed.

### §2.13 IFC4.3 alignment / road / rail

- **PRYZM 2** — out of v1 scope (ADR-008 §Out of v1 scope). Phase 7 (M40+) per `12-BIM-2-AND-3-POST-GA-ROADMAP.md`. **Deliberate concession** — building-oriented v1.
- **Qonic** — IFC4.3 announced.
- **Revit** — partial.
- **Bonsai** — community ifcopenshell can read IFC4.3.
- **Pascal / Forma / Motif** — n/a.

---

## §3 Where PRYZM 2 wins outright (positioning takeaways)

These are the rows where PRYZM 2 is the **only** product with a credible answer at GA (M36) or shortly after:

1. **Real-time multi-user authoring on imported IFC** — Pascal can't (single-user); Forma can't (read-only); Qonic is the only credible peer and is shallower on authoring depth; Revit's work-sharing isn't real-time.
2. **Initial bundle cost while keeping IFC as a first-class capability** — only PRYZM 2 has explicitly engineered IFC weight out of first-paint while still treating IFC as a core, certified-grade pipeline.
3. **buildingSMART RV+DTV certification on a web-native tool** — projected to be a first.
4. **Headless IFC pipeline + multi-user editor in the same product** — Bonsai has the headless story, Qonic has the multi-user story; nobody has both.
5. **AI proposals on IFC elements with cost-budgeted per-project approval queue** — only PRYZM 2 ships this end-to-end.

---

## §4 Where PRYZM 2 merely matches (do not over-claim)

1. **IFC fidelity vs Bonsai** — Bonsai uses ifcopenshell, the gold standard for read fidelity. PRYZM 2 matches at S84 cert level but does not exceed.
2. **IFC fidelity vs Qonic** — Qonic is IFC-native; PRYZM 2 ties on round-trip but Qonic's IFC-first posture means their schedules and views align with IFC structure more directly.
3. **Conceptual / analysis depth vs Forma** — Forma's sun, wind, embodied carbon analysis is years ahead. PRYZM 2 closes the gap in Phase 5+ (per `12-BIM-2-AND-3-POST-GA-ROADMAP.md` §M48).
4. **Multi-user UX maturity vs Qonic** — Qonic has been shipping multi-user since 2023; PRYZM 2's M24 launch is younger. Qonic's UI conventions are more battle-tested.

---

## §5 Where PRYZM 2 deliberately concedes (and why)

1. **License vs Pascal / Bonsai** — full open-source competes with Pascal directly; PRYZM 2 chooses commercial licensing for the core to fund the 36-month build. Plugin SDK is MIT to keep ecosystem compatibility.
2. **IFC4.3 alignment / road / rail** — building-oriented v1; civil/infra is Phase 7 (M40+).
3. **MEP / structural-analytical IFC** — Phase 3+ marketplace plugins, not v1.
4. **BCF (BIM Collaboration Format)** — Phase 3B+ (S58 backlog).
5. **Coordination View 2.0 certification** — out of scope (deprecated by buildingSMART in favour of DTV per `[strategic ADR-035]`).
6. **Firefox / Safari / Edge** — Chromium-only until S70 (Phase 3D).

---

## §6 Competitive risk register (summarised from `12-BIM-2-AND-3-POST-GA-ROADMAP.md` §risks)

| Risk | Mitigation in plan |
|---|---|
| **Pascal raises a $40M Series A in 2027 with bS partnership and ships IFC + plan view + marketplace by M48** — leapfrogs PRYZM 2's GA-era moats | Open acquisition / partnership conversations with Pascal team by M40; if no deal, ship a marketplace integration that absorbs them slower. |
| **Autodesk launches "Revit Web" before M48** with native CDE + multi-user + IFC4 | Phase 4 §3.4 NFT targets that beat Revit Web before it launches; standards leadership in Phase 6 makes Autodesk's closed-stack Revit Web look anachronistic. |
| **Qonic captures the "open BIM authoring" brand before PRYZM 2 ships** | M42 buildingSMART certification + the multi-user authoring depth wedge close the gap. |
| **Forma adds full IFC editing capability** (currently read-only) | Unlikely (Autodesk would cannibalise Revit); if it happens, PRYZM 2's open-source plugin SDK + self-host + per-project AI budget wedge are the differentiators. |

---

## §7 The honest one-liner

**PRYZM 2 wins on every web-native row that matters for cross-tool authoring and live collaboration on real customer IFC files (load latency without bundle penalty, native parity, Pset and geometry round-trip, real-time multi-user editing of imported IFC, soft locks, AI proposals, headless / CLI pipelines, and an explicit Phase 4 buildingSMART RV+DTV certification programme); ties Bonsai for best-in-class IFC fidelity at certification time; concedes IFC4.3 alignment / road / rail and full open-source licensing; and is younger and less battle-tested than Qonic on multi-user UX maturity. The slogan is "your Psets survive round-trip, two of you can edit the same wall, and you can run it from a CI script — none of which your incumbent tool can do."**

---

## §8 Update protocol

This document is updated whenever:

- A competitor ships a feature that changes a row (e.g. Forma adds IFC editing).
- A PRYZM 2 commitment in `[strategic ADR-008]`, `SPEC-40`, or `M28-IFC-IMPORT-PIPELINE.md` slips a phase.
- A new credible competitor enters the BIM authoring market.

Owner reviews quarterly at minimum. The matrix in §1 is the canonical "where do we stand" snapshot for board updates.

---

*Last updated: 2026-04-28. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. This document is strategic; the contracts live in SPEC-* and ADR-*.*
