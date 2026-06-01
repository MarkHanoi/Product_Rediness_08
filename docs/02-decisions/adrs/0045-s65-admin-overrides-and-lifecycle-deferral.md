# ADR-0045 — S65 Enterprise Admin Overrides + Lifecycle-Event Deferral

* **Status**: Accepted (sprint-scoped, S65, 2026-04-28)
* **Related**: ADR-028 Part E (plan/role overrides), ADR-030 Part D (view+project lifecycle deletion), K3-A risk register

## Context

Phase 3C §S65 work-item 8 mandates the enterprise admin UI for plan/role/feature overrides per ADR-028 Part E. Work-item 10 mandates deletion of the view+project lifecycle event types per ADR-030 Part D — but that deletion is flagged as a K3-A risk because in-flight S64 marketplace-api consumers + S62 plugin-sdk consumers still subscribe to those events. This ADR captures both decisions in one document because they share the admin/governance ownership boundary.

## Decisions

### A. Standalone `packages/admin-overrides` workspace package
Mirrors `packages/ai-spend` (ADR-0043 §A). Exports: `OverrideRecord` zod schema, `OverrideStore` interface, `InMemoryOverrideStore`, `resolveEffectivePlan(subjectId, baselinePlan, store, now)`. Pure resolution logic, in-memory store at D1, Postgres adapter deferred to S66.

### B. Override record shape
`OverrideRecord = { subjectKind: 'workspace' | 'user', subjectId, plan?, roles?, features?, expiresAt?, setBy, setAt, reason }`. `setBy` + `setAt` + `reason` are mandatory for audit trail per ADR-028 Part E §3 — every override must explain itself.

### C. Resolution semantics
`resolveEffectivePlan` precedence: (1) explicit user override (non-expired) wins, (2) explicit workspace override (non-expired) wins next, (3) baseline plan otherwise. Expired overrides are ignored *but not deleted* — retention belongs to the admin (audit trail per Part E §3). Roles + features merge by `Object.assign({}, baseline, override)` semantics; arrays are *replaced* not concatenated to avoid silent privilege escalation.

### D. Public API surface (api-gateway)
`GET /v1/admin/overrides` (list), `GET /v1/admin/overrides/:subjectKind/:subjectId` (read), `PUT .../:subjectKind/:subjectId` (upsert), `DELETE .../:subjectKind/:subjectId`. All endpoints require admin role + `project:read` (read) or `project:write` (write). Body validation rejects unknown plan/role enum values 400 to prevent typo-induced silent privilege grants.

### E. Lifecycle-event deletion DEFERRED to S66
ADR-030 Part D mandates deletion of `view.created`, `view.deleted`, `project.created`, `project.deleted` event types. K3-A risk register flags this as **HIGH** because the marketplace-api telemetry harness + plugin-sdk descriptor onboarding pipeline both subscribe today. Deletion at S65 would cascade-break two S64 deliverables. **Decision**: defer deletion to S66 with a hard owner (sprint engineer for S66 D1) + a kill-switch metric that fails CI if any subscriber remains by S66 D5. This is the responsible engineering call vs the alternative (silent break + post-mortem).

## Consequences

* `packages/admin-overrides`: 19 tests green at D1, < 350 LoC source
* Lifecycle-event deletion is a tracked deferral with named successor sprint, not silent slippage
* Override storage is in-memory at D1 → resets on restart; production deployment at S66 must wire Postgres before the admin UI ships externally

## Deferrals

| Item | Owner | Reason |
|---|---|---|
| Postgres `OverrideStore` adapter | S66 | persistence is orthogonal to API contract |
| Lifecycle-event deletion (ADR-030 Part D) | S66 D1 (HARD OWNER) | K3-A high-risk; subscribers must migrate first |
| Admin UI front-end (React panels) | S66 with `packages/ui/` migration | Part of the S64 D7 80% UI migration carry-over |
| Per-feature toggle telemetry | S68 | needs per-flag exposure logging |
