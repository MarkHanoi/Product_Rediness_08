/**
 * Default seed data for the AssetCatalogStore.
 * Healthcare-focused archetypes covering imaging, patient-care,
 * diagnostic, sterilization, lab, and general furniture categories.
 *
 * Loaded once at bootstrap by ProjectLoader before any snapshot is
 * restored. If a snapshot includes assetCatalog records they overwrite
 * this seed via AssetCatalogStore.setDirect().
 *
 * All dimension values are in millimetres; clearanceRadius includes the
 * recommended operational clearance around the equipment footprint.
 */

import { AssetCatalogEntry } from './AssetCatalogTypes.js';

export function buildDefaultAssetCatalog(): AssetCatalogEntry[] {
  const now = Date.now();

  const entry = (
    id: string,
    name: string,
    category: AssetCatalogEntry['parameters']['category'],
    width_mm: number,
    depth_mm: number,
    height_mm: number,
    opts: {
      powerDraw_kw?: number;
      weight_kg?: number;
      clearanceRadius_mm?: number;
    } = {}
  ): AssetCatalogEntry => ({
    id,
    type: 'AssetCatalogEntry',
    levelId: 'CATALOG',
    parameters: {
      name,
      category,
      width_mm,
      depth_mm,
      height_mm,
      ...opts,
    },
    metadata: {
      createdAt:  now,
      modifiedAt: now,
      createdBy:  'system',
      version:    1,
    },
  });

  return [
    // ── Medical Imaging ───────────────────────────────────────────────────────
    entry(
      '00000000-cat0-0000-0001-000000000001',
      'MRI Machine',
      'medical-imaging',
      2500, 2200, 2000,
      { powerDraw_kw: 35, weight_kg: 6000, clearanceRadius_mm: 1200 }
    ),
    entry(
      '00000000-cat0-0000-0001-000000000002',
      'CT Scanner',
      'medical-imaging',
      2300, 1800, 2000,
      { powerDraw_kw: 80, weight_kg: 2200, clearanceRadius_mm: 1000 }
    ),
    entry(
      '00000000-cat0-0000-0001-000000000003',
      'X-Ray Unit',
      'medical-imaging',
      1000, 800, 2200,
      { powerDraw_kw: 5, weight_kg: 220, clearanceRadius_mm: 600 }
    ),
    entry(
      '00000000-cat0-0000-0001-000000000004',
      'Ultrasound Unit',
      'diagnostic',
      600, 500, 1400,
      { powerDraw_kw: 0.5, weight_kg: 80, clearanceRadius_mm: 400 }
    ),

    // ── Patient Care ──────────────────────────────────────────────────────────
    entry(
      '00000000-cat0-0000-0002-000000000001',
      'Hospital Bed',
      'patient-care',
      2100, 1000, 900,
      { powerDraw_kw: 0.3, weight_kg: 220, clearanceRadius_mm: 900 }
    ),
    entry(
      '00000000-cat0-0000-0002-000000000002',
      'ICU Bed',
      'patient-care',
      2200, 1050, 1000,
      { powerDraw_kw: 0.5, weight_kg: 280, clearanceRadius_mm: 1200 }
    ),
    entry(
      '00000000-cat0-0000-0002-000000000003',
      'Exam Table',
      'patient-care',
      1800, 700, 900,
      { powerDraw_kw: 0.1, weight_kg: 120, clearanceRadius_mm: 600 }
    ),
    entry(
      '00000000-cat0-0000-0002-000000000004',
      'Wheelchair',
      'patient-care',
      650, 1000, 920,
      { weight_kg: 18, clearanceRadius_mm: 750 }
    ),

    // ── Diagnostic ────────────────────────────────────────────────────────────
    entry(
      '00000000-cat0-0000-0003-000000000001',
      'Patient Monitor',
      'diagnostic',
      350, 250, 1500,
      { powerDraw_kw: 0.3, weight_kg: 12, clearanceRadius_mm: 300 }
    ),
    entry(
      '00000000-cat0-0000-0003-000000000002',
      'Ventilator',
      'diagnostic',
      550, 450, 1500,
      { powerDraw_kw: 0.3, weight_kg: 30, clearanceRadius_mm: 500 }
    ),
    entry(
      '00000000-cat0-0000-0003-000000000003',
      'Infusion Pump',
      'diagnostic',
      200, 200, 1200,
      { powerDraw_kw: 0.1, weight_kg: 8, clearanceRadius_mm: 300 }
    ),
    entry(
      '00000000-cat0-0000-0003-000000000004',
      'Defibrillator',
      'diagnostic',
      300, 250, 350,
      { powerDraw_kw: 0.05, weight_kg: 12, clearanceRadius_mm: 200 }
    ),

    // ── Sterilization ─────────────────────────────────────────────────────────
    entry(
      '00000000-cat0-0000-0004-000000000001',
      'Autoclave',
      'sterilization',
      800, 800, 1400,
      { powerDraw_kw: 6, weight_kg: 350, clearanceRadius_mm: 600 }
    ),
    entry(
      '00000000-cat0-0000-0004-000000000002',
      'Washer-Disinfector',
      'sterilization',
      1100, 750, 1750,
      { powerDraw_kw: 8, weight_kg: 280, clearanceRadius_mm: 700 }
    ),

    // ── Laboratory ────────────────────────────────────────────────────────────
    entry(
      '00000000-cat0-0000-0005-000000000001',
      'Lab Bench',
      'laboratory',
      3000, 750, 900,
      { powerDraw_kw: 0.5, weight_kg: 200, clearanceRadius_mm: 1200 }
    ),
    entry(
      '00000000-cat0-0000-0005-000000000002',
      'Biosafety Cabinet',
      'laboratory',
      1200, 700, 2200,
      { powerDraw_kw: 1.5, weight_kg: 280, clearanceRadius_mm: 1000 }
    ),
    entry(
      '00000000-cat0-0000-0005-000000000003',
      'Centrifuge',
      'laboratory',
      450, 450, 400,
      { powerDraw_kw: 0.8, weight_kg: 40, clearanceRadius_mm: 500 }
    ),

    // ── IT Infrastructure ─────────────────────────────────────────────────────
    entry(
      '00000000-cat0-0000-0006-000000000001',
      'Server Rack',
      'it-infrastructure',
      600, 1000, 2000,
      { powerDraw_kw: 5, weight_kg: 500, clearanceRadius_mm: 1000 }
    ),
    entry(
      '00000000-cat0-0000-0006-000000000002',
      'UPS Unit',
      'it-infrastructure',
      400, 700, 900,
      { powerDraw_kw: 2, weight_kg: 120, clearanceRadius_mm: 400 }
    ),

    // ── Furniture ─────────────────────────────────────────────────────────────
    entry(
      '00000000-cat0-0000-0007-000000000001',
      'Nursing Station Desk',
      'furniture',
      2400, 800, 1100,
      { weight_kg: 180 }
    ),
    entry(
      '00000000-cat0-0000-0007-000000000002',
      'Waiting Chair',
      'furniture',
      600, 600, 900,
      { weight_kg: 12 }
    ),
  ];
}
