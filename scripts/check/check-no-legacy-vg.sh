#!/usr/bin/env bash
# scripts/check-no-legacy-vg.sh — Contract 25b lockdown guard
#
# Fails (exit 1) when a NEW file imports a legacy VG surface.
# Existing call sites are allowlisted explicitly below; the list shrinks as
# follow-up Waves retire each surface.
#
# Run locally:  bash scripts/check-no-legacy-vg.sh
# Run in CI:    add to the pre-commit / pre-push pipeline (not gating the
#               production build today).

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Allowlist (path::legacy-import) ─────────────────────────────────────────
# The only files allowed to import each legacy surface today. Any *new* file
# importing the same surface causes this script to fail.
read -r -d '' ALLOWLIST <<'EOF' || true
src/elements/doors/DoorBuilder.ts::src/visibility/VGGovernanceStore
src/elements/doors/DoorPlanSymbolBuilder.ts::src/visibility/VGGovernanceStore
src/elements/windows/WindowBuilder.ts::src/visibility/VGGovernanceStore
src/elements/windows/WindowPlanSymbolBuilder.ts::src/visibility/VGGovernanceStore
src/engine/subsystems/initUI.ts::src/core/presentation/VGSceneApplicator
src/engine/subsystems/initUI.ts::src/core/presentation/VGGovernanceStore
src/engine/subsystems/initTools.ts::src/core/presentation/VGGovernanceStore
src/migration/VGToIntentMigration.ts::src/core/presentation/VGGovernanceStore
src/migration/VGToIntentMigration.ts::src/core/presentation/VGInstanceOverrideStore
src/core/presentation/VGSceneApplicator.ts::src/core/presentation/VGGovernanceStore
src/core/presentation/VGSceneApplicator.ts::src/core/presentation/VGInstanceOverrideStore
src/commands/vg/ApplyVGTemplateToModelCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/vg/ApplyVGTemplateToViewCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/vg/CaptureViewVGAsTemplateCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/vg/CreateVGTemplateCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/vg/SetInstanceVGOverrideCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/vg/SetInstanceVGOverrideCommand.ts::src/core/presentation/VGInstanceOverrideStore
src/commands/vg/SetVGCategoryStyleCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/vg/SetVGViewCategoryStyleCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/vg/UpdateVGTemplateCategoryStyleCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/views/CreateDetailViewCommand.ts::src/core/presentation/VGGovernanceStore
src/commands/views/CreateViewDefinitionCommand.ts::src/core/presentation/VGGovernanceStore
src/elements/annotations/AnnotationRenderLayer.ts::src/core/presentation/VGGovernanceStore
src/export/sheets/DxfExportService.ts::src/core/presentation/VGGovernanceStore
src/export/sheets/SVGCompositeRenderer.ts::src/core/presentation/VGGovernanceStore
src/ai/vg/VGIntentMapper.ts::src/core/presentation/VGGovernanceStore
src/ui/OverridePanel.ts::src/core/presentation/VGInstanceOverrideStore
src/core/persistence/ProjectLoader.ts::src/migration/VGToIntentMigration
EOF

LEGACY_PATTERNS=(
  "src/visibility/VGGovernanceStore"
  "src/core/presentation/VGGovernanceStore"
  "src/core/presentation/VGSceneApplicator"
  "src/core/presentation/VGInstanceOverrideStore"
)

violations=0

for pat in "${LEGACY_PATTERNS[@]}"; do
  # Find every TS file that imports this legacy module (skip the file itself).
  while IFS=: read -r file _line _match; do
    [[ -z "${file:-}" ]] && continue
    # Skip the legacy file importing itself.
    case "$file" in
      "${pat}.ts") continue ;;
    esac
    pair="${file}::${pat}"
    if ! grep -Fxq "$pair" <<<"$ALLOWLIST"; then
      echo "  [25b] $file imports legacy '$pat' (not in allowlist)"
      violations=$((violations + 1))
    fi
  done < <(grep -RnE "from ['\"](\.{1,2}/)+(${pat#src/})['\"]|from ['\"]${pat}['\"]" src --include='*.ts' 2>/dev/null || true)
done

if [ "$violations" -gt 0 ]; then
  echo
  echo "[25b] FAIL — $violations new legacy VG import(s) detected."
  echo "      See docs/00_Contracts/25b-VG-INTENT-FULL-CONSOLIDATION-PLAN.md"
  exit 1
fi

echo "[25b] OK — no new legacy VG imports."
exit 0
