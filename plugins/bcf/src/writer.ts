/**
 * BCF 3.0 writer.
 *
 * Phase 3-B Sprint S59 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5
 * BCF 3.0 export with viewpoints + snapshots + Solibri round-trip; and
 * PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S59).
 *
 * Writes a deterministic `.bcf` ZIP from a `BCFArchive`. Determinism is
 * critical for the round-trip CI gate G18 (`pnpm test plugins/bcf`) — two
 * writes of the same logical archive must produce byte-identical buffers.
 *
 * Determinism choices:
 *   - Topics emitted in GUID-sorted order.
 *   - Viewpoints within a topic emitted in GUID-sorted order.
 *   - Components within selection / visibility / coloring emitted in
 *     IfcGuid-sorted order; coloring groups in colour-hex-sorted order.
 *   - File entries appended in dictionary order (`Object.keys(...).sort()`).
 *   - All `mtime` set to fixed 1980-01-01T00:00:00Z (fflate min DOS date).
 *   - XML hand-rolled with fixed indentation + sorted attribute order so
 *     dependency bumps cannot shift bytes.
 */

import { strToU8, zipSync } from 'fflate';
import { escapeXml } from './xml.js';
import { withSpan } from './otel.js';
import type {
  BCFArchive,
  BCFComment,
  BCFComponent,
  BCFComponents,
  BCFProject,
  BCFTopic,
  BCFViewpoint,
  BCFViewpointPosition,
} from './types.js';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>\n';

/**
 * Fixed mtime for deterministic ZIP output. fflate's `zipSync` requires DOS
 * date encoding (1980-2099); we pin to 1980-01-01T00:00:00Z so two writes
 * of the same archive produce identical bytes.
 */
const FIXED_MTIME = new Date('1980-01-01T00:00:00Z');

/**
 * Per-viewpoint file naming. We embed the viewpoint GUID in the filename
 * so a topic with N viewpoints stays unambiguous on read. The reader also
 * accepts the legacy `viewpoint.bcfv` / `snapshot.png` names used by S57
 * archives and many buildingSMART reference fixtures.
 */
function vpBcfvName(vpGuid: string): string {
  return `viewpoint-${vpGuid}.bcfv`;
}

function vpSnapName(vpGuid: string): string {
  return `snapshot-${vpGuid}.png`;
}

function projectXml(p: BCFProject): string {
  const ext = p.extensionSchema ? `\n  <ExtensionSchema>${escapeXml(p.extensionSchema)}</ExtensionSchema>` : '';
  return XML_DECL
    + `<ProjectExtension>\n`
    + `  <Project ProjectId="${escapeXml(p.projectId)}">\n`
    + `    <Name>${escapeXml(p.name)}</Name>\n`
    + `  </Project>${ext}\n`
    + `</ProjectExtension>\n`;
}

function commentXml(c: BCFComment, indent: string): string {
  const vp = c.viewpoint ? `${indent}  <Viewpoint Guid="${escapeXml(c.viewpoint)}" />\n` : '';
  const parent = c.parent ? `${indent}  <ReplyToComment Guid="${escapeXml(c.parent)}" />\n` : '';
  return `${indent}<Comment Guid="${escapeXml(c.guid)}">\n`
    + `${indent}  <Date>${escapeXml(c.date)}</Date>\n`
    + `${indent}  <Author>${escapeXml(c.author)}</Author>\n`
    + `${indent}  <Comment>${escapeXml(c.comment)}</Comment>\n`
    + vp
    + parent
    + `${indent}</Comment>\n`;
}

function viewpointEntryXml(vp: BCFViewpoint, indent: string): string {
  const hasSnap = !!vp.snapshotPng;
  const snap = hasSnap ? `${indent}  <Snapshot>${escapeXml(vpSnapName(vp.guid))}</Snapshot>\n` : '';
  return `${indent}<ViewPoint Guid="${escapeXml(vp.guid)}">\n`
    + `${indent}  <Viewpoint>${escapeXml(vpBcfvName(vp.guid))}</Viewpoint>\n`
    + snap
    + `${indent}</ViewPoint>\n`;
}

function relatedTopicsXml(guids: string[] | undefined): string {
  if (!guids || guids.length === 0) return '';
  const sorted = [...guids].sort();
  return `    <RelatedTopics>\n`
    + sorted.map((g) => `      <RelatedTopic Guid="${escapeXml(g)}" />\n`).join('')
    + `    </RelatedTopics>\n`;
}

function markupXml(t: BCFTopic): string {
  const labels = (t.labels ?? []).map((l) => `    <Labels>${escapeXml(l)}</Labels>\n`).join('');
  const desc = t.description ? `    <Description>${escapeXml(t.description)}</Description>\n` : '';
  const idx = t.index != null ? `    <Index>${t.index}</Index>\n` : '';
  const pri = t.priority ? `    <Priority>${escapeXml(t.priority)}</Priority>\n` : '';
  const modDate = t.modifiedDate ? `    <ModifiedDate>${escapeXml(t.modifiedDate)}</ModifiedDate>\n` : '';
  const modAuth = t.modifiedAuthor ? `    <ModifiedAuthor>${escapeXml(t.modifiedAuthor)}</ModifiedAuthor>\n` : '';
  const assignedTo = t.assignedTo ? `    <AssignedTo>${escapeXml(t.assignedTo)}</AssignedTo>\n` : '';
  const dueDate = t.dueDate ? `    <DueDate>${escapeXml(t.dueDate)}</DueDate>\n` : '';
  const stage = t.stage ? `    <Stage>${escapeXml(t.stage)}</Stage>\n` : '';

  // Per BCF 3.0 schema element ordering inside <Topic>.
  const topicBlock = `  <Topic Guid="${escapeXml(t.guid)}" TopicType="${escapeXml(t.topicType)}" TopicStatus="${escapeXml(t.topicStatus)}">\n`
    + `    <Title>${escapeXml(t.title)}</Title>\n`
    + idx
    + labels
    + pri
    + relatedTopicsXml(t.relatedTopics)
    + `    <CreationDate>${escapeXml(t.creationDate)}</CreationDate>\n`
    + `    <CreationAuthor>${escapeXml(t.creationAuthor)}</CreationAuthor>\n`
    + modDate
    + modAuth
    + assignedTo
    + dueDate
    + stage
    + desc
    + `  </Topic>\n`;

  const commentsBlock = t.comments.map((c) => commentXml(c, '  ')).join('');

  const sortedVps = [...t.viewpoints].sort((a, b) => a.guid.localeCompare(b.guid));
  const viewpointsBlock = sortedVps.length > 0
    ? `  <Viewpoints>\n${sortedVps.map((vp) => viewpointEntryXml(vp, '    ')).join('')}  </Viewpoints>\n`
    : '';

  return XML_DECL
    + `<Markup>\n`
    + topicBlock
    + commentsBlock
    + viewpointsBlock
    + `</Markup>\n`;
}

function componentXml(c: BCFComponent, indent: string): string {
  const sys = c.originatingSystem ? `${indent}  <OriginatingSystem>${escapeXml(c.originatingSystem)}</OriginatingSystem>\n` : '';
  const tool = c.authoringToolId ? `${indent}  <AuthoringToolId>${escapeXml(c.authoringToolId)}</AuthoringToolId>\n` : '';
  if (sys || tool) {
    return `${indent}<Component IfcGuid="${escapeXml(c.ifcGuid)}">\n${sys}${tool}${indent}</Component>\n`;
  }
  return `${indent}<Component IfcGuid="${escapeXml(c.ifcGuid)}" />\n`;
}

function sortComponents(arr: BCFComponent[]): BCFComponent[] {
  return [...arr].sort((a, b) => a.ifcGuid.localeCompare(b.ifcGuid));
}

function componentsXml(c: BCFComponents | undefined, indent: string): string {
  if (!c) return '';
  const parts: string[] = [];

  if (c.viewSetupHints) {
    const h = c.viewSetupHints;
    const attrs: string[] = [];
    if (h.spacesVisible != null) attrs.push(`SpacesVisible="${h.spacesVisible}"`);
    if (h.spaceBoundariesVisible != null) attrs.push(`SpaceBoundariesVisible="${h.spaceBoundariesVisible}"`);
    if (h.openingsVisible != null) attrs.push(`OpeningsVisible="${h.openingsVisible}"`);
    if (attrs.length > 0) {
      parts.push(`${indent}  <ViewSetupHints ${attrs.sort().join(' ')} />\n`);
    }
  }

  if (c.selection && c.selection.length > 0) {
    const sorted = sortComponents(c.selection);
    parts.push(`${indent}  <Selection>\n`);
    for (const comp of sorted) parts.push(componentXml(comp, `${indent}    `));
    parts.push(`${indent}  </Selection>\n`);
  }

  if (c.visibility) {
    parts.push(`${indent}  <Visibility DefaultVisibility="${c.visibility.defaultVisibility}">\n`);
    if (c.visibility.exceptions.length > 0) {
      const sorted = sortComponents(c.visibility.exceptions);
      parts.push(`${indent}    <Exceptions>\n`);
      for (const comp of sorted) parts.push(componentXml(comp, `${indent}      `));
      parts.push(`${indent}    </Exceptions>\n`);
    }
    parts.push(`${indent}  </Visibility>\n`);
  }

  if (c.coloring && c.coloring.length > 0) {
    const sortedGroups = [...c.coloring].sort((a, b) => a.color.localeCompare(b.color));
    parts.push(`${indent}  <Coloring>\n`);
    for (const grp of sortedGroups) {
      parts.push(`${indent}    <Color Color="${escapeXml(grp.color)}">\n`);
      parts.push(`${indent}      <Components>\n`);
      const sortedComps = sortComponents(grp.components);
      for (const comp of sortedComps) parts.push(componentXml(comp, `${indent}        `));
      parts.push(`${indent}      </Components>\n`);
      parts.push(`${indent}    </Color>\n`);
    }
    parts.push(`${indent}  </Coloring>\n`);
  }

  if (parts.length === 0) return '';
  return `${indent}<Components>\n` + parts.join('') + `${indent}</Components>\n`;
}

function viewpointBcfvXml(vp: BCFViewpoint): string {
  const p = vp.position;
  const cam = p
    ? (p.cameraType === 'perspective' ? perspectiveCameraXml(p) : orthogonalCameraXml(p))
    : '';
  const comps = componentsXml(vp.components, '  ');
  const inner = cam + comps;
  if (!inner) return XML_DECL + `<VisualizationInfo />\n`;
  return XML_DECL
    + `<VisualizationInfo>\n`
    + inner
    + `</VisualizationInfo>\n`;
}

function vec3Xml(name: string, v: { x: number; y: number; z: number }, indent: string): string {
  return `${indent}<${name}>\n`
    + `${indent}  <X>${v.x}</X>\n`
    + `${indent}  <Y>${v.y}</Y>\n`
    + `${indent}  <Z>${v.z}</Z>\n`
    + `${indent}</${name}>\n`;
}

function perspectiveCameraXml(p: BCFViewpointPosition): string {
  return `  <PerspectiveCamera>\n`
    + vec3Xml('CameraViewPoint', p.cameraViewPoint, '    ')
    + vec3Xml('CameraDirection', p.cameraDirection, '    ')
    + vec3Xml('CameraUpVector', p.cameraUpVector, '    ')
    + `    <FieldOfView>${p.fieldOfView ?? 60}</FieldOfView>\n`
    + `  </PerspectiveCamera>\n`;
}

function orthogonalCameraXml(p: BCFViewpointPosition): string {
  return `  <OrthogonalCamera>\n`
    + vec3Xml('CameraViewPoint', p.cameraViewPoint, '    ')
    + vec3Xml('CameraDirection', p.cameraDirection, '    ')
    + vec3Xml('CameraUpVector', p.cameraUpVector, '    ')
    + `    <ViewToWorldScale>${p.viewToWorldScale ?? 1}</ViewToWorldScale>\n`
    + `  </OrthogonalCamera>\n`;
}

/** Write a BCF 3.0 archive to a deterministic ZIP buffer. */
export async function writeBCF(archive: BCFArchive): Promise<Uint8Array> {
  return withSpan('pryzm.bcf.write', { topic_count: archive.topics.length }, (span) => {
    const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
    const opt = { mtime: FIXED_MTIME };

    entries['bcf.version'] = [strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="${escapeXml(archive.project.version)}" />\n`), opt];
    entries['project.bcfp'] = [strToU8(projectXml(archive.project)), opt];

    let viewpointTotal = 0;
    let componentTotal = 0;

    const topics = [...archive.topics].sort((a, b) => a.guid.localeCompare(b.guid));
    for (const t of topics) {
      entries[`${t.guid}/markup.bcf`] = [strToU8(markupXml(t)), opt];
      const sortedVps = [...t.viewpoints].sort((a, b) => a.guid.localeCompare(b.guid));
      for (const vp of sortedVps) {
        viewpointTotal += 1;
        entries[`${t.guid}/${vpBcfvName(vp.guid)}`] = [strToU8(viewpointBcfvXml(vp)), opt];
        if (vp.snapshotPng) {
          entries[`${t.guid}/${vpSnapName(vp.guid)}`] = [vp.snapshotPng, opt];
        }
        if (vp.components) {
          componentTotal += (vp.components.selection?.length ?? 0)
            + (vp.components.visibility?.exceptions.length ?? 0)
            + (vp.components.coloring ?? []).reduce((n, g) => n + g.components.length, 0);
        }
      }
    }

    span.setAttribute('viewpoint_count', viewpointTotal);
    span.setAttribute('component_count', componentTotal);

    // fflate's zipSync expects { [name]: Uint8Array | [Uint8Array, opts] }
    const payload: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {};
    for (const k of Object.keys(entries).sort()) {
      const v = entries[k];
      if (v !== undefined) payload[k] = v;
    }
    const bytes = zipSync(payload, { mtime: FIXED_MTIME });
    span.setAttribute('byte_count', bytes.byteLength);
    return bytes;
  });
}
