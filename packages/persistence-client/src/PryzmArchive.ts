// PryzmArchive — `.pryzm` file exporter / importer.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
// C.4.07 (export-to-`.pryzm`) and C.4.08 (import-from-`.pryzm`).
//
// Phase-C scope: the wire is real (lazy JSZip + manifest.json +
// events.ndjson + optional snapshot.json), but the snapshot side
// requires Phase-D's snapshot/store hydration.  The consumer supplies
// `snapshotProvider` / `snapshotConsumer` callbacks when the
// snapshot pipeline is ready; otherwise only the event log + manifest
// round-trip and Phase D fills in the rest.
//
// File format (.pryzm, ZIP-DEFLATE level 6):
//   manifest.json   { schemaVersion, projectId, projectName, exportedAt,
//                     highestSeq, hasSnapshot }
//   snapshot.json   (optional — present iff snapshotProvider supplied one)
//   events.ndjson   one PersistedEvent per line (JsonCodec form)

import type { EventLog } from './EventLog.js';
import type { PersistedEvent } from './types.js';

export const PRYZM_ARCHIVE_VERSION = 1 as const;

export interface PryzmArchiveManifest {
  readonly schemaVersion: typeof PRYZM_ARCHIVE_VERSION;
  readonly projectId: string;
  readonly projectName: string;
  readonly exportedAt: string;
  readonly highestSeq: number;
  readonly hasSnapshot: boolean;
}

export interface PryzmExporterDeps {
  readonly eventLog: EventLog;
  /** Optional — when provided, a snapshot.json is included in the
   *  archive.  Phase D wires this once `runtime.scene.host.snapshot()`
   *  is available; Phase C consumers may omit. */
  readonly snapshotProvider?: (projectId: string) => Promise<unknown> | unknown;
  /** Resolves a project id → display name for the manifest. */
  readonly resolveProjectName: (projectId: string) => Promise<string> | string;
}

export interface PryzmImporterDeps {
  /** Creates a fresh project on the server and returns its id + final
   *  name (the server may suffix " (copy)" if the name collides). */
  readonly createBlankProject: (name: string) => Promise<{ id: string; name: string }>;
  /** Optional — applies a deserialised snapshot to the freshly-created
   *  project.  Phase D wires this; Phase C consumers may omit. */
  readonly snapshotConsumer?: (projectId: string, snapshot: unknown) => Promise<void> | void;
  /** Returns the EventLog associated with the given project id (the
   *  importer appends the archive's events to it). */
  readonly eventLogFor: (projectId: string) => Promise<EventLog>;
}

// JSZip ships as `export = JSZip` (CommonJS); under our ESM/`esModuleInterop`
// settings the `import('jszip')` namespace exposes the constructor as
// `.default`.  We import the type via `import type` so the typecheck sees
// the constructor type without baking a runtime dependency on the path.
type JSZipCtor = typeof import('jszip');

async function loadJSZip(): Promise<JSZipCtor | null> {
  try {
    const mod = (await import('jszip')) as { default: JSZipCtor } | JSZipCtor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((mod as any).default ?? mod) as JSZipCtor;
  } catch {
    return null;
  }
}

export class PryzmExporter {
  constructor(private readonly deps: PryzmExporterDeps) {}

  async toPryzm(projectId: string): Promise<Blob> {
    const JSZip = await loadJSZip();
    if (JSZip === null) {
      throw new Error('[PryzmExporter] jszip is not installed; cannot export .pryzm.');
    }
    const zip = new JSZip();

    // events.ndjson — one PersistedEvent per line (JSON.stringify form).
    const lines: string[] = [];
    let highestSeq = 0;
    for await (const evt of this.deps.eventLog.replay(0)) {
      lines.push(JSON.stringify(evt));
      if (evt.seq > highestSeq) highestSeq = evt.seq;
    }
    zip.file('events.ndjson', lines.join('\n'));

    // snapshot.json (optional).
    let hasSnapshot = false;
    if (this.deps.snapshotProvider) {
      const snap = await this.deps.snapshotProvider(projectId);
      if (snap !== undefined && snap !== null) {
        zip.file('snapshot.json', JSON.stringify(snap));
        hasSnapshot = true;
      }
    }

    // manifest.json (always last so it can record highestSeq + hasSnapshot).
    const projectName = await this.deps.resolveProjectName(projectId);
    const manifest: PryzmArchiveManifest = {
      schemaVersion: PRYZM_ARCHIVE_VERSION,
      projectId,
      projectName,
      exportedAt: new Date().toISOString(),
      highestSeq,
      hasSnapshot,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    return await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }
}

export class PryzmImporter {
  constructor(private readonly deps: PryzmImporterDeps) {}

  async fromPryzm(file: File | Blob): Promise<{ projectId: string; name: string }> {
    const JSZip = await loadJSZip();
    if (JSZip === null) {
      throw new Error('[PryzmImporter] jszip is not installed; cannot import .pryzm.');
    }
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('[PryzmImporter] missing manifest.json — not a .pryzm archive.');
    }
    const manifest = JSON.parse(await manifestFile.async('string')) as PryzmArchiveManifest;
    if (manifest.schemaVersion !== PRYZM_ARCHIVE_VERSION) {
      throw new Error(
        `[PryzmImporter] unsupported schemaVersion ${manifest.schemaVersion} ` +
        `(expected ${PRYZM_ARCHIVE_VERSION}).`,
      );
    }

    const newProject = await this.deps.createBlankProject(manifest.projectName);

    const snapshotFile = zip.file('snapshot.json');
    if (snapshotFile && this.deps.snapshotConsumer) {
      const snap: unknown = JSON.parse(await snapshotFile.async('string'));
      await this.deps.snapshotConsumer(newProject.id, snap);
    }

    const eventsFile = zip.file('events.ndjson');
    if (eventsFile) {
      const ndjson = await eventsFile.async('string');
      const log = await this.deps.eventLogFor(newProject.id);
      for (const line of ndjson.split('\n')) {
        if (line.length === 0) continue;
        const evt = JSON.parse(line) as PersistedEvent;
        await log.append(evt.event);
      }
    }

    return { projectId: newProject.id, name: newProject.name };
  }
}
