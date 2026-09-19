import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TOOL_DIR, '../..');

const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');

const fileCache = new Map();

function scriptKindFor(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseFile(absPath) {
  const stat = fs.statSync(absPath);
  const cached = fileCache.get(absPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached;
  const text = fs.readFileSync(absPath, 'utf8');
  const sf = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(absPath),
  );
  const entry = { mtimeMs: stat.mtimeMs, text, sf };
  fileCache.set(absPath, entry);
  return entry;
}

function identName(node) {
  if (!node) return '';
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)) {
    return String(node.text);
  }
  if (ts.isComputedPropertyName(node)) return identName(node.expression);
  return '';
}

function hasExport(node) {
  return Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function sliceNode(sf, node) {
  const start = node.getStart(sf);
  const full = node.getFullStart();
  let from = full;
  const lead = sf.text.slice(full, start);
  if (!lead.trim()) from = start;
  return sf.text.slice(from, node.getEnd()).replace(/\s+$/, '');
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function findTopBinding(sf, name) {
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && identName(stmt.name) === name) {
      return { node: stmt, exported: hasExport(stmt) };
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (identName(decl.name) === name) {
          return { node: stmt, exported: hasExport(stmt), decl };
        }
      }
    }
  }
  return null;
}

function findObjectLiteral(sf, objectName) {
  const binding = findTopBinding(sf, objectName);
  if (!binding?.decl?.initializer) return null;
  const init = binding.decl.initializer;
  if (!ts.isObjectLiteralExpression(init)) return null;
  return { object: init, exported: binding.exported, stmt: binding.node };
}

function findMethod(sf, objectName, methodName) {
  const obj = findObjectLiteral(sf, objectName);
  if (!obj) return { missing: 'object' };
  for (const prop of obj.object.properties) {
    const n = identName(prop.name);
    if (n === methodName) return { node: prop, exported: obj.exported };
  }
  return { missing: 'method' };
}

function symbolLabel(entry) {
  if (entry.kind === 'file') return entry.name || entry.file;
  if (entry.kind === 'method') return `${entry.object}.${entry.name}`;
  return entry.name;
}

export function loadRegistry(registryPath = path.join(TOOL_DIR, 'registry.json')) {
  const raw = fs.readFileSync(registryPath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.groups) || !Array.isArray(data.entries)) {
    throw new Error('registry.json 需要 groups 和 entries 两个数组');
  }
  return data;
}

function fail(entry, message) {
  return {
    id: entry.id,
    group: entry.group,
    title: entry.title,
    blurb: entry.blurb,
    file: entry.file,
    kind: entry.kind,
    name: entry.name,
    object: entry.object || '',
    symbol: symbolLabel(entry),
    exported: false,
    line: null,
    ok: false,
    error: message,
    source: '',
  };
}

export function extractEntry(entry) {
  if (!entry?.id || !entry.file || !entry.kind) {
    return fail(entry || {}, 'registry 缺 id / file / kind');
  }
  if (entry.kind !== 'file' && !entry.name) {
    return fail(entry, 'registry 缺 name');
  }
  if (entry.kind === 'method' && !entry.object) {
    return fail(entry, `method 必须带 object（${entry.name}）`);
  }

  const abs = path.resolve(ROOT, entry.file);
  const root = path.resolve(ROOT);
  const absNorm = abs.toLowerCase();
  const rootNorm = root.toLowerCase();
  if (absNorm !== rootNorm && !absNorm.startsWith(rootNorm + path.sep.toLowerCase())) {
    return fail(entry, `文件路径逃出项目根：${entry.file}`);
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return fail(entry, `找不到文件 ${entry.file}`);
  }

  if (entry.kind === 'file') {
    const text = fs.readFileSync(abs, 'utf8');
    return {
      id: entry.id,
      group: entry.group,
      title: entry.title,
      blurb: entry.blurb,
      file: entry.file,
      kind: entry.kind,
      name: entry.name || path.basename(entry.file),
      object: '',
      symbol: symbolLabel(entry),
      exported: false,
      line: 1,
      ok: true,
      error: '',
      source: text,
    };
  }

  const { sf } = parseFile(abs);

  if (entry.kind === 'method') {
    const found = findMethod(sf, entry.object, entry.name);
    if (found.missing === 'object') {
      return fail(entry, `找不到对象 ${entry.object}（${entry.file}）`);
    }
    if (found.missing === 'method' || !found.node) {
      return fail(entry, `找不到方法 ${entry.object}.${entry.name}（${entry.file}）`);
    }
    return {
      id: entry.id,
      group: entry.group,
      title: entry.title,
      blurb: entry.blurb,
      file: entry.file,
      kind: entry.kind,
      name: entry.name,
      object: entry.object,
      symbol: symbolLabel(entry),
      exported: Boolean(found.exported),
      line: lineOf(sf, found.node),
      ok: true,
      error: '',
      source: sliceNode(sf, found.node),
    };
  }

  const found = findTopBinding(sf, entry.name);
  if (!found) {
    return fail(entry, `找不到符号 ${entry.name}（${entry.file}）`);
  }
  return {
    id: entry.id,
    group: entry.group,
    title: entry.title,
    blurb: entry.blurb,
    file: entry.file,
    kind: entry.kind,
    name: entry.name,
    object: entry.object || '',
    symbol: symbolLabel(entry),
    exported: Boolean(found.exported),
    line: lineOf(sf, found.node),
    ok: true,
    error: '',
    source: sliceNode(sf, found.node),
  };
}

export function buildCatalog(registry) {
  const byGroup = new Map(registry.groups.map((g) => [g.id, { ...g, entries: [] }]));
  const unknown = [];
  for (const entry of registry.entries) {
    const extracted = extractEntry(entry);
    const meta = {
      id: extracted.id,
      title: extracted.title,
      blurb: extracted.blurb,
      file: extracted.file,
      kind: extracted.kind,
      name: extracted.name,
      object: extracted.object,
      symbol: extracted.symbol,
      exported: extracted.exported,
      line: extracted.line,
      ok: extracted.ok,
      error: extracted.error,
    };
    const group = byGroup.get(entry.group);
    if (!group) {
      unknown.push(meta);
      continue;
    }
    group.entries.push(meta);
  }
  return {
    groups: registry.groups.map((g) => byGroup.get(g.id)),
    unknown,
  };
}

function isMain() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return path.resolve(arg) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  const registry = loadRegistry();
  const catalog = buildCatalog(registry);
  let ok = 0;
  let bad = 0;
  for (const group of catalog.groups) {
    for (const e of group.entries) {
      if (e.ok) {
        ok += 1;
        console.log(`OK  ${e.symbol}  ${e.file}:${e.line}`);
      } else {
        bad += 1;
        console.log(`ERR ${e.symbol}  ${e.error}`);
      }
    }
  }
  for (const e of catalog.unknown) {
    bad += 1;
    console.log(`ERR ${e.id}  未知分组`);
  }
  console.log(`\n${ok} ok / ${bad} err`);
  if (bad) process.exit(1);
}
