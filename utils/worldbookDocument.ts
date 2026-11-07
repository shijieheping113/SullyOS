import type { Worldbook } from '../types';

/**
 * 世界书「整篇文档导入」：把一个 Word / TXT / PDF / RTF / 网页文件整篇读成**一条**世界书。
 *
 * 和 `parseStandardWorldbook`（酒馆 JSON/PNG，一个文件 = 一整个分组）是两条互不干扰的路：
 * 那几个入口的逻辑一行不动，这里只负责「作者把设定写成一篇文」这种最常见的情况。
 *
 * 三条设计决定，对应三个踩过的坑：
 *
 * 1) **认文件头，不认扩展名。** 作者存成什么名字都不该由我们来要求：
 *    .doc 其实是 docx（zip）、.doc 其实是 RTF、.doc 其实是网页另存，全都要能读；
 *    真的是 1990 年代 OLE2 二进制的 .doc 则明确报错，不硬啃出一堆乱码塞进提示词。
 *
 * 2) **`sourceUid` 留空。** `formatWorldbookSection`（utils/worldbook.ts:245）只在
 *    `sourceUid === undefined` 时才会写 `#### [分组]` 和 `**Title: 标题**`。
 *    留空 = 让 AI 看得见这段出自哪篇文；填了就只剩光秃秃一段正文，几篇设定糊在一起分不清。
 *
 * 3) **不截断。** 截断等于悄悄丢掉作者的书。长文会占上下文，但那是用户在编辑页自己
 *    改成关键词触发就能解决的事，不该由导入器替他默默切掉。
 */

export type WorldbookDocumentKind = 'docx' | 'pdf' | 'rtf' | 'html' | 'text' | 'legacy-doc';

export interface WorldbookDocumentFailure {
    fileName: string;
    error: string;
}

export interface WorldbookDocumentResult {
    books: Worldbook[];
    failures: WorldbookDocumentFailure[];
}

export interface WorldbookDocumentOptions {
    /** 分组名，默认走「未分类设定 (General)」。 */
    category?: string;
    now?: number;
    onProgress?: (label: string) => void;
}

export const DEFAULT_DOCUMENT_CATEGORY = '未分类设定 (General)';

/** 走「整篇文档」这条路的扩展名（.json 留给标准世界书那条路，不在这里）。 */
export const WORLDBOOK_DOCUMENT_EXTENSIONS = [
    'doc', 'docx', 'txt', 'md', 'markdown', 'rtf', 'pdf',
    'html', 'htm', 'csv', 'tsv', 'xml', 'yaml', 'yml',
] as const;

/** 导入按钮的 accept：标准世界书 + 整篇文档一次给全。 */
export const WORLDBOOK_IMPORT_ACCEPT = [
    '.json', '.png',
    ...WORLDBOOK_DOCUMENT_EXTENSIONS.map(ext => `.${ext}`),
    'application/json', 'image/png',
    'text/plain', 'text/markdown', 'text/csv', 'text/html',
    'application/pdf', 'application/rtf', 'text/rtf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

const DOCUMENT_EXTENSION_RE = new RegExp(
    `\\.(${WORLDBOOK_DOCUMENT_EXTENSIONS.join('|')})$`,
    'i',
);

/** 这个文件该不该走「整篇文档」导入（.json / .png 仍然走标准世界书那条路）。 */
export const isWorldbookDocumentFile = (file: { name?: string; type?: string }): boolean => {
    const name = file.name || '';
    if (/\.(json|png)$/i.test(name)) return false;
    if (DOCUMENT_EXTENSION_RE.test(name)) return true;
    const mime = (file.type || '').toLowerCase();
    if (mime === 'application/pdf' || mime === 'application/msword' || mime === 'application/rtf') return true;
    return mime.startsWith('text/');
};

const LEGACY_DOC_ERROR =
    '这是老式 Word 二进制格式（.doc），浏览器里解不开。请用 Word / WPS 打开后「另存为 .docx」再导入；'
    + '或者直接复制正文粘贴到新建条目里。';

const bytesMatch = (bytes: Uint8Array, expected: number[], offset = 0): boolean => (
    expected.every((value, index) => bytes[offset + index] === value)
);

const headToAscii = (bytes: Uint8Array): string => {
    let text = '';
    for (let index = 0; index < bytes.length; index += 1) text += String.fromCharCode(bytes[index]);
    return text;
};

/**
 * 按文件头判断真实格式。扩展名只作为最后的兜底线索。
 */
export const sniffDocumentKind = (
    head: Uint8Array,
    fileName = '',
    mime = '',
): WorldbookDocumentKind => {
    // zip（docx 就是 zip；.docx 被改名成 .doc 也照样认出来）
    if (bytesMatch(head, [0x50, 0x4b, 0x03, 0x04]) || bytesMatch(head, [0x50, 0x4b, 0x05, 0x06])) {
        return 'docx';
    }
    if (bytesMatch(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf';   // %PDF
    if (bytesMatch(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'legacy-doc';

    const ascii = headToAscii(head).replace(/^\uFEFF/, '');
    const trimmed = ascii.trimStart();
    if (/^\{\\rtf/i.test(trimmed)) return 'rtf';
    if (/^<(!doctype|html|\?xml|meta|head|body)/i.test(trimmed)) return 'html';

    const lowerMime = mime.toLowerCase();
    if (lowerMime === 'application/pdf' || /\.pdf$/i.test(fileName)) return 'pdf';
    if (lowerMime === 'application/rtf' || lowerMime === 'text/rtf' || /\.rtf$/i.test(fileName)) return 'rtf';
    if (/\.(html?|xml)$/i.test(fileName)) return 'html';
    if (/\.doc$/i.test(fileName)) {
        // 扩展名说是 .doc，但文件头既不是 zip 也不是 RTF/HTML 文本 → 老二进制格式。
        if (!/[\x20-\x7e\u4e00-\u9fff]/.test(trimmed.slice(0, 32))) return 'legacy-doc';
    }
    return 'text';
};

/**
 * 文本解码。老记事本存的中文 txt 常常是 GBK，浏览器默认按 UTF-8 读会整篇变问号。
 * 顺序：BOM → 严格 UTF-8 → GB18030（GBK 的超集）→ Big5 → 宽松 UTF-8。
 */
export const decodeDocumentText = (bytes: Uint8Array): string => {
    if (bytes.length === 0) return '';
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes).replace(/^\uFEFF/, '');
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes).replace(/^\uFEFF/, '');
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    } catch {
        // 不是合法 UTF-8，继续往下试中文编码
    }
    for (const encoding of ['gb18030', 'gbk', 'big5']) {
        try {
            return new TextDecoder(encoding).decode(bytes);
        } catch {
            // 运行时不支持这个标签，换下一个
        }
    }
    return new TextDecoder('utf-8').decode(bytes);
};

const HTML_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–',
};

const decodeHtmlEntities = (value: string): string => value.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (match, name: string) => {
        const key = name.toLowerCase();
        try {
            if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
            if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
        } catch {
            return match;
        }
        return HTML_ENTITIES[key] ?? match;
    },
);

/**
 * 把 HTML（含 Word/WPS「另存为网页」出来的 .doc）剥成纯文本。
 * 不走 DOMParser：这个模块要在 Node 测试里也能跑，而且剥标签的规则越简单越不会出错。
 */
export const htmlToPlainText = (html: string): string => {
    let text = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|head|noscript|xml)[\s\S]*?<\/\1\s*>/gi, '');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|li|tr|h[1-6]|table|blockquote|pre)\s*>/gi, '\n');
    text = text.replace(/<\/(td|th)\s*>/gi, '\t');
    text = text.replace(/<[^>]+>/g, '');
    text = decodeHtmlEntities(text);
    return text
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t\u00a0]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/** RTF 里这些目标组只是格式定义，不是正文，整组跳过。 */
const RTF_SKIP_DESTINATIONS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'objdata', 'header', 'footer',
    'footnote', 'annotation', 'fldinst', 'listtable', 'listoverridetable', 'rsidtbl', 'generator',
    'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'filetbl', 'revtbl',
    'pn', 'shppict', 'nonshppict', 'mmathPr', 'pgptbl', 'wgrffmtfilter',
]);

/**
 * 极简 RTF → 纯文本。够用于 Word / WPS 另存的 RTF 设定稿：
 * 认 \par / \line / \tab、\'hh 十六进制字节（按 \ansicpg 解）、\uN Unicode，
 * 跳过字体表、颜色表、图片等目标组。
 */
export const rtfToPlainText = (source: string): string => {
    const codepageMatch = source.match(/\\ansicpg(\d+)/);
    const codepage = codepageMatch
        ? ({ 936: 'gb18030', 950: 'big5', 65001: 'utf-8', 1252: 'windows-1252' }[Number(codepageMatch[1])] || 'gb18030')
        : 'gb18030';
    let decoder: TextDecoder | null = null;
    try {
        decoder = new TextDecoder(codepage);
    } catch {
        decoder = null;
    }

    let output = '';
    let pendingBytes: number[] = [];
    const flushBytes = () => {
        if (pendingBytes.length === 0) return;
        const bytes = Uint8Array.from(pendingBytes);
        pendingBytes = [];
        try {
            output += decoder ? decoder.decode(bytes) : decodeDocumentText(bytes);
        } catch {
            output += decodeDocumentText(bytes);
        }
    };

    let index = 0;
    let depth = 0;
    const skipDepths: number[] = [];
    const isSkipping = () => skipDepths.length > 0;

    while (index < source.length) {
        const char = source[index];
        if (char === '{') {
            depth += 1;
            index += 1;
            // {\* ...} 是「可忽略目标组」
            if (source[index] === '\\' && source[index + 1] === '*') {
                skipDepths.push(depth);
                index += 2;
            }
            continue;
        }
        if (char === '}') {
            if (skipDepths.length > 0 && skipDepths[skipDepths.length - 1] === depth) {
                skipDepths.pop();
            }
            depth -= 1;
            index += 1;
            continue;
        }
        if (char === '\\') {
            const next = source[index + 1];
            if (next === "'" ) {
                const hex = source.slice(index + 2, index + 4);
                const value = parseInt(hex, 16);
                if (Number.isFinite(value)) {
                    if (isSkipping()) {
                        // 跳过组里的字节直接丢弃
                    } else {
                        pendingBytes.push(value);
                    }
                }
                index += 4;
                continue;
            }
            if (next === '\\' || next === '{' || next === '}') {
                flushBytes();
                if (!isSkipping()) output += next;
                index += 2;
                continue;
            }
            if (next === '~') {
                flushBytes();
                if (!isSkipping()) output += ' ';
                index += 2;
                continue;
            }
            if (next === '*') {
                index += 2;
                continue;
            }
            // 控制字：字母序列 + 可选符号/数字 + 可选一个空格
            const wordMatch = /^([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(index + 1));
            if (!wordMatch) {
                index += 1;
                continue;
            }
            const word = wordMatch[1];
            const param = wordMatch[2];
            index += 1 + wordMatch[0].length;

            if (RTF_SKIP_DESTINATIONS.has(word) && !isSkipping()) {
                // 目标组的内容在花括号里，直接标记整组跳过
                skipDepths.push(depth);
                continue;
            }
            if (isSkipping()) continue;

            if (word === 'par' || word === 'line' || word === 'row') {
                flushBytes();
                output += '\n';
            } else if (word === 'tab' || word === 'cell') {
                flushBytes();
                output += '\t';
            } else if (word === 'u') {
                flushBytes();
                const code = Number(param);
                if (Number.isFinite(code)) output += String.fromCharCode(code < 0 ? code + 65536 : code);
                // \uN 后面通常跟一个替代字符，吃掉它免得重复
                if (source[index] === '?') index += 1;
            }
            // 其余控制字（加粗、字号、对齐等）对正文无意义，丢掉
            continue;
        }
        if (char === '\r') {
            index += 1;
            continue;
        }
        if (char === '\n') {
            // RTF 源码里的裸换行不产生内容
            index += 1;
            continue;
        }
        flushBytes();
        if (!isSkipping()) output += char;
        index += 1;
    }
    flushBytes();

    return output
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const readWholeFile = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

const stripExtension = (fileName: string): string => fileName.replace(/\.[^.]+$/, '').trim();

/**
 * 从一篇文档的正文造一条世界书。参数照抄「新建」表单的默认值
 * （apps/WorldbookApp.tsx:101-110）：常驻、角色设定后、深度 4、System、order 100、扫描 4。
 */
export const buildWorldbookFromDocument = (params: {
    fileName: string;
    text: string;
    category?: string;
    now?: number;
    idSuffix?: string | number;
}): Worldbook => {
    const now = params.now ?? Date.now();
    const title = stripExtension(params.fileName) || '导入的文档';
    const suffix = params.idSuffix ?? Math.random().toString(36).slice(2, 8);
    return {
        id: `wb-doc-${now}-${suffix}`,
        title,
        content: params.text.trim(),
        category: params.category?.trim() || DEFAULT_DOCUMENT_CATEGORY,
        createdAt: now,
        updatedAt: now,
        key: [],
        keysecondary: [],
        constant: true,
        selective: false,
        selectiveLogic: 0,
        order: 100,
        position: 1,
        disable: false,
        probability: 100,
        useProbability: false,
        depth: 4,
        role: 0,
        scanDepth: 4,
        caseSensitive: false,
        matchWholeWords: false,
        // 故意不写 sourceUid：留空才会在提示词里带上标题行，见文件顶部说明。
    };
};

/** 按嗅探结果提取正文。.docx / PDF 用项目里已有的解析器（动态载入，不拖累首屏）。 */
const extractDocumentText = async (
    file: File,
    kind: WorldbookDocumentKind,
): Promise<string> => {
    if (kind === 'legacy-doc') throw new Error(LEGACY_DOC_ERROR);
    if (kind === 'docx') {
        const { extractDocxText } = await import('./docxText');
        const text = await extractDocxText(file);
        if (!text.trim()) throw new Error('这个 Word 文件里没有可提取的正文');
        return text;
    }
    if (kind === 'pdf') {
        const { extractPdfText } = await import('./pdfText');
        const result = await extractPdfText(await file.arrayBuffer());
        if (!result.text.trim()) {
            throw new Error('这个 PDF 没有可提取的文字；扫描版 PDF 需要先做 OCR，或直接复制正文粘贴进来');
        }
        return result.text;
    }
    const bytes = await readWholeFile(file);
    const decoded = decodeDocumentText(bytes);
    if (kind === 'rtf') {
        const text = rtfToPlainText(decoded);
        if (!text.trim()) throw new Error('这个 RTF 文件里没有可提取的正文');
        return text;
    }
    if (kind === 'html') {
        const text = htmlToPlainText(decoded);
        if (!text.trim()) throw new Error('这个网页文件里没有可提取的正文');
        return text;
    }
    return decoded;
};

/**
 * 批量导入：一个文件一条世界书，单个失败不影响其它，最后一起返回失败清单。
 *
 * 调用方负责在写库前先做 `readShareFile`（PNG 分享壳）解包；这里只处理已经解开的文件。
 */
export const importWorldbookDocuments = async (
    files: File[],
    options: WorldbookDocumentOptions = {},
): Promise<WorldbookDocumentResult> => {
    const now = options.now ?? Date.now();
    const books: Worldbook[] = [];
    const failures: WorldbookDocumentFailure[] = [];

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        options.onProgress?.(files.length > 1 ? `正在读取 ${index + 1}/${files.length}：${file.name}` : `正在读取 ${file.name}`);
        try {
            const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
            const kind = sniffDocumentKind(head, file.name, file.type);
            const text = await extractDocumentText(file, kind);
            const trimmed = text.trim();
            if (!trimmed) throw new Error('文件是空的，没有可导入的正文');
            books.push(buildWorldbookFromDocument({
                fileName: file.name,
                text: trimmed,
                category: options.category,
                now,
                idSuffix: `${index}-${Math.random().toString(36).slice(2, 8)}`,
            }));
        } catch (error: any) {
            failures.push({
                fileName: file.name,
                error: error?.message || '读取失败',
            });
        }
    }

    return { books, failures };
};
