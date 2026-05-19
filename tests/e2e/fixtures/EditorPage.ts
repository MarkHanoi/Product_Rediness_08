// tests/e2e/fixtures/EditorPage.ts — Wave A18-T2 to T11 shared page object
// All 10 E2E tests import this page object for consistent locator access.

import type { Page, Locator } from '@playwright/test';

export class EditorPage {
  readonly page: Page;
  readonly canvas: Locator;
  readonly spatialTree: Locator;
  readonly wallToolButton: Locator;
  readonly propertyPanel: Locator;
  readonly statusBar: Locator;
  readonly undoButton: Locator;
  readonly redoButton: Locator;
  readonly bcfExportButton: Locator;
  readonly ifcImportInput: Locator;
  readonly ifcExportButton: Locator;
  readonly sectionPlaneToggle: Locator;
  readonly planViewport: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('[aria-label="3D viewport — use keyboard to orbit"]');
    this.spatialTree = page.locator('[data-testid="spatial-tree"]');
    this.wallToolButton = page.locator('[data-testid="tool-wall"]');
    this.propertyPanel = page.locator('[data-testid="property-panel"]');
    this.statusBar = page.locator('[data-testid="status-bar"]');
    this.undoButton = page.locator('[data-testid="undo"]');
    this.redoButton = page.locator('[data-testid="redo"]');
    this.bcfExportButton = page.locator('[data-testid="bcf-export"]');
    this.ifcImportInput = page.locator('[data-testid="ifc-import-input"]');
    this.ifcExportButton = page.locator('[data-testid="ifc-export"]');
    this.sectionPlaneToggle = page.locator('[data-testid="section-plane-toggle"]');
    this.planViewport = page.locator('[data-testid="plan-viewport"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async openProject(projectId: string): Promise<void> {
    await this.page.goto(`/project/${projectId}`);
    await this.page.waitForSelector('[aria-label="3D viewport — use keyboard to orbit"]', {
      timeout: 30_000,
    });
  }

  async waitForCanvas(): Promise<void> {
    await this.canvas.waitFor({ state: 'visible', timeout: 30_000 });
  }
}
