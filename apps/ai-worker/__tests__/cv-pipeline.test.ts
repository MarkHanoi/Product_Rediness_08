// @pryzm/ai-worker — CV pipeline e2e smoke (S50 D7).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S50 line 305 ("e2e smoke (PDF in → mask URL out → approval queue
// placeholder)") + §S50 lines 312-318 (exit criteria).
//
// Drives a synthetic PDF page through the full CV handler:
//   • plan-kind page  → classify ok → preCheckBudget ok → segment →
//                       upload mask → recordCall → outcome ok
//   • non-plan page   → classify other / low conf → skipped
//   • budget rejected → preCheckBudget rejects → outcome rejected
//   • storage stores  → mask is round-trippable
//   • cost recorded   → ai_usage row carries the right surface

import { describe, expect, it } from 'vitest';
import {
  classifyPage,
  createCvHandler,
  createCvRegistry,
  InMemoryQueue,
  InMemoryStorage,
  MOCK_RUNTIME,
  PDF_TO_BIM_PER_PAGE_CEILING_USD,
  PLAN_ROUTING_THRESHOLD,
  runSegmentationModel,
  selectRuntimeKind,
} from '../src/index.js';
import type {
  CostMeterLike,
  FloorplanSegJob,
  FloorplanSegOutcome,
  PdfPage,
} from '../src/index.js';
import type { HandlerResult, WorkflowJob } from '../src/types.js';

function makePage(overrides: Partial<PdfPage> = {}): PdfPage {
  return {
    id: 'page-1',
    projectId: 'P-1',
    pageNumber: 1,
    width: 1700,
    height: 2200,
    meta: { title: 'Floor Plan — Level 02', drawingType: 'plan' },
    ...overrides,
  };
}

function makeJob(input: FloorplanSegJob): WorkflowJob {
  return {
    id: `job-${Date.now()}`,
    kind: 'cv',
    projectId: input.projectId,
    input,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
}

function makeFakeMeter(): {
  meter: CostMeterLike;
  recorded: Array<{ workflow: string; projectId: string; costUsd: number; latencyMs: number; extras?: Record<string, unknown> }>;
  preChecks: Array<{ projectId: string; estimatedCostUsd: number }>;
  setRejectReason: (reason: string | null) => void;
} {
  const recorded: Array<{ workflow: string; projectId: string; costUsd: number; latencyMs: number; extras?: Record<string, unknown> }> = [];
  const preChecks: Array<{ projectId: string; estimatedCostUsd: number }> = [];
  let rejectReason: string | null = null;
  const meter: CostMeterLike = {
    async preCheckBudget(projectId, estimatedCostUsd) {
      preChecks.push({ projectId, estimatedCostUsd });
      if (rejectReason) return { ok: false as const, reason: rejectReason };
      return { ok: true as const };
    },
    async recordCall(workflow, projectId, costUsd, latencyMs, extras) {
      const entry: { workflow: string; projectId: string; costUsd: number; latencyMs: number; extras?: Record<string, unknown> } = {
        workflow, projectId, costUsd, latencyMs,
      };
      if (extras) entry.extras = extras;
      recorded.push(entry);
    },
  };
  return {
    meter,
    recorded,
    preChecks,
    setRejectReason: (r) => { rejectReason = r; },
  };
}

describe('@pryzm/ai-worker — CV pipeline (S50)', () => {
  describe('runtime selector', () => {
    it('falls back to cpu when no env hints are present', () => {
      expect(selectRuntimeKind({})).toBe('cpu');
    });
    it('honors explicit gpu override', () => {
      expect(selectRuntimeKind({ PRYZM_AI_CV_RUNTIME: 'gpu' })).toBe('gpu');
    });
    it('auto-detects gpu when CUDA_VISIBLE_DEVICES is set', () => {
      expect(selectRuntimeKind({ CUDA_VISIBLE_DEVICES: '0' })).toBe('gpu');
    });
  });

  describe('classifyPage (mock runtime)', () => {
    it('classifies a "Floor Plan" page as plan with ≥ threshold confidence', async () => {
      const page = makePage({ meta: { title: 'Floor Plan — Level 02' } });
      const c = await classifyPage(page, MOCK_RUNTIME);
      expect(c.kind).toBe('plan');
      expect(c.confidence).toBeGreaterThanOrEqual(PLAN_ROUTING_THRESHOLD);
    });
    it('classifies a "Section A-A" page as section', async () => {
      const page = makePage({ meta: { title: 'Section A-A' } });
      const c = await classifyPage(page, MOCK_RUNTIME);
      expect(c.kind).toBe('section');
    });
    it('falls back to "other" with 0.5 confidence on missing metadata', async () => {
      const page = makePage({ meta: undefined });
      const c = await classifyPage(page, MOCK_RUNTIME);
      expect(c.kind).toBe('other');
      expect(c.confidence).toBe(0.5);
    });
  });

  describe('runSegmentationModel (mock runtime)', () => {
    it('produces a mask whose dimensions match the page', async () => {
      const page = makePage();
      const r = await runSegmentationModel(page, MOCK_RUNTIME);
      expect(r.mask.width).toBe(page.width);
      expect(r.mask.height).toBe(page.height);
      expect(r.mask.data.length).toBe(page.width * page.height);
    });
    it('keeps wall coverage inside the SPEC-45 §8 sanity range (0.05–0.25)', async () => {
      const page = makePage();
      const r = await runSegmentationModel(page, MOCK_RUNTIME);
      expect(r.wallCoverage).toBeGreaterThan(0.05);
      expect(r.wallCoverage).toBeLessThan(0.25);
    });
    it('throws on invalid page dimensions', async () => {
      const page = makePage({ width: 0 });
      await expect(runSegmentationModel(page, MOCK_RUNTIME)).rejects.toThrow(/Invalid page dimensions/);
    });
  });

  describe('end-to-end handler — happy path', () => {
    it('classifies → segments → uploads → records → returns ok', async () => {
      const storage = new InMemoryStorage();
      const fake = makeFakeMeter();
      const outcomes: FloorplanSegOutcome[] = [];
      const handler = createCvHandler({
        runtime: MOCK_RUNTIME,
        storage,
        costMeter: fake.meter,
        onOutcome: (o) => { outcomes.push(o); },
      });

      const page = makePage();
      const job = makeJob({
        projectId: page.projectId,
        pdfPageUrl: 'mem://P-1/source.pdf',
        costBudget: PDF_TO_BIM_PER_PAGE_CEILING_USD,
        page,
      });

      const result: HandlerResult = await handler(job);

      // Outcome path.
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.status).toBe('ok');
      const outcome = outcomes[0]! as Extract<FloorplanSegOutcome, { status: 'ok' }>;
      expect(outcome.classification.kind).toBe('plan');
      expect(outcome.maskUrl).toMatch(/^mem:\/\/P-1\/cv\/masks\//);

      // Storage round-trip.
      const fetched = await storage.fetch(outcome.maskUrl);
      expect(fetched.length).toBe(page.width * page.height);

      // Cost meter saw both halves.
      expect(fake.preChecks).toHaveLength(1);
      expect(fake.preChecks[0]!.estimatedCostUsd).toBe(PDF_TO_BIM_PER_PAGE_CEILING_USD);
      expect(fake.recorded).toHaveLength(1);
      expect(fake.recorded[0]!.workflow).toBe('cv-floorplan-segmentation');
      expect(fake.recorded[0]!.projectId).toBe('P-1');
      expect(fake.recorded[0]!.extras?.runtimeKind).toBe('cpu');
      expect(fake.recorded[0]!.extras?.runtimeMock).toBe(true);

      // Handler result carries one proposal + image preview.
      expect(result.proposedCommands).toHaveLength(1);
      expect(result.proposedCommands[0]!.command).toBe('pdf-to-bim.floorplan-segmentation');
      expect(result.preview?.kind).toBe('image');
    });
  });

  describe('end-to-end handler — skip path', () => {
    it('skips a non-plan page without spending budget', async () => {
      const storage = new InMemoryStorage();
      const fake = makeFakeMeter();
      const outcomes: FloorplanSegOutcome[] = [];
      const handler = createCvHandler({
        runtime: MOCK_RUNTIME,
        storage,
        costMeter: fake.meter,
        onOutcome: (o) => { outcomes.push(o); },
      });

      const page = makePage({ meta: { title: 'North Elevation' } });
      const job = makeJob({
        projectId: page.projectId,
        pdfPageUrl: 'mem://P-1/source.pdf',
        costBudget: PDF_TO_BIM_PER_PAGE_CEILING_USD,
        page,
      });

      const result = await handler(job);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.status).toBe('skipped');
      // No cost recorded for a skipped page.
      expect(fake.preChecks).toHaveLength(0);
      expect(fake.recorded).toHaveLength(0);
      // No mask uploaded.
      expect(storage.size()).toBe(0);
      expect(result.proposedCommands).toHaveLength(0);
    });
  });

  describe('end-to-end handler — budget rejection', () => {
    it('rejects when preCheckBudget says no', async () => {
      const storage = new InMemoryStorage();
      const fake = makeFakeMeter();
      fake.setRejectReason('Per-call ceiling exceeded ($0.05 max)');
      const outcomes: FloorplanSegOutcome[] = [];
      const handler = createCvHandler({
        runtime: MOCK_RUNTIME,
        storage,
        costMeter: fake.meter,
        onOutcome: (o) => { outcomes.push(o); },
      });

      const page = makePage();
      const job = makeJob({
        projectId: page.projectId,
        pdfPageUrl: 'mem://P-1/source.pdf',
        costBudget: PDF_TO_BIM_PER_PAGE_CEILING_USD,
        page,
      });

      const result = await handler(job);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.status).toBe('rejected');
      const rejected = outcomes[0]! as Extract<FloorplanSegOutcome, { status: 'rejected' }>;
      expect(rejected.reason).toMatch(/Per-call ceiling/);
      expect(fake.preChecks).toHaveLength(1);
      // Segmentation never ran.
      expect(fake.recorded).toHaveLength(0);
      expect(storage.size()).toBe(0);
      expect(result.proposedCommands).toHaveLength(0);
    });

    it('rejects when no page payload is supplied', async () => {
      const handler = createCvHandler({
        runtime: MOCK_RUNTIME,
        storage: new InMemoryStorage(),
      });
      const job: WorkflowJob = {
        id: 'job-bad', kind: 'cv', projectId: 'P', input: undefined,
        enqueuedAt: Date.now(), attempts: 0,
      };
      const result = await handler(job);
      expect(result.proposedCommands).toHaveLength(0);
    });
  });

  describe('queue integration', () => {
    it('drains a `cv` job through the in-memory queue', async () => {
      const storage = new InMemoryStorage();
      const registry = createCvRegistry({ storage });
      const completed: Array<{ job: WorkflowJob; result: HandlerResult }> = [];

      const q = new InMemoryQueue({
        registry,
        onComplete: (job, result) => { completed.push({ job, result }); },
      });

      const page = makePage();
      const enqueued = await q.enqueue({
        kind: 'cv',
        projectId: page.projectId,
        input: {
          projectId: page.projectId,
          pdfPageUrl: 'mem://P-1/source.pdf',
          costBudget: PDF_TO_BIM_PER_PAGE_CEILING_USD,
          page,
        } satisfies FloorplanSegJob,
      });
      expect(enqueued.kind).toBe('cv');

      const drained = await q.drain();
      expect(drained).toBe(1);
      expect(completed).toHaveLength(1);
      expect(completed[0]!.result.proposedCommands[0]!.command).toBe(
        'pdf-to-bim.floorplan-segmentation',
      );
      expect(storage.size()).toBe(1);
    });
  });
});
