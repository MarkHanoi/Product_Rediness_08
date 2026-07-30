# ENVELOPE — Sant Boi de Llobregat (INE 08200)

> The per-municipality envelope status, mirroring `ENVELOPE-REPLICATION-STANDARD.md` (ADR-0279) and
> the rulepack's own checklist (`packages/site-parcel-data/src/rulepacks/esSantBoi.ts`).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

---

## Status: ROUTED · gate CLOSED · cited refusal

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Catastro INSPIRE WFS (national) | ✅ shared with Barcelona |
| **S2 — router predicate** | `isInSantBoi` / `SANT_BOI_BBOX` (`providers/santBoiBbox.ts`), tested BEFORE `isInBarcelona`, disjoint from the L'Hospitalet + Badalona boxes | ✅ wired |
| **S3 — zone source** | Generalitat MUC (Catalonia-wide clau) | ✅ shared with Barcelona |
| **S4 — rule pack** | `esSantBoi.ts` — refusal-only while the gate is closed | ✅ present (no numeric pack) |
| **S5 — registration** | registered in `rulepacks/registry.ts` + `index.ts` | ✅ wired |

**The honesty gate.** `SANT_BOI_ENVELOPE_VERIFIED = false`. While it is false,
`applySantBoiZoningThenFallback` dispatches `santBoiUnverifiedRefusal` for **every** parcel:

- `code: 'no-rule-pack'` · `legallyGrounded: false` · `ordinanceRef: null`.
- This is a statement about **PRYZM's verification status, NOT about the law.** It must NEVER read as
  a legal "no envelope applies here" — the PGM-1976 *does* grant an envelope on this buildable AMB
  land; PRYZM has simply not verified it may reuse Barcelona's transcription of it.

**Cited refusal behind the flag — verbatim basis.** The refusal cites `SANT_BOI_PGM_INSTRUMENT_REF`
(PGM-1976, aprovat definitivament 14-07-1976, as consolidated by the Ajuntament de Sant Boi de
Llobregat's own *modificacions puntuals*; clau source = MUC) and carries `SANT_BOI_ROADMAP_LINE` so the
coverage claim and its citation cannot drift (C60 §3).

---

## The human legal work to flip the gate (the rulepack's own checklist)

Flipping `SANT_BOI_ENVELOPE_VERIFIED` to `true` is a **LEGAL ACT, NOT A CODE CHANGE.** Per
`esSantBoi.ts`, it requires, per clau:

1. **Confirm which claus exist and their rule shape** — from the MUC over the 08200 extent + the
   municipal *text refós* (Ajuntament de Sant Boi de Llobregat). Each AMB municipality layers its own
   *modificacions puntuals* on shared PGM article numbers, so the same article can state different
   numbers here than in Barcelona.
2. **Source Sant Boi's own height / street-width tables** — the *alçada reguladora* (PGM Art. 327/328
   family) and *ample oficial*. **Barcelona's do NOT transfer** — they are `es-08019` data.
3. **Author an `es-08200-sant-boi` pack** (or an explicit per-clau equivalence ruling to the
   metropolitan PGM construction) so any reused geometry is cited to Sant Boi, not Barcelona.
4. **Sign `sources/VERIFICATION.md`** (the L-449 gate), mirrored in a C23 AIArtefact `humanApproval` —
   no silent graduation.

**What transfers for free (metropolitan):** the Art. 242.2 buildable-DEPTH construction
(`block-derived-alignment`, ADR-0271) derives depth from the real cadastral block, not a municipal
table, so its **geometry** would apply here once a clau is verified to use it. **What does not:** every
per-municipality *number* (height, FAR, coverage, street width).

⚠ **Do NOT flip the flag to make a demo work.** An absent envelope costs nothing; a confident wrong one
costs credibility.

---

*Cross-refs: `ENVELOPE-REPLICATION-STANDARD.md` (the 5-slot onboarding), `ENVELOPE-IMPLEMENTATION-
PLAN.md` §1 Phase 2, C58 §1.2/§1.5, C60 §3, ADR-0271 (Art. 242.2), L-449 (verification gate),
§CONTEXT-DATA-HONESTY. Code: `rulepacks/esSantBoi.ts`, `providers/santBoiBbox.ts`.*
