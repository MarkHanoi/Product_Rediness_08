# §7 VERIFICATION — session gate reconciliation (draft, updated as waves land)

## The one comparison that matters
| | passing | failing | total |
|---|---|---|---|
| Audit baseline (gate-snapshot.json, morning) | 61 | 38 | 99 |
| After C + L waves (L-lane run ~18:45, ga-gate-run.txt) | 63 | 37 | 100 |
| After 7 Wave A + input-host (full run-all, ~21:50) | **64** | **36** | 100 |

**Attribution, both directions:**
- **+1 flip red→green: check-verb-register** (rc1→rc0) — sheet.create shadow removed,
  §LIVE-VIA-ADOPTION route, §L-1087 exit paid, register regenerated (commit ef5d095e).
- **+1 new gate, green: check-fidelity-axis** (the eighth fact; registered 2350fd5d).
- **The 37 still failing are the baseline's 38 minus verb-register — SET-IDENTICAL.
  ZERO new reds from this session's ~10 commits.** The four run-all classes as
  "regression" (tool-activator-coverage, sync-disposition,
  dependent-adapts-on-host-move, shear-survives-transport) were rc1 in the MORNING
  baseline too — the class is vs run-all's ledger, not vs today.
- Six gates that read initTools.ts all PASS with §AXIS-L-W1 in place.

## Pre-existing debt surfaced (provenance named, not buried)
- **check-per-package-compile rc1**: command-registry per-package tsc RC=2 — errors
  span ai-host/input-host/file-format/core-app-model (window-global typing,
  unnarrowed unions, .ts-extension imports). Traced to ≥ commit 3831c165
  (2026-08-25) — SIX DAYS pre-session. Root tsc (the deploy gate) is RC=0.
- **check-layer-boundaries rc3**: banned-3p 124/113 — Axis 7 Wave A in flight
  (OBC seam). Expected to flip this arm; upward-import/SDK-bypass arms remain.
- The remaining ~21 ratchet-exceeded + 9 newly-measured + rac-conformance
  certification block: long-standing, each measured in the audit, none moved today
  in either direction.

## Still owed before deploy
- [x] Wave A verified + committed (1234ca9b) + input-host (83979ad3): banned-3p 124 -> 86/113, check-layer-boundaries RC=0 — the SECOND red->green flip of the session
- [x] Full run-all re-read at 83979ad3: 64 passing / 36 failing / 1 declared debt / 22 ratchet exceeded / 4 regression-class (all four red in the MORNING baseline too) / 0 misconfigured. The 36 are the morning 38 minus verb-register minus layer-boundaries. ZERO new reds all session.
- [ ] Deploy per DEPLOY-CONTRACT-MANUAL-FLY.md (push already done for C + L)
