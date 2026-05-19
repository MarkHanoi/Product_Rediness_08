# ADR-050 — AI Response Cache by Content Hash

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-05-08 |
| Closes | Phase J.5 (45-CW-SLAB-BATCH-IMPLEMENTATION-PLAN.md) |
| Required by | 1M-element milestone (quarterly) |
| Owner | AI pipeline lead |
| Constraint reference | C09 §4.1 (AI pipeline contract), C10 NFT-14 (AI e2e <8s), C05 §1.2 (persistence) |

---

## Context

The PRYZM AI pipeline (`packages/ai-host/`) processes PDF floor plan pages and returns structured BIM specifications (curtain wall layouts, slab profiles, room programs). Each processing request hits the LLM at full cost:

- **Latency**: LLM calls add 3–7s to the AI pipeline e2e time. NFT-14 mandates ≤8s total. Repeated identical imports consume most of that budget.
- **Cost**: at enterprise scale, users re-import the same PDF repeatedly (revision navigation, undo/redo of import decisions, team members importing the same project independently). Each re-import triggers the same LLM call at full token cost.
- **Quota blocking**: AI quota enforcement currently gates the LLM call and the batch as a unit. If quota is exhausted mid-import, the user loses progress. Decoupling the LLM gate from the batch allows quota to gate LLM only — the batch can always re-use a cached response.

### Current state

```typescript
// packages/ai-host/src/AIPipelineHost.ts (simplified)
async processPage(pdfPage: PDFPage, quota: QuotaToken): Promise<BIMSpec> {
    const prompt = buildPrompt(pdfPage);
    const response = await llmClient.complete(prompt);    // ← always hits LLM
    return parseBIMSpec(response);
}
```

Every `processPage()` call incurs full LLM latency regardless of whether the identical page was processed before.

### Content hash definition

A **content hash** uniquely identifies a PDF page by its rendered content, independent of metadata (filename, date, author). Two pages are considered identical if and only if their rendered pixel buffer hashes match:

```typescript
const contentHash = sha256(renderPDFPageToPixelBuffer(pdfPage, resolution: 150dpi));
```

150dpi is sufficient to capture all BIM-relevant geometry while remaining fast to render. The hash is a `hex(sha256)` 64-character string.

### Options evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | PostgreSQL cache: `(content_hash, model_version) → BIMSpec JSON`; 7-day TTL; keyed by SHA-256 of page pixel buffer | Shared across all users; durable across server restarts; quotable | DB dependency for AI path; cache pollution if model changes |
| **B** | In-process memory cache: `Map<contentHash, BIMSpec>` in `ai-host` process | Zero latency; simple | Not shared across server restarts; not shared across instances |
| **C** | Client-side IndexedDB cache: cached in browser per user | No server cost; works offline | Not shared across team members; cleared by browser policies |
| **D** | No cache | Zero complexity | Full LLM cost on every import |

---

## Decision

**Option A — PostgreSQL content-hash cache** with `model_version` cache key component and 7-day TTL:

**Schema**:

```sql
CREATE TABLE ai_response_cache (
    content_hash   TEXT        NOT NULL,
    model_version  TEXT        NOT NULL,   -- e.g. 'claude-3-5-sonnet-20241022'
    response_json  JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
    hit_count      INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (content_hash, model_version)
);
CREATE INDEX ai_response_cache_expires ON ai_response_cache (expires_at);
```

**Cache lookup flow**:

```typescript
// AIPipelineHost.processPage() — modified
async processPage(pdfPage: PDFPage, quota: QuotaToken): Promise<BIMSpec> {
    const contentHash = await sha256PagePixelBuffer(pdfPage);
    const modelVersion = this._llmClient.modelVersion;
    
    // 1. Check cache (does not consume quota)
    const cached = await db.query<{ response_json: BIMSpec }>(
        'SELECT response_json FROM ai_response_cache WHERE content_hash=$1 AND model_version=$2 AND expires_at > now()',
        [contentHash, modelVersion]
    );
    if (cached.rows[0]) {
        await db.query('UPDATE ai_response_cache SET hit_count = hit_count + 1 WHERE content_hash=$1 AND model_version=$2', [contentHash, modelVersion]);
        return cached.rows[0].response_json;   // ← cache hit: 0 LLM tokens consumed
    }
    
    // 2. Cache miss: consume quota, call LLM
    quota.consume(estimateTokens(pdfPage));
    const response = await this._llmClient.complete(buildPrompt(pdfPage));
    const bimSpec = parseBIMSpec(response);
    
    // 3. Write to cache
    await db.query(
        'INSERT INTO ai_response_cache (content_hash, model_version, response_json) VALUES ($1, $2, $3) ON CONFLICT DO UPDATE SET response_json=$3, expires_at=now()+INTERVAL\'7 days\'',
        [contentHash, modelVersion, bimSpec]
    );
    return bimSpec;
}
```

**TTL**: 7 days. After 7 days, the cached response expires — the next request re-hits the LLM (model may have improved; PDF content may be revised). The TTL is configurable via `AI_RESPONSE_CACHE_TTL_DAYS` environment variable.

**Model version keying**: the `model_version` key component ensures that when the LLM model is upgraded (e.g., `claude-3-5-sonnet` → `claude-3-7-sonnet`), old cache entries are not returned for the new model — the new model may produce better BIM specs.

**Quota gate**: quota is gated at the LLM call only (step 2). Cache hits do not consume quota. This allows quota-exhausted users to still benefit from cached responses.

---

## Consequences

### Positive

- **Latency**: cache hit = 0 LLM tokens + ~2ms DB query (vs 3–7s LLM call). NFT-14 target (≤8s e2e) met even for quota-limited users.
- **Cost**: enterprise teams re-importing the same PDF (common in design iteration) consume 0 LLM tokens after the first import.
- **Offline resilience**: `C05 §1.2` IndexedDB persistence can store a local copy of recent `BIMSpec` responses as a secondary cache layer for offline use. Deferred to a follow-up ADR.
- **Shared cache**: all team members within the same PRYZM tenant share the cache. A PDF imported by user A is immediately available to user B at zero LLM cost.

### Negative / constraints

- **DB migration required**: `ai_response_cache` table must be created before deployment. Added to `server/dbMigrate.js`.
- **Storage cost**: `response_json` for a 17-slab floor plan is ~80KB. At 10,000 unique PDFs: `~800MB` PostgreSQL storage — acceptable.
- **Cache poisoning**: if `parseBIMSpec()` produces a malformed `BIMSpec` and it is cached, all future requests for the same page return the malformed spec. Mitigation: validate `BIMSpec` schema with Zod before caching. Reject and do not cache if validation fails.
- **C09 §4.1 compliance**: the AI pipeline contract mandates OTel spans for all LLM calls. Cache hits must also emit an OTel span (`ai.cache.hit`) so the dashboard reflects actual vs cached LLM usage.
- **Privacy**: `response_json` contains extracted BIM data derived from the user's PDF. The cache is tenant-scoped (keyed by `content_hash` — the same across tenants if PDFs are identical). Cross-tenant cache sharing is **explicitly disabled** — `content_hash` is prefixed with `tenantId` in the primary key. A future ADR may enable opt-in cross-tenant cache sharing for public domain floor plans.

---

## Implementation gate

ADR-050 is **Proposed**. Before implementation begins:

1. Add `ai_response_cache` table migration to `server/dbMigrate.js`.
2. Implement `sha256PagePixelBuffer()` using `pdfjs-dist` + `crypto.subtle.digest('SHA-256', ...)`.
3. Prototype cache lookup in `AIPipelineHost.processPage()`.
4. Verify cache hit returns byte-identical `BIMSpec` to original LLM response (JSON determinism check).
5. Verify `hit_count` increments correctly; verify TTL expiry clears stale entries.
6. Update to **Accepted** and merge prototype.

---

## References

- doc 48 §5.3, §5.5 (AI quota and cost analysis)
- `packages/ai-host/src/AIPipelineHost.ts` (implementation target)
- `server/dbMigrate.js` (migration target)
- C09 §4.1 (AI pipeline contract — OTel spans required)
- C10 NFT-14 (AI e2e ≤8s)
- C05 §1.2 (IndexedDB persistence — secondary cache layer, future ADR)
