# Audit Log Middleware (Phase 3-B Sprint S57)

Unit tests for `server/auditLogMiddleware.js`.

Per `docs/03_PRYZM3/reference/phases/PHASE-3/3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md`
§S57 + ADR-028 Part G + [strategic ADR-021]: every gateway route emits an
`audit_log` row whether or not the action succeeds.

## Run

```bash
cd tests/audit-log-s57 && npx vitest run
```

The tests use a mocked `pg` pool — no live database required.
