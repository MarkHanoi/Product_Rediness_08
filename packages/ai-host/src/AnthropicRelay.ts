// @pryzm/ai-host — AnthropicRelay porter (S51 D3 prep).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S51
//     line 359 — `ctx.anthropicRelay(llmRequest)` (the workflow ctx
//     surface for invoking the LLM relay).
//   • SPEC-28 §4 — Cloudflare Worker relay for Anthropic at
//     `https://flat-morning-358d.antoniocanerosan.workers.dev/`.
//
// PORTER pattern — the workflow impl talks to a `RelayPorter`
// interface; the production `CfWorkerRelay` adapter is a thin
// fetch-wrapper loaded via dynamic import gated on the
// `ANTHROPIC_RELAY_URL` env var (deferred to S52 D3 alongside the
// real Vision call for page classification). For S51 the
// `MockAnthropicRelay` ships with deterministic critique JSON so
// `PlanCritique.test.ts` can run the full submit→propose pipeline
// without leaving the test process.
//
// PURE — zero deps on @pryzm/command-bus, @pryzm/stores, THREE,
// DOM, or Node primitives. Bake-worker safe.

/** Single relay request. The plane-side caller is responsible for
 *  building the Anthropic message array — the porter just shuttles
 *  bytes. */
export interface RelayRequest {
  /** Anthropic model id (e.g. `claude-haiku-4-5-20251014`). */
  readonly model: string;
  /** System prompt (architect domain instructions). */
  readonly system: string;
  /** User prompt (the actual snapshot + request). */
  readonly user: string;
  /** Token cap for the response. */
  readonly maxTokens?: number;
  /** Optional stop sequences. */
  readonly stopSequences?: readonly string[];
}

/** Single relay response. The porter MUST surface `costUsd` so the
 *  AiPlane / CostMeter pipeline can record actuals against the
 *  per-project monthly budget per SPEC-28 §6. */
export interface RelayResponse {
  /** Concatenated text from the assistant's message. */
  readonly text: string;
  /** Computed cost in USD for this single round-trip. The CF Worker
   *  derives this from the model + token counts via SPEC-28 §3.2
   *  pricing table; the mock adapter quotes a fixed number. */
  readonly costUsd: number;
  /** Echo of the model id from the request, so the recorder can tag
   *  `pryzm.ai.cost.usd{model=...}` accurately. */
  readonly model: string;
  /** Token usage (prompt + completion). */
  readonly tokens: Readonly<{ input: number; output: number }>;
  /** Optional finish reason from the upstream API. */
  readonly stopReason?: string;
}

/** Porter contract. The plane-side workflow impl receives one of
 *  these via its dependency-injected `relay` arg. */
export interface RelayPorter {
  complete(req: RelayRequest): Promise<RelayResponse>;
}

/** Mock relay used by S51 tests + the local-dev path until the CF
 *  Worker adapter ships at S52. The mock pattern-matches on the
 *  user prompt to return:
 *    • Plan-critique requests → JSON array of fixture critique items.
 *    • Anything else          → empty JSON array.
 *
 *  Cost is deterministic ($0.0042 per call, well under the SPEC-28
 *  $0.18 per-call ceiling and the plan-critique descriptor's $0.05
 *  estimate) so the cost-meter tests can assert exact numbers. */
export class MockAnthropicRelay implements RelayPorter {
  readonly kind = 'mock' as const;

  /** Override the items the mock returns for plan-critique requests.
   *  When unset, returns the built-in 3-item fixture below. */
  fixtureItems: readonly unknown[] | null = null;

  /** Override the options the mock returns for apartment-layout
   *  requests (SPEC-APARTMENT-LAYOUT-GENERATOR §4, A4-register). When
   *  unset, returns the built-in canonical 3-bed fixture below — valid
   *  against the SPEC worked-example program/constraints so the local
   *  in-process path yields `status:'ok'` until the CF relay lands. */
  layoutFixture: readonly unknown[] | null = null;

  async complete(req: RelayRequest): Promise<RelayResponse> {
    const inputTokens = roughTokenCount(req.system) + roughTokenCount(req.user);
    let payload: unknown;
    // Apartment-layout requests are routed by the system prompt (the
    // space-planner persona — see workflows/apartmentLayout/generate.ts
    // LAYOUT_SYSTEM_PROMPT). Checked first so it never collides with the
    // critique heuristic below.
    if (/space planner/i.test(req.system)) {
      payload = this.layoutFixture ?? DEFAULT_LAYOUT_FIXTURE;
    } else if (/critique|review|issue|conflict/i.test(req.user)) {
      payload = this.fixtureItems ?? DEFAULT_CRITIQUE_FIXTURE;
    } else {
      payload = [];
    }
    const text = JSON.stringify(payload);
    const outputTokens = roughTokenCount(text);
    return {
      text,
      costUsd: 0.0042,
      model: req.model,
      tokens: { input: inputTokens, output: outputTokens },
      stopReason: 'end_turn',
    };
  }
}

/** Deterministic 3-item fixture used by the mock relay + by the
 *  PlanCritique tests. Items match the `CritiqueItem` shape from
 *  `workflows/PlanCritiqueTypes.ts`. */
export const DEFAULT_CRITIQUE_FIXTURE: ReadonlyArray<{
  id: string;
  severity: 'info' | 'warning' | 'error';
  category: string;
  message: string;
  locationRef: { kind: 'element'; elementId: string } | { kind: 'point'; x: number; y: number };
  confidence: number;
}> = [
  {
    id: 'crit-1',
    severity: 'warning',
    category: 'door-clearance',
    message: 'Door swing at A-12 conflicts with shelf — clearance is 720 mm, recommended ≥ 850 mm.',
    locationRef: { kind: 'element', elementId: 'door-a12' },
    confidence: 0.86,
  },
  {
    id: 'crit-2',
    severity: 'warning',
    category: 'corridor-width',
    message: 'Corridor width at B-05 is 1100 mm — below the 1200 mm recommended for two-way circulation.',
    locationRef: { kind: 'point', x: 1820, y: 4500 },
    confidence: 0.78,
  },
  {
    id: 'crit-3',
    severity: 'info',
    category: 'visibility',
    message: 'Wall at C-09 is partially hidden by a structural column — consider adjusting visibility flags.',
    locationRef: { kind: 'element', elementId: 'wall-c09' },
    confidence: 0.62,
  },
];

/** Deterministic apartment-layout fixture used by the mock relay +
 *  the A4-register in-process path. Two near-identical 3-bedroom
 *  options (so the modal shows a choice). Shaped to PASS the §8
 *  validator for the SPEC worked-example program — 3 bedrooms (incl.
 *  master), 1 bathroom, master en-suite, open-plan kitchen+dining,
 *  living room, entrance hall — with `minCorridorWidth ≤ 1000 mm`.
 *  The real CF relay (S52 D3) replaces this with arbitrary programs. */
export const DEFAULT_LAYOUT_FIXTURE: readonly unknown[] = (() => {
  const rooms = [
    { name: 'Hall', type: 'hall', area: 5, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Living', 'Corridor'] },
    { name: 'Living', type: 'living', area: 22, windowCount: 2, hasDirectAccess: true, adjacentTo: ['Hall', 'Dining'] },
    { name: 'Dining', type: 'dining', area: 11, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Living', 'Kitchen'] },
    { name: 'Kitchen', type: 'kitchen', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Dining'] },
    { name: 'Corridor', type: 'corridor', area: 4, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Hall', 'Master', 'Bed2', 'Bed3', 'Bath'] },
    { name: 'Master', type: 'master', area: 14, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor', 'Ensuite'] },
    { name: 'Ensuite', type: 'ensuite', area: 4.2, windowCount: 0, hasDirectAccess: false, adjacentTo: ['Master'] },
    { name: 'Bed2', type: 'bedroom', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor'] },
    { name: 'Bed3', type: 'bedroom', area: 9.5, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Corridor'] },
    { name: 'Bath', type: 'bathroom', area: 5, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Corridor'] },
  ];
  const base = {
    corridorWidthMin: 1000,
    walls: [{ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }],
    doors: [{ wallRef: 0, offset: 300, width: 900 }],
    rooms,
  };
  return [
    { ...base, summary: 'Central corridor — bedrooms north, living south.' },
    { ...base, summary: 'Compact hall — open-plan kitchen/dining to the east.' },
  ];
})();

/** Selector mirroring `selectRuntimeKind` / `createStorage` from the
 *  CV namespace. Returns the mock unless `ANTHROPIC_RELAY_URL` is
 *  set (in which case the real CF Worker adapter would be loaded
 *  via `await import('./CfWorkerRelay.js')` — that adapter ships at
 *  S52 D3, until then the selector still falls through to the mock). */
export async function loadRelay(opts: { env?: Record<string, string | undefined> } = {}): Promise<RelayPorter> {
  const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {});
  const url = env.ANTHROPIC_RELAY_URL;
  if (!url) return new MockAnthropicRelay();
  // Real adapter lands at S52 D3; for now fall through.
  // We use the indirect-eval Function trick + a non-literal specifier so
  // that bundlers (Vite/Rollup) cannot statically resolve the import and
  // therefore cannot fail when the file is intentionally absent until
  // the S52 D3 ship.
  try {
    const dynImport = (new Function('s', 'return import(s)') as (s: string) => Promise<unknown>);
    const specifier = './' + 'CfWorkerRelay.js';
    const mod = await dynImport(specifier);
    if (mod && typeof (mod as { createCfWorkerRelay?: unknown }).createCfWorkerRelay === 'function') {
      return (mod as { createCfWorkerRelay: (u: string) => RelayPorter }).createCfWorkerRelay(url);
    }
  } catch {
    // Adapter not yet shipped — fall through to mock.
  }
  return new MockAnthropicRelay();
}

/** Cheap token estimator for mock cost — 4 chars/token average. */
function roughTokenCount(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}
