# Phase A — Completion snapshot

> **Stamp**: 2026-06-02 (after the 21-slice continuous-build session)
> **Authority**: derived from [master-execution-tracker.md](./master-execution-tracker.md) status counts. Updated whenever a status flips on a top-level row.
> **Pairs with**: [PHASE-A-USER-CAPABILITIES-AND-TEST-PLAN.md](./PHASE-A-USER-CAPABILITIES-AND-TEST-PLAN.md) (the customer-readable side).

---

## §1 — Numbers

### Top-level Phase A (47 rows)

| Status | Count | % | What it means |
|---|---|---|---|
| ✅ DONE | 5 | 11 % | Every sub-slice landed |
| 🟢 IN PROGRESS | 13 | 28 % | Foundations shipped, surface (L5 / external) pending |
| 🟡 NEXT UP | 2 | 4 % | Queued + unblocked |
| ⚪ PLANNED | 17 | 36 % | Scheduled, not started |
| 🔴 BLOCKED | 2 | 4 % | External dependency (npm token, DNS creds) |
| — | 8 | 17 % | AI-command sketches A.42–A.47 (status TBD) |

**Touched: 20 / 47 ≈ 43 %.**
**Complete: 5 / 47 ≈ 11 %.**

### Sub-slice level (102 rows after multi-slice expansions)

| Status | Count | % |
|---|---|---|
| ✅ DONE | 40 | 39 % |
| 🟢 IN PROGRESS | 16 | 16 % |
| ⚪ PLANNED | 33 | 32 % |
| Other (BLOCKED + NEXT UP + sketch) | 13 | 13 % |

**Sub-slice complete: ~ 39 %.** This is the more honest "engineering completed" number.

---

## §2 — Done by area

| Area | State | Detail |
|---|---|---|
| **Typology platform** (A.1–A.4, A.20) | ✅ MOSTLY DONE | TypologyPipeline + TypologyRegistry + composeRuntime slot + apartment-pack BRIDGE + C50 DRAFT |
| **Onboarding chatbot** (A.5) | 🟢 L3 done | L5 React component pending |
| **Typology picker** (A.6) | 🟢 L3 done | L5 React component pending |
| **Site model** (A.7) | 🟢 ~ 90 % | L0+L3+commands shipped; only A.7.f IfcSite round-trip remains |
| **Site UI** (A.8) | ⚪ PLANNED | Cesium-light + parcel-draw + auto-analyses (Sprint 3–4) |
| **IFC** (A.9, A.25, A.26, A.27) | ⚪ PLANNED | Gap-fill + Revit variant + nightly suite |
| **Climate** (A.10) | 🟢 L0+L2+L3+commands DONE | A.10.f cross-package wiring + A.11 UI panel pending |
| **Marketplace / npm / DNS** (A.12–A.17) | 🔴 2 BLOCKED + 🟡 2 NEXT UP + ⚪ 2 PLANNED | A.12/A.13 need npm token + 2FA; A.14/A.17 need Cloudflare creds |
| **Pricing** (A.18) | ✅ FULLY DONE | L2 entitlements + L5 Astro pricing page |
| **House + Office typologies** (A.21, A.22) | ⚪ PLANNED | Major new typology engines (Sprint 7–12) |
| **Building / Apartment aggregates** (A.23) | 🟢 ~ 90 % | All schemas + stores + commands DONE; A.23.b.3 nullable + A.23.f legacy migration pending |
| **Inspect tree** (A.24) | ⚪ PLANNED | Sprint 8 |
| **Family packs** (A.28, A.29) | ⚪ PLANNED | Community-authored content |
| **Privacy / C22** (A.30) | 🟢 FOUNDATIONS DONE | L0 + L3 ConsentStore + consent.* commands DONE; server DSAR worker + UI pending |
| **Provenance / C23** (A.31) | 🟢 FOUNDATIONS DONE | L0 + L3 store + provenance.* commands DONE; L5 inspect tab pending |
| **Accessibility** (A.32, A.33, A.34) | 🟢 STATIC GATE LIVE | A.34 fully DONE; A.32 static DONE, dynamic axe-core pending; A.33 registry DONE, cheat-sheet UI pending |
| **Backup / DR** (A.35, A.36) | 🟢 4 RUNBOOKS DONE | A.35.b–d follow-ons + Q3 drill pending |
| **Cognition** (A.37, A.38, A.39) | 🟢 5 validators + aggregator + formatter DONE | L5 daylight + perceptual panel + modal integration pending |
| **Business / launch** (A.40, A.41) | ⚪ PLANNED | First 50 customers + Phase 1 exit ADR |
| **AI command surface** (A.42–A.47) | ⚪ PLANNED | 6 AI commands queued |

---

## §3 — The honest gap

**Foundations are 70–80 % done. Customer-visible UI is 10–20 % done.**

This session shipped 21 slices across L0 schemas, L2 helpers, L3 stores, and L3 commands — but the L5 React/Astro components that customers actually see are still PLANNED for most areas. That's the asymmetric pattern of this phase: the architecture is being put in place ahead of the surface.

### Biggest remaining chunks (impact-ordered)

1. **L5 UI work** across: A.5.b chatbot · A.6.b picker · A.8 Site UI · A.11 Climate UI · A.24 Inspect tree · A.33.b cheat-sheet · A.31.e Provenance tab · A.30.d.2 Privacy UI · A.38 daylight · A.39.c perceptual panel
2. **House + Office typologies** (A.21, A.22) — major new typology engines like apartment
3. **IFC production-grade** (A.25 gap-fill, A.26 Revit, A.27 nightly suite)
4. **Marketplace UX + first-party plugin listings** (A.15, A.16, A.28, A.29)
5. **External-dependency unblocks**: npm token (A.12, A.13), Cloudflare DNS (A.14, A.17)

### Velocity + ETA

This session's velocity was ≈ 20 well-bounded slices in 4-6 hours. At that pace the remaining ~ 62 sub-slices = ~ 3 more equivalent sessions, **plus** the external dependencies (npm, DNS, paying customers) that aren't engineering-bound.

---

## §4 — How to update this snapshot

When a tracker row flips status:
1. Update the [master-execution-tracker.md](./master-execution-tracker.md) row in the same PR.
2. Update this snapshot's §1 counts + the matching §2 row.
3. If a top-level area flips ⚪ → 🟢 or 🟢 → ✅, update the matching [PHASE-A-USER-CAPABILITIES-AND-TEST-PLAN.md](./PHASE-A-USER-CAPABILITIES-AND-TEST-PLAN.md) row too.

Three docs always agree: the engineering tracker (per-row status) + this completion snapshot (numbers + by-area summary) + the user-capability doc (what customers can test). Drift between them is a PR-review red flag.
