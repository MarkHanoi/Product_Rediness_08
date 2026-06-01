# PRYZM 2 — Beta launch demo script (3 min)

> Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S48 D7 (lines 720–722).
> Status: SCRIPT RATIFIED — recording session deferred to S48 D8 (human action; bound in ADR-0038 §3).
> Goal: a ≤ 3-minute demo that shows the multi-user collab loop + the AI approval queue + the schedule export, in that order. Walk-up viewers must understand "what is PRYZM 2" within the first 30 seconds.

## Audience

* Architects + small-studio principals (cohorts C1 + C2 — 18 of the 25 invited beta seats per spec lines 703–705).
* Watching on a laptop in a browser; no install.

## Voice & tone

* Calm, declarative, no jargon. Never say "BIM platform" without a noun next to it ("BIM platform with multi-user real-time collab").
* Cite the seat count once: "25 invited practitioners are using this with us today."

## Shot list (180 seconds total)

| t | Visual | Voice-over | Internal note |
| --- | --- | --- | --- |
| 00:00–00:10 | Editor cold-loads on a small floor plan. | "PRYZM 2 is a multi-user BIM editor that opens in your browser." | Use the "studio-loft.pryzm" sample at apps/editor/samples/. |
| 00:10–00:30 | Two cursors appear; second user joins via shared link. | "Collaboration is real-time. No save-and-reload. Two architects can edit one model from anywhere." | The second cursor is the awareness presence — show name + colour bubble. |
| 00:30–00:55 | First user grabs a wall; lock badge appears for second user. | "Soft locks per element. You see who has what — no surprises." | Pulled from S45 ratification; LockBadgeRenderer. |
| 00:55–01:30 | First user toggles to a section view; second user follows in plan view. | "Multiple views. Section, plan, sheet, schedule — the same data, the same edit lock." | Visibility waves W01–W05 from S46. |
| 01:30–02:10 | First user opens AI floorplan workflow → approval queue panel renders pending action. | "AI suggests; you approve. Every workflow shows the cost and a preview before it touches your model." | The ApprovalQueuePanel sidebar from S48 D5. Click Approve. |
| 02:10–02:35 | Schedule view updates live; first user exports schedule to CSV. | "Schedules update live as the model changes. Export to CSV when you're done." | Sequenced from S38 schedule export pipeline. |
| 02:35–02:55 | Quick cut to the beta sign-up page. | "We're inviting 25 practitioners to the private beta. Sign up at pryzm.com/beta." | public/beta.html. |
| 02:55–03:00 | Logo card. | "PRYZM 2. Build with us." | — |

## Required props

* Two browser windows side-by-side (use OBS scene `dual-browser`).
* Pre-loaded sample project `studio-loft.pryzm` (ships in apps/editor/samples — verify present at S48 D8).
* AI host stub returning a deterministic floorplan suggestion (see `packages/ai-host/__tests__/fixtures/draftFloorplan.json`).

## Recording checklist (S48 D8 binding)

- [ ] OBS scenes prepared (dual-browser, single-fullscreen, logo-card).
- [ ] Browser zoom 110% for cursor visibility.
- [ ] Mic levels checked; room tone recorded for cleanup.
- [ ] Both browser sessions signed in as `demo@pryzm.com` and `arch2@pryzm.com`.
- [ ] AI host fixture wired (no real model calls during recording).
- [ ] Final cut ≤ 3:00; subtitles (.srt) generated.

## Bound to S48 D9 launch

* Final 3-minute cut hosted at the URL named in `beta-announcement.md` §3.
* Falls back to a static screenshot strip if recording slips — does NOT block the launch announcement.
