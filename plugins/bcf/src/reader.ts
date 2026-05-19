/**
 * BCF 3.0 reader.
 *
 * Phase 3-B Sprint S59 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5
 * and PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S59 BCF round-trip).
 *
 * Reads a `.bcf` ZIP archive (or `.bcfzip`) and returns a normalised
 * `BCFArchive` with multiple viewpoints per topic, components selection /
 * visibility / coloring, related-topic cross-references, and the BCF 3.0
 * AssignedTo / DueDate / Stage fields.
 *
 * Backward-compat: archives produced by S57 (legacy `viewpoint.bcfv` /
 * `snapshot.png` filenames inside a topic folder) and the buildingSMART
 * reference fixtures are still accepted — the reader resolves a viewpoint
 * file by looking up the path the markup actually references.
 */

import { unzipSync, strFromU8 } from 'fflate';
import { PARSER, asArray } from './xml.js';
import { withSpan } from './otel.js';
import type {
  BCFArchive,
  BCFColoringGroup,
  BCFComment,
  BCFComponent,
  BCFComponents,
  BCFProject,
  BCFTopic,
  BCFViewpoint,
  BCFViewpointPosition,
} from './types.js';

interface ProjectXml {
  ProjectExtension?: { Project?: { '@_ProjectId'?: string; Name?: string }; ExtensionSchema?: string };
  Project?: { '@_ProjectId'?: string; Name?: string };
}

interface MarkupXml {
  Markup?: {
    Topic?: Record<string, unknown>;
    Comment?: unknown | unknown[];
    Viewpoints?: { ViewPoint?: unknown | unknown[] };
  };
}

interface ViewpointXml {
  VisualizationInfo?: {
    PerspectiveCamera?: {
      CameraViewPoint?: { X?: string; Y?: string; Z?: string };
      CameraDirection?: { X?: string; Y?: string; Z?: string };
      CameraUpVector?: { X?: string; Y?: string; Z?: string };
      FieldOfView?: string;
    };
    OrthogonalCamera?: {
      CameraViewPoint?: { X?: string; Y?: string; Z?: string };
      CameraDirection?: { X?: string; Y?: string; Z?: string };
      CameraUpVector?: { X?: string; Y?: string; Z?: string };
      ViewToWorldScale?: string;
    };
    Components?: Record<string, unknown>;
  };
}

function n(v: unknown): number {
  const out = Number(String(v ?? '0'));
  return Number.isFinite(out) ? out : 0;
}

interface VersionXml {
  Version?: { '@_VersionId'?: string };
}

function parseProject(files: Record<string, Uint8Array>): BCFProject {
  let version = '3.0';
  if (files['bcf.version']) {
    const versionXml = PARSER.parse(strFromU8(files['bcf.version'])) as VersionXml;
    if (versionXml.Version?.['@_VersionId']) {
      version = String(versionXml.Version['@_VersionId']);
    }
  }
  const projectFile = files['project.bcfp'];
  let projectId = 'default';
  let name = 'Untitled';
  let extensionSchema: string | undefined;
  if (projectFile) {
    const xml = PARSER.parse(strFromU8(projectFile)) as ProjectXml;
    const ext = xml.ProjectExtension;
    const proj = ext?.Project ?? xml.Project;
    if (proj) {
      projectId = String(proj['@_ProjectId'] ?? projectId);
      name = String(proj.Name ?? name);
    }
    if (ext?.ExtensionSchema) extensionSchema = String(ext.ExtensionSchema);
  }
  return { projectId, name, version, extensionSchema };
}

function parseComponentNode(c: unknown): BCFComponent | null {
  if (!c || typeof c !== 'object') return null;
  const cn = c as Record<string, unknown>;
  const ifcGuid = String(cn['@_IfcGuid'] ?? '');
  if (!ifcGuid) return null;
  const sys = cn.OriginatingSystem ? String(cn.OriginatingSystem) : undefined;
  const tool = cn.AuthoringToolId ? String(cn.AuthoringToolId) : undefined;
  return { ifcGuid, originatingSystem: sys, authoringToolId: tool };
}

function parseComponents(node: Record<string, unknown> | undefined): BCFComponents | undefined {
  if (!node) return undefined;
  const out: BCFComponents = {};

  const hints = node.ViewSetupHints as Record<string, unknown> | undefined;
  if (hints) {
    const hint: BCFComponents['viewSetupHints'] = {};
    if (hints['@_SpacesVisible'] != null) hint.spacesVisible = String(hints['@_SpacesVisible']) === 'true';
    if (hints['@_SpaceBoundariesVisible'] != null) hint.spaceBoundariesVisible = String(hints['@_SpaceBoundariesVisible']) === 'true';
    if (hints['@_OpeningsVisible'] != null) hint.openingsVisible = String(hints['@_OpeningsVisible']) === 'true';
    if (Object.keys(hint).length > 0) out.viewSetupHints = hint;
  }

  const sel = node.Selection as Record<string, unknown> | undefined;
  if (sel) {
    const comps = asArray(sel.Component).map(parseComponentNode).filter((c): c is BCFComponent => c != null);
    if (comps.length > 0) out.selection = comps;
  }

  const vis = node.Visibility as Record<string, unknown> | undefined;
  if (vis) {
    const defaultVisibility = String(vis['@_DefaultVisibility'] ?? 'true') !== 'false';
    const exc = vis.Exceptions as Record<string, unknown> | undefined;
    const exceptions = exc
      ? asArray(exc.Component).map(parseComponentNode).filter((c): c is BCFComponent => c != null)
      : [];
    out.visibility = { defaultVisibility, exceptions };
  }

  const col = node.Coloring as Record<string, unknown> | undefined;
  if (col) {
    const groups: BCFColoringGroup[] = asArray(col.Color).map((c) => {
      const cn = c as Record<string, unknown>;
      const color = String(cn['@_Color'] ?? '');
      const compsNode = cn.Components as Record<string, unknown> | undefined;
      const comps = compsNode
        ? asArray(compsNode.Component).map(parseComponentNode).filter((x): x is BCFComponent => x != null)
        : [];
      return { color, components: comps };
    }).filter((g) => g.color.length > 0);
    if (groups.length > 0) out.coloring = groups;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function parseViewpoint(
  guid: string,
  bcfvBytes: Uint8Array | undefined,
  snapshot: Uint8Array | undefined,
): BCFViewpoint | null {
  if (!bcfvBytes) return null;
  const xml = PARSER.parse(strFromU8(bcfvBytes)) as ViewpointXml;
  const info = xml.VisualizationInfo;
  let position: BCFViewpointPosition | null = null;
  if (info?.PerspectiveCamera) {
    const c = info.PerspectiveCamera;
    position = {
      cameraType: 'perspective',
      cameraViewPoint: { x: n(c.CameraViewPoint?.X), y: n(c.CameraViewPoint?.Y), z: n(c.CameraViewPoint?.Z) },
      cameraDirection: { x: n(c.CameraDirection?.X), y: n(c.CameraDirection?.Y), z: n(c.CameraDirection?.Z) },
      cameraUpVector: { x: n(c.CameraUpVector?.X), y: n(c.CameraUpVector?.Y), z: n(c.CameraUpVector?.Z) },
      fieldOfView: n(c.FieldOfView),
    };
  } else if (info?.OrthogonalCamera) {
    const c = info.OrthogonalCamera;
    position = {
      cameraType: 'orthogonal',
      cameraViewPoint: { x: n(c.CameraViewPoint?.X), y: n(c.CameraViewPoint?.Y), z: n(c.CameraViewPoint?.Z) },
      cameraDirection: { x: n(c.CameraDirection?.X), y: n(c.CameraDirection?.Y), z: n(c.CameraDirection?.Z) },
      cameraUpVector: { x: n(c.CameraUpVector?.X), y: n(c.CameraUpVector?.Y), z: n(c.CameraUpVector?.Z) },
      viewToWorldScale: n(c.ViewToWorldScale),
    };
  }
  const components = parseComponents(info?.Components as Record<string, unknown> | undefined);
  const out: BCFViewpoint = { guid, position };
  if (snapshot) out.snapshotPng = snapshot;
  if (components) out.components = components;
  return out;
}

function parseTopic(topicGuid: string, files: Record<string, Uint8Array>): BCFTopic | null {
  const markupBytes = files[`${topicGuid}/markup.bcf`];
  if (!markupBytes) return null;
  const xml = PARSER.parse(strFromU8(markupBytes)) as MarkupXml;
  const m = xml.Markup;
  if (!m) return null;

  const topicNode = m.Topic as Record<string, unknown> | undefined;
  if (!topicNode) return null;

  const comments: BCFComment[] = asArray(m.Comment).map((c) => {
    const cn = c as Record<string, unknown>;
    return {
      guid: String(cn['@_Guid'] ?? ''),
      date: String(cn.Date ?? ''),
      author: String(cn.Author ?? ''),
      comment: String(cn.Comment ?? ''),
      viewpoint: cn.Viewpoint ? String((cn.Viewpoint as Record<string, unknown>)['@_Guid'] ?? '') : undefined,
      parent: cn.ReplyToComment ? String((cn.ReplyToComment as Record<string, unknown>)['@_Guid'] ?? '') : undefined,
    };
  });

  const viewpointEntries = asArray(m.Viewpoints?.ViewPoint) as Record<string, unknown>[];
  const viewpoints: BCFViewpoint[] = [];
  for (const entry of viewpointEntries) {
    const vpGuid = String(entry['@_Guid'] ?? '');
    if (!vpGuid) continue;
    const bcfvName = `${topicGuid}/${String(entry.Viewpoint ?? `viewpoint-${vpGuid}.bcfv`)}`;
    const snapName = entry.Snapshot ? `${topicGuid}/${String(entry.Snapshot)}` : null;
    const vp = parseViewpoint(vpGuid, files[bcfvName], snapName ? files[snapName] : undefined);
    if (vp) viewpoints.push(vp);
  }
  // Stable order: GUID-sorted, matching the writer.
  viewpoints.sort((a, b) => a.guid.localeCompare(b.guid));

  // RelatedTopics: BCF 3.0 places the block inside <Topic>.
  const relatedNode = topicNode.RelatedTopics as Record<string, unknown> | undefined;
  const relatedTopics = relatedNode
    ? asArray(relatedNode.RelatedTopic)
        .map((r) => String((r as Record<string, unknown>)['@_Guid'] ?? ''))
        .filter((g) => g.length > 0)
        .sort()
    : undefined;

  return {
    guid: String(topicNode['@_Guid'] ?? topicGuid),
    topicType: String(topicNode['@_TopicType'] ?? ''),
    topicStatus: String(topicNode['@_TopicStatus'] ?? ''),
    title: String(topicNode.Title ?? ''),
    priority: topicNode.Priority ? String(topicNode.Priority) : undefined,
    index: topicNode.Index != null ? Number(topicNode.Index) : undefined,
    labels: asArray(topicNode.Labels).map(String).filter((s) => s.length > 0),
    creationDate: String(topicNode.CreationDate ?? ''),
    creationAuthor: String(topicNode.CreationAuthor ?? ''),
    modifiedDate: topicNode.ModifiedDate ? String(topicNode.ModifiedDate) : undefined,
    modifiedAuthor: topicNode.ModifiedAuthor ? String(topicNode.ModifiedAuthor) : undefined,
    assignedTo: topicNode.AssignedTo ? String(topicNode.AssignedTo) : undefined,
    dueDate: topicNode.DueDate ? String(topicNode.DueDate) : undefined,
    stage: topicNode.Stage ? String(topicNode.Stage) : undefined,
    description: topicNode.Description ? String(topicNode.Description) : undefined,
    comments,
    viewpoints,
    relatedTopics: relatedTopics && relatedTopics.length > 0 ? relatedTopics : undefined,
  };
}

/** Read a BCF 3.0 ZIP buffer and return a normalised archive. */
export async function readBCF(bytes: Uint8Array): Promise<BCFArchive> {
  return withSpan('pryzm.bcf.read', { byte_count: bytes.byteLength }, (span) => {
    const files = unzipSync(bytes);
    const project = parseProject(files);

    const topicGuids = new Set<string>();
    for (const path of Object.keys(files)) {
      const slash = path.indexOf('/');
      if (slash > 0) topicGuids.add(path.slice(0, slash));
    }

    const topics: BCFTopic[] = [];
    for (const guid of [...topicGuids].sort()) {
      const t = parseTopic(guid, files);
      if (t) topics.push(t);
    }

    let viewpointTotal = 0;
    let componentTotal = 0;
    for (const t of topics) {
      viewpointTotal += t.viewpoints.length;
      for (const vp of t.viewpoints) {
        if (vp.components) {
          componentTotal += (vp.components.selection?.length ?? 0)
            + (vp.components.visibility?.exceptions.length ?? 0)
            + (vp.components.coloring ?? []).reduce((m, g) => m + g.components.length, 0);
        }
      }
    }
    span.setAttribute('topic_count', topics.length);
    span.setAttribute('viewpoint_count', viewpointTotal);
    span.setAttribute('component_count', componentTotal);
    return { project, topics };
  });
}
