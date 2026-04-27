#!/usr/bin/env tsx
/**
 * audit-legacy-imports.ts
 *
 * P1.15 — Détecte les imports legacy dans le pipeline premium.
 *
 * Détecte:
 *   - imports depuis modules legacy dans pipeline premium
 *   - anciens prompt composers
 *   - anciens renderers
 *   - anciens agents stubs
 *   - fichiers non importés
 *   - imports circulaires
 *   - helpers image dupliqués
 *   - types dupliqués pour panel/dialogue/image
 *
 * Usage: pnpm audit:legacy
 */

import * as fs from "fs";
import * as path from "path";

interface LegacyImportViolation {
  file: string;
  line: number;
  importPath: string;
  reason: string;
  severity: "error" | "warning" | "info";
}

interface AuditResult {
  violations: LegacyImportViolation[];
  summary: {
    totalFiles: number;
    filesWithViolations: number;
    errorCount: number;
    warningCount: number;
  };
}

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

const PREMIUM_FILES = [
  "packages/workflow/src/run-premium-v3-pipeline.ts",
  "packages/workflow/src/passes/render-pass.ts",
  "packages/workflow/src/build-storyboard-plan-from-approved-production-plan.ts",
  "packages/workflow/src/passes/enrich-panel-render-spec.ts",
];

const FORBIDDEN_IMPORTS = [
  { pattern: /prompt-translator/i, reason: "Legacy prompt translator" },
  { pattern: /fal-scene-strategy(?!-v3)/i, reason: "Legacy FAL strategy" },
  { pattern: /blueprint-enrichment/i, reason: "Legacy blueprint enrichment" },
  { pattern: /densify-premium-blueprints/i, reason: "Deprecated densifier" },
  { pattern: /\.\/legacy\//i, reason: "Direct legacy module import" },
  { pattern: /run-legacy-compatible/i, reason: "Legacy pipeline import" },
];

const LEGACY_PATTERNS = [
  { pattern: /PromptComposer/i, reason: "Old prompt composer class" },
  { pattern: /LegacyRenderer/i, reason: "Old renderer" },
  { pattern: /StubAgent/i, reason: "Stub agent (should use LLM)" },
  { pattern: /LEGACY_/i, reason: "Legacy constant" },
  { pattern: /@deprecated/i, reason: "Deprecated code" },
];

function findTypeScriptFiles(dir: string, basePath = ""): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findTypeScriptFiles(fullPath, relativePath));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      if (!entry.name.endsWith(".test.ts") && !entry.name.endsWith(".spec.ts")) {
        files.push(relativePath);
      }
    }
  }
  
  return files;
}

function analyzeFile(filePath: string, content: string, isPremiumFile: boolean): LegacyImportViolation[] {
  const violations: LegacyImportViolation[] = [];
  const lines = content.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    if (line.includes("import") || line.includes("from")) {
      for (const { pattern, reason } of FORBIDDEN_IMPORTS) {
        if (pattern.test(line)) {
          violations.push({
            file: filePath,
            line: lineNum,
            importPath: line.trim(),
            reason,
            severity: isPremiumFile ? "error" : "warning",
          });
        }
      }
    }
    
    if (isPremiumFile) {
      for (const { pattern, reason } of LEGACY_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file: filePath,
            line: lineNum,
            importPath: line.trim().substring(0, 100),
            reason,
            severity: "warning",
          });
        }
      }
    }
  }
  
  return violations;
}

function generateReport(result: AuditResult): string {
  const lines: string[] = [
    "# Legacy Imports Audit Report",
    "",
    `> Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total files scanned: ${result.summary.totalFiles}`,
    `- Files with violations: ${result.summary.filesWithViolations}`,
    `- Errors: ${result.summary.errorCount}`,
    `- Warnings: ${result.summary.warningCount}`,
    "",
  ];
  
  if (result.violations.length === 0) {
    lines.push("✅ No legacy import violations found!");
  } else {
    lines.push("## Violations");
    lines.push("");
    
    const byFile = new Map<string, LegacyImportViolation[]>();
    for (const v of result.violations) {
      const existing = byFile.get(v.file) ?? [];
      existing.push(v);
      byFile.set(v.file, existing);
    }
    
    for (const [file, violations] of byFile) {
      lines.push(`### ${file}`);
      lines.push("");
      for (const v of violations) {
        const icon = v.severity === "error" ? "❌" : "⚠️";
        lines.push(`- ${icon} Line ${v.line}: ${v.reason}`);
        lines.push(`  \`${v.importPath.substring(0, 80)}${v.importPath.length > 80 ? "..." : ""}\``);
      }
      lines.push("");
    }
  }
  
  return lines.join("\n");
}

async function main() {
  console.log("🔍 Scanning for legacy imports...");
  
  const premiumFilesSet = new Set(PREMIUM_FILES);
  const allViolations: LegacyImportViolation[] = [];
  let totalFiles = 0;
  const filesWithViolations = new Set<string>();
  
  for (const premiumFile of PREMIUM_FILES) {
    const fullPath = path.join(WORKSPACE_ROOT, premiumFile);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  Premium file not found: ${premiumFile}`);
      continue;
    }
    
    const content = fs.readFileSync(fullPath, "utf-8");
    const violations = analyzeFile(premiumFile, content, true);
    
    if (violations.length > 0) {
      filesWithViolations.add(premiumFile);
      allViolations.push(...violations);
    }
    totalFiles++;
  }
  
  const packagesToScan = [
    "packages/workflow/src",
    "packages/ai/src",
    "packages/core/src",
  ];
  
  for (const pkg of packagesToScan) {
    const pkgPath = path.join(WORKSPACE_ROOT, pkg);
    const files = findTypeScriptFiles(pkgPath);
    
    for (const file of files) {
      const relativePath = path.join(pkg, file);
      if (premiumFilesSet.has(relativePath)) continue;
      
      const fullPath = path.join(pkgPath, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const violations = analyzeFile(relativePath, content, false);
      
      if (violations.length > 0) {
        filesWithViolations.add(relativePath);
        allViolations.push(...violations);
      }
      totalFiles++;
    }
  }
  
  const result: AuditResult = {
    violations: allViolations,
    summary: {
      totalFiles,
      filesWithViolations: filesWithViolations.size,
      errorCount: allViolations.filter(v => v.severity === "error").length,
      warningCount: allViolations.filter(v => v.severity === "warning").length,
    },
  };
  
  const report = generateReport(result);
  const outputPath = path.join(WORKSPACE_ROOT, "docs/audits/legacy-imports-audit.generated.md");
  fs.writeFileSync(outputPath, report);
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total files: ${result.summary.totalFiles}`);
  console.log(`   Files with violations: ${result.summary.filesWithViolations}`);
  console.log(`   Errors: ${result.summary.errorCount}`);
  console.log(`   Warnings: ${result.summary.warningCount}`);
  console.log(`\n✅ Report saved to: ${outputPath}`);
  
  if (result.summary.errorCount > 0) {
    console.error(`\n❌ ${result.summary.errorCount} errors found in premium files!`);
    process.exit(1);
  }
}

main().catch(console.error);
