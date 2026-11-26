#!/usr/bin/env node
/**
 * Contrôle de sécurité des dépendances de PRODUCTION (remplace `npm audit --audit-level=high`).
 *
 * Bloque toute vulnérabilité « high » ou « critical », SAUF celles listées
 * nommément dans security/audit-allowlist.json (identifiant GHSA + paquet + projet),
 * et seulement jusqu'à leur date d'expiration. Une exception expirée bloque à nouveau.
 * Aucune autre alerte n'est masquée : les niveaux inférieurs sont affichés pour suivi.
 *
 * Usage : node scripts/audit-gate.mjs <dossier du projet>   (ex. backend)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = resolve(process.argv[2] ?? '.');
const project = basename(projectDir);
const today = new Date().toISOString().slice(0, 10);
const BLOCKING = new Set(['high', 'critical']);

const { exceptions = [] } = JSON.parse(readFileSync(join(repoRoot, 'security', 'audit-allowlist.json'), 'utf8'));

const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 64 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(`[audit-gate] ${project} : rapport npm audit illisible (réseau ?). Contrôle en ÉCHEC par sécurité.`);
  console.error((run.stderr ?? '').slice(0, 2000));
  process.exit(2);
}
if (report.error) {
  console.error(`[audit-gate] ${project} : npm audit en erreur (${report.error.code ?? 'inconnue'}). Contrôle en ÉCHEC par sécurité.`);
  process.exit(2);
}

// Une ligne par alerte réelle (paquet + identifiant GHSA), sans doublon.
const findings = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !via) continue;
    const id = String(via.url ?? '').split('/').pop() || String(via.source);
    const name = via.name ?? pkg;
    findings.set(`${name}|${id}`, { name, id, severity: via.severity, title: via.title, range: via.range });
  }
}

let blocking = 0;
const usedExceptions = new Set();
for (const f of [...findings.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const label = `${f.severity.toUpperCase()} ${f.name} ${f.id} (${f.range}) — ${f.title}`;
  if (!BLOCKING.has(f.severity)) {
    console.log(`  info      ${label}`);
    continue;
  }
  const exception = exceptions.find((e) => e.id === f.id && e.package === f.name && (e.projects ?? []).includes(project));
  if (!exception) {
    console.log(`  BLOQUANT  ${label}`);
    blocking += 1;
    continue;
  }
  usedExceptions.add(exception.id);
  if (exception.expires < today) {
    console.log(`  BLOQUANT  ${label} — exception EXPIRÉE le ${exception.expires} (voir ${exception.task})`);
    blocking += 1;
    continue;
  }
  console.log(`  toléré    ${label} — exception documentée jusqu'au ${exception.expires} (${exception.task})`);
}

for (const e of exceptions) {
  if ((e.projects ?? []).includes(project) && !usedExceptions.has(e.id)) {
    console.log(`  à retirer exception ${e.id} (${e.package}) : alerte absente de ${project}, supprimez l'exception.`);
  }
}

if (blocking > 0) {
  console.error(`[audit-gate] ${project} : ${blocking} vulnérabilité(s) high/critical non couverte(s). ÉCHEC.`);
  process.exit(1);
}
console.log(`[audit-gate] ${project} : aucune vulnérabilité high/critical hors exception documentée. OK.`);
