/**
 * IFCImportHandler — orchestrates off-thread IFC parsing via IFCParseWorker.
 *
 * CONTRACT (C05 §3): The main thread MUST NOT block during IFC file parsing.
 * This handler lazy-creates one Web Worker (kept alive between imports so
 * the WASM module is not re-initialised on every file open) and communicates
 * via transferable ArrayBuffer ownership — zero-copy.
 *
 * Wave A17-T3 (2026-05-03).
 */
import { trace } from '@opentelemetry/api';
import type { IFCParseResponse } from './workers/IFCParseWorker.js';

const tracer = trace.getTracer('pryzm.ifc-import');

/**
 * Result returned by `IFCImportHandler.parseFile()` on success.
 * The `modelId` is the web-ifc internal handle — pass it to subsequent
 * converter calls (e.g. `convertTier2Element`) that need `api.GetLine()`.
 */
export interface IFCParseResult {
  modelId: number;
  elementCount: number;
}

/**
 * Manages the lifecycle of the IFC parse web worker.
 *
 * Usage:
 * ```ts
 * const handler = new IFCImportHandler();
 * const result = await handler.parseFile(file, (pct) => console.log(pct));
 * // handler.dispose() when the plugin unmounts
 * ```
 */
export class IFCImportHandler {
  private _worker: Worker | null = null;

  /**
   * Parse an IFC file off the main thread.
   *
   * The worker is lazy-created on first call and reused for subsequent calls
   * so the WASM binary is only loaded once per session.
   *
   * @param file - The IFC file (STEP text format) to parse.
   * @param onProgress - Optional callback receiving parse progress 0–100.
   * @returns Resolved `IFCParseResult` containing the web-ifc `modelId` and
   *          the number of IFC lines parsed.
   */
  async parseFile(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<IFCParseResult> {
    const span = tracer.startSpan('pryzm.ifc.importFile');
    try {
      if (!this._worker) {
        this._worker = new Worker(
          new URL('./workers/IFCParseWorker.ts', import.meta.url),
          { type: 'module' },
        );
      }

      return await new Promise<IFCParseResult>((resolve, reject) => {
        // Bind handlers SYNCHRONOUSLY before any async work so the mock /
        // real worker can receive messages from the moment onmessage is set.
        this._worker!.onmessage = (ev: MessageEvent<IFCParseResponse>) => {
          if (ev.data.type === 'progress') onProgress?.(ev.data.percent);
          if (ev.data.type === 'result') {
            resolve({ modelId: ev.data.modelId, elementCount: ev.data.elementCount });
          }
          if (ev.data.type === 'error') reject(new Error(ev.data.message));
        };
        this._worker!.onerror = (err) => reject(new Error(`IFC worker error: ${err.message}`));

        // Read the buffer AFTER handlers are bound, then transfer ownership.
        file.arrayBuffer()
          .then((buffer) => {
            this._worker!.postMessage({ type: 'parse', buffer }, [buffer]);
          })
          .catch(reject);
      });
    } finally {
      span.end();
    }
  }

  /**
   * Terminate the worker and release the WASM memory.
   * Call this when the plugin unmounts or the application closes.
   */
  dispose(): void {
    this._worker?.terminate();
    this._worker = null;
  }
}
