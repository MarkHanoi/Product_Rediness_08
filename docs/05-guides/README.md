# 05-guides — WHO

> Audience-specific guides. How-to articles. Onboarding paths.

## §1 — What lives here

Documents organised by **who's reading them**, not by what topic they cover.

| Folder | Audience |
|---|---|
| [user/](./user/) | End users — architects + designers using PRYZM to draw buildings |
| [developer/](./developer/) | Internal engineers — onboarding, command authoring, plugin development |
| [enterprise/](./enterprise/) | IT admins + ops — self-host, status pages, on-call |
| [mobile/](./mobile/) | Mobile-specific guides (UX + B2B specialisations) |

## §2 — Folder index

### [user/](./user/) — end users

| File | What |
|---|---|
| `apartment-layout.md` | How to use the AI apartment generator (the headline workflow) |

### [developer/](./developer/) — internal engineers

| Folder/file | What |
|---|---|
| `process/` | Beta-triage process · launch dry-run checklist |
| `demos/` | M9-1C-headless script · M12-alpha demo script · README |

### [enterprise/](./enterprise/) — IT admins + ops

| Folder/file | What |
|---|---|
| `operations/status-page-and-on-call.md` | Status page setup + on-call runbook |

### [mobile/](./mobile/) — mobile platform

| File/folder | What |
|---|---|
| `contract.md` | Mobile contract — what the mobile build commits to |
| `responsiveness-plan.md` | Mobile responsiveness plan |
| `UX/` | UX-specific mobile patterns |
| `X_B2B/` | B2B mobile specialisations |

## §3 — Where end-user docs really live

This folder is for **internal** how-to. The **end-user product docs** (architect-facing tutorials, video walkthroughs, marketplace help) live in:

- [apps/docs-site/](../../apps/docs-site/) — Astro Starlight site, public
- [apps/marketplace-web/](../../apps/marketplace-web/) — marketplace browse + family detail pages

Both are PUBLIC. Don't write public-facing copy here unless it's onboarding material that gets pulled into `apps/docs-site/`.

## §4 — Authoring conventions

### Filename

- Kebab-case lowercase: `apartment-layout.md`, `command-authoring.md`
- One topic per file.
- For longer pieces, split into a folder: `topic/01-intro.md` + `topic/02-deep-dive.md`.

### Content shape

- Lead with a one-paragraph TL;DR.
- Show concrete steps + examples.
- End with cross-references to contracts / specs / code paths.
- Date-stamp **only** if the guide is version-specific. Most guides should be evergreen.

### What does NOT belong

- **Reference material** (exact tables, glossaries) → [../04-reference/](../04-reference/)
- **Strategic vision** → [../01-strategy/](../01-strategy/)
- **Binding rules** → [../02-decisions/contracts/](../02-decisions/contracts/)
- **Implementation plans** → [../03-execution/plans/](../03-execution/plans/)

## §5 — Documentation gaps (next-phase work)

The guides folder is currently **minimal** (4 sub-folders, ~10 files). For an enterprise-grade documentation suite we need:

### user/ (gaps)
- Getting started: install + first project
- Drawing walls + doors + windows (basics)
- Importing IFC files
- Exporting to IFC / PDF
- Apartment generation (✅ apartment-layout.md exists)
- Family creation walk-through
- Collaboration (multiplayer + BCF)
- Plugin marketplace browse + install

### developer/ (gaps)
- "Add a new command" cookbook (citing C16)
- "Add a new element type" cookbook (citing C11 + C15)
- "Write a new contract or ADR" walkthrough
- Debugging the rendering pipeline
- Running benchmarks (the 17 NFTs)
- Local self-host bring-up

### enterprise/ (gaps)
- Self-host install (covered in [pryzm-selfhost/](../../pryzm-selfhost/) but needs an /enterprise/ pointer)
- BYOK setup
- SSO (Google / Microsoft / SAML)
- Quotas + plan tiers
- Backup + DR

These gaps are tracked in [DOCUMENTATION-GAPS-AND-NEXT-PHASES.md](../DOCUMENTATION-GAPS-AND-NEXT-PHASES.md).
