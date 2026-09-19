import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, loadRegistry, buildCatalog, extractEntry } from './scan.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(TOOL_DIR, 'public');
const PORT = Number(process.env.PROMPT_BROWSER_PORT || 3780);

const PUBLIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
};

function sendBytes(res, status, contentType, buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(String(buf ?? ''), 'utf8');
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

function sendJson(res, status, value) {
  const text = JSON.stringify(value);
  sendBytes(res, status, 'application/json; charset=utf-8', Buffer.from(text, 'utf8'));
}

function isInsideRoot(absPath) {
  const root = path.resolve(ROOT).toLowerCase();
  const abs = path.resolve(absPath).toLowerCase();
  return abs === root || abs.startsWith(root + path.sep.toLowerCase());
}

function readPublic(name) {
  const abs = path.join(PUBLIC_DIR, name);
  if (!isInsideRoot(abs) || !abs.toLowerCase().startsWith(PUBLIC_DIR.toLowerCase())) {
    return null;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return fs.readFileSync(abs);
}

function catalogPayload() {
  const registry = loadRegistry();
  return buildCatalog(registry);
}

function entryPayload(id) {
  const registry = loadRegistry();
  const spec = registry.entries.find((e) => e.id === id);
  if (!spec) return null;
  const extracted = extractEntry(spec);
  return {
    id: extracted.id,
    group: extracted.group,
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
    source: extracted.source,
  };
}

function handleRaw(url, res) {
  const file = url.searchParams.get('file') || '';
  if (!file || file.includes('\0')) {
    sendBytes(res, 400, 'text/plain; charset=utf-8', Buffer.from('缺 file', 'utf8'));
    return;
  }
  const abs = path.resolve(ROOT, file);
  if (!isInsideRoot(abs)) {
    sendBytes(res, 403, 'text/plain; charset=utf-8', Buffer.from('路径不允许', 'utf8'));
    return;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    sendBytes(res, 404, 'text/plain; charset=utf-8', Buffer.from('找不到文件', 'utf8'));
    return;
  }
  sendBytes(res, 200, 'text/plain; charset=utf-8', fs.readFileSync(abs));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (req.method !== 'GET') {
    sendBytes(res, 405, 'text/plain; charset=utf-8', Buffer.from('只用 GET', 'utf8'));
    return;
  }

  const pub = PUBLIC_FILES[url.pathname];
  if (pub) {
    const buf = readPublic(pub.file);
    if (!buf) {
      sendBytes(res, 404, 'text/plain; charset=utf-8', Buffer.from('缺静态文件', 'utf8'));
      return;
    }
    sendBytes(res, 200, pub.type, buf);
    return;
  }

  if (url.pathname === '/api/catalog') {
    try {
      sendJson(res, 200, catalogPayload());
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) });
    }
    return;
  }

  const entryMatch = url.pathname.match(/^\/api\/entry\/([^/]+)$/);
  if (entryMatch) {
    try {
      const payload = entryPayload(decodeURIComponent(entryMatch[1]));
      if (!payload) {
        sendJson(res, 404, { error: '名单里没有这一条' });
        return;
      }
      sendJson(res, 200, payload);
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) });
    }
    return;
  }

  if (url.pathname === '/raw') {
    handleRaw(url, res);
    return;
  }

  sendBytes(res, 404, 'text/plain; charset=utf-8', Buffer.from('没有这个地址', 'utf8'));
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`提示词看板  ${url}`);
  console.log('关掉这个黑窗口，看板就关了。不要动别的窗口。');
  if (process.env.PROMPT_BROWSER_OPEN === '1') {
    spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  }
});
