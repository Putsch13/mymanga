#!/usr/bin/env tsx
/**
 * audit-api-routes.ts
 *
 * P1.14 — Script d'audit des routes API.
 *
 * Détecte:
 *   - routes qui écrivent Project
 *   - routes qui écrivent Chapter
 *   - routes qui écrivent SceneImage
 *   - routes qui créent Job
 *   - routes qui lancent Inngest
 *   - routes qui appellent FAL
 *   - routes qui modifient approvedOutline
 *   - routes qui modifient productionPlan
 *
 * Produit: docs/audits/api-routes-inventory.generated.md
 *
 * Usage: pnpm audit:routes
 */

import * as fs from "fs";
import * as path from "path";

interface RouteAuditResult {
  path: string;
  methods: string[];
  writesProject: boolean;
  writesChapter: boolean;
  writesSceneImage: boolean;
  createsJob: boolean;
  lancesInngest: boolean;
  callsFal: boolean;
  modifiesApprovedOutline: boolean;
  modifiesProductionPlan: boolean;
  classification: "canonical" | "legacy" | "debug" | "read-only";
  action: "keep" | "delegate" | "read-only" | "delete" | "audit";
  notes: string[];
}

const API_ROUTES_DIR = path.resolve(__dirname, "../app/api");
const OUTPUT_FILE = path.resolve(__dirname, "../../../docs/audits/api-routes-inventory.generated.md");

const PATTERNS = {
  writesProject: [
    /project\.update/i,
    /project\.create/i,
    /prisma\.project\./i,
  ],
  writesChapter: [
    /chapter\.update/i,
    /chapter\.create/i,
    /chapter\.delete/i,
    /prisma\.chapter\./i,
  ],
  writesSceneImage: [
    /sceneImage\.update/i,
    /sceneImage\.create/i,
    /sceneImage\.delete/i,
    /prisma\.sceneImage\./i,
  ],
  createsJob: [
    /job\.create/i,
    /prisma\.job\.create/i,
  ],
  lancesInngest: [
    /inngest\.send/i,
    /inngest\.run/i,
  ],
  callsFal: [
    /fal\./i,
    /FAL_KEY/i,
    /runRoutedImageGeneration/i,
    /generateImage/i,
  ],
  modifiesApprovedOutline: [
    /approvedOutline/i,
    /approved_outline/i,
  ],
  modifiesProductionPlan: [
    /productionPlan/i,
    /production_plan/i,
  ],
};

const ROUTE_CLASSIFICATIONS: Record<string, { classification: RouteAuditResult["classification"]; action: RouteAuditResult["action"]; notes: string[] }> = {
  "projects/[id]/chapters/[chapterId]/launch": {
    classification: "canonical",
    action: "keep",
    notes: ["Route canonique pour lancer un chapitre premium"],
  },
  "projects/[id]/pipeline": {
    classification: "legacy",
    action: "delegate",
    notes: ["Doit déléguer vers /launch ou devenir read-only/debug"],
  },
  "ai/generate": {
    classification: "legacy",
    action: "audit",
    notes: ["Legacy/dev only, interdit en premium chapter"],
  },
  "estimate-image": {
    classification: "debug",
    action: "audit",
    notes: ["Dev/tooling only, interdit en premium chapter"],
  },
  "jobs/[jobId]/run-now": {
    classification: "canonical",
    action: "audit",
    notes: ["Doit utiliser exactement les mêmes guards que launch"],
  },
  "scene-images/[sceneImageId]/retry": {
    classification: "canonical",
    action: "audit",
    notes: ["Autorisé seulement avec PanelGenerationContract"],
  },
  "scene-images/[sceneImageId]/validate": {
    classification: "canonical",
    action: "audit",
    notes: ["Ne doit pas masquer un contrat cassé"],
  },
};

function findRouteFiles(dir: string, basePath = ""): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath, relativePath));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      files.push(relativePath);
    }
  }
  
  return files;
}

function analyzeRoute(routePath: string, content: string): RouteAuditResult {
  const routeDir = path.dirname(routePath).replace(/\\/g, "/");
  
  const methods: string[] = [];
  if (/export\s+(async\s+)?function\s+GET/i.test(content)) methods.push("GET");
  if (/export\s+(async\s+)?function\s+POST/i.test(content)) methods.push("POST");
  if (/export\s+(async\s+)?function\s+PUT/i.test(content)) methods.push("PUT");
  if (/export\s+(async\s+)?function\s+PATCH/i.test(content)) methods.push("PATCH");
  if (/export\s+(async\s+)?function\s+DELETE/i.test(content)) methods.push("DELETE");

  const checkPatterns = (patterns: RegExp[]): boolean => {
    return patterns.some(p => p.test(content));
  };

  const classification = ROUTE_CLASSIFICATIONS[routeDir];
  
  return {
    path: `/api/${routeDir}`,
    methods,
    writesProject: checkPatterns(PATTERNS.writesProject),
    writesChapter: checkPatterns(PATTERNS.writesChapter),
    writesSceneImage: checkPatterns(PATTERNS.writesSceneImage),
    createsJob: checkPatterns(PATTERNS.createsJob),
    lancesInngest: checkPatterns(PATTERNS.lancesInngest),
    callsFal: checkPatterns(PATTERNS.callsFal),
    modifiesApprovedOutline: checkPatterns(PATTERNS.modifiesApprovedOutline),
    modifiesProductionPlan: checkPatterns(PATTERNS.modifiesProductionPlan),
    classification: classification?.classification ?? "audit",
    action: classification?.action ?? "audit",
    notes: classification?.notes ?? [],
  };
}

function generateMarkdown(results: RouteAuditResult[]): string {
  const lines: string[] = [
    "# API Routes Inventory (Generated)",
    "",
    "> Auto-généré par `pnpm audit:routes`",
    "> Ne pas modifier manuellement.",
    "",
    `> Généré le: ${new Date().toISOString()}`,
    "",
    "## Résumé",
    "",
    `- Total routes: ${results.length}`,
    `- Routes qui écrivent Chapter: ${results.filter(r => r.writesChapter).length}`,
    `- Routes qui écrivent SceneImage: ${results.filter(r => r.writesSceneImage).length}`,
    `- Routes qui créent Job: ${results.filter(r => r.createsJob).length}`,
    `- Routes qui lancent Inngest: ${results.filter(r => r.lancesInngest).length}`,
    `- Routes qui appellent FAL: ${results.filter(r => r.callsFal).length}`,
    `- Routes qui modifient approvedOutline: ${results.filter(r => r.modifiesApprovedOutline).length}`,
    `- Routes qui modifient productionPlan: ${results.filter(r => r.modifiesProductionPlan).length}`,
    "",
    "## Routes à risque",
    "",
    "| Route | Methods | Writes Chapter | Writes SceneImage | Creates Job | FAL | Action |",
    "|-------|---------|----------------|-------------------|-------------|-----|--------|",
  ];

  const riskyRoutes = results.filter(r => 
    r.writesChapter || r.writesSceneImage || r.createsJob || r.callsFal
  );

  for (const r of riskyRoutes) {
    lines.push(
      `| \`${r.path}\` | ${r.methods.join(", ")} | ${r.writesChapter ? "✅" : "❌"} | ${r.writesSceneImage ? "✅" : "❌"} | ${r.createsJob ? "✅" : "❌"} | ${r.callsFal ? "✅" : "❌"} | **${r.action}** |`
    );
  }

  lines.push("");
  lines.push("## Détail par route");
  lines.push("");

  for (const r of results) {
    lines.push(`### \`${r.path}\``);
    lines.push("");
    lines.push(`- **Methods**: ${r.methods.join(", ") || "none"}`);
    lines.push(`- **Classification**: ${r.classification}`);
    lines.push(`- **Action recommandée**: ${r.action}`);
    lines.push("");
    lines.push("| Check | Status |");
    lines.push("|-------|--------|");
    lines.push(`| Writes Project | ${r.writesProject ? "⚠️ Oui" : "Non"} |`);
    lines.push(`| Writes Chapter | ${r.writesChapter ? "⚠️ Oui" : "Non"} |`);
    lines.push(`| Writes SceneImage | ${r.writesSceneImage ? "⚠️ Oui" : "Non"} |`);
    lines.push(`| Creates Job | ${r.createsJob ? "⚠️ Oui" : "Non"} |`);
    lines.push(`| Lances Inngest | ${r.lancesInngest ? "⚠️ Oui" : "Non"} |`);
    lines.push(`| Calls FAL | ${r.callsFal ? "⚠️ Oui" : "Non"} |`);
    lines.push(`| Modifies approvedOutline | ${r.modifiesApprovedOutline ? "⚠️ Oui" : "Non"} |`);
    lines.push(`| Modifies productionPlan | ${r.modifiesProductionPlan ? "⚠️ Oui" : "Non"} |`);
    lines.push("");
    if (r.notes.length > 0) {
      lines.push("**Notes:**");
      for (const note of r.notes) {
        lines.push(`- ${note}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function main() {
  console.log("🔍 Scanning API routes...");
  
  const routeFiles = findRouteFiles(API_ROUTES_DIR);
  console.log(`Found ${routeFiles.length} route files`);
  
  const results: RouteAuditResult[] = [];
  
  for (const routeFile of routeFiles) {
    const fullPath = path.join(API_ROUTES_DIR, routeFile);
    const content = fs.readFileSync(fullPath, "utf-8");
    const result = analyzeRoute(routeFile, content);
    results.push(result);
  }
  
  const markdown = generateMarkdown(results);
  
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, markdown);
  console.log(`✅ Generated: ${OUTPUT_FILE}`);
  
  const riskyCount = results.filter(r => 
    r.writesChapter || r.writesSceneImage || r.createsJob
  ).length;
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total routes: ${results.length}`);
  console.log(`   Risky routes: ${riskyCount}`);
  
  if (riskyCount > 0) {
    console.log(`\n⚠️  ${riskyCount} routes write to critical tables. Review recommended.`);
  }
}

main().catch(console.error);
