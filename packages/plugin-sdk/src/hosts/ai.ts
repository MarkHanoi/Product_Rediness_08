// @pryzm/plugin-sdk — AI proxy contract (S62 D3).
//
// AI workflows are first-class registered units (per packages/ai-host/).
// A plugin invokes one by name; the host validates the workflow exists,
// budget per ADR-014 / SPEC-28 §9, and dispatches.
//
// Permission gating is intentionally NOT a separate `ai:invoke` (the
// plugin permission set is locked at 7 per ADR-0038).  Instead, AI
// invocation is gated by `write:project` because every AI workflow
// either reads project state, mutates it, or does both.  The OAuth2
// `ai:invoke` scope (in api-spec/openapi.yaml) is a public-API concept,
// not a plugin permission — the two namespaces are unrelated.

/** A registered workflow's reference shape. */
export interface AiWorkflowRef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: { readonly $ref: string };  // JSON Schema $ref
}

/** The discriminated outcome of an AI workflow run. */
export type AiWorkflowResult =
  | {
      ok: true;
      workflow: string;
      runId: string;
      output: unknown;
      costUsd: number;
      latencyMs: number;
    }
  | {
      ok: false;
      workflow: string;
      runId: string;
      error: { code: string; message: string };
    };

/**
 * Permission-gated AI workflow invocation.
 * Permission: `write:project` required for `runWorkflow`.
 *             `read:project` required for `listWorkflows`.
 */
export interface AiProxy {
  /** List workflows the host knows about (filtered by plugin scope). */
  listWorkflows(): Promise<readonly AiWorkflowRef[]>;

  /**
   * Run a workflow by name.  Input is validated against the workflow's
   * declared input schema before dispatch.  Cost is charged to the
   * project owner per SPEC-28 §9.
   */
  runWorkflow(name: string, input: unknown): Promise<AiWorkflowResult>;
}
