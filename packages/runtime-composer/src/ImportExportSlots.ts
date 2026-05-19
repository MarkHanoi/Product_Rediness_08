// ImportExportSlots — Phase F (S81 F.12) lazy facades for the four
// import/export plugin singletons exposed on `runtime.ifc/rhino/bcf/pdf`.
//
// Spec: `phases/audits/PRYZM2-WIREUP-PLAN-S72/18-subphases-F6-F12.md`
// §F.12 ("Wrap IFC/Rhino/PDF/BCF plugins as runtime singleton
// facades"; lazy-load the underlying packages so the IFC schemas /
// rhino3dm wasm / BCF zip parser stay off the editor's first-paint
// chunk).
//
// Design rules:
//   • Every method returns a Promise — the underlying plugin is
//     lazy-imported on first call.  No top-level static imports.
//   • `isLoaded()` is a synchronous predicate — drives the
//     `RuntimeStatusPill` chrome.
//   • Soft-fail: if the lazy import resolves but throws inside the
//     plugin, the promise rejects with the original error (callers
//     see real failures, not silent `null`s).
//   • Phase F first cut: PDF slot throws RuntimeNotWiredError because
//     no `plugins/pdf/` package exists yet.  IFC inspector returns
//     the raw plugin module until F.12 wires the inspector panel.

import {
  RuntimeNotWiredError,
  type IfcSlot,
  type IfcImportOptions,
  type IfcImportResult,
  type IfcExportOptions,
  type IfcExportResult,
  type RhinoSlot,
  type BcfSlot,
  type PdfSlot,
} from './types.js';

// ────────────────────────────────────────────────────────────────────────────
//                                  IFC
// ────────────────────────────────────────────────────────────────────────────

export function buildIfcSlot(): IfcSlot {
  let importLoaded = false;
  let exportLoaded = false;
  let inspectorLoaded = false;

  return {
    isLoaded() {
      return importLoaded || exportLoaded || inspectorLoaded;
    },

    import: {
      async start(file, opts?: IfcImportOptions): Promise<IfcImportResult> {
        // Lazy-load the IFC import plugin (~200 KB of IFC schema metadata).
        const mod = await import('@pryzm/plugin-ifc-import').catch(err => {
          console.error('[runtime/ifc] plugin-ifc-import lazy import failed:', err);
          throw err;
        });
        importLoaded = true;

        // Phase F first cut: the plugin's public surface exposes
        // `convertTier2Element` + meta-store helpers.  The end-to-end
        // `import.start(file)` driver lives in the legacy
        // `src/ui/import/IfcImportDialog`; Phase F.12.3 promotes the
        // driver into the plugin itself.  Until then, this wrapper
        // surfaces a `RuntimeNotWiredError` with a precise sub-phase
        // tag so the import dialog falls back to the legacy driver.
        void file; void opts; void mod;
        throw new RuntimeNotWiredError(
          'ifc.import.start',
          'F.12.3 (S81-WIRE)',
        );
      },
    },

    export: {
      async run(opts: IfcExportOptions): Promise<IfcExportResult> {
        const mod = await import('@pryzm/plugin-ifc-export').catch(err => {
          console.error('[runtime/ifc] plugin-ifc-export lazy import failed:', err);
          throw err;
        });
        exportLoaded = true;
        // The exporter takes a `ProjectSnapshot` + a `metaStore`.  The
        // snapshot capture lives in the legacy `IfcExportDialog`; Phase
        // F.12.4 promotes the capture into the plugin.  Until then, we
        // surface the raw `exportProjectToIFC` so the dialog can
        // continue to drive the export.
        void mod; void opts;
        throw new RuntimeNotWiredError(
          'ifc.export.run',
          'F.12.4 (S81-WIRE)',
        );
      },
    },

    async inspector(): Promise<unknown> {
      const mod = await import('@pryzm/plugin-ifc-inspector').catch(err => {
        console.error('[runtime/ifc] plugin-ifc-inspector lazy import failed:', err);
        throw err;
      });
      inspectorLoaded = true;
      return mod;
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//                                 Rhino
// ────────────────────────────────────────────────────────────────────────────

export function buildRhinoSlot(): RhinoSlot {
  let loaded = false;
  return {
    isLoaded() { return loaded; },
    import: {
      async start(file): Promise<{
        readonly objectCount: number;
        readonly layers: readonly { readonly name: string; readonly visible: boolean }[];
      }> {
        const mod = await import('@pryzm/plugin-rhino-import').catch(err => {
          console.error('[runtime/rhino] plugin-rhino-import lazy import failed:', err);
          throw err;
        });
        loaded = true;
        // The plugin exposes `readRhino3dm(buffer)` returning a
        // `RhinoSceneDocument`.  Phase F first cut wires the file →
        // ArrayBuffer → readRhino3dm path; the per-object commit into
        // the L1 stores is Phase F.12.5.
        const buffer =
          file instanceof ArrayBuffer ? file
          : 'arrayBuffer' in file ? await (file as Blob).arrayBuffer()
          : new ArrayBuffer(0);
        const doc = await mod.readRhino3dm(new Uint8Array(buffer));
        return Object.freeze({
          objectCount: doc.objects?.length ?? 0,
          layers: Object.freeze(
            (doc.layers ?? []).map(l => Object.freeze({
              name: l.name,
              visible: l.visible !== false,
            })),
          ),
        });
      },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//                                  BCF
// ────────────────────────────────────────────────────────────────────────────

export function buildBcfSlot(): BcfSlot {
  let loaded = false;
  return {
    isLoaded() { return loaded; },
    async read(file): Promise<unknown> {
      const mod = await import('@pryzm/plugin-bcf').catch(err => {
        console.error('[runtime/bcf] plugin-bcf lazy import failed:', err);
        throw err;
      });
      loaded = true;
      const buffer =
        file instanceof ArrayBuffer ? file
        : 'arrayBuffer' in file ? await (file as Blob).arrayBuffer()
        : new ArrayBuffer(0);
      return mod.readBCF(new Uint8Array(buffer));
    },
    async write(archive): Promise<Uint8Array> {
      const mod = await import('@pryzm/plugin-bcf').catch(err => {
        console.error('[runtime/bcf] plugin-bcf lazy import failed:', err);
        throw err;
      });
      loaded = true;
      // `writeBCF` returns a Uint8Array per the plugin's public API.
      return mod.writeBCF(archive as Parameters<typeof mod.writeBCF>[0]);
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//                                  PDF
// ────────────────────────────────────────────────────────────────────────────

export function buildPdfSlot(): PdfSlot {
  // No `plugins/pdf/` package exists yet — Phase F.12.7 ships it.
  // Every method throws `RuntimeNotWiredError` so accidental call
  // sites are flagged loudly during code review.
  return {
    isLoaded() { return false; },
    importPlan(_file): Promise<unknown> {
      throw new RuntimeNotWiredError('pdf.importPlan', 'F.12.7 (S81-WIRE)');
    },
    exportSheet(_sheetId): Promise<Uint8Array> {
      throw new RuntimeNotWiredError('pdf.exportSheet', 'F.12.7 (S81-WIRE)');
    },
  };
}
