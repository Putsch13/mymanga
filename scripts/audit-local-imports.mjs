#!/usr/bin/env node
/**
 * P00.2 — Audit des imports relatifs (`./` et `../`).
 * Scanne les sources et échoue (exit 1) si une cible n'existe pas.
 *
 * Portée : packages (chaque paquet) src fichiers .ts ; apps/web fichiers .ts et .tsx
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** @param {string} dir */
function walkFiles(dir, acc, filter) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
      walkFiles(p, acc, filter);
    } else if (e.isFile() && filter(p)) {
      acc.push(p);
    }
  }
}

/** @returns {string[]} */
function collectSourceFiles() {
  const files = [];
  const packagesRoot = join(ROOT, "packages");
  if (existsSync(packagesRoot)) {
    for (const name of readdirSync(packagesRoot)) {
      const srcDir = join(packagesRoot, name, "src");
      if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
        walkFiles(srcDir, files, (p) => p.endsWith(".ts") && !p.endsWith(".d.ts"));
      }
    }
  }
  const webRoot = join(ROOT, "apps", "web");
  if (existsSync(webRoot)) {
    walkFiles(webRoot, files, (p) => p.endsWith(".ts") || p.endsWith(".tsx"));
  }
  return files;
}

const REL_IMPORT_RE = new RegExp(
  [
    String.raw`import\s+[\s\S]*?\s+from\s+['"](\.\.?\/[^'"]+)['"]`,
    String.raw`export\s+[\s\S]*?\s+from\s+['"](\.\.?\/[^'"]+)['"]`,
    String.raw`import\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)`,
    String.raw`import\s+['"](\.\.?\/[^'"]+)['"]`,
  ].join("|"),
  "g",
);

/**
 * @param {string} specifier — chemin relatif tel que dans le source
 * @param {string} fromDir — dossier du fichier courant
 */
function resolveLocalImport(specifier, fromDir) {
  const base = normalize(resolve(fromDir, specifier));
  const candidates = [];

  const exts = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
  const hasKnownExt = exts.some((ext) => base.endsWith(ext));

  if (hasKnownExt) {
    candidates.push(base);
    if (base.endsWith(".js")) {
      candidates.push(base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx");
    }
  } else {
    candidates.push(base);
    for (const ext of exts) {
      candidates.push(base + ext);
    }
    for (const ext of [".ts", ".tsx", ".js"]) {
      candidates.push(join(base, "index" + ext));
    }
  }

  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function auditFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const fromDir = dirname(filePath);
  const broken = [];

  let m;
  REL_IMPORT_RE.lastIndex = 0;
  while ((m = REL_IMPORT_RE.exec(content)) !== null) {
    const spec = m.slice(1).find(Boolean);
    if (!spec || !spec.startsWith(".")) continue;
    const resolved = resolveLocalImport(spec, fromDir);
    if (!resolved) {
      broken.push(spec);
    }
  }

  return broken;
}

function main() {
  const files = collectSourceFiles();
  /** @type {Array<{ file: string; spec: string }>} */
  const issues = [];

  for (const file of files) {
    const broken = auditFile(file);
    for (const spec of broken) {
      issues.push({ file, spec });
    }
  }

  if (issues.length === 0) {
    console.log(`audit-local-imports: OK (${files.length} fichiers scannés)`);
    process.exit(0);
  }

  console.error("audit-local-imports: imports relatifs cassés :\n");
  for (const { file, spec } of issues) {
    const relFile = file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
    console.error(`  ${relFile}`);
    console.error(`    → "${spec}" introuvable\n`);
  }
  process.exit(1);
}

main();
