#!/usr/bin/env node
/**
 * P1.1 / P1.2 — Export source-only du monorepo pour audit externe.
 *
 * Produit un fichier `audit-bundle-<ts>.tar.gz` contenant uniquement les
 * sources auditables (apps, packages, docs, manifests racine). Exclut
 * strictement :
 *   - node_modules/
 *   - .next/ .turbo/ .cache/ coverage/ dist/ build/
 *   - .DS_Store / __MACOSX/
 *   - .env (tous variantes) — un audit ne doit JAMAIS voir les secrets
 *
 * Inclut :
 *   - apps/** packages/** docs/**
 *   - package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.base.json
 *   - README.md, .gitignore
 *   - .env.example s'ils existent (aide le reviewer à configurer)
 *
 * Usage :
 *   pnpm audit:bundle
 *   → génère ./audit-bundle-YYYYMMDD-HHMMSS.tar.gz
 *
 * Implémentation : on délègue à `tar` (présent sur macOS + Linux), avec une
 * whitelist explicite de chemins + une liste d'exclusions. Pas de dépendance
 * npm pour rester utilisable dans un CI minimal.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");

const WHITELIST_ENTRIES = [
  "apps",
  "packages",
  "docs",
  "scripts",
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "tsconfig.base.json",
  "tsconfig.json",
  "README.md",
  ".gitignore",
  ".gitattributes",
  ".nvmrc",
  ".node-version",
];

// Patterns tar --exclude : chaque entrée est un glob relatif.
const EXCLUDES = [
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  ".vercel",
  "dist",
  "build",
  "coverage",
  ".DS_Store",
  "__MACOSX",
  "*.log",
  ".env",
  ".env.*",
  "!.env.example",
  "!.env.*.example",
  "*.tar.gz",
  "audit-bundle-*",
  ".git",
  "*.tsbuildinfo",
];

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function filterExistingEntries(entries) {
  return entries.filter((rel) => existsSync(resolve(ROOT, rel)));
}

/** Détecte les fichiers .env "réels" (pas .env.example) pour warn AVANT archivage. */
function scanDangerousEnvFiles(dir, out) {
  if (!existsSync(dir)) return;
  const base = dir.replace(ROOT + "/", "");
  if (base.startsWith("node_modules") || base.startsWith(".git")) return;
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".git" || name === ".next") continue;
      scanDangerousEnvFiles(full, out);
      continue;
    }
    if (name === ".env" || (/^\.env(\.|$)/.test(name) && !/\.example$/.test(name))) {
      out.push(full.replace(ROOT + "/", ""));
    }
  }
}

function main() {
  const outName = `audit-bundle-${timestamp()}.tar.gz`;
  const outPath = resolve(ROOT, outName);

  const dangerous = [];
  scanDangerousEnvFiles(ROOT, dangerous);
  if (dangerous.length > 0) {
    console.warn(
      "[audit-bundle] WARNING — .env files détectés (seront EXCLUS du bundle) :",
    );
    for (const f of dangerous) console.warn(`    ${f}`);
  }

  const entries = filterExistingEntries(WHITELIST_ENTRIES);
  if (entries.length === 0) {
    console.error("[audit-bundle] aucune entrée à archiver — vérifie le cwd");
    process.exit(1);
  }

  const args = [
    "--create",
    "--gzip",
    `--file=${outPath}`,
  ];
  for (const pattern of EXCLUDES) {
    args.push(`--exclude=${pattern}`);
  }
  args.push("--");
  args.push(...entries);

  console.log(`[audit-bundle] creating ${outName} …`);
  console.log(`[audit-bundle]   entries : ${entries.join(", ")}`);
  console.log(`[audit-bundle]   exclude : ${EXCLUDES.join(", ")}`);
  execFileSync("tar", args, { cwd: ROOT, stdio: "inherit" });

  const size = statSync(outPath).size;
  const mb = (size / (1024 * 1024)).toFixed(2);
  console.log(`[audit-bundle] OK ${outName} (${mb} MB)`);
  console.log(
    `[audit-bundle] Rappel : vérifie le contenu avec :  tar -tzf ${outName} | head -50`,
  );
}

main();
