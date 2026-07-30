# Badalona (INE 08015) — Envelope + Heights RISK REGISTER

**Purpose.** Badalona is ROUTED and WIRED but its envelope gate is CLOSED
(`BADALONA_ENVELOPE_VERIFIED = false`) and its heights are ESTIMATED. This register tracks the risks of
that intermediate state so the honest-refusal posture is not accidentally weakened. Mirrors
`../08019-barcelona/RISK-REGISTER.md`.

**Standing principle:** *the only acceptable failure is a refusal — an absent envelope costs nothing;
a confident wrong number on another municipality's land costs credibility.* Every risk is scored
against whether the mitigation FAILS SAFE or fails loud-and-wrong.

## R1 — Flipping the honesty gate without the legal work · **HIGH · OPEN (by design)**
**Risk.** Someone flips `BADALONA_ENVELOPE_VERIFIED` to `true` (or reuses `ES_BARCELONA_ENSANCHE_PACK`
directly) to "make a demo work," stamping Barcelona's height table, FAR and citations onto 08015 land —
a confident mis-citation.
**Mitigation.** The flag is typed `boolean` and documented as a **legal act, not a code change**
(`esBadalona.ts`); the checklist ([`ENVELOPE.md`](./ENVELOPE.md)) requires a signed
`sources/VERIFICATION.md` (L-449). Fails safe **only if the discipline holds** — this register is that
discipline on the record.
**Residual.** No CI gate currently blocks a manual flip. A fidelity CI check (envelope analogue of
`tools/ga-gate/check-zoning-fidelity-label.ts`) that fails the build if a `false`-gated pack emits a
numeric envelope would close this. **Not built.**

## R2 — Router core box under-covers → silent fallback to Barcelona · **MED · MITIGATED**
**Risk.** `BADALONA_BBOX` (2.228–2.268 E / 41.420–41.470 N) is a CONSERVATIVE core; a Badalona parcel
on the municipality's edge falls OUTSIDE it and is swallowed by `isInBarcelona`.
**Mitigation.** Barcelona's own gate is itself honest for its packed claus; and the box is deliberately
tight (east of the Besòs) to avoid the worse error of eating a Barcelona parcel. Fails safe-ish.
**Residual.** An edge parcel could receive a Barcelona clau answer that does not hold in 08015. Widening
the box to the full municipal boundary is the fix — the same boundary needed for the MDS height bbox
([`HEIGHT.md`](./HEIGHT.md) §3). **Not done.**

## R3 — Estimated context heights read as real · **MED · MONITORED**
**Risk.** The 9 m `assumed` carpet (or `levels`×3.2 m) is rendered as a solid prism and could be read
as a real skyline.
**Mitigation.** Provenance is legible (`heightProvenance`, L-459). The standard's §3 CI fidelity gate
(render the `unknown` rung distinctly, never a confident 9 m solid) is the real control — **not built
yet** for any city. Until then, [`HEIGHT.md`](./HEIGHT.md) states the estimated status explicitly.
**Residual.** Open until the heights fidelity gate ships.

## R4 — Refusal misread as a legal "no envelope applies" · **HIGH · MITIGATED**
**Risk.** `badalonaUnverifiedRefusal` uses `code:'no-rule-pack'`; a user could read it as "the ordinance
forbids building here" — a false negative about their land.
**Mitigation.** The copy states explicitly it is a **verification-status** statement, not a legal one,
and that the PGM DOES grant an envelope here (`legallyGrounded:false`, `ordinanceRef:null`,
`BADALONA_ROADMAP_LINE`). Fails safe.
**Residual.** Wording-dependent; if lost in a refactor, re-opens.

## R5 — Data-source availability / staleness · **MED · MONITORED**
**Risk.** MUC / Catastro / MDS availability varies; a cached empty-success could serve absent data as if
queried (failure vs empty are the same value).
**Mitigation.** Probe-before-fix discipline; the pipeline refuses rather than fabricates. **Nothing
08015-specific has been probed yet** — do not treat absence as measured.

---

## Sign-off & review
- **Owner:** UNASSIGNED. **Review cadence:** before any change to `BADALONA_ENVELOPE_VERIFIED`, the
  router box, or the heights ingest for 08015.
- **Cross-refs:** L-449 (source acceptance gate), C58/C60 (provenance + coverage statement), ADR-0271
  (Art. 242.2), `ENVELOPE-REPLICATION-STANDARD.md`, `BUILDING-HEIGHT-REPLICATION-STANDARD.md` (L-646),
  §CONTEXT-DATA-HONESTY. Code: `rulepacks/esBadalona.ts`, `providers/badalonaBbox.ts`.
