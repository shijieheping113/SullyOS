const $groups = document.getElementById('groups');
const $titles = document.getElementById('titles');
const $groupTitle = document.getElementById('group-title');
const $detail = document.getElementById('detail');
const $q = document.getElementById('q');
const $pickedCount = document.getElementById('picked-count');
const $copyPack = document.getElementById('copy-pack');
const $clearPicked = document.getElementById('clear-picked');

const STORE_KEY = 'sully-prompt-board-v1';

let catalog = { groups: [] };
let groupId = '';
let entryId = '';
let current = null;
const sourceCache = new Map();
let picked = new Set();
let notes = {};

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    picked = new Set(Array.isArray(raw.picked) ? raw.picked : []);
    notes = raw.notes && typeof raw.notes === 'object' ? raw.notes : {};
  } catch {
    picked = new Set();
    notes = {};
  }
}

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    picked: [...picked],
    notes,
  }));
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileLabel(entry) {
  if (!entry?.file) return '';
  return entry.line ? `${entry.file}:${entry.line}` : entry.file;
}

function findMeta(id) {
  for (const g of catalog.groups || []) {
    const hit = (g.entries || []).find((e) => e.id === id);
    if (hit) return hit;
  }
  return null;
}

function formatOne(entry, note, index) {
  const file = fileLabel(entry);
  const body = entry.ok ? (entry.source || '') : (entry.error || '找不到这条提示词');
  const want = String(note || '').trim() || '（这条还没写意见，先看原文。）';
  const lines = [];
  if (index != null) lines.push(`【第 ${index} 条】`);
  lines.push(
    `【功能】${entry.title || ''}`,
    `【这是干什么的】${entry.blurb || ''}`,
    `【文件】${file}`,
    `【符号】${entry.symbol || entry.name || ''}`,
    '【现在的提示词】',
    body,
    '【意见/要怎么改】',
    want,
  );
  return lines.join('\n');
}

function packText(items) {
  const blocks = items.map((item, i) => formatOne(item.entry, item.note, items.length > 1 ? i + 1 : null));
  return [
    '请按下面清单改 SullyOS 的提示词。',
    '只改列出的符号，不要改没点名的文件。',
    '不要改业务功能，只改提示词正文。',
    '改完用人话说明改了哪几条。',
    '',
    '————————',
    '',
    blocks.join('\n\n————————\n\n'),
  ].join('\n');
}

function visibleEntries(group) {
  const q = ($q.value || '').trim().toLowerCase();
  const list = group?.entries || [];
  if (!q) return list;
  return list.filter((e) => {
    const hay = `${e.title} ${e.blurb} ${e.symbol} ${e.file}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderPicked() {
  const n = picked.size;
  $pickedCount.textContent = n ? `已勾 ${n} 条` : '还没勾';
}

function renderGroups() {
  $groups.innerHTML = catalog.groups.map((g) => {
    const bad = (g.entries || []).some((e) => !e.ok);
    const n = (g.entries || []).filter((e) => picked.has(e.id)).length;
    const cls = ['group-btn', g.id === groupId ? 'active' : '', bad ? 'bad' : ''].filter(Boolean).join(' ');
    const mark = n ? ` ·${n}` : '';
    return `<button type="button" class="${cls}" data-group="${esc(g.id)}">${esc(g.title)}${mark}</button>`;
  }).join('');
}

function renderTitles() {
  const group = catalog.groups.find((g) => g.id === groupId);
  $groupTitle.textContent = group ? group.title : '选择左侧 App';
  const list = visibleEntries(group);
  if (!list.length) {
    $titles.innerHTML = '<li class="empty">这一组没有匹配的条目。</li>';
    return;
  }
  $titles.innerHTML = list.map((e) => {
    const cls = ['title-row', e.id === entryId ? 'active' : '', e.ok ? '' : 'bad'].filter(Boolean).join(' ');
    const checked = picked.has(e.id) ? 'checked' : '';
    const noted = String(notes[e.id] || '').trim() ? ' ·已写意见' : '';
    return `<li class="${cls}">
      <input type="checkbox" data-pick="${esc(e.id)}" ${checked} aria-label="勾选 ${esc(e.title)}" />
      <button type="button" class="title-btn" data-id="${esc(e.id)}">
        <span class="name">${esc(e.title)}${e.ok ? '' : ' · 找不到'}${noted}</span>
        <span class="blurb">${esc(e.blurb)}</span>
      </button>
    </li>`;
  }).join('');
}

function renderDetail(entry) {
  if (!entry) {
    $detail.innerHTML = '<p class="empty">从中间点一条。勾选后，在右边写下「要怎么改」。</p>';
    return;
  }
  const loc = fileLabel(entry);
  const exportTag = entry.ok
    ? (entry.kind === 'file'
      ? '<span class="tag">整份文件</span>'
      : (entry.exported ? '<span class="tag">export</span>' : '<span class="tag">文件内</span>'))
    : '<span class="tag err">未找到</span>';
  const err = entry.ok ? '' : `<p class="errbox">${esc(entry.error)}</p>`;
  const source = entry.ok
    ? `<pre class="source">${esc(entry.source)}</pre>`
    : '<p class="empty">没有正文可显示。不许拿邻近代码顶上，所以这里空着。</p>';
  const note = notes[entry.id] || '';
  $detail.innerHTML = `
    <h1>${esc(entry.title)}</h1>
    <p class="lead">${esc(entry.blurb)}</p>
    <div class="meta">
      ${exportTag}
      <span>符号 <code>${esc(entry.symbol)}</code></span>
      <span>文件 <code>${esc(loc)}</code></span>
    </div>
    <div class="note-box">
      <label for="note">这条想怎么改（用人话写）</label>
      <textarea id="note" placeholder="例如：太硬了，改软一点；不要提深夜；把第一段删掉……">${esc(note)}</textarea>
      <p class="hint">勾上左边方框，写完意见，点右上角「复制给 AI 去改」。可以一次勾好几条。</p>
    </div>
    <div class="actions">
      <button type="button" class="copy" id="copy-one">只复制这一条</button>
      ${entry.file ? `<a class="raw" href="/raw?file=${encodeURIComponent(entry.file)}" target="_blank" rel="noopener">打开源文件</a>` : ''}
    </div>
    ${err}
    ${source}
  `;
  const $note = document.getElementById('note');
  $note?.addEventListener('input', () => {
    notes[entry.id] = $note.value;
    saveStore();
    renderTitles();
    renderGroups();
  });
  document.getElementById('copy-one')?.addEventListener('click', async (ev) => {
    const ok = await copyNow(packText([{ entry, note: notes[entry.id] || '' }]));
    flash(ev.currentTarget, ok);
  });
}

async function selectEntry(id) {
  entryId = id;
  renderTitles();
  $detail.innerHTML = '<p class="empty">正在读取全文…</p>';
  if (sourceCache.has(id)) {
    current = sourceCache.get(id);
    renderDetail(current);
    return;
  }
  const res = await fetch(`/api/entry/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) {
    current = { id, title: id, blurb: '', ok: false, error: data.error || '读取失败', source: '' };
  } else {
    current = data;
    sourceCache.set(id, data);
  }
  renderDetail(current);
}

function selectGroup(id) {
  groupId = id;
  const group = catalog.groups.find((g) => g.id === id);
  const list = visibleEntries(group);
  renderGroups();
  renderTitles();
  if (list.length) selectEntry(list[0].id);
  else {
    entryId = '';
    current = null;
    renderDetail(null);
  }
}

function togglePick(id, on) {
  if (on) picked.add(id);
  else picked.delete(id);
  saveStore();
  renderPicked();
  renderGroups();
}

async function loadEntry(id) {
  if (sourceCache.has(id)) return sourceCache.get(id);
  const res = await fetch(`/api/entry/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) {
    const meta = findMeta(id) || { id, title: id };
    return { ...meta, ok: false, error: data.error || '读取失败', source: '' };
  }
  sourceCache.set(id, data);
  return data;
}

async function copyPack() {
  const ids = picked.size ? [...picked] : (entryId ? [entryId] : []);
  if (!ids.length) {
    flash($copyPack, false, '先勾一条');
    return;
  }
  const items = [];
  for (const id of ids) {
    const entry = await loadEntry(id);
    items.push({ entry, note: notes[id] || '' });
  }
  const ok = await copyNow(packText(items));
  flash($copyPack, ok, ok ? `已复制 ${items.length} 条` : '复制失败');
}

async function copyNow(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function flash(btn, ok, label) {
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = label || (ok ? '已复制' : '复制失败');
  btn.classList.toggle('done', ok);
  setTimeout(() => {
    btn.textContent = old;
    btn.classList.remove('done');
  }, 1400);
}

$groups.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-group]');
  if (btn) selectGroup(btn.dataset.group);
});

$titles.addEventListener('click', (ev) => {
  const box = ev.target.closest('[data-pick]');
  if (box) {
    togglePick(box.dataset.pick, box.checked);
    return;
  }
  const btn = ev.target.closest('[data-id]');
  if (btn) selectEntry(btn.dataset.id);
});

$titles.addEventListener('change', (ev) => {
  const box = ev.target.closest('[data-pick]');
  if (box) togglePick(box.dataset.pick, box.checked);
});

$q.addEventListener('input', () => renderTitles());
$copyPack.addEventListener('click', copyPack);
$clearPicked.addEventListener('click', () => {
  picked = new Set();
  saveStore();
  renderPicked();
  renderGroups();
  renderTitles();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
  if (ev.target.matches('input, textarea')) return;
  const group = catalog.groups.find((g) => g.id === groupId);
  const list = visibleEntries(group);
  const i = list.findIndex((e) => e.id === entryId);
  if (i < 0) return;
  const next = ev.key === 'ArrowDown' ? list[i + 1] : list[i - 1];
  if (!next) return;
  ev.preventDefault();
  selectEntry(next.id);
});

async function boot() {
  loadStore();
  renderPicked();
  const res = await fetch('/api/catalog');
  catalog = await res.json();
  if (!res.ok) {
    $detail.innerHTML = `<p class="errbox">${esc(catalog.error || '名单读不出来')}</p>`;
    return;
  }
  const first = catalog.groups.find((g) => g.entries?.length);
  renderGroups();
  if (first) selectGroup(first.id);
}

boot();
