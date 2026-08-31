# ADR-0375 — RoomStore stays at the composition root; the fix direction is WIRE READERS, never REMOVE

**Status:** ACCEPTED · **Date:** 2026-08-31 · **Authority:** founder delegation of 2026-08-31
("take the decisions on me as per whatever is the most architecturally sound"), executed by the
orchestrating session. **Supersedes:** the REMOVE disposition for `packages/stores/src/RoomStore.ts`
in `audit/full-stack/2026-08-31/legacy.json` (whose own deadness premise was refuted at HEAD).

## Context — the claim and its refutation

The 2026-08-31 Axis L audit dispositioned `packages/stores/src/RoomStore.ts` REMOVE on the claim
"zero readers". Lane L2a re-proved the claim at HEAD before acting (the sheet.create protocol) and
**refuted it**: the FILE is live —

- constructed at the P1 composition root, `packages/runtime-composer/src/composeRuntime.ts:58` / `:1135`;
- typed at `runtime-composer/types.ts:4591`;
- imported by 5 aggregate-command handlers;
- exported by the stores barrel (`packages/stores/src/index.ts:74`);
- exercised by 3 suites;
- pinned by a named exclusion in
  `tools/rac-conformance/certification/gates/check-census-verified-invariants.ts`.

What IS true: the runtime **slot's readers are zero** — the store is written and registered, but no
consumer reads `runtime.stores` for room state (rooms render and report through the legacy
`CreateRoomCommand` path — see `§FIX-ROOM-CREATE-REFUSAL-IS-A-VALUE`). The audit conflated
*slot-unread* with *file-dead*.

## Decision

1. **KEEP.** `RoomStore` remains constructed and registered at the composition root. Removing a
   store the P1 root constructs, five handlers import and a certification gate names is
   composition-root surgery for zero measured benefit, and its own header requires an ADR for
   exactly this reason (C73 §3.7 — a collapse must state where copies disagree; there is no
   collapse to state yet).
2. **The fix direction is WIRE.** A write-only store is the C-audit's "dead DTO store" shape
   *only if it stays write-only*. The exit path is the room family's migration off the legacy
   command manager (blocked today on the engine half — BimManager level authority +
   `roomStore.attachEngine`, per the refusal text in `plugins/rooms/src/handlers/CreateRoom.ts`).
   When that lands, THIS store is the read model; readers get wired then.
3. **REMOVE is forbidden without a superseding ADR** that states the collapse per C73 §3.7.

## Consequences

- The audit's REMOVE row is closed WONTFIX-with-reason; `lane-L2a-remove-execution.md` carries the
  refutation evidence.
- Nobody re-litigates this from the "zero readers" line without first re-running the L2a liveness
  census — the claim was measured false once already.
