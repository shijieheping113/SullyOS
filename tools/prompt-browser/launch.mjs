import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = Number(process.env.PROMPT_BROWSER_PORT || 3780);
const URL = `http://127.0.0.1:${PORT}/`;
const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));

function portOpen() {
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port: PORT });
    sock.once('connect', () => {
      sock.end();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
  });
}

function openBrowser() {
  spawn('cmd', ['/c', 'start', '', URL], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

if (await portOpen()) {
  console.log('');
  console.log('看板已经开着，正在打开网页。');
  console.log('要关掉看板：找到刚才那个黑窗口（标题里有 Prompt Board），把它关掉。');
  console.log('');
  openBrowser();
  await new Promise((r) => setTimeout(r, 2500));
  process.exit(0);
}

console.log('');
console.log('正在打开提示词看板……');
console.log('浏览器马上会自己跳出来。');
console.log('');
console.log('这个黑窗口请留着。关掉它，看板就关了。');
console.log('');

process.env.PROMPT_BROWSER_OPEN = '1';
await import(pathToFileURL(path.join(TOOL_DIR, 'server.mjs')).href);
