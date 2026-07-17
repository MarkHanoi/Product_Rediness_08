# ADR-0130 — Canonical persistence format (live JSON snapshot vs `.pryzm` envelope)

> **Stamp**: 2026-07-16 · **Status**: PROPOSED (needs founder/architect ratification — do NOT treat as binding until CANONICAL)
> **Governs**: [C05 Persistence & File Format](../contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md), [C47 File-Format Versioning](../contracts/C47-FILE-FORMAT-VERSIONING.md), [pryzm-binary.md](../../04-reference/file-formats/pryzm-binary.md)
> **Raised by**: L-337 (DOC-ARCH readiness scorecard — "no canonical persistence format; the contracts contradict each other")

---

## Context

PRYZM has **two persisted representations of a project living side by side**, and the contract suite does not say which is authoritative — worse, three canonical docs give **three mutually-contradictory definitions of what `.pryzm` even is**:

| Representation | Where | Schema marker | Round-trip test? |
|---|---|---|---|
| **Live JSON `ProjectSnapshot`** | server version rows + browser IndexedDB (`VersionRepository`); the format `save`/`load` actually operate on | `SNAPSHOT_SCHEMA_VERSION = 5` (`ProjectSerializer.ts`, `SnapshotConstants.ts`) | **No** (the live path has no byte-equal round-trip test — see L-334) |
| **`.pryzm` envelope** | user-initiated export / interchange / durable archive | own `schemaVersion` (v1) | **Yes** (the only format with a byte-equal round-trip test) |

The contradiction in the canonical docs:
- **C05 §2.1** — `.pryzm` = ZIP + `project.json` (ElementStore snapshot) + `assets/` + `ifc/`.
- **`pryzm-binary.md` §1.1** — `.pryzm` = ZIP + `events/*.evt.bin` (MessagePack) + `chunks/<sha256>.glb`, `schemaVersion: 1`.
- **C47 §2.3** — treats `.pryzm` as **raw JSON** with a top-level `formatVersion`, and **§10.2 still lists "binary container format" as an OPEN QUESTION.**

So today nobody can answer "which format is authoritative?" or "what is inside a `.pryzm`?" from the docs, and durability/backup guarantees (C48) have no single format to attach to.

## Decision (PROPOSED)

**1. The two formats are NOT competitors — they serve two different roles, and each is canonical on its own axis.** The confusion came from treating them as one thing.

- **Canonical LIVE persisted-state format = the JSON `ProjectSnapshot` (v5).** It is the single source of truth for a project's live state (server version rows + IndexedDB). All `save` / `load` / autosave / version-history operate on it. Its schema is versioned by `SNAPSHOT_SCHEMA_VERSION` and governed by C05 + C47 forward-refuse.
- **Canonical PORTABLE export / archive format = the `.pryzm` envelope.** It is the single source of truth for interchange, sharing, and durable customer archive. A `.pryzm` is a *serialization of the live snapshot (+ assets)* for portability — never a second, parallel live store.

**2. Reconcile the three `.pryzm` definitions to ONE.** The three docs MUST be made to agree. The recommended target is the **`pryzm-binary.md` structure** (ZIP container + a serialized snapshot payload + `chunks/` for binary assets), because it is the most complete definition and the one carrying the byte-equal round-trip test — **but the exact reconciliation MUST be confirmed against what the export code actually writes today** before this ADR is ratified (open task below). C47 §10.2's "binary container format" open question is then CLOSED by this ADR.

**3. Close the test-coverage asymmetry.** The live JSON snapshot path gets a byte-equal (or canonical-checksum) round-trip test too — today only `.pryzm` has one, which is why silent live-snapshot corruption was undetectable until L-334.

## Consequences

- **C05 §2.1, C47 §2.3 + §10.2** are amended to the single `.pryzm` definition and to name the JSON snapshot as the canonical live format. (Per governance: when code and a contract disagree, fix the code OR supersede the contract — here we align the *contracts* to reality + this decision.)
- **C48 (Backup/DR)** attaches its durability guarantees to the JSON snapshot (live) + `.pryzm` (archive) explicitly.
- The live-snapshot round-trip test lands (extends L-334's checksum work).
- No runtime behavior changes from *this ADR alone* — it is a decision + a docs-reconciliation + one new test.

## Open tasks before ratification (CANONICAL)

1. **Code check:** confirm the actual on-disk structure the `.pryzm` exporter writes today (ZIP+project.json per C05, or ZIP+MessagePack-events+chunks per pryzm-binary.md) and pick THAT as the reconciled definition. Do not ratify on the doc alone.
2. Founder/architect sign-off on the two-axis model (live JSON snapshot canonical + `.pryzm` canonical-for-export).
3. Amend C05/C47/pryzm-binary.md in one pass to the single definition; flip this ADR to CANONICAL.

## Alternatives considered

- **One format for both live and export** (e.g. everything is `.pryzm`). Rejected: the live path needs cheap, partial, frequently-written JSON (autosave every 2.5 s, per-version IndexedDB); the export path needs a portable, compressed, self-contained archive. Forcing one format compromises both. The two-axis model keeps each fit-for-purpose while removing the "which is authoritative?" ambiguity.
- **Declare `.pryzm` the single source of truth and derive the live state from it.** Rejected: would require re-architecting the live save/load hot path (autosave, versioning, collaboration) around a ZIP envelope — large, risky, and off the V1 path.

---

_Cross-refs: L-337 · L-334 (integrity/checksum) · C05 · C47 · C48 · pryzm-binary.md_
