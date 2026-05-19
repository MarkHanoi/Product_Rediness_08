# §15  Summary and cross-document amendments

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 2273–2305.

---

## §15 Summary — what was added in S72 D-final replan

This document at S72 D-final stands as the binding wireup for PRYZM 2's GA. Beyond v1's bridge proposal (retracted) and the v2 8-phase plan (§4), it now contains:

1. **§11 — Click-trail wireups** (17 user gestures end-to-end, file:line accurate).
2. **§12 — Complete UI inventory** (every one of the 220 files in `src/ui/` mapped to category, runtime path, phase, bench).
3. **§13 — UI-interaction perf bench suite** (60 new benches in `apps/bench/src/benches/ui/` covering click-to-paint, panel mount, scroll fps, inspector update, cold mount, idle CPU, bundle size for the UI chunk specifically — closing the headless-only gap in the existing bench tree).
4. **§14 — Vision conformance check** (every Vision principle, NFT, layer, differentiator, and non-goal ticked against this plan with delivery phase + CI gate; every cross-document conflict resolved).
5. **§16 — Granular sub-phase plan** (~386 sub-phases across 15 sprints, S73–S87; every individual click, drag, hotkey, dropdown, right-click context-menu item, modal submit in `src/ui/` is its own numbered sub-phase = its own PR = its own bench). The H.8–H.10 catch-all sweep enumerates every event listener and global call site in `src/ui/` and asserts every one is assigned to a sub-phase ID before GA gates open. **No legacy code can ride along under the umbrella of "Phase F is done"** — each gesture migration deletes the legacy code path it serviced in the same PR.

The contract is now end-to-end:
- Operator intent → §1.
- Audit → §2.
- Architecture → §3.
- Phases → §4.
- Deletions → §5.
- UI preservation → §6.
- Risks → §7.
- Issues → §8.
- Decisions → §9.
- "Done" → §10.
- Click trails → §11.
- UI inventory → §12.
- UI perf benches → §13.
- Vision conformance → §14.
- Per-gesture sub-phase plan → §16.

Every word of `08-VISION.md` survives. Every word of `06-PRYZM-IDENTITY-AND-RECOUNT.md` survives. Every UI surface the operator trained on stays. Every L0–L7.5 capability is reachable through one typed handle. Every UI gesture has a measurable budget enforced in CI. Every UI gesture has a named sub-phase ID, a named PR, a named bench, and a named legacy-deletion gate. The 36-month rebuild ends as a refactor at the boundary, not a rewrite of the customer's eyes — and the refactor cannot stall halfway, because every gesture is independently shippable, independently revertible, and independently verifiable.

---

*If this document conflicts with `S71 §4.1`, `§4.2`, `§4.4`, or `§4.7`, this document wins. The v1 draft of this same document (the @pryzm/legacy-bridge proposal) is retracted in full. Where this document amends `09-AS-IS-VS-TO-BE.md` §3 row 4 (initUI/Layout deletion), the amendment is the §6 + §14.6 statement: `src/ui/Layout.ts` is preserved as the white-UI orchestrator, threaded with `runtime` in Phase B.*
