# Onboarding Workflow Design — RAC → Auth → Location → GIS → Create → Canvas (2026-06-03)

> Design/brainstorm doc for the first-run + returning-user onboarding sequence.
> Status: PROPOSAL for founder review. No code yet — sequences the pieces that
> already exist (RAC A.5.f · brief-ready A.5.g · bootstrap A.5.g.4 · GIS A.8.a/c ·
> createSiteFromRect A.7.c.x · generateApartmentFromBoundary A.5.g.3).

## §1 — The question

Founder: *"Should the user sign in / log in FIRST, then the chatbot opens, then the full pipeline flows? Brainstorm the best workflow for a first-time user AND a user who already has projects."*

Two instincts collide:
- **RAC-first (current build):** Landing → "Start here" → RAC chatbot (anonymous) → auth → auto-generate. The brief is captured pre-auth and survives sign-up (`getCapturedBrief`). Great lead-gen "hook"; engage before asking to commit.
- **Auth-first (founder's instinct):** Sign in/log in → *then* the chatbot → pipeline. Cleaner identity; project is owned from the first byte; no anonymous→authed migration.

## §2 — The decider: returning users + persistence

Two facts settle it:

1. **Returning users must NEVER be forced through RAC again.** A user who already has projects wants their **hub**, not a 4-question chatbot. You can only branch "returning → hub vs new → onboarding" *after* you know who they are — i.e. **after auth**. RAC-first can't make that decision at the right time (it runs the chatbot before it knows you're a returning user).
2. **Persistence is account-scoped + currently fragile (OI-059).** Anonymous projects don't persist durably; the server project record needs an authenticated owner. Creating the project *after* auth removes the anonymous→authed migration entirely.

**⇒ Verdict: AUTH-FIRST, but keep RAC as the personalization step (just moved to *after* auth), and keep lead-capture (A.5.e) for funnel-top.** The founder's instinct is right for this B2B audience (architects evaluating a pro tool tolerate sign-up friction; the higher-intent lead is worth more than an anonymous one).

## §3 — Recommended workflow: "Auth-aware, RAC-personalized, GIS-anchored"

### §3.0 — Landing (pryzm.so apex)
Two CTAs, both → the app auth surface (per C51 §3.2.2 clean paths):
- **"Start building"** → `app.pryzm.so/signup` (sign-up-leaning)
- **"Log in"** → `app.pryzm.so/sign-in`

Optional funnel-top lead capture: a single pre-auth line *"What are you designing?"* on the landing that POSTs to `/api/leads` (A.5.e) — captures intent even from visitors who bounce at sign-up, WITHOUT running the full RAC anonymously.

### §3.1 — Post-auth branch (the key fork)
After a successful sign-in/sign-up, `PlatformRouter` checks `runtime.persistence.client.list()`:

- **Has ≥1 project (RETURNING)** → **Project Hub** (recent first) + a prominent **"✨ New project"** button. They never see RAC unless they ask for it.
- **Zero projects (FIRST-TIME)** → straight into the **New-project pipeline** (§3.3) — no empty hub to stare at.

### §3.2 — Returning user, "New project"
Abbreviated — we already know who they are:
1. **Typology pick** (apartment / house / office…) — TypologyPicker (A.6).
2. **Location** → **GIS** → **draw boundary** → **create** → **canvas** (§3.3 steps 3-6).
   (Skip the "who/role/team" RAC questions — those are profile-level, asked once.)

### §3.3 — First-time pipeline (the full magic path)
One conversational flow, one question on screen at a time, with a step indicator:

1. **RAC: who + intent** — role · team size · typology · one-line brief. (A.5.f, already built. For first-timers only; persists to the user profile so it's never asked again.)
2. **Location** — *"Where's the project?"* → city/address autocomplete (geocode A.8.a). Sets `site.location`.
3. **GIS opens** — the map flies to the address (A.8.a fly-to). *"Draw your plot boundary."*
4. **Draw boundary** — Cesium polygon draw (A.8.c) → `site.setParcelBoundary`. **This is the wow moment** — their real site.
5. **(Optional) program** — bedroom count / GFA / unit mix, or inferred from the RAC brief. Skippable → sensible defaults.
6. **Create + generate** — project created + **saved under the account immediately** (nothing lost) → `generateApartmentFromBoundary` runs → **land in the PRYZM main canvas** with the apartment in its real site context.

**Typology-agnostic:** steps 2-4 + 6 are identical for house/office/school; only step 1's questions + the generator in step 6 differ (per [[platform-spine-typology-agnostic]]). Keep the seams general.

## §4 — Why this beats both pure options

| Concern | RAC-first | Auth-first (pure) | **Recommended (auth-aware)** |
|---|---|---|---|
| Returning user skips RAC | ✗ (RAC runs first) | ✓ | ✓ (post-auth branch) |
| Project owned/persisted from creation | ✗ (anon→authed) | ✓ | ✓ |
| Personalization (RAC) | ✓ | ✓ (post-auth) | ✓ (post-auth, first-time only) |
| Funnel-top lead capture | ✓ (full RAC) | ✗ | ◑ (lightweight `/api/leads` line) |
| GIS "wow" anchored in flow | weak | weak | ✓ (steps 3-4 are the centerpiece) |

## §5 — Mapping to what exists (the lift is mostly RE-SEQUENCING)

| Step | Exists? | Change needed |
|---|---|---|
| Landing CTAs → auth | ✅ A.17.x.23 (`/signup`,`/sign-in` → `?page=`) | none |
| **Auth-first ordering** | ✗ today RAC runs pre-auth | **PlatformRouter: show auth first; move `showOnboarding` to post-auth (new users)** |
| Post-auth branch (hub vs onboarding) | ◑ `showHub` exists; no project-count branch | **Add `client.list()` check in `showAuth` onSuccess** |
| RAC chatbot | ✅ A.5.f (`showOnboarding`) | run it post-auth; persist answers to profile |
| Location/geocode | ✅ A.8.a (`geocodeAddress` + search box) | surface as an onboarding step (not just inside GIS) |
| GIS draw boundary | ✅ A.8.c (`SiteBoundaryDrawTool` + rail buttons) | auto-open GIS in the flow; guide "draw now" |
| Create project | ✅ A.5.g.4 (`createAndOpenProject`) | reuse; trigger after boundary, not on brief-ready |
| Generate | ✅ A.5.g.3 (`generateApartmentFromBoundary`) | call after boundary commit |
| Land in canvas | ✅ (editor) | none |

**Net:** ~80% is wiring/re-sequencing existing parts. The real new work: (a) the auth-first re-order + project-count branch in `PlatformRouter`; (b) an onboarding **step controller** that drives RAC → location → GIS-draw → create as ONE guided flow (today A.5.g.4 jumps straight to a default rectangle — it needs to PAUSE for the GIS draw step instead).

## §6 — Staged implementation plan

- **O.1 — Auth-first re-order + returning-user branch.** `PlatformRouter`: auth before RAC; post-auth `client.list()` → hub (has projects) vs onboarding (none). [small, high-value]
- **O.2 — Onboarding step controller.** A small state machine: `welcome → rac → location → gis-draw → (program) → create+generate → canvas`, with a step indicator + back/skip. Replaces A.5.g.4's "straight to default rect" with a guided GIS pause. The default rectangle becomes the **"skip — I'll set the site later"** fallback.
- **O.3 — Location as a first-class step** (geocode search surfaced in the flow, not only inside the GIS panel).
- **O.4 — Profile persistence of RAC answers** (role/team asked once, not per project).
- **O.5 — Returning-user "New project" abbreviated flow** (typology → location → GIS → create).
- **O.6 — Funnel-top lead line** on the landing (optional).

## §7 — Open product decisions (my recommended defaults in **bold**)

1. **Auth-first or RAC-first?** → **Auth-first** (§2). [Founder leaning agrees.]
2. **Is the GIS/boundary step mandatory or skippable?** → **Skippable** with a default rectangle fallback (don't block a user who just wants to try; but make "draw your real site" the inviting default). The skip path is exactly today's A.5.g.4 default-rect.
3. **How much RAC for returning users?** → **None per-project** (typology pick only); role/team are profile-level, set once.
4. **Does "Start building" run any pre-auth RAC?** → **No full RAC pre-auth**; at most a one-line lead-capture. Keeps the funnel honest + persistence clean.
5. **Auto-generate on land, or land empty-with-CTA?** → **Auto-generate** the first pass (the "magic moment"), then let them iterate. (Matches the "site → plan in one afternoon" promise.)

## §8 — The one-sentence pitch of the recommended flow

> *Sign in → (returning: your projects | new: "let's build") → tell us about the project → drop your address → draw your plot on the map → watch PRYZM lay out the apartment in your real site → start designing.*
