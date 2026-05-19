// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PanelHost, type PanelContext } from '@pryzm/ui';
import { createBcfPanelContribution } from '../src/panel-contribution.js';
import type { BCFArchive, BCFTopic, BCFViewpoint } from '../src/types.js';
import type { CameraTarget } from '../src/viewpoint-navigator.js';

const vp = (guid: string, withPosition: boolean): BCFViewpoint => ({
  guid,
  position: withPosition ? {
    cameraType: 'perspective',
    cameraViewPoint: { x: 0, y: 0, z: 10 },
    cameraDirection: { x: 0, y: 0, z: -1 },
    cameraUpVector: { x: 0, y: 1, z: 0 },
    fieldOfView: 60,
  } : null,
  components: {
    selection: [{ ifcGuid: 'IFC_GUID_A' }],
  },
});

const topic = (guid: string, title: string, viewpoints: BCFViewpoint[]): BCFTopic => ({
  guid,
  topicType: 'Issue',
  topicStatus: 'Open',
  title,
  creationDate: '2026-04-28T12:00:00Z',
  creationAuthor: 'alice@pryzm.io',
  comments: [],
  viewpoints,
  assignedTo: 'bob@pryzm.io',
  dueDate: '2026-05-15',
  stage: 'DD',
  description: `Description for ${title}`,
});

const archive = (topics: BCFTopic[]): BCFArchive => ({
  project: { projectId: 'p-1', name: 'Test', version: '3.0' },
  topics,
});

const context: PanelContext = { elementId: 'el-1', elementType: 'wall' };

describe('createBcfPanelContribution', () => {
  let host: PanelHost;
  let parent: HTMLElement;
  let onNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    host = new PanelHost();
    parent = document.createElement('div');
    document.body.appendChild(parent);
    onNavigate = vi.fn();
  });

  it('shouldShow false when no archive', () => {
    const c = createBcfPanelContribution({
      archive: null,
      resolveIfcGuid: () => 'IFC_GUID_A',
      onNavigate,
    });
    expect(c.shouldShow!(context)).toBe(false);
  });

  it('shouldShow false when element has no IFC GUID', () => {
    const c = createBcfPanelContribution({
      archive: archive([topic('t-1', 'T1', [vp('vp-1', true)])]),
      resolveIfcGuid: () => null,
      onNavigate,
    });
    expect(c.shouldShow!(context)).toBe(false);
  });

  it('shouldShow false when no topic references the element GUID', () => {
    const c = createBcfPanelContribution({
      archive: archive([topic('t-1', 'T1', [vp('vp-1', true)])]),
      resolveIfcGuid: () => 'IFC_GUID_OTHER',
      onNavigate,
    });
    expect(c.shouldShow!(context)).toBe(false);
  });

  it('shouldShow true when at least one topic references the element', () => {
    const c = createBcfPanelContribution({
      archive: archive([topic('t-1', 'T1', [vp('vp-1', true)])]),
      resolveIfcGuid: () => 'IFC_GUID_A',
      onNavigate,
    });
    expect(c.shouldShow!(context)).toBe(true);
  });

  it('renders one <details> per matching topic with assignedTo / dueDate / stage', () => {
    const c = createBcfPanelContribution({
      archive: archive([
        topic('t-1', 'Title One', [vp('vp-1', true)]),
        topic('t-2', 'Title Two', [vp('vp-2', true)]),
      ]),
      resolveIfcGuid: () => 'IFC_GUID_A',
      onNavigate,
    });
    host.register(c);
    host.mount(context, parent);
    const topics = parent.querySelectorAll<HTMLElement>('.bcf-topic');
    expect(topics.length).toBe(2);
    expect(topics[0]!.dataset.topicGuid).toBe('t-1');
    const meta = parent.querySelector<HTMLElement>('.bcf-topic-meta')!;
    expect(meta.textContent).toContain('Assigned to: bob@pryzm.io');
    expect(meta.textContent).toContain('Due: 2026-05-15');
    expect(meta.textContent).toContain('Stage: DD');
  });

  it('renders a vp-jumper button per viewpoint; snapshot-only viewpoints are disabled', () => {
    const c = createBcfPanelContribution({
      archive: archive([topic('t-1', 'T1', [vp('vp-pos', true), vp('vp-snap', false)])]),
      resolveIfcGuid: () => 'IFC_GUID_A',
      onNavigate,
    });
    host.register(c);
    host.mount(context, parent);
    const buttons = parent.querySelectorAll<HTMLButtonElement>('.vp-jumper');
    expect(buttons.length).toBe(2);
    expect(buttons[0]!.dataset.viewpointGuid).toBe('vp-pos');
    expect(buttons[0]!.disabled).toBe(false);
    expect(buttons[1]!.disabled).toBe(true);
    expect(buttons[1]!.textContent).toBe('Snapshot only');
  });

  it('clicking a vp-jumper invokes onNavigate with the computed CameraTarget', () => {
    const c = createBcfPanelContribution({
      archive: archive([topic('t-1', 'T1', [vp('vp-1', true)])]),
      resolveIfcGuid: () => 'IFC_GUID_A',
      onNavigate,
    });
    host.register(c);
    host.mount(context, parent);
    const button = parent.querySelector<HTMLButtonElement>('.vp-jumper')!;
    button.click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
    const [target, vpArg, topicArg] = onNavigate.mock.calls[0]! as [CameraTarget, BCFViewpoint, BCFTopic];
    expect(target.kind).toBe('perspective');
    expect(vpArg.guid).toBe('vp-1');
    expect(topicArg.guid).toBe('t-1');
  });

  it('targetDistanceM override flows into the navigator', () => {
    const c = createBcfPanelContribution({
      archive: archive([topic('t-1', 'T1', [vp('vp-1', true)])]),
      resolveIfcGuid: () => 'IFC_GUID_A',
      onNavigate,
      targetDistanceM: 25,
    });
    host.register(c);
    host.mount(context, parent);
    parent.querySelector<HTMLButtonElement>('.vp-jumper')!.click();
    const target = onNavigate.mock.calls[0]![0] as CameraTarget;
    expect(target.targetDistance).toBe(25);
    expect(target.target).toEqual({ x: 0, y: 0, z: -15 });
  });

  it('unmount() empties the container — visual-regression invariant for G19', () => {
    const c = createBcfPanelContribution({
      archive: archive([topic('t-1', 'T1', [vp('vp-1', true)])]),
      resolveIfcGuid: () => 'IFC_GUID_A',
      onNavigate,
    });
    host.register(c);
    host.mount(context, parent);
    expect(parent.querySelectorAll('.bcf-topic').length).toBe(1);
    host.unmountAll();
    expect(parent.children.length).toBe(0);
  });
});
