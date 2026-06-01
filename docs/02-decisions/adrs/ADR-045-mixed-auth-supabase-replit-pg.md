# ADR-045 — Mixed-Auth Architecture: Supabase Service-Role for Identity + Replit PG for Project Storage

| Field | Value |
|---|---|
| **Status** | **Accepted** — 2026-05-03 |
| **Owner** | Platform / server-infrastructure |
| **Supersedes** | C08 §1.1 (original text stated "no dependency on Supabase Auth" — corrected by this ADR) |
| **Implemented in** | `server/supabaseClient.js`, `server/pgClient.js`, `server/dbMigrate.js`, `server/supabaseMigrate.js` |
| **Contracts amended** | `C05-PERSISTENCE-AND-FILE-FORMAT §1.3, §1.3.1` · `C08-COLLABORATION-AND-SECURITY §1.1` |

---

## Context

PRYZM 3 runs on Replit, where:

1. **Replit provides a local PostgreSQL instance** (`DATABASE_URL`) that is always available inside the sandbox and is the only practical target for direct `pg` connections (port 5432 on external hosts is blocked by Replit's network).
2. **Supabase provides an always-on REST API** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) reachable over HTTPS from the Replit sandbox. This is used for user-identity management — creating, reading, and verifying the owner account.
3. **Supabase's direct PostgreSQL endpoint** (`SUPABASE_DB_URL` → `db.<project>.supabase.co:5432`) is **unreachable** from Replit due to network restrictions.

The original C08 §1.1 text stated: _"There is no dependency on Supabase Auth, Firebase Auth, NextAuth, or any external auth provider."_ This was accurate in spirit (PRYZM does NOT use Supabase's JWT-issuance/session service — it issues its own JWTs via `SESSION_SECRET`), but it was inaccurate in fact: the `pryzm_users` table and the owner account seeding are managed via Supabase service-role REST, not via Replit PG alone. This mismatch caused a P1 FK-violation incident (2026-05-03) when `projects.owner_id REFERENCES pryzm_users(id)` failed because Replit PG's `pryzm_users` table was empty.

---

## Decision

**The deployment has a split-backend architecture:**

| Concern | Backend | Client | Notes |
|---|---|---|---|
| User identity / `pryzm_users` rows | **Supabase** (REST API, service-role key) | `server/supabaseClient.js` | HTTPS only; never port 5432 |
| JWT issuance + verification | **Server** (HMAC-SHA256, `SESSION_SECRET`) | `server/authStore.js` | No dependency on Supabase JWT service |
| Project CRUD, versions, members | **Replit PG** (`DATABASE_URL`) | `server/pgClient.js` | `pg` pool; always reachable |
| Schema migration (both) | `server/dbMigrate.js` | — | Path 1 = Supabase REST + Replit PG |

**Key invariants that follow from this decision (normative — both contracts and this ADR govern):**

1. `DATABASE_URL` MUST be checked before `SUPABASE_DB_URL` in `pgClient.js` (C05 §1.3). Rationale: `SUPABASE_DB_URL` is unreachable on Replit.
2. `projects.owner_id` MUST NOT carry a FK constraint referencing `pryzm_users(id)` in Replit PG (C05 §1.3.1). Rationale: `pryzm_users` in Replit PG is empty — users live in Supabase; a FK here causes a `23503` violation on every project create.
3. The `server/supabaseMigrate.js` `ensureOwnerAccountInSupabase()` function seeds the owner user in Supabase only. It MUST NOT attempt to seed Replit PG's `pryzm_users` with a live connection string pointing at `db.*.supabase.co:5432`.
4. All server routes that verify user identity MUST read from Supabase (`getSupabaseClient()`) — never from Replit PG's `pryzm_users`.

---

## Consequences

**Positive:**
- Project CRUD is fast (local Replit PG, no cross-region RTT).
- User identity is durable and shareable across deployments (Supabase).
- Server issues its own JWTs — no dependency on Supabase Auth's session service; tokens work if Supabase is in read-only mode.

**Negative / risks to manage:**
- `pryzm_users` in Replit PG is a shadow table that is deliberately empty in production. Code that joins `projects` to `pryzm_users` on Replit PG will return empty results. Server-side joins across the two backends require two separate queries (one to Supabase, one to Replit PG).
- On a future external-server deployment where Supabase direct PG is reachable, this split disappears — both users and projects can live in one PG instance. That migration MUST be handled with an explicit data-export and a new ADR; do not silently flip `pgClient.js` back to `SUPABASE_DB_URL` priority.

---

## Superseded text in C08 §1.1

Original: _"There is no dependency on Supabase Auth, Firebase Auth, NextAuth, or any external auth provider."_

Corrected: PRYZM does NOT use Supabase Auth's JWT issuance service. It issues its own tokens via `SESSION_SECRET`. However, user-identity records (`pryzm_users`) ARE stored in and read from Supabase via the service-role REST API. See §1.1 (amended) and this ADR for the full split.
