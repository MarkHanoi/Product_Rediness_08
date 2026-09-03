import { AiResponseCacheFetchAdapter, AiPlane, WorkflowRegistry, AiBus, withWorkflowSpan } from './index-m083WJ2t.js';
import { C as CostMeter } from './CfWorkerRelay-DzqGT6yO.js';
import './preload-helper-CJHylW7d.js';
import './trace-api-BIfvUk_c.js';
import './index-CtIMEkHY.js';
import './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';
import './CreatePlumbingFixtureCommand-DUwQtpaf.js';

var define_process_env_default = {};
function resolveSelfHostFromEnv() {
  const env = typeof process !== "undefined" && define_process_env_default || {};
  const flag = String(env.PRYZM_SELFHOST ?? "").toLowerCase();
  const selfHostMode = flag === "1" || flag === "true" || flag === "yes";
  const capRaw = env.PRYZM_SELFHOST_PER_CALL_CAP_USD;
  const cap = capRaw !== void 0 && capRaw !== "" ? Number(capRaw) : NaN;
  if (selfHostMode && Number.isFinite(cap) && cap > 0) {
    return { selfHostMode: true, selfHostPerCallCapUsd: cap };
  }
  return { selfHostMode };
}
const DEFAULT_WORKER_ENDPOINT = "/api/ai-worker";
const DEFAULT_ANTHROPIC_RELAY = "/api/ai/anthropic";
function createAiHost(opts) {
  const workerEndpoint = opts.workerEndpoint ?? DEFAULT_WORKER_ENDPOINT;
  const anthropicRelay = opts.anthropicRelay ?? DEFAULT_ANTHROPIC_RELAY;
  const fetchImpl = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  const approvalQueue = opts.approvalQueue ?? null;
  const resolvedCache = opts.responseCache !== void 0 ? opts.responseCache ?? void 0 : typeof fetchImpl === "function" ? new AiResponseCacheFetchAdapter("/api/ai/cache", fetchImpl) : void 0;
  let plane = null;
  if (approvalQueue) {
    plane = new AiPlane({
      approvalQueue,
      bus: new AiBus({ otelPrefix: "pryzm.ai" }),
      costMeter: new CostMeter(resolveSelfHostFromEnv()),
      workflowRegistry: new WorkflowRegistry(),
      ...resolvedCache ? { responseCache: resolvedCache } : {}
    });
  }
  let seq = 0;
  async function submit(req) {
    return withWorkflowSpan(req.workflow, async () => {
      const requestId = req.clientRequestId ?? `local-${Date.now().toString(36)}-${(++seq).toString(36)}`;
      let workerAck = null;
      if (fetchImpl) {
        try {
          const r = await fetchImpl(workerEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              workflow: req.workflow,
              projectId: req.projectId,
              input: req.input ?? null,
              clientRequestId: requestId
            })
          });
          if (r.ok) {
            workerAck = await r.json().catch(() => ({}));
          }
        } catch {
          workerAck = null;
        }
      }
      const action = {
        id: workerAck?.id ?? `pending-${requestId}`,
        runId: requestId,
        workflow: req.workflow,
        proposedCommands: [],
        estimatedCostUsd: 0,
        createdAt: Date.now(),
        status: "pending"
      };
      approvalQueue?.enqueue(action);
      return action;
    });
  }
  return {
    submit,
    options: { workerEndpoint, anthropicRelay },
    ...plane ? { plane } : {}
  };
}

export { DEFAULT_ANTHROPIC_RELAY, DEFAULT_WORKER_ENDPOINT, createAiHost };
