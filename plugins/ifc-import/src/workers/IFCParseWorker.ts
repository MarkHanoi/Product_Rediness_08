/**
 * IFC Parse Worker — runs web-ifc parsing off the main thread.
 *
 * CONTRACT (C05 §3): IFC parsing MUST NOT block the main thread.
 * This worker receives an ArrayBuffer of the IFC file and returns
 * a structured ParseResult via postMessage.
 *
 * Wave A17-T2 (2026-05-03).
 */
import * as WebIFC from 'web-ifc';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.ifc-import.worker');

export type IFCParseRequest = {
  type: 'parse';
  buffer: ArrayBuffer;
  options?: { COORDINATE_TO_ORIGIN?: boolean };
};

export type IFCParseResponse =
  | { type: 'progress'; percent: number }
  | { type: 'result'; modelId: number; elementCount: number }
  | { type: 'error'; message: string };

const api = new WebIFC.IfcAPI();
let initialized = false;

self.onmessage = async (event: MessageEvent<IFCParseRequest>) => {
  const { type, buffer, options } = event.data;
  if (type !== 'parse') return;

  const span = tracer.startSpan('pryzm.ifc.parse');

  // IFC-P1.1: Hoist modelId so the finally block can always call CloseModel().
  // Previously modelId was scoped inside the try block, making it unreachable in
  // finally — causing every parse to permanently leak the model's WASM heap
  // (~150-190 MB per 38 MB IFC file). Fix: declare before try, close in finally.
  let modelId: number | undefined;

  try {
    if (!initialized) {
      await api.Init();
      initialized = true;
    }

    self.postMessage({ type: 'progress', percent: 10 } satisfies IFCParseResponse);

    modelId = api.OpenModel(new Uint8Array(buffer), {
      COORDINATE_TO_ORIGIN: options?.COORDINATE_TO_ORIGIN ?? true,
    });

    self.postMessage({ type: 'progress', percent: 50 } satisfies IFCParseResponse);

    const allLines = api.GetAllLines(modelId);
    const elementCount = allLines.size();

    self.postMessage({ type: 'progress', percent: 90 } satisfies IFCParseResponse);
    self.postMessage({ type: 'result', modelId, elementCount } satisfies IFCParseResponse);
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e) } satisfies IFCParseResponse);
  } finally {
    // IFC-P1.1: Always release the WASM model heap — regardless of success or error.
    // CloseModel() frees the memory allocated by OpenModel(); without this call
    // every import permanently leaks. Audit finding: BUG-01.
    if (modelId !== undefined) {
      api.CloseModel(modelId);
    }
    span.end();
  }
};
