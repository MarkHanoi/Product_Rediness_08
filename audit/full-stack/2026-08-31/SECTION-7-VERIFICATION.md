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

## CLOSE-OUT (2026-09-01, post-7B2)
| Gate arm | Morning baseline | Final |
|---|---|---|
| check-layer-boundaries upward | 102/102 (zero headroom) | **48/102** (7B2 inversion, −54) |
| check-layer-boundaries banned-3p | 124/113 **RED** | **86/113 GREEN** (OBC seam) |
| check-layer-boundaries sdk-bypass | 171/182 | **156/182** |
| check-verb-register | RC=1 (1 SHADOWED) | **RC=0** (0 SHADOWED) |
| check-fidelity-axis | did not exist | **RC=0, registered** |

B/C/L/7 in-repo campaign COMPLETE at `62efae06`. Deployed via the manual Fly
contract (Actions billing-blocked; run log `/tmp/fly-deploy-62efae06.log`;
rollback tag `deployment-01M19WWXFSY0R8508FCYYKVG4H` = v1410 captured per §5.3).
Known successors, each owned: check-contract-cited-paths 507/490 (pre-existing,
7B2 improved it by 2 — needs an owner); the C11 §10.3 bridge-migration program;
the per-package strictness swamp (Aug 25 provenance); L-12868/12869 rulings.
