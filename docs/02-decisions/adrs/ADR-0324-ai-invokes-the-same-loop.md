# ADR-0324 — AI invokes the same loop: envelope, parity, approval binding, batch semantics

- **Status**: ACCEPTED — ratified by STR-06 (founder directive, 2026-08-12)
- **Peers**: C67 (the chat control plane — this ADR preserves its architectural intent) ·
  ADR-0314 (`runBatch` undo-neutrality) · ADR-0322 (the consequence contract this ADR's
  confirmation flow consumes). **Subordinate to**: STR-06.

## Decision

1. **One funnel, enriched — never forked.** Human UI, keyboard, AI, batch and remote all
   reach `executeCommand()`; AI gets no special executor and no AI-specific router. The
   command envelope gains an optional `CommandExecutionContext`:
   `actor {kind: human|ai|system|remote, id?}` · `origin {surface, proposalId?}` ·
   `gestureId?`. **AI provenance is metadata about the invocation, not a different command
   path.**
2. **Origin and approval are separate concepts, never merged.** WHO/WHAT initiated
   (`CommandOrigin`) vs WHAT was proposed-validated-approved (`CommandApproval`:
   `proposalId`, `approvedBy`, `rationale?`, `confidence?`). An AI-initiated,
   human-approved command reads `origin.actorKind='ai'` + `approval.approvedBy=<human>` —
   `actorId="ai"` stamped everywhere is rejected as the model.
3. **Parity is behavioral and gated, not architectural.** G-REASON-04:
   `normalize(result.human) === normalize(result.ai)` for identical command+payload — same
   validation, refusal, plan, mutation, affected set, undo semantics — where `normalize`
   excludes exactly actor/origin/timestamp/proposal metadata. **The binding invariant:
   actor/channel may affect AUTHORIZATION POLICY, but must not alter geometric, dependency,
   validation, consequence-planning, or mutation semantics unless the command contract
   explicitly permits it.** "Both call the same function" is intent; this gate is proof.
4. **AI confirmation happens AFTER prediction.** The flow is intent → resolution →
   validation → **impact/plan** → human confirmation over the ACTUAL consequence set
   (including untouched counts and undetermined items) → execution of the **exact approved
   plan** → post-mutation report. A proposal card without the consequence set is the
   specification gap, not a confirmation.
5. **Approval binds to the plan, not to the sentence.** `planId`/`planHash`/state-hash
   generated together; execution verifies both; a model change between approval and
   execution invalidates the approval → re-plan → re-ask (G-REASON-05). "Yes" means
   *I approve plan X*, never *run that command again*.
6. **Batch semantics are declared**: **Atomic** (all-or-none) or **Progressive** (sequential
   with partial reporting), chosen per batch, with every report stating
   `completed / failed / notAttempted / undoUnits` (G-REASON-07). Atomicity is never quietly
   retrofitted into the existing coordinator, and ADR-0314's one-undo-unit property is
   preserved where declared.

## Consequences

The read-only capability class (landed `a48fa88d`) becomes the read half of a symmetric
story: reads proven against store bytes, writes proven by normalized parity. C67's registry
remains the source of chat truth; this ADR adds the invocation envelope it was missing.
The `AIApprovalRecord` evidence stream gains a binding target instead of being prose.
